import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import qr from "qr-image";
import appointmentModel from "../models/appointmentModel.js";

const generateReceipt = async (appointmentId) => {
    const appointment = await appointmentModel.findById(appointmentId);
    if (!appointment) throw new Error("Appointment not found");

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const filePath = path.resolve("receipts", `${appointmentId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // === Header Background ===
    doc.rect(0, 0, doc.page.width, 90).fill("#808080");

    // === Logo ===
    const logoPath = path.resolve("public", "LogoNitthealth.png"); // Replace with your logo
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 20, { width: 50, height: 50 });
    }

    // === Title ===
    doc
        .fillColor("white")
        .fontSize(24)
        .font("Helvetica-Bold")

    doc
        .fontSize(12)
        .text("Appointment Receipt", { align: "right", lineGap: 2 });

    // === PAID Badge ===
    doc
        .fillColor("green")
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("✅ PAID", doc.page.width - 200, 60);

    doc.moveDown(3);

    // === QR Code ===
    const qrBuffer = qr.imageSync(appointmentId, { type: "png" });
    doc.image(qrBuffer, doc.page.width - 100, 130, { width: 80 });

    // === Receipt Details Box ===
    const startX = 50;
    const boxWidth = doc.page.width - 100;
    doc.roundedRect(startX, doc.y, boxWidth, 240, 8).stroke("#E5E7EB");

    const boxY = doc.y + 15;
    const labelColor = "#6B7280";
    const valueColor = "#111827";

    const writeLabel = (label, value, y) => {
        doc.fillColor(labelColor).font("Helvetica").fontSize(11).text(label, startX + 20, y);
        doc.fillColor(valueColor).font("Helvetica-Bold").fontSize(12).text(value, startX + 200, y);
    };

    writeLabel("Appointment ID:", appointmentId, boxY);
    writeLabel("Patient Name:", appointment.userData.name, boxY + 25);
    writeLabel("Doctor Name:", appointment.docData.name, boxY + 50);
    writeLabel("Appointment Date:", new Date(appointment.date).toDateString(), boxY + 75);
    writeLabel("Slot:", `${appointment.slotDate}, ${appointment.slotTime}`, boxY + 100);

    // Highlighted Amount Box
    doc
        .roundedRect(startX + 20, boxY + 130, boxWidth - 40, 40, 5)
        .fill("#D1FAE5");
    doc
        .fillColor("#065F46")
        .fontSize(14)
        .font("Helvetica-Bold")
        .text(`Amount Paid: ₹${appointment.amount}`, startX + 30, boxY + 140);

    // Payment Mode
    doc
        .fillColor(labelColor)
        .fontSize(11)
        .font("Helvetica")
        .text("Payment Mode:", startX + 20, boxY + 190);
    doc
        .fillColor(valueColor)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Razorpay / Stripe", startX + 200, boxY + 190);

    doc.moveDown(10);

    // === Footer Line ===
    doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor("#D1D5DB")
        .lineWidth(1)
        .stroke();

    doc
        .fillColor("#6B7280")
        .fontSize(10)
        .text("Thank you for booking with HealthCare+. For any queries, contact support@healthcare.com", 50, doc.y + 10, {
            align: "center",
        });

    doc.end();
    return filePath;
};

export default generateReceipt;

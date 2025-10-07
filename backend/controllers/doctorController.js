import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import { sendEmail } from "../utils/sendEmail.js";

// API for doctor Login
const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await doctorModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get doctor appointments for doctor panel
const appointmentsDoctor = async (req, res) => {
  try {
    const { docId } = req.body;
    const appointments = await appointmentModel.find({ docId });

    res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to cancel appointment for doctor panel
const appointmentCancel = async (req, res) => {
  try {
    const { docId, appointmentId } = req.body;

    const appointmentData = await appointmentModel.findById(appointmentId);
    if (appointmentData && appointmentData.docId === docId) {
      const succ = await appointmentModel.findByIdAndUpdate(appointmentId, {
        cancelled: true,
      });
      const cancel = true;
      if (succ) {
        appointmentMail(appointmentData, cancel);
      }
      return res.json({ success: true, message: "Appointment Cancelled and Email sent" });
    }

    res.json({ success: false, message: "Appointment Cancelled and Email sent." });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to mark appointment completed for doctor panel
const appointmentComplete = async (req, res) => {
  try {
    const { docId, appointmentId } = req.body;

    const appointmentData = await appointmentModel.findById(appointmentId);
    if (appointmentData && appointmentData.docId === docId) {
      const succ = await appointmentModel.findByIdAndUpdate(appointmentId, {
        isCompleted: true,
      });
      const cancel = false;
      if (succ) {
        appointmentMail(appointmentData, cancel);
      }
      return res.json({ success: true, message: "Appointment Approved and Email sent." });
    }

    res.json({ success: false, message: "Appointment Cancelled and Email sent." });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const appointmentMail = (appointmentData, cancel) => {
  const docName = appointmentData.docData.name;
  const patName = appointmentData.userData.name;
  const appointment_date = appointmentData.slotDate;
  const appointment_time = appointmentData.slotTime;
  const specialization = appointmentData.docData.speciality;
  const email = appointmentData.userData.email;
  const doc_email=appointmentData.docData.email;
  if (cancel) {
    const subject = `Appointment Request with Dr. ${docName} was Declined`;
    const message = `Dear ${patName},

We regret to inform you that Dr. ${docName} has declined your appointment request for the following schedule:

📅 Date: ${appointment_date}  
⏰ Time: ${appointment_time}  
🏥 Department: ${specialization}  
Doctor Email:${doc_email}

This may be due to unavailability or a scheduling conflict. You can try booking with another doctor or choose a different time slot.

We apologize for the inconvenience.

Best regards,  
NittHealth Team
`;
    console.log("SENDING EMAIL TO Patient");
    sendEmail({ email, subject, message });
    console.log("SUCCESSFULLY EMAIL SEND TO Patient.");
    console.log(email);
  } else {
    const subject = `Your Appointment with Dr. ${docName} is Confirmed`;
    const message = `Dear ${patName},

Good news! Your appointment request with Dr. ${docName} has been accepted and is now confirmed.

📅 Date: ${appointment_date}  
⏰ Time: ${appointment_time}  
🏥 Department: ${specialization}  
Doctor Email:${doc_email}


Please ensure you are available at the scheduled time. If you have any questions, feel free to reach out.

Wishing you good health,  
NittHealth Team`;
    console.log("SENDING EMAIL TO Patient");
    sendEmail({ email, subject, message });
    console.log("SUCCESSFULLY EMAIL SEND TO Patient.");
  }
};

// API to get all doctors list for Frontend
const doctorList = async (req, res) => {
  try {
    const doctors = await doctorModel.find({}).select(["-password", "-email"]);
    res.json({ success: true, doctors });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to change doctor availablity for Admin and Doctor Panel
const changeAvailablity = async (req, res) => {
  try {
    const { docId } = req.body;

    const docData = await doctorModel.findById(docId);
    await doctorModel.findByIdAndUpdate(docId, {
      available: !docData.available,
    });
    res.json({ success: true, message: "Availablity Changed" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get doctor profile for  Doctor Panel
const doctorProfile = async (req, res) => {
  try {
    const { docId } = req.body;
    const profileData = await doctorModel.findById(docId).select("-password");

    res.json({ success: true, profileData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update doctor profile data from  Doctor Panel
const updateDoctorProfile = async (req, res) => {
  try {
    const { docId, fees, address, available } = req.body;

    await doctorModel.findByIdAndUpdate(docId, { fees, address, available });

    res.json({ success: true, message: "Profile Updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get dashboard data for doctor panel
const doctorDashboard = async (req, res) => {
  try {
    const { docId } = req.body;

    const appointments = await appointmentModel.find({ docId });

    let earnings = 0;

    appointments.map((item) => {
      if (item.isCompleted || item.payment) {
        earnings += item.amount;
      }
    });

    let patients = [];

    appointments.map((item) => {
      if (!patients.includes(item.userId)) {
        patients.push(item.userId);
      }
    });

    const dashData = {
      earnings,
      appointments: appointments.length,
      patients: patients.length,
      latestAppointments: appointments.reverse(),
    };

    res.json({ success: true, dashData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

export {
  loginDoctor,
  appointmentsDoctor,
  appointmentCancel,
  doctorList,
  changeAvailablity,
  appointmentComplete,
  doctorDashboard,
  doctorProfile,
  updateDoctorProfile,
  appointmentMail,
};

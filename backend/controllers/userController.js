import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import validator from "validator";
import userModel from "../models/userModel.js";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import { v2 as cloudinary } from "cloudinary";
import stripe from "stripe";
import razorpay from "razorpay";
import qs from "qs";
import axios from "axios";
import generateReceipt from "../utils/generateReceipt.js";
import path from "path";
import fs from "fs";

// Gateway Initialize
const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// API to login user
const loginUser = async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).json({ error: "Authorization code missing!" });
  }

  const data = qs.stringify({
    client_id: process.env.DAUTH_CLIENT_ID,
    client_secret: process.env.DAUTH_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: process.env.REDIRECT_URI,
  });

  try {
    // Step 1: Get Access Token
    const tokenResponse = await axios.post(
      "https://auth.delta.nitt.edu/api/oauth/token",
      data,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token } = tokenResponse.data;

    // Step 2: Fetch User Details from DAuth API
    const userResponse = await axios.post(
      "https://auth.delta.nitt.edu/api/resources/user",
      {},
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const userData = userResponse.data;

    // Step 3: Check if user exists in DB
    let user = await userModel.findOne({ email: userData.email });

    if (!user) {
      // Step 4: Save New User in DB
      user = new userModel({
        name: userData.name,
        email: userData.email,
        phone: userData.phoneNumber,
      });
      await user.save();
    } else {
    }

    // Step 5: Generate JWT Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    // Step 6: Redirect or Send JSON Response (Choose ONE)
    return res.redirect(`${process.env.FRONTEND_URL}/login?token=${token}`);
  } catch (error) {
    console.error("Error in login:", error.response?.data || error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// API to get user profile data
const getProfile = async (req, res) => {
  try {
    const { userId } = req.body;
    const userData = await userModel.findById(userId).select("-password");
    res.json({ success: true, userData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update user profile
const updateProfile = async (req, res) => {
  try {
    const { userId, name, phone, address, dob, gender } = req.body;
    const imageFile = req.file;

    if (!name || !phone || !dob || !gender) {
      return res.json({ success: false, message: "Data Missing" });
    }

    await userModel.findByIdAndUpdate(userId, {
      name,
      phone,
      address: JSON.parse(address),
      dob,
      gender,
    });

    if (imageFile) {
      // upload image to cloudinary
      const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
        resource_type: "image",
      });
      const imageURL = imageUpload.secure_url;

      await userModel.findByIdAndUpdate(userId, { image: imageURL });
    }

    res.json({ success: true, message: "Profile Updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to book appointment
const bookAppointment = async (req, res) => {
  console.time("parallel");
  try {
    const { userId, docId, slotDate, slotTime } = req.body;
    // const docData = await doctorModel.findById(docId).select("-password")
    // const userData = await userModel.findById(userId).select("-password")
    const docDataPromise = doctorModel.findById(docId).select("-password");
    const userDataPromise = userModel.findById(userId).select("-password");
    const [docData, userData] = await Promise.all([
      docDataPromise,
      userDataPromise,
    ]);
    // const availableDoctorsPromise = Doctor.find({ available: true });
    // const pastAppointmentsPromise = Appointment.find({ patientId: userId });
    // const userProfilePromise = User.findById(userId);

    if (!docData.available) {
      return res.json({ success: false, message: "Doctor Not Available" });
    }

    let slots_booked = docData.slots_booked;

    // checking for slot availablity
    if (slots_booked[slotDate]) {
      if (slots_booked[slotDate].includes(slotTime)) {
        return res.json({ success: false, message: "Slot Not Available" });
      } else {
        slots_booked[slotDate].push(slotTime);
      }
    } else {
      slots_booked[slotDate] = [];
      slots_booked[slotDate].push(slotTime);
    }

    // const userData = await userModel.findById(userId).select("-password")

    delete docData.slots_booked;

    const appointmentData = {
      userId,
      docId,
      userData,
      docData,
      amount: docData.fees,
      slotTime,
      slotDate,
      date: Date.now(),
    };

    const newAppointment = new appointmentModel(appointmentData);
    await newAppointment.save();

    // save new slots data in docData
    await doctorModel.findByIdAndUpdate(docId, { slots_booked });

    res.json({ success: true, message: "Appointment Booked" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
  console.timeEnd("parallel");
};

// API to cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const { userId, appointmentId } = req.body;
    const appointmentData = await appointmentModel.findById(appointmentId);

    // verify appointment user
    if (appointmentData.userId !== userId) {
      return res.json({ success: false, message: "Unauthorized action" });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });

    // releasing doctor slot
    const { docId, slotDate, slotTime } = appointmentData;

    const doctorData = await doctorModel.findById(docId);

    let slots_booked = doctorData.slots_booked;

    slots_booked[slotDate] = slots_booked[slotDate].filter(
      (e) => e !== slotTime
    );

    await doctorModel.findByIdAndUpdate(docId, { slots_booked });

    res.json({ success: true, message: "Appointment Cancelled" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user appointments for frontend my-appointments page
const listAppointment = async (req, res) => {
  try {
    const { userId } = req.body;
    const appointments = await appointmentModel.find({ userId });

    res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to make payment of appointment using razorpay
const paymentRazorpay = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const appointmentData = await appointmentModel.findById(appointmentId);

    if (!appointmentData || appointmentData.cancelled) {
      return res.json({
        success: false,
        message: "Appointment Cancelled or not found",
      });
    }

    // creating options for razorpay payment
    const options = {
      amount: appointmentData.amount * 100,
      currency: process.env.CURRENCY,
      receipt: appointmentId,
    };

    // creation of an order
    const order = await razorpayInstance.orders.create(options);

    res.json({ success: true, order });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to verify payment of razorpay
const verifyRazorpay = async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);

    if (orderInfo.status === "paid") {
      const appointmentId = orderInfo.receipt;

      await appointmentModel.findByIdAndUpdate(orderInfo.receipt, {
        payment: true,
      });
      await generateReceipt(appointmentId);
      res.json({ success: true, message: "Payment Successful" });
    } else {
      res.json({ success: false, message: "Payment Failed" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to make payment of appointment using Stripe
const paymentStripe = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const { origin } = req.headers;

    const appointmentData = await appointmentModel.findById(appointmentId);

    if (!appointmentData || appointmentData.cancelled) {
      return res.json({
        success: false,
        message: "Appointment Cancelled or not found",
      });
    }

    const currency = process.env.CURRENCY.toLocaleLowerCase();

    const line_items = [
      {
        price_data: {
          currency,
          product_data: {
            name: "Appointment Fees",
          },
          unit_amount: appointmentData.amount * 100,
        },
        quantity: 1,
      },
    ];

    const session = await stripeInstance.checkout.sessions.create({
      success_url: `${origin}/verify?success=true&appointmentId=${appointmentData._id}`,
      cancel_url: `${origin}/verify?success=false&appointmentId=${appointmentData._id}`,
      line_items: line_items,
      mode: "payment",
    });

    res.json({ success: true, session_url: session.url });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const verifyStripe = async (req, res) => {
  try {
    const { appointmentId, success } = req.body;

    if (success === "true") {
      await appointmentModel.findByIdAndUpdate(appointmentId, {
        payment: true,
      });
      return res.json({ success: true, message: "Payment Successful" });
    }

    res.json({ success: false, message: "Payment Failed" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const downloadReceipt = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const filePath = path.join(
      process.cwd(),
      "receipts",
      `${appointmentId}.pdf`
    );

    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ success: false, message: "Receipt not found" });
    }

    // Send file as download
    return res.download(filePath);
  } catch (error) {
    console.error("Error downloading receipt:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export {
  loginUser,
  getProfile,
  updateProfile,
  bookAppointment,
  listAppointment,
  cancelAppointment,
  paymentRazorpay,
  verifyRazorpay,
  paymentStripe,
  verifyStripe,
  downloadReceipt,
};

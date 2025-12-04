require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const twilio = require("twilio");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();

// CORS middleware - must be before any routes
// FIXED: Changed origin to match actual frontend URL with typo
app.use(
  cors({
    origin: "https://intership-allotment.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Setup upload directory
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ✅ Serve uploads as static for direct file access
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`;
    cb(null, unique);
  },
});
const upload = multer({ storage });

// ====== MongoDB (Mongoose) Connection & Schemas ======
// FIX #1: Changed MONGODB_URI to MONGO_URL (matches Railway env var)
// Railway MongoDB connection string format: mongodb://mongo:PASSWORD@mongodb.railway.internal:27017
// If no database name is provided, default to 'railway' or 'sia'
let mongoUri = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/sia";

// Ensure database name is included in connection string
if (mongoUri && !mongoUri.includes('/railway') && !mongoUri.includes('/sia') && !mongoUri.match(/\/[^\/]+$/)) {
  // Add default database name if not present
  mongoUri = mongoUri.endsWith('/') ? mongoUri + 'railway' : mongoUri + '/railway';
}

// MongoDB connection options for better reliability
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  w: 'majority'
};

mongoose
  .connect(mongoUri, mongooseOptions)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    console.log("📍 MongoDB URI:", mongoUri.replace(/\/\/.*@/, "//***:***@"));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("🔍 Full error:", err);
  });

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error("❌ MongoDB connection error:", err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn("⚠️ MongoDB disconnected. Attempting to reconnect...");
});

mongoose.connection.on('reconnected', () => {
  console.log("✅ MongoDB reconnected");
});

const { Schema, model } = mongoose;

// ---- Student Schema ----
const studentSchema = new Schema(
  {
    studentId: { type: String, unique: true, required: true },
    fullName: String,
    dob: String,
    email: String,
    alternateEmail: String,
    contactNumber: String,
    gender: String,
    panNumber: String,
    currentAddress: String,
    permanentAddress: String,
    photoPath: String,
    govIdProofPath: String,
    guardian: {
      name: String,
      relation: String,
      email: String,
      phone: String,
      address: String,
      idProofPath: String,
    },
    academic: {
      programme: String,
      semester: String,
      discipline: String,
      cgpa: String,
      skills: String,
      resumePath: String,
    },
    passwordHash: String,
  },
  { timestamps: true }
);

// ---- Admin Schema ----
const adminSchema = new Schema(
  {
    adminId: { type: String, unique: true, required: true },
    fullName: String,
    emailAddress: String,
    adminDesignation: String,
    contactNumber: String,
    photoPath: String,
    govIdProofPath: String,
    collegeIdProofPath: String,
    passwordHash: String,
  },
  { timestamps: true }
);

// ---- Organization Schema ----
const organizationSchema = new Schema(
  {
    username: { type: String, unique: true, required: true },
    orgName: String,
    cinRegistrationNumber: String,
    country: String,
    state: String,
    detailedAddress: String,
    orgDocumentPath: String,
    coordinator: {
      name: String,
      designation: String,
      email: String,
      alternateEmail: String,
      phone: String,
    },
    passwordHash: String,
  },
  { timestamps: true }
);

// ---- Project Schema ----
const projectSchema = new Schema(
  {
    organizationId: { type: String, required: true },
    projectCode: String,
    projectName: String,
    description: String, // Added: Project description field
    internsRequired: String,
    cgpaRequirement: String,
    discipline: String,
    skills: String,
    coordinatorName: String,
    coordinatorEmail: String,
    coordinatorAltEmail: String,
    coordinatorPhone: String,
    coordinatorDesignation: String,
    guidelinesFilePath: String,
    status: { type: String, enum: ["draft", "scheduled", "active", "completed"], default: "draft" }, // Added: Status enum
    scheduledTime: String,
    startDate: Date, // Added: Project start date
    endDate: Date, // Added: Project end date
  },
  { timestamps: true }
);

// ---- Application Schema ----
// Tracks student applications to projects for counting purposes
const applicationSchema = new Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    studentId: { type: String, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

// Create index for efficient queries
applicationSchema.index({ projectId: 1 });
applicationSchema.index({ studentId: 1 });

// ---- Notification Schema ----
const notificationSchema = new Schema(
  {
    organizationId: String,
    title: String,
    message: String,
  },
  { timestamps: true }
);

// ---- Reset Token Schema ----
const resetTokenSchema = new Schema(
  {
    email: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "approved", "denied", "expired", "used"], default: "pending" },
    userType: { type: String, enum: ["student", "admin", "org"] },
  },
  { timestamps: true }
);

const Student = model("Student", studentSchema);
const Admin = model("Admin", adminSchema);
const Organization = model("Organization", organizationSchema);
const Project = model("Project", projectSchema);
const Application = model("Application", applicationSchema);
const Notification = model("Notification", notificationSchema);
const ResetToken = model("ResetToken", resetTokenSchema);

// ====== Authentication Middleware ======
/**
 * Middleware to authenticate requests using Bearer token
 * Extracts token from Authorization header and verifies organization
 * Attaches organization data to req.organization for use in routes
 * 
 * Note: In production, replace this with JWT token verification
 * For now, it accepts organizationId or username as the token
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token required. Format: Bearer <token>" });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // In a production system, you would verify JWT tokens here
    // For this implementation, we'll use the token as organizationId or username
    // You can replace this with JWT verification if you have JWT setup
    const org = await Organization.findOne({
      $or: [
        { _id: token },
        { username: token },
      ],
    });

    if (!org) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Attach organization to request object for use in routes
    req.organization = org;
    req.organizationId = org._id.toString();
    next();
  } catch (err) {
    console.error("🔥 Authentication error:", err);
    res.status(500).json({ error: "Authentication failed", details: err.message });
  }
};

// ====== Twilio Setup ======
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const serviceSid = process.env.TWILIO_SERVICE_ID;

// ===== SMTP Setup =====
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// =======================================================
// =================== STUDENT SECTION ===================
// =======================================================

app.get("/api/student/profile", async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: "Student ID required" });

    const student = await Student.findOne({ studentId }).lean();
    if (!student) return res.status(404).json({ error: "Student not found." });

    const baseUrl = process.env.BACKEND_URL || "http://localhost:5050";
    const academic = student.academic || {};

    res.json({
      studentId: student.studentId,
      fullName: student.fullName || "",
      dob: student.dob || "",
      email: student.email || "",
      alternateEmail: student.alternateEmail || "",
      contact: student.contactNumber || "",
      currentAddress: student.currentAddress || "",
      permanentAddress: student.permanentAddress || "",
      programme: academic.programme || "",
      semester: academic.semester || "",
      discipline: academic.discipline || "",
      cgpa: academic.cgpa || "",
      skills: academic.skills || "",
      photo: `${baseUrl}/api/student/file/photo/${studentId}`,
      resume: `${baseUrl}/api/student/file/resume/${studentId}`,
    });
  } catch (err) {
    console.error("🔥 Profile fetch error:", err);
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

app.post(
  "/api/student/update-profile",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "resume", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const rawId = req.body.studentId;
      const studentId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!studentId) return res.status(400).json({ error: "Student ID required." });

      const student = await Student.findOne({ studentId });
      if (!student) return res.status(404).json({ error: "Student not found." });

      const {
        fullName,
        dob,
        email,
        alternateEmail,
        contact,
        currentAddress,
        permanentAddress,
        programme,
        semester,
        discipline,
        cgpa,
        skills,
      } = req.body;

      if (fullName !== undefined) student.fullName = fullName;
      if (dob !== undefined) student.dob = dob;
      if (email !== undefined) student.email = email;
      if (alternateEmail !== undefined) student.alternateEmail = alternateEmail;
      if (contact !== undefined) student.contactNumber = contact;
      if (currentAddress !== undefined) student.currentAddress = currentAddress;
      if (permanentAddress !== undefined) student.permanentAddress = permanentAddress;

      if (!student.academic) student.academic = {};
      if (programme !== undefined) student.academic.programme = programme;
      if (semester !== undefined) student.academic.semester = semester;
      if (discipline !== undefined) student.academic.discipline = discipline;
      if (cgpa !== undefined) student.academic.cgpa = cgpa;
      if (skills !== undefined) student.academic.skills = skills;

      if (req.files?.photo?.[0]) {
        student.photoPath = req.files.photo[0].path;
      }
      if (req.files?.resume?.[0]) {
        if (!student.academic) student.academic = {};
        student.academic.resumePath = req.files.resume[0].path;
      }

      await student.save();
      res.json({ message: "✅ Profile updated successfully" });
    } catch (err) {
      console.error("🔥 Update profile error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

app.get("/api/student/file/:type/:studentId", async (req, res) => {
  try {
    const { type, studentId } = req.params;
    if (!["photo", "resume"].includes(type))
      return res.status(400).json({ error: "Invalid file type." });

    const student = await Student.findOne({ studentId }).lean();
    if (!student) return res.status(404).json({ error: "Student not found." });

    let filePath;
    if (type === "photo") {
      filePath = student.photoPath;
    } else {
      filePath = student.academic?.resumePath;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found." });
    }

    res.setHeader(
      "Content-Type",
      type === "photo" ? "image/jpeg" : "application/pdf"
    );
    res.setHeader("Content-Disposition", "inline");

    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => {
      console.error("🔥 File stream error:", err);
      res.status(500).json({ error: "Unable to read file" });
    });
    stream.pipe(res);
  } catch (err) {
    console.error("🔥 File serve error:", err);
    res.status(500).json({ error: "Unable to serve file." });
  }
});

// === UNIVERSAL FORGOT PASSWORD (MongoDB) ===
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required." });

    console.log("📨 Forgot password requested for:", email);

    const student = await Student.findOne({
      $or: [{ email }, { alternateEmail: email }],
    }).lean();

    const admin = !student
      ? await Admin.findOne({ emailAddress: email }).lean()
      : null;

    const org = !student && !admin
      ? await Organization.findOne({
          $or: [
            { "coordinator.email": email },
            { "coordinator.alternateEmail": email },
          ],
        }).lean()
      : null;

    console.log("🔍 Lookup results:", {
      student: !!student,
      admin: !!admin,
      org: !!org,
    });

    let userType = null;
    if (student) userType = "student";
    else if (admin) userType = "admin";
    else if (org) userType = "org";
    else return res.status(404).json({ error: "Email not found." });

    await ResetToken.deleteMany({ email });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await ResetToken.create({
      email,
      token,
      expiresAt: expires,
      status: "pending",
      userType,
    });

    const baseUrl = process.env.BACKEND_URL || "http://localhost:5050";
    const yesLink = `${baseUrl}/verify-reset?token=${token}`;
    const noLink = `${baseUrl}/deny-reset?token=${token}`;

    const html = `
      <p>Dear ${userType.toUpperCase()},</p>
      <p>We received a password reset request for your ${userType} account.</p>
      <p>Please confirm whether this was you:</p>
      <a href="${yesLink}"
         style="background:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;">✅ Yes</a>
      <a href="${noLink}"
         style="background:#EF4444;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;margin-left:10px;">🚫 No</a>
      <p>This link will expire in 10 minutes.</p>
    `;

    await transporter.sendMail({
      from: `"SIA Support" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `${userType.toUpperCase()} Password Reset Verification`,
      html,
    });

    res.json({
      message: `✅ Verification email sent to ${userType} email!`,
    });
  } catch (err) {
    console.error("🔥 Forgot-password error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/verify-reset", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send("Missing token");

    const entry = await ResetToken.findOne({ token, status: "pending" });
    if (!entry) return res.status(404).send("Invalid or expired token");

    if (new Date(entry.expiresAt) < new Date()) {
      entry.status = "expired";
      await entry.save();
      return res.status(400).send("Link expired.");
    }

    entry.status = "approved";
    await entry.save();
    res.send("<h2>✅ Request confirmed. You can now reset your password.</h2>");
  } catch (err) {
    console.error("🔥 Verify reset error:", err);
    res.status(500).send("Server error");
  }
});

app.get("/deny-reset", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send("Missing token");

    await ResetToken.updateOne({ token }, { status: "denied" });

    res.send("<h2>🚫 Reset request denied successfully.</h2>");
  } catch (err) {
    console.error("🔥 Deny reset error:", err);
    res.status(500).send("Server error");
  }
});

app.get("/api/auth/reset-status/:email", async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "Email required." });

    const entry = await ResetToken.findOne({ email }).sort({ createdAt: -1 }).lean();
    if (!entry) return res.status(404).json({ error: "No reset request found." });

    res.json({ token: entry.token, status: entry.status });
  } catch (err) {
    console.error("🔥 Reset-status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const resetPasswordHandler = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ error: "Token and password required" });

    const entry = await ResetToken.findOne({ token });
    if (!entry) return res.status(400).json({ error: "Invalid token" });
    if (entry.status !== "approved")
      return res.status(400).json({ error: `Token not approved. Status: ${entry.status}` });
    if (new Date(entry.expiresAt) < new Date())
      return res.status(400).json({ error: "Token expired" });

    const hash = await bcrypt.hash(password, 10);

    if (entry.userType === "student") {
      const student = await Student.findOne({
        $or: [{ email: entry.email }, { alternateEmail: entry.email }],
      });
      if (student) {
        student.passwordHash = hash;
        await student.save();
      }
    } else if (entry.userType === "admin") {
      const admin = await Admin.findOne({ emailAddress: entry.email });
      if (admin) {
        admin.passwordHash = hash;
        await admin.save();
      }
    } else if (entry.userType === "org") {
      const org = await Organization.findOne({
        $or: [
          { "coordinator.email": entry.email },
          { "coordinator.alternateEmail": entry.email },
        ],
      });
      if (org) {
        org.passwordHash = hash;
        await org.save();
      }
    }

    entry.status = "used";
    await entry.save();

    res.json({ message: "✅ Password reset successful!" });
  } catch (err) {
    console.error("🔥 Reset password error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

app.post("/api/auth/reset", resetPasswordHandler);
app.post("/api/auth/reset-password", resetPasswordHandler);

// =======================================================
// ====================== ADMIN SECTION ==================
// =======================================================

app.post(
  "/api/admin/register",
  upload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "govtId", maxCount: 1 },
    { name: "collegeId", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { adminId, fullName, email, phone, designation, password } = req.body;

      if (!adminId || !fullName || !email || !phone || !designation || !password)
        return res.status(400).json({ error: "All fields are required." });

      const profilePhoto = req.files?.profilePhoto?.[0]?.path ?? null;
      const govtId = req.files?.govtId?.[0]?.path ?? null;
      const collegeId = req.files?.collegeId?.[0]?.path ?? null;
      const hashedPassword = await bcrypt.hash(password, 10);

      const existing = await Admin.findOne({ adminId }).lean();
      if (existing)
        return res.status(400).json({ error: "Admin ID already exists." });

      await Admin.create({
        adminId,
        fullName,
        emailAddress: email,
        adminDesignation: designation,
        contactNumber: phone,
        photoPath: profilePhoto,
        govIdProofPath: govtId,
        collegeIdProofPath: collegeId,
        passwordHash: hashedPassword,
      });

      res.json({ message: "✅ Admin registered successfully!" });
    } catch (err) {
      console.error("🔥 Admin Register Error:", err);
      res.status(500).json({ error: "Registration failed.", details: err.message });
    }
  }
);

app.post("/api/admin/login", async (req, res) => {
  try {
    const { admin_id, password } = req.body;
    if (!admin_id || !password)
      return res.status(400).json({ error: "Admin ID and password required." });

    const admin = await Admin.findOne({ adminId: admin_id });
    if (!admin) return res.status(401).json({ error: "Invalid login." });

    const match = await bcrypt.compare(password, admin.passwordHash || "");
    if (!match) return res.status(401).json({ error: "Invalid password." });

    res.json({
      message: "✅ Login successful",
      admin: {
        adminId: admin.adminId,
        fullName: admin.fullName,
        email: admin.emailAddress,
      },
    });
  } catch (err) {
    console.error("🔥 Admin login error:", err);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

app.post("/api/admin/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    const formatted = (!phone.startsWith("+") ? `+91${phone}` : phone);

    const admin = await Admin.findOne({ contactNumber: phone }).lean();
    if (!admin)
      return res.status(404).json({ error: "Phone not registered." });

    await twilioClient.verify
      .services(serviceSid)
      .verifications.create({ to: formatted, channel: "sms" });

    res.json({ message: "OTP sent successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const formatted = (!phone.startsWith("+") ? `+91${phone}` : phone);

    const check = await twilioClient.verify
      .services(serviceSid)
      .verificationChecks.create({ to: formatted, code: otp });

    if (check.status === "approved")
      res.json({ message: "✅ OTP verified", redirect: "/AdminPortal" });
    else res.status(400).json({ error: "Invalid OTP" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/student/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    const formatted = (!phone.startsWith("+") ? `+91${phone}` : phone);

    const cleanPhone = phone.replace(/\D/g, "");
    const normalized = formatted.replace("+", "");

    const student = await Student.findOne({
      contactNumber: { $in: [phone, cleanPhone, normalized] },
    }).lean();

    console.log("📞 Checking for:", phone, formatted, "→ Found:", !!student);

    if (!student) {
      return res.status(404).json({ error: "Phone not registered." });
    }

    await twilioClient.verify
      .services(serviceSid)
      .verifications.create({ to: formatted, channel: "sms" });

    res.json({ message: "✅ OTP sent successfully." });
  } catch (error) {
    console.error("🔥 Error sending OTP:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

app.post("/api/student/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const formatted = (!phone.startsWith("+") ? `+91${phone}` : phone);

    const check = await twilioClient.verify
      .services(serviceSid)
      .verificationChecks.create({ to: formatted, code: otp });

    if (check.status === "approved")
      res.json({ message: "✅ OTP verified", redirect: "/SP" });
    else res.status(400).json({ error: "Invalid OTP" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================================================
// ==================== STUDENT SECTION =================
// =======================================================
const uploadStudentDocs = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "govProof", maxCount: 1 },
  { name: "guardianIdProof", maxCount: 1 },
  { name: "resume", maxCount: 1 },
]);

app.post("/api/student/register", uploadStudentDocs, async (req, res) => {
  try {
    const {
      studentId,
      fullName,
      dob,
      email,
      altEmail,
      contact,
      gender,
      panNumber,
      currentAddress,
      permanentAddress,
      guardianName,
      guardianRelation,
      guardianEmail,
      guardianPhone,
      guardianAddress,
      programme,
      semester,
      discipline,
      cgpa,
      skills,
      password,
    } = req.body;

    if (!studentId || !fullName || !dob || !email || !contact || !programme || !password)
      return res.status(400).json({ error: "Missing required fields." });

    const existing = await Student.findOne({ studentId }).lean();
    if (existing)
      return res.status(400).json({ error: "Student ID already exists." });

    const hashed = await bcrypt.hash(password, 10);
    const photo = req.files?.photo?.[0]?.path || null;
    const govProof = req.files?.govProof?.[0]?.path || null;
    const guardianIdProof = req.files?.guardianIdProof?.[0]?.path || null;
    const resume = req.files?.resume?.[0]?.path || null;

    await Student.create({
      studentId,
      fullName,
      dob,
      email,
      alternateEmail: altEmail,
      contactNumber: contact,
      gender,
      panNumber,
      currentAddress,
      permanentAddress,
      photoPath: photo,
      govIdProofPath: govProof,
      guardian: {
        name: guardianName,
        relation: guardianRelation,
        email: guardianEmail,
        phone: guardianPhone,
        address: guardianAddress,
        idProofPath: guardianIdProof,
      },
      academic: {
        programme,
        semester,
        discipline,
        cgpa,
        skills,
        resumePath: resume,
      },
      passwordHash: hashed,
    });

    res.json({ message: "✅ Student registered successfully!" });
  } catch (err) {
    console.error("🔥 Student register error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/student/login", async (req, res) => {
  try {
    const { studentId, password } = req.body;
    if (!studentId || !password)
      return res.status(400).json({ error: "Student ID and password required." });

    const student = await Student.findOne({ studentId });
    if (!student)
      return res.status(401).json({ error: "Invalid credentials." });

    const valid = await bcrypt.compare(password, student.passwordHash || "");
    if (!valid)
      return res.status(401).json({ error: "Invalid credentials." });

    res.json({
      message: "✅ Login successful",
      student: {
        studentId: student.studentId,
        fullName: student.fullName,
        email: student.email,
      },
    });
  } catch (err) {
    console.error("🔥 Student login error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// =======================================================
// ================= ORGANIZATION SECTION ================
// =======================================================

app.post(
  "/api/organization/register",
  upload.single("org_document"),
  async (req, res) => {
    try {
      const {
        orgName,
        regNumber,
        country,
        state,
        address,
        coordName,
        coordDesg,
        coordEmail,
        coordAltEmail,
        coordPhone,
        password,
      } = req.body;

      if (
        !orgName ||
        !regNumber ||
        !country ||
        !state ||
        !address ||
        !coordName ||
        !coordDesg ||
        !coordEmail ||
        !coordPhone ||
        !password
      ) {
        return res.status(400).json({ error: "All fields required." });
      }

      const username = `${orgName.replace(/\s+/g, "").toLowerCase()}@sia.com`;

      const existing = await Organization.findOne({ username }).lean();
      if (existing) {
        return res
          .status(400)
          .json({ error: "Organization username already exists." });
      }

      const hashed = await bcrypt.hash(password, 10);
      const docPath = req.file ? req.file.path : null;

      const org = await Organization.create({
        username,
        orgName,
        cinRegistrationNumber: regNumber,
        country,
        state,
        detailedAddress: address,
        orgDocumentPath: docPath,
        coordinator: {
          name: coordName,
          designation: coordDesg,
          email: coordEmail,
          alternateEmail: coordAltEmail,
          phone: coordPhone,
        },
        passwordHash: hashed,
      });

      res.json({
        message: "✅ Organization registered successfully!",
        organizationId: org._id.toString(),
        username,
      });
    } catch (err) {
      console.error("🔥 Organization Register Error:", err);
      res.status(500).json({ error: "Registration failed", details: err.message });
    }
  }
);

app.post("/api/organization/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required." });

    const org = await Organization.findOne({ username });
    if (!org)
      return res.status(401).json({ error: "Invalid username or password." });

    const valid = await bcrypt.compare(password, org.passwordHash || "");
    if (!valid)
      return res.status(401).json({ error: "Invalid username or password." });

    res.json({
      message: "✅ Login successful",
      organization: {
        organizationId: org._id.toString(),
        username: org.username,
        orgName: org.orgName,
      },
    });
  } catch (err) {
    console.error("🔥 Organization Login Error:", err);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// =======================================================
// ============= ORGANIZATION PROJECTS API ==============
// =======================================================

/**
 * GET /api/organization/projects
 * Returns a list of all projects with applications count
 * Requires Bearer token authentication
 */
app.get("/api/organization/projects", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId;

    // Find all projects for this organization
    const projects = await Project.find({ organizationId })
      .sort({ createdAt: -1 })
      .lean();

    // Get applications count for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        // Count applications for this project
        const applicationsCount = await Application.countDocuments({
          projectId: project._id,
        });

        // Format dates for response
        const startDate = project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : null;
        const endDate = project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : null;

        return {
          _id: project._id.toString(),
          project_code: project.projectCode,
          project_name: project.projectName,
          status: project.status || "draft",
          scheduled_time: project.scheduledTime || null,
          description: project.description || "",
          applications: applicationsCount, // Applications count
          start_date: startDate,
          end_date: endDate,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        };
      })
    );

    res.json(projectsWithCounts);
  } catch (err) {
    console.error("🔥 GET /api/organization/projects error:", err);
    res.status(500).json({ error: "Failed to fetch projects", details: err.message });
  }
});

/**
 * POST /api/organization/projects
 * Creates a new project draft
 * Requires Bearer token authentication
 * Fields: project_code, project_name, description, status ('draft'), optionally scheduled_time
 */
app.post("/api/organization/projects", authenticateToken, upload.single("guidelines"), async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { project_code, project_name, description, status, scheduled_time, start_date, end_date } = req.body;

    // Validate required fields
    if (!project_code || !project_name) {
      return res.status(400).json({ error: "project_code and project_name are required" });
    }

    // Ensure status is 'draft' for new projects
    const projectStatus = status === "draft" ? "draft" : "draft";

    // Parse dates if provided
    let startDate = null;
    let endDate = null;
    if (start_date) {
      startDate = new Date(start_date);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "Invalid start_date format" });
      }
    }
    if (end_date) {
      endDate = new Date(end_date);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid end_date format" });
      }
    }

    // Validate date range
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: "start_date must be before end_date" });
    }

    const guidelinesFilePath = req.file ? req.file.path : null;

    // Create new project
    const project = await Project.create({
      organizationId,
      projectCode: project_code,
      projectName: project_name,
      description: description || "",
      status: projectStatus,
      scheduledTime: scheduled_time || null,
      startDate: startDate,
      endDate: endDate,
      guidelinesFilePath,
      // Include other fields if provided
      internsRequired: req.body.internsRequired || null,
      cgpaRequirement: req.body.cgpaRequirement || null,
      discipline: req.body.discipline || null,
      skills: req.body.skills || null,
      coordinatorName: req.body.coordinatorName || null,
      coordinatorEmail: req.body.coordinatorEmail || null,
      coordinatorAltEmail: req.body.coordinatorAltEmail || null,
      coordinatorPhone: req.body.coordinatorPhone || null,
      coordinatorDesignation: req.body.coordinatorDesignation || null,
    });

    // Format response
    const startDateFormatted = project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : null;
    const endDateFormatted = project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : null;

    res.status(201).json({
      _id: project._id.toString(),
      project_code: project.projectCode,
      project_name: project.projectName,
      status: project.status,
      scheduled_time: project.scheduledTime,
      description: project.description,
      start_date: startDateFormatted,
      end_date: endDateFormatted,
      applications: 0, // New project has no applications yet
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  } catch (err) {
    console.error("🔥 POST /api/organization/projects error:", err);
    if (err.code === 11000) {
      return res.status(400).json({ error: "Project code already exists" });
    }
    res.status(500).json({ error: "Failed to create project", details: err.message });
  }
});

/**
 * PUT /api/organization/projects/:id
 * Updates an existing project by ID
 * Requires Bearer token authentication
 * Can update status from 'draft' to 'scheduled' and set scheduled_time
 */
app.put("/api/organization/projects/:id", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const projectId = req.params.id;
    const { project_code, project_name, description, status, scheduled_time, start_date, end_date } = req.body;

    // Find project and verify ownership
    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Validate status transition: can only change from 'draft' to 'scheduled'
    if (status && status !== project.status) {
      if (project.status === "draft" && status === "scheduled") {
        // Valid transition: draft -> scheduled
        project.status = "scheduled";
        // If scheduled_time is provided, update it
        if (scheduled_time) {
          project.scheduledTime = scheduled_time;
        } else if (!project.scheduledTime) {
          // If status is being set to scheduled but no scheduled_time provided, use current time
          project.scheduledTime = new Date().toISOString();
        }
      } else if (status === "draft") {
        // Can revert to draft
        project.status = "draft";
      } else {
        return res.status(400).json({
          error: `Invalid status transition from '${project.status}' to '${status}'. Only 'draft' to 'scheduled' is allowed.`,
        });
      }
    }

    // Update other fields if provided
    if (project_code !== undefined) project.projectCode = project_code;
    if (project_name !== undefined) project.projectName = project_name;
    if (description !== undefined) project.description = description;
    if (scheduled_time !== undefined && status !== "scheduled") {
      // Only update scheduled_time if not already set by status change
      project.scheduledTime = scheduled_time;
    }

    // Update dates if provided
    if (start_date) {
      const startDate = new Date(start_date);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "Invalid start_date format" });
      }
      project.startDate = startDate;
    }
    if (end_date) {
      const endDate = new Date(end_date);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid end_date format" });
      }
      project.endDate = endDate;
    }

    // Validate date range
    if (project.startDate && project.endDate && project.startDate > project.endDate) {
      return res.status(400).json({ error: "start_date must be before end_date" });
    }

    // Update other optional fields
    if (req.body.internsRequired !== undefined) project.internsRequired = req.body.internsRequired;
    if (req.body.cgpaRequirement !== undefined) project.cgpaRequirement = req.body.cgpaRequirement;
    if (req.body.discipline !== undefined) project.discipline = req.body.discipline;
    if (req.body.skills !== undefined) project.skills = req.body.skills;
    if (req.body.coordinatorName !== undefined) project.coordinatorName = req.body.coordinatorName;
    if (req.body.coordinatorEmail !== undefined) project.coordinatorEmail = req.body.coordinatorEmail;
    if (req.body.coordinatorAltEmail !== undefined) project.coordinatorAltEmail = req.body.coordinatorAltEmail;
    if (req.body.coordinatorPhone !== undefined) project.coordinatorPhone = req.body.coordinatorPhone;
    if (req.body.coordinatorDesignation !== undefined) project.coordinatorDesignation = req.body.coordinatorDesignation;

    await project.save();

    // Get applications count
    const applicationsCount = await Application.countDocuments({ projectId: project._id });

    // Format response
    const startDateFormatted = project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : null;
    const endDateFormatted = project.endDate ? new Date(project.endDate).toISOString().split('T')[0] : null;

    res.json({
      _id: project._id.toString(),
      project_code: project.projectCode,
      project_name: project.projectName,
      status: project.status,
      scheduled_time: project.scheduledTime,
      description: project.description,
      applications: applicationsCount,
      start_date: startDateFormatted,
      end_date: endDateFormatted,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  } catch (err) {
    console.error("🔥 PUT /api/organization/projects/:id error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid project ID format" });
    }
    res.status(500).json({ error: "Failed to update project", details: err.message });
  }
});

/**
 * DELETE /api/organization/projects/:id
 * Deletes a project by ID
 * Requires Bearer token authentication
 * Also deletes all associated applications
 */
app.delete("/api/organization/projects/:id", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const projectId = req.params.id;

    // Find project and verify ownership
    const project = await Project.findOne({ _id: projectId, organizationId });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Delete all applications associated with this project
    await Application.deleteMany({ projectId: project._id });

    // Delete the project
    await Project.findByIdAndDelete(projectId);

    res.json({
      message: "Project deleted successfully",
      projectId: projectId,
    });
  } catch (err) {
    console.error("🔥 DELETE /api/organization/projects/:id error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid project ID format" });
    }
    res.status(500).json({ error: "Failed to delete project", details: err.message });
  }
});

app.get("/api/organization/notifications/:orgId", async (req, res) => {
  try {
    const rows = await Notification.find({ organizationId: req.params.orgId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(rows || []);
  } catch (err) {
    console.error("🔥 Notifications:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/organization/profile
 * Updates organization profile data and password
 * Requires Bearer token authentication
 * Validates current password before allowing password change
 */
app.put("/api/organization/profile", authenticateToken, async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { 
      orgName, 
      cinRegistrationNumber, 
      country, 
      state, 
      detailedAddress,
      coordinatorName,
      coordinatorDesignation,
      coordinatorEmail,
      coordinatorAlternateEmail,
      coordinatorPhone,
      currentPassword,
      newPassword 
    } = req.body;

    // Find organization
    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Update profile fields if provided
    if (orgName !== undefined) org.orgName = orgName;
    if (cinRegistrationNumber !== undefined) org.cinRegistrationNumber = cinRegistrationNumber;
    if (country !== undefined) org.country = country;
    if (state !== undefined) org.state = state;
    if (detailedAddress !== undefined) org.detailedAddress = detailedAddress;

    // Update coordinator information if provided
    if (coordinatorName !== undefined || coordinatorDesignation !== undefined || 
        coordinatorEmail !== undefined || coordinatorAlternateEmail !== undefined || 
        coordinatorPhone !== undefined) {
      if (!org.coordinator) {
        org.coordinator = {};
      }
      if (coordinatorName !== undefined) org.coordinator.name = coordinatorName;
      if (coordinatorDesignation !== undefined) org.coordinator.designation = coordinatorDesignation;
      if (coordinatorEmail !== undefined) org.coordinator.email = coordinatorEmail;
      if (coordinatorAlternateEmail !== undefined) org.coordinator.alternateEmail = coordinatorAlternateEmail;
      if (coordinatorPhone !== undefined) org.coordinator.phone = coordinatorPhone;
    }

    // Handle password change if requested
    if (newPassword) {
      // Validate that current password is provided
      if (!currentPassword) {
        return res.status(400).json({ 
          error: "Current password is required to change password" 
        });
      }

      // Validate current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        org.passwordHash || ""
      );

      if (!isCurrentPasswordValid) {
        return res.status(401).json({ 
          error: "Current password is incorrect" 
        });
      }

      // Validate new password strength (optional - add your own rules)
      if (newPassword.length < 6) {
        return res.status(400).json({ 
          error: "New password must be at least 6 characters long" 
        });
      }

      // Hash and save new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      org.passwordHash = hashedNewPassword;
    }

    // Save updated organization
    await org.save();

    res.json({
      message: "Profile updated successfully",
      organization: {
        organizationId: org._id.toString(),
        username: org.username,
        orgName: org.orgName,
        cinRegistrationNumber: org.cinRegistrationNumber,
        country: org.country,
        state: org.state,
        detailedAddress: org.detailedAddress,
        coordinator: org.coordinator,
      },
    });
  } catch (err) {
    console.error("🔥 PUT /api/organization/profile error:", err);
    res.status(500).json({ 
      error: "Failed to update profile", 
      details: err.message 
    });
  }
});

// =======================================================
// Health check endpoint
app.get("/", (req, res) =>
  res.json({ message: "🎯 Internship Allotment API Running ✅" })
);

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    cors: "enabled"
  });
});

// 404 handler - must be last
app.use((req, res) => {
  console.log("❌ 404 - Route not found:", req.method, req.path);
  res.status(404).json({ error: "Route not found", path: req.path });
});

// =======================================================
// Server setup - Railway sets PORT automatically
const PORT = process.env.PORT || 5050;

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received. Shutting down gracefully...');
  mongoose.connection.close(false, () => {
    console.log('✅ MongoDB connection closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received. Shutting down gracefully...');
  mongoose.connection.close(false, () => {
    console.log('✅ MongoDB connection closed.');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server error:', err);
  }
});

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import nodemailer from "nodemailer";

dotenv.config();
const app = express();

// ...cors, parser and multer config unchanged

app.use(
  cors({
    origin: [
      "https://yugantran.netlify.app",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: "10mb" }));

const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });

app.use("/uploads", express.static("uploads"));

// -----------------------------
// 📊 Google Sheets Setup (unchanged)
// -----------------------------
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// -----------------------------
// ✉️ Nodemailer Setup (unchanged)
// -----------------------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Gmail address
    pass: process.env.GMAIL_PASS, // App password (16 chars)
  },
});

// Send confirmation email WITH WhatsApp link
async function sendConfirmationEmail(to, payload) {
  const mailOptions = {
    from:
      process.env.MAIL_FROM ||
      `"YUGANTRAN 2025" <${process.env.GMAIL_USER}>`,
    to,
    subject: `🎉 YUGANTRAN2.0 — Registration Confirmed${payload.event ? `: ${payload.event}` : ""}`,
    text: `Hello ${payload.name},

Your registration for ${payload.event ?? "the selected event"} has been received.

Team Name: ${payload.teamName ?? "N/A"}
Transaction ID: ${payload.transactionId ?? "N/A"}

📱 Join ${payload.event ?? "the selected event"} WhatsApp group for important updates:
${payload.whatsappLink ?? "-"}

Thank you for registering for YUGANTRAN2.0 2025.

Regards,
YUGANTRAN Team
Geeta University`,

    html: `
      <div style="font-family: Arial, sans-serif; color: #222;">
        <h2>🎉 Registration Confirmed!</h2>
        <p>Hello <strong>${payload.name}</strong>,</p>
        <p>Your registration for <strong>${payload.event ?? "the selected event"}</strong> has been successfully received.</p>

        ${
          payload.whatsappLink
            ? `<p>📱 <strong>Join ${payload.event ?? "the selected event"} WhatsApp Group</strong> for updates, announcements, and coordination:</p>
               <p><a href="${payload.whatsappLink}" style="background:#25D366;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;font-weight:bold;">
               Join WhatsApp Group</a></p>`
            : ""
        }

        <p>Thank you for being part of <strong>YUGANTRAN2.0 2025</strong>!</p>
        <p>Regards,<br/>YUGANTRAN Team<br/>Geeta University</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}: ${info.messageId}`);
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
}

// -----------------------------
// 🗂 Save Data to Google Sheet (unchanged, except whatsappLink is now expected from frontend)
// -----------------------------
async function saveToSheet(data, fileUrl) {
  try {
    const {
      name,
      rollNumber,
      program,
      semester,
      mobileNumber,
      college,
      eventType,
      teamType,
      teamName,
      teamMembers,
      upiId,
      transactionId,
      email,
      whatsappLink, // <-- frontend passes right link!
    } = data;

    // ...team member normalization logic unchanged...

    let membersArr = [];
    if (!teamMembers) membersArr = [];
    else if (typeof teamMembers === "string") {
      try {
        membersArr = JSON.parse(teamMembers);
      } catch {
        membersArr = teamMembers.split(",").map((s) => ({ name: s.trim() }));
      }
    } else if (Array.isArray(teamMembers)) membersArr = teamMembers;

    const normalizedMembers = membersArr.map((m) => {
      const sem = (m.semester || "-").toString().trim();
      const dept = (m.program || m.department || "-").toString().trim();
      const roll = (m.rollNumber || m.roll || "-").toString().trim();
      const nm = (m.name || m.fullName || "-").toString().trim();
      const col = (m.college || college || "-").toString().trim();
      return { semester: sem, program: dept, rollNumber: roll, name: nm, college: col };
    });

    const formattedTeamMembers = normalizedMembers.length
      ? normalizedMembers
          .map(
            (m) =>
              `${m.semester} | ${m.program} | ${m.rollNumber} | ${m.name} | ${m.college}`
          )
          .join("\n")
      : "-";

    const eventDisplay = Array.isArray(eventType)
      ? eventType.join(", ")
      : eventType;

    // Append to Google Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Submissions!B:O",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            name || "-",
            rollNumber || "-",
            program || "-",
            semester || "-",
            mobileNumber || "-",
            college || "-",
            eventDisplay || "-",
            teamType || "Individual",
            teamName || "-",
            formattedTeamMembers,
            fileUrl || "-",
            upiId || "-",
            transactionId || "-",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          ],
        ],
      },
    });

    console.log(`[SHEET] ✅ Added: ${name} (${rollNumber}) | Event: ${eventDisplay}`);

    // Send confirmation email if email provided (with WhatsApp link)
    if (email) {
      sendConfirmationEmail(email, {
        name,
        event: eventDisplay,
        teamName,
        transactionId,
        whatsappLink, // will be included in mail!
      });
    }
  } catch (error) {
    console.error("❌ Error saving to Sheet:", error);
  }
}

// -----------------------------
// 🚀 Routes (unchanged except added whatsappLink extraction from body)
// -----------------------------
app.get("/", (req, res) => {
  res.send("✅ YUGANTRAN 2025 Backend Running Successfully!");
});

app.post("/submit", upload.single("paymentReceipt"), async (req, res) => {
  console.log("📩 Incoming form data:", req.body);

  try {
    const {
      name,
      rollNumber,
      program,
      semester,
      mobileNumber,
      college,
      eventType,
      upiId,
      transactionId,
      // ...other fields
      whatsappLink, // will arrive from frontend for current event
    } = req.body;

    if (
      !name ||
      !rollNumber ||
      !program ||
      !semester ||
      !mobileNumber ||
      !college ||
      !eventType ||
      !upiId ||
      !transactionId
    ) {
      return res.status(400).send("❌ Missing required fields.");
    }

    let paymentReceiptUrl = "-";
    if (req.file) {
      paymentReceiptUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
      console.log("📎 File uploaded successfully:", paymentReceiptUrl);
    } else {
      return res.status(400).send("❌ Missing payment receipt file.");
    }

    // Immediate response
    res.status(200).send("✅ Registration received! We are processing it.");

    // Save to sheet & send email in background (pass whatsappLink)
    saveToSheet({ ...req.body, whatsappLink }, paymentReceiptUrl);

    console.log(`✅ Sent immediate OK for: ${name}. Saving to sheet and sending email...`);
  } catch (error) {
    console.error("❌ Error during initial submit:", error);
    if (!res.headersSent) {
      res.status(500).send("⚠️ Server Error while submitting data.");
    }
  }
});

// ...server listen unchanged...
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 YUGANTRAN Backend running on port ${PORT}`)
);
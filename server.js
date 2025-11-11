import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import { Resend } from "resend";
import axios from "axios"; // ✅ added for Mailtrap API

dotenv.config();
const app = express();

// ------------------------------------
// 🌐 CORS, Body Parser, Multer Config
// ------------------------------------
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

// ------------------------------------
// 📊 Google Sheets Setup (unchanged)
// ------------------------------------
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

// ------------------------------------
// ✉️ Mailtrap API Email Sender (No SMTP)
// ------------------------------------

// Send confirmation email WITH WhatsApp link


const resend = new Resend(process.env.RESEND_API_KEY);

async function sendConfirmationEmail(to, payload) {
  const subject = `Registration Confirmed${payload.event ? `: ${payload.event}` : ""} — YUGANTRAN2.0 2025`;

  const plainTextContent = `
Hello ${payload.name},

Thank you for registering for ${payload.event ?? "the selected event"} at YUGANTRAN2.0 2025.

Team Name: ${payload.teamName ?? "N/A"}
Transaction ID: ${payload.transactionId ?? "N/A"}

${payload.whatsappLink ? `Join the WhatsApp group for updates:\n${payload.whatsappLink}\n\n` : ""} 

If you have any questions, please contact us at yugantran@geetauniversity.edu.in.

Best regards,
YUGANTRAN2.0 Team
Geeta University
`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; color:#333;">
      <h2 style="color:#0073e6;">Registration Confirmed</h2>
      <p>Hello <strong>${payload.name}</strong>,</p>
      <p>Thank you for registering for <strong>${payload.event ?? "the selected event"}</strong> at <strong>YUGANTRAN2.0 2025</strong>.</p>
      ${payload.whatsappLink
      ? `<p>📱 <strong>Join the WhatsApp group</strong> for updates and coordination:</p>
             <p><a href="${payload.whatsappLink}" style="display:inline-block; background:#25D366; color:#fff; padding:10px 20px; border-radius:5px; text-decoration:none; font-weight:bold;">Join WhatsApp Group</a></p>`
      : ""
    }
      <p>If you have any questions, feel free to contact us at <a href="mailto:yugantran@geetauniversity.edu.in">yugantran@geetauniversity.edu.in</a>.</p>
      <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
      <p style="font-size:12px; color:#777;">
        This email was sent by YUGANTRAN2.0 2025, Geeta University.<br>
        Please do not reply to this automated message.
      </p>
    </div>
  `;

  try {
    const response = await resend.emails.send({
      from: "YUGANTRAN2.0 2025 <onboarding@resend.dev>",
      to: to,
      subject: subject,
      html: htmlContent,
      text: plainTextContent,
    });

    console.log(`📧 Email sent via Resend to ${to}:`, response.id);
  } catch (error) {
    console.error("❌ Error sending email via Resend:", error.message || error);
  }
}


// ------------------------------------
// 🗂 Save Data to Google Sheet (unchanged)
// ------------------------------------
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
      whatsappLink, // frontend passes right link
    } = data;

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

    // Send confirmation email if email provided
    if (email) {
      sendConfirmationEmail(email, {
        name,
        event: eventDisplay,
        teamName,
        transactionId,
        whatsappLink,
      });
    }
  } catch (error) {
    console.error("❌ Error saving to Sheet:", error);
  }
}

// ------------------------------------
// 🚀 Routes (unchanged)
// ------------------------------------
app.get("/", (req, res) => {
  res.send("✅ YUGANTRAN2.0 2025 Backend Running Successfully!");
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
      whatsappLink,
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

    res.status(200).send("✅ Registration received! We are processing it.");

    saveToSheet({ ...req.body, whatsappLink }, paymentReceiptUrl);

    console.log(`✅ Sent immediate OK for: ${name}. Saving to sheet and sending email...`);
  } catch (error) {
    console.error("❌ Error during initial submit:", error);
    if (!res.headersSent) {
      res.status(500).send("⚠️ Server Error while submitting data.");
    }
  }
});

// ------------------------------------
// 🖥️ Server Listen
// ------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 YUGANTRAN2.0 Backend running on port ${PORT}`)
);

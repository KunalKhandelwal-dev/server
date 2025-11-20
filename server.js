import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import { sendConfirmationEmail } from "./sendEmail.js";

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
// 📊 Google Sheets Setup
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
// 🗂 Save Data to Google Sheet
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
      whatsappLink,
    } = data;

    let membersArr = [];
    if (!teamMembers) membersArr = [];
    else if (typeof teamMembers === "string") {
      try {
        membersArr = JSON.parse(teamMembers);
      } catch {
        membersArr = teamMembers
          .split(",")
          .map((s) => ({ name: s.trim() }));
      }
    } else if (Array.isArray(teamMembers)) membersArr = teamMembers;

    const normalizedMembers = membersArr.map((m) => {
      return {
        semester: (m.semester || "-").trim(),
        program: (m.program || m.department || "-").trim(),
        rollNumber: (m.rollNumber || "-").trim(),
        name: (m.name || "-").trim(),
        college: (m.college || college || "-").trim(),
      };
    });

    const formattedTeamMembers =
      normalizedMembers.length
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
      range: "Submissions!B:P",
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
            "-",
            email || "-"
          ],
        ],
      },
    });

    console.log(`[SHEET] Added: ${name} (${rollNumber})`);

    if (email) {
      await sendConfirmationEmail(email, {
        name,
        event: eventDisplay,
        teamName,
        transactionId,
        whatsappLink,
      });
    }
  } catch (error) {
    console.error("❌ Sheet Save Error:", error);
  }
}

// ------------------------------------
// 🚀 Routes
// ------------------------------------
app.get("/", (req, res) => {
  res.send("YUGANTRAN2.0 Backend Running!");
});

app.post("/submit", upload.single("paymentReceipt"), async (req, res) => {
  try {
    const { name, rollNumber, program, semester, mobileNumber, college, eventType, upiId, transactionId, whatsappLink } =
      req.body;

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
      return res.status(400).send("Missing required fields.");
    }

    if (!req.file)
      return res.status(400).send("Missing payment receipt file.");

    const paymentReceiptUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    res.status(200).send("Registration received!");

    saveToSheet({ ...req.body, whatsappLink }, paymentReceiptUrl);
  } catch (error) {
    if (!res.headersSent)
      res.status(500).send("Error while submitting.");
  }
});

// ------------------------------------
// 🖥️ Server Listen
// ------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`YUGANTRAN2.0 Backend running on port ${PORT}`)
);

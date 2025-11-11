import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const app = express();

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

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    // guard replace in case env var is undefined
    private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") : undefined,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

app.get("/", (req, res) => {
  res.send("✅ YUGANTRAN 2025 Backend Running Successfully!");
});

// Background saver
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
    } = data;

    // teamMembers may be a JSON string (from frontend) or an array already
    let membersArr = [];
    if (!teamMembers) {
      membersArr = [];
    } else if (typeof teamMembers === "string") {
      try {
        membersArr = JSON.parse(teamMembers);
      } catch (err) {
        // fallback: comma-separated values (legacy)
        membersArr = teamMembers.split(",").map((s) => ({ name: s.trim() }));
      }
    } else if (Array.isArray(teamMembers)) {
      membersArr = teamMembers;
    }

    // Normalize members and ensure each member has expected fields.
    // If member.college is missing, fall back to the submitting user's college.
    const normalizedMembers = membersArr.map((m) => {
      const sem = (m.semester || "").toString().trim();
      const dept = (m.program || m.department || "").toString().trim();
      const roll = (m.rollNumber || m.roll || "").toString().trim();
      const nm = (m.name || m.fullName || "").toString().trim();
      const col = (m.college || "").toString().trim() || (college || "").toString().trim() || "-";
      return {
        semester: sem || "-",
        program: dept || "-",
        rollNumber: roll || "-",
        name: nm || "-",
        college: col || "-",
      };
    });

    // Format members as lines in the requested order:
    // semester | program | roll number | name | college
    const formattedTeamMembers = normalizedMembers.length
      ? normalizedMembers
          .map((m) => `${m.semester} | ${m.program} | ${m.rollNumber} | ${m.name} | ${m.college}`)
          .join("\n")
      : "-";

    const eventDisplay = Array.isArray(eventType) ? eventType.join(", ") : eventType;

    // Append to sheet. Choose range with enough columns (B:O to accommodate more fields)
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
            formattedTeamMembers, // multi-line string containing sem|dept|roll|name|college per line
            fileUrl || "-",
            upiId || "-",
            transactionId || "-",
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          ],
        ],
      },
    });

    console.log(`[BACKGROUND] ✅ Added: ${name} (${rollNumber}) | Event: ${eventDisplay}`);
  } catch (error) {
    console.error("❌ [BACKGROUND] Error saving to Sheet:", error);
  }
}

app.post("/submit", upload.single("paymentReceipt"), async (req, res) => {
  console.log("📩 Incoming form data:", req.body);

  try {
    const { name, rollNumber, program, semester, mobileNumber, college, eventType, upiId, transactionId } = req.body;
    if (
      !name || !rollNumber || !program || !semester || !mobileNumber ||
      !college || !eventType || !upiId || !transactionId
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

    // Send immediate response
    res.status(200).send("✅ Registration received! We are processing it.");

    // Save to sheet in background (no await)
    saveToSheet(req.body, paymentReceiptUrl);

    console.log(`✅ Sent immediate OK for: ${name}. Saving to sheet in background...`);
  } catch (error) {
    console.error("❌ Error during initial submit:", error);
    if (!res.headersSent) {
      res.status(500).send("⚠️ Server Error while submitting data.");
    }
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
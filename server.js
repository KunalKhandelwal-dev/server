import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();
const app = express();

/* ---------------------------
   🧩 Middleware Setup
--------------------------- */
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

/* ---------------------------
   💾 File Upload Config
--------------------------- */
// Create uploads folder if it doesn’t exist
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Store uploaded files in /uploads with timestamped filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });

// Make uploads folder publicly accessible
app.use("/uploads", express.static("uploads"));

/* ---------------------------
   📊 Google Sheets Auth
--------------------------- */
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

/* ---------------------------
   🚀 Health Check
--------------------------- */
app.get("/", (req, res) => {
  res.send("✅ YUGANTRAN 2025 Backend Running Successfully!");
});

/* ---------------------------
   📝 Submit Registration
--------------------------- */
app.post("/submit", upload.single("paymentReceipt"), async (req, res) => {
  console.log("📩 Incoming form data:", req.body);

  try {
    const {
      name,
      rollNumber,
      department,
      semester,
      mobileNumber,
      college,
      eventType,
      teamType,
      teamName,
      teamMembers,
      upiId,           // <-- Added
      transactionId,   // <-- Added
    } = req.body;

    // ✅ Validation
    if (
      !name ||
      !rollNumber ||
      !department ||
      !semester ||
      !mobileNumber ||
      !college ||
      !eventType ||
      !upiId ||           // <-- Added
      !transactionId      // <-- Added
    ) {
      return res.status(400).send("❌ Missing required fields.");
    }

    // ✅ Handle uploaded file
    let paymentReceiptUrl = "-";
    if (req.file) {
      // Create public URL to the uploaded file
      paymentReceiptUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
      console.log("📎 File uploaded successfully:", paymentReceiptUrl);
    }

    // ✅ Get total rows for Sr. No.
    const getRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Submissions!A:A",
    });
    const srNo = getRows.data.values ? getRows.data.values.length : 1;

    // ✅ Format data for Sheets
    const formattedTeamMembers = Array.isArray(teamMembers)
      ? teamMembers.filter((m) => m.trim() !== "").join(", ")
      : teamMembers || "-";

    const eventDisplay = Array.isArray(eventType)
      ? eventType.join(", ")
      : eventType;

    // ✅ Append to Google Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Submissions!A:M",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            srNo,
            name,
            rollNumber,
            department,
            semester,
            mobileNumber,
            college,
            eventDisplay,
            teamType || "Individual",
            teamName || "-",
            formattedTeamMembers,
            paymentReceiptUrl, // ✅ Store URL not base64
            upiId,            // <-- Added
            transactionId,    // <-- Added
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          ],
        ],
      },
    });

    console.log(`✅ Added: ${name} (${rollNumber}) | Event: ${eventDisplay}`);
    res.status(200).send("✅ Registration saved successfully!");
  } catch (error) {
    console.error("❌ Error submitting data:", error);
    res.status(500).send("⚠️ Server Error while submitting data.");
  }
});

/* ---------------------------
   🌐 Start Server
--------------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

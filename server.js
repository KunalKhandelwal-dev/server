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
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });

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

// 🌟 NEW ASYNC HELPER FUNCTION 🌟
// This does the slow work in the background.
async function saveToSheet(data, fileUrl) {
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
      upiId,
      transactionId,
    } = data;

    // ✅ Format data for Sheets
    const formattedTeamMembers = Array.isArray(teamMembers)
      ? teamMembers.filter((m) => m.trim() !== "").join(", ")
      : teamMembers || "-";

    const eventDisplay = Array.isArray(eventType)
      ? eventType.join(", ")
      : eventType;
  
    // ✅ Append to Google Sheet (We removed the 'getRows' call)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      // IMPORTANT: Update range to 'Submissions!B:M' since 'A' is now a formula
      range: "Submissions!B:M", // Start from 'B' now
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            // No more srNo, it's a formula in the sheet!
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
            fileUrl, // Use the URL passed to the function
            upiId,
            transactionId,
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          ],
        ],
      },
    });

    console.log(`[BACKGROUND] ✅ Added: ${name} (${rollNumber}) | Event: ${eventDisplay}`);
  } catch (error) {
    console.error("❌ [BACKGROUND] Error saving to Sheet:", error);
    // We can't send an error to the user here, as they've already received 'OK'.
    // This is for server logging only.
  }
}


/* ---------------------------
    📝 Submit Registration (OPTIMIZED)
--------------------------- */
app.post("/submit", upload.single("paymentReceipt"), async (req, res) => {
  console.log("📩 Incoming form data:", req.body);

  try {
    // ✅ Fast Validation
    const { name, rollNumber, department, semester, mobileNumber, college, eventType, upiId, transactionId } = req.body;
    if (
      !name || !rollNumber || !department || !semester || !mobileNumber ||
      !college || !eventType || !upiId || !transactionId
    ) {
      // This check is fast and happens before any API calls
      return res.status(400).send("❌ Missing required fields.");
    }

    // ✅ Handle uploaded file (Fast)
    let paymentReceiptUrl = "-";
    if (req.file) {
      paymentReceiptUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
      console.log("📎 File uploaded successfully:", paymentReceiptUrl);
    } else {
      // If receipt is mandatory, you should check for it in the validation above
      return res.status(400).send("❌ Missing payment receipt file.");
    }

    // 🎉 --- THIS IS THE MAGIC --- 🎉
    // 1. Send the "OK" response to the user IMMEDIATELY.
    res.status(200).send("✅ Registration received! We are processing it.");
    
    // 2. Call the slow function *WITHOUT* await.
    // The server will do this in the background.
    saveToSheet(req.body, paymentReceiptUrl);
    
    console.log(`✅ Sent immediate OK for: ${name}. Saving to sheet in background...`);

  } catch (error) {
    console.error("❌ Error during initial submit:", error);
    // This catch will only trigger for validation or file system errors
    if (!res.headersSent) {
      res.status(500).send("⚠️ Server Error while submitting data.");
    }
  }
});

/* ---------------------------
    🌐 Start Server
--------------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// ✅ Middleware
app.use(
  cors({
    origin: [
      "https://yugantran.netlify.app", // deployed frontend
      "http://localhost:3000",         // local CRA
      "http://localhost:5173"          // local Vite
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// ✅ Google Sheets Auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// ✅ Root Route
app.get("/", (req, res) => {
  res.send("✅ YUGANTRAN 2025 Backend Running Successfully!");
});

// ✅ Submit Route (Fully Updated)
app.post("/submit", async (req, res) => {
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
    } = req.body;

    // 🧩 Basic Validation
    if (!name || !rollNumber || !department || !semester || !mobileNumber || !college || !eventType) {
      return res.status(400).send("❌ Missing required fields.");
    }

    // 🧩 Get current row count for Sr No.
    const getRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:A",
    });

    const srNo = getRows.data.values ? getRows.data.values.length : 1;

    // 🧩 Format data for sheet
    const formattedTeamMembers = Array.isArray(teamMembers)
      ? teamMembers.filter((m) => m.trim() !== "").join(", ")
      : "";

    const eventDisplay = Array.isArray(eventType)
      ? eventType.join(", ")
      : eventType;

    // ✅ Append data
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:K",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [
            srNo,                               // A: Sr No
            name,                               // B: Name
            rollNumber,                         // C: Roll No
            department,                         // D: Department
            semester,                           // E: Semester
            mobileNumber,                       // F: Mobile
            college,                            // G: College
            eventDisplay,                       // H: Event(s)
            teamType || "Individual",           // I: Team Type
            teamName || "-",                    // J: Team Name
            formattedTeamMembers || "-",        // K: Team Members
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), // L: Timestamp
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

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const app = express();

// ✅ CORS setup
app.use(
  cors({
    origin: [
      "https://yugantran.netlify.app", // your deployed frontend
      "http://localhost:3000",         // local dev (CRA)
      "http://localhost:5173"          // local dev (Vite)
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(bodyParser.json());

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
  res.send("✅ Backend deployed successfully and is running!");
});

// ✅ Submit Route (Updated)
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
    } = req.body;

    // Basic validation
    if (!name || !rollNumber || !department || !semester || !mobileNumber || !college || !eventType) {
      return res.status(400).send("Missing required fields");
    }

    // ✅ Get current number of rows (for Sr No.)
    const getRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:A",
    });

    const srNo = getRows.data.values ? getRows.data.values.length : 1;

    // ✅ Append data (columns: Sr No, Name, Roll No, Department, Semester, Mobile, Event, College, Timestamp)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:I",
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
            eventType,
            college,
            new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          ],
        ],
      },
    });

    console.log(`✅ Added: ${name} (${rollNumber})`);
    res.status(200).send("Data added successfully!");
  } catch (error) {
    console.error("❌ Error submitting data:", error);
    res.status(500).send("Error adding data.");
  }
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

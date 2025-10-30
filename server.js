import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const app = express();
app.use(cors({
  origin: [
    "https://yugantran.netlify.app",  // ✅ your frontend on Netlify
    "http://localhost:3000",           // ✅ still allow local testing
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(bodyParser.json());
// app.use(express.static("public"));

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), // converts \n into real line breaks
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

app.get("/", (req, res) => {
  res.send("✅ Backend deployed successfully and is running!");
});

app.post("/submit", async (req, res) => {
  try {
    const { name, mobileNumber, eventType, college } = req.body;

    // Get current number of rows (to auto-assign Sr No.)
    const getRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:A",
    });
    const srNo = getRows.data.values ? getRows.data.values.length : 1;

    // Append data
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:F",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          [srNo, name, mobileNumber, eventType, college, new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
        ],
      },
    });

    res.status(200).send("Data added successfully!");
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Error adding data.");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
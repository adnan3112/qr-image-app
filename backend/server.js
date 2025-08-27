// server.js
const express = require("express");
const multer = require("multer");
const B2 = require("backblaze-b2");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// --- CORS ---
const allowedOrigins = [
    "https://curious-jelly-a36572.netlify.app",
];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!allowedOrigins.includes(origin)) {
            return callback(new Error("CORS not allowed from this origin"), false);
        }
        return callback(null, true);
    },
    methods: ["GET", "POST", "OPTIONS"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// --- B2 Setup ---
const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
});
const bucketId = process.env.B2_BUCKET_ID;

// --- Store passwords for files (in-memory) ---
const filePasswords = {}; // { fileName: password }

// --- Authorize B2 ---
async function authorizeB2() {
    try {
        await b2.authorize();
        console.log("B2 Authorized successfully");
    } catch (err) {
        console.error("B2 Authorization failed:", err.response?.data || err.message);
        throw err;
    }
}

// --- Upload Endpoint ---
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        const password = req.body.password;
        if (!req.file || !password) return res.status(400).json({ error: "File and password required" });

        await authorizeB2();

        const fileName = `${Date.now()}_${req.file.originalname}`;
        const uploadUrlResp = await b2.getUploadUrl({ bucketId });

        await b2.uploadFile({
            uploadUrl: uploadUrlResp.data.uploadUrl,
            uploadAuthToken: uploadUrlResp.data.authorizationToken,
            fileName,
            data: req.file.buffer,
        });

        // Store the password for this file
        filePasswords[fileName] = password;

        res.json({ fileName });
    } catch (err) {
        console.error("Upload error:", err.response?.data || err.message);
        res.status(500).json({ error: "Upload failed" });
    }
});

// --- Download Endpoint ---
app.post("/download", async (req, res) => {
    try {
        const { fileName, password } = req.body;
        if (!fileName || !password) return res.status(400).json({ error: "FileName and password required" });

        const correctPassword = filePasswords[fileName];
        if (!correctPassword || password !== correctPassword) {
            return res.status(401).json({ error: "Incorrect password" });
        }

        await authorizeB2();

        const downloadAuthResp = await b2.getDownloadAuthorization({
            bucketId,
            fileNamePrefix: fileName,
            validDurationInSeconds: 60, // 1 min
        });

        const downloadUrl = `https://f000.backblazeb2.com/file/${process.env.B2_BUCKET_NAME}/${encodeURIComponent(fileName)}?Authorization=${downloadAuthResp.data.authorizationToken}`;

        res.json({ downloadUrl });
    } catch (err) {
        console.error("Download error:", err.response?.data || err.message);
        res.status(500).json({ error: "Download URL generation failed" });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
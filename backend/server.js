// server.js
const express = require("express");
const multer = require("multer");
const B2 = require("backblaze-b2");
const cors = require("cors");
require("dotenv").config(); // load credentials from .env

const app = express();
const port = process.env.PORT || 3000;

// --- CORS setup for Render + Netlify frontend ---
app.use(cors({
    origin: process.env.FRONTEND_URL || "https://curious-jelly-a36572.netlify.app",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
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
const bucketName = process.env.B2_BUCKET_NAME;

// --- Authorize function ---
async function authorizeB2() {
    try {
        await b2.authorize();
        console.log("B2 Authorized successfully");
    } catch (err) {
        console.error("B2 Authorization failed:", err.response?.data || err.message);
        throw err;
    }
}

// --- Upload endpoint ---
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        await authorizeB2();

        const fileName = `${Date.now()}_${req.file.originalname}`;
        const uploadUrlResp = await b2.getUploadUrl({ bucketId });

        await b2.uploadFile({
            uploadUrl: uploadUrlResp.data.uploadUrl,
            uploadAuthToken: uploadUrlResp.data.authorizationToken,
            fileName,
            data: req.file.buffer,
        });

        res.json({ fileName });
    } catch (err) {
        console.error("Upload error:", err.response?.data || err.message);
        res.status(500).json({ error: "Upload failed" });
    }
});

// --- Download endpoint ---
app.get("/download", async (req, res) => {
    try {
        const { fileName } = req.query;
        if (!fileName) return res.status(400).json({ error: "fileName is required" });

        await authorizeB2();

        const downloadAuthResp = await b2.getDownloadAuthorization({
            bucketId,
            fileNamePrefix: fileName,
            validDurationInSeconds: 300, // 5 minutes for better usability
        });

        const downloadUrl = `https://f000.backblazeb2.com/file/${bucketName}/${encodeURIComponent(fileName)}?Authorization=${downloadAuthResp.data.authorizationToken}`;
        res.json({ downloadUrl });
    } catch (err) {
        console.error("Download error:", err.response?.data || err.message);
        res.status(500).json({ error: "Download URL generation failed" });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
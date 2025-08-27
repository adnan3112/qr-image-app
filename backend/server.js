// server.js
const express = require("express");
const multer = require("multer");
const B2 = require("backblaze-b2");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Allow frontend origin
const allowedOrigins = [
    "https://curious-jelly-a36572.netlify.app", // your Netlify frontend
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) return callback(new Error("CORS not allowed"), false);
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
const bucketName = process.env.B2_BUCKET_NAME;

// --- Authorize B2 ---
async function authorizeB2() {
    await b2.authorize();
}

// --- Upload ---
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

// --- Download ---
app.get("/download", async (req, res) => {
    try {
        const { fileName } = req.query;
        if (!fileName) return res.status(400).json({ error: "fileName required" });

        await authorizeB2();

        // Generate temporary download URL for private file
        const downloadAuth = await b2.getDownloadAuthorization({
            bucketId,
            fileNamePrefix: fileName,
            validDurationInSeconds: 300, // link valid for 5 minutes
        });

        const downloadUrl = `https://f000.backblazeb2.com/file/${bucketName}/${encodeURIComponent(fileName)}?Authorization=${downloadAuth.data.authorizationToken}`;

        res.json({ downloadUrl });
    } catch (err) {
        console.error("Download error:", err.response?.data || err.message);
        res.status(500).json({ error: "Failed to generate download URL" });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
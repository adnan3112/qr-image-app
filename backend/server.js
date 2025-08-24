const express = require("express");
const multer = require("multer");
const B2 = require("backblaze-b2");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// CORS setup for Netlify frontend
app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// Backblaze B2 setup
const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
});

const bucketId = process.env.B2_BUCKET_ID;

async function authorizeB2() {
    try {
        await b2.authorize();
    } catch (err) {
        console.error("B2 authorization failed:", err);
        throw err;
    }
}

// Upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        await authorizeB2();

        const fileName = `${Date.now()}_${req.file.originalname}`;
        const uploadUrlResp = await b2.getUploadUrl({ bucketId });

        const uploadResp = await b2.uploadFile({
            uploadUrl: uploadUrlResp.data.uploadUrl,
            uploadAuthToken: uploadUrlResp.data.authorizationToken,
            fileName,
            data: req.file.buffer,
        });

        res.json({ fileName: uploadResp.data.fileName });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Upload failed" });
    }
});

// Download URL endpoint
app.get("/download", async (req, res) => {
    try {
        const { fileName } = req.query;
        if (!fileName) return res.status(400).json({ error: "Missing fileName" });

        await authorizeB2();

        const downloadAuthResp = await b2.getDownloadAuthorization({
            bucketId,
            fileNamePrefix: fileName,
            validDurationInSeconds: 60,
        });

        const downloadUrl = `https://f000.backblazeb2.com/file/${bucketId}/${encodeURIComponent(
            fileName
        )}?Authorization=${downloadAuthResp.data.authorizationToken}`;

        res.json({ downloadUrl });
    } catch (err) {
        console.error("Download URL error:", err);
        res.status(500).json({ error: "Download URL generation failed" });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
// server.js
const express = require("express");
const multer = require("multer");
const B2 = require("backblaze-b2");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// --- CORS setup ---
const allowedOrigins = [
    "https://curious-jelly-a36572.netlify.app", // Netlify frontend
    "http://127.0.0.1:5500" // optional local testing
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true); // allow curl/Postman
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = "CORS not allowed from this origin";
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

// --- Backblaze B2 setup ---
const b2 = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY
});
const bucketName = process.env.B2_BUCKET_NAME;
let bucketId;

// --- Authorize and get bucket ---
async function authorizeB2() {
    await b2.authorize();
    if (!bucketId) {
        const bucketsResp = await b2.listBuckets({ accountId: process.env.B2_ACCOUNT_ID });
        const bucket = bucketsResp.data.buckets.find(b => b.bucketName === bucketName);
        if (!bucket) throw new Error("Bucket not found: " + bucketName);
        bucketId = bucket.bucketId;
    }
}

// --- Upload endpoint ---
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const password = req.body.password;
        if (!password) return res.status(400).json({ error: "Password is required" });

        await authorizeB2();

        const fileName = `${Date.now()}_${req.file.originalname}`;
        const uploadUrlResp = await b2.getUploadUrl({ bucketId });

        const uploadResp = await b2.uploadFile({
            uploadUrl: uploadUrlResp.data.uploadUrl,
            uploadAuthToken: uploadUrlResp.data.authorizationToken,
            fileName,
            data: req.file.buffer
        });

        res.json({ fileName });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Upload failed", details: err.message });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
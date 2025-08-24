const express = require("express");
const multer = require("multer");
const B2 = require("backblaze-b2");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// --- CORS ---
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.options("*", cors());

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- B2 setup ---
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY
});

const upload = multer({ storage: multer.memoryStorage() });
let bucketId;

// --- Authorize B2 & find bucket ---
async function authorizeB2() {
  await b2.authorize();
  if (!bucketId) {
    const buckets = await b2.listBuckets();
    const bucket = buckets.data.buckets.find(b => b.bucketName === process.env.B2_BUCKET_NAME);
    if (!bucket) throw new Error("Bucket not found: " + process.env.B2_BUCKET_NAME);
    bucketId = bucket.bucketId;
  }
}

// --- Upload endpoint ---
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const password = req.body.password?.trim();
    if (!password) return res.status(400).json({ error: "Password required" });

    await authorizeB2();

    const fileName = `${Date.now()}_${req.file.originalname}`;
    const uploadUrlResp = await b2.getUploadUrl({ bucketId });
    const uploadResp = await b2.uploadFile({
      uploadUrl: uploadUrlResp.data.uploadUrl,
      uploadAuthToken: uploadUrlResp.data.authorizationToken,
      fileName,
      data: req.file.buffer
    });

    res.json({ fileName, password });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// --- Download endpoint ---
app.get("/download", async (req, res) => {
  try {
    const { fileName } = req.query;
    if (!fileName) return res.status(400).json({ error: "Missing fileName" });

    await authorizeB2();
    const downloadAuthResp = await b2.getDownloadAuthorization({
      bucketId,
      fileNamePrefix: fileName,
      validDurationInSeconds: 300
    });

    const downloadUrl = `https://f000.backblazeb2.com/file/${process.env.B2_BUCKET_NAME}/${encodeURIComponent(fileName)}?Authorization=${downloadAuthResp.data.authorizationToken}`;
    res.json({ downloadUrl });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download failed" });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
// server.js
const express = require("express");
const multer = require("multer");
const B2 = require("backblaze-b2");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

// B2 credentials
const b2 = new B2({
    applicationKeyId: "005a7ae2f2dc5ee0000000001",
    applicationKey: "K005oD6gTbbQpvROb/E+ZCQ/ColG5Kk",
});

const bucketId = "7af7da6e824fd2cd9c850e1e"; // your private bucket

// Upload endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        await b2.authorize();

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
        console.error(err);
        res.status(500).json({ error: "Upload failed" });
    }
});

// Generate temporary download URL for private file
app.get("/download", async (req, res) => {
    try {
        const { fileName } = req.query;
        await b2.authorize();
        const downloadUrlResp = await b2.getDownloadAuthorization({
            bucketId,
            fileNamePrefix: fileName,
            validDurationInSeconds: 60, // link valid for 1 min
        });

        const downloadUrl = `https://f000.backblazeb2.com/file/${bucketId}/${encodeURIComponent(fileName)}?Authorization=${downloadUrlResp.data.authorizationToken}`;
        res.json({ downloadUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Download URL generation failed" });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
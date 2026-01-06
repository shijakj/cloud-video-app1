require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const { uploadBuffer, downloadStream, ensureContainer } = require("./blobStorage");
const { initStore, loadData, saveData } = require("./dataStore");
const { analyzeSentiment } = require("./sentiment");

const app = express();

// ✅ CORS: allow your Azure Static Website + local dev
const allowedOrigins = [
  "https://cloudvideofrontend1.z33.web.core.windows.net",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
];

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true); // Postman / curl
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "2mb" }));

const upload = multer({ storage: multer.memoryStorage() });

const VIDEO_CONTAINER = process.env.VIDEO_CONTAINER || "videos";

app.get("/", (req, res) => res.json({ message: "Backend API is running" }));
app.get("/health", (req, res) => res.send("OK"));

// Init store + container
(async () => {
  try {
    await ensureContainer(VIDEO_CONTAINER);
    await initStore();
    console.log("Storage ready");
  } catch (e) {
    console.error("Storage init failed:", e?.message || e);
  }
})();

// Upload video -> Blob + metadata.json
app.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No video uploaded" });

    const title = req.body.title || "Untitled";
    const description = req.body.description || "";
    const originalName = (req.file.originalname || "video.mp4").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    const filename = `${Date.now()}_${originalName}`;

    await uploadBuffer(VIDEO_CONTAINER, filename, req.file.buffer, req.file.mimetype);

    await saveData((data) => {
      const videos = data.videos || [];
      const nextId = videos.length ? Math.max(...videos.map((v) => v.id || 0)) + 1 : 1;

      videos.push({
        id: nextId,
        filename,
        thumbnail: null,
        title,
        description,
        likes: 0,
        views: 0,
        comments: []
      });

      return { ...data, videos };
    });

    return res.json({ message: "Upload successful", filename });
  } catch (e) {
    return res.status(500).json({ error: "Upload failed", details: String(e?.message || e) });
  }
});

app.get("/api/videos", async (req, res) => {
  try {
    const { data } = await loadData();
    return res.json(data.videos || []);
  } catch (e) {
    return res.status(500).json({ error: "Failed to load videos" });
  }
});

// Stream video from Blob (frontend uses /video/<filename>)
app.get("/video/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const resp = await downloadStream(VIDEO_CONTAINER, filename);

    const contentType = resp.contentType || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    resp.readableStreamBody.pipe(res);
  } catch (e) {
    return res.status(404).send("Not found");
  }
});

// Optional thumbnail endpoint
app.get("/thumbnail/:filename", async (req, res) => {
  return res.status(404).send("No thumbnail");
});

app.post("/api/like/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await saveData((data) => {
      const videos = data.videos || [];
      const v = videos.find((x) => Number(x.id) === id);
      if (v) v.likes = (v.likes || 0) + 1;
      return { ...data, videos };
    });
    return res.json({ status: "ok" });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/view/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await saveData((data) => {
      const videos = data.videos || [];
      const v = videos.find((x) => Number(x.id) === id);
      if (v) v.views = (v.views || 0) + 1;
      return { ...data, videos };
    });
    return res.json({ status: "ok" });
  } catch {
    return res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/comment/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const text = (req.body?.text || "").trim();
    const username = (req.body?.username || "Anonymous").trim();

    if (!text) return res.status(400).json({ error: "Empty comment" });

    const sentiment = await analyzeSentiment(text);

    await saveData((data) => {
      const videos = data.videos || [];
      const v = videos.find((x) => Number(x.id) === id);

      if (v) {
        v.comments = v.comments || [];
        v.comments.push({ user: username, text, sentiment, at: new Date().toISOString() });
      }

      return { ...data, videos };
    });

    return res.json({ status: "ok", sentiment });
  } catch (e) {
    return res.status(500).json({ error: "Failed", details: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

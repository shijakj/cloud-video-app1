require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { uploadBuffer, downloadStream, ensureContainer } = require("./blobStorage");
const { initStore, loadData, saveData } = require("./dataStore");
const { analyzeSentiment } = require("./sentiment");

const app = express();

/* ===============================
   Azure / Security Middleware
================================ */

app.set("trust proxy", 1); // REQUIRED for Azure App Service

app.use(helmet());

// Global rate limit (all routes)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,                // 300 requests / IP
  })
);

// Stricter limiter for uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 uploads / 15 min / IP
});

/* ===============================
   CORS (Frontend Allowlist)
   FIX: allow Range header for <video> streaming
================================ */

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
    methods: ["GET", "POST", "OPTIONS", "HEAD"],
    // IMPORTANT: video playback needs Range
    allowedHeaders: ["Content-Type", "Authorization", "Range"],
    // Let browser read these headers
    exposedHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type"],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  })
);

app.use(express.json({ limit: "2mb" }));

/* ===============================
   Multer (Upload config)
================================ */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/* ===============================
   App config
================================ */

const VIDEO_CONTAINER = process.env.VIDEO_CONTAINER || "videos";

app.get("/", (req, res) =>
  res.json({ message: "Backend API is running" })
);

app.get("/health", (req, res) => res.send("OK"));

/* ===============================
   Init Storage
================================ */

(async () => {
  try {
    await ensureContainer(VIDEO_CONTAINER);
    await initStore();
    console.log("Storage ready");
  } catch (e) {
    console.error("Storage init failed:", e?.message || e);
  }
})();

/* ===============================
   Upload Video
================================ */

app.post(
  "/upload",
  uploadLimiter,
  upload.single("video"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video uploaded" });
      }

      const allowedTypes = [
        "video/mp4",
        "video/webm",
        "video/quicktime",
      ];

      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          error: "Only mp4, webm or mov videos are allowed",
        });
      }

      const title = req.body.title || "Untitled";
      const description = req.body.description || "";

      const safeName = (req.file.originalname || "video.mp4").replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      const filename = `${Date.now()}_${safeName}`;

      await uploadBuffer(
        VIDEO_CONTAINER,
        filename,
        req.file.buffer,
        req.file.mimetype
      );

      await saveData((data) => {
        const videos = data.videos || [];
        const nextId = videos.length
          ? Math.max(...videos.map((v) => v.id || 0)) + 1
          : 1;

        videos.push({
          id: nextId,
          filename,
          thumbnail: null,
          title,
          description,
          likes: 0,
          views: 0,
          comments: [],
        });

        return { ...data, videos };
      });

      return res.json({ message: "Upload successful", filename });
    } catch (e) {
      return res.status(500).json({
        error: "Upload failed",
        details: String(e?.message || e),
      });
    }
  }
);

/* ===============================
   API Routes
================================ */

app.get("/api/videos", async (req, res) => {
  try {
    const { data } = await loadData();
    return res.json(data.videos || []);
  } catch {
    return res.status(500).json({ error: "Failed to load videos" });
  }
});

// FIX: add Accept-Ranges so browser can stream
app.get("/video/:filename", async (req, res) => {
  try {
    const resp = await downloadStream(
      VIDEO_CONTAINER,
      req.params.filename
    );

    res.setHeader(
      "Content-Type",
      resp.contentType || "application/octet-stream"
    );

    // Important for HTML5 video seeking/streaming
    res.setHeader("Accept-Ranges", "bytes");

    resp.readableStreamBody.pipe(res);
  } catch {
    return res.status(404).send("Not found");
  }
});

app.post("/api/like/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await saveData((data) => {
      const v = data.videos?.find((x) => Number(x.id) === id);
      if (v) v.likes++;
      return data;
    });
    res.json({ status: "ok" });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/view/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await saveData((data) => {
      const v = data.videos?.find((x) => Number(x.id) === id);
      if (v) v.views++;
      return data;
    });
    res.json({ status: "ok" });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/comment/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const text = (req.body?.text || "").trim();
    const user = (req.body?.username || "Anonymous").trim();

    if (!text) {
      return res.status(400).json({ error: "Empty comment" });
    }

    const sentiment = await analyzeSentiment(text);

    await saveData((data) => {
      const v = data.videos?.find((x) => Number(x.id) === id);
      if (v) {
        v.comments.push({
          user,
          text,
          sentiment,
          at: new Date().toISOString(),
        });
      }
      return data;
    });

    res.json({ status: "ok", sentiment });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

/* ===============================
   Start Server
================================ */

const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);

import "dotenv/config";
import express from "express";
import cors from "cors";
import progressController from "./controllers/progressController";
import videoController, {
  uploadMiddleware,
} from "./controllers/videoController";

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(cors());

// Routes - progress tracking
app.post("/api/video/track", progressController.trackProgress);
app.post("/api/video/sync", progressController.syncAndCalculate);
app.get("/api/video/resume", progressController.getResumeTime);
app.get("/api/video/watchtime", progressController.getWatchTime);

// Routes - video upload & streaming
app.get("/api/videos", videoController.listVideos);
app.post(
  "/api/videos/upload",
  uploadMiddleware,
  videoController.uploadVideo
);
app.post("/api/videos/:id/slides", uploadMiddleware, videoController.uploadSlides);
app.get("/api/videos/stream/:id/slides/:imageName", videoController.serveSlideImage);
app.get("/api/videos/:id/slides", videoController.getSlides);
app.delete("/api/videos/:id/slides", videoController.deleteSlides);
app.post("/api/videos/:id/slides/sync", videoController.syncSlides);
app.get(
  "/api/videos/stream/:id/playlist.m3u8",
  videoController.servePlaylist
);
app.get("/api/videos/stream/:id/:segment", videoController.serveSegment);
app.delete("/api/videos/:id", videoController.deleteVideo);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

// Background worker: run every 30 seconds
setInterval(() => {
  progressController.backgroundSyncWorker();
}, 30000);

// Start server
app.listen(PORT, () => {
  console.log(`Backend Running on Port ${PORT}!`);
});

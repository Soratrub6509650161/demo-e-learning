import { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";

type VideoStatus = "processing" | "ready" | "error";

interface StoredVideo {
  id: string;
  title: string;
  filename: string;
  hlsPath: string;
  m3u8Url: string;
  duration: number;
  uploadedAt: string;
  status: VideoStatus;
  error?: string;
  description?: string;
}

const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const videosJsonPath = path.join(uploadsDir, "videos.json");

// Ensure uploads dir exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

export const uploadMiddleware = multer({ storage }).single("file");

const readVideos = (): StoredVideo[] => {
  try {
    if (!fs.existsSync(videosJsonPath)) {
      return [];
    }
    const raw = fs.readFileSync(videosJsonPath, "utf-8");
    return JSON.parse(raw) as StoredVideo[];
  } catch (e) {
    console.error("Failed to read videos.json", e);
    return [];
  }
};

const writeVideos = (videos: StoredVideo[]): void => {
  fs.writeFileSync(videosJsonPath, JSON.stringify(videos, null, 2), "utf-8");
};

class VideoController {
  /**
   * GET /api/videos
   * List all videos (only ready ones are really usable by FE)
   */
  listVideos = (req: Request, res: Response): void => {
    const videos = readVideos();
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const result = videos.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description || "",
      duration: v.duration || 0,
      status: v.status,
      hlsUrl: `${baseUrl}${v.m3u8Url}`,
      uploadedAt: v.uploadedAt,
    }));

    res.json(result);
  };

  /**
   * POST /api/videos/upload
   * Upload video and start HLS conversion via ffmpeg
   */
  uploadVideo = (req: Request, res: Response): void => {
    const file = (req as any).file as Express.Multer.File | undefined;
    const { title, description } = req.body;

    if (!file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    const id = uuidv4();
    const videoDir = path.join(uploadsDir, id);

    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }

    const inputPath = file.path;
    const playlistPath = path.join(videoDir, "playlist.m3u8");
    const segmentPath = path.join(videoDir, "segment-%03d.ts");

    const m3u8Url = `/api/videos/stream/${id}/playlist.m3u8`;

    const videos = readVideos();
    const record: StoredVideo = {
      id,
      title: title || file.originalname,
      filename: file.originalname,
      hlsPath: videoDir,
      m3u8Url,
      duration: 0,
      uploadedAt: new Date().toISOString(),
      status: "processing",
      description,
    };
    videos.push(record);
    writeVideos(videos);

    const ffmpegArgs = [
      "-i",
      inputPath,
      "-codec:v",
      "libx264",
      "-codec:a",
      "aac",
      "-flags",
      "-global_header",
      "-map",
      "0",
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_list_size",
      "0",
      "-hls_segment_filename",
      segmentPath,
      playlistPath,
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let errorOutput = "";
    ffmpeg.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on("close", (code) => {
      const allVideos = readVideos();
      const idx = allVideos.findIndex((v) => v.id === id);
      if (idx === -1) return;

      if (code === 0) {
        allVideos[idx].status = "ready";
        allVideos[idx].error = undefined;
      } else {
        allVideos[idx].status = "error";
        allVideos[idx].error = `ffmpeg exited with code ${code}: ${errorOutput}`;
        console.error(allVideos[idx].error);
      }
      writeVideos(allVideos);
    });

    res.json({
      message: "Upload accepted, processing started",
      id,
      title: record.title,
      status: record.status,
      m3u8Url,
    });
  };

  /**
   * GET /api/videos/stream/:id/playlist.m3u8
   * Serve HLS playlist
   */
  servePlaylist = (req: Request, res: Response): void => {
    const { id } = req.params;
    const videoDir = path.join(uploadsDir, id);
    const playlistPath = path.join(videoDir, "playlist.m3u8");

    if (!fs.existsSync(playlistPath)) {
      res.status(404).send("Playlist not found");
      return;
    }

    res.sendFile(playlistPath);
  };

  /**
   * GET /api/videos/stream/:id/:segment
   * Serve TS segments
   */
  serveSegment = (req: Request, res: Response): void => {
    const { id, segment } = req.params;
    const segmentPath = path.join(uploadsDir, id, segment);

    if (!fs.existsSync(segmentPath)) {
      res.status(404).send("Segment not found");
      return;
    }

    res.sendFile(segmentPath);
  };

  /**
   * DELETE /api/videos/:id
   * Remove video record and files
   */
  deleteVideo = (req: Request, res: Response): void => {
    const { id } = req.params as { id: string };
    const videos = readVideos();
    const idx = videos.findIndex((v) => v.id === id);

    if (idx === -1) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    const videoDir = path.join(uploadsDir, id);

    // Remove from list
    videos.splice(idx, 1);
    writeVideos(videos);

    // Try to remove video directory (best-effort)
    if (fs.existsSync(videoDir)) {
      try {
        fs.rmSync(videoDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to delete video directory", e);
      }
    }

    res.json({ message: "Video deleted" });
  };
}

export default new VideoController();


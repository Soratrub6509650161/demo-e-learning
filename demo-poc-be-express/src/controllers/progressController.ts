import { Request, Response } from "express";
import { TrackRequest, SyncRequest, Interval, SyncResponse } from "../types";

class ProgressController {
  private static readonly MAX_VALID_INTERVAL = 30.0;

  // Mock Redis: store intervals temporarily for current session
  private mockRedis: Map<string, Interval[]> = new Map();

  // Mock Database: store resume time
  private mockDatabase: Map<string, number> = new Map();

  // Track last known time for each user-video
  private lastKnownTime: Map<string, number> = new Map();

  // All intervals database: store all intervals from all sessions (merged)
  private allIntervalsDatabase: Map<string, Interval[]> = new Map();

  /**
   * POST /api/video/track
   * Track a viewing interval
   */
  trackProgress = (req: Request<{}, {}, TrackRequest>, res: Response): void => {
    const { userId, videoId, from, to, currentTime } = req.body;
    const key = `${userId}_${videoId}`;

    // Initialize if not exists
    if (!this.mockRedis.has(key)) {
      this.mockRedis.set(key, []);
    }

    // Add interval to Redis
    this.mockRedis.get(key)!.push({ from, to });
    this.lastKnownTime.set(key, currentTime);

    console.log(`[Redis] Interval stored: ${from}s - ${to}s`);
    res.json({ message: "Tracked" });
  };

  /**
   * POST /api/video/sync
   * Sync intervals and calculate total watch time
   */
  syncAndCalculate = (
    req: Request<{}, {}, SyncRequest>,
    res: Response<SyncResponse>
  ): void => {
    const { userId, videoId, currentTime, videoDuration } = req.body;
    const key = `${userId}_${videoId}`;

    this.lastKnownTime.set(key, currentTime);

    const intervals = this.mockRedis.get(key) || [];

    if (intervals.length === 0) {
      this.mockDatabase.set(key, currentTime);
      res.json({ message: "No intervals, resume time saved" });
      return;
    }

    // Filter out seek intervals (duration > MAX_VALID_INTERVAL)
    const filtered = intervals.filter(
      (i) => i.to - i.from <= ProgressController.MAX_VALID_INTERVAL
    );

    // Initialize if not exists
    if (!this.allIntervalsDatabase.has(key)) {
      this.allIntervalsDatabase.set(key, []);
    }

    // Merge current session intervals with all previous sessions
    this.allIntervalsDatabase.get(key)!.push(...filtered);

    // Calculate total watch time with merging
    const totalWatchTime = this.mergeAndCalculate(
      this.allIntervalsDatabase.get(key)!
    );

    const duration = videoDuration > 0 ? videoDuration : 60.0;
    const isCompleted = (totalWatchTime / duration) * 100 >= 90.0;

    console.log("=====================================");
    console.log(`[Sync] Session intervals: ${filtered.length} intervals`);
    console.log(
      `[Sync] Total watch time (all sessions merged): ${totalWatchTime}s`
    );
    console.log(`[Sync] Video duration: ${duration}s`);
    console.log(`[DB] Resume time saved: ${currentTime}s`);
    console.log(`[DB] Completion status: ${isCompleted}`);
    console.log("=====================================");

    this.mockDatabase.set(key, currentTime);
    this.mockRedis.delete(key);

    res.json({
      message: "Synced",
      totalWatchTime,
      isCompleted,
      resumeTime: currentTime,
    });
  };

  /**
   * GET /api/video/resume
   * Get resume time for a user-video
   */
  getResumeTime = (req: Request, res: Response): void => {
    const { userId, videoId } = req.query;
    const key = `${userId}_${videoId}`;

    const savedTime = this.mockDatabase.get(key) || 0.0;
    console.log(`[DB] Resume time requested, returning: ${savedTime}s`);
    res.json(savedTime);
  };

  /**
   * GET /api/video/watchtime
   * Get total watch time for a user-video
   */
  getWatchTime = (req: Request, res: Response): void => {
    const { userId, videoId } = req.query;
    const key = `${userId}_${videoId}`;

    const allIntervals = this.allIntervalsDatabase.get(key) || [];
    let totalWatchTime = 0;

    if (allIntervals.length > 0) {
      totalWatchTime = this.mergeAndCalculate(allIntervals);
    }

    console.log(
      `[DB] Total watch time requested, returning: ${totalWatchTime}s`
    );
    res.json(totalWatchTime);
  };

  /**
   * Background worker: runs every 30 seconds to flush pending Redis data
   */
  backgroundSyncWorker = (): void => {
    if (this.mockRedis.size === 0) return;

    console.log(
      "\n[Worker] Waking up to flush pending Redis data...\n"
    );

    this.mockRedis.forEach((intervals, key) => {
      const filtered = intervals.filter(
        (i) => i.to - i.from <= ProgressController.MAX_VALID_INTERVAL
      );

      if (!this.allIntervalsDatabase.has(key)) {
        this.allIntervalsDatabase.set(key, []);
      }

      this.allIntervalsDatabase.get(key)!.push(...filtered);

      const totalWatchTime = this.mergeAndCalculate(
        this.allIntervalsDatabase.get(key)!
      );
      const resumeTime = this.lastKnownTime.get(key) || 0.0;

      this.mockDatabase.set(key, resumeTime);

      console.log(
        `[Worker] Saved user: ${key} (total merged watch time: ${totalWatchTime}s, resume: ${resumeTime}s)`
      );

      this.mockRedis.delete(key);
      this.lastKnownTime.delete(key);
    });

    console.log("[Worker] Done, going back to sleep\n");
  };

  /**
   * Merge overlapping intervals and calculate total duration
   */
  private mergeAndCalculate = (intervals: Interval[]): number => {
    if (intervals.length === 0) return 0.0;

    // Sort intervals by start time
    intervals.sort((a, b) => a.from - b.from);

    const merged: Interval[] = [];
    merged.push({ from: intervals[0].from, to: intervals[0].to });

    for (let i = 1; i < intervals.length; i++) {
      const current = merged[merged.length - 1];
      const next = intervals[i];

      if (current.to >= next.from) {
        // Overlapping: merge
        current.to = Math.max(current.to, next.to);
      } else {
        // Non-overlapping: add new interval
        merged.push({ from: next.from, to: next.to });
      }
    }

    // Sum up all merged interval durations
    return merged.reduce((sum, interval) => sum + (interval.to - interval.from), 0);
  };
}

export default new ProgressController();

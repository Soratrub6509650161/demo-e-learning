export interface TrackRequest {
  userId: string;
  videoId: string;
  from: number;
  to: number;
  currentTime: number;
}

export interface SyncRequest {
  userId: string;
  videoId: string;
  isEnded: boolean;
  currentTime: number;
  videoDuration: number;
}

export interface Interval {
  from: number;
  to: number;
}

export interface SyncResponse {
  message: string;
  totalWatchTime?: number;
  isCompleted?: boolean;
  resumeTime?: number;
}

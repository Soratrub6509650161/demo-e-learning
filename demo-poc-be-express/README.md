# Demo E-Learning Backend - Express.js + TypeScript

Express.js backend with TypeScript for video progress tracking system.

## Features

- **Video Progress Tracking**: Track user viewing intervals
- **Watch Time Calculation**: Calculate total watch time across multiple sessions
- **Resume Functionality**: Save and retrieve resume times
- **Completion Detection**: Identify when videos are 90% watched
- **Interval Merging**: Prevent duplicate counting for overlapping viewing intervals
- **Seek Detection**: Filter out seek actions (large time jumps)
- **Background Worker**: Auto-sync pending data every 30 seconds

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Server will start on port 8080

## Build

```bash
npm run build
```

## Production

```bash
npm start
```

## API Endpoints

### POST /api/video/track
Track a viewing interval
```json
{
  "userId": "user123",
  "videoId": "video456",
  "from": 10,
  "to": 30,
  "currentTime": 30
}
```

### POST /api/video/sync
Sync and calculate total watch time
```json
{
  "userId": "user123",
  "videoId": "video456",
  "currentTime": 50,
  "videoDuration": 100,
  "isEnded": false
}
```

### GET /api/video/resume?userId=user123&videoId=video456
Get resume time

### GET /api/video/watchtime?userId=user123&videoId=video456
Get total watch time

## Data Storage

- **Mock Redis**: Temporary session interval storage
- **Mock Database**: Persistent resume time and merged watch data
- **Background Worker**: Auto-syncs Redis to Database every 30 seconds

## Differences from Java Backend

- Same API endpoints and functionality
- Same data structures and algorithms
- Same 30-second background worker interval
- Interval merging and seek filtering identical
- 90% completion threshold maintained

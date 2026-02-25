<template>
  <div style="max-width: 800px; margin: auto; text-align: center; font-family: sans-serif;">
    <h2>🎥 E-Learning Video Player</h2>
    <p v-if="title" style="color: #ddd; margin-bottom: 8px;">{{ title }}</p>
    
    <video 
      ref="videoRef"
      width="100%" 
      controls
      @play="handlePlay"
      @pause="handlePause"
      @seeking="handleSeeking"
      @seeked="handleSeeked"
      @ended="handleEnded"
    ></video>
    
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import axios from 'axios';
import Hls from 'hls.js';

const props = defineProps({
  userId: {
    type: String,
    default: 'user_01'
  },
  videoId: {
    type: String,
    required: true
  },
  videoSrc: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ''
  }
});

const videoRef = ref(null);
const userId = props.userId;
const videoId = props.videoId;

let fromTime = 0;
let heartbeatInterval = null;
let isSeeking = false;
let seekDebounceTimer = null;

const MAX_VALID_INTERVAL = 30;

const sendTrackingData = async () => {
  if (!videoRef.value) return;
  if (isSeeking) return;

  const currentTime = videoRef.value.currentTime;
  const gap = currentTime - fromTime;

  if (gap > MAX_VALID_INTERVAL) {
    console.log(`⚠️ [Skip] Gap too large (${gap.toFixed(1)}s), likely from seek — not tracked`);
    fromTime = currentTime;
    return;
  }

  if (currentTime !== fromTime) {
    await axios.post('http://localhost:8080/api/video/track', {
      userId, videoId, from: fromTime, to: currentTime, currentTime
    });
    console.log(`📤 [Redis] Tracked: ${fromTime.toFixed(1)}s - ${currentTime.toFixed(1)}s`);
    fromTime = currentTime;
  }
};

const handlePlay = () => {
  fromTime = videoRef.value.currentTime;
  heartbeatInterval = setInterval(sendTrackingData, 5000);
  console.log("▶️ Video started (Heartbeat started)");
};

const handlePause = () => {
  if (isSeeking) return;
  clearInterval(heartbeatInterval);
  sendTrackingData();
  console.log("⏸️ Video paused");
};

const handleSeeking = () => {
  isSeeking = true;
  clearInterval(heartbeatInterval);
  clearTimeout(seekDebounceTimer);
};

const handleSeeked = () => {
  clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    isSeeking = false;
    const currentTime = videoRef.value.currentTime;
    fromTime = currentTime;
    console.log(`⏩ Seeked to: ${currentTime.toFixed(1)}s`);

    axios.post('http://localhost:8080/api/video/sync', {
      userId, videoId, isEnded: false, currentTime
    }).catch(err => console.error("Failed to sync after seek", err));
  }, 300);
};

const syncAndCalculate = async (isEnded) => {
  await sendTrackingData();
  const current = videoRef.value ? videoRef.value.currentTime : 0;
  const duration = videoRef.value ? videoRef.value.duration : 0;

  await axios.post('http://localhost:8080/api/video/sync', {
    userId, videoId, isEnded, currentTime: current, videoDuration: duration
  });
  console.log(`⚡ [DB] Sync sent (isEnded: ${isEnded})`);
};

const handleEnded = () => {
  console.log("✅ Video ended");
  syncAndCalculate(true);
};

const forceExit = () => {
  console.log("🚪 User exited the page");
  syncAndCalculate(false);
};

const handleBeforeUnload = () => {
  const current = videoRef.value ? videoRef.value.currentTime : 0;
  fetch('http://localhost:8080/api/video/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, videoId, isEnded: false, currentTime: current }),
    keepalive: true
  });
};

onBeforeUnmount(() => {
  clearInterval(heartbeatInterval);
  clearTimeout(seekDebounceTimer);
  syncAndCalculate(false);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

onMounted(async () => {
  const video = videoRef.value;
  const videoSrc = props.videoSrc;

  window.addEventListener('beforeunload', handleBeforeUnload);

  let savedTime = 0;
  try {
    const response = await axios.get(`http://localhost:8080/api/video/resume?userId=${userId}&videoId=${videoId}`);
    savedTime = response.data;
    if (savedTime > 0) {
      console.log(`📥 [System] Resume history found, jumping to ${savedTime.toFixed(1)}s`);
      fromTime = savedTime;
    }
  } catch (error) {
    console.error("Failed to fetch resume time", error);
  }

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(videoSrc);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (savedTime > 0) video.currentTime = savedTime;
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = videoSrc;
    video.addEventListener('loadedmetadata', () => {
      if (savedTime > 0) video.currentTime = savedTime;
    });
  }
});
</script>
<template>
  <div class="player-wrapper">
    <div class="player-inner">

      <!-- Top bar: title + sync button -->
      <div class="top-bar">
        <p v-if="title" class="player-title">{{ title }}</p>
        <button @click="toggleSync" class="btn btn-blue">
          {{ showSync ? 'ปิด Sync Slides' : 'Sync Slides กับ Video' }}
        </button>
      </div>

      <!-- ── Main row: video (ซ้าย 60%) + slide (ขวา 40%) ── -->
      <div class="content-row">

        <!-- Video -->
        <div class="video-col">
          <video
            ref="videoRef"
            controls
            @play="handlePlay"
            @pause="handlePause"
            @seeking="handleSeeking"
            @seeked="handleSeeked"
            @ended="handleEnded"
            @timeupdate="handleTimeUpdate"
          ></video>
        </div>

        <!-- Slide -->
        <div class="slide-col slide-col-bg">
          <template v-if="currentSlideUrl || pdfMode">
            <!-- IMG mode: แสดงรูปเมื่อโหลดเสร็จแล้วเท่านั้น (ซ่อนด้วย overlay จน img fire @load) -->
            <template v-if="!pdfMode">
              <div class="slide-img-wrap" :class="{ 'slide-img-loaded': firstSlideImageLoaded }">
                <img
                  v-if="currentSlideUrl"
                  :key="currentSlideUrl"
                  :src="currentSlideUrl"
                  alt="slide"
                  class="slide-img"
                  @load="firstSlideImageLoaded = true"
                />
                <div v-show="currentSlideUrl && !firstSlideImageLoaded" class="slide-img-overlay" aria-hidden="true">
                  <span>กำลังโหลดสไลด์...</span>
                </div>
              </div>
            </template>

            <!-- PDF/Canvas mode: ref ต้องไม่หาย จึงใช้ CSS class transition แทน -->
            <canvas
              v-if="pdfMode"
              ref="pdfCanvasRef"
              class="slide-canvas"
              :class="{ 'slide-transitioning': isSlideTransitioning }"
            ></canvas>
          </template>

          <!-- โหลดสไลด์อยู่ -->
          <div v-else-if="!slidesReady" class="slide-placeholder slide-loading">
            <span>กำลังโหลดสไลด์...</span>
          </div>
          <!-- โหลดเสร็จแล้วแต่ไม่มีสไลด์ -->
          <div v-else class="slide-placeholder">
            <span>ยังไม่มีสไลด์</span>
          </div>
        </div>

      </div><!-- /.content-row -->

      <!-- ── Sync Panel (เต็มความกว้าง ด้านล่าง) ── -->
      <div v-if="showSync" class="sync-panel">
        <div class="sync-box">
          <div class="sync-box-title">ซิงก์สไลด์กับเวลาในวิดีโอ</div>

          <div class="upload-row">
            <input ref="slideFileInput" type="file" accept="application/pdf" class="file-input" />
            <button @click="uploadSlides" :disabled="syncSubmitting" class="btn btn-green">
              {{ syncSubmitting ? 'กำลังอัปโหลด...' : 'อัปโหลดสไลด์ PDF' }}
            </button>
          </div>

          <div v-if="slides.length" class="slide-nav">
            <button @click="prevSlide" class="btn btn-gray">← ก่อนหน้า</button>
            <span class="slide-counter">หน้า {{ selectedIndex + 1 }} / {{ slides.length }}</span>
            <button @click="nextSlide" class="btn btn-gray">ถัดไป →</button>
            <span class="slide-mode-badge" :class="pdfMode ? 'mode-pdf' : 'mode-image'">
              {{ pdfMode ? 'โหมด PDF' : 'โหมดภาพ (PNG)' }}
            </span>
          </div>

          <div v-if="slides.length" class="slide-time-label">ตั้งเวลาให้แต่ละหน้า</div>

          <div v-if="slides.length" class="slide-list">
            <div v-for="s in slides" :key="s.page" class="slide-row">
              <div class="slide-page-label">หน้า {{ s.page }}</div>
              <input
                type="number"
                min="0"
                step="0.1"
                v-model.number="s.timestamp"
                class="timestamp-input"
              />
              <button @click="setTimestampFromVideo(s.page)" class="btn btn-blue">ใช้เวลาวิดีโอ</button>
            </div>
          </div>

          <div v-if="slides.length" class="sync-actions">
            <button @click="saveSync" :disabled="syncSubmitting" class="btn btn-blue">บันทึกการซิงก์</button>
            <button @click="fetchSlides" class="btn btn-gray">รีเฟรชสไลด์</button>
            <button @click="deleteSlides" :disabled="syncSubmitting" class="btn btn-red">ลบสไลด์</button>
          </div>

          <p v-if="syncErrorMessage" class="error-msg">{{ syncErrorMessage }}</p>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import axios from 'axios';
import Hls from 'hls.js';

const props = defineProps({
  userId: { type: String, default: 'user_01' },
  videoId: { type: String, required: true },
  videoSrc: { type: String, required: true },
  title: { type: String, default: '' }
});

const videoRef = ref(null);
const userId = props.userId;
const videoId = props.videoId;

const showSync = ref(false);
const slides = ref([]);
const currentSlideUrl = ref('');
const slideFileInput = ref(null);
const syncSubmitting = ref(false);
const syncErrorMessage = ref('');
const pdfMode = ref(false);
const pdfCanvasRef = ref(null);
const slidesReady = ref(false);
const firstSlideImageLoaded = ref(false);
const selectedIndex = ref(0);
const isSlideTransitioning = ref(false);

const BACKEND_BASE = 'http://localhost:8080';
let pdfDoc = null;
let lastRenderedPage = 0;
let currentSlidePage = 0;
let fromTime = 0;
let heartbeatInterval = null;
let isSeeking = false;
let seekDebounceTimer = null;
let lastSlideUpdateTime = -1;

const MAX_VALID_INTERVAL = 30;

// ─── Tracking ────────────────────────────────────────────────

const sendTrackingData = async () => {
  if (!videoRef.value || isSeeking) return;
  const currentTime = videoRef.value.currentTime;
  const gap = currentTime - fromTime;
  if (gap > MAX_VALID_INTERVAL) { fromTime = currentTime; return; }
  if (currentTime !== fromTime) {
    await axios.post(`${BACKEND_BASE}/api/video/track`, {
      userId, videoId, from: fromTime, to: currentTime, currentTime
    });
    fromTime = currentTime;
  }
};

const handlePlay = () => {
  fromTime = videoRef.value.currentTime;
  heartbeatInterval = setInterval(sendTrackingData, 5000);
  updateCurrentSlide();
};

const handlePause = () => {
  if (isSeeking) return;
  clearInterval(heartbeatInterval);
  sendTrackingData();
  updateCurrentSlide();
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
    axios.post(`${BACKEND_BASE}/api/video/sync`, { userId, videoId, isEnded: false, currentTime }).catch(() => {});
    updateCurrentSlide();
  }, 300);
};

const syncAndCalculate = async (isEnded) => {
  await sendTrackingData();
  const current = videoRef.value ? videoRef.value.currentTime : 0;
  const duration = videoRef.value ? videoRef.value.duration : 0;
  await axios.post(`${BACKEND_BASE}/api/video/sync`, { userId, videoId, isEnded, currentTime: current, videoDuration: duration });
};

const handleEnded = () => { syncAndCalculate(true); };

/** บันทึกเวลาเมื่อออกจากหน้า (ปิดแท็บ/รีเฟรช หรือ กดย้อนกลับ) ใช้ fetch + keepalive เพื่อให้ส่งได้แม้กำลัง teardown */
const saveResumeTimeOnLeave = (current, duration = 0) => {
  const c = current ?? (videoRef.value ? videoRef.value.currentTime : 0);
  const d = duration ?? (videoRef.value ? videoRef.value.duration : 0);
  fetch(`${BACKEND_BASE}/api/video/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, videoId, isEnded: false, currentTime: c, videoDuration: d }),
    keepalive: true
  });
};

const handleBeforeUnload = () => {
  saveResumeTimeOnLeave();
};

const handleTimeUpdate = () => {
  const t = videoRef.value?.currentTime ?? 0;
  if (Math.abs(t - lastSlideUpdateTime) < 0.5) return;
  lastSlideUpdateTime = t;
  updateCurrentSlide();
};

// ─── Slides ──────────────────────────────────────────────────

const getImageUrl = (s) => {
  const url = s.imageUrl || '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) return `${BACKEND_BASE}${url}`;
  return url;
};

/** ทำให้ PDF URL เป็น full URL ของ backend เสมอ (ป้องกัน PDF.js โหลดผิด origin แล้วได้ HTML) */
const ensureFullPdfUrl = (pdfUrl) => {
  if (!pdfUrl) return `${BACKEND_BASE}/api/videos/stream/${videoId}/slides/presentation.pdf`;
  if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) return pdfUrl;
  return `${BACKEND_BASE}${pdfUrl.startsWith('/') ? '' : '/'}${pdfUrl}`;
};

const fetchSlides = async () => {
  try {
    const res = await axios.get(`${BACKEND_BASE}/api/videos/${videoId}/slides`);
    const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data.slides) ? res.data.slides : []);
    const pdfUrl = (!Array.isArray(res.data) && res.data.pdfUrl)
      ? res.data.pdfUrl
      : `${BACKEND_BASE}/api/videos/stream/${videoId}/slides/presentation.pdf`;

    if (!arr.length) {
      pdfMode.value = true;         
      await nextTick();             
      await loadPdfAndPrepareSlides(ensureFullPdfUrl(pdfUrl));
    } else if (arr.some(s => !s.imageUrl)) {
      pdfMode.value = true;          
      await nextTick();             
      await loadPdfAndPrepareSlides(ensureFullPdfUrl(pdfUrl));
      arr.forEach(s => {
        const idx = slides.value.findIndex(x => x.page === s.page);
        if (idx !== -1 && typeof s.timestamp === 'number') slides.value[idx].timestamp = s.timestamp;
      });
    } else {
      slides.value = arr;
      pdfMode.value = false;
      firstSlideImageLoaded.value = false;
    }
    selectedIndex.value = 0;
  } catch {
    slides.value = [];
  }
};

const uploadSlides = async () => {
  if (!slideFileInput.value?.files.length) return;
  const form = new FormData();
  form.append('file', slideFileInput.value.files[0]);
  syncSubmitting.value = true;
  try {
    const res = await axios.post(`${BACKEND_BASE}/api/videos/${videoId}/slides`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    const newSlides = Array.isArray(res.data?.slides) ? res.data.slides : [];
    const pdfUrl = res.data?.pdfUrl || `${BACKEND_BASE}/api/videos/stream/${videoId}/slides/presentation.pdf`;
    const hasImages = newSlides.length > 0 && newSlides.every(s => s.imageUrl);  // ✅ เช็คให้ครบ

    if (hasImages) {
      slides.value = newSlides;
      pdfMode.value = false;
      selectedIndex.value = 0;
      currentSlidePage = 0;
      await nextTick();
      showSelectedSlide();
    } else {
      pdfMode.value = true;          
      await nextTick();              
      await loadPdfAndPrepareSlides(ensureFullPdfUrl(pdfUrl));
      // ถ้า backend ส่ง timestamp มาด้วย ก็ merge เข้าไป
      newSlides.forEach(s => {
        const idx = slides.value.findIndex(x => x.page === s.page);
        if (idx !== -1 && typeof s.timestamp === 'number') slides.value[idx].timestamp = s.timestamp;
      });
    }

    slideFileInput.value.value = '';
    syncErrorMessage.value = '';
  } catch {
    syncErrorMessage.value = 'อัปโหลด/แปลงสไลด์ไม่สำเร็จ กรุณาตรวจสอบเซิร์ฟเวอร์';
  } finally {
    syncSubmitting.value = false;
  }
};

const loadPdfAndPrepareSlides = async (pdfUrl) => {
  const lib = window['pdfjsLib'];
  pdfDoc = await lib.getDocument(pdfUrl).promise;
  slides.value = Array.from({ length: pdfDoc.numPages }, (_, i) => ({ page: i + 1, imageUrl: '', timestamp: null }));
  selectedIndex.value = 0;
  lastRenderedPage = 0;   
  currentSlidePage = 0;   
  await nextTick();        
  await renderPageToCanvas(1);
  await generateThumbnailsFromPdf();
};

const renderPageToCanvas = async (pageNum) => {
  if (!pdfDoc || !pdfCanvasRef.value || lastRenderedPage === pageNum) return;
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.2 });
  const canvas = pdfCanvasRef.value;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  lastRenderedPage = pageNum;
};

const generateThumbnailsFromPdf = async () => {
  if (!pdfDoc) return;
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const base = page.getViewport({ scale: 1.0 });
    const scale = Math.min(1.0, 160 / base.width);
    const viewport = page.getViewport({ scale });
    const off = document.createElement('canvas');
    off.width = viewport.width; off.height = viewport.height;
    await page.render({ canvasContext: off.getContext('2d'), viewport }).promise;
    const idx = slides.value.findIndex(s => s.page === i);
    if (idx !== -1) slides.value[idx].imageUrl = off.toDataURL('image/png');
  }
};

// img → Vue transition ผ่าน :key
// canvas → CSS class transition (ref ต้องไม่ถูก destroy)
const applySlideDisplay = async (s, skipTransition = false) => {
  if (!s) return;
  if (s.page === currentSlidePage) return;
  currentSlidePage = s.page;

  if (pdfMode.value) {
    if (!skipTransition) {
      isSlideTransitioning.value = true;
      await new Promise(r => setTimeout(r, 250));
      await nextTick();
    }
    await renderPageToCanvas(s.page);
    isSlideTransitioning.value = false;
  } else {
    if (!skipTransition) firstSlideImageLoaded.value = false;
    currentSlideUrl.value = getImageUrl(s);
  }
};

const prevSlide = () => {
  if (!slides.value.length) return;
  selectedIndex.value = Math.max(0, selectedIndex.value - 1);
  applySlideDisplay(slides.value[selectedIndex.value]);
};

const nextSlide = () => {
  if (!slides.value.length) return;
  selectedIndex.value = Math.min(slides.value.length - 1, selectedIndex.value + 1);
  applySlideDisplay(slides.value[selectedIndex.value]);
};

const showSelectedSlide = () => { applySlideDisplay(slides.value[selectedIndex.value], true); };

const toggleSync = () => {
  showSync.value = !showSync.value;
  if (showSync.value) fetchSlides().then(showSelectedSlide);
};

const handleKeyDown = (e) => {
  if (!showSync.value) return;
  const tag = e.target?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); nextSlide(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(); }
};

const setTimestampFromVideo = (page) => {
  if (!videoRef.value) return;
  const idx = slides.value.findIndex(s => s.page === page);
  if (idx !== -1) slides.value[idx].timestamp = Number(videoRef.value.currentTime.toFixed(1));
};

const saveSync = async () => {
  syncSubmitting.value = true;
  try {
    const res = await axios.post(`${BACKEND_BASE}/api/videos/${videoId}/slides/sync`, {
      slides: slides.value
        .map(s => ({ page: s.page, timestamp: typeof s.timestamp === 'number' ? s.timestamp : null }))
        .filter(x => typeof x.timestamp === 'number' && x.timestamp >= 0)
    });
    if (res.data?.slides) slides.value = res.data.slides;
  } catch {} finally {
    syncSubmitting.value = false;
  }
};

const deleteSlides = async () => {
  if (!confirm('ต้องการลบสไลด์ทั้งหมดของวิดีโอนี้หรือไม่? หลังลบสามารถอัปโหลดไฟล์ใหม่ได้')) return;
  syncSubmitting.value = true;
  syncErrorMessage.value = '';
  try {
    await axios.delete(`${BACKEND_BASE}/api/videos/${videoId}/slides`);
    slides.value = [];
    pdfMode.value = false;
    currentSlideUrl.value = '';
    pdfDoc = null;
    selectedIndex.value = 0;
  } catch {
    syncErrorMessage.value = 'ลบสไลด์ไม่สำเร็จ';
  } finally {
    syncSubmitting.value = false;
  }
};

const updateCurrentSlide = () => {
  if (!slides.value.length || !videoRef.value) { currentSlideUrl.value = ''; return; }
  if (showSync.value) { showSelectedSlide(); return; }

  const t = videoRef.value.currentTime;
  const candidates = slides.value.filter(s => typeof s.timestamp === 'number' && s.timestamp <= t);
  const s = candidates.length
    ? candidates.reduce((a, b) => a.timestamp > b.timestamp ? a : b)
    : slides.value[0];

  const isInitial = currentSlidePage === 0;
  applySlideDisplay(s, isInitial);
};

// ─── Lifecycle ───────────────────────────────────────────────

onBeforeUnmount(() => {
  const current = videoRef.value ? videoRef.value.currentTime : 0;
  const duration = videoRef.value ? videoRef.value.duration : 0;
  saveResumeTimeOnLeave(current, duration);
  clearInterval(heartbeatInterval);
  clearTimeout(seekDebounceTimer);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('popstate', handlePopState);
  window.removeEventListener('keydown', handleKeyDown);
});

const handlePopState = () => {
  const current = videoRef.value ? videoRef.value.currentTime : 0;
  const duration = videoRef.value ? videoRef.value.duration : 0;
  saveResumeTimeOnLeave(current, duration);
};

onMounted(async () => {
  const video = videoRef.value;
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('popstate', handlePopState);
  window.addEventListener('keydown', handleKeyDown);

  let savedTime = 0;
  try {
    const res = await axios.get(`${BACKEND_BASE}/api/video/resume?userId=${userId}&videoId=${videoId}`);
    savedTime = res.data;
    if (savedTime > 0) fromTime = savedTime;
  } catch {}

  await fetchSlides();
  updateCurrentSlide();
  slidesReady.value = true;

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(props.videoSrc);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (savedTime > 0) video.currentTime = savedTime;
      updateCurrentSlide();
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = props.videoSrc;
    video.addEventListener('loadedmetadata', () => {
      if (savedTime > 0) video.currentTime = savedTime;
      updateCurrentSlide();
    });
  }
});
</script>

<style scoped>
/* ─── Wrapper ─────────────────────────────────────────────── */
.player-wrapper {
  width: 100%;
  font-family: sans-serif;
  box-sizing: border-box;
}

.player-inner {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  box-sizing: border-box;
}

/* ─── Top bar ─────────────────────────────────────────────── */
.top-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0 12px;
}

.player-title {
  color: #ddd;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

/* ปุ่ม sync ลอยชิดขวา โดยไม่ดัน title ออกจากกลาง */
.top-bar .btn {
  position: absolute;
  right: 0;
}

/* ─── Main content row ────────────────────────────────────── */
.content-row {
  display: flex;
  gap: 12px;
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.content-row::-webkit-scrollbar {
  display: none;
}

/* Video: 50% */
.video-col {
  flex: 0 0 calc(50% - 6px);
  min-width: 320px;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.video-col video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

/* Slide: 50% */
.slide-col {
  flex: 0 0 calc(50% - 6px);
  min-width: 320px;
  aspect-ratio: 16 / 9;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #374151;
  border-radius: 8px;
  background: #0f172a;
}
.slide-col-bg { background: #0f172a; }

.slide-img-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.slide-img-overlay {
  position: absolute;
  inset: 0;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 13px;
  transition: opacity 0.2s ease;
}
.slide-img-wrap.slide-img-loaded .slide-img-overlay {
  opacity: 0;
  pointer-events: none;
}

.slide-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.slide-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.slide-canvas.slide-transitioning {
  opacity: 0;
  transform: scale(0.97);
}

.slide-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 13px;
}
.slide-placeholder.slide-loading {
  color: #9ca3af;
}

/* ─── Slide transition (img mode) ────────────────────────── */
.slide-fade-enter-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.slide-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(1.01);
}

/* ─── Sync Panel ──────────────────────────────────────────── */
.sync-panel {
  margin-top: 16px;
  text-align: left;
}

.sync-box {
  padding: 14px;
  border: 1px solid #374151;
  border-radius: 8px;
  background: #0f172a;
}

.sync-box-title {
  font-weight: 600;
  margin-bottom: 10px;
  color: #e2e8f0;
}

.upload-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.file-input { flex: 1; min-width: 0; }

.slide-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.slide-counter { font-size: 12px; color: #ddd; }
.slide-mode-badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
.slide-mode-badge.mode-image { background: #065f46; color: #6ee7b7; }
.slide-mode-badge.mode-pdf   { background: #1e3a5f; color: #93c5fd; }
.slide-time-label { font-size: 12px; color: #aaa; margin-bottom: 8px; }

.slide-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.slide-row { display: flex; gap: 8px; align-items: center; }

.slide-page-label { font-size: 12px; width: 60px; flex-shrink: 0; color: #cbd5e1; }

.timestamp-input {
  flex: 1;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #374151;
  background: #1e293b;
  color: #fff;
}

.sync-actions { margin-top: 12px; display: flex; gap: 8px; }

.error-msg { color: #fb7185; margin-top: 10px; }

/* ─── Buttons ─────────────────────────────────────────────── */
.btn {
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.btn-blue  { background: #3b82f6; color: #fff; }
.btn-green { background: #10b981; color: #fff; }
.btn-gray  { background: #6b7280; color: #fff; }
.btn-red   { background: #ef4444; color: #fff; }

.btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* มือถือ: scroll ซ้ายขวาได้ ไม่ต้องเพิ่ม media query */
</style>
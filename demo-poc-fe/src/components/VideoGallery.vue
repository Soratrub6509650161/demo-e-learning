<template>
  <div style="max-width: 1000px; margin: 0 auto; padding: 24px; font-family: sans-serif; color: #fff;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0;">📚 คอร์สวิดีโอทั้งหมด</h2>
      <router-link
        to="/upload"
        style="padding: 8px 14px; border-radius: 999px; border: 1px solid #4b5563; text-decoration: none; color: #e5e7eb; background: #020617; font-size: 14px;"
      >
        + อัพโหลดวิดีโอใหม่
      </router-link>
    </div>

    <!-- Video list -->
    <div v-if="videos.length" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px;">
      <div
        v-for="video in videos"
        :key="video.id"
        :style="cardStyle(video)"
      >
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <div
            style="width: 100px; height: 60px; background: #111827; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #aaa; border-radius: 8px;"
          >
            {{ video.duration ? formatDuration(video.duration) : 'Preview' }}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 2px;">{{ video.title }}</div>
            <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">
              {{ video.description || 'ไม่มีคำอธิบาย' }}
            </div>
            <div style="font-size: 11px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span v-if="video.status === 'ready'" style="color: #4ade80;">พร้อมเล่น</span>
                <span v-else-if="video.status === 'processing'" style="color: #facc15;">กำลังประมวลผล</span>
                <span v-else style="color: #fb7185;">เกิดข้อผิดพลาด</span>
              </div>
              <button
                v-if="video.id !== 'video_preview'"
                @click="handleDelete(video)"
                style="padding: 2px 6px; border-radius: 999px; border: 1px solid #b91c1c; background: #111827; color: #fecaca; font-size: 10px; cursor: pointer;"
              >
                ลบวิดีโอ
              </button>
            </div>
            <router-link
              v-if="video.status === 'ready'"
              :to="{
                name: 'course-detail',
                params: { id: video.id },
                query: { src: video.hlsUrl, title: video.title }
              }"
              style="display: inline-block; padding: 6px 10px; border-radius: 999px; background: #3b82f6; color: #fff; font-size: 12px; text-decoration: none;"
            >
              เข้าเรียน
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <p v-else-if="!loading" style="color: #aaa; text-align: center; margin-top: 16px;">
      ยังไม่มีวิดีโอในระบบ
    </p>

    <p v-if="error" style="color: #ff8080; margin-top: 16px; text-align: center;">
      {{ error }}
    </p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import axios from 'axios';

const videos = ref([]);
const loading = ref(false);
const error = ref('');

const fetchVideos = async () => {
  loading.value = true;
  error.value = '';
  try {
    const res = await axios.get('http://localhost:8080/api/videos');
    const previewVideo = {
      id: 'video_preview',
      title: 'ตัวอย่างคอร์ส HLS Demo',
      description: 'วิดีโอตัวอย่างสำหรับทดสอบระบบ tracking (HLS)',
      duration: 0,
      hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      status: 'ready'
    };
    const apiVideos = res.data || [];
    videos.value = [previewVideo, ...apiVideos];
  } catch (e) {
    console.error(e);
    error.value = 'โหลดรายการวิดีโอจากเซิร์ฟเวอร์ไม่สำเร็จ (ใช้ข้อมูลทดสอบแทน)';
    // fallback demo data เฉพาะ preview HLS
    videos.value = [
      {
        id: 'video_preview',
        title: 'ตัวอย่างคอร์ส HLS Demo',
        description: 'วิดีโอตัวอย่างสำหรับทดสอบระบบ tracking (HLS)',
        duration: 0,
        hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        status: 'ready'
      }
    ];
    selectedVideo.value = videos.value[0] || null;
  } finally {
    loading.value = false;
  }
};

const cardStyle = (video) => ({
  padding: '10px 10px',
  borderRadius: '6px',
  background: '#020617',
  border: '1px solid #374151'
});

const formatDuration = (seconds) => {
  const sec = Math.floor(seconds || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const handleDelete = async (video) => {
  if (video.id === 'video_preview') return;
  const ok = window.confirm(`ต้องการลบวิดีโอ "${video.title}" จริงหรือไม่?`);
  if (!ok) return;

  try {
    await axios.delete(`http://localhost:8080/api/videos/${video.id}`);
    // ลบออกจาก list ในหน้า
    videos.value = videos.value.filter(v => v.id !== video.id);
  } catch (e) {
    console.error(e);
    alert('ลบวิดีโอไม่สำเร็จ กรุณาลองใหม่');
  }
};

onMounted(fetchVideos);
</script>


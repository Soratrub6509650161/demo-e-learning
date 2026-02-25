<template>
  <div style="max-width: 800px; margin: 0 auto; padding: 24px; font-family: sans-serif; color: #fff;">
    <div style="margin-bottom: 16px;">
      <router-link
        to="/"
        style="color: #93c5fd; font-size: 14px; text-decoration: none;"
      >
        ← กลับไปหน้ารายการคอร์ส
      </router-link>
    </div>

    <h2 style="margin-bottom: 24px;">⬆️ อัพโหลดวิดีโอคอร์สใหม่</h2>

    <VideoUpload />
  </div>
</template>

<script setup>
import VideoUpload from '../components/VideoUpload.vue';
</script>


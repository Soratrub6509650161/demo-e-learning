<template>
  <div style="max-width: 600px; margin: 0 auto; padding: 24px; font-family: sans-serif; color: #fff;">
    <h2 style="text-align: center; margin-bottom: 24px;">⬆️ อัพโหลดวิดีโอสอน</h2>

    <form @submit.prevent="handleSubmit" style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; margin-bottom: 6px;">ชื่อวิดีโอ</label>
        <input
          v-model="title"
          type="text"
          required
          style="width: 100%; padding: 8px 10px; border-radius: 4px; border: 1px solid #4b5563; background: #111827; color: #fff;"
        />
      </div>

      <div>
        <label style="display: block; margin-bottom: 6px;">คำอธิบาย (ไม่บังคับ)</label>
        <textarea
          v-model="description"
          rows="3"
          style="width: 100%; padding: 8px 10px; border-radius: 4px; border: 1px solid #4b5563; background: #111827; color: #fff;"
        ></textarea>
      </div>

      <div>
        <label style="display: block; margin-bottom: 6px;">ไฟล์วิดีโอ</label>
        <input
          ref="fileInput"
          type="file"
          accept="video/*"
          required
          style="width: 100%;"
        />
      </div>

      <button
        type="submit"
        :disabled="submitting"
        style="margin-top: 8px; padding: 10px 14px; border-radius: 6px; border: none; cursor: pointer; background: #3b82f6; color: #fff; font-weight: 600;"
      >
        {{ submitting ? 'กำลังอัพโหลด...' : 'อัพโหลดวิดีโอ' }}
      </button>
    </form>

    <p v-if="successMessage" style="color: #4ade80; margin-top: 16px; text-align: center;">
      {{ successMessage }}
    </p>
    <p v-if="errorMessage" style="color: #fb7185; margin-top: 16px; text-align: center;">
      {{ errorMessage }}
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const title = ref('');
const description = ref('');
const submitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const fileInput = ref(null);

const resetForm = () => {
  title.value = '';
  description.value = '';
  if (fileInput.value) {
    fileInput.value.value = '';
  }
};

const handleSubmit = async () => {
  if (!fileInput.value || !fileInput.value.files.length) {
    errorMessage.value = 'กรุณาเลือกไฟล์วิดีโอก่อน';
    return;
  }

  const file = fileInput.value.files[0];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title.value);
  formData.append('description', description.value);

  submitting.value = true;
  successMessage.value = '';
  errorMessage.value = '';

  try {
    await axios.post('http://localhost:8080/api/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    successMessage.value = 'อัพโหลดวิดีโอสำเร็จ';
    resetForm();
  } catch (e) {
    console.error(e);
    errorMessage.value = 'อัพโหลดไม่สำเร็จ กรุณาลองใหม่ หรือตรวจสอบเซิร์ฟเวอร์';
  } finally {
    submitting.value = false;
  }
};
</script>


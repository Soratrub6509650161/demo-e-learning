import { createRouter, createWebHistory } from 'vue-router';
import VideoGallery from './components/VideoGallery.vue';
import VideoUploadPage from './views/VideoUploadPage.vue';
import VideoPlayer from './components/VideoPlayer.vue';

const routes = [
  {
    path: '/',
    name: 'courses',
    component: VideoGallery
  },
  {
    path: '/upload',
    name: 'upload',
    component: VideoUploadPage
  },
  {
    path: '/courses/:id',
    name: 'course-detail',
    component: VideoPlayer,
    props: route => ({
      userId: 'user_01',
      videoId: route.params.id,
      // videoSrc จะถูกตั้งค่าใหม่จาก query (HLS URL) ถ้ามี
      videoSrc: route.query.src,
      title: route.query.title
    })
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;


import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import DashboardView from './views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView, meta: { title: 'Dashboard' } },
    { path: '/practice', name: 'practice', component: () => import('./views/PracticeView.vue'), meta: { title: 'Practice' } },
    { path: '/analysis', name: 'analysis', component: () => import('./views/AnalysisView.vue'), meta: { title: 'Analysis' } },
    { path: '/library', name: 'library', component: () => import('./views/LibraryView.vue'), meta: { title: 'Library' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · VocalFlow` : 'VocalFlow'
})

createApp(App).use(router).mount('#app')

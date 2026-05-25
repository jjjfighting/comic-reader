import { renderLibrary, applyTheme } from './library.js';
import { renderComicList } from './comicList.js';
import { renderReader } from './reader.js';

const app = document.getElementById('app');

const savedTheme = localStorage.getItem('theme') || 'system';
applyTheme(savedTheme);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') {
    applyTheme('system');
  }
});

// Auto-update: detect new SW version and force reload
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  // Force check for SW update on every launch
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg) {
      reg.update();
    }
  });
}

function route() {
  const hash = window.location.hash || '#/';

  if (window.__readerCleanup && !hash.startsWith('#/reader/')) {
    window.__readerCleanup();
  }

  if (hash === '#/' || hash === '') {
    renderLibrary(app);
  } else if (hash.startsWith('#/list')) {
    const parts = hash.split('/');
    const categoryId = parts[2] || null;
    renderComicList(app, categoryId);
  } else if (hash.startsWith('#/reader/')) {
    const comicId = hash.split('/')[2];
    renderReader(app, comicId);
  } else {
    renderLibrary(app);
  }
}

window.addEventListener('hashchange', route);

route();

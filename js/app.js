import { renderLibrary, applyTheme } from './library.js';
import { renderComicList } from './comicList.js';
import { renderReader } from './reader.js';
import { renderNovelPage } from './novel.js';
import { renderNovelReader } from './novelReader.js';

const app = document.getElementById('app');

const savedTheme = localStorage.getItem('theme') || 'system';
applyTheme(savedTheme);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') {
    applyTheme('system');
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg) reg.update();
  });
}

function route() {
  const hash = window.location.hash || '#/';

  if (window.__readerCleanup && !hash.startsWith('#/reader/')) {
    window.__readerCleanup();
  }

  // Remove old tab bar when navigating to reader/novel-reader
  if (hash.startsWith('#/reader/') || hash.startsWith('#/novel-reader/')) {
    document.getElementById('tab-bar')?.remove();
  }

  if (hash === '#/' || hash === '') {
    renderLibrary(app);
  } else if (hash === '#/novel') {
    renderNovelPage(app);
  } else if (hash.startsWith('#/list')) {
    const parts = hash.split('/');
    const categoryId = parts[2] || null;
    renderComicList(app, categoryId);
  } else if (hash.startsWith('#/reader/')) {
    const comicId = hash.split('/')[2];
    renderReader(app, comicId);
  } else if (hash.startsWith('#/novel-reader/')) {
    const novelId = hash.split('/')[2];
    renderNovelReader(app, novelId);
  } else {
    renderLibrary(app);
  }
}

window.addEventListener('hashchange', route);

route();

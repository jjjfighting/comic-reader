import { getComic, getComicImageIds, getImageBlob, updateComic } from './db.js';

let saveTimer = null;
let loadedUrls = [];

export async function renderReader(app, comicId) {
  const comic = await getComic(comicId);
  if (!comic) {
    app.innerHTML = '<div class="empty-state"><p>漫画不存在</p></div>';
    return;
  }

  const imageIds = await getComicImageIds(comicId);

  // Width mode: full, narrow, extra-narrow
  const widthMode = localStorage.getItem('comic-width-mode') || 'full';
  const modeLabels = { full: '全宽', narrow: '窄图', xnarrow: '超窄' };

  function calcWidth(mode, scrollEl) {
    if (mode === 'full') return '100%';
    const viewportH = scrollEl.clientHeight;
    const slots = scrollEl.querySelectorAll('.reader-img-slot img');
    if (slots.length === 0) return mode === 'narrow' ? '80%' : '60%';
    // Average image height ratio (image height / viewport)
    let totalRatio = 0;
    let count = 0;
    slots.forEach(img => {
      totalRatio += img.clientHeight / viewportH;
      count++;
    });
    const avgRatio = count > 0 ? totalRatio / count : 1;
    const n = Math.round(1 / avgRatio); // images visible at full width
    if (mode === 'narrow') {
      return Math.max(30, Math.round(n / (n + 1) * 100)) + '%';
    } else {
      return Math.max(20, Math.round(n / (n + 2) * 100)) + '%';
    }
  }

  app.innerHTML = `
    <div class="reader-page" id="reader-page">
      <div class="reader-top-bar" id="reader-top">
        <button class="back-btn" id="reader-back">‹</button>
        <span class="title">${escapeHtml(comic.name)}</span>
      </div>
      <div class="reader-scroll" id="reader-scroll" style="visibility:hidden;">
        <div class="reader-images" id="reader-images" style="margin:0 auto;">
          ${imageIds.map((id, i) => `
            <div class="reader-img-slot" data-img-index="${i}" data-img-id="${id}">
              <div class="loading" style="height:400px;color:#666;">加载中...</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="reader-bottom-bar" id="reader-bottom">
        <div class="progress-bar"><div class="progress-fill" id="reader-progress" style="width:0%"></div></div>
        <div class="meta">
          <span id="reader-page-info">第 0/${imageIds.length} 页</span>
          <button class="reader-width-btn" id="reader-width-btn">${modeLabels[widthMode]}</button>
          <span id="reader-percent">0%</span>
        </div>
      </div>
    </div>
  `;

  const scrollEl = document.getElementById('reader-scroll');
  const progressEl = document.getElementById('reader-progress');
  const pageInfoEl = document.getElementById('reader-page-info');
  const percentEl = document.getElementById('reader-percent');
  const readerPage = document.getElementById('reader-page');

  document.getElementById('reader-back').onclick = () => {
    cleanupReader();
    window.history.back();
  };

  scrollEl.addEventListener('click', () => {
    readerPage.classList.toggle('bars-hidden');
  });

  // Width mode toggle
  const imagesEl = document.getElementById('reader-images');
  const widthBtn = document.getElementById('reader-width-btn');
  const modes = ['full', 'narrow', 'xnarrow'];
  let currentMode = modes.indexOf(widthMode);
  let fullModeAnchor = null; // remember position when leaving full mode

  function applyWidthMode(mode) {
    const w = calcWidth(mode, scrollEl);
    imagesEl.style.maxWidth = w;
    widthBtn.textContent = modeLabels[mode];
  }

  widthBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const oldMode = modes[currentMode];
    // Save anchor when leaving full mode
    if (oldMode === 'full') {
      fullModeAnchor = lastVisibleIndex;
    }
    currentMode = (currentMode + 1) % modes.length;
    const mode = modes[currentMode];
    localStorage.setItem('comic-width-mode', mode);
    applyWidthMode(mode);
    // When returning to full, restore the original anchor
    const targetIndex = (mode === 'full' && fullModeAnchor !== null) ? fullModeAnchor : lastVisibleIndex;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const slot = document.querySelector(`[data-img-index="${targetIndex}"]`);
        if (slot) slot.scrollIntoView({ block: 'start' });
      });
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const slot = document.querySelector(`[data-img-index="${targetIndex}"]`);
        if (slot) slot.scrollIntoView({ block: 'start' });
      });
    });
  });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const slot = entry.target;
        loadSlotImage(slot);
        observer.unobserve(slot);
      }
    }
  }, { root: scrollEl, rootMargin: '300px' });

  document.querySelectorAll('.reader-img-slot').forEach(slot => observer.observe(slot));

  let lastVisibleIndex = 0;
  scrollEl.addEventListener('scroll', () => {
    const slots = document.querySelectorAll('.reader-img-slot');
    const scrollRect = scrollEl.getBoundingClientRect();
    const viewportCenter = scrollRect.top + scrollRect.height / 3;

    let closestIndex = 0;
    let closestDist = Infinity;
    slots.forEach((slot, i) => {
      const rect = slot.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const dist = Math.abs(center - viewportCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    });

    if (closestIndex !== lastVisibleIndex) {
      lastVisibleIndex = closestIndex;
      const pct = imageIds.length > 0 ? Math.round((closestIndex + 1) / imageIds.length * 100) : 0;
      progressEl.style.width = pct + '%';
      pageInfoEl.textContent = `第 ${closestIndex + 1}/${imageIds.length} 页`;
      percentEl.textContent = pct + '%';
    }

    debouncedSave(comic, closestIndex, scrollEl.scrollTop);
  });

  // Restore scroll position (content is hidden until positioned)
  if (comic.lastReadImageIndex > 0 && imageIds.length > 0) {
    const targetSlot = document.querySelector(`[data-img-index="${Math.min(comic.lastReadImageIndex, imageIds.length - 1)}"]`);
    if (targetSlot) {
      const waitForImage = () => {
        return new Promise(resolve => {
          const check = () => {
            if (targetSlot.querySelector('img')) resolve();
            else setTimeout(check, 100);
          };
          check();
        });
      };
      loadSlotImage(targetSlot);
      observer.unobserve(targetSlot);
      await waitForImage();
      targetSlot.scrollIntoView({ block: 'start' });
    }
  }

  // Show content after position is set
  scrollEl.style.visibility = 'visible';

  // Apply initial width mode after images are loaded
  if (widthMode !== 'full') {
    setTimeout(() => applyWidthMode(widthMode), 200);
  }

  // Update initial progress display
  lastVisibleIndex = comic.lastReadImageIndex || 0;
  const initialPct = imageIds.length > 0 ? Math.round((lastVisibleIndex + 1) / imageIds.length * 100) : 0;
  progressEl.style.width = initialPct + '%';
  pageInfoEl.textContent = `第 ${lastVisibleIndex + 1}/${imageIds.length} 页`;
  percentEl.textContent = initialPct + '%';

  const visHandler = () => {
    if (document.visibilityState === 'hidden') {
      saveProgressNow(comic, lastVisibleIndex, scrollEl.scrollTop);
    }
  };
  document.addEventListener('visibilitychange', visHandler);

  window.addEventListener('beforeunload', beforeUnloadHandler);

  function beforeUnloadHandler() {
    saveProgressNow(comic, lastVisibleIndex, scrollEl.scrollTop);
  }

  window.__readerCleanup = () => {
    document.removeEventListener('visibilitychange', visHandler);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    observer.disconnect();
    clearTimeout(saveTimer);
    cleanupReader();
  };

  comic.lastReadDate = new Date().toISOString();
  await updateComic(comic);
}

async function loadSlotImage(slot) {
  const imgId = slot.dataset.imgId;
  if (slot.dataset.loaded) return;
  slot.dataset.loaded = '1';

  const blob = await getImageBlob(imgId);
  if (!blob) {
    slot.innerHTML = '<div class="loading" style="height:200px;color:#666;">图片加载失败</div>';
    return;
  }

  const url = URL.createObjectURL(blob);
  loadedUrls.push(url);

  const img = document.createElement('img');
  img.src = url;
  img.loading = 'lazy';
  img.onload = () => {
    slot.innerHTML = '';
    slot.appendChild(img);
  };
  img.onerror = () => {
    slot.innerHTML = '<div class="loading" style="height:200px;color:#666;">加载失败</div>';
  };
}

function debouncedSave(comic, imageIndex, scrollTop) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveProgressNow(comic, imageIndex, scrollTop);
  }, 500);
}

async function saveProgressNow(comic, imageIndex, scrollTop) {
  comic.lastReadImageIndex = imageIndex;
  comic.lastReadScrollOffset = scrollTop;
  try {
    await updateComic(comic);
  } catch (e) {
    console.error('Failed to save progress', e);
  }
}

function cleanupReader() {
  for (const url of loadedUrls) {
    URL.revokeObjectURL(url);
  }
  loadedUrls = [];
  if (window.__readerCleanup) {
    delete window.__readerCleanup;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

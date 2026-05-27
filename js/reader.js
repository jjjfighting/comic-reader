import { getComic, getComicImageIds, getImageBlob, getZipBlob, updateComic } from './db.js';

let saveTimer = null;
let loadedUrls = [];
let zipInstance = null;
let zipEntries = null;

export async function renderReader(app, comicId) {
  const comic = await getComic(comicId);
  if (!comic) {
    app.innerHTML = '<div class="empty-state"><p>漫画不存在</p></div>';
    return;
  }

  // Determine image source: ZIP-on-demand or legacy IndexedDB
  const isZipMode = !!comic.zipBlobKey;
  let imageIds = [];
  let totalCount = 0;

  if (isZipMode) {
    totalCount = comic.imagePaths.length;
    imageIds = comic.imagePaths.map((p, i) => `${i}`);
  } else {
    imageIds = await getComicImageIds(comicId);
    totalCount = imageIds.length;
  }

  // Width mode
  const widthMode = localStorage.getItem('comic-width-mode') || 'full';
  const smoothScroll = localStorage.getItem('comic-smoothScroll') !== 'false';
  const modeLabels = { full: '全宽', narrow: '窄图', xnarrow: '超窄' };
  const widthMap = { full: '100%', narrow: '80%', xnarrow: '60%' };

  app.innerHTML = `
    <div class="reader-page" id="reader-page">
      <div class="reader-top-bar" id="reader-top">
        <button class="back-btn" id="reader-back">‹</button>
        <span class="title">${escapeHtml(comic.name)}</span>
      </div>
      <div class="reader-scroll" id="reader-scroll" style="visibility:hidden;">
        <div class="reader-images" id="reader-images" style="max-width:${widthMap[widthMode]};margin:0 auto;">
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
          <span id="reader-page-info">第 0/${totalCount} 页</span>
          <button class="reader-width-btn" id="reader-width-btn">${modeLabels[widthMode]}</button>
          <button class="reader-width-btn" id="reader-smooth-btn">${smoothScroll ? '流畅' : '快速'}</button>
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

  // Load ZIP for on-demand mode
  if (isZipMode) {
    const zipBlob = await getZipBlob(comicId);
    if (zipBlob) {
      zipInstance = await JSZip.loadAsync(zipBlob);
      zipEntries = {};
      zipInstance.forEach((path, entry) => {
        if (!entry.dir) zipEntries[path] = entry;
      });
    }
  }

  document.getElementById('reader-back').onclick = () => {
    cleanupReader();
    window.history.back();
  };

  let pageSmooth = smoothScroll;

  scrollEl.addEventListener('click', (e) => {
    const barsHidden = readerPage.classList.contains('bars-hidden');
    if (!barsHidden) {
      readerPage.classList.toggle('bars-hidden');
      return;
    }
    const rect = scrollEl.getBoundingClientRect();
    const relY = (e.clientY - rect.top) / rect.height;
    const behavior = pageSmooth ? 'smooth' : 'instant';
    if (relY < 0.3) {
      scrollEl.scrollBy({ top: -scrollEl.clientHeight * 0.8, behavior });
    } else if (relY > 0.7) {
      scrollEl.scrollBy({ top: scrollEl.clientHeight * 0.8, behavior });
    } else {
      readerPage.classList.toggle('bars-hidden');
    }
  });

  // Width mode toggle
  const imagesEl = document.getElementById('reader-images');
  const widthBtn = document.getElementById('reader-width-btn');
  const modes = ['full', 'narrow', 'xnarrow'];
  let currentMode = modes.indexOf(widthMode);
  let fullModeAnchor = null;

  function applyWidthMode(mode) {
    imagesEl.style.maxWidth = widthMap[mode];
    widthBtn.textContent = modeLabels[mode];
  }

  widthBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const oldMode = modes[currentMode];
    if (oldMode === 'full') fullModeAnchor = lastVisibleIndex;
    currentMode = (currentMode + 1) % modes.length;
    const mode = modes[currentMode];
    localStorage.setItem('comic-width-mode', mode);
    applyWidthMode(mode);
    const targetIndex = (mode === 'full' && fullModeAnchor !== null) ? fullModeAnchor : lastVisibleIndex;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const slot = document.querySelector(`[data-img-index="${targetIndex}"]`);
        if (slot) slot.scrollIntoView({ block: 'start' });
      });
    });
  });

  // Smooth scroll toggle
  const smoothBtn = document.getElementById('reader-smooth-btn');
  smoothBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pageSmooth = !pageSmooth;
    localStorage.setItem('comic-smoothScroll', pageSmooth);
    smoothBtn.textContent = pageSmooth ? '流畅' : '快速';
  });

  // Image loading with buffer
  const BUFFER = 10;
  const renderedSlots = new Set();

  function ensureBuffer(centerIndex) {
    const start = Math.max(0, centerIndex - BUFFER);
    const end = Math.min(totalCount - 1, centerIndex + BUFFER);
    for (let i = start; i <= end; i++) {
      if (!renderedSlots.has(i)) {
        renderedSlots.add(i);
        const slot = document.querySelector(`[data-img-index="${i}"]`);
        if (slot) loadSlotImage(slot, isZipMode, comic);
      }
    }
    // Revoke URLs outside buffer
    revokeOutsideBuffer(centerIndex);
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const slot = entry.target;
        const idx = parseInt(slot.dataset.imgIndex);
        ensureBuffer(idx);
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
      const pct = totalCount > 0 ? Math.round((closestIndex + 1) / totalCount * 100) : 0;
      progressEl.style.width = pct + '%';
      pageInfoEl.textContent = `第 ${closestIndex + 1}/${totalCount} 页`;
      percentEl.textContent = pct + '%';
      ensureBuffer(closestIndex);
    }

    debouncedSave(comic, closestIndex, scrollEl.scrollTop);
  });

  // Restore scroll position
  if (comic.lastReadImageIndex > 0 && totalCount > 0) {
    const targetIdx = Math.min(comic.lastReadImageIndex, totalCount - 1);
    const targetSlot = document.querySelector(`[data-img-index="${targetIdx}"]`);
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
      ensureBuffer(targetIdx);
      observer.unobserve(targetSlot);
      await waitForImage();
      targetSlot.scrollIntoView({ block: 'start' });
    }
  }

  // Show content after position is set
  scrollEl.style.visibility = 'visible';

  lastVisibleIndex = comic.lastReadImageIndex || 0;
  const initialPct = totalCount > 0 ? Math.round((lastVisibleIndex + 1) / totalCount * 100) : 0;
  progressEl.style.width = initialPct + '%';
  pageInfoEl.textContent = `第 ${lastVisibleIndex + 1}/${totalCount} 页`;
  percentEl.textContent = initialPct + '%';

  const visHandler = () => {
    if (document.visibilityState === 'hidden') {
      saveProgressNow(comic, lastVisibleIndex, scrollEl.scrollTop);
    }
  };
  document.addEventListener('visibilitychange', visHandler);

  function beforeUnloadHandler() {
    saveProgressNow(comic, lastVisibleIndex, scrollEl.scrollTop);
  }
  window.addEventListener('beforeunload', beforeUnloadHandler);

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

async function loadSlotImage(slot, isZipMode, comic) {
  if (slot.dataset.loaded) return;
  slot.dataset.loaded = '1';

  let blob;
  if (isZipMode) {
    const index = parseInt(slot.dataset.imgIndex);
    const path = comic.imagePaths[index];
    const entry = zipEntries?.[path];
    if (!entry) {
      slot.innerHTML = '<div class="loading" style="height:200px;color:#666;">图片加载失败</div>';
      return;
    }
    blob = await entry.async('blob');
  } else {
    const imgId = slot.dataset.imgId;
    blob = await getImageBlob(imgId);
  }

  if (!blob) {
    slot.innerHTML = '<div class="loading" style="height:200px;color:#666;">图片加载失败</div>';
    return;
  }

  const url = URL.createObjectURL(blob);
  loadedUrls.push({ url, index: parseInt(slot.dataset.imgIndex) });

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

function revokeOutsideBuffer(centerIndex) {
  const BUFFER = 15; // slightly larger to avoid premature revocation
  const toRemove = [];
  for (const item of loadedUrls) {
    if (item.index < centerIndex - BUFFER || item.index > centerIndex + BUFFER) {
      URL.revokeObjectURL(item.url);
      toRemove.push(item);
    }
  }
  for (const item of toRemove) {
    const idx = loadedUrls.indexOf(item);
    if (idx !== -1) loadedUrls.splice(idx, 1);
  }
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
  for (const item of loadedUrls) {
    URL.revokeObjectURL(item.url);
  }
  loadedUrls = [];
  zipInstance = null;
  zipEntries = null;
  if (window.__readerCleanup) {
    delete window.__readerCleanup;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

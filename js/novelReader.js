import { getNovel, getNovelText, updateNovel } from './db.js';

let saveTimer = null;
let cleanupFns = [];
let allParagraphs = [];
let charOffsets = [];
let totalChars = 0;

export async function renderNovelReader(app, novelId) {
  // Cleanup previous session
  doCleanup();

  const novel = await getNovel(novelId);
  if (!novel) {
    app.innerHTML = '<div class="empty-state"><p>小说不存在</p></div>';
    return;
  }

  // Load text
  let text = '';
  if (novel.totalChunks > 1) {
    for (let i = 0; i < novel.totalChunks; i++) {
      const chunk = await getNovelText(`${novel.textKey}/${i}`);
      if (chunk) text += chunk;
    }
  } else {
    text = await getNovelText(novel.textKey) || '';
  }

  if (!text) {
    app.innerHTML = '<div class="empty-state"><p>无法加载小说内容</p></div>';
    return;
  }

  // Split into paragraphs
  allParagraphs = text.split(/\n+/).filter(p => p.trim());
  const paragraphs = allParagraphs;
  const totalCount = paragraphs.length;
  totalChars = novel.totalChars || text.length;

  // Build char offset map: charOffsets[i] = starting char offset of paragraph i
  charOffsets = [0];
  for (let i = 0; i < paragraphs.length; i++) {
    charOffsets.push(charOffsets[i] + paragraphs[i].length + 1);
  }

  // Detect chapters
  let chapters = detectChapters(paragraphs, novel.chapterPattern);
  let chapterIndices = new Set(chapters.map(ch => ch.paragraphIndex));

  function refreshChapters(customPattern) {
    chapters = detectChapters(paragraphs, customPattern);
    chapterIndices = new Set(chapters.map(ch => ch.paragraphIndex));
    // Re-render all rendered chunks to update chapter-title class
    for (const chunkIdx of renderedChunks) {
      const placeholder = contentEl.querySelector(`[data-chunk="${chunkIdx}"]`);
      if (!placeholder) continue;
      const start = chunkIdx * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalCount);
      let html = '';
      for (let i = start; i < end; i++) {
        const isChapter = chapterIndices.has(i);
        const cls = isChapter ? ' class="chapter-title"' : '';
        html += `<p${cls} data-p-index="${i}">${escapeHtml(paragraphs[i].trim())}</p>`;
      }
      placeholder.innerHTML = html;
    }
    return { chapters, chapterIndices };
  }

  // Virtual rendering: render chunks of paragraphs
  const CHUNK_SIZE = 200; // paragraphs per chunk
  const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);
  const RENDER_AHEAD = 3; // render 3 chunks ahead of visible

  // Reading settings
  const fontSize = localStorage.getItem('novel-fontSize') || '18';
  const bgColor = localStorage.getItem('novel-bgColor') || '#F5EFDA';
  const smoothScroll = localStorage.getItem('novel-smoothScroll') !== 'false';
  const textColor = bgColor === '#1A1A1A' ? '#CCCCCC' : '#333333';

  app.innerHTML = `
    <div class="novel-reader" id="novel-reader" style="background:${bgColor};">
      <div class="novel-reader-top-bar" id="novel-top-bar">
        <button class="back-btn" id="novel-back">‹</button>
        <span class="novel-title">${escapeHtml(novel.name)}</span>
        <button class="novel-settings-btn" id="novel-toc-btn" style="font-size:14px;font-weight:400;">目录</button>
        <button class="novel-settings-btn" id="novel-settings">Aa</button>
      </div>
      <div class="novel-scroll" id="novel-scroll" style="visibility:hidden;">
        <div class="novel-content" id="novel-content" style="font-size:${fontSize}px;color:${textColor};">
          ${totalChunks > 0 ? buildChunkPlaceholders(totalChunks) : ''}
        </div>
        <div class="novel-end" style="color:${bgColor === '#1A1A1A' ? '#666' : '#999'};">— 全书完 —</div>
      </div>
      <div class="novel-reader-bottom-bar" id="novel-bottom-bar">
        <div class="novel-progress-bar"><div class="novel-progress-fill" id="novel-progress" style="width:0%"></div></div>
        <div class="novel-meta">
          <span id="novel-pct">0%</span>
        </div>
      </div>

      <div class="novel-settings-panel hidden" id="novel-settings-panel">
        <div class="settings-row">
          <span>字号</span>
          <div class="settings-btns">
            <button class="settings-btn ${fontSize === '15' ? 'active' : ''}" data-size="15">小</button>
            <button class="settings-btn ${fontSize === '18' ? 'active' : ''}" data-size="18">中</button>
            <button class="settings-btn ${fontSize === '22' ? 'active' : ''}" data-size="22">大</button>
          </div>
        </div>
        <div class="settings-row">
          <span>背景</span>
          <div class="settings-btns">
            <button class="color-btn ${bgColor === '#FFFFFF' ? 'active' : ''}" data-color="#FFFFFF" style="background:#FFFFFF;border:1px solid #ddd;"></button>
            <button class="color-btn ${bgColor === '#F5EFDA' ? 'active' : ''}" data-color="#F5EFDA" style="background:#F5EFDA;border:1px solid #ddd;"></button>
            <button class="color-btn ${bgColor === '#CCE8CF' ? 'active' : ''}" data-color="#CCE8CF" style="background:#CCE8CF;border:1px solid #ddd;"></button>
            <button class="color-btn ${bgColor === '#1A1A1A' ? 'active' : ''}" data-color="#1A1A1A" style="background:#1A1A1A;border:1px solid #444;"></button>
          </div>
        </div>
        <div class="settings-row">
          <span>翻页动画</span>
          <div class="settings-btns">
            <button class="settings-btn ${smoothScroll ? 'active' : ''}" data-smooth="true">流畅</button>
            <button class="settings-btn ${!smoothScroll ? 'active' : ''}" data-smooth="false">快速</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const scrollEl = document.getElementById('novel-scroll');
  const progressEl = document.getElementById('novel-progress');
  const pctEl = document.getElementById('novel-pct');
  const novelReader = document.getElementById('novel-reader');
  const settingsPanel = document.getElementById('novel-settings-panel');
  const contentEl = document.getElementById('novel-content');

  // Render chunks on demand
  const renderedChunks = new Set();

  function renderChunk(chunkIndex) {
    if (renderedChunks.has(chunkIndex) || chunkIndex >= totalChunks) return;
    renderedChunks.add(chunkIndex);

    const placeholder = contentEl.querySelector(`[data-chunk="${chunkIndex}"]`);
    if (!placeholder) return;

    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalCount);
    let html = '';
    for (let i = start; i < end; i++) {
      const isChapter = chapterIndices.has(i);
      const cls = isChapter ? ' class="chapter-title"' : '';
      html += `<p${cls} data-p-index="${i}">${escapeHtml(paragraphs[i].trim())}</p>`;
    }
    placeholder.innerHTML = html;
    placeholder.dataset.rendered = '1';
  }

  function renderVisibleChunks() {
    const scrollTop = scrollEl.scrollTop;
    const viewportHeight = scrollEl.clientHeight;
    const placeholders = contentEl.querySelectorAll('[data-chunk]');

    placeholders.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();
      const relativeTop = rect.top - scrollRect.top;
      const relativeBottom = rect.bottom - scrollRect.top;

      // Check if chunk is near viewport (within a few screen heights)
      if (relativeBottom > -viewportHeight * RENDER_AHEAD && relativeTop < viewportHeight * (RENDER_AHEAD + 1)) {
        renderChunk(parseInt(el.dataset.chunk));
      }
    });
  }

  // Initial render of first chunks
  for (let i = 0; i < Math.min(RENDER_AHEAD + 1, totalChunks); i++) {
    renderChunk(i);
  }

  // Back
  document.getElementById('novel-back').onclick = async () => {
    const { offset } = getVisibleProgress();
    await saveProgressNow(novelId, offset);
    doCleanup();
    window.history.back();
  };

  // Toggle bars
  const toggleBars = () => {
    document.getElementById('novel-top-bar')?.classList.toggle('novel-bar-hidden');
    document.getElementById('novel-bottom-bar')?.classList.toggle('novel-bar-hidden');
    settingsPanel.classList.add('hidden');
  };

  let pageSmooth = smoothScroll;

  scrollEl.addEventListener('click', (e) => {
    const barsHidden = document.getElementById('novel-top-bar')?.classList.contains('novel-bar-hidden');
    if (barsHidden) {
      const rect = scrollEl.getBoundingClientRect();
      const relY = (e.clientY - rect.top) / rect.height;
      const delta = scrollEl.clientHeight * 0.8;
      if (relY < 0.3) {
        if (pageSmooth) scrollEl.scrollBy({ top: -delta, behavior: 'smooth' });
        else scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - delta);
        return;
      }
      if (relY > 0.7) {
        if (pageSmooth) scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
        else scrollEl.scrollTop = scrollEl.scrollTop + delta;
        return;
      }
    }
    toggleBars();
  });

  // TOC button
  document.getElementById('novel-toc-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showTOC(chapters, chapterIndices, scrollEl, contentEl, CHUNK_SIZE, renderVisibleChunks, novel, refreshChapters);
  });

  // Settings
  document.getElementById('novel-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('hidden');
  });

  settingsPanel.querySelectorAll('[data-size]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const size = btn.dataset.size;
      contentEl.style.fontSize = size + 'px';
      localStorage.setItem('novel-fontSize', size);
      settingsPanel.querySelectorAll('[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  settingsPanel.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = btn.dataset.color;
      novelReader.style.background = color;
      localStorage.setItem('novel-bgColor', color);
      contentEl.style.color = color === '#1A1A1A' ? '#CCCCCC' : '#333333';
      document.querySelector('.novel-end').style.color = color === '#1A1A1A' ? '#666' : '#999';
      settingsPanel.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  settingsPanel.querySelectorAll('[data-smooth]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = btn.dataset.smooth === 'true';
      pageSmooth = val;
      localStorage.setItem('novel-smoothScroll', val);
      settingsPanel.querySelectorAll('[data-smooth]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Scroll: render visible chunks + track progress
  scrollEl.addEventListener('scroll', () => {
    const { offset, pct } = getVisibleProgress();
    progressEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';

    // Render visible chunks
    renderVisibleChunks();

    // Debounced save
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveProgressNow(novelId, offset);
    }, 500);
  });

  // Restore scroll position using char offset
  // Check localStorage backup first (more reliable than IndexedDB on iOS PWA)
  const lsOffset = localStorage.getItem(`novel-progress-${novelId}`);
  if (lsOffset !== null) {
    novel.lastReadOffset = Math.max(novel.lastReadOffset || 0, parseInt(lsOffset) || 0);
  }
  if (novel.lastReadOffset > 0 && totalChars > 0) {
    // Binary search charOffsets to find paragraph index
    let targetIdx = 0;
    let lo = 0, hi = charOffsets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (charOffsets[mid] <= novel.lastReadOffset) {
        targetIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const targetChunk = Math.floor(targetIdx / CHUNK_SIZE);
    // Render ALL chunks from 0 to target to ensure accurate DOM positions
    for (let c = 0; c <= Math.min(totalChunks - 1, targetChunk + 1); c++) {
      renderChunk(c);
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const targetP = contentEl.querySelector(`p[data-p-index="${targetIdx}"]`);
    if (targetP) {
      targetP.scrollIntoView({ block: 'start' });
    }
  }

  scrollEl.style.visibility = 'visible';

  // Initial progress display
  const initProgress = getVisibleProgress();
  progressEl.style.width = initProgress.pct + '%';
  pctEl.textContent = initProgress.pct + '%';

  // Save on background/close - with proper cleanup
  const visHandler = () => {
    if (document.visibilityState === 'hidden') {
      const { offset } = getVisibleProgress();
      saveProgressNow(novelId, offset);
    }
  };
  const beforeUnloadHandler = () => {
    const { offset } = getVisibleProgress();
    saveProgressNow(novelId, offset);
  };

  document.addEventListener('visibilitychange', visHandler);
  window.addEventListener('beforeunload', beforeUnloadHandler);

  cleanupFns = [
    () => document.removeEventListener('visibilitychange', visHandler),
    () => window.removeEventListener('beforeunload', beforeUnloadHandler),
    () => clearTimeout(saveTimer),
  ];

  novel.lastReadDate = new Date().toISOString();
  await updateNovel(novel);
}

function doCleanup() {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
  clearTimeout(saveTimer);
  charOffsets = [];
  totalChars = 0;
}

function getVisibleProgress() {
  const scrollEl = document.getElementById('novel-scroll');
  const contentEl = document.getElementById('novel-content');
  if (!scrollEl || !contentEl) return { offset: 0, pct: 0 };

  const scrollRect = scrollEl.getBoundingClientRect();
  const viewportTop = scrollRect.top + scrollRect.height * 0.2;
  const pElements = contentEl.querySelectorAll('p[data-p-index]');
  for (const p of pElements) {
    if (p.getBoundingClientRect().bottom > viewportTop) {
      const idx = parseInt(p.dataset.pIndex);
      const offset = charOffsets[idx];
      const pct = totalChars > 0 ? Math.round(offset / totalChars * 100) : 0;
      return { offset, pct };
    }
  }
  return { offset: 0, pct: 0 };
}

async function saveProgressNow(novelId, charOffset) {
  // Sync write to localStorage (instant, survives app kill)
  localStorage.setItem(`novel-progress-${novelId}`, charOffset);
  // Async write to IndexedDB (may not complete if app suspended)
  const current = await getNovel(novelId);
  if (!current) return;
  current.lastReadOffset = charOffset;
  try {
    await updateNovel(current);
  } catch (e) {
    console.error('Failed to save novel progress', e);
  }
}

function buildChunkPlaceholders(totalChunks) {
  let html = '';
  for (let i = 0; i < totalChunks; i++) {
    // Set a min-height estimate so scroll position works roughly
    html += `<div data-chunk="${i}" style="min-height:200px;"></div>`;
  }
  return html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function detectChapters(paragraphs, customPattern) {
  const chapters = [];

  // Custom pattern takes priority
  if (customPattern) {
    for (let i = 0; i < paragraphs.length; i++) {
      const line = paragraphs[i].trim();
      if (line.length > 1 && line.length < 80 && line.includes(customPattern)) {
        chapters.push({ title: line.slice(0, 60), paragraphIndex: i });
      }
    }
    if (chapters.length > 0) return chapters;
  }

  // Default patterns
  const chapterPatterns = [
    /^第[零一二三四五六七八九十百千万\d]+[章节回卷集部篇话]/,
    /^Chapter\s+\d+/i,
    /^卷[零一二三四五六七八九十百千万\d]+/,
    /^\d{1,5}[\.、．]\s*/,
  ];

  for (let i = 0; i < paragraphs.length; i++) {
    const line = paragraphs[i].trim();
    if (line.length > 2 && line.length < 60) {
      for (const pattern of chapterPatterns) {
        if (pattern.test(line)) {
          chapters.push({ title: line, paragraphIndex: i });
          break;
        }
      }
    }
  }

  // If no chapters detected, create approximate chapters every 500 paragraphs
  if (chapters.length === 0 && paragraphs.length > 500) {
    const totalSections = Math.ceil(paragraphs.length / 500);
    for (let i = 0; i < totalSections; i++) {
      const start = i * 500;
      const end = Math.min(start + 100, paragraphs.length);
      const preview = paragraphs.slice(start, end).join(' ').slice(0, 30);
      chapters.push({ title: `第${i + 1}部分 ${preview}...`, paragraphIndex: start });
    }
  }

  return chapters;
}

function showTOC(chapters, chapterIndices, scrollEl, contentEl, CHUNK_SIZE, renderVisibleChunks, novel, refreshChapters) {
  // Remove existing
  document.querySelector('.toc-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'toc-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const sidebar = document.createElement('div');
  sidebar.className = 'toc-sidebar';

  function renderTocList(chs) {
    return chs.length === 0
      ? '<div style="padding:20px;color:var(--text-secondary);text-align:center;">未检测到章节</div>'
      : chs.map((ch, i) => `<button class="toc-item" data-chapter="${i}">${escapeHtml(ch.title)}</button>`).join('');
  }

  sidebar.innerHTML = `
    <div class="toc-header">
      <h3>目录 (${chapters.length}章)</h3>
      <button class="toc-close">关闭</button>
    </div>
    <div style="padding:8px 12px;border-bottom:1px solid var(--border-color);">
      <input type="text" id="chapter-pattern-input" placeholder="自定义章节标识，如 【 或 序章"
        value="${escapeHtml(novel.chapterPattern || '')}"
        style="width:100%;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;font-size:14px;background:var(--bg);color:var(--text);">
    </div>
    <div class="toc-list" id="toc-list">
      ${renderTocList(chapters)}
    </div>
  `;

  sidebar.querySelector('.toc-close').onclick = () => overlay.remove();

  // Custom pattern input
  let currentChapterIndices = chapterIndices;
  const patternInput = sidebar.querySelector('#chapter-pattern-input');
  patternInput.addEventListener('input', () => {
    const pattern = patternInput.value.trim() || undefined;
    novel.chapterPattern = pattern;
    const result = refreshChapters(pattern);
    currentChapterIndices = result.chapterIndices;
    sidebar.querySelector('.toc-header h3').textContent = `目录 (${result.chapters.length}章)`;
    const tocList = sidebar.querySelector('#toc-list');
    tocList.innerHTML = renderTocList(result.chapters);
    bindTocItems(tocList, result.chapters, currentChapterIndices, scrollEl, contentEl, CHUNK_SIZE, renderVisibleChunks, overlay);
    updateNovel(novel);
  });

  function bindTocItems(container, chs, chIndices, scrollEl, contentEl, CHUNK_SIZE, renderVisibleChunks, overlay) {
    function navigate(btn) {
      const chapterIndex = parseInt(btn.dataset.chapter);
      const chapter = chs[chapterIndex];
      const targetP = chapter.paragraphIndex;

      const targetChunk = Math.floor(targetP / CHUNK_SIZE);
      const indexInChunk = targetP % CHUNK_SIZE;

      const chunkEl = contentEl.querySelector(`[data-chunk="${targetChunk}"]`);
      if (chunkEl && !chunkEl.dataset.rendered) {
        chunkEl.dataset.rendered = '1';
        const start = targetChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, allParagraphs.length);
        let html = '';
        for (let i = start; i < end; i++) {
          const isChapter = chIndices.has(i);
          const cls = isChapter ? ' class="chapter-title"' : '';
          html += `<p${cls} data-p-index="${i}">${escapeHtml(allParagraphs[i].trim())}</p>`;
        }
        chunkEl.innerHTML = html;
      }

      // Close overlay first, then scroll (avoids iOS scroll-after-overlay issue)
      overlay.remove();
      requestAnimationFrame(() => {
        const pElements = chunkEl?.querySelectorAll('p');
        if (pElements && pElements[indexInChunk]) {
          pElements[indexInChunk].scrollIntoView({ block: 'start' });
        }
        renderVisibleChunks();
      });
    }

    container.querySelectorAll('.toc-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn));
      // Fallback for iOS: touchend fires reliably after scrolling
      let touchMoved = false;
      btn.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
      btn.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
      btn.addEventListener('touchend', (e) => {
        if (!touchMoved) {
          e.preventDefault();
          navigate(btn);
        }
      });
    });
  }

  bindTocItems(sidebar.querySelector('#toc-list'), chapters, currentChapterIndices, scrollEl, contentEl, CHUNK_SIZE, renderVisibleChunks, overlay);

  overlay.appendChild(sidebar);
  document.body.appendChild(overlay);
}

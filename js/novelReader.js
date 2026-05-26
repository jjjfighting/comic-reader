import { getNovel, getNovelText, updateNovel } from './db.js';

let saveTimer = null;
let cleanupFns = [];
let allParagraphs = [];

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

  // Detect chapters
  const chapters = detectChapters(paragraphs);
  const chapterIndices = new Set(chapters.map(ch => ch.paragraphIndex));

  // Virtual rendering: render chunks of paragraphs
  const CHUNK_SIZE = 200; // paragraphs per chunk
  const totalChunks = Math.ceil(totalCount / CHUNK_SIZE);
  const RENDER_AHEAD = 3; // render 3 chunks ahead of visible

  // Reading settings
  const fontSize = localStorage.getItem('novel-fontSize') || '18';
  const bgColor = localStorage.getItem('novel-bgColor') || '#F5EFDA';
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
      html += `<p${cls}>${escapeHtml(paragraphs[i].trim())}</p>`;
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
  document.getElementById('novel-back').onclick = () => {
    saveProgressNow(novelId, novel, scrollEl.scrollTop, scrollEl.scrollHeight);
    doCleanup();
    window.history.back();
  };

  // Toggle bars
  const toggleBars = () => {
    document.getElementById('novel-top-bar')?.classList.toggle('novel-bar-hidden');
    document.getElementById('novel-bottom-bar')?.classList.toggle('novel-bar-hidden');
    settingsPanel.classList.add('hidden');
  };
  scrollEl.addEventListener('click', toggleBars);

  // TOC button
  document.getElementById('novel-toc-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showTOC(chapters, scrollEl, contentEl, CHUNK_SIZE, renderVisibleChunks);
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

  // Scroll: render visible chunks + track progress
  scrollEl.addEventListener('scroll', () => {
    const scrollTop = scrollEl.scrollTop;
    const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
    const pct = scrollHeight > 0 ? Math.round(scrollTop / scrollHeight * 100) : 0;
    progressEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';

    // Render visible chunks
    renderVisibleChunks();

    // Debounced save
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveProgressNow(novelId, novel, scrollTop, scrollEl.scrollHeight);
    }, 500);
  });

  // Restore scroll position
  if (novel.lastReadOffset > 0 && novel.totalChars > 0) {
    // Estimate position based on character ratio
    const ratio = novel.lastReadOffset / novel.totalChars;
    // Need a small delay for layout to settle
    await new Promise(r => setTimeout(r, 50));
    const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
    scrollEl.scrollTop = Math.round(ratio * scrollHeight);
    // Render chunks at new position
    renderVisibleChunks();
  }

  scrollEl.style.visibility = 'visible';

  // Initial progress display
  const initScrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
  const initPct = initScrollHeight > 0 ? Math.round(scrollEl.scrollTop / initScrollHeight * 100) : 0;
  progressEl.style.width = initPct + '%';
  pctEl.textContent = initPct + '%';

  // Save on background/close - with proper cleanup
  const visHandler = () => {
    if (document.visibilityState === 'hidden') {
      saveProgressNow(novelId, novel, scrollEl.scrollTop, scrollEl.scrollHeight);
    }
  };
  const beforeUnloadHandler = () => {
    saveProgressNow(novelId, novel, scrollEl.scrollTop, scrollEl.scrollHeight);
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
}

async function saveProgressNow(novelId, novel, scrollTop, scrollHeight) {
  // Verify novel still exists before saving
  const current = await getNovel(novelId);
  if (!current) return;

  const scrollEl = document.getElementById('novel-scroll');
  const clientHeight = scrollEl?.clientHeight || 1;
  const maxScroll = scrollHeight - clientHeight;
  const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
  current.lastReadOffset = Math.round(ratio * current.totalChars);
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

function detectChapters(paragraphs) {
  const chapters = [];
  // Common Chinese chapter patterns
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

function showTOC(chapters, scrollEl, contentEl, CHUNK_SIZE, renderVisibleChunks) {
  // Remove existing
  document.querySelector('.toc-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'toc-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const sidebar = document.createElement('div');
  sidebar.className = 'toc-sidebar';

  sidebar.innerHTML = `
    <div class="toc-header">
      <h3>目录 (${chapters.length}章)</h3>
      <button class="toc-close">关闭</button>
    </div>
    <div class="toc-list">
      ${chapters.length === 0
        ? '<div style="padding:20px;color:var(--text-secondary);text-align:center;">未检测到章节</div>'
        : chapters.map((ch, i) => `<button class="toc-item" data-chapter="${i}">${escapeHtml(ch.title)}</button>`).join('')
      }
    </div>
  `;

  sidebar.querySelector('.toc-close').onclick = () => overlay.remove();

  sidebar.querySelectorAll('.toc-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const chapterIndex = parseInt(btn.dataset.chapter);
      const chapter = chapters[chapterIndex];
      const targetP = chapter.paragraphIndex;

      // Find the paragraph in the DOM - it's in one of the chunk divs
      // Estimate: find the chunk and paragraph within it
      const CHUNK_SIZE = 200;
      const targetChunk = Math.floor(targetP / CHUNK_SIZE);
      const indexInChunk = targetP % CHUNK_SIZE;

      // Ensure the chunk is rendered first
      const chunkEl = contentEl.querySelector(`[data-chunk="${targetChunk}"]`);
      if (chunkEl && !chunkEl.dataset.rendered) {
        // Force render this chunk
        chunkEl.dataset.rendered = '1';
        const start = targetChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, allParagraphs.length);
        let html = '';
        for (let i = start; i < end; i++) {
          const isChapter = chapterIndices.has(i);
          const cls = isChapter ? ' class="chapter-title"' : '';
          html += `<p${cls}>${escapeHtml(allParagraphs[i].trim())}</p>`;
        }
        chunkEl.innerHTML = html;
      }

      // Now find the specific paragraph
      const pElements = chunkEl?.querySelectorAll('p');
      if (pElements && pElements[indexInChunk]) {
        pElements[indexInChunk].scrollIntoView({ block: 'start' });
      }

      overlay.remove();
      renderVisibleChunks();
    });
  });

  overlay.appendChild(sidebar);
  document.body.appendChild(overlay);
}

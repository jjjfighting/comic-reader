import { getNovel, getNovelText, updateNovel } from './db.js';

let saveTimer = null;

export async function renderNovelReader(app, novelId) {
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

  // Format text into paragraphs
  const paragraphs = text.split(/\n+/).filter(p => p.trim()).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');

  // Reading settings
  const fontSize = localStorage.getItem('novel-fontSize') || '18';
  const bgColor = localStorage.getItem('novel-bgColor') || '#F5EFDA';

  app.innerHTML = `
    <div class="novel-reader" id="novel-reader" style="background:${bgColor};">
      <div class="novel-reader-top-bar" id="novel-top-bar">
        <button class="back-btn" id="novel-back">‹</button>
        <span class="novel-title">${escapeHtml(novel.name)}</span>
        <button class="novel-settings-btn" id="novel-settings">Aa</button>
      </div>
      <div class="novel-scroll" id="novel-scroll" style="visibility:hidden;">
        <div class="novel-content" id="novel-content" style="font-size:${fontSize}px;">
          ${paragraphs}
        </div>
        <div class="novel-end">— 全书完 —</div>
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
            <button class="settings-btn" data-size="15">小</button>
            <button class="settings-btn active" data-size="18">中</button>
            <button class="settings-btn" data-size="22">大</button>
          </div>
        </div>
        <div class="settings-row">
          <span>背景</span>
          <div class="settings-btns">
            <button class="color-btn" data-color="#FFFFFF" style="background:#FFFFFF;border:1px solid #ddd;"></button>
            <button class="color-btn" data-color="#F5EFDA" style="background:#F5EFDA;border:1px solid #ddd;"></button>
            <button class="color-btn" data-color="#CCE8CF" style="background:#CCE8CF;border:1px solid #ddd;"></button>
            <button class="color-btn" data-color="#1A1A1A" style="background:#1A1A1A;border:1px solid #444;"></button>
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

  // Restore font size active state
  const savedFontSize = localStorage.getItem('novel-fontSize') || '18';
  contentEl.querySelectorAll(`[data-size]`).forEach(b => {
    b.classList.toggle('active', b.dataset.size === savedFontSize);
  });

  // Back
  document.getElementById('novel-back').onclick = () => {
    saveProgressNow(novel, scrollEl.scrollTop, scrollEl.scrollHeight);
    window.history.back();
  };

  // Toggle top/bottom bars
  scrollEl.addEventListener('click', () => {
    const topBar = document.getElementById('novel-top-bar');
    const bottomBar = document.getElementById('novel-bottom-bar');
    topBar.classList.toggle('novel-bar-hidden');
    bottomBar.classList.toggle('novel-bar-hidden');
    settingsPanel.classList.add('hidden');
  });

  // Settings panel
  document.getElementById('novel-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('hidden');
  });

  // Font size buttons
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

  // Background color buttons
  settingsPanel.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = btn.dataset.color;
      novelReader.style.background = color;
      localStorage.setItem('novel-bgColor', color);
      // Update text color for dark background
      contentEl.style.color = color === '#1A1A1A' ? '#CCCCCC' : '#333333';
      document.querySelector('.novel-end').style.color = color === '#1A1A1A' ? '#666' : '#999';
    });
  });

  // Apply saved text color
  const savedBgColor = localStorage.getItem('novel-bgColor') || '#F5EFDA';
  contentEl.style.color = savedBgColor === '#1A1A1A' ? '#CCCCCC' : '#333333';

  // Scroll progress tracking
  scrollEl.addEventListener('scroll', () => {
    const scrollTop = scrollEl.scrollTop;
    const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
    const pct = scrollHeight > 0 ? Math.round(scrollTop / scrollHeight * 100) : 0;
    progressEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const offset = scrollHeight > 0 ? Math.round(scrollTop / scrollHeight * novel.totalChars) : 0;
      saveProgressNow(novel, scrollTop, scrollEl.scrollHeight);
    }, 500);
  });

  // Restore scroll position
  if (novel.lastReadOffset > 0) {
    const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
    const ratio = novel.lastReadOffset / novel.totalChars;
    const targetTop = Math.round(ratio * scrollHeight);
    scrollEl.scrollTop = targetTop;
  }

  // Show content after position restored
  scrollEl.style.visibility = 'visible';

  // Update initial progress
  const initScrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
  const initPct = initScrollHeight > 0 ? Math.round(scrollEl.scrollTop / initScrollHeight * 100) : 0;
  progressEl.style.width = initPct + '%';
  pctEl.textContent = initPct + '%';

  // Save on background/close
  const visHandler = () => {
    if (document.visibilityState === 'hidden') {
      saveProgressNow(novel, scrollEl.scrollTop, scrollEl.scrollHeight);
    }
  };
  document.addEventListener('visibilitychange', visHandler);
  window.addEventListener('beforeunload', () => saveProgressNow(novel, scrollEl.scrollTop, scrollEl.scrollHeight));

  novel.lastReadDate = new Date().toISOString();
  await updateNovel(novel);
}

async function saveProgressNow(novel, scrollTop, scrollHeight) {
  const clientHeight = document.getElementById('novel-scroll')?.clientHeight || 1;
  const maxScroll = scrollHeight - clientHeight;
  const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
  novel.lastReadOffset = Math.round(ratio * novel.totalChars);
  try {
    await updateNovel(novel);
  } catch (e) {
    console.error('Failed to save novel progress', e);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

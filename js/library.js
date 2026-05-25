import { getAllComics, getAllCategories, getImageBlob, deleteComic } from './db.js';
import { importFiles } from './import.js';
import { blobToObjectURL } from './thumbnail.js';
import { renderCategoryAssignSheet, renderCategoryManageSheet } from './categories.js';

export async function renderLibrary(app) {
  const comics = await getAllComics();
  const categories = await getAllCategories();

  const recent = comics
    .filter(c => c.lastReadDate)
    .sort((a, b) => new Date(b.lastReadDate) - new Date(a.lastReadDate))
    .slice(0, 10);

  const allSorted = [...comics].sort((a, b) => new Date(b.importDate) - new Date(a.importDate));

  const theme = localStorage.getItem('theme') || 'system';
  const themeIcon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🌗';

  app.innerHTML = `
    <div class="header">
      <span class="header-title">我的漫画</span>
      <div class="header-actions">
        <button class="header-btn" id="theme-btn">${themeIcon}</button>
        <button class="header-btn" id="manage-cat-btn">🏷️</button>
        <button class="header-btn" id="import-btn">＋</button>
      </div>
    </div>

    ${recent.length > 0 ? `
      <div class="section">
        <div class="section-title">最近阅读</div>
        <div class="recent-scroll" id="recent-scroll">
          ${recent.map(c => recentCardHTML(c)).join('')}
        </div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-title">分类</div>
      <div class="chips" id="category-chips">
        <a class="chip" href="#/list" data-nav>全部</a>
        ${categories.map(c => `<a class="chip" href="#/list/${c.id}" data-nav>${escapeHtml(c.name)}</a>`).join('')}
        <button class="chip" id="add-cat-btn">＋</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">全部漫画</div>
      ${allSorted.length === 0 ? `
        <div class="empty-state">
          <div class="icon">📚</div>
          <p>还没有漫画，点击右上角 ＋ 导入</p>
        </div>
      ` : `
        <div class="comic-list" id="comic-list">
          ${allSorted.map(c => comicRowHTML(c)).join('')}
        </div>
      `}
    </div>
  `;

  bindLibraryEvents(app, categories);
  loadCoverImages(app, allSorted);
  loadRecentCovers(app, recent);
}

function recentCardHTML(comic) {
  return `
    <a class="recent-card" href="#/reader/${comic.id}" data-nav>
      <div class="recent-cover" data-comic-id="${comic.id}">
        <span class="placeholder-icon">📖</span>
      </div>
      <div class="recent-name">${escapeHtml(comic.name)}</div>
      ${comic.lastReadDate ? `<div class="recent-progress">${comic.lastReadImageIndex}/${comic.totalImages}页</div>` : ''}
    </a>
  `;
}

function comicRowHTML(comic) {
  const progress = comic.totalImages > 0 ? Math.round(comic.lastReadImageIndex / comic.totalImages * 100) : 0;
  return `
    <div class="comic-row" data-comic-id="${comic.id}">
      <a class="comic-row-link" href="#/reader/${comic.id}" data-nav>
        <div class="comic-cover" data-cover-id="${comic.id}">
          <span class="placeholder-icon">📖</span>
        </div>
        <div class="comic-info">
          <div class="comic-name">${escapeHtml(comic.name)}</div>
          <div class="comic-meta">${comic.totalImages}页 · 已读${progress}%</div>
          <div class="comic-progress-bar"><div class="comic-progress-fill" style="width:${progress}%"></div></div>
        </div>
        <span class="comic-chevron">›</span>
      </a>
      <button class="comic-delete-btn" data-delete-id="${comic.id}">✕</button>
    </div>
  `;
}

function bindLibraryEvents(app, categories) {
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    const current = localStorage.getItem('theme') || 'system';
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    localStorage.setItem('theme', next);
    applyTheme(next);
    renderLibrary(app);
  });

  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').onchange = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    showToast('正在导入...');
    try {
      const results = await importFiles(Array.from(files));
      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        showToast(`导入成功！共 ${succeeded} 部漫画`);
      } else {
        showToast(`${succeeded} 部成功，${failed.length} 部失败：${failed.map(f => f.error).join(', ')}`);
      }
    } catch (err) {
      showToast('导入失败：' + err.message);
    }
    e.target.value = '';
    renderLibrary(app);
  };

  document.getElementById('manage-cat-btn')?.addEventListener('click', () => {
    renderCategoryManageSheet(categories, async (updatedCats) => {
      document.querySelector('.modal-overlay')?.remove();
      renderLibrary(app);
    });
  });

  // Delete buttons
  app.querySelectorAll('.comic-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const comicId = btn.dataset.deleteId;
      const row = btn.closest('.comic-row');
      const name = row.querySelector('.comic-name')?.textContent || '这部漫画';
      if (confirm(`确定删除「${name}」？此操作不可恢复。`)) {
        showToast('正在删除...');
        await deleteComic(comicId);
        showToast('已删除');
        renderLibrary(app);
      }
    });
  });

  document.getElementById('add-cat-btn')?.addEventListener('click', async () => {
    const name = prompt('新分类名称');
    if (name && name.trim()) {
      const { createCategory } = await import('./categories.js');
      await createCategory(name.trim());
      renderLibrary(app);
    }
  });

  setupContextMenu(app);
}

function setupContextMenu(app) {
  let pressTimer = null;

  app.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.comic-row');
    if (!row) return;
    pressTimer = setTimeout(() => {
      e.preventDefault();
      const comicId = row.dataset.comicId;
      showContextMenu(app, comicId, row);
    }, 500);
  }, { passive: false });

  app.addEventListener('touchend', () => clearTimeout(pressTimer));
  app.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

async function showContextMenu(app, comicId, row) {
  document.querySelector('.context-menu')?.remove();

  const categories = await getAllCategories();
  const menu = document.createElement('div');
  menu.className = 'context-menu';

  const rect = row.getBoundingClientRect();
  menu.style.top = Math.min(rect.top + 40, window.innerHeight - 120) + 'px';
  menu.style.left = '16px';
  menu.style.right = '16px';

  menu.innerHTML = `
    <button id="ctx-assign">分配分类</button>
    <button id="ctx-delete" class="destructive">删除漫画</button>
  `;

  document.body.appendChild(menu);

  menu.querySelector('#ctx-assign').onclick = async () => {
    menu.remove();
    const { getComic } = await import('./db.js');
    const comic = await getComic(comicId);
    if (!comic) return;
    renderCategoryAssignSheet(categories, comic, async () => {
      document.querySelector('.modal-overlay')?.remove();
      renderLibrary(app);
    });
  };

  menu.querySelector('#ctx-delete').onclick = async () => {
    menu.remove();
    if (confirm('确定删除这部漫画？')) {
      await deleteComic(comicId);
      renderLibrary(app);
    }
  };

  setTimeout(() => {
    const handler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 100);
}

async function loadCoverImages(app, comics) {
  for (const comic of comics) {
    if (!comic.coverBlobKey) continue;
    const blob = await getImageBlob(comic.coverBlobKey);
    if (!blob) continue;
    const url = blobToObjectURL(blob);
    const coverEl = app.querySelector(`[data-cover-id="${comic.id}"]`);
    if (coverEl) {
      coverEl.innerHTML = `<img src="${url}" alt="${escapeHtml(comic.name)}">`;
    }
  }
}

async function loadRecentCovers(app, comics) {
  for (const comic of comics) {
    if (!comic.coverBlobKey) continue;
    const blob = await getImageBlob(comic.coverBlobKey);
    if (!blob) continue;
    const url = blobToObjectURL(blob);
    const coverEl = app.querySelector(`[data-comic-id="${comic.id}"]`);
    if (coverEl) {
      coverEl.innerHTML = `<img src="${url}" alt="${escapeHtml(comic.name)}">`;
    }
  }
}

export function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

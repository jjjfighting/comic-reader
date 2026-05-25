import { getAllComics, getAllCategories, getComic, getImageBlob, deleteComic } from './db.js';
import { blobToObjectURL } from './thumbnail.js';
import { renderCategoryAssignSheet } from './categories.js';

export async function renderComicList(app, categoryId) {
  const allComics = await getAllComics();
  const categories = await getAllCategories();
  const category = categoryId ? categories.find(c => c.id === categoryId) : null;
  const title = category ? category.name : '全部漫画';

  let comics;
  if (categoryId) {
    comics = allComics.filter(c => c.categories && c.categories.includes(categoryId));
  } else {
    comics = allComics;
  }
  comics.sort((a, b) => new Date(b.importDate) - new Date(a.importDate));

  app.innerHTML = `
    <div class="header">
      <a href="#/" class="header-btn" data-nav style="text-decoration:none;">‹</a>
      <span class="header-title">${escapeHtml(title)}</span>
      <span style="color:var(--text-secondary);font-size:13px;">${comics.length}部</span>
    </div>
    <div class="search-bar">
      <input type="text" placeholder="搜索漫画" id="search-input">
    </div>
    <div class="section">
      ${comics.length === 0 ? `
        <div class="empty-state">
          <div class="icon">📭</div>
          <p>${categoryId ? '该分类下还没有漫画' : '还没有漫画'}</p>
        </div>
      ` : `
        <div class="comic-list" id="comic-list">
          ${comics.map(c => comicRowHTML(c)).join('')}
        </div>
      `}
    </div>
  `;

  document.getElementById('search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = comics.filter(c => c.name.toLowerCase().includes(query));
    const list = document.getElementById('comic-list');
    if (list) {
      list.innerHTML = filtered.length === 0
        ? '<div class="empty-state"><p>没有找到漫画</p></div>'
        : filtered.map(c => comicRowHTML(c)).join('');
      loadCovers(list, filtered);
    }
  });

  setupContextMenu(app, comics, categories);
  loadCovers(app, comics);
}

function comicRowHTML(comic) {
  const progress = comic.totalImages > 0 ? Math.round(comic.lastReadImageIndex / comic.totalImages * 100) : 0;
  return `
    <a class="comic-row" href="#/reader/${comic.id}" data-nav data-comic-id="${comic.id}">
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
  `;
}

async function loadCovers(container, comics) {
  for (const comic of comics) {
    if (!comic.coverBlobKey) continue;
    const blob = await getImageBlob(comic.coverBlobKey);
    if (!blob) continue;
    const url = blobToObjectURL(blob);
    const el = container.querySelector(`[data-cover-id="${comic.id}"]`);
    if (el) el.innerHTML = `<img src="${url}" alt="">`;
  }
}

function setupContextMenu(app, comics, categories) {
  let pressTimer = null;

  app.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.comic-row');
    if (!row) return;
    pressTimer = setTimeout(() => {
      e.preventDefault();
      const comicId = row.dataset.comicId;
      showContextMenu(app, comicId, comics, categories);
    }, 500);
  }, { passive: false });

  app.addEventListener('touchend', () => clearTimeout(pressTimer));
  app.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

async function showContextMenu(app, comicId, comics, categories) {
  document.querySelector('.context-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = 'position:fixed;bottom:100px;left:16px;right:16px;z-index:400;';
  menu.innerHTML = `
    <button id="ctx-assign">分配分类</button>
    <button id="ctx-delete" class="destructive">删除漫画</button>
  `;
  document.body.appendChild(menu);

  menu.querySelector('#ctx-assign').onclick = async () => {
    menu.remove();
    const comic = await getComic(comicId);
    if (!comic) return;
    renderCategoryAssignSheet(categories, comic, async () => {
      document.querySelector('.modal-overlay')?.remove();
      renderComicList(app, null);
    });
  };

  menu.querySelector('#ctx-delete').onclick = async () => {
    menu.remove();
    if (confirm('确定删除？')) {
      await deleteComic(comicId);
      renderComicList(app, null);
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

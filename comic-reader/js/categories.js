import { getAllCategories, addCategory, deleteCategory, updateComic, getComic, getAllComics } from './db.js';

function generateId() {
  return crypto.randomUUID();
}

export async function loadCategories() {
  return getAllCategories();
}

export async function createCategory(name) {
  const cats = await getAllCategories();
  const category = {
    id: generateId(),
    name,
    sortOrder: cats.length,
  };
  await addCategory(category);
  return category;
}

export async function removeCategory(id) {
  const comics = await getAllComics();
  for (const comic of comics) {
    if (comic.categories && comic.categories.includes(id)) {
      comic.categories = comic.categories.filter(c => c !== id);
      await updateComic(comic);
    }
  }
  await deleteCategory(id);
}

export async function assignComicToCategories(comicId, categoryIds) {
  const comic = await getComic(comicId);
  if (!comic) return;
  comic.categories = categoryIds;
  await updateComic(comic);
}

export function renderCategoryAssignSheet(categories, comic, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) onClose(); };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';

  const selectedIds = new Set(comic.categories || []);

  sheet.innerHTML = `
    <div class="sheet-header">
      <span class="sheet-title">分配分类</span>
      <button class="sheet-close">完成</button>
    </div>
    <div class="cat-list"></div>
  `;

  const listEl = sheet.querySelector('.cat-list');
  const closeBtn = sheet.querySelector('.sheet-close');

  function renderList() {
    listEl.innerHTML = '';
    if (categories.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">还没有分类，先去创建一个吧</p>';
      return;
    }
    for (const cat of categories) {
      const item = document.createElement('div');
      item.className = 'cat-item';
      item.innerHTML = `
        <span class="cat-name">${escapeHtml(cat.name)}</span>
        ${selectedIds.has(cat.id) ? '<span style="color:var(--accent)">✓</span>' : ''}
      `;
      item.onclick = () => {
        if (selectedIds.has(cat.id)) {
          selectedIds.delete(cat.id);
        } else {
          selectedIds.add(cat.id);
        }
        renderList();
      };
      listEl.appendChild(item);
    }
  }

  closeBtn.onclick = async () => {
    await assignComicToCategories(comic.id, [...selectedIds]);
    onClose();
  };

  renderList();
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  return overlay;
}

export function renderCategoryManageSheet(categories, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) onClose(); };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';

  sheet.innerHTML = `
    <div class="sheet-header">
      <span class="sheet-title">管理分类</span>
      <button class="sheet-close">完成</button>
    </div>
    <div class="cat-list"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <input type="text" placeholder="新分类名称" style="flex:1;padding:10px 14px;border-radius:10px;border:none;background:var(--chip-bg);color:var(--text);font-size:15px;outline:none;">
      <button class="header-btn" style="color:var(--accent);font-size:15px;">添加</button>
    </div>
  `;

  const listEl = sheet.querySelector('.cat-list');
  const input = sheet.querySelector('input');
  const addBtn = sheet.querySelector('.header-btn');
  const closeBtn = sheet.querySelector('.sheet-close');

  let currentCategories = [...categories];

  function renderList() {
    listEl.innerHTML = '';
    for (const cat of currentCategories) {
      const item = document.createElement('div');
      item.className = 'cat-item';
      item.innerHTML = `
        <span class="cat-name">${escapeHtml(cat.name)}</span>
        <div class="cat-actions">
          <button class="rename-btn">重命名</button>
          <button class="delete-btn" style="color:#ff3b30;">删除</button>
        </div>
      `;
      item.querySelector('.delete-btn').onclick = async () => {
        await removeCategory(cat.id);
        currentCategories = currentCategories.filter(c => c.id !== cat.id);
        renderList();
      };
      item.querySelector('.rename-btn').onclick = async () => {
        const newName = prompt('新分类名称', cat.name);
        if (newName && newName.trim()) {
          cat.name = newName.trim();
          await addCategory(cat);
          renderList();
        }
      };
      listEl.appendChild(item);
    }
  }

  addBtn.onclick = async () => {
    const name = input.value.trim();
    if (!name) return;
    const cat = await createCategory(name);
    currentCategories.push(cat);
    input.value = '';
    renderList();
  };

  closeBtn.onclick = () => onClose(currentCategories);

  renderList();
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  return overlay;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

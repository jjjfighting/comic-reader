import { getAllNovels, getAllNovelTags, getNovel, deleteNovel, addNovelTag, deleteNovelTag } from './db.js';
import { importNovelFiles } from './novelImport.js';
import { renderTabBar } from './library.js';

let novelAbortCtrl = null;

export async function renderNovelPage(app) {
  if (novelAbortCtrl) novelAbortCtrl.abort();
  novelAbortCtrl = new AbortController();
  const { signal } = novelAbortCtrl;

  const novels = await getAllNovels();
  const tags = await getAllNovelTags();
  const allSorted = [...novels].sort((a, b) => new Date(b.importDate) - new Date(a.importDate));

  const recent = novels
    .filter(n => n.lastReadDate)
    .sort((a, b) => new Date(b.lastReadDate) - new Date(a.lastReadDate))
    .slice(0, 10);

  app.innerHTML = `
    <div class="header">
      <span class="header-title">小说</span>
      <div class="header-actions">
        <button class="header-btn" id="novel-manage-tags">🏷️</button>
        <button class="header-btn" id="novel-import-btn">＋</button>
      </div>
    </div>

    ${recent.length > 0 ? `
      <div class="section">
        <div class="section-title">最近阅读</div>
        <div class="recent-scroll" id="novel-recent-scroll">
          ${recent.map(n => novelRecentHTML(n)).join('')}
        </div>
      </div>
    ` : ''}

    <div class="section">
      <div class="chips" id="novel-tag-chips">
        <button class="chip active" data-tag="all">全部</button>
        ${tags.map(t => `<button class="chip" data-tag-id="${t.id}">${escapeHtml(t.name)}</button>`).join('')}
        <button class="chip" id="novel-add-tag">＋</button>
      </div>
    </div>
    <div class="section">
      ${allSorted.length === 0 ? `
        <div class="empty-state">
          <div class="icon">📖</div>
          <p>还没有小说，点击右上角 ＋ 导入</p>
        </div>
      ` : `
        <div class="comic-grid novel-grid" id="novel-list">
          ${allSorted.map(n => novelGridHTML(n)).join('')}
        </div>
      `}
    </div>
  `;

  bindNovelEvents(app, allSorted, tags, signal);
  renderTabBar(app, 'novel');
}

function novelRecentHTML(novel) {
  const progress = novel.totalChars > 0 ? Math.round(novel.lastReadOffset / novel.totalChars * 100) : 0;
  return `
    <a class="recent-card" href="#/novel-reader/${novel.id}" data-nav>
      <div class="recent-cover novel-recent-cover">
        <span class="novel-recent-name">${escapeHtml(novel.name)}</span>
      </div>
      <div class="recent-name">${escapeHtml(novel.name)}</div>
      <div class="recent-progress">已读${progress}%</div>
    </a>
  `;
}

function novelGridHTML(novel) {
  const progress = novel.totalChars > 0 ? Math.round(novel.lastReadOffset / novel.totalChars * 100) : 0;
  return `
    <div class="comic-grid-item" data-novel-id="${novel.id}">
      <a class="comic-grid-link" href="#/novel-reader/${novel.id}" data-nav>
        <div class="comic-grid-cover novel-grid-cover">
          <span class="novel-grid-title">${escapeHtml(novel.name)}</span>
          ${progress > 0 ? `<span class="novel-grid-progress">已读${progress}%</span>` : ''}
        </div>
      </a>
    </div>
  `;
}

function bindNovelEvents(app, novels, tags, signal) {
  // Import
  document.getElementById('novel-import-btn')?.addEventListener('click', () => {
    document.getElementById('novel-file-input').click();
  });

  document.getElementById('novel-file-input').onchange = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    const results = await importNovelFiles(Array.from(files));
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);
    if (failed.length === 0) {
      alert(`导入成功！共 ${succeeded} 部小说`);
    } else {
      alert(`${succeeded} 部成功，${failed.length} 部失败：${failed.map(f => f.error).join(', ')}`);
    }
    e.target.value = '';
    renderNovelPage(app);
  };

  // Search
  document.getElementById('novel-search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = novels.filter(n => n.name.toLowerCase().includes(query));
    const list = document.getElementById('novel-list');
    if (list) {
      list.innerHTML = filtered.length === 0
        ? '<div class="empty-state"><p>没有找到小说</p></div>'
        : filtered.map(n => novelGridHTML(n)).join('');
    }
  });

  // Tag filter
  document.getElementById('novel-tag-chips')?.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || chip.id === 'novel-add-tag') return;

    // Update active state
    document.querySelectorAll('#novel-tag-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const tagId = chip.dataset.tagId;
    let filtered;
    if (!tagId || chip.dataset.tag === 'all') {
      filtered = novels;
    } else {
      filtered = novels.filter(n => n.tags && n.tags.includes(tagId));
    }
    const list = document.getElementById('novel-list');
    if (list) {
      list.innerHTML = filtered.length === 0
        ? '<div class="empty-state"><p>该标签下没有小说</p></div>'
        : filtered.map(n => novelGridHTML(n)).join('');
    }
  });

  // Add tag
  document.getElementById('novel-add-tag')?.addEventListener('click', async () => {
    const name = prompt('新标签名称');
    if (name && name.trim()) {
      const tag = { id: crypto.randomUUID(), name: name.trim(), sortOrder: tags.length };
      await addNovelTag(tag);
      renderNovelPage(app);
    }
  });

  // Manage tags
  document.getElementById('novel-manage-tags')?.addEventListener('click', () => {
    showTagManageSheet(tags, app);
  });

  // Long press for context menu
  let pressTimer = null;
  let longPressFired = false;
  app.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.comic-grid-link')) {
      e.preventDefault();
      clearTimeout(pressTimer);
    }
  }, { signal });
  app.addEventListener('touchstart', (e) => {
    const link = e.target.closest('.comic-grid-link');
    if (!link) return;
    longPressFired = false;
    pressTimer = setTimeout(async () => {
      longPressFired = true;
      const row = link.closest('.comic-grid-item');
      const novelId = row.dataset.novelId;
      const novel = await getNovel(novelId);
      if (novel) showNovelContextSheet(tags, novel, app);
    }, 500);
  }, { passive: true, signal });
  app.addEventListener('touchend', (e) => {
    clearTimeout(pressTimer);
    if (longPressFired) e.preventDefault();
  }, { signal });
  app.addEventListener('touchmove', () => clearTimeout(pressTimer), { signal });
}

function showTagAssignSheet(tags, novel, app) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); } };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  const selectedIds = new Set(novel.tags || []);

  sheet.innerHTML = `
    <div class="sheet-header">
      <span class="sheet-title">分配标签</span>
      <button class="sheet-close">完成</button>
    </div>
    <div class="cat-list"></div>
  `;

  const listEl = sheet.querySelector('.cat-list');
  const closeBtn = sheet.querySelector('.sheet-close');

  function renderList() {
    listEl.innerHTML = '';
    if (tags.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">还没有标签，先去创建一个吧</p>';
      return;
    }
    for (const tag of tags) {
      const item = document.createElement('div');
      item.className = 'cat-item';
      item.innerHTML = `
        <span class="cat-name">${escapeHtml(tag.name)}</span>
        ${selectedIds.has(tag.id) ? '<span style="color:var(--accent)">✓</span>' : ''}
      `;
      item.onclick = () => {
        if (selectedIds.has(tag.id)) selectedIds.delete(tag.id);
        else selectedIds.add(tag.id);
        renderList();
      };
      listEl.appendChild(item);
    }
  }

  closeBtn.onclick = async () => {
    novel.tags = [...selectedIds];
    const { updateNovel } = await import('./db.js');
    await updateNovel(novel);
    overlay.remove();
  };

  renderList();
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

function showTagManageSheet(tags, app) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); } };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  let currentTags = [...tags];

  sheet.innerHTML = `
    <div class="sheet-header">
      <span class="sheet-title">管理标签</span>
      <button class="sheet-close">完成</button>
    </div>
    <div class="cat-list"></div>
    <div style="display:flex;gap:8px;margin-top:16px;">
      <input type="text" placeholder="新标签名称" style="flex:1;padding:10px 14px;border-radius:10px;border:none;background:var(--chip-bg);color:var(--text);font-size:15px;outline:none;">
      <button class="header-btn" style="color:var(--accent);font-size:15px;">添加</button>
    </div>
  `;

  const listEl = sheet.querySelector('.cat-list');
  const input = sheet.querySelector('input');
  const addBtn = sheet.querySelector('.header-btn');
  const closeBtn = sheet.querySelector('.sheet-close');

  function renderList() {
    listEl.innerHTML = '';
    for (const tag of currentTags) {
      const item = document.createElement('div');
      item.className = 'cat-item';
      item.innerHTML = `
        <span class="cat-name">${escapeHtml(tag.name)}</span>
        <div class="cat-actions">
          <button class="rename-btn">重命名</button>
          <button class="delete-btn" style="color:#ff3b30;">删除</button>
        </div>
      `;
      item.querySelector('.delete-btn').onclick = async () => {
        await deleteNovelTag(tag.id);
        currentTags = currentTags.filter(t => t.id !== tag.id);
        renderList();
      };
      item.querySelector('.rename-btn').onclick = async () => {
        const newName = prompt('新标签名称', tag.name);
        if (newName && newName.trim()) {
          tag.name = newName.trim();
          await addNovelTag(tag);
          renderList();
        }
      };
      listEl.appendChild(item);
    }
  }

  addBtn.onclick = async () => {
    const name = input.value.trim();
    if (!name) return;
    const tag = { id: crypto.randomUUID(), name, sortOrder: currentTags.length };
    await addNovelTag(tag);
    currentTags.push(tag);
    input.value = '';
    renderList();
  };

  closeBtn.onclick = () => { overlay.remove(); renderNovelPage(app); };
  renderList();
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

function showNovelContextSheet(tags, novel, app) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';

  sheet.innerHTML = `
    <div class="sheet-header">
      <span class="sheet-title">${escapeHtml(novel.name)}</span>
      <button class="sheet-close">取消</button>
    </div>
    <div class="cat-list">
      <div class="cat-item" id="ctx-assign-tag"><span class="cat-name">分配标签</span></div>
      <div class="cat-item" id="ctx-delete" style="color:#ff3b30;"><span class="cat-name">删除小说</span></div>
    </div>
  `;

  sheet.querySelector('.sheet-close').onclick = () => overlay.remove();

  sheet.querySelector('#ctx-assign-tag').onclick = () => {
    overlay.remove();
    showTagAssignSheet(tags, novel, app);
  };

  sheet.querySelector('#ctx-delete').onclick = async () => {
    overlay.remove();
    if (confirm(`确定删除「${novel.name}」？此操作不可恢复。`)) {
      await deleteNovel(novel.id);
      renderNovelPage(app);
    }
  };

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

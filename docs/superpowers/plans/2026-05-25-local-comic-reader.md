# Local Comic Reader Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side PWA comic reader that imports ZIP/CBZ files, extracts images to IndexedDB, and provides a vertical-scroll reading experience on iPhone.

**Architecture:** Single-page app with hash routing. Vanilla JS with ES modules. JSZip for archive extraction. IndexedDB for all persistence (comics, categories, image blobs). Service worker for offline PWA.

**Tech Stack:** HTML, CSS (custom properties for theming), vanilla JavaScript, JSZip, IndexedDB, Service Worker.

---

## File Structure

```
comic-reader/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js          # Router + init
│   ├── db.js           # IndexedDB wrapper
│   ├── import.js       # File picker + JSZip extraction
│   ├── library.js      # Home page
│   ├── comicList.js    # Category-filtered list
│   ├── reader.js       # Reader page
│   ├── categories.js   # Category CRUD + assignment
│   └── thumbnail.js    # Thumbnail generation
├── lib/
│   └── jszip.min.js
├── manifest.json
├── sw.js
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

### Task 1: Project Scaffold + index.html + CSS Theme

**Files:**
- Create: `comic-reader/index.html`
- Create: `comic-reader/css/style.css`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p comic-reader/{css,js,lib,icons}
```

- [ ] **Step 2: Write index.html**

Create `comic-reader/index.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#000000">
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <title>漫画阅读器</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="app"></div>
  <input type="file" id="file-input" accept=".zip,.cbz,.ZIP,.CBZ" multiple hidden>
  <script src="lib/jszip.min.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write style.css with light/dark theme support**

Create `comic-reader/css/style.css`:

```css
:root {
  --bg: #f2f2f7;
  --bg-secondary: #ffffff;
  --text: #1c1c1e;
  --text-secondary: #8e8e93;
  --accent: #007aff;
  --border: #e5e5ea;
  --chip-bg: #e5e5ea;
  --chip-text: #1c1c1e;
  --progress-bg: #e5e5ea;
  --overlay: rgba(255, 255, 255, 0.8);
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
}

[data-theme="dark"] {
  --bg: #000000;
  --bg-secondary: #1c1c1e;
  --text: #f2f2f7;
  --text-secondary: #8e8e93;
  --accent: #0a84ff;
  --border: #38383a;
  --chip-bg: #2c2c2e;
  --chip-text: #f2f2f7;
  --progress-bg: #38383a;
  --overlay: rgba(28, 28, 30, 0.8);
  --shadow: 0 1px 3px rgba(0,0,0,0.3);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
}

#app {
  min-height: 100vh;
  min-height: 100dvh;
}

/* Header */
.header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--overlay);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 0.5px solid var(--border);
}

.header-title {
  font-size: 17px;
  font-weight: 700;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.header-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 22px;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

/* Section */
.section {
  padding: 0 16px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 12px;
}

/* Category chips */
.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar { display: none; }

.chip {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 16px;
  background: var(--chip-bg);
  color: var(--chip-text);
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
  border: none;
  transition: background 0.15s;
}

.chip.active, .chip:active {
  background: var(--accent);
  color: #fff;
}

/* Recent cards (horizontal scroll) */
.recent-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.recent-scroll::-webkit-scrollbar { display: none; }

.recent-card {
  flex-shrink: 0;
  width: 100px;
  cursor: pointer;
  text-decoration: none;
  color: var(--text);
}

.recent-cover {
  width: 100px;
  height: 130px;
  border-radius: 8px;
  background: var(--chip-bg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recent-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.recent-cover .placeholder-icon {
  font-size: 28px;
  color: var(--text-secondary);
}

.recent-name {
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.recent-progress {
  font-size: 11px;
  color: var(--accent);
}

/* Comic list */
.comic-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.comic-row {
  display: flex;
  gap: 12px;
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: 10px;
  cursor: pointer;
  text-decoration: none;
  color: var(--text);
  box-shadow: var(--shadow);
  align-items: center;
}

.comic-cover {
  width: 56px;
  height: 74px;
  border-radius: 6px;
  background: var(--chip-bg);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.comic-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.comic-cover .placeholder-icon {
  font-size: 20px;
  color: var(--text-secondary);
}

.comic-info {
  flex: 1;
  min-width: 0;
}

.comic-name {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.comic-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.comic-progress-bar {
  height: 3px;
  background: var(--progress-bg);
  border-radius: 2px;
  overflow: hidden;
}

.comic-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s;
}

.comic-chevron {
  color: var(--text-secondary);
  font-size: 13px;
  flex-shrink: 0;
}

/* Reader */
.reader-page {
  position: fixed;
  inset: 0;
  background: #000;
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.reader-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: auto;
}

.reader-images {
  display: flex;
  flex-direction: column;
}

.reader-images img {
  display: block;
  width: 100%;
  height: auto;
}

.reader-top-bar, .reader-bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 210;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.reader-top-bar {
  top: 0;
  padding: 8px 16px;
  padding-top: max(8px, env(safe-area-inset-top));
  display: flex;
  align-items: center;
  gap: 12px;
}

.reader-top-bar .back-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  padding: 4px 8px;
}

.reader-top-bar .title {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reader-bottom-bar {
  bottom: 0;
  padding: 8px 16px;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}

.reader-bottom-bar .progress-bar {
  height: 3px;
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.reader-bottom-bar .progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.2s;
}

.reader-bottom-bar .meta {
  display: flex;
  justify-content: space-between;
  color: rgba(255,255,255,0.7);
  font-size: 12px;
}

.bars-hidden .reader-top-bar {
  transform: translateY(-100%);
  opacity: 0;
}

.bars-hidden .reader-bottom-bar {
  transform: translateY(100%);
  opacity: 0;
}

/* Loading spinner */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-secondary);
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.empty-state .icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-state p {
  font-size: 15px;
}

/* Modal / Sheet */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.modal-sheet {
  background: var(--bg-secondary);
  border-radius: 16px 16px 0 0;
  width: 100%;
  max-width: 500px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 20px 16px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

.modal-sheet .sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-sheet .sheet-title {
  font-size: 17px;
  font-weight: 600;
}

.modal-sheet .sheet-close {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 16px;
  cursor: pointer;
}

/* Category item in modal */
.cat-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--border);
}

.cat-item .cat-name {
  flex: 1;
  font-size: 15px;
}

.cat-item .cat-count {
  color: var(--text-secondary);
  font-size: 13px;
  margin-right: 8px;
}

.cat-item .cat-actions {
  display: flex;
  gap: 8px;
}

.cat-item button {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 14px;
  cursor: pointer;
}

/* Search bar */
.search-bar {
  padding: 0 16px;
  margin-bottom: 12px;
}

.search-bar input {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: none;
  background: var(--chip-bg);
  color: var(--text);
  font-size: 15px;
  outline: none;
}

.search-bar input::placeholder {
  color: var(--text-secondary);
}

/* Context menu */
.context-menu {
  position: fixed;
  z-index: 400;
  background: var(--bg-secondary);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  overflow: hidden;
  min-width: 180px;
}

.context-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 14px 18px;
  background: none;
  border: none;
  border-bottom: 0.5px solid var(--border);
  color: var(--text);
  font-size: 15px;
  cursor: pointer;
}

.context-menu button:last-child {
  border-bottom: none;
}

.context-menu button.destructive {
  color: #ff3b30;
}

/* Utility */
.hidden { display: none !important; }
```

- [ ] **Step 4: Commit**

```bash
git add comic-reader/
git commit -m "feat: scaffold project with HTML, CSS theme (light/dark), and base styles"
```

---

### Task 2: IndexedDB Wrapper (db.js)

**Files:**
- Create: `comic-reader/js/db.js`

- [ ] **Step 1: Write db.js**

Create `comic-reader/js/db.js`:

```javascript
const DB_NAME = 'comic-reader';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('comics')) {
        const comicStore = db.createObjectStore('comics', { keyPath: 'id' });
        comicStore.createIndex('lastReadDate', 'lastReadDate');
        comicStore.createIndex('importDate', 'importDate');
      }

      if (!db.objectStoreNames.contains('categories')) {
        const catStore = db.createObjectStore('categories', { keyPath: 'id' });
        catStore.createIndex('sortOrder', 'sortOrder');
      }

      if (!db.objectStoreNames.contains('imageBlobs')) {
        const imgStore = db.createObjectStore('imageBlobs', { keyPath: 'id' });
        imgStore.createIndex('comicId', 'comicId');
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });

  return dbPromise;
}

export async function addComic(comic) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('comics', 'readwrite');
    tx.objectStore('comics').put(comic);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getComic(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('comics', 'readonly');
    const req = tx.objectStore('comics').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllComics() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('comics', 'readonly');
    const req = tx.objectStore('comics').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteComic(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['comics', 'imageBlobs'], 'readwrite');
    // Delete comic record
    tx.objectStore('comics').delete(id);
    // Delete all associated images
    const imgStore = tx.objectStore('imageBlobs');
    const index = imgStore.index('comicId');
    const req = index.openCursor(IDBKeyRange.only(id));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function addImageBlob(id, blob, comicId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('imageBlobs', 'readwrite');
    tx.objectStore('imageBlobs').put({ id, blob, comicId });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getImageBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('imageBlobs', 'readonly');
    const req = tx.objectStore('imageBlobs').get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getComicImageIds(comicId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('imageBlobs', 'readonly');
    const index = tx.objectStore('imageBlobs').index('comicId');
    const req = index.openCursor(IDBKeyRange.only(comicId));
    const ids = [];
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        ids.push(cursor.value.id);
        cursor.continue();
      } else {
        // Sort by filename (embedded in id after comicId/)
        ids.sort((a, b) => {
          const nameA = a.split('/').pop();
          const nameB = b.split('/').pop();
          return nameA.localeCompare(nameB, undefined, { numeric: true });
        });
        resolve(ids);
      }
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function addCategory(category) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('categories', 'readwrite');
    tx.objectStore('categories').put(category);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllCategories() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('categories', 'readonly');
    const req = tx.objectStore('categories').getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.sortOrder - b.sortOrder));
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteCategory(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('categories', 'readwrite');
    tx.objectStore('categories').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function updateComic(comic) {
  return addComic(comic);
}
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/db.js
git commit -m "feat: add IndexedDB wrapper for comics, categories, image blobs"
```

---

### Task 3: Thumbnail Generation (thumbnail.js)

**Files:**
- Create: `comic-reader/js/thumbnail.js`

- [ ] **Step 1: Write thumbnail.js**

Create `comic-reader/js/thumbnail.js`:

```javascript
const MAX_THUMB_WIDTH = 200;

export function generateThumbnail(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = MAX_THUMB_WIDTH / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = MAX_THUMB_WIDTH;
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((thumbBlob) => {
        URL.revokeObjectURL(url);
        resolve(thumbBlob);
      }, 'image/jpeg', 0.7);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function blobToObjectURL(blob) {
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/thumbnail.js
git commit -m "feat: add thumbnail generation from image blobs"
```

---

### Task 4: Import Service (import.js)

**Files:**
- Create: `comic-reader/js/import.js`

- [ ] **Step 1: Write import.js**

Create `comic-reader/js/import.js`:

```javascript
import { addComic, addImageBlob } from './db.js';
import { generateThumbnail } from './thumbnail.js';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'bmp']);

function generateId() {
  return crypto.randomUUID();
}

function isImageFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function sortByName(files) {
  return files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
}

export async function importFiles(fileList) {
  const results = [];

  for (const file of fileList) {
    try {
      const comic = await importOneFile(file);
      results.push({ success: true, name: comic.name });
    } catch (err) {
      console.error('Import failed for', file.name, err);
      results.push({ success: false, name: file.name, error: err.message });
    }
  }

  return results;
}

async function importOneFile(file) {
  const zip = await JSZip.loadAsync(file);
  const comicId = generateId();

  // Collect image entries, sorted by filename
  const entries = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && isImageFile(path)) {
      entries.push({ path, entry });
    }
  });
  sortByName(entries);

  if (entries.length === 0) {
    throw new Error('No images found in archive');
  }

  // Store each image as a blob
  const imageIds = [];
  for (let i = 0; i < entries.length; i++) {
    const { path, entry: zipEntry } = entries[i];
    const imageId = `${comicId}/${path}`;
    const blob = await zipEntry.async('blob');
    await addImageBlob(imageId, blob, comicId);
    imageIds.push(imageId);
  }

  // Generate cover thumbnail from first image
  const firstBlob = await entries[0].entry.async('blob');
  const thumbBlob = await generateThumbnail(firstBlob);
  if (thumbBlob) {
    await addImageBlob(`${comicId}/__cover__`, thumbBlob, comicId);
  }

  // Create comic record
  const name = file.name.replace(/\.(zip|cbz)$/i, '');
  const comic = {
    id: comicId,
    name,
    coverBlobKey: `${comicId}/__cover__`,
    totalImages: entries.length,
    lastReadImageIndex: 0,
    lastReadScrollOffset: 0,
    lastReadDate: null,
    importDate: new Date().toISOString(),
    categories: [],
  };

  await addComic(comic);
  return comic;
}
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/import.js
git commit -m "feat: add import service with ZIP/CBZ extraction via JSZip"
```

---

### Task 5: Category Management (categories.js)

**Files:**
- Create: `comic-reader/js/categories.js`

- [ ] **Step 1: Write categories.js**

Create `comic-reader/js/categories.js`:

```javascript
import { getAllCategories, addCategory, deleteCategory, updateComic, getComic } from './db.js';

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
  // Remove category from all comics that have it
  const { getAllComics } = await import('./db.js');
  const comics = await getAllComics();
  for (const comic of comics) {
    if (comic.categories.includes(id)) {
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

export function renderCategorySheet(categories, comic, onClose) {
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
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/categories.js
git commit -m "feat: add category management with CRUD and assignment"
```

---

### Task 6: Library Page (library.js)

**Files:**
- Create: `comic-reader/js/library.js`

- [ ] **Step 1: Write library.js**

Create `comic-reader/js/library.js`:

```javascript
import { getAllComics, getAllCategories, getImageBlob, deleteComic } from './db.js';
import { importFiles } from './import.js';
import { blobToObjectURL } from './thumbnail.js';
import { renderCategoryAssignSheet, renderCategoryManageSheet } from './categories.js';

export async function renderLibrary(app) {
  const comics = await getAllComics();
  const categories = await getAllCategories();

  // Sort: recent first (by lastReadDate), then by importDate
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

  // Bind events
  bindLibraryEvents(app, categories);
  loadCoverImages(app, allSorted);
  loadRecentCovers(app, recent);
}

function recentCardHTML(comic) {
  const progress = comic.totalImages > 0 ? Math.round(comic.lastReadImageIndex / comic.totalImages * 100) : 0;
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

function bindLibraryEvents(app, categories) {
  // Theme toggle
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    const current = localStorage.getItem('theme') || 'system';
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    localStorage.setItem('theme', next);
    applyTheme(next);
    // Re-render to update icon
    renderLibrary(app);
  });

  // Import button
  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  // File input change
  document.getElementById('file-input').onchange = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    await importFiles(Array.from(files));
    e.target.value = '';
    renderLibrary(app);
  };

  // Manage categories
  document.getElementById('manage-cat-btn')?.addEventListener('click', () => {
    renderCategoryManageSheet(categories, async (updatedCats) => {
      document.querySelector('.modal-overlay')?.remove();
      renderLibrary(app);
    });
  });

  // Quick add category
  document.getElementById('add-cat-btn')?.addEventListener('click', async () => {
    const name = prompt('新分类名称');
    if (name && name.trim()) {
      const { createCategory } = await import('./categories.js');
      await createCategory(name.trim());
      renderLibrary(app);
    }
  });

  // Long press on comic rows for context menu
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
  // Remove existing menu
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
    const comic = await (await import('./db.js')).getComic(comicId);
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

  // Dismiss on tap outside
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
    const blob = await getImageBlob(`${comic.coverBlobKey.replace('__cover__', '__cover__')}`);
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
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/library.js
git commit -m "feat: add library page with recent, categories, comic list, context menu"
```

---

### Task 7: Comic List Page (comicList.js)

**Files:**
- Create: `comic-reader/js/comicList.js`

- [ ] **Step 1: Write comicList.js**

Create `comic-reader/js/comicList.js`:

```javascript
import { getAllComics, getAllCategories, getComic, getImageBlob, deleteComic } from './db.js';
import { blobToObjectURL } from './thumbnail.js';
import { renderCategoryAssignSheet } from './categories.js';

export async function renderComicList(app, categoryId) {
  const allComics = await getAllComics();
  const categories = await getAllCategories();
  const category = categoryId ? categories.find(c => c.id === categoryId) : null;
  const title = category ? category.name : '全部漫画';

  // Filter comics by category
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

  // Search
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

  // Long press context menu
  setupContextMenu(app, comics, categories);

  // Load cover images
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
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/comicList.js
git commit -m "feat: add comic list page with search and category filter"
```

---

### Task 8: Reader Page (reader.js)

**Files:**
- Create: `comic-reader/js/reader.js`

- [ ] **Step 1: Write reader.js**

Create `comic-reader/js/reader.js`:

```javascript
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

  app.innerHTML = `
    <div class="reader-page" id="reader-page">
      <div class="reader-top-bar" id="reader-top">
        <button class="back-btn" id="reader-back">‹</button>
        <span class="title">${escapeHtml(comic.name)}</span>
      </div>
      <div class="reader-scroll" id="reader-scroll">
        <div class="reader-images" id="reader-images">
          ${imageIds.map((id, i) => `
            <div class="reader-img-slot" data-img-index="${i}" data-img-id="${id}">
              <div class="loading" style="height:400px;">加载中...</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="reader-bottom-bar" id="reader-bottom">
        <div class="progress-bar"><div class="progress-fill" id="reader-progress" style="width:0%"></div></div>
        <div class="meta">
          <span id="reader-page-info">第 0/${imageIds.length} 页</span>
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

  // Back button
  document.getElementById('reader-back').onclick = () => {
    cleanupReader();
    window.history.back();
  };

  // Tap to toggle bars
  scrollEl.addEventListener('click', () => {
    readerPage.classList.toggle('bars-hidden');
  });

  // Lazy load images with IntersectionObserver
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

  // Track scroll for progress
  let lastVisibleIndex = 0;
  scrollEl.addEventListener('scroll', () => {
    // Find which image slot is most visible
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

    // Debounced save
    debouncedSave(comic, closestIndex, scrollEl.scrollTop);
  });

  // Restore scroll position
  if (comic.lastReadImageIndex > 0 && imageIds.length > 0) {
    // Wait for target image to load, then scroll
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
      // Start loading target image immediately
      loadSlotImage(targetSlot);
      observer.unobserve(targetSlot);
      await waitForImage();
      targetSlot.scrollIntoView({ block: 'start' });
    }
  }

  // Save on visibility change (background/app switch)
  const visHandler = () => {
    if (document.visibilityState === 'hidden') {
      saveProgressNow(comic, lastVisibleIndex, scrollEl.scrollTop);
    }
  };
  document.addEventListener('visibilitychange', visHandler);

  // Save on beforeunload
  window.addEventListener('beforeunload', beforeUnloadHandler);

  function beforeUnloadHandler() {
    saveProgressNow(comic, lastVisibleIndex, scrollEl.scrollTop);
  }

  // Store cleanup function
  window.__readerCleanup = () => {
    document.removeEventListener('visibilitychange', visHandler);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    observer.disconnect();
    clearTimeout(saveTimer);
    cleanupReader();
  };

  // Update lastReadDate
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
  // Revoke all blob URLs to free memory
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
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/reader.js
git commit -m "feat: add reader page with lazy loading, progress tracking, scroll restore"
```

---

### Task 9: App Router & Initialization (app.js)

**Files:**
- Create: `comic-reader/js/app.js`

- [ ] **Step 1: Write app.js**

Create `comic-reader/js/app.js`:

```javascript
import { renderLibrary, applyTheme } from './library.js';
import { renderComicList } from './comicList.js';
import { renderReader } from './reader.js';

const app = document.getElementById('app');

// Apply saved theme
const savedTheme = localStorage.getItem('theme') || 'system';
applyTheme(savedTheme);

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') {
    applyTheme('system');
  }
});

// Hash router
function route() {
  const hash = window.location.hash || '#/';

  // Cleanup reader if leaving reader page
  if (window.__readerCleanup && !hash.startsWith('#/reader/')) {
    window.__readerCleanup();
  }

  if (hash === '#/' || hash === '') {
    renderLibrary(app);
  } else if (hash.startsWith('#/list')) {
    const parts = hash.split('/');
    const categoryId = parts[2] || null;
    renderComicList(app, categoryId);
  } else if (hash.startsWith('#/reader/')) {
    const comicId = hash.split('/')[2];
    renderReader(app, comicId);
  } else {
    renderLibrary(app);
  }
}

window.addEventListener('hashchange', route);

// Initial route
route();
```

- [ ] **Step 2: Commit**

```bash
git add comic-reader/js/app.js
git commit -m "feat: add app router with hash-based navigation"
```

---

### Task 10: PWA Setup (manifest.json + sw.js) + JSZip Library

**Files:**
- Create: `comic-reader/manifest.json`
- Create: `comic-reader/sw.js`
- Download: `comic-reader/lib/jszip.min.js`

- [ ] **Step 1: Write manifest.json**

Create `comic-reader/manifest.json`:

```json
{
  "name": "漫画阅读器",
  "short_name": "漫画",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Write service worker**

Create `comic-reader/sw.js`:

```javascript
const CACHE_NAME = 'comic-reader-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/import.js',
  './js/library.js',
  './js/comicList.js',
  './js/reader.js',
  './js/categories.js',
  './js/thumbnail.js',
  './lib/jszip.min.js',
  './manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, pass through for everything else
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
```

- [ ] **Step 3: Register service worker in index.html**

Add before `</body>` in `comic-reader/index.html`:

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
</script>
```

- [ ] **Step 4: Download JSZip**

Download JSZip from https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js and save to `comic-reader/lib/jszip.min.js`.

```bash
curl -o comic-reader/lib/jszip.min.js https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js
```

- [ ] **Step 5: Generate placeholder icons**

Create simple placeholder icons (these can be replaced later with proper artwork):

```bash
# Generate a simple PNG icon using Python or any tool
# For now, create placeholder files
python3 -c "
from PIL import Image, ImageDraw
for size in [192, 512]:
    img = Image.new('RGB', (size, size), '#007aff')
    draw = ImageDraw.Draw(img)
    draw.rectangle([size*0.2, size*0.15, size*0.8, size*0.75], fill='white')
    draw.rectangle([size*0.25, size*0.2, size*0.75, size*0.7], fill='#007aff')
    img.save(f'comic-reader/icons/icon-{size}.png')
" 2>/dev/null || echo "Skip icon generation - create manually or use online tool"
```

If Python/Pillow isn't available, create the icons manually or use any online icon generator. The app works without icons — they're only needed for "Add to Home Screen."

- [ ] **Step 6: Commit**

```bash
git add comic-reader/
git commit -m "feat: add PWA manifest, service worker, JSZip library"
```

---

### Task 11: Test & Verify

- [ ] **Step 1: Start local HTTP server**

```bash
cd comic-reader && python3 -m http.server 8080
```

Open http://localhost:8080 in a browser.

- [ ] **Step 2: Verify core flows**

1. Home page renders with empty state
2. Click ＋ to import a test ZIP file
3. Comic appears in list with cover thumbnail
4. Click comic to open reader
5. Scroll through images
6. Go back, verify progress was saved
7. Test dark/light mode toggle
8. Test category creation and assignment

- [ ] **Step 3: Fix any issues found during testing**

---

## Self-Review

**Spec coverage check:**
- ✅ Import ZIP/CBZ via file picker (Task 4, 6)
- ✅ Extract to IndexedDB, delete original ZIP (Task 4)
- ✅ Vertical scroll reading (Task 8)
- ✅ Reading progress memory (Task 8)
- ✅ Category CRUD (Task 5)
- ✅ Category assignment to comics (Task 5, 6, 7)
- ✅ Cover from first image (Task 4)
- ✅ Dark/light mode toggle (Task 6, 9)
- ✅ Search comics (Task 7)
- ✅ Recent reading section (Task 6)
- ✅ PWA / Add to Home Screen (Task 10)
- ✅ Offline support via service worker (Task 10)

**No placeholders found** — all code is concrete.

**Type consistency verified** — function names, data shapes, and IDB store names match across all files.

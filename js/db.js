const DB_NAME = 'comic-reader';
const DB_VERSION = 2;

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

      if (!db.objectStoreNames.contains('novels')) {
        const novelStore = db.createObjectStore('novels', { keyPath: 'id' });
        novelStore.createIndex('lastReadDate', 'lastReadDate');
        novelStore.createIndex('importDate', 'importDate');
      }

      if (!db.objectStoreNames.contains('novelTags')) {
        const tagStore = db.createObjectStore('novelTags', { keyPath: 'id' });
        tagStore.createIndex('sortOrder', 'sortOrder');
      }

      if (!db.objectStoreNames.contains('novelTexts')) {
        const textStore = db.createObjectStore('novelTexts', { keyPath: 'id' });
        textStore.createIndex('novelId', 'novelId');
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
    tx.objectStore('comics').delete(id);
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
        // Skip cover thumbnail entries
        if (!cursor.value.id.endsWith('/__cover__')) {
          ids.push(cursor.value.id);
        }
        cursor.continue();
      } else {
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

// ===== Novel CRUD =====

export async function addNovel(novel) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novels', 'readwrite');
    tx.objectStore('novels').put(novel);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getNovel(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novels', 'readonly');
    const req = tx.objectStore('novels').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllNovels() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novels', 'readonly');
    const req = tx.objectStore('novels').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteNovel(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['novels', 'novelTexts'], 'readwrite');
    tx.objectStore('novels').delete(id);
    const textStore = tx.objectStore('novelTexts');
    const index = textStore.index('novelId');
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

export async function updateNovel(novel) {
  return addNovel(novel);
}

export async function addNovelText(id, text, novelId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novelTexts', 'readwrite');
    tx.objectStore('novelTexts').put({ id, text, novelId });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getNovelText(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novelTexts', 'readonly');
    const req = tx.objectStore('novelTexts').get(id);
    req.onsuccess = () => resolve(req.result?.text || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ===== Novel Tags =====

export async function addNovelTag(tag) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novelTags', 'readwrite');
    tx.objectStore('novelTags').put(tag);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllNovelTags() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novelTags', 'readonly');
    const req = tx.objectStore('novelTags').getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.sortOrder - b.sortOrder));
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteNovelTag(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('novelTags', 'readwrite');
    tx.objectStore('novelTags').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

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

  const imageIds = [];
  for (let i = 0; i < entries.length; i++) {
    const { path, entry: zipEntry } = entries[i];
    const imageId = `${comicId}/${path}`;
    const blob = await zipEntry.async('blob');
    await addImageBlob(imageId, blob, comicId);
    imageIds.push(imageId);
  }

  const firstBlob = await entries[0].entry.async('blob');
  const thumbBlob = await generateThumbnail(firstBlob);
  if (thumbBlob) {
    await addImageBlob(`${comicId}/__cover__`, thumbBlob, comicId);
  }

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

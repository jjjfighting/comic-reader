import { addNovel, addNovelText, updateNovel } from './db.js';

function generateId() {
  return crypto.randomUUID();
}

export async function importNovelFiles(fileList) {
  const results = [];

  for (const file of fileList) {
    try {
      const novel = await importOneFile(file);
      results.push({ success: true, name: novel.name });
    } catch (err) {
      console.error('Import failed for', file.name, err);
      results.push({ success: false, name: file.name, error: err.message });
    }
  }

  return results;
}

async function importOneFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let text = '';
  let name = file.name.replace(/\.(txt|epub|TEXT|TXT)$/i, '');

  if (ext === 'txt' || ext === 'text') {
    text = await file.text();
    // Try to detect encoding - if garbled, try GBK
    if (text.includes('�') || text.includes('�')) {
      try {
        const buffer = await file.arrayBuffer();
        const decoder = new TextDecoder('gbk');
        text = decoder.decode(buffer);
      } catch (e) {
        // Fall back to original text
      }
    }
  } else if (ext === 'epub') {
    text = await extractEpubText(file);
  } else {
    throw new Error('Unsupported file format: ' + ext);
  }

  if (!text.trim()) {
    throw new Error('No text content found');
  }

  const novelId = generateId();
  const textId = `${novelId}/text`;
  const totalChars = text.length;

  // Store text in chunks if very large (> 500KB per chunk)
  if (text.length > 500000) {
    const chunks = Math.ceil(text.length / 500000);
    for (let i = 0; i < chunks; i++) {
      const chunk = text.slice(i * 500000, (i + 1) * 500000);
      await addNovelText(`${textId}/${i}`, chunk, novelId);
    }
  } else {
    await addNovelText(textId, text, novelId);
  }

  const novel = {
    id: novelId,
    name,
    textKey: textId,
    totalChars,
    totalChunks: text.length > 500000 ? Math.ceil(text.length / 500000) : 1,
    lastReadOffset: 0,
    lastReadDate: null,
    importDate: new Date().toISOString(),
    tags: [],
  };

  await addNovel(novel);
  return novel;
}

async function extractEpubText(file) {
  const zip = await JSZip.loadAsync(file);
  let fullText = '';

  // Find content files in the epub
  const contentFiles = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && (path.endsWith('.html') || path.endsWith('.xhtml') || path.endsWith('.htm'))) {
      contentFiles.push({ path, entry });
    }
  });

  // Sort by path to get reading order
  contentFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  for (const { entry } of contentFiles) {
    const html = await entry.async('string');
    // Strip HTML tags to get plain text
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (text) {
      fullText += text + '\n\n';
    }
  }

  return fullText.trim();
}

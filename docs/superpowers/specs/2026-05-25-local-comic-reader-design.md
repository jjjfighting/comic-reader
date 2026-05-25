# Local Comic Reader — Design Spec (Web/PWA)

## Overview

A client-side web app (PWA) for reading comic/manga images on iPhone. No server needed. Import ZIP/CBZ files via file picker, extract in browser, store in IndexedDB. Add to Home Screen for native-like experience.

## Core Requirements

- Import ZIP/CBZ files via `<input type="file">` file picker
- Extract images in browser, store in IndexedDB, then user deletes original ZIP
- Vertical scroll reading mode (webtoon/strip comic style)
- Reading progress memory per comic (IndexedDB)
- User-manageable categories with comic-to-category assignment
- Manual dark/light mode toggle
- PWA: Add to Home Screen, works offline via service worker
- Cover shows the first image of the comic

## Tech Stack

- Vanilla HTML + CSS + JavaScript (no framework)
- JSZip library for ZIP/CBZ extraction
- IndexedDB (via idb library or raw API) for all data storage
- Service Worker for offline caching
- Web App Manifest for "Add to Home Screen"
- No server, no backend — just static files served locally or hosted

## Data Models (IndexedDB)

### Store: comics
```
{
  id: string (UUID),
  name: string,
  coverBlobKey: string,     // key into imageBlobs store
  totalImages: number,
  lastReadImageIndex: number,
  lastReadScrollOffset: number,
  lastReadDate: Date | null,
  importDate: Date,
  categories: string[]       // array of category IDs
}
```

### Store: categories
```
{
  id: string (UUID),
  name: string,
  sortOrder: number
}
```

### Store: imageBlobs
```
{
  id: string,               // "{comicId}/{filename}"
  blob: Blob,
  comicId: string
}
```

## Pages (Single Page App, hash routing)

### 1. Library Page (Home)

- **Header**: "我的漫画" title + theme toggle button + import button
- **Recent section**: Horizontal scroll of recently read comics (cover thumbnail + name + progress)
- **Category chips**: Horizontal scrollable row. "全部" (default) + user categories + "+" to create
- **All comics list**: Vertical list with cover, name, progress bar
- **Import**: Opens `<input type="file" accept=".zip,.cbz" multiple>`, extracts and stores

### 2. Comic List Page (filtered by category)

- Header with category name + search bar
- Vertical list of comics in that category
- Long-press context menu: assign categories, delete

### 3. Reader Page

- Full-screen vertical scroll of comic images
- Images displayed at full device width, maintaining aspect ratio
- Tap to show/hide top bar (back + title) and bottom bar (page indicator + progress)
- Bars auto-hide after 3 seconds
- Save scroll progress on scroll (debounced 500ms) and on page hide
- Restore scroll position on page load

### 4. Category Management (modal/sheet)

- List of categories with rename/delete
- Input to create new category
- Assign comics to categories via multi-select

## Import Flow

1. User taps import button → `<input type="file">` opens
2. User selects ZIP/CBZ files from Files app (Downloads folder)
3. JSZip extracts images in browser
4. Each image stored as Blob in IndexedDB `imageBlobs` store
5. Comic metadata stored in `comics` store
6. First image used as cover thumbnail
7. User can now delete the original ZIP from Files app

## Image Loading

- **Covers/thumbnails**: Generate small canvas-resized thumbnails, store as separate Blobs
- **Reader**: Load full Blob URLs on demand via `URL.createObjectURL()`
- Use `IntersectionObserver` for lazy loading in reader
- Only keep ~5 images decoded at a time, revoke old blob URLs

## Progress Saving

- Debounced save on scroll (500ms)
- Save on `visibilitychange` (tab hide/app background)
- Save on `beforeunload`
- Store: `lastReadImageIndex` + `lastReadScrollOffset`
- Restore: scroll to saved position after images load

## Theme

- CSS custom properties for all colors
- Toggle stored in localStorage as `theme: "light" | "dark"`
- Toggle button in header cycles: light → dark → system
- Reader page always uses dark background

## File Structure

```
comic-reader/
├── index.html                  # Single HTML entry point
├── css/
│   └── style.css               # All styles with CSS variables for theming
├── js/
│   ├── app.js                  # Router, app initialization
│   ├── db.js                   # IndexedDB wrapper (open, CRUD helpers)
│   ├── import.js               # File picker + JSZip extraction
│   ├── library.js              # Library page rendering
│   ├── comicList.js            # Category-filtered list page
│   ├── reader.js               # Reader page with scroll + progress
│   ├── categories.js           # Category CRUD + assignment UI
│   └── thumbnail.js            # Thumbnail generation
├── lib/
│   ├── jszip.min.js            # JSZip library
│   └── idb.min.js              # IndexedDB wrapper (optional)
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Offline Support

- Service Worker caches all app shell files (HTML, CSS, JS, libs)
- Comic data and images are in IndexedDB — already available offline
- No network needed after first load

## Browser Support

- Safari 17+ (iOS 17+)
- Target: iPhone Safari + "Add to Home Screen"

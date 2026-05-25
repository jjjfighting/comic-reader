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

/** Downscales a screenshot to a JPEG data URL so hundreds of trades still fit in storage. */
export function fileToDataUrl(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * TradingView share links (tradingview.com/x/AbC123/) point at a page, not an image.
 * Their snapshot PNG lives at a predictable S3 address.
 */
export function chartImageFromLink(link) {
  const s = (link || '').trim();
  const m = s.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/i);
  if (m) {
    const id = m[1];
    return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
  }
  return /^https?:\/\//i.test(s) ? s : '';
}

export const imageSrc = (t) => t.image || chartImageFromLink(t.imageLink) || null;

/**
 * Mobile Image Compression & Upload Utility
 * Resizes smartphone camera & gallery photos to crisp, lightweight 800px JPEGs (<100KB)
 * to prevent mobile browser memory freezes and IndexedDB quota overflow.
 */

export const compressImageFile = (
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.82
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Check if valid image
    if (!file.type.startsWith('image/')) {
      reject(new Error('الملف المحدد ليس صورة صالحة'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة من الهاتف'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('فشل معالجة أبعاد الصورة'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Clean white background for transparent PNGs converted to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw resized image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Export as JPEG with specified quality
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

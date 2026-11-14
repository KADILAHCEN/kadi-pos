import fs from 'fs';
import zlib from 'zlib';

function createPng(width, height, isMaskable = false) {
  // 1 byte filter type (0 = None) per scanline + width * 4 bytes (RGBA)
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Coordinate from -1 to 1
      const nx = (x / width) * 2 - 1;
      const ny = (y / height) * 2 - 1;
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Base emerald gradient
      const t = (x + y) / (width + height);
      let r = Math.round(16 + t * 4); // #10B981 to #047857
      let g = Math.round(185 - t * 65);
      let b = Math.round(129 - t * 42);
      let a = 255;

      // Draw screen monitor in center
      const screenLeft = isMaskable ? width * 0.25 : width * 0.22;
      const screenRight = isMaskable ? width * 0.75 : width * 0.78;
      const screenTop = isMaskable ? height * 0.25 : height * 0.22;
      const screenBottom = isMaskable ? height * 0.62 : height * 0.65;

      if (x >= screenLeft && x <= screenRight && y >= screenTop && y <= screenBottom) {
        // Dark screen monitor
        r = 15;
        g = 23;
        b = 42;

        // Barcode lines
        const relX = (x - screenLeft) / (screenRight - screenLeft);
        const relY = (y - screenTop) / (screenBottom - screenTop);

        if (relY >= 0.25 && relY <= 0.65) {
          const barcodePattern = Math.sin(relX * 36) > 0.1 || Math.sin(relX * 18 + 1) > 0.3;
          if (barcodePattern) {
            r = 16;
            g = 185;
            b = 129;
          }
        }
        // Scan red laser line
        if (Math.abs(relY - 0.45) < 0.02) {
          r = 244;
          g = 63;
          b = 94;
        }
      }

      // Draw register base
      const baseTop = isMaskable ? height * 0.67 : height * 0.70;
      const baseBottom = isMaskable ? height * 0.82 : height * 0.86;
      const baseLeft = isMaskable ? width * 0.22 : width * 0.18;
      const baseRight = isMaskable ? width * 0.78 : width * 0.82;

      if (x >= baseLeft && x <= baseRight && y >= baseTop && y <= baseBottom) {
        r = 255;
        g = 255;
        b = 255;
        // Indicator dot
        if (Math.hypot(x - (baseRight - width * 0.1), y - (baseTop + (baseBottom - baseTop) * 0.5)) < width * 0.03) {
          r = 16;
          g = 185;
          b = 129;
        }
      }

      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // Color type 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT Chunk
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeUInt32BE(crc >>> 0, 8 + length);
  return chunk;
}

// CRC32 implementation for PNG
function crc32(buf) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  table[i] = c;
}

if (!fs.existsSync('public')) {
  fs.mkdirSync('public', { recursive: true });
}

fs.writeFileSync('public/pwa-192x192.png', createPng(192, 192, false));
fs.writeFileSync('public/pwa-512x512.png', createPng(512, 512, false));
fs.writeFileSync('public/pwa-maskable-512x512.png', createPng(512, 512, true));
fs.writeFileSync('public/apple-touch-icon.png', createPng(180, 180, false));
fs.writeFileSync('public/favicon.ico', createPng(32, 32, false));

console.log('Generated PNG icons successfully!');

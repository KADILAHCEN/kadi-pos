import { createWorker, Worker } from 'tesseract.js';

export interface ImageSharpnessResult {
  isBlurry: boolean;
  sharpnessScore: number;
  meanLuminance: number;
  contrastStd: number;
  reason: 'blur' | 'dark' | 'ok';
}

export interface OfflineOcrRow {
  lineIndex: number;
  rawTextHint: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  detectedNumbers: number[];
  confidence: 'medium' | 'low';
  linePreviewDataUrl?: string;
}

export interface OfflineOcrResult {
  rows: OfflineOcrRow[];
  detectedTotal: number;
  rawNumbersFound: number;
  processedWidth: number;
  processedHeight: number;
  rowBandsFound: number;
  avgConfidenceScore: number;
  looksHandwritten: boolean;
}

/**
 * Loads a Blob or Data URL into a decoded HTMLImageElement.
 */
export const loadBlobToImage = (blobOrDataUrl: Blob | string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const decode = (src: string) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('تعذر فتح الصورة'));
      img.src = src;
    };

    if (typeof blobOrDataUrl === 'string') {
      decode(blobOrDataUrl);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => decode(String(reader.result || ''));
    reader.readAsDataURL(blobOrDataUrl);
  });

/**
 * Pure client-side Laplacian variance & local gradient blur detector.
 * Runs entirely offline on a scaled 420px canvas in ~15ms.
 */
export function assessImageSharpness(img: HTMLImageElement): ImageSharpnessResult {
  const targetW = 420;
  const aspect = (img.height || 1) / Math.max(1, img.width || 1);
  const w = Math.max(80, Math.min(targetW, img.width || targetW));
  const h = Math.max(80, Math.round(w * aspect));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { isBlurry: false, sharpnessScore: 200, meanLuminance: 128, contrastStd: 40, reason: 'ok' };
  }

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Convert to luminance
  const gray = new Float32Array(w * h);
  let lumSum = 0;
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const y = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    gray[i] = y;
    lumSum += y;
  }
  const meanLuminance = lumSum / (w * h);

  let lumVarSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - meanLuminance;
    lumVarSum += d * d;
  }
  const contrastStd = Math.sqrt(lumVarSum / gray.length);

  // Compute 4-neighbor discrete Laplacian variance across the central 76% document region
  const startX = Math.max(2, Math.floor(w * 0.12));
  const endX = Math.min(w - 2, Math.ceil(w * 0.88));
  const startY = Math.max(2, Math.floor(h * 0.12));
  const endY = Math.min(h - 2, Math.ceil(h * 0.88));

  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;

  for (let y = startY; y < endY; y++) {
    const rowOff = y * w;
    for (let x = startX; x < endX; x++) {
      const idx = rowOff + x;
      const lap =
        gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w] - 4 * gray[idx];
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }

  const lapMean = count > 0 ? lapSum / count : 0;
  const lapVariance = count > 0 ? lapSqSum / count - lapMean * lapMean : 0;

  // Thresholds calibrated for mobile camera receipts vs defocused blur:
  // Very dark/washed-out or smeared out-of-focus photos have extremely low high-frequency Laplacian variance.
  const isTooDarkOrFlat = meanLuminance < 28 || contrastStd < 12;
  const isBlurry = lapVariance < 85 || isTooDarkOrFlat;

  canvas.width = 0;
  canvas.height = 0;

  return {
    isBlurry,
    sharpnessScore: Math.round(lapVariance),
    meanLuminance: Math.round(meanLuminance),
    contrastStd: Math.round(contrastStd),
    reason: isTooDarkOrFlat ? 'dark' : isBlurry ? 'blur' : 'ok'
  };
}

// ---------------------------------------------------------------------------
// Offline Local Digit & Number Recognition Engine (Zero External CDN)
// ---------------------------------------------------------------------------

const NORM_W = 10;
const NORM_H = 14;

/**
 * Compact 10x14 bitmap templates for printed + handwritten variants of digits 0-9.
 */
const RAW_DIGIT_PATTERNS: Array<{ char: string; rows: string[] }> = [
  {
    char: '0',
    rows: [
      '..######..',
      '.########.',
      '###....###',
      '##......##',
      '##......##',
      '##......##',
      '##......##',
      '##......##',
      '##......##',
      '##......##',
      '##......##',
      '###....###',
      '.########.',
      '..######..'
    ]
  },
  {
    char: '0',
    rows: [
      '..######..',
      '.###..###.',
      '##....###.',
      '##...####.',
      '##..##.##.',
      '##.##..##.',
      '####...##.',
      '###....##.',
      '##.....##.',
      '##.....##.',
      '##.....##.',
      '###...###.',
      '.#######..',
      '..#####...'
    ]
  },
  {
    char: '1',
    rows: [
      '....###...',
      '...####...',
      '..#####...',
      '.######...',
      '...####...',
      '...####...',
      '...####...',
      '...####...',
      '...####...',
      '...####...',
      '...####...',
      '...####...',
      '.########.',
      '.########.'
    ]
  },
  {
    char: '1',
    rows: [
      '....##....',
      '...###....',
      '..####....',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '....##....',
      '....##....'
    ]
  },
  {
    char: '2',
    rows: [
      '.#######..',
      '#########.',
      '##.....##.',
      '.......##.',
      '.......##.',
      '......###.',
      '.....###..',
      '....###...',
      '...###....',
      '..###.....',
      '.###......',
      '###.......',
      '#########.',
      '#########.'
    ]
  },
  {
    char: '2',
    rows: [
      '..#####...',
      '.#######..',
      '##....##..',
      '......##..',
      '.....###..',
      '....###...',
      '...###....',
      '..###.....',
      '.###......',
      '###.......',
      '##........',
      '##........',
      '########..',
      '########..'
    ]
  },
  {
    char: '3',
    rows: [
      '.#######..',
      '########..',
      '##....###.',
      '......###.',
      '......##..',
      '...#####..',
      '...#####..',
      '......###.',
      '.......##.',
      '.......##.',
      '##.....##.',
      '###...###.',
      '.#######..',
      '..#####...'
    ]
  },
  {
    char: '4',
    rows: [
      '.....###..',
      '....####..',
      '...#####..',
      '..###.##..',
      '.###..##..',
      '###...##..',
      '##....##..',
      '#########.',
      '#########.',
      '......##..',
      '......##..',
      '......##..',
      '......##..',
      '......##..'
    ]
  },
  {
    char: '4',
    rows: [
      '.##...##..',
      '.##...##..',
      '.##...##..',
      '.##...##..',
      '.##...##..',
      '.##...##..',
      '.########.',
      '.########.',
      '......##..',
      '......##..',
      '......##..',
      '......##..',
      '......##..',
      '......##..'
    ]
  },
  {
    char: '5',
    rows: [
      '.########.',
      '.########.',
      '.##.......',
      '.##.......',
      '.#######..',
      '.########.',
      '......###.',
      '.......##.',
      '.......##.',
      '.......##.',
      '##.....##.',
      '###...###.',
      '.#######..',
      '..#####...'
    ]
  },
  {
    char: '6',
    rows: [
      '...#####..',
      '..#######.',
      '.###......',
      '###.......',
      '##........',
      '########..',
      '#########.',
      '###...###.',
      '##.....##.',
      '##.....##.',
      '##.....##.',
      '###...###.',
      '.#######..',
      '..#####...'
    ]
  },
  {
    char: '7',
    rows: [
      '#########.',
      '#########.',
      '......###.',
      '.....###..',
      '.....##...',
      '....###...',
      '....##....',
      '...###....',
      '...##.....',
      '..###.....',
      '..##......',
      '..##......',
      '..##......',
      '..##......'
    ]
  },
  {
    char: '7',
    rows: [
      '#########.',
      '#########.',
      '.....###..',
      '....###...',
      '...###....',
      '..#######.',
      '..#######.',
      '...###....',
      '..###.....',
      '..##......',
      '.###......',
      '.##.......',
      '.##.......',
      '.##.......'
    ]
  },
  {
    char: '8',
    rows: [
      '..######..',
      '.########.',
      '###....###',
      '##......##',
      '###....###',
      '.########.',
      '..######..',
      '.########.',
      '###....###',
      '##......##',
      '##......##',
      '###....###',
      '.########.',
      '..######..'
    ]
  },
  {
    char: '9',
    rows: [
      '..######..',
      '.########.',
      '###....###',
      '##......##',
      '##......##',
      '###...####',
      '.#########',
      '..#######.',
      '.......##.',
      '......###.',
      '.....###..',
      '...####...',
      '.#####....',
      '.####.....'
    ]
  }
];

const COMPILED_TEMPLATES = RAW_DIGIT_PATTERNS.map((tpl) => {
  const vec = new Float32Array(NORM_W * NORM_H);
  for (let y = 0; y < NORM_H; y++) {
    const line = tpl.rows[y] || '';
    for (let x = 0; x < NORM_W; x++) {
      vec[y * NORM_W + x] = line[x] === '#' ? 1 : 0;
    }
  }
  return { char: tpl.char, vec };
});

interface GlyphBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function classifyDigitGlyph(
  binary: Uint8Array,
  imgW: number,
  box: GlyphBox,
  lineHeight: number
): { char: string; score: number } | null {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;

  // Small low punctuation dot/comma near baseline
  if (bw <= Math.max(5, lineHeight * 0.25) && bh <= Math.max(6, lineHeight * 0.28)) {
    return { char: '.', score: 0.8 };
  }

  // Filter obvious noise or overly wide multi-char blobs
  if (bh < Math.max(7, lineHeight * 0.32)) return null;
  const aspect = bw / bh;
  if (aspect > 1.45) return null;

  // Narrow tall stroke is almost certainly digit '1'
  if (aspect < 0.34 && bh >= lineHeight * 0.45) {
    let fg = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        fg += binary[y * imgW + x];
      }
    }
    const density = fg / (bw * bh);
    if (density > 0.36) return { char: '1', score: 0.72 };
  }

  // Resample box to 10x14 feature grid
  const sample = new Float32Array(NORM_W * NORM_H);
  let fgTotal = 0;
  for (let ty = 0; ty < NORM_H; ty++) {
    const sy0 = box.y0 + Math.floor((ty * bh) / NORM_H);
    const sy1 = Math.max(sy0, box.y0 + Math.floor(((ty + 1) * bh) / NORM_H) - 1);
    for (let tx = 0; tx < NORM_W; tx++) {
      const sx0 = box.x0 + Math.floor((tx * bw) / NORM_W);
      const sx1 = Math.max(sx0, box.x0 + Math.floor(((tx + 1) * bw) / NORM_W) - 1);
      let hits = 0;
      let area = 0;
      for (let y = sy0; y <= sy1; y++) {
        for (let x = sx0; x <= sx1; x++) {
          hits += binary[y * imgW + x];
          area++;
        }
      }
      const val = area > 0 ? hits / area : 0;
      sample[ty * NORM_W + tx] = val;
      if (val > 0.35) fgTotal++;
    }
  }

  if (fgTotal < 8) return null;

  let bestChar = '0';
  let bestScore = -1;

  for (const tpl of COMPILED_TEMPLATES) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < sample.length; i++) {
      const a = sample[i];
      const b = tpl.vec[i];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    const cosine = normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
    if (cosine > bestScore) {
      bestScore = cosine;
      bestChar = tpl.char;
    }
  }

  // Threshold tuned so random Arabic/Latin letters don't get misread as confident numbers
  if (bestScore < 0.64) return null;
  return { char: bestChar, score: bestScore };
}

/**
 * Pure offline OCR reader using `<canvas>` integral adaptive thresholding,
 * horizontal row segmentation, glyph isolation, and local digit classification.
 * Extracts quantities & prices even when offline or server AI is unreachable.
 */
export function runOfflineInvoiceNumberOcr(img: HTMLImageElement): OfflineOcrResult {
  const maxW = 800;
  const scale = Math.min(1, maxW / Math.max(1, img.width || 1));
  const w = Math.max(120, Math.round((img.width || 1) * scale));
  const h = Math.max(120, Math.round((img.height || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      rows: [],
      detectedTotal: 0,
      rawNumbersFound: 0,
      processedWidth: w,
      processedHeight: h,
      rowBandsFound: 0,
      avgConfidenceScore: 0,
      looksHandwritten: false
    };
  }

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // 1. Luminance + Integral Image for fast Bradley Adaptive Thresholding
  const gray = new Float32Array(w * h);
  const integral = new Float64Array(w * h);

  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 4;
      const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      gray[idx] = lum;
      rowSum += lum;
      integral[idx] = (y > 0 ? integral[(y - 1) * w + x] : 0) + rowSum;
    }
  }

  // Adaptive local threshold (handles uneven room shadows on paper)
  const binary = new Uint8Array(w * h);
  const winR = Math.max(10, Math.floor(w / 24));
  const sensitivity = 0.87;
  const darkPixelMinContrast = 12;

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - winR);
    const y2 = Math.min(h - 1, y + winR);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - winR);
      const x2 = Math.min(w - 1, x + winR);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[y2 * w + x2] -
        (y1 > 0 ? integral[(y1 - 1) * w + x2] : 0) -
        (x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0) +
        (y1 > 0 && x1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0);
      const localMean = sum / area;
      const val = gray[y * w + x];
      binary[y * w + x] = val < localMean * sensitivity && localMean - val > darkPixelMinContrast ? 1 : 0;
    }
  }

  // 2. Horizontal projection profile to locate text rows
  const rowCounts = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    const off = y * w;
    for (let x = 0; x < w; x++) c += binary[off + x];
    rowCounts[y] = c;
  }

  const minRowInk = Math.max(4, Math.floor(w * 0.008));
  const rowBands: Array<{ y0: number; y1: number }> = [];
  let inBand = false;
  let bandStart = 0;

  for (let y = 0; y < h; y++) {
    if (rowCounts[y] >= minRowInk) {
      if (!inBand) {
        inBand = true;
        bandStart = y;
      }
    } else if (inBand) {
      const bandH = y - bandStart;
      if (bandH >= 8 && bandH <= Math.floor(h * 0.14)) {
        rowBands.push({ y0: Math.max(0, bandStart - 2), y1: Math.min(h - 1, y + 1) });
      }
      inBand = false;
    }
  }

  // 3. Process each row band for numeric tokens & preview strip
  const rows: OfflineOcrRow[] = [];
  let rawNumbersFound = 0;
  let detectedTotal = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (let bIdx = 0; bIdx < rowBands.length && rows.length < 30; bIdx++) {
    const band = rowBands[bIdx];
    const bh = band.y1 - band.y0 + 1;

    // Column projection within row band
    const colCounts = new Int32Array(w);
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let y = band.y0; y <= band.y1; y++) c += binary[y * w + x];
      colCounts[x] = c;
    }

    // Extract glyph horizontal runs
    const rawGlyphs: GlyphBox[] = [];
    let gx0 = -1;
    for (let x = 0; x < w; x++) {
      if (colCounts[x] > 0) {
        if (gx0 === -1) gx0 = x;
      } else if (gx0 !== -1) {
        // Compute vertical tight bounds for this glyph column slice
        let minY = band.y1;
        let maxY = band.y0;
        for (let y = band.y0; y <= band.y1; y++) {
          for (let px = gx0; px < x; px++) {
            if (binary[y * w + px]) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxY >= minY) {
          rawGlyphs.push({ x0: gx0, x1: x - 1, y0: minY, y1: maxY });
        }
        gx0 = -1;
      }
    }

    // Group adjacent glyphs into tokens & decode numeric sequences
    const gapLimit = Math.max(4, Math.round(bh * 0.42));
    const numericTokens: Array<{ value: number; avgScore: number; raw: string; centerX: number }> = [];
    let curChars: Array<{ ch: string; score: number; x0: number; x1: number }> = [];

    const flushToken = () => {
      if (curChars.length === 0) return;
      const str = curChars.map((c) => c.ch).join('').replace(/^\.+|\.+$/g, '');
      const avgScore = curChars.reduce((s, c) => s + c.score, 0) / curChars.length;
      const digitsOnly = str.replace(/\./g, '');
      // Accept practical quantities/prices (1 to 7 digits max, avoids ICE 15-digit/phone)
      if (/^\d{1,5}(\.\d{1,2})?$/.test(str) && digitsOnly.length <= 6) {
        const val = parseFloat(str);
        if (Number.isFinite(val) && val > 0 && val < 50000) {
          const centerX = (curChars[0].x0 + curChars[curChars.length - 1].x1) / 2;
          numericTokens.push({ value: val, avgScore, raw: str, centerX });
        }
      }
      curChars = [];
    };

    for (const g of rawGlyphs) {
      const cls = classifyDigitGlyph(binary, w, g, bh);
      if (!cls) {
        flushToken();
        continue;
      }
      if (curChars.length > 0) {
        const prev = curChars[curChars.length - 1];
        if (g.x0 - prev.x1 > gapLimit) {
          flushToken();
        }
      }
      curChars.push({ ch: cls.char, score: cls.score, x0: g.x0, x1: g.x1 });
    }
    flushToken();

    if (numericTokens.length === 0) continue;

    rawNumbersFound += numericTokens.length;
    const nums = numericTokens.map((t) => t.value);
    const avgRowScore =
      numericTokens.reduce((s, t) => s + t.avgScore, 0) / numericTokens.length;
    scoreSum += avgRowScore;
    scoreCount += 1;

    // Heuristic role assignment (qty, unitCost, lineTotal):
    let quantity = 1;
    let unitCost = 0;
    let lineTotal = 0;

    if (nums.length >= 3) {
      // Often: [qty, unitCost, lineTotal] OR [lineNo, qty, unitCost, total]
      const tail = nums.slice(-3);
      if (Math.abs(tail[0] * tail[1] - tail[2]) <= Math.max(1, tail[2] * 0.15)) {
        quantity = tail[0];
        unitCost = tail[1];
        lineTotal = tail[2];
      } else {
        quantity = tail[0] <= 200 ? Math.max(1, tail[0]) : 1;
        unitCost = tail[1];
        lineTotal = tail[2];
      }
    } else if (nums.length === 2) {
      const [a, b] = nums;
      // Smaller integer usually Qty, larger usually unitCost or lineTotal
      if (a <= 100 && Number.isInteger(a) && b >= a) {
        quantity = a;
        // If b looks like a line total divisible by a nicely, keep unitCost clear for user confirmation
        unitCost = b;
        lineTotal = Number((a * b).toFixed(2));
      } else if (b <= 100 && Number.isInteger(b) && a > b) {
        quantity = b;
        unitCost = a;
        lineTotal = Number((a * b).toFixed(2));
      } else {
        quantity = 1;
        unitCost = Math.max(a, b);
        lineTotal = unitCost;
      }
    } else {
      // Single number on line: if integer <= 50 assume quantity, else price
      const n = nums[0];
      if (n <= 50 && Number.isInteger(n)) {
        quantity = n;
        unitCost = 0;
        lineTotal = 0;
      } else {
        quantity = 1;
        unitCost = n;
        lineTotal = n;
      }
    }

    // Create visual strip thumbnail of the scanned row so merchant can check handwritten numbers side-by-side
    let linePreviewDataUrl: string | undefined;
    try {
      const stripCanvas = document.createElement('canvas');
      stripCanvas.width = Math.min(w, 640);
      stripCanvas.height = Math.max(20, Math.min(64, bh + 6));
      const sCtx = stripCanvas.getContext('2d');
      if (sCtx) {
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
        sCtx.drawImage(
          canvas,
          0,
          Math.max(0, band.y0 - 2),
          w,
          Math.min(h - band.y0, bh + 4),
          0,
          0,
          stripCanvas.width,
          stripCanvas.height
        );
        linePreviewDataUrl = stripCanvas.toDataURL('image/jpeg', 0.72);
      }
      stripCanvas.width = 0;
      stripCanvas.height = 0;
    } catch {
      linePreviewDataUrl = undefined;
    }

    // Track largest plausible grand total if near bottom of document
    if (bIdx >= Math.floor(rowBands.length * 0.65) && lineTotal > detectedTotal) {
      detectedTotal = lineTotal;
    }

    rows.push({
      lineIndex: rows.length + 1,
      rawTextHint: numericTokens.map((t) => t.raw).join(' · '),
      quantity: Math.max(0.5, Number(quantity.toFixed(2))),
      unitCost: Math.max(0, Number(unitCost.toFixed(2))),
      lineTotal: Math.max(0, Number(lineTotal.toFixed(2))),
      detectedNumbers: nums,
      confidence: avgRowScore >= 0.78 ? 'medium' : 'low',
      linePreviewDataUrl
    });
  }

  // Filter out the trailing "TOTAL" footer row if we found >= 2 product rows and bottom row equals sum of previous
  if (rows.length >= 3) {
    const last = rows[rows.length - 1];
    const sumBefore = rows
      .slice(0, -1)
      .reduce((s, r) => s + (r.lineTotal || r.quantity * r.unitCost), 0);
    if (
      last.detectedNumbers.length === 1 &&
      sumBefore > 0 &&
      Math.abs(last.unitCost - sumBefore) <= Math.max(2, sumBefore * 0.12)
    ) {
      detectedTotal = last.unitCost;
      rows.pop();
    }
  }

  canvas.width = 0;
  canvas.height = 0;

  const avgConfidenceScore = scoreCount > 0 ? Number((scoreSum / scoreCount).toFixed(2)) : 0;
  const looksHandwritten =
    (rowBands.length > 0 && rows.length === 0) ||
    (rows.length > 0 && avgConfidenceScore > 0 && avgConfidenceScore < 0.74);

  return {
    rows,
    detectedTotal: Number(detectedTotal.toFixed(2)),
    rawNumbersFound,
    processedWidth: w,
    processedHeight: h,
    rowBandsFound: rowBands.length,
    avgConfidenceScore,
    looksHandwritten
  };
}

// ---------------------------------------------------------------------------
// Tesseract.js Multi-Language Client-Side Invoice OCR (ara + fra + eng)
// ---------------------------------------------------------------------------

export type DetectedInvoiceUnit = 'piece' | 'kg' | 'liter' | 'gram';

export interface TesseractParsedLine {
  name: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  unitType: DetectedInvoiceUnit;
}

export interface TesseractInvoiceOcrResult {
  rawText: string;
  items: TesseractParsedLine[];
  detectedTotal: number;
  supplierHint?: string;
  supplierIce?: string;
  supplierRc?: string;
  invoiceDate?: string;
}

let tesseractWorkerPromise: Promise<Worker> | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = createWorker(['ara', 'fra', 'eng']).catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

const IGNORED_INVOICE_LINE_REGEX =
  /(المجموع|الاجمالي|الإجمالي|الصافي|الباقي|الضريبة|تاريخ|فاتورة|توصيل|هاتف|شكراً|شكرا|توقيع|طابع|السجل|total|sous[\s-]*total|net\s*[aà]\s*payer|tva|ttc|\bht\b|remise|esp[eè]ces|monnaie|rendu|merci|client|fournisseur|produit|facture|ticket|caisse|adresse|marrakech|sefrou|hanout|el\s*kadi|hay\s*jdid|payer|signature|cachet|\btel\b|\bgsm\b|\bice\b|cnss|patente|\brc\b|\bdate\b)/i;

export function detectUnitFromItemName(name: string): DetectedInvoiceUnit {
  const lower = name.toLowerCase();
  if (/(?:\bkg\b|كيلو|كلغ|كغ)/i.test(lower)) return 'kg';
  if (/(?:\b\d*\s*l\b|\bltr\b|\blitre\b|لتر|ليتر)/i.test(lower)) return 'liter';
  if (/(?:\b\d*\s*gr?\b|غرام)/i.test(lower)) return 'gram';
  return 'piece';
}

function extractIsoDateFromLine(line: string): string | undefined {
  const dmy = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2}|\d{2})\b/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const rawYear = dmy[3];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const mNum = Number(month);
    const dNum = Number(day);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${year}-${month}-${day}`;
    }
  }
  const ymd = line.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  return undefined;
}

/**
 * Parses raw OCR text (Arabic / French / English) into structured invoice items + supplier metadata (ICE, RC, Date).
 * Automatically merges duplicate item names by summing their quantities.
 */
export function parseTesseractInvoiceText(text: string): {
  items: TesseractParsedLine[];
  detectedTotal: number;
  supplierHint?: string;
  supplierIce?: string;
  supplierRc?: string;
  invoiceDate?: string;
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const mergedByName = new Map<string, TesseractParsedLine>();
  let detectedTotal = 0;
  let supplierHint: string | undefined;
  let supplierIce: string | undefined;
  let supplierRc: string | undefined;
  let invoiceDate: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract ICE (15-digit Moroccan tax identifier)
    if (!supplierIce) {
      const iceMatch =
        line.match(/\b(?:ice|i\.c\.e)\s*[:#\-]?\s*(\d[\d\s\-]{10,20}\d)/i) ||
        line.match(/\b(00\d{13})\b/);
      if (iceMatch) {
        const cleanIce = iceMatch[1].replace(/\D/g, '');
        if (cleanIce.length >= 12 && cleanIce.length <= 18) {
          supplierIce = cleanIce;
        }
      }
    }

    // Extract RC (Registre de Commerce)
    if (!supplierRc) {
      const rcMatch = line.match(/\b(?:rc|r\.c)\s*[:#\-]?\s*([A-Za-z0-9\u0600-\u06FF\-\/\s]{2,28})/i);
      if (rcMatch) {
        const cleanRc = rcMatch[1].replace(/\s+/g, ' ').trim();
        if (cleanRc.length >= 2) {
          supplierRc = cleanRc;
        }
      }
    }

    // Extract Invoice Date
    if (!invoiceDate) {
      const foundDate = extractIsoDateFromLine(line);
      if (foundDate) {
        invoiceDate = foundDate;
      }
    }

    const normalizedLine = line.replace(/(\d),(\d)/g, '$1.$2');
    const rawNums = normalizedLine.match(/\d+(?:\.\d+)?/g);

    // Early text-only header lines often contain the supplier/store name
    if (!rawNums && i <= 3 && !supplierHint) {
      const cleanHeader = line.replace(/[|:;_~`#*]+/g, ' ').trim();
      if (cleanHeader.length >= 3 && !IGNORED_INVOICE_LINE_REGEX.test(cleanHeader)) {
        supplierHint = cleanHeader.slice(0, 60);
      }
      continue;
    }

    if (!rawNums || rawNums.length === 0) continue;

    // Skip lines that look purely like phone numbers or dates or ICE/RC metadata
    if (extractIsoDateFromLine(line) && rawNums.length <= 3 && !/kg|l\b|pcs/i.test(line)) {
      continue;
    }

    const nums = rawNums
      .map((n) => parseFloat(n))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 100000);

    if (nums.length === 0) continue;

    // Extract candidate total if line mentions Total/المجموع
    if (/(المجموع|الاجمالي|الإجمالي|total|ttc|net\s*[aà]\s*payer)/i.test(line)) {
      const candidate = nums[nums.length - 1];
      if (candidate > detectedTotal) detectedTotal = candidate;
      continue;
    }

    if (IGNORED_INVOICE_LINE_REGEX.test(line)) continue;

    // Strip numeric tokens & punctuation noise to recover item name
    const name = normalizedLine
      .replace(/\d+(?:\.\d+)?/g, ' ')
      .replace(/\b(dh|dhs|mad|x|pcs|pc|u)\b/gi, ' ')
      .replace(/[|\-:_/*.,+=[\]()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (name.length < 2) continue;

    let quantity = 1;
    let unitCost = 0;
    let lineTotal = 0;

    if (nums.length >= 3) {
      const tail = nums.slice(-3);
      if (Math.abs(tail[0] * tail[1] - tail[2]) <= Math.max(1, tail[2] * 0.15)) {
        quantity = tail[0];
        unitCost = tail[1];
        lineTotal = tail[2];
      } else {
        quantity = tail[0] < 100 ? Math.max(1, tail[0]) : 1;
        unitCost = tail[1];
        lineTotal = tail[2];
      }
    } else if (nums.length === 2) {
      const [first, second] = nums;
      if (first < 100 && Number.isInteger(first)) {
        quantity = Math.max(1, first);
        unitCost = second;
        lineTotal = Number((quantity * unitCost).toFixed(2));
      } else if (second < 100 && Number.isInteger(second) && first > second) {
        quantity = Math.max(1, second);
        unitCost = first;
        lineTotal = Number((quantity * unitCost).toFixed(2));
      } else {
        quantity = 1;
        unitCost = second;
        lineTotal = second;
      }
    } else {
      quantity = 1;
      unitCost = nums[0];
      lineTotal = nums[0];
    }

    const unitType = detectUnitFromItemName(name);
    const key = name.toLowerCase();
    const existing = mergedByName.get(key);
    if (existing) {
      existing.quantity = Number((existing.quantity + quantity).toFixed(3));
      if (unitCost > 0) existing.unitCost = unitCost;
      existing.lineTotal = Number((existing.quantity * existing.unitCost).toFixed(2));
    } else {
      mergedByName.set(key, {
        name,
        quantity: Number(quantity.toFixed(3)),
        unitCost: Number(unitCost.toFixed(2)),
        lineTotal: Number(lineTotal.toFixed(2)),
        unitType
      });
    }
  }

  return {
    items: Array.from(mergedByName.values()),
    detectedTotal: Number(detectedTotal.toFixed(2)),
    supplierHint,
    supplierIce,
    supplierRc,
    invoiceDate
  };
}

/**
 * Runs Tesseract.js ('ara' + 'fra' + 'eng') on an invoice photo or data URL.
 */
export async function runTesseractInvoiceOcr(
  imageInput: Blob | string
): Promise<TesseractInvoiceOcrResult> {
  const worker = await getTesseractWorker();
  const ret = await worker.recognize(imageInput);
  const rawText = ret?.data?.text || '';
  const parsed = parseTesseractInvoiceText(rawText);
  return {
    rawText,
    items: parsed.items,
    detectedTotal: parsed.detectedTotal,
    supplierHint: parsed.supplierHint,
    supplierIce: parsed.supplierIce,
    supplierRc: parsed.supplierRc,
    invoiceDate: parsed.invoiceDate
  };
}

// ---------------------------------------------------------------------------
// Remise Box Multi-Line Invoice OCR Parser (BRUT / NET / Vendor / Invoice #)
// ---------------------------------------------------------------------------

export const REMISE_OCR_BLACKLIST = [
  'TOTAL',
  'BRUT',
  'NET A PAYER',
  'TVA',
  'TIMBRE',
  'DROIT',
  'FRAIS',
  'VENDEUR',
  'MONTANT',
  'TTC',
  'HT',
  'REMISE',
  'SOLDE'
] as const;

export function isRemiseBlacklistedName(name: string): boolean {
  const upper = (name || '').toUpperCase().trim();
  if (!upper) return false;
  return REMISE_OCR_BLACKLIST.some((term) => upper.includes(term));
}

export interface RemiseOcrParsedLine {
  name: string;
  qty: number;
  brut: number;
  net: number;
}

export interface RemiseOcrResult {
  rawText: string;
  companyHint?: string;
  vendor?: string;
  vendorCode?: string;
  invoiceNumber?: string;
  items: RemiseOcrParsedLine[];
}

const KNOWN_REMISE_PRODUCTS: Array<{ key: string; name: string }> = [
  { key: 'LEVURE', name: 'LEVURE IDEAL 100 SAC' },
  { key: 'CACAO', name: 'CACAO SPECIAL' },
  { key: 'VANIL', name: 'SUCRE VANILLINE' },
  { key: 'ETUI', name: 'ETUI SUCRE' },
  { key: 'SUCRE', name: 'SUCRE' },
  { key: 'FARINE', name: 'FARINE' },
  { key: 'HUILE', name: 'HUILE' }
];

export function parseRemiseInvoiceText(text: string): Omit<RemiseOcrResult, 'rawText'> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  const upperAll = text.toUpperCase();
  let companyHint: string | undefined;
  if (upperAll.includes('IDEAL')) {
    companyHint = 'IDEAL';
  }

  const vendorMatch = text.match(/Vendeur\s*:?\s*([A-ZÀ-Ÿ][A-ZÀ-Ÿ\s]{2,40})/i);
  const vendor = vendorMatch ? vendorMatch[1].replace(/\s+/g, ' ').trim() : undefined;

  const codeMatch = text.match(/\b(E\d{2,3})\b/i);
  const vendorCode = codeMatch ? codeMatch[1].toUpperCase() : undefined;

  const numMatch =
    text.match(/\b(70\d{8,})\b/) ||
    text.match(/(?:Facture|Bon|BL|N°)\s*[:#\-]?\s*([A-Z0-9\-\/]{5,20})/i);
  const invoiceNumber = numMatch ? numMatch[1].trim() : undefined;

  const products: RemiseOcrParsedLine[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (isRemiseBlacklistedName(upper)) continue;
    if (
      upper.includes('CLIENT') ||
      upper.includes('KADI') ||
      upper.includes('COMMANDE') ||
      upper.includes('DATE')
    ) {
      continue;
    }

    const rawNums = line.match(/(\d+[.,]\d+|\d+)/g);
    if (!rawNums || rawNums.length < 2) continue;

    const cleanName = line
      .replace(/[\d.,]+/g, ' ')
      .replace(/[^A-Za-zÀ-ÿ\u0600-\u06FF ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanName.length < 3 || isRemiseBlacklistedName(cleanName)) continue;

    const parsedNums = rawNums
      .map((n) => parseFloat(n.replace(',', '.')))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 50000);

    if (parsedNums.length < 2) continue;

    const brut = parsedNums[parsedNums.length - 2];
    const net = parsedNums[parsedNums.length - 1];
    const first = parsedNums[0];
    const qty =
      parsedNums.length >= 3 && Number.isInteger(first) && first > 0 && first < 500 ? first : 1;

    if (brut > 0 && net > 0 && brut >= net && brut < 25000) {
      products.push({
        name: cleanName.toUpperCase(),
        qty,
        brut: Number(brut.toFixed(2)),
        net: Number(net.toFixed(2))
      });
    }
  }

  if (products.length === 0) {
    for (const k of KNOWN_REMISE_PRODUCTS) {
      if (upperAll.includes(k.key)) {
        products.push({ name: k.name, qty: 1, brut: 0, net: 0 });
      }
    }
  }

  const deduped = products.filter(
    (p, idx) => products.findIndex((other) => other.name === p.name) === idx
  );

  return {
    companyHint,
    vendor,
    vendorCode,
    invoiceNumber,
    items: deduped
  };
}

export async function runRemiseInvoiceOcr(
  imageInput: Blob | string,
  onProgress?: (pct: number) => void
): Promise<RemiseOcrResult> {
  onProgress?.(15);
  const worker = await getTesseractWorker();
  onProgress?.(55);
  const ret = await worker.recognize(imageInput);
  onProgress?.(95);
  const rawText = ret?.data?.text || '';
  const parsed = parseRemiseInvoiceText(rawText);
  onProgress?.(100);
  return {
    rawText,
    ...parsed
  };
}



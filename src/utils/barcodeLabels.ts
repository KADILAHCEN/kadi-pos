import { jsPDF } from 'jspdf';
import { Product, StoreSettings } from '../types';
import { triggerPdfDownload } from './pdfReport';

// ======================================================
// Pure Code-128B & EAN-13 Barcode Encoder (Zero external deps)
// ======================================================

const CODE128_PATTERNS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011'
];

const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
];
const EAN_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
];
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

export function computeEan13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(first12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function encodeBarcodeModules(rawCode: string): {
  modules: string;
  format: 'EAN13' | 'CODE128';
  displayCode: string;
} {
  const clean = (rawCode || '').trim() || '000000';

  // Valid 12 or 13 digit numeric barcode -> EAN-13
  if (/^\d{12,13}$/.test(clean)) {
    const first12 = clean.slice(0, 12);
    const check = computeEan13CheckDigit(first12);
    const ean13 = clean.length === 13 ? clean : `${first12}${check}`;
    const firstDigit = Number(ean13[0]);
    const parity = EAN_PARITY[firstDigit] || 'LLLLLL';

    let bits = '101'; // left guard
    for (let i = 1; i <= 6; i++) {
      const d = Number(ean13[i]);
      bits += parity[i - 1] === 'G' ? EAN_G[d] : EAN_L[d];
    }
    bits += '01010'; // center guard
    for (let i = 7; i <= 12; i++) {
      const d = Number(ean13[i]);
      bits += EAN_R[d];
    }
    bits += '101'; // right guard
    return { modules: bits, format: 'EAN13', displayCode: ean13 };
  }

  // Fallback / general alphanumeric -> Code-128B
  const sanitized = Array.from(clean)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126 ? ch : '-';
    })
    .join('')
    .slice(0, 28) || '0000';

  let bits = CODE128_PATTERNS[104]; // Start B
  let checksum = 104;
  for (let i = 0; i < sanitized.length; i++) {
    const val = sanitized.charCodeAt(i) - 32;
    checksum += val * (i + 1);
    bits += CODE128_PATTERNS[val] || CODE128_PATTERNS[0];
  }
  const checkVal = checksum % 103;
  bits += CODE128_PATTERNS[checkVal];
  bits += CODE128_PATTERNS[106]; // Stop
  return { modules: bits, format: 'CODE128', displayCode: sanitized };
}

export function drawBarcodeOnCanvas(
  ctx: CanvasRenderingContext2D,
  rawCode: string,
  x: number,
  y: number,
  width: number,
  height: number,
  barColor = '#0f172a'
): string {
  const { modules, displayCode } = encodeBarcodeModules(rawCode);
  const len = modules.length;
  if (len === 0) return displayCode;

  const moduleW = width / len;
  ctx.save();
  ctx.fillStyle = barColor;

  let runStart = -1;
  for (let i = 0; i <= len; i++) {
    const bit = i < len ? modules[i] : '0';
    if (bit === '1' && runStart === -1) {
      runStart = i;
    } else if (bit !== '1' && runStart !== -1) {
      const rx = x + runStart * moduleW;
      const rw = Math.max(0.8, (i - runStart) * moduleW);
      ctx.fillRect(rx, y, rw, height);
      runStart = -1;
    }
  }
  ctx.restore();
  return displayCode;
}

export interface ShelfLabelPrintItem {
  product: Product;
  copies: number;
}

export type ShelfLabelLayout = 'a4_grid' | 'thermal_58' | 'thermal_80';

function getUnitShort(unitType: Product['unitType'], isAr: boolean): string {
  switch (unitType) {
    case 'kg':
      return isAr ? 'كغ' : 'kg';
    case 'liter':
      return isAr ? 'لتر' : 'L';
    case 'box':
      return isAr ? 'كرتون' : 'Box';
    default:
      return isAr ? 'حبة' : 'pc';
  }
}

function drawSingleShelfLabel(
  ctx: CanvasRenderingContext2D,
  product: Product,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    storeName: string;
    currencySymbol: string;
    isAr: boolean;
    showStoreName: boolean;
    showWholesalePrice: boolean;
    showSku: boolean;
  }
) {
  const pad = Math.max(8, Math.round(w * 0.045));
  const { isAr, currencySymbol } = opts;

  ctx.save();
  // Label outer border & clean white background
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Subtle top accent strip
  ctx.fillStyle = '#059669';
  ctx.fillRect(x + 1, y + 1, w - 2, 5);

  let curY = y + pad + 10;

  // Store name + unit badge
  if (opts.showStoreName && opts.storeName) {
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 10px "Cairo", "Segoe UI", sans-serif';
    ctx.textAlign = isAr ? 'right' : 'left';
    ctx.direction = isAr ? 'rtl' : 'ltr';
    ctx.fillText(opts.storeName.slice(0, 28), isAr ? x + w - pad : x + pad, curY, w - pad * 2 - 48);

    ctx.textAlign = isAr ? 'left' : 'right';
    ctx.fillStyle = '#047857';
    ctx.fillText(
      getUnitShort(product.unitType, isAr),
      isAr ? x + pad : x + w - pad,
      curY
    );
    curY += 15;
  }

  // Product name
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${w < 210 ? 12 : 13.5}px "Cairo", "Segoe UI", sans-serif`;
  ctx.textAlign = isAr ? 'right' : 'left';
  ctx.direction = isAr ? 'rtl' : 'ltr';
  const prodName = isAr ? product.name : product.nameEn || product.name;
  ctx.fillText(prodName, isAr ? x + w - pad : x + pad, curY, w - pad * 2);
  curY += 18;

  // Large bold price box
  const priceBoxH = opts.showWholesalePrice && product.wholesalePrice && product.wholesaleMinQty ? 40 : 34;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x + pad, curY - 12, w - pad * 2, priceBoxH);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + pad, curY - 12, w - pad * 2, priceBoxH);

  ctx.fillStyle = '#0f172a';
  ctx.font = `900 ${w < 210 ? 20 : 23}px "Cairo", "Segoe UI", monospace`;
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  ctx.fillText(
    `${product.price.toFixed(2)} ${currencySymbol}`,
    x + w / 2,
    curY + 12,
    w - pad * 2 - 8
  );

  if (opts.showWholesalePrice && product.wholesalePrice && product.wholesaleMinQty) {
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 9.5px "Cairo", "Segoe UI", sans-serif';
    ctx.direction = isAr ? 'rtl' : 'ltr';
    const wsText = isAr
      ? `جملة (+${product.wholesaleMinQty}): ${product.wholesalePrice.toFixed(2)} ${currencySymbol}`
      : `Wholesale (${product.wholesaleMinQty}+): ${product.wholesalePrice.toFixed(2)} ${currencySymbol}`;
    ctx.fillText(wsText, x + w / 2, curY + 24, w - pad * 2 - 6);
  }

  curY += priceBoxH + 2;

  // Scannable Barcode at bottom
  const barcodeTop = Math.max(curY, y + h - 46);
  const barcodeH = Math.max(20, y + h - barcodeTop - 16);
  const codeToEncode = (product.barcode || product.sku || product.id).trim();
  const displayCode = drawBarcodeOnCanvas(
    ctx,
    codeToEncode,
    x + pad + 4,
    barcodeTop,
    w - (pad + 4) * 2,
    barcodeH
  );

  // Human-readable digits + optional SKU
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 9.5px monospace';
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  const footerLine = opts.showSku && product.sku && product.sku !== displayCode
    ? `${displayCode} · ${product.sku}`
    : displayCode;
  ctx.fillText(footerLine, x + w / 2, y + h - 5, w - pad * 2);

  ctx.restore();
}

export function exportShelfLabelsPdf(params: {
  items: ShelfLabelPrintItem[];
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  layout: ShelfLabelLayout;
  showStoreName: boolean;
  showWholesalePrice: boolean;
  showSku: boolean;
}): string {
  const { items, settings, currencySymbol, language, layout, showStoreName, showWholesalePrice, showSku } = params;
  const isAr = language === 'ar';

  // Expand copies
  const flatProducts: Product[] = [];
  items.forEach((entry) => {
    const count = Math.max(1, Math.min(200, Math.round(entry.copies || 1)));
    for (let i = 0; i < count; i++) {
      flatProducts.push(entry.product);
    }
  });

  if (flatProducts.length === 0) return '';

  const timestamp = new Date().toISOString().slice(0, 10);

  if (layout === 'a4_grid') {
    const cols = 3;
    const rowsPerPage = 7;
    const perPage = cols * rowsPerPage;
    const pageW = 794;
    const pageH = 1123;
    const marginX = 28;
    const marginY = 30;
    const gapX = 12;
    const gapY = 12;
    const cardW = (pageW - marginX * 2 - gapX * (cols - 1)) / cols;
    const cardH = (pageH - marginY * 2 - gapY * (rowsPerPage - 1)) / rowsPerPage;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const scale = 2;

    const totalPages = Math.ceil(flatProducts.length / perPage);
    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const canvas = document.createElement('canvas');
      canvas.width = pageW * scale;
      canvas.height = pageH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageW, pageH);

      const slice = flatProducts.slice(pIdx * perPage, (pIdx + 1) * perPage);
      slice.forEach((prod, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx = marginX + col * (cardW + gapX);
        const cy = marginY + row * (cardH + gapY);
        drawSingleShelfLabel(ctx, prod, cx, cy, cardW, cardH, {
          storeName: settings.storeName || 'Kadi POS',
          currencySymbol,
          isAr,
          showStoreName,
          showWholesalePrice,
          showSku
        });
      });

      if (pIdx > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, pdfW, pdfH);
    }

    const filename = `KadiPOS_ShelfLabels_A4_${timestamp}.pdf`;
    triggerPdfDownload(pdf.output('blob'), filename, pdf);
    return filename;
  }

  // Thermal roll: 58mm (~164pt x 110pt) or 80mm (~226pt x 130pt)
  const ptW = layout === 'thermal_58' ? 164 : 226;
  const ptH = layout === 'thermal_58' ? 115 : 136;
  const canvasW = layout === 'thermal_58' ? 230 : 300;
  const canvasH = layout === 'thermal_58' ? 160 : 180;
  const scale = 2;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [ptW, ptH]
  });

  flatProducts.forEach((prod, idx) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvasW * scale;
    canvas.height = canvasH * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    drawSingleShelfLabel(ctx, prod, 4, 4, canvasW - 8, canvasH - 8, {
      storeName: settings.storeName || 'Kadi POS',
      currencySymbol,
      isAr,
      showStoreName,
      showWholesalePrice,
      showSku
    });

    if (idx > 0) pdf.addPage([ptW, ptH], 'landscape');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, ptW, ptH);
  });

  const filename = `KadiPOS_Labels_${layout}_${timestamp}.pdf`;
  triggerPdfDownload(pdf.output('blob'), filename, pdf);
  return filename;
}

export function printShelfLabelsViaIframe(params: {
  items: ShelfLabelPrintItem[];
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  layout: ShelfLabelLayout;
  showStoreName: boolean;
  showWholesalePrice: boolean;
  showSku: boolean;
}): void {
  const { items, settings, currencySymbol, language, layout, showStoreName, showWholesalePrice, showSku } = params;
  const isAr = language === 'ar';
  const flatProducts: Product[] = [];
  items.forEach((entry) => {
    const count = Math.max(1, Math.min(200, Math.round(entry.copies || 1)));
    for (let i = 0; i < count; i++) {
      flatProducts.push(entry.product);
    }
  });
  if (flatProducts.length === 0) return;

  const scale = 2;
  const cardW = layout === 'thermal_58' ? 210 : layout === 'thermal_80' ? 280 : 250;
  const cardH = layout === 'thermal_58' ? 148 : layout === 'thermal_80' ? 172 : 156;

  const imagesHtml = flatProducts
    .map((prod) => {
      const canvas = document.createElement('canvas');
      canvas.width = cardW * scale;
      canvas.height = cardH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cardW, cardH);
      drawSingleShelfLabel(ctx, prod, 2, 2, cardW - 4, cardH - 4, {
        storeName: settings.storeName || 'Kadi POS',
        currencySymbol,
        isAr,
        showStoreName,
        showWholesalePrice,
        showSku
      });
      return `<img src="${canvas.toDataURL('image/png')}" class="label-img" alt="" />`;
    })
    .join('');

  const pageCss =
    layout === 'a4_grid'
      ? `@page { size: A4; margin: 10mm; } .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .label-img { width: 100%; height: auto; page-break-inside: avoid; }`
      : `@page { size: ${layout === 'thermal_58' ? '58mm 40mm' : '80mm 48mm'}; margin: 1mm; } .grid { display: block; } .label-img { width: 100%; height: auto; page-break-after: always; display: block; }`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 0; background: #fff; }
    ${pageCss}
  </style></head><body><div class="grid">${imagesHtml}</div></body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1500);
      }
    }, 250);
  }
}

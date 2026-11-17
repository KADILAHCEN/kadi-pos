import * as XLSX from 'xlsx';
import { Order, Product, Category, StoreSettings, Expense } from '../types';
import { drawStoreLogoBadge, saveCanvasAsPaginatedA4Pdf } from './pdfReport';

export interface ReplenishmentOrderLine {
  productId: string;
  productName: string;
  sku: string;
  currentStock: number;
  dailyVelocity: number;
  daysLeft: number | null;
  recommendedQty: number;
  unitCost: number;
  estimatedTotal: number;
  unitType: string;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kadi:pdf-ready', { detail: { blobUrl: url, filename } }));
  }
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 2000);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ======================================================
// 1. Orders / Sales Report Excel & PDF Exports
// ======================================================
export function exportOrdersToExcel(
  orders: Order[],
  currencySymbol: string,
  language: 'ar' | 'fr' | 'en'
): string {
  const isAr = language === 'ar';
  const rows = orders.map((o, idx) => ({
    '#': idx + 1,
    [isAr ? 'رقم الفاتورة' : 'Order #']: o.orderNumber,
    [isAr ? 'التاريخ' : 'Date']: o.date ? o.date.slice(0, 16).replace('T', ' ') : '',
    [isAr ? 'الفرع' : 'Branch']: o.branchName || '',
    [isAr ? 'الكاشير' : 'Cashier']: o.cashierName || '',
    [isAr ? 'العميل' : 'Customer']: o.customerName || (isAr ? 'عميل نقدي' : 'Walk-in'),
    [isAr ? 'طريقة الدفع' : 'Payment']: o.paymentMethod,
    [isAr ? 'عدد الأصناف' : 'Items']: o.items.length,
    [isAr ? `الإجمالي (${currencySymbol})` : `Total (${currencySymbol})`]: Number(o.grandTotal.toFixed(2)),
    [isAr ? `التكلفة (${currencySymbol})` : `Cost (${currencySymbol})`]: Number(o.costTotal.toFixed(2)),
    [isAr ? `الربح (${currencySymbol})` : `Profit (${currencySymbol})`]: Number(o.profitTotal.toFixed(2)),
    [isAr ? 'الحالة' : 'Status']: o.status
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, isAr ? 'المبيعات' : 'Sales');
  const filename = `KadiPOS_Sales_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadWorkbook(wb, filename);
  return filename;
}

export function exportOrdersToPdf(params: {
  orders: Order[];
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  filterSummary?: string;
}): string {
  const { orders, settings, currencySymbol, language, filterSummary } = params;
  const isAr = language === 'ar';
  const capped = orders.slice(0, 80);

  const width = 794;
  const rowH = 28;
  const height = Math.max(1123, 300 + Math.max(1, capped.length) * rowH + 120);
  const scale = Math.min(2, 12000 / Math.max(1, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 36;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 36;

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts?: { font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number }
  ) => {
    ctx.save();
    ctx.font = opts?.font || '11px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = opts?.color || '#0f172a';
    ctx.textAlign = opts?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (opts?.maxWidth) ctx.fillText(text, x, y, opts.maxWidth);
    else ctx.fillText(text, x, y);
    ctx.restore();
  };

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 84);
  const logoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - 66 : padX + 14,
    curY + 15,
    54
  );
  const titleX = startEdge - (isAr ? 18 + (logoDrawn ? 64 : 0) : -(18 + (logoDrawn ? 64 : 0)));
  drawText(settings.storeName || 'Kadi POS', titleX, curY + 32, {
    font: 'bold 19px "Cairo", sans-serif',
    color: '#ffffff',
    maxWidth: 320
  });
  drawText(`${settings.address || ''} · ${settings.phone || ''}`, titleX, curY + 56, {
    font: '10px "Cairo", sans-serif',
    color: '#cbd5e1',
    maxWidth: 340
  });

  drawText(isAr ? 'سجل المبيعات والفواتير المفصل' : 'Sales & Orders Report', endEdge + (isAr ? 18 : -18), curY + 32, {
    font: 'bold 14px "Cairo", sans-serif',
    color: '#34d399',
    align: isAr ? 'left' : 'right'
  });
  drawText(
    `${new Date().toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR')}${filterSummary ? ` · ${filterSummary}` : ''}`,
    endEdge + (isAr ? 18 : -18),
    curY + 56,
    { font: '10px "Cairo", sans-serif', color: '#e2e8f0', align: isAr ? 'left' : 'right' }
  );

  curY += 104;

  const totalRev = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + o.grandTotal, 0);
  const totalProfit = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + o.profitTotal, 0);

  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect(padX, curY, contentW, 44);
  ctx.strokeStyle = '#6ee7b7';
  ctx.strokeRect(padX, curY, contentW, 44);
  drawText(
    isAr
      ? `عدد الفواتير: ${orders.length} · إجمالي المبيعات: ${totalRev.toFixed(2)} ${currencySymbol} · الأرباح: +${totalProfit.toFixed(2)} ${currencySymbol}`
      : `Orders: ${orders.length} · Gross Sales: ${totalRev.toFixed(2)} ${currencySymbol} · Profit: +${totalProfit.toFixed(2)} ${currencySymbol}`,
    startEdge - (isAr ? 14 : -14),
    curY + 26,
    { font: 'bold 12px "Cairo", sans-serif', color: '#065f46', maxWidth: contentW - 28 }
  );

  curY += 62;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, rowH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, rowH);

  const cols = isAr
    ? {
        num: width - padX - 14,
        date: width - padX - 110,
        cust: width - padX - 240,
        pay: width - padX - 380,
        total: width - padX - 510,
        profit: padX + 14
      }
    : {
        num: padX + 14,
        date: padX + 110,
        cust: padX + 240,
        pay: padX + 380,
        total: padX + 510,
        profit: width - padX - 14
      };

  drawText(isAr ? 'الفاتورة' : 'Order', cols.num, curY + 18, { font: 'bold 10px "Cairo", sans-serif' });
  drawText(isAr ? 'التاريخ' : 'Date', cols.date, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'العميل' : 'Customer', cols.cust, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'الدفع' : 'Payment', cols.pay, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'المبلغ' : 'Total', cols.total, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'الربح' : 'Profit', cols.profit, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: isAr ? 'left' : 'right' });

  curY += rowH;

  capped.forEach((o, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, curY, contentW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, contentW, rowH);

    drawText(o.orderNumber, cols.num, curY + 18, { font: 'bold 10px monospace' });
    drawText(o.date ? o.date.slice(0, 10) : '-', cols.date, curY + 18, { font: '10px monospace', align: 'center', color: '#475569' });
    drawText(o.customerName || (isAr ? 'عميل نقدي' : 'Walk-in'), cols.cust, curY + 18, { font: '10px "Cairo", sans-serif', align: 'center', maxWidth: 120 });
    drawText(o.paymentMethod, cols.pay, curY + 18, { font: '10px monospace', align: 'center', color: '#334155' });
    drawText(`${o.grandTotal.toFixed(2)}`, cols.total, curY + 18, { font: 'bold 10px monospace', align: 'center' });
    drawText(`+${o.profitTotal.toFixed(2)}`, cols.profit, curY + 18, {
      font: 'bold 10px monospace',
      color: o.profitTotal >= 0 ? '#059669' : '#dc2626',
      align: isAr ? 'left' : 'right'
    });
    curY += rowH;
  });

  const filename = `KadiPOS_Sales_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return filename;
}

// ======================================================
// 2. Inventory Catalog Excel & PDF Exports
// ======================================================
export function exportInventoryToExcel(
  products: Product[],
  categories: Category[],
  currencySymbol: string,
  language: 'ar' | 'fr' | 'en'
): string {
  const isAr = language === 'ar';
  const catMap = new Map(categories.map((c) => [c.id, isAr ? c.name : c.nameEn || c.name]));
  const rows = products.map((p, idx) => ({
    '#': idx + 1,
    [isAr ? 'اسم المنتج' : 'Product']: p.name,
    [isAr ? 'الاسم اللاتيني' : 'Name En']: p.nameEn || '',
    SKU: p.sku,
    [isAr ? 'الباركود' : 'Barcode']: p.barcode,
    [isAr ? 'الفئة' : 'Category']: catMap.get(p.categoryId) || '',
    [isAr ? 'الوحدة' : 'Unit']: p.unitType,
    [isAr ? `التكلفة (${currencySymbol})` : `Cost (${currencySymbol})`]: Number(p.costPrice.toFixed(2)),
    [isAr ? `سعر البيع (${currencySymbol})` : `Price (${currencySymbol})`]: Number(p.price.toFixed(2)),
    [isAr ? 'المخزون الحالي' : 'Stock']: p.stock,
    [isAr ? 'حد التنبيه' : 'Alert Threshold']: p.lowStockThreshold,
    [isAr ? 'قيمة المخزون بالتكلفة' : 'Cost Value']: Number((p.stock * p.costPrice).toFixed(2)),
    [isAr ? 'تاريخ الصلاحية' : 'Expiry']: p.expiryDate || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, isAr ? 'المخزون' : 'Inventory');
  const filename = `KadiPOS_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadWorkbook(wb, filename);
  return filename;
}

export function exportInventoryToPdf(params: {
  products: Product[];
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
}): string {
  const { products, settings, currencySymbol, language } = params;
  const isAr = language === 'ar';
  const capped = products.slice(0, 90);

  const width = 794;
  const rowH = 26;
  const height = Math.max(1123, 300 + Math.max(1, capped.length) * rowH + 100);
  const scale = Math.min(2, 12000 / Math.max(1, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 36;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 36;

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts?: { font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number }
  ) => {
    ctx.save();
    ctx.font = opts?.font || '11px "Cairo", sans-serif';
    ctx.fillStyle = opts?.color || '#0f172a';
    ctx.textAlign = opts?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (opts?.maxWidth) ctx.fillText(text, x, y, opts.maxWidth);
    else ctx.fillText(text, x, y);
    ctx.restore();
  };

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 84);
  const logoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - 66 : padX + 14,
    curY + 15,
    54
  );
  const titleX = startEdge - (isAr ? 18 + (logoDrawn ? 64 : 0) : -(18 + (logoDrawn ? 64 : 0)));
  drawText(settings.storeName || 'Kadi POS', titleX, curY + 32, {
    font: 'bold 19px "Cairo", sans-serif',
    color: '#ffffff',
    maxWidth: 320
  });
  drawText(`${settings.address || ''} · ${settings.phone || ''}`, titleX, curY + 56, {
    font: '10px "Cairo", sans-serif',
    color: '#cbd5e1',
    maxWidth: 340
  });

  drawText(isAr ? 'تقرير وجرد المخزون والتقييم' : 'Inventory Stock & Valuation Report', endEdge + (isAr ? 18 : -18), curY + 32, {
    font: 'bold 14px "Cairo", sans-serif',
    color: '#34d399',
    align: isAr ? 'left' : 'right'
  });
  drawText(new Date().toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR'), endEdge + (isAr ? 18 : -18), curY + 56, {
    font: '10px monospace',
    color: '#e2e8f0',
    align: isAr ? 'left' : 'right'
  });

  curY += 104;

  const totalCostVal = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const totalRetailVal = products.reduce((s, p) => s + p.stock * p.price, 0);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(padX, curY, contentW, 42);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, 42);
  drawText(
    isAr
      ? `عدد الأصناف: ${products.length} · رأس مال المخزون (تكلفة): ${totalCostVal.toFixed(2)} ${currencySymbol} · قيمة البيع: ${totalRetailVal.toFixed(2)} ${currencySymbol}`
      : `Items: ${products.length} · Cost Value: ${totalCostVal.toFixed(2)} ${currencySymbol} · Retail Value: ${totalRetailVal.toFixed(2)} ${currencySymbol}`,
    startEdge - (isAr ? 14 : -14),
    curY + 25,
    { font: 'bold 11px "Cairo", sans-serif', color: '#0f172a', maxWidth: contentW - 28 }
  );

  curY += 58;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, rowH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, rowH);

  const cols = isAr
    ? {
        name: width - padX - 12,
        sku: width - padX - 280,
        cost: width - padX - 380,
        price: width - padX - 465,
        stock: width - padX - 555,
        val: padX + 12
      }
    : {
        name: padX + 12,
        sku: padX + 280,
        cost: padX + 380,
        price: padX + 465,
        stock: padX + 555,
        val: width - padX - 12
      };

  drawText(isAr ? 'المنتج' : 'Product', cols.name, curY + 17, { font: 'bold 10px "Cairo", sans-serif' });
  drawText('SKU', cols.sku, curY + 17, { font: 'bold 10px monospace', align: 'center' });
  drawText(isAr ? 'التكلفة' : 'Cost', cols.cost, curY + 17, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'البيع' : 'Price', cols.price, curY + 17, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'المخزون' : 'Stock', cols.stock, curY + 17, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'القيمة' : 'Value', cols.val, curY + 17, { font: 'bold 10px "Cairo", sans-serif', align: isAr ? 'left' : 'right' });

  curY += rowH;

  capped.forEach((p, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, curY, contentW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, contentW, rowH);

    drawText(p.name, cols.name, curY + 17, { font: 'bold 10px "Cairo", sans-serif', maxWidth: 250 });
    drawText(p.sku, cols.sku, curY + 17, { font: '9px monospace', align: 'center', color: '#475569' });
    drawText(p.costPrice.toFixed(2), cols.cost, curY + 17, { font: '10px monospace', align: 'center' });
    drawText(p.price.toFixed(2), cols.price, curY + 17, { font: 'bold 10px monospace', align: 'center' });
    drawText(String(p.stock), cols.stock, curY + 17, {
      font: 'bold 10px monospace',
      align: 'center',
      color: p.stock <= p.lowStockThreshold ? '#dc2626' : '#059669'
    });
    drawText((p.stock * p.costPrice).toFixed(2), cols.val, curY + 17, {
      font: 'bold 10px monospace',
      align: isAr ? 'left' : 'right'
    });
    curY += rowH;
  });

  const filename = `KadiPOS_Inventory_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return filename;
}

// ======================================================
// 3. Replenishment Purchase Order (AI Prediction) Excel & PDF
// ======================================================
export function exportReplenishmentPoToExcel(
  lines: ReplenishmentOrderLine[],
  currencySymbol: string,
  language: 'ar' | 'fr' | 'en'
): string {
  const isAr = language === 'ar';
  const rows = lines.map((l, idx) => ({
    '#': idx + 1,
    [isAr ? 'المنتج' : 'Product']: l.productName,
    SKU: l.sku,
    [isAr ? 'المخزون الحالي' : 'Current Stock']: l.currentStock,
    [isAr ? 'معدل البيع اليومي' : 'Daily Velocity']: Number(l.dailyVelocity.toFixed(2)),
    [isAr ? 'الأيام المتبقية للنفاد' : 'Days to Zero']: l.daysLeft !== null ? l.daysLeft : '-',
    [isAr ? 'الكمية المقترحة للطلب' : 'Order Qty']: l.recommendedQty,
    [isAr ? `تكلفة الوحدة (${currencySymbol})` : `Unit Cost (${currencySymbol})`]: Number(l.unitCost.toFixed(2)),
    [isAr ? `إجمالي الطلبية (${currencySymbol})` : `Est. Total (${currencySymbol})`]: Number(l.estimatedTotal.toFixed(2))
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, isAr ? 'أمر شراء تعويضي' : 'Replenishment PO');
  const filename = `PO_Replenishment_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadWorkbook(wb, filename);
  return filename;
}

export function exportReplenishmentPoToPdf(params: {
  lines: ReplenishmentOrderLine[];
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
}): string {
  const { lines, settings, currencySymbol, language } = params;
  const isAr = language === 'ar';
  const width = 794;
  const rowH = 28;
  const height = Math.max(1123, 300 + Math.max(1, lines.length) * rowH + 120);
  const scale = Math.min(2, 12000 / Math.max(1, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 36;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 36;

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts?: { font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number }
  ) => {
    ctx.save();
    ctx.font = opts?.font || '11px "Cairo", sans-serif';
    ctx.fillStyle = opts?.color || '#0f172a';
    ctx.textAlign = opts?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (opts?.maxWidth) ctx.fillText(text, x, y, opts.maxWidth);
    else ctx.fillText(text, x, y);
    ctx.restore();
  };

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 84);
  const logoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - 66 : padX + 14,
    curY + 15,
    54
  );
  const titleX = startEdge - (isAr ? 18 + (logoDrawn ? 64 : 0) : -(18 + (logoDrawn ? 64 : 0)));
  drawText(settings.storeName || 'Kadi POS', titleX, curY + 32, {
    font: 'bold 19px "Cairo", sans-serif',
    color: '#ffffff',
    maxWidth: 320
  });
  drawText(`${settings.address || ''} · ${settings.phone || ''}`, titleX, curY + 56, {
    font: '10px "Cairo", sans-serif',
    color: '#cbd5e1',
    maxWidth: 340
  });

  drawText(isAr ? 'أمر شراء تعويضي للموردين (تنبؤ AI)' : 'AI Replenishment Purchase Order', endEdge + (isAr ? 18 : -18), curY + 32, {
    font: 'bold 14px "Cairo", sans-serif',
    color: '#34d399',
    align: isAr ? 'left' : 'right'
  });
  drawText(
    `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    endEdge + (isAr ? 18 : -18),
    curY + 56,
    { font: 'bold 11px monospace', color: '#e2e8f0', align: isAr ? 'left' : 'right' }
  );

  curY += 104;

  const totalCost = lines.reduce((s, l) => s + l.estimatedTotal, 0);
  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect(padX, curY, contentW, 44);
  ctx.strokeStyle = '#6ee7b7';
  ctx.strokeRect(padX, curY, contentW, 44);
  drawText(
    isAr
      ? `عدد الأصناف المطلوبة: ${lines.length} · التكلفة التقديرية لأمر الشراء: ${totalCost.toFixed(2)} ${currencySymbol}`
      : `Items to Reorder: ${lines.length} · Estimated PO Total: ${totalCost.toFixed(2)} ${currencySymbol}`,
    startEdge - (isAr ? 14 : -14),
    curY + 26,
    { font: 'bold 12px "Cairo", sans-serif', color: '#065f46' }
  );

  curY += 62;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, rowH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, rowH);

  const cols = isAr
    ? {
        name: width - padX - 14,
        cur: width - padX - 280,
        vel: width - padX - 365,
        qty: width - padX - 460,
        cost: width - padX - 555,
        tot: padX + 14
      }
    : {
        name: padX + 14,
        cur: padX + 280,
        vel: padX + 365,
        qty: padX + 460,
        cost: padX + 555,
        tot: width - padX - 14
      };

  drawText(isAr ? 'الصنف' : 'Product', cols.name, curY + 18, { font: 'bold 10px "Cairo", sans-serif' });
  drawText(isAr ? 'الرصيد' : 'Stock', cols.cur, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'السحب/يوم' : 'Vel/d', cols.vel, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'الكمية المقترحة' : 'Order Qty', cols.qty, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'التكلفة' : 'Unit Cost', cols.cost, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(isAr ? 'الإجمالي' : 'Total', cols.tot, curY + 18, { font: 'bold 10px "Cairo", sans-serif', align: isAr ? 'left' : 'right' });

  curY += rowH;

  lines.forEach((l, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, curY, contentW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, contentW, rowH);

    drawText(l.productName, cols.name, curY + 18, { font: 'bold 10px "Cairo", sans-serif', maxWidth: 245 });
    drawText(String(l.currentStock), cols.cur, curY + 18, { font: 'bold 10px monospace', align: 'center', color: '#dc2626' });
    drawText(l.dailyVelocity.toFixed(1), cols.vel, curY + 18, { font: '10px monospace', align: 'center' });
    drawText(`${l.recommendedQty} ${l.unitType}`, cols.qty, curY + 18, { font: 'bold 10px monospace', align: 'center', color: '#059669' });
    drawText(l.unitCost.toFixed(2), cols.cost, curY + 18, { font: '10px monospace', align: 'center' });
    drawText(`${l.estimatedTotal.toFixed(2)} ${currencySymbol}`, cols.tot, curY + 18, {
      font: 'bold 10px monospace',
      align: isAr ? 'left' : 'right'
    });
    curY += rowH;
  });

  const filename = `PO_Replenishment_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return filename;
}

// ======================================================
// 4. Financial Summary HTML Email Builder (for Scheduled Gmail Reports)
// ======================================================
export function buildScheduledFinancialEmailHtml(params: {
  settings: StoreSettings;
  orders: Order[];
  expenses: Expense[];
  products: Product[];
  currencySymbol: string;
}): string {
  const { settings, orders, expenses, products, currencySymbol } = params;
  const completed = orders.filter((o) => o.status === 'completed');
  const totalSales = completed.reduce((s, o) => s + o.grandTotal, 0);
  const grossProfit = completed.reduce((s, o) => s + o.profitTotal, 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = grossProfit - totalExpenses;
  const criticalCount = products.filter(
    (p) => p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold * 0.2
  ).length;
  const lowCount = products.filter((p) => p.stock <= p.lowStockThreshold).length;

  return `
  <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
    <div style="background: #0f172a; color: #ffffff; padding: 24px;">
      <h1 style="margin: 0; font-size: 20px;">${settings.storeName || 'Kadi POS'}</h1>
      <p style="margin: 6px 0 0; color: #34d399; font-size: 13px;">التقرير المالي والمخزني التلقائي · ${new Date().toLocaleDateString('ar-MA')}</p>
    </div>
    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; width: 50%;">
            <div style="font-size: 12px; color: #64748b;">إجمالي المبيعات (${completed.length} فاتورة)</div>
            <div style="font-size: 18px; font-weight: bold; color: #059669;">${totalSales.toFixed(2)} ${currencySymbol}</div>
          </td>
          <td style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; width: 50%;">
            <div style="font-size: 12px; color: #64748b;">صافي الربح بعد المصاريف</div>
            <div style="font-size: 18px; font-weight: bold; color: ${netProfit >= 0 ? '#059669' : '#dc2626'};">${netProfit.toFixed(2)} ${currencySymbol}</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div style="font-size: 12px; color: #64748b;">إجمالي المصاريف</div>
            <div style="font-size: 16px; font-weight: bold; color: #e11d48;">${totalExpenses.toFixed(2)} ${currencySymbol}</div>
          </td>
          <td style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div style="font-size: 12px; color: #64748b;">تنبيهات المخزون (&lt;20% حرج / منخفض)</div>
            <div style="font-size: 16px; font-weight: bold; color: #d97706;">${criticalCount} حرج / ${lowCount} منخفض</div>
          </td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
        تم إنشاء وإرسال هذا التقرير آلياً من نظام Kadi POS.
      </p>
    </div>
  </div>`;
}

// ======================================================
// 5. Comprehensive AI Financial, Tax & Audit PDF Report
// ======================================================
export function exportAiFinancialTaxPdf(params: {
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  summary: {
    ordersCount: number;
    totalRevenue: number;
    totalGrossProfit: number;
    marginPct: number;
    totalExpenses: number;
    netProfitBeforeTax: number;
    unpaidCpuTotal: number;
    paidCpuTotal: number;
    annualPatente: number;
    zakatDue: number;
    totalReceivables: number;
    inventoryCostValuation: number;
    integrityScore: number;
    auditFlagsCount: number;
    estimatedLeakage: number;
    aiExecutiveSummary?: string;
    aiTaxAdvisory?: string;
  };
}): string {
  const { settings, currencySymbol, language, summary } = params;
  const isAr = language === 'ar';

  const width = 794;
  const height = 1123;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 36;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 36;

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts?: { font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number }
  ) => {
    ctx.save();
    ctx.font = opts?.font || '11px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = opts?.color || '#0f172a';
    ctx.textAlign = opts?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (opts?.maxWidth) ctx.fillText(text, x, y, opts.maxWidth);
    else ctx.fillText(text, x, y);
    ctx.restore();
  };

  const drawWrapped = (text: string, x: number, y: number, maxW: number, lineH: number, color = '#334155') => {
    const words = text.split(/\s+/);
    let line = '';
    let lineY = y;
    for (let i = 0; i < words.length; i++) {
      const testLine = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(testLine).width > maxW && line) {
        drawText(line, x, lineY, { font: '11px "Cairo", "Segoe UI", sans-serif', color });
        line = words[i];
        lineY += lineH;
      } else {
        line = testLine;
      }
    }
    if (line) {
      drawText(line, x, lineY, { font: '11px "Cairo", "Segoe UI", sans-serif', color });
      lineY += lineH;
    }
    return lineY;
  };

  // Header Banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 90);
  const logoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - 72 : padX + 14,
    curY + 15,
    58
  );
  const textAnchor = logoDrawn ? (isAr ? width - padX - 84 : padX + 84) : startEdge + (isAr ? -16 : 16);

  drawText(settings.storeName || 'Kadi POS', textAnchor, curY + 34, {
    font: 'bold 20px "Cairo", "Segoe UI", sans-serif',
    color: '#ffffff'
  });
  drawText(
    isAr
      ? 'التقرير الشامل للمالية والضريبة والتدقيق السري'
      : 'Comprehensive Financial, Tax & Audit Report',
    textAnchor,
    curY + 60,
    { font: 'bold 12px "Cairo", "Segoe UI", sans-serif', color: '#34d399' }
  );
  drawText(new Date().toLocaleDateString(isAr ? 'ar-MA' : 'en-US'), endEdge + (isAr ? 14 : -14), curY + 34, {
    font: 'bold 11px monospace',
    color: '#cbd5e1',
    align: isAr ? 'left' : 'right'
  });

  curY += 110;

  // Section 1: Financial P&L
  drawText(isAr ? '1. الأداء المالي والأرباح' : '1. Financial P&L Summary', startEdge, curY, {
    font: 'bold 13px "Cairo", sans-serif',
    color: '#0f172a'
  });
  curY += 14;

  const kpis = [
    {
      label: isAr ? 'إجمالي المبيعات' : 'Total Revenue',
      val: `${summary.totalRevenue.toFixed(2)} ${currencySymbol}`,
      color: '#0f172a'
    },
    {
      label: isAr ? 'الربح الإجمالي والهامش' : 'Gross Profit & Margin',
      val: `${summary.totalGrossProfit.toFixed(2)} ${currencySymbol} (${summary.marginPct.toFixed(1)}%)`,
      color: '#059669'
    },
    {
      label: isAr ? 'إجمالي المصاريف' : 'Total Expenses',
      val: `${summary.totalExpenses.toFixed(2)} ${currencySymbol}`,
      color: '#e11d48'
    },
    {
      label: isAr ? 'الصافي قبل الضريبة' : 'Net Profit (Pre-Tax)',
      val: `${summary.netProfitBeforeTax.toFixed(2)} ${currencySymbol}`,
      color: summary.netProfitBeforeTax >= 0 ? '#059669' : '#dc2626'
    }
  ];

  const cardW = (contentW - 18) / 2;
  kpis.forEach((k, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = padX + col * (cardW + 18);
    const cy = curY + row * 62;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx, cy, cardW, 52);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(cx, cy, cardW, 52);
    drawText(k.label, isAr ? cx + cardW - 12 : cx + 12, cy + 20, {
      font: 'bold 10px "Cairo", sans-serif',
      color: '#64748b'
    });
    drawText(k.val, isAr ? cx + cardW - 12 : cx + 12, cy + 40, {
      font: 'bold 13px monospace',
      color: k.color
    });
  });

  curY += 144;

  // Section 2: Tax & Compliance
  drawText(
    isAr ? '2. الوضعية الضريبية (CPU + الباتنتا + زكاة التجارة)' : '2. Tax & Compliance Obligations',
    startEdge,
    curY,
    { font: 'bold 13px "Cairo", sans-serif', color: '#0f172a' }
  );
  curY += 14;

  const taxRows = [
    [isAr ? 'ضرائب CPU و CNSS المؤداة' : 'Paid CPU & CNSS', `${summary.paidCpuTotal.toFixed(2)} ${currencySymbol}`],
    [isAr ? 'ضرائب CPU و CNSS غير المؤداة' : 'Unpaid CPU & CNSS', `${summary.unpaidCpuTotal.toFixed(2)} ${currencySymbol}`],
    [isAr ? 'الرسم المهني السنوي (الباتنتا)' : 'Annual Patente Tax', `${summary.annualPatente.toFixed(2)} ${currencySymbol}`],
    [isAr ? 'زكاة التجارة المستحقة (2.5%)' : 'Trade Zakat Due (2.5%)', `${summary.zakatDue.toFixed(2)} ${currencySymbol}`],
    [isAr ? 'مستحقات الكريدي لدى الزبائن' : 'Customer Credit Receivables', `${summary.totalReceivables.toFixed(2)} ${currencySymbol}`],
    [isAr ? 'قيمة المخزون بسعر التكلفة' : 'Inventory Cost Valuation', `${summary.inventoryCostValuation.toFixed(2)} ${currencySymbol}`]
  ];

  taxRows.forEach((r, i) => {
    const ry = curY + i * 26;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, ry, contentW, 26);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, ry, contentW, 26);
    drawText(r[0], startEdge + (isAr ? -12 : 12), ry + 17, { font: 'bold 10px "Cairo", sans-serif' });
    drawText(r[1], endEdge + (isAr ? 12 : -12), ry + 17, {
      font: 'bold 11px monospace',
      align: isAr ? 'left' : 'right'
    });
  });

  curY += taxRows.length * 26 + 26;

  // Section 3: Secret Auditor Summary
  drawText(
    isAr ? '3. خلاصة تدقيق المحقق السري والانضباط المالي' : '3. Secret Internal Auditor Summary',
    startEdge,
    curY,
    { font: 'bold 13px "Cairo", sans-serif', color: '#0f172a' }
  );
  curY += 14;

  ctx.fillStyle = summary.auditFlagsCount > 0 ? '#fff1f2' : '#ecfdf5';
  ctx.fillRect(padX, curY, contentW, 56);
  ctx.strokeStyle = summary.auditFlagsCount > 0 ? '#fecdd3' : '#a7f3d0';
  ctx.strokeRect(padX, curY, contentW, 56);
  drawText(
    isAr
      ? `مؤشر النزاهة والانضباط: ${summary.integrityScore}%  |  التجاوزات المرصودة: ${summary.auditFlagsCount}  |  تقدير التسرب المالي: ${summary.estimatedLeakage.toFixed(2)} ${currencySymbol}`
      : `Integrity Score: ${summary.integrityScore}%  |  Flags: ${summary.auditFlagsCount}  |  Estimated Leakage: ${summary.estimatedLeakage.toFixed(2)} ${currencySymbol}`,
    startEdge + (isAr ? -14 : 14),
    curY + 33,
    {
      font: 'bold 11px "Cairo", sans-serif',
      color: summary.auditFlagsCount > 0 ? '#be123c' : '#047857'
    }
  );
  curY += 78;

  if (summary.aiExecutiveSummary) {
    drawText(isAr ? '4. توصية الذكاء الاصطناعي التنفيذية والضريبية' : '4. Gemini AI Executive & Tax Advisory', startEdge, curY, {
      font: 'bold 13px "Cairo", sans-serif',
      color: '#4c1d95'
    });
    curY += 20;
    ctx.font = '11px "Cairo", "Segoe UI", sans-serif';
    curY = drawWrapped(summary.aiExecutiveSummary, startEdge, curY, contentW - 10, 18, '#1e293b');
    if (summary.aiTaxAdvisory) {
      curY += 10;
      curY = drawWrapped(summary.aiTaxAdvisory, startEdge, curY, contentW - 10, 18, '#4c1d95');
    }
  }

  const filename = `KadiPOS_Financial_Tax_Audit_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return filename;
}

// ======================================================
// 6. Voice Assistant 3-Type Invoice PDF (Daily / Monthly / Customer)
// ======================================================
export function exportVoiceInvoicePdf(params: {
  settings: StoreSettings;
  currencySymbol: string;
  title: string;
  subtitle: string;
  kpis: { label: string; value: string }[];
  rows: { col1: string; col2: string; col3: string }[];
  headers: [string, string, string];
  filenamePrefix: string;
}): string {
  const { settings, title, subtitle, kpis, rows, headers, filenamePrefix } = params;
  const width = 794;
  const rowH = 26;
  const height = Math.max(1123, 340 + Math.max(1, rows.length) * rowH + 80);
  const scale = Math.min(2, 12000 / Math.max(1, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 36;
  const contentW = width - padX * 2;
  const rightEdge = width - padX;
  let curY = 36;

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts?: { font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number }
  ) => {
    ctx.save();
    ctx.font = opts?.font || '11px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = opts?.color || '#0f172a';
    ctx.textAlign = opts?.align || 'right';
    ctx.direction = 'rtl';
    if (opts?.maxWidth) ctx.fillText(text, x, y, opts.maxWidth);
    else ctx.fillText(text, x, y);
    ctx.restore();
  };

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 84);
  const logoDrawn = drawStoreLogoBadge(ctx, settings.storeLogo, rightEdge - 70, curY + 13, 58);
  const anchor = logoDrawn ? rightEdge - 82 : rightEdge - 16;

  drawText(settings.storeName || 'Kadi POS', anchor, curY + 32, {
    font: 'bold 18px "Cairo", sans-serif',
    color: '#ffffff'
  });
  drawText(title, anchor, curY + 56, {
    font: 'bold 13px "Cairo", sans-serif',
    color: '#34d399'
  });
  drawText(subtitle, padX + 16, curY + 46, {
    font: 'bold 11px monospace',
    color: '#cbd5e1',
    align: 'left'
  });

  curY += 102;

  const kpiW = (contentW - (kpis.length - 1) * 10) / Math.max(1, kpis.length);
  kpis.forEach((k, idx) => {
    const kx = padX + idx * (kpiW + 10);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(kx, curY, kpiW, 50);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(kx, curY, kpiW, 50);
    drawText(k.label, kx + kpiW - 10, curY + 18, { font: 'bold 10px "Cairo", sans-serif', color: '#64748b' });
    drawText(k.value, kx + kpiW - 10, curY + 38, { font: 'bold 12px monospace', color: '#0f172a' });
  });

  curY += 68;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, rowH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, rowH);

  drawText(headers[0], rightEdge - 12, curY + 17, { font: 'bold 10px "Cairo", sans-serif' });
  drawText(headers[1], padX + contentW / 2, curY + 17, { font: 'bold 10px "Cairo", sans-serif', align: 'center' });
  drawText(headers[2], padX + 12, curY + 17, { font: 'bold 10px "Cairo", sans-serif', align: 'left' });

  curY += rowH;

  rows.forEach((r, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, curY, contentW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, contentW, rowH);

    drawText(r.col1, rightEdge - 12, curY + 17, { font: 'bold 10px "Cairo", sans-serif', maxWidth: 270 });
    drawText(r.col2, padX + contentW / 2, curY + 17, { font: '10px "Cairo", sans-serif', align: 'center', maxWidth: 230 });
    drawText(r.col3, padX + 12, curY + 17, { font: 'bold 10px monospace', align: 'left', color: '#059669' });
    curY += rowH;
  });

  const filename = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return filename;
}

// ======================================================
// 5. Shop Ear Wholesale Shopping Sheet PDF (قائمة تسوق الجملة - ودن الحانوت)
// ======================================================
export interface ShopEarWholesalePdfItem {
  itemName: string;
  todayCount: number;
  weekCount: number;
  recommendedQty: number;
  wholesaleUnitCost: number;
  suggestedSellPrice: number;
  expectedTotalProfit: number;
  marginPct: number;
  supplierHint?: string;
}

export function exportShopEarWholesalePdf(params: {
  items: ShopEarWholesalePdfItem[];
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  highDemandOnly?: boolean;
}): string {
  const { items, settings, currencySymbol, language, highDemandOnly } = params;
  const isAr = language === 'ar';
  const rows = items.slice(0, 90);

  const width = 794;
  const rowH = 32;
  const height = Math.max(1123, 330 + Math.max(1, rows.length) * rowH + 120);
  const scale = Math.min(2, 12000 / Math.max(1, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 36;
  const contentW = width - padX * 2;
  const rightEdge = width - padX;
  let curY = 36;

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts?: { font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number }
  ) => {
    ctx.save();
    ctx.font = opts?.font || '11px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = opts?.color || '#0f172a';
    ctx.textAlign = opts?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (opts?.maxWidth) ctx.fillText(text, x, y, opts.maxWidth);
    else ctx.fillText(text, x, y);
    ctx.restore();
  };

  // Header
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 88);
  const logoDrawn = drawStoreLogoBadge(ctx, settings.storeLogo, rightEdge - 72, curY + 15, 58);
  const anchor = logoDrawn ? rightEdge - 84 : rightEdge - 18;

  drawText(settings.storeName || 'Kadi POS', anchor, curY + 32, {
    font: 'bold 18px "Cairo", sans-serif',
    color: '#ffffff',
    align: 'right'
  });
  drawText(
    isAr
      ? highDemandOnly
        ? 'قائمة تسوق الجملة — السلع المطلوبة بكثرة (ودن الحانوت)'
        : 'ورقة ودن الحانوت — قائمة تسوق الجملة الجاهزة'
      : 'Shop Ear Wholesale Shopping List',
    anchor,
    curY + 58,
    {
      font: 'bold 13px "Cairo", sans-serif',
      color: '#fbbf24',
      align: 'right'
    }
  );
  drawText(new Date().toISOString().slice(0, 10), padX + 16, curY + 48, {
    font: 'bold 11px monospace',
    color: '#cbd5e1',
    align: 'left'
  });

  curY += 106;

  // Totals summary strip
  const totalBudget = rows.reduce((s, r) => s + r.wholesaleUnitCost * r.recommendedQty, 0);
  const totalProfit = rows.reduce((s, r) => s + r.expectedTotalProfit, 0);
  const totalRequests = rows.reduce((s, r) => s + Math.max(r.weekCount, r.todayCount), 0);

  const kpis = [
    { label: isAr ? 'عدد الأصناف' : 'Items', value: String(rows.length) },
    { label: isAr ? 'طلبات الزبناء' : 'Requests', value: String(totalRequests) },
    { label: isAr ? 'تكلفة تقديرية' : 'Est. Cost', value: `${totalBudget.toFixed(0)} ${currencySymbol}` },
    { label: isAr ? 'ربح متوقع' : 'Est. Profit', value: `+${totalProfit.toFixed(0)} ${currencySymbol}` }
  ];

  const kpiW = (contentW - 30) / 4;
  kpis.forEach((k, idx) => {
    const kx = padX + idx * (kpiW + 10);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(kx, curY, kpiW, 50);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(kx, curY, kpiW, 50);
    drawText(k.label, kx + kpiW - 10, curY + 18, {
      font: 'bold 10px "Cairo", sans-serif',
      color: '#64748b',
      align: 'right'
    });
    drawText(k.value, kx + kpiW - 10, curY + 38, {
      font: 'bold 12px monospace',
      color: idx === 3 ? '#059669' : '#0f172a',
      align: 'right'
    });
  });

  curY += 68;

  // Table header
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, rowH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, rowH);

  drawText(isAr ? 'السلعة والمورد المقترح' : 'Item & Supplier', rightEdge - 12, curY + 20, {
    font: 'bold 10px "Cairo", sans-serif',
    align: 'right'
  });
  drawText(isAr ? 'الطلب (سيمانة)' : 'Demand', padX + 340, curY + 20, {
    font: 'bold 10px "Cairo", sans-serif',
    align: 'center'
  });
  drawText(isAr ? 'الكمية للجملة' : 'Order Qty', padX + 235, curY + 20, {
    font: 'bold 10px "Cairo", sans-serif',
    align: 'center'
  });
  drawText(isAr ? 'الهامش المتوقع' : 'Est. Profit', padX + 125, curY + 20, {
    font: 'bold 10px "Cairo", sans-serif',
    align: 'center'
  });
  drawText(isAr ? 'تم' : 'Done', padX + 24, curY + 20, {
    font: 'bold 10px "Cairo", sans-serif',
    align: 'left'
  });

  curY += rowH;

  rows.forEach((r, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, curY, contentW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, contentW, rowH);

    const itemLine = r.supplierHint ? `${r.itemName} (${r.supplierHint})` : r.itemName;
    drawText(itemLine, rightEdge - 12, curY + 20, {
      font: 'bold 10px "Cairo", sans-serif',
      align: 'right',
      maxWidth: 270
    });
    drawText(`${r.weekCount} (${r.todayCount} ${isAr ? 'اليوم' : 'td'})`, padX + 340, curY + 20, {
      font: '10px "Cairo", sans-serif',
      align: 'center'
    });
    drawText(`${r.recommendedQty}`, padX + 235, curY + 20, {
      font: 'bold 11px monospace',
      align: 'center',
      color: '#b45309'
    });
    drawText(
      r.expectedTotalProfit > 0
        ? `+${r.expectedTotalProfit.toFixed(0)} ${currencySymbol} (${r.marginPct}%)`
        : '-',
      padX + 125,
      curY + 20,
      {
        font: 'bold 10px monospace',
        align: 'center',
        color: '#059669'
      }
    );

    // Printable checkbox square
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(padX + 16, curY + 9, 14, 14);
    curY += rowH;
  });

  const filename = `KadiPOS_Wholesale_ShopEar_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return filename;
}


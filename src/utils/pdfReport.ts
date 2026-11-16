import { jsPDF } from 'jspdf';
import { Order, StoreSettings, Branch, Expense, CpuQuarterRecord, CpuTaxSettings, DeliveryZone } from '../types';
import { CustomerDebtInvoiceData } from './debtInvoice';
import { getExpenseCategoryLabel } from './expenses';
import { getQuarterLabel, RetirementProgressSummary } from './cpuTax';
import { cleanPhoneForWhatsApp, openExternalLinkSafely } from './remoteCatalog';

const preloadedLogoCache = new Map<string, HTMLImageElement>();

export function preloadStoreLogo(logoUrl?: string): void {
  if (!logoUrl || typeof Image === 'undefined') return;
  if (preloadedLogoCache.has(logoUrl)) return;
  try {
    const img = new Image();
    img.src = logoUrl;
    preloadedLogoCache.set(logoUrl, img);
  } catch {
    // ignore invalid image URL
  }
}

export function drawStoreLogoBadge(
  ctx: CanvasRenderingContext2D,
  logoUrl: string | undefined,
  x: number,
  y: number,
  size: number = 48
): boolean {
  if (!logoUrl || typeof Image === 'undefined') return false;
  try {
    let img = preloadedLogoCache.get(logoUrl);
    if (!img) {
      img = new Image();
      img.src = logoUrl;
      preloadedLogoCache.set(logoUrl, img);
    }
    if (!img.complete || img.naturalWidth === 0) return false;

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, size, size, 10);
    } else {
      ctx.rect(x, y, size, size);
    }
    ctx.fill();
    ctx.clip();

    const ratio = Math.min((size - 4) / img.naturalWidth, (size - 4) / img.naturalHeight);
    const drawW = img.naturalWidth * ratio;
    const drawH = img.naturalHeight * ratio;
    ctx.drawImage(img, x + (size - drawW) / 2, y + (size - drawH) / 2, drawW, drawH);
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds an A4 paginated jsPDF + Blob cleanly from a high-DPI canvas.
 */
export function buildPaginatedA4PdfBlob(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number
): { blob: Blob; pdf: jsPDF } {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pdfWidth = pdf.internal.pageSize.getWidth(); // ~595.28pt
  const pdfHeight = pdf.internal.pageSize.getHeight(); // ~841.89pt

  // Scaled total height when mapped proportionally to A4 width
  const totalRenderedHeightPt = (logicalHeight * pdfWidth) / logicalWidth;

  if (totalRenderedHeightPt <= pdfHeight + 2) {
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, totalRenderedHeightPt);
  } else {
    // Slice canvas pixel rows cleanly across A4 pages
    const scaleY = canvas.height / logicalHeight;
    const sliceLogicalH = Math.floor((pdfHeight * logicalWidth) / pdfWidth);
    const slicePixelH = Math.max(1, Math.floor(sliceLogicalH * scaleY));

    let offsetY = 0;
    let pageIdx = 0;
    while (offsetY < canvas.height) {
      const remainingH = Math.min(slicePixelH, canvas.height - offsetY);
      if (remainingH <= 0) break;
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.max(1, Math.round(sliceLogicalH * scaleY));
      const pCtx = pageCanvas.getContext('2d');
      if (pCtx) {
        pCtx.fillStyle = '#ffffff';
        pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pCtx.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          remainingH,
          0,
          0,
          canvas.width,
          remainingH
        );
        const pageImg = pageCanvas.toDataURL('image/jpeg', 0.95);
        if (pageIdx > 0) pdf.addPage();
        pdf.addImage(pageImg, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      offsetY += slicePixelH;
      pageIdx++;
    }
  }

  const blob = pdf.output('blob');
  return { blob, pdf };
}

export function triggerPdfDownload(blob: Blob, filename: string, pdfFallback?: jsPDF): void {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.target = '_self';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );

    // Emit recovery event so sandboxed iframes show an interactive clickable download pill if browser suppresses <a download>
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kadi:pdf-ready', {
          detail: { blobUrl: url, filename }
        })
      );
    }

    setTimeout(() => {
      try {
        if (link.parentNode) link.parentNode.removeChild(link);
      } catch {
        // ignore
      }
    }, 2000);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    pdfFallback?.save(filename);
  }
}

/**
 * Robust multi-page A4 PDF saver using Blob URL download (works reliably in iFrames & browsers)
 * and slices tall high-DPI canvases cleanly across A4 portrait pages without vertical squishing.
 */
export function saveCanvasAsPaginatedA4Pdf(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
  filename: string
): void {
  const { blob, pdf } = buildPaginatedA4PdfBlob(canvas, logicalWidth, logicalHeight);
  triggerPdfDownload(blob, filename, pdf);
}

export interface DailyPdfReportInput {
  orders: Order[];
  expenses?: Expense[];
  settings: StoreSettings;
  activeBranch: Branch;
  cashierName?: string;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  reportDate?: string; // YYYY-MM-DD
}

export function generateAndDownloadDailySalesPdf(input: DailyPdfReportInput): {
  filename: string;
  ordersCount: number;
  revenue: number;
} {
  const {
    orders,
    expenses = [],
    settings,
    activeBranch,
    cashierName,
    currencySymbol,
    language,
    reportDate
  } = input;

  const isAr = language === 'ar';
  const targetDate = reportDate || new Date().toISOString().slice(0, 10);

  const dayExpenses = expenses.filter((exp) =>
    exp.date ? exp.date.slice(0, 10) === targetDate : false
  );
  const dayExpensesTotal = dayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Filter completed orders for the target date
  let dayOrders = orders.filter((o) => {
    if (o.status !== 'completed') return false;
    const d = o.date ? o.date.slice(0, 10) : '';
    return d === targetDate;
  });

  // Fallback: if caller passed dashboard today and no orders happened today yet, still summarize today (0s) cleanly
  let revenue = 0;
  let cost = 0;
  let profit = 0;
  let taxes = 0;
  let discounts = 0;

  const paymentMethods: Record<string, { count: number; total: number }> = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    apple_pay: { count: 0, total: 0 },
    split: { count: 0, total: 0 },
    credit: { count: 0, total: 0 }
  };

  const productSalesMap: Record<
    string,
    { name: string; qty: number; revenue: number; profit: number }
  > = {};

  dayOrders.forEach((o) => {
    revenue += o.grandTotal || 0;
    cost += o.costTotal || 0;
    profit += o.profitTotal || 0;
    taxes += o.taxTotal || 0;
    discounts += o.discountTotal || 0;

    const pm = o.paymentMethod || 'cash';
    if (!paymentMethods[pm]) {
      paymentMethods[pm] = { count: 0, total: 0 };
    }
    paymentMethods[pm].count += 1;
    paymentMethods[pm].total += o.grandTotal || 0;

    o.items.forEach((it) => {
      if (!productSalesMap[it.productId]) {
        productSalesMap[it.productId] = {
          name: it.productName,
          qty: 0,
          revenue: 0,
          profit: 0
        };
      }
      productSalesMap[it.productId].qty += it.quantity;
      productSalesMap[it.productId].revenue += it.total;
      productSalesMap[it.productId].profit += it.total - it.costPrice * it.quantity;
    });
  });

  const topProducts = Object.values(productSalesMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const aov = dayOrders.length > 0 ? revenue / dayOrders.length : 0;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const netProfitAfterExpenses = profit - dayExpensesTotal;

  // Render crisp high-resolution A4 canvas (dynamically sized to include Section 4: Expenses Table)
  const scale = 2;
  const width = 794; // A4 @ 96dpi
  const prodRowsH = topProducts.length === 0 ? 44 : topProducts.length * 30;
  const expRowsH = dayExpenses.length === 0 ? 40 : dayExpenses.length * 30;
  const height = Math.max(1180, 560 + prodRowsH + 90 + expRowsH + 210);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // White paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 42;
  let curY = 44;

  // Helper text functions
  const drawText = (
    text: string,
    x: number,
    y: number,
    options?: {
      font?: string;
      color?: string;
      align?: CanvasTextAlign;
      dir?: CanvasDirection;
      maxWidth?: number;
    }
  ) => {
    ctx.save();
    ctx.font = options?.font || '13px "Cairo", "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.fillStyle = options?.color || '#0f172a';
    ctx.textAlign = options?.align || (isAr ? 'right' : 'left');
    ctx.direction = options?.dir || (isAr ? 'rtl' : 'ltr');
    if (options?.maxWidth) {
      ctx.fillText(text, x, y, options.maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  };

  const drawRoundedRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill?: string,
    stroke?: string
  ) => {
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    }
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  };

  // Top Accent Stripe
  ctx.fillStyle = '#059669';
  ctx.fillRect(0, 0, width, 10);

  // Header Section
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  const logoSize = 54;
  const logoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - logoSize : padX,
    curY + 2,
    logoSize
  );
  const textOffset = logoDrawn ? logoSize + 14 : 0;
  const headerTextStart = isAr ? startEdge - textOffset : startEdge + textOffset;

  drawText(
    settings.storeName || (isAr ? 'بقالة صفرو للمواد الغذائية' : 'Store POS'),
    headerTextStart,
    curY + 18,
    { font: 'bold 22px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#0f172a', maxWidth: 360 }
  );

  drawText(
    `${activeBranch.name} (${activeBranch.code}) · ${activeBranch.city}`,
    headerTextStart,
    curY + 42,
    { font: '12px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#475569', maxWidth: 360 }
  );

  drawText(
    `${settings.address || ''} · ${settings.phone || ''}`,
    headerTextStart,
    curY + 60,
    { font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#64748b', maxWidth: 360 }
  );

  // Badge on opposite side
  const badgeW = 195;
  const badgeH = 30;
  const badgeX = isAr ? padX : width - padX - badgeW;
  drawRoundedRect(badgeX, curY, badgeW, badgeH, 6, '#0f172a');
  drawText(
    isAr ? 'تقرير الأداء اليومي للمبيعات' : 'DAILY SALES REPORT',
    badgeX + badgeW / 2,
    curY + 20,
    { font: 'bold 12px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#ffffff', align: 'center' }
  );

  drawText(
    `${isAr ? 'التاريخ:' : 'Date:'} ${targetDate}`,
    endEdge,
    curY + 48,
    { font: 'bold 12px monospace', color: '#0f172a', align: isAr ? 'left' : 'right', dir: 'ltr' }
  );
  drawText(
    `${isAr ? 'وقت التصدير:' : 'Exported:'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    endEdge,
    curY + 64,
    { font: '10px monospace', color: '#64748b', align: isAr ? 'left' : 'right', dir: 'ltr' }
  );

  curY += 86;

  // Divider line
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(width - padX, curY);
  ctx.stroke();

  curY += 24;

  // Section 1: Key Daily KPIs
  drawText(
    isAr ? '1. مؤشرات الأداء الإجمالية لليوم' : '1. Daily Performance Summary',
    startEdge,
    curY,
    { font: 'bold 14px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#334155' }
  );
  curY += 14;

  const kpis = [
    {
      label: isAr ? 'إجمالي المبيعات' : 'Gross Sales',
      val: `${revenue.toFixed(2)} ${currencySymbol}`,
      sub: `${dayOrders.length} ${isAr ? 'فاتورة مكتملة' : 'completed orders'}`,
      color: '#059669'
    },
    {
      label: isAr ? 'إجمالي الأرباح اليومي' : 'Daily Gross Profit',
      val: `+${profit.toFixed(2)} ${currencySymbol}`,
      sub: `${isAr ? 'الصافي بعد المصاريف:' : 'Net:'} ${netProfitAfterExpenses.toFixed(2)}`,
      color: netProfitAfterExpenses >= 0 ? '#047857' : '#dc2626'
    },
    {
      label: isAr ? 'تكلفة البضاعة المباعة' : 'COGS',
      val: `${cost.toFixed(2)} ${currencySymbol}`,
      sub: `${isAr ? 'الخصومات:' : 'Discounts:'} ${discounts.toFixed(2)}`,
      color: '#0f172a'
    },
    {
      label: isAr ? 'متوسط قيمة السلة' : 'Avg Basket (AOV)',
      val: `${aov.toFixed(2)} ${currencySymbol}`,
      sub: `${isAr ? 'الضريبة:' : 'Tax:'} ${taxes.toFixed(2)} ${currencySymbol}`,
      color: '#0f172a'
    }
  ];

  const cardGap = 12;
  const cardW = (width - padX * 2 - cardGap * 3) / 4;
  const cardH = 78;

  kpis.forEach((k, idx) => {
    const cx = isAr
      ? width - padX - (idx + 1) * cardW - idx * cardGap
      : padX + idx * (cardW + cardGap);
    drawRoundedRect(cx, curY, cardW, cardH, 10, '#f8fafc', '#e2e8f0');

    const textPos = isAr ? cx + cardW - 12 : cx + 12;
    drawText(k.label, textPos, curY + 22, {
      font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#64748b'
    });
    drawText(k.val, textPos, curY + 46, {
      font: 'bold 15px monospace',
      color: k.color
    });
    drawText(k.sub, textPos, curY + 64, {
      font: '10px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#94a3b8'
    });
  });

  curY += cardH + 28;

  // Section 2: Payment Methods Breakdown Table
  drawText(
    isAr ? '2. تفصيل المبيعات حسب طرق الدفع' : '2. Payment Methods Breakdown',
    startEdge,
    curY,
    { font: 'bold 14px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#334155' }
  );
  curY += 12;

  const pmLabels: Record<string, string> = {
    cash: isAr ? 'نقد (كاش)' : 'Cash',
    card: isAr ? 'بطاقة بنكية' : 'Card',
    apple_pay: isAr ? 'آبل باي / بدون تلامس' : 'Apple Pay',
    split: isAr ? 'دفع مجزأ' : 'Split Payment',
    credit: isAr ? 'بيع بالكريدي (دفتر الكريدي)' : 'Credit Ledger'
  };

  const tableW = width - padX * 2;
  const rowH = 30;
  // Header row
  drawRoundedRect(padX, curY, tableW, rowH, 6, '#f1f5f9', '#cbd5e1');

  const cols = isAr
    ? {
        name: width - padX - 16,
        count: padX + tableW * 0.48,
        total: padX + tableW * 0.28,
        share: padX + 16
      }
    : {
        name: padX + 16,
        count: padX + tableW * 0.48,
        total: padX + tableW * 0.72,
        share: width - padX - 16
      };

  drawText(isAr ? 'طريقة الدفع' : 'Payment Method', cols.name, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155'
  });
  drawText(isAr ? 'العمليات' : 'Orders', cols.count, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'المبلغ الإجمالي' : 'Total Amount', cols.total, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'النسبة' : 'Share %', cols.share, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: isAr ? 'left' : 'right'
  });

  curY += rowH;

  Object.entries(paymentMethods).forEach(([k, val], rIdx) => {
    const pct = revenue > 0 ? ((val.total / revenue) * 100).toFixed(1) : '0.0';
    ctx.fillStyle = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, curY, tableW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(padX, curY, tableW, rowH);

    drawText(pmLabels[k] || k, cols.name, curY + 20, {
      font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#0f172a'
    });
    drawText(String(val.count), cols.count, curY + 20, {
      font: '11px monospace',
      color: '#475569',
      align: 'center'
    });
    drawText(`${val.total.toFixed(2)} ${currencySymbol}`, cols.total, curY + 20, {
      font: 'bold 11px monospace',
      color: '#0f172a',
      align: 'center'
    });
    drawText(`${pct}%`, cols.share, curY + 20, {
      font: '11px monospace',
      color: '#64748b',
      align: isAr ? 'left' : 'right'
    });

    curY += rowH;
  });

  // Total Footer Row
  drawRoundedRect(padX, curY, tableW, rowH, 4, '#ecfdf5', '#10b981');
  drawText(isAr ? 'المجموع الإجمالي لليوم' : 'Grand Daily Total', cols.name, curY + 20, {
    font: 'bold 12px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#065f46'
  });
  drawText(String(dayOrders.length), cols.count, curY + 20, {
    font: 'bold 12px monospace',
    color: '#065f46',
    align: 'center'
  });
  drawText(`${revenue.toFixed(2)} ${currencySymbol}`, cols.total, curY + 20, {
    font: 'bold 12px monospace',
    color: '#059669',
    align: 'center'
  });
  drawText('100%', cols.share, curY + 20, {
    font: 'bold 12px monospace',
    color: '#065f46',
    align: isAr ? 'left' : 'right'
  });

  curY += rowH + 28;

  // Section 3: Top Selling Products
  drawText(
    isAr ? '3. المنتجات الأكثر مبيعاً وربحاً خلال اليوم' : '3. Top Selling Products of the Day',
    startEdge,
    curY,
    { font: 'bold 14px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#334155' }
  );
  curY += 12;

  drawRoundedRect(padX, curY, tableW, rowH, 6, '#f1f5f9', '#cbd5e1');
  const pCols = isAr
    ? {
        rank: width - padX - 18,
        name: width - padX - 48,
        qty: padX + tableW * 0.38,
        rev: padX + tableW * 0.2,
        prof: padX + 16
      }
    : {
        rank: padX + 16,
        name: padX + 46,
        qty: padX + tableW * 0.52,
        rev: padX + tableW * 0.72,
        prof: width - padX - 16
      };

  drawText('#', pCols.rank, curY + 20, {
    font: 'bold 11px monospace',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'السلعة / الصنف' : 'Item Name', pCols.name, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155'
  });
  drawText(isAr ? 'الكمية' : 'Qty', pCols.qty, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'المبيعات' : 'Revenue', pCols.rev, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'الربح' : 'Profit', pCols.prof, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: isAr ? 'left' : 'right'
  });

  curY += rowH;

  if (topProducts.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, curY, tableW, 44);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, tableW, 44);
    drawText(
      isAr ? 'لا توجد عمليات بيع مسجلة في هذا التاريخ' : 'No completed sales recorded for this date.',
      width / 2,
      curY + 27,
      { font: '12px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#94a3b8', align: 'center' }
    );
    curY += 44;
  } else {
    topProducts.forEach((p, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(padX, curY, tableW, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(padX, curY, tableW, rowH);

      drawText(String(idx + 1), pCols.rank, curY + 20, {
        font: 'bold 11px monospace',
        color: '#64748b',
        align: 'center'
      });
      drawText(p.name, pCols.name, curY + 20, {
        font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#0f172a',
        maxWidth: 270
      });
      drawText(String(Number(p.qty.toFixed(2))), pCols.qty, curY + 20, {
        font: 'bold 11px monospace',
        color: '#334155',
        align: 'center'
      });
      drawText(`${p.revenue.toFixed(2)} ${currencySymbol}`, pCols.rev, curY + 20, {
        font: 'bold 11px monospace',
        color: '#0f172a',
        align: 'center'
      });
      drawText(`+${p.profit.toFixed(2)} ${currencySymbol}`, pCols.prof, curY + 20, {
        font: 'bold 11px monospace',
        color: '#059669',
        align: isAr ? 'left' : 'right'
      });

      curY += rowH;
    });
  }

  curY += 26;

  // Section 4: جدول المصاريف وصافي الربح (Expenses Table & Net Profit Reconciliation)
  drawText(
    isAr ? '4. جدول المصاريف وصافي الربح اليومي' : '4. Expenses Table & Net Profit Summary',
    startEdge,
    curY,
    { font: 'bold 14px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#334155' }
  );
  curY += 12;

  drawRoundedRect(padX, curY, tableW, rowH, 6, '#fef3c7', '#f59e0b');
  const eCols = isAr
    ? {
        idx: width - padX - 18,
        cat: width - padX - 88,
        name: width - padX - 190,
        notes: padX + tableW * 0.25,
        amt: padX + 16
      }
    : {
        idx: padX + 16,
        cat: padX + 75,
        name: padX + 175,
        notes: padX + tableW * 0.65,
        amt: width - padX - 16
      };

  drawText('#', eCols.idx, curY + 20, {
    font: 'bold 11px monospace',
    color: '#78350f',
    align: 'center'
  });
  drawText(isAr ? 'التصنيف' : 'Category', eCols.cat, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#78350f',
    align: 'center'
  });
  drawText(isAr ? 'اسم المصروف' : 'Expense Name', eCols.name, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#78350f'
  });
  drawText(isAr ? 'ملاحظات' : 'Notes', eCols.notes, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#78350f',
    align: 'center'
  });
  drawText(isAr ? 'المبلغ' : 'Amount', eCols.amt, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#78350f',
    align: isAr ? 'left' : 'right'
  });

  curY += rowH;

  if (dayExpenses.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, curY, tableW, 40);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, tableW, 40);
    drawText(
      isAr ? 'لا توجد مصاريف مسجلة في هذا التاريخ' : 'No expenses recorded for this date.',
      width / 2,
      curY + 25,
      { font: '12px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#94a3b8', align: 'center' }
    );
    curY += 40;
  } else {
    dayExpenses.forEach((exp, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fffbeb';
      ctx.fillRect(padX, curY, tableW, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(padX, curY, tableW, rowH);

      drawText(String(idx + 1), eCols.idx, curY + 20, {
        font: 'bold 11px monospace',
        color: '#64748b',
        align: 'center'
      });
      drawText(getExpenseCategoryLabel(exp.category, language), eCols.cat, curY + 20, {
        font: 'bold 10px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#b45309',
        align: 'center'
      });
      drawText(exp.name, eCols.name, curY + 20, {
        font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#0f172a',
        maxWidth: 230
      });
      drawText(exp.notes || '-', eCols.notes, curY + 20, {
        font: '10px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#64748b',
        align: 'center',
        maxWidth: 150
      });
      drawText(`-${Number(exp.amount || 0).toFixed(2)} ${currencySymbol}`, eCols.amt, curY + 20, {
        font: 'bold 11px monospace',
        color: '#dc2626',
        align: isAr ? 'left' : 'right'
      });

      curY += rowH;
    });
  }

  // Expenses & Net Profit Reconciliation Strip
  drawRoundedRect(padX, curY + 6, tableW, 38, 6, '#ecfdf5', '#10b981');
  drawText(
    isAr
      ? `إجمالي المصاريف: ${dayExpensesTotal.toFixed(2)} ${currencySymbol}`
      : `Total Expenses: ${dayExpensesTotal.toFixed(2)} ${currencySymbol}`,
    startEdge - (isAr ? 14 : -14),
    curY + 29,
    { font: 'bold 12px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#dc2626' }
  );
  drawText(
    isAr
      ? `صافي الربح (الأرباح - المصاريف): ${netProfitAfterExpenses >= 0 ? '+' : ''}${netProfitAfterExpenses.toFixed(2)} ${currencySymbol}`
      : `Net Profit (Profit - Expenses): ${netProfitAfterExpenses >= 0 ? '+' : ''}${netProfitAfterExpenses.toFixed(2)} ${currencySymbol}`,
    endEdge + (isAr ? 14 : -14),
    curY + 29,
    {
      font: 'bold 12px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: netProfitAfterExpenses >= 0 ? '#065f46' : '#dc2626',
      align: isAr ? 'left' : 'right'
    }
  );

  // Footer & Signatures at bottom of A4 page
  const footerY = height - 110;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, footerY);
  ctx.lineTo(width - padX, footerY);
  ctx.stroke();

  drawText(
    `${isAr ? 'مسؤول الصندوق / الكاشير:' : 'Cashier:'} ${cashierName || '-'}`,
    startEdge,
    footerY + 24,
    { font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#334155' }
  );
  drawText(
    `${isAr ? 'مدير الفرع:' : 'Branch Manager:'} ${activeBranch.managerName || '-'}`,
    endEdge,
    footerY + 24,
    { font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#334155', align: isAr ? 'left' : 'right' }
  );

  drawText(
    isAr ? 'توقيع الكاشير: _________________________' : 'Cashier Signature: _________________________',
    startEdge,
    footerY + 56,
    { font: '10px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#94a3b8' }
  );
  drawText(
    isAr ? 'ختم ومصادقة الإدارة: _________________________' : 'Manager Seal & Approval: _________________________',
    endEdge,
    footerY + 56,
    { font: '10px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#94a3b8', align: isAr ? 'left' : 'right' }
  );

  // Convert canvas to crisp multi-page A4 PDF
  const filename = `Daily_Sales_Report_${targetDate}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);

  return {
    filename,
    ordersCount: dayOrders.length,
    revenue: Number(revenue.toFixed(2))
  };
}

export interface DetailedInvoicePdfInput {
  order: Order;
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
}

function renderDetailedInvoicePdfCanvas(input: DetailedInvoicePdfInput): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  filename: string;
} {
  const { order, settings, currencySymbol, language } = input;
  const isAr = language === 'ar';

  const items = Array.isArray(order?.items) ? order.items : [];
  const subtotal = Number(order?.subtotal ?? 0) || 0;
  const discountTotal = Number(order?.discountTotal ?? 0) || 0;
  const taxTotal = Number(order?.taxTotal ?? 0) || 0;
  const deliveryFee = Number(order?.deliveryFee ?? 0) || 0;
  const grandTotal = Number(
    order?.grandTotal ?? subtotal - discountTotal + taxTotal + deliveryFee
  ) || 0;
  const paymentLabel = String(order?.paymentMethod || 'cash').toUpperCase();
  const orderNoLabel = String(order?.orderNumber || 'ORDER');
  const safeDate =
    order?.date && !isNaN(new Date(order.date).getTime()) ? new Date(order.date) : new Date();

  const scale = 2;
  const width = 794;
  const rowsHeight = Math.max(1, items.length) * 32;
  const height = Math.max(1123, 340 + rowsHeight + 280);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize PDF canvas context');
  }
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 42;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 44;

  const drawText = (
    text: string,
    x: number,
    y: number,
    options?: {
      font?: string;
      color?: string;
      align?: CanvasTextAlign;
      maxWidth?: number;
    }
  ) => {
    ctx.save();
    ctx.font = options?.font || '13px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = options?.color || '#0f172a';
    ctx.textAlign = options?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (options?.maxWidth) {
      ctx.fillText(text, x, y, options.maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  };

  // Top Header Banner
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 88);

  const invLogoSize = 54;
  const invLogoDrawn = drawStoreLogoBadge(
    ctx,
    settings?.storeLogo,
    isAr ? width - padX - 16 - invLogoSize : padX + 16,
    curY + 17,
    invLogoSize
  );
  const invTitleX = startEdge - (isAr ? 20 + (invLogoDrawn ? invLogoSize + 12 : 0) : -(20 + (invLogoDrawn ? invLogoSize + 12 : 0)));

  drawText(settings?.storeName || 'Kadi POS', invTitleX, curY + 34, {
    font: 'bold 21px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#ffffff',
    maxWidth: 320
  });

  drawText(
    `${settings?.address || ''} · ${settings?.phone || ''}`,
    invTitleX,
    curY + 58,
    {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#cbd5e1',
      maxWidth: 340
    }
  );

  drawText(
    isAr ? 'فاتورة مفصلة بالمنتوجات والثمن' : 'Detailed Itemized Invoice',
    endEdge + (isAr ? 20 : -20),
    curY + 34,
    {
      font: 'bold 16px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#34d399',
      align: isAr ? 'left' : 'right'
    }
  );

  drawText(
    `${isAr ? 'رقم الفاتورة:' : 'Invoice #:'} ${orderNoLabel}`,
    endEdge + (isAr ? 20 : -20),
    curY + 58,
    {
      font: 'bold 12px monospace',
      color: '#f8fafc',
      align: isAr ? 'left' : 'right'
    }
  );

  curY += 108;

  if ((settings?.showReceiptHeaderMsg ?? true) && settings?.receiptHeaderMsg?.trim()) {
    drawText(settings.receiptHeaderMsg.trim(), width / 2, curY - 4, {
      font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#047857',
      align: 'center',
      maxWidth: contentW - 20
    });
    curY += 16;
  }

  // Invoice Metadata Strip
  const hasDeliveryAddress = Boolean(order?.customerPhone || order?.customerAddress);
  const metaH = hasDeliveryAddress ? 84 : 64;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(padX, curY, contentW, metaH);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(padX, curY, contentW, metaH);

  const formattedDate = `${safeDate.toLocaleDateString(
    isAr ? 'ar-MA' : 'fr-FR'
  )} ${safeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  drawText(
    `${isAr ? 'التاريخ:' : 'Date:'} ${formattedDate}`,
    startEdge - (isAr ? 16 : -16),
    curY + 24,
    { font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#334155' }
  );
  drawText(
    `${isAr ? 'العميل:' : 'Customer:'} ${order?.customerName || (isAr ? 'عميل عام' : 'Walk-in')}`,
    startEdge - (isAr ? 16 : -16),
    curY + 46,
    { font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#0f172a' }
  );
  if (hasDeliveryAddress) {
    drawText(
      `${order?.customerPhone ? `📞 ${order.customerPhone}` : ''}${order?.customerPhone && order?.customerAddress ? ' · ' : ''}${order?.customerAddress ? `📍 ${order.customerAddress}` : ''}`,
      startEdge - (isAr ? 16 : -16),
      curY + 68,
      { font: '10px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#475569', maxWidth: 440 }
    );
  }

  drawText(
    `${isAr ? 'الكاشير:' : 'Cashier:'} ${order?.cashierName || '-'}`,
    endEdge + (isAr ? 16 : -16),
    curY + 24,
    {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#334155',
      align: isAr ? 'left' : 'right'
    }
  );
  drawText(
    `${isAr ? 'طريقة الدفع:' : 'Payment:'} ${paymentLabel}`,
    endEdge + (isAr ? 16 : -16),
    curY + 46,
    {
      font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#059669',
      align: isAr ? 'left' : 'right'
    }
  );

  curY += metaH + 22;

  // Table Header
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, 34);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, 34);

  const cols = isAr
    ? {
        idx: width - padX - 18,
        name: width - padX - 46,
        qty: width - padX - 350,
        unit: width - padX - 445,
        disc: width - padX - 545,
        total: padX + 14
      }
    : {
        idx: padX + 18,
        name: padX + 46,
        qty: padX + 350,
        unit: padX + 445,
        disc: padX + 545,
        total: width - padX - 14
      };

  drawText('#', cols.idx, curY + 21, { font: 'bold 11px monospace', color: '#475569', align: 'center' });
  drawText(isAr ? 'المنتوج والوصف' : 'Product Description', cols.name, curY + 21, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155'
  });
  drawText(isAr ? 'الكمية' : 'Qty', cols.qty, curY + 21, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'ثمن الوحدة' : 'Unit Price', cols.unit, curY + 21, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'الخصم' : 'Disc.', cols.disc, curY + 21, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'المجموع' : 'Total', cols.total, curY + 21, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: isAr ? 'left' : 'right'
  });

  curY += 34;

  // Table Rows
  if (items.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, curY, contentW, 36);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, contentW, 36);
    drawText(isAr ? 'لا توجد سلع مسجلة في الفاتورة' : 'No line items', width / 2, curY + 22, {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#94a3b8',
      align: 'center'
    });
    curY += 36;
  } else {
    items.forEach((it, idx) => {
      const rowH = 32;
      const qty = Number(it.quantity ?? 1) || 0;
      const unitPrice = Number(it.price ?? 0) || 0;
      const disc = Number(it.discount ?? 0) || 0;
      const lineTotal = Number(it.total ?? unitPrice * qty - disc) || 0;

      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(padX, curY, contentW, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(padX, curY, contentW, rowH);

      const label = it.variantName ? `${it.productName} (${it.variantName})` : it.productName;

      drawText(String(idx + 1), cols.idx, curY + 20, {
        font: 'bold 11px monospace',
        color: '#64748b',
        align: 'center'
      });
      drawText(label || '-', cols.name, curY + 20, {
        font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#0f172a',
        maxWidth: 270
      });
      drawText(String(qty), cols.qty, curY + 20, {
        font: 'bold 11px monospace',
        color: '#0f172a',
        align: 'center'
      });
      drawText(`${unitPrice.toFixed(2)}`, cols.unit, curY + 20, {
        font: '11px monospace',
        color: '#334155',
        align: 'center'
      });
      drawText(disc > 0 ? `-${disc.toFixed(2)}` : '-', cols.disc, curY + 20, {
        font: '11px monospace',
        color: disc > 0 ? '#dc2626' : '#94a3b8',
        align: 'center'
      });
      drawText(`${lineTotal.toFixed(2)} ${currencySymbol}`, cols.total, curY + 20, {
        font: 'bold 11px monospace',
        color: '#059669',
        align: isAr ? 'left' : 'right'
      });

      curY += rowH;
    });
  }

  curY += 24;

  // Summary Totals Box
  const sumW = 310;
  const sumX = isAr ? padX : width - padX - sumW;
  const hasDelivery = deliveryFee > 0;
  const sumBoxH = hasDelivery ? 140 : 118;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(sumX, curY, sumW, sumBoxH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(sumX, curY, sumW, sumBoxH);

  const labelX = isAr ? sumX + sumW - 14 : sumX + 14;
  const valX = isAr ? sumX + 14 : sumX + sumW - 14;

  drawText(isAr ? 'المجموع الفرعي:' : 'Subtotal:', labelX, curY + 24, {
    font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#475569'
  });
  drawText(`${subtotal.toFixed(2)} ${currencySymbol}`, valX, curY + 24, {
    font: 'bold 11px monospace',
    color: '#0f172a',
    align: isAr ? 'left' : 'right'
  });

  drawText(isAr ? 'الخصم الإجمالي:' : 'Discount:', labelX, curY + 46, {
    font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#475569'
  });
  drawText(`-${discountTotal.toFixed(2)} ${currencySymbol}`, valX, curY + 46, {
    font: 'bold 11px monospace',
    color: discountTotal > 0 ? '#dc2626' : '#64748b',
    align: isAr ? 'left' : 'right'
  });

  drawText(isAr ? 'الضريبة:' : 'VAT:', labelX, curY + 68, {
    font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#475569'
  });
  drawText(`${taxTotal.toFixed(2)} ${currencySymbol}`, valX, curY + 68, {
    font: 'bold 11px monospace',
    color: '#0f172a',
    align: isAr ? 'left' : 'right'
  });

  let nextOffset = 80;
  if (hasDelivery) {
    drawText(
      isAr ? `التوصيل (${order?.deliveryZoneName || 'توصيل'}):` : `Delivery (${order?.deliveryZoneName || 'Zone'}):`,
      labelX,
      curY + 90,
      {
        font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#b45309'
      }
    );
    drawText(`+${deliveryFee.toFixed(2)} ${currencySymbol}`, valX, curY + 90, {
      font: 'bold 11px monospace',
      color: '#b45309',
      align: isAr ? 'left' : 'right'
    });
    nextOffset = 102;
  }

  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(sumX + 12, curY + nextOffset);
  ctx.lineTo(sumX + sumW - 12, curY + nextOffset);
  ctx.stroke();

  drawText(isAr ? 'المجموع النهائي:' : 'Grand Total:', labelX, curY + nextOffset + 22, {
    font: 'bold 14px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#0f172a'
  });
  drawText(`${grandTotal.toFixed(2)} ${currencySymbol}`, valX, curY + nextOffset + 22, {
    font: 'bold 15px monospace',
    color: '#059669',
    align: isAr ? 'left' : 'right'
  });

  // Footer
  const footerY = height - 60;
  const pdfFooterNote =
    (settings?.showReceiptFooterMsg ?? true) && settings?.receiptFooterMsg?.trim()
      ? settings.receiptFooterMsg.replace(/\s*\n\s*/g, ' · ')
      : '';
  drawText(
    `${isAr ? 'الرقم الضريبي:' : 'Tax No:'} ${settings?.taxNumber || '-'}${pdfFooterNote ? ` · ${pdfFooterNote}` : ''}`,
    width / 2,
    footerY,
    {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#64748b',
      align: 'center'
    }
  );

  const cleanOrderNo = orderNoLabel.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `Detailed_Invoice_${cleanOrderNo || 'order'}.pdf`;

  return { canvas, width, height, filename };
}

export function generateDetailedInvoicePdfBlob(input: DetailedInvoicePdfInput): {
  filename: string;
  blob: Blob;
  pdf: jsPDF;
} {
  const { canvas, width, height, filename } = renderDetailedInvoicePdfCanvas(input);
  const { blob, pdf } = buildPaginatedA4PdfBlob(canvas, width, height);
  return { filename, blob, pdf };
}

export function generateAndDownloadDetailedInvoicePdf(input: DetailedInvoicePdfInput): {
  filename: string;
} {
  const { filename, blob, pdf } = generateDetailedInvoicePdfBlob(input);
  triggerPdfDownload(blob, filename, pdf);
  return { filename };
}

export function buildOrderWhatsAppSummaryText(
  order: Order,
  settings: StoreSettings,
  currencySymbol: string,
  language: 'ar' | 'fr' | 'en',
  pdfFilename?: string
): string {
  const isAr = language === 'ar';
  const items = Array.isArray(order?.items) ? order.items : [];
  const safeDate =
    order?.date && !isNaN(new Date(order.date).getTime()) ? new Date(order.date) : new Date();
  const formattedDate = `${safeDate.toLocaleDateString(
    isAr ? 'ar-MA' : 'fr-FR'
  )} ${safeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const lines: string[] = [
    `🧾 *${settings?.storeName || 'Kadi POS'}*`,
    ...((settings?.showReceiptHeaderMsg ?? true) && settings?.receiptHeaderMsg?.trim()
      ? [`✨ ${settings.receiptHeaderMsg.trim()}`]
      : []),
    isAr ? `📄 فاتورة رقم: *${order?.orderNumber || '-'}*` : `📄 Invoice #: *${order?.orderNumber || '-'}*`,
    isAr ? `📅 التاريخ: ${formattedDate}` : `📅 Date: ${formattedDate}`
  ];

  if (order?.customerName) {
    lines.push(isAr ? `👤 الزبون: ${order.customerName}` : `👤 Customer: ${order.customerName}`);
  }
  if (order?.customerAddress) {
    lines.push(isAr ? `📍 العنوان: ${order.customerAddress}` : `📍 Address: ${order.customerAddress}`);
  }

  lines.push('━━━━━━━━━━━━━━');
  if (items.length > 0) {
    lines.push(isAr ? '🛒 *تفاصيل المنتجات:*' : '🛒 *Items:*');
    items.forEach((it, idx) => {
      const qty = Number(it.quantity ?? 1) || 0;
      const unitPrice = Number(it.price ?? 0) || 0;
      const lineTotal = Number(it.total ?? unitPrice * qty) || 0;
      const variant = it.variantName ? ` (${it.variantName})` : '';
      lines.push(
        `${idx + 1}. ${it.productName}${variant} × ${qty} (${unitPrice.toFixed(2)}) = *${lineTotal.toFixed(2)} ${currencySymbol}*`
      );
    });
    lines.push('━━━━━━━━━━━━━━');
  }

  const subtotal = Number(order?.subtotal ?? 0) || 0;
  const discountTotal = Number(order?.discountTotal ?? 0) || 0;
  const taxTotal = Number(order?.taxTotal ?? 0) || 0;
  const deliveryFee = Number(order?.deliveryFee ?? 0) || 0;
  const grandTotal = Number(order?.grandTotal ?? 0) || 0;

  lines.push(
    isAr
      ? `المجموع الفرعي: ${subtotal.toFixed(2)} ${currencySymbol}`
      : `Subtotal: ${subtotal.toFixed(2)} ${currencySymbol}`
  );
  if (discountTotal > 0) {
    lines.push(
      isAr
        ? `الخصم: -${discountTotal.toFixed(2)} ${currencySymbol}`
        : `Discount: -${discountTotal.toFixed(2)} ${currencySymbol}`
    );
  }
  if (taxTotal > 0) {
    lines.push(
      isAr
        ? `الضريبة: ${taxTotal.toFixed(2)} ${currencySymbol}`
        : `VAT: ${taxTotal.toFixed(2)} ${currencySymbol}`
    );
  }
  if (deliveryFee > 0) {
    lines.push(
      isAr
        ? `🚚 التوصيل (${order?.deliveryZoneName || 'توصيل'}): +${deliveryFee.toFixed(2)} ${currencySymbol}`
        : `🚚 Delivery (${order?.deliveryZoneName || ''}): +${deliveryFee.toFixed(2)} ${currencySymbol}`
    );
  }
  lines.push(
    isAr
      ? `💰 *المجموع النهائي: ${grandTotal.toFixed(2)} ${currencySymbol}*`
      : `💰 *Total Due: ${grandTotal.toFixed(2)} ${currencySymbol}*`
  );

  if (pdfFilename) {
    lines.push('');
    lines.push(
      isAr
        ? `📎 مرفق ملف الفاتورة PDF: ${pdfFilename}`
        : `📎 Invoice PDF file: ${pdfFilename}`
    );
  }
  if ((settings?.showReceiptFooterMsg ?? true) && settings?.receiptFooterMsg?.trim()) {
    lines.push(settings.receiptFooterMsg.trim());
  }

  return lines.join('\n');
}

export async function downloadAndSendInvoiceViaWhatsApp(
  input: DetailedInvoicePdfInput & { customerPhoneOverride?: string }
): Promise<{
  filename: string;
  mode: 'native_file_share' | 'download_and_wa_link';
  phoneTargeted: boolean;
}> {
  const { order, settings, currencySymbol, language, customerPhoneOverride } = input;
  const { filename, blob, pdf } = generateDetailedInvoicePdfBlob(input);
  const summaryText = buildOrderWhatsAppSummaryText(order, settings, currencySymbol, language, filename);

  // Always download the PDF file to the user's device first
  triggerPdfDownload(blob, filename, pdf);

  const rawPhone = customerPhoneOverride || order?.customerPhone || '';
  const cleanPhone = cleanPhoneForWhatsApp(rawPhone);
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(summaryText)}`
    : `https://wa.me/?text=${encodeURIComponent(summaryText)}`;

  // On supported mobile browsers, try native Web Share with the actual PDF File
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined') {
    try {
      const pdfFile = new File([blob], filename, { type: 'application/pdf' });
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdfFile] });
      if (canShareFiles && typeof navigator.share === 'function') {
        await navigator.share({
          files: [pdfFile],
          title: `${settings?.storeName || 'Kadi POS'} - ${order?.orderNumber || ''}`,
          text: summaryText
        });
        return {
          filename,
          mode: 'native_file_share',
          phoneTargeted: Boolean(cleanPhone)
        };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          filename,
          mode: 'native_file_share',
          phoneTargeted: Boolean(cleanPhone)
        };
      }
      // Fallback smoothly to WhatsApp deep link below
    }
  }

  openExternalLinkSafely(waUrl);
  return {
    filename,
    mode: 'download_and_wa_link',
    phoneTargeted: Boolean(cleanPhone)
  };
}

export interface CustomerDebtPdfInput {
  data: CustomerDebtInvoiceData;
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
}

function renderCustomerDebtInvoicePdfCanvas(input: CustomerDebtPdfInput): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  filename: string;
} {
  const { data, settings, currencySymbol, language } = input;
  const { customer, purchaseItems, paymentItems, totalPurchasesDebt, totalPayments, remainingDebt } =
    data;
  const isAr = language === 'ar';

  const scale = 2;
  const width = 794;
  const rowH = 30;
  const purchaseRowsH = Math.max(1, purchaseItems.length) * rowH;
  const paymentSectionH = paymentItems.length > 0 ? 70 + paymentItems.length * rowH : 0;
  const height = Math.max(1123, 520 + purchaseRowsH + paymentSectionH);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 40;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 40;

  const drawText = (
    text: string,
    x: number,
    y: number,
    options?: {
      font?: string;
      color?: string;
      align?: CanvasTextAlign;
      maxWidth?: number;
    }
  ) => {
    ctx.save();
    ctx.font = options?.font || '12px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = options?.color || '#0f172a';
    ctx.textAlign = options?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (options?.maxWidth) {
      ctx.fillText(text, x, y, options.maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  };

  // Store & Title Header
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 88);

  const debtLogoSize = 54;
  const debtLogoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - 16 - debtLogoSize : padX + 16,
    curY + 17,
    debtLogoSize
  );
  const debtTitleX = startEdge - (isAr ? 20 + (debtLogoDrawn ? debtLogoSize + 12 : 0) : -(20 + (debtLogoDrawn ? debtLogoSize + 12 : 0)));

  drawText(settings.storeName || 'Kadi POS', debtTitleX, curY + 34, {
    font: 'bold 21px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#ffffff',
    maxWidth: 320
  });
  drawText(
    `${settings.address || ''} · ${settings.phone || ''}`,
    debtTitleX,
    curY + 58,
    {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#cbd5e1',
      maxWidth: 320
    }
  );

  drawText(
    isAr ? 'فاتورة الدين بتفاصيل المشتريات' : 'Customer Debt Invoice',
    endEdge + (isAr ? 20 : -20),
    curY + 34,
    {
      font: 'bold 16px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#fbbf24',
      align: isAr ? 'left' : 'right'
    }
  );
  drawText(
    `${isAr ? 'تاريخ الطباعة:' : 'Date:'} ${new Date().toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR')}`,
    endEdge + (isAr ? 20 : -20),
    curY + 58,
    {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#e2e8f0',
      align: isAr ? 'left' : 'right'
    }
  );

  curY += 106;

  // Customer Info Card
  ctx.fillStyle = '#fffbeb';
  ctx.fillRect(padX, curY, contentW, 68);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(padX, curY, contentW, 68);

  drawText(`${isAr ? 'الزبون:' : 'Customer:'} ${customer.name}`, startEdge - (isAr ? 16 : -16), curY + 26, {
    font: 'bold 14px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#0f172a'
  });
  drawText(
    `${isAr ? 'الهاتف:' : 'Phone:'} ${customer.phone}${customer.notes ? ` · ${customer.notes}` : ''}`,
    startEdge - (isAr ? 16 : -16),
    curY + 48,
    {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#475569',
      maxWidth: 420
    }
  );

  drawText(isAr ? 'الصافي المستحق للدفع:' : 'Remaining Debt Due:', endEdge + (isAr ? 16 : -16), curY + 24, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#b45309',
    align: isAr ? 'left' : 'right'
  });
  drawText(`${remainingDebt.toFixed(2)} ${currencySymbol}`, endEdge + (isAr ? 16 : -16), curY + 50, {
    font: 'bold 18px monospace',
    color: '#dc2626',
    align: isAr ? 'left' : 'right'
  });

  curY += 90;

  // Section 1: Purchases Details Header
  drawText(
    isAr ? 'تفاصيل المشتريات والسلع على الحساب:' : 'Itemized Credit Purchases:',
    startEdge,
    curY,
    { font: 'bold 13px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#0f172a' }
  );
  curY += 12;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, 32);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, 32);

  const cols = isAr
    ? {
        idx: width - padX - 18,
        ref: width - padX - 75,
        desc: width - padX - 145,
        qty: width - padX - 450,
        unit: width - padX - 535,
        total: padX + 14
      }
    : {
        idx: padX + 18,
        ref: padX + 75,
        desc: padX + 145,
        qty: padX + 450,
        unit: padX + 535,
        total: width - padX - 14
      };

  drawText('#', cols.idx, curY + 20, { font: 'bold 11px monospace', color: '#475569', align: 'center' });
  drawText(isAr ? 'المرجع' : 'Ref', cols.ref, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'المنتوج / تفاصيل المشتريات' : 'Product / Details', cols.desc, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155'
  });
  drawText(isAr ? 'الكمية' : 'Qty', cols.qty, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'ثمن الوحدة' : 'Unit', cols.unit, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: 'center'
  });
  drawText(isAr ? 'المجموع' : 'Total', cols.total, curY + 20, {
    font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#334155',
    align: isAr ? 'left' : 'right'
  });

  curY += 32;

  purchaseItems.forEach((it, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(padX, curY, contentW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(padX, curY, contentW, rowH);

    const shortDate = new Date(it.date).toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
      month: 'numeric',
      day: 'numeric'
    });

    drawText(String(idx + 1), cols.idx, curY + 19, {
      font: 'bold 10px monospace',
      color: '#64748b',
      align: 'center'
    });
    drawText(`${it.sourceLabel} (${shortDate})`, cols.ref, curY + 19, {
      font: '10px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#475569',
      align: 'center',
      maxWidth: 95
    });
    drawText(it.description, cols.desc, curY + 19, {
      font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#0f172a',
      maxWidth: 280
    });
    drawText(String(it.quantity), cols.qty, curY + 19, {
      font: 'bold 11px monospace',
      color: '#0f172a',
      align: 'center'
    });
    drawText(`${it.unitPrice.toFixed(2)}`, cols.unit, curY + 19, {
      font: '11px monospace',
      color: '#334155',
      align: 'center'
    });
    drawText(`${it.total.toFixed(2)} ${currencySymbol}`, cols.total, curY + 19, {
      font: 'bold 11px monospace',
      color: '#0f172a',
      align: isAr ? 'left' : 'right'
    });

    curY += rowH;
  });

  // Section 2: Payments Recorded
  if (paymentItems.length > 0) {
    curY += 26;
    drawText(isAr ? 'الدفعات المسددة من الزبون:' : 'Recorded Payments:', startEdge, curY, {
      font: 'bold 13px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#059669'
    });
    curY += 12;

    paymentItems.forEach((pay, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ecfdf5' : '#f0fdf4';
      ctx.fillRect(padX, curY, contentW, rowH);
      ctx.strokeStyle = '#a7f3d0';
      ctx.lineWidth = 0.75;
      ctx.strokeRect(padX, curY, contentW, rowH);

      const dStr = new Date(pay.date).toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
        month: 'short',
        day: 'numeric'
      });

      drawText(`${dStr} · ${pay.notes}`, startEdge - (isAr ? 14 : -14), curY + 19, {
        font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#065f46',
        maxWidth: 460
      });
      drawText(`-${pay.amount.toFixed(2)} ${currencySymbol}`, endEdge + (isAr ? 14 : -14), curY + 19, {
        font: 'bold 11px monospace',
        color: '#059669',
        align: isAr ? 'left' : 'right'
      });

      curY += rowH;
    });
  }

  curY += 26;

  // Totals Summary Box
  const sumW = 330;
  const sumX = isAr ? padX : width - padX - sumW;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(sumX, curY, sumW, 108);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(sumX, curY, sumW, 108);

  const labelX = isAr ? sumX + sumW - 14 : sumX + 14;
  const valX = isAr ? sumX + 14 : sumX + sumW - 14;

  drawText(isAr ? 'إجمالي المشتريات بالكريدي:' : 'Total Credit Purchases:', labelX, curY + 24, {
    font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#475569'
  });
  drawText(`${totalPurchasesDebt.toFixed(2)} ${currencySymbol}`, valX, curY + 24, {
    font: 'bold 12px monospace',
    color: '#0f172a',
    align: isAr ? 'left' : 'right'
  });

  drawText(isAr ? '(-) إجمالي الدفعات المسددة:' : '(-) Total Paid:', labelX, curY + 48, {
    font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#059669'
  });
  drawText(`-${totalPayments.toFixed(2)} ${currencySymbol}`, valX, curY + 48, {
    font: 'bold 12px monospace',
    color: '#059669',
    align: isAr ? 'left' : 'right'
  });

  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(sumX + 12, curY + 64);
  ctx.lineTo(sumX + sumW - 12, curY + 64);
  ctx.stroke();

  drawText(isAr ? 'الباقي المستحق بذمة الزبون:' : 'Net Remaining Debt:', labelX, curY + 90, {
    font: 'bold 13px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#0f172a'
  });
  drawText(`${remainingDebt.toFixed(2)} ${currencySymbol}`, valX, curY + 90, {
    font: 'bold 16px monospace',
    color: '#dc2626',
    align: isAr ? 'left' : 'right'
  });

  // Footer
  const footerY = height - 48;
  const debtPdfFooter =
    (settings.showReceiptFooterMsg ?? true) && settings.receiptFooterMsg?.trim()
      ? settings.receiptFooterMsg.replace(/\s*\n\s*/g, ' · ')
      : '';
  if (debtPdfFooter) {
    drawText(debtPdfFooter, width / 2, footerY, {
      font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#64748b',
      align: 'center'
    });
  }

  const safeName = customer.name.replace(/[^\u0600-\u06FFa-zA-Z0-9_-]/g, '_');
  const filename = `Debt_Invoice_${safeName || customer.id}.pdf`;

  return { canvas, width, height, filename };
}

export function generateCustomerDebtInvoicePdfBlob(input: CustomerDebtPdfInput): {
  filename: string;
  blob: Blob;
  pdf: jsPDF;
} {
  const { canvas, width, height, filename } = renderCustomerDebtInvoicePdfCanvas(input);
  const { blob, pdf } = buildPaginatedA4PdfBlob(canvas, width, height);
  return { filename, blob, pdf };
}

export function generateAndDownloadCustomerDebtInvoicePdf(
  input: CustomerDebtPdfInput
): { filename: string } {
  const { filename, blob, pdf } = generateCustomerDebtInvoicePdfBlob(input);
  triggerPdfDownload(blob, filename, pdf);
  return { filename };
}

export async function downloadAndSendDebtInvoiceViaWhatsApp(
  input: CustomerDebtPdfInput
): Promise<{
  filename: string;
  mode: 'native_file_share' | 'download_and_wa_link';
  phoneTargeted: boolean;
}> {
  const { data, settings, currencySymbol, language } = input;
  const { customer, purchaseItems, paymentItems, totalPurchasesDebt, totalPayments, remainingDebt } =
    data;
  const isAr = language === 'ar';

  const { filename, blob, pdf } = generateCustomerDebtInvoicePdfBlob(input);
  triggerPdfDownload(blob, filename, pdf);

  const lines: string[] = [
    `🧾 *${settings.storeName || 'Kadi POS'}*`,
    isAr ? '📋 *كشف وفاتورة الدين بالمشتريات*' : '📋 *Itemized Customer Debt Invoice*',
    isAr ? `👤 الزبون: *${customer.name}*` : `👤 Customer: *${customer.name}*`,
    '━━━━━━━━━━━━━━'
  ];

  if (purchaseItems.length > 0) {
    lines.push(isAr ? '🛒 *تفاصيل المشتريات على الحساب:*' : '🛒 *Credit Purchases:*');
    purchaseItems.slice(0, 25).forEach((it, idx) => {
      lines.push(
        `${idx + 1}. ${it.description} (${it.quantity} × ${it.unitPrice.toFixed(2)}) = *${it.total.toFixed(2)} ${currencySymbol}*`
      );
    });
    if (purchaseItems.length > 25) {
      lines.push(
        isAr ? `... و ${purchaseItems.length - 25} بنود أخرى (مفصلة في ملف PDF)` : `... +${purchaseItems.length - 25} more items in PDF`
      );
    }
    lines.push('━━━━━━━━━━━━━━');
  }

  if (paymentItems.length > 0) {
    lines.push(
      isAr
        ? `✅ الدفعات المسددة: -${totalPayments.toFixed(2)} ${currencySymbol}`
        : `✅ Total Paid: -${totalPayments.toFixed(2)} ${currencySymbol}`
    );
  }

  lines.push(
    isAr
      ? `إجمالي المشتريات: ${totalPurchasesDebt.toFixed(2)} ${currencySymbol}`
      : `Total Purchases: ${totalPurchasesDebt.toFixed(2)} ${currencySymbol}`
  );
  lines.push(
    isAr
      ? `💰 *صافي الدين الباقي في الذمة: ${remainingDebt.toFixed(2)} ${currencySymbol}*`
      : `💰 *Remaining Balance Due: ${remainingDebt.toFixed(2)} ${currencySymbol}*`
  );
  lines.push('');
  lines.push(isAr ? `📎 ملف الفاتورة PDF: ${filename}` : `📎 Debt Invoice PDF: ${filename}`);

  const summaryText = lines.join('\n');
  const cleanPhone = cleanPhoneForWhatsApp(customer.phone || '');
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(summaryText)}`
    : `https://wa.me/?text=${encodeURIComponent(summaryText)}`;

  if (typeof navigator !== 'undefined' && typeof File !== 'undefined') {
    try {
      const pdfFile = new File([blob], filename, { type: 'application/pdf' });
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdfFile] });
      if (canShareFiles && typeof navigator.share === 'function') {
        await navigator.share({
          files: [pdfFile],
          title: `${settings.storeName} - ${customer.name}`,
          text: summaryText
        });
        return {
          filename,
          mode: 'native_file_share',
          phoneTargeted: Boolean(cleanPhone)
        };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          filename,
          mode: 'native_file_share',
          phoneTargeted: Boolean(cleanPhone)
        };
      }
    }
  }

  openExternalLinkSafely(waUrl);
  return {
    filename,
    mode: 'download_and_wa_link',
    phoneTargeted: Boolean(cleanPhone)
  };
}

export interface CpuTaxPdfInput {
  records: CpuQuarterRecord[];
  cpuSettings: CpuTaxSettings;
  retirementSummary: RetirementProgressSummary;
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  titleSuffix?: string;
}

export function generateAndDownloadCpuTaxPdf(input: CpuTaxPdfInput): { filename: string } {
  const {
    records,
    cpuSettings,
    retirementSummary,
    settings,
    currencySymbol,
    language,
    titleSuffix
  } = input;
  const isAr = language === 'ar';

  const scale = 2;
  const width = 794;
  const rowH = 34;
  const rowsH = Math.max(1, records.length) * rowH;
  const height = Math.max(1123, 540 + rowsH + 170);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const padX = 40;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 40;

  const drawText = (
    text: string,
    x: number,
    y: number,
    options?: {
      font?: string;
      color?: string;
      align?: CanvasTextAlign;
      maxWidth?: number;
    }
  ) => {
    ctx.save();
    ctx.font = options?.font || '12px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = options?.color || '#0f172a';
    ctx.textAlign = options?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (options?.maxWidth) {
      ctx.fillText(text, x, y, options.maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  };

  // Top Header
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 92);

  const cpuLogoSize = 54;
  const cpuLogoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - 16 - cpuLogoSize : padX + 16,
    curY + 19,
    cpuLogoSize
  );
  const cpuTitleX = startEdge - (isAr ? 20 + (cpuLogoDrawn ? cpuLogoSize + 12 : 0) : -(20 + (cpuLogoDrawn ? cpuLogoSize + 12 : 0)));

  drawText(settings.storeName || 'Kadi POS', cpuTitleX, curY + 34, {
    font: 'bold 20px "Cairo", "Segoe UI", Tahoma, sans-serif',
    color: '#ffffff',
    maxWidth: 320
  });
  drawText(
    `${settings.taxNumber || 'IF / ICE'} · ${settings.phone || ''}`,
    cpuTitleX,
    curY + 58,
    { font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#cbd5e1', maxWidth: 340 }
  );

  drawText(
    isAr ? 'تقرير ضرائبي CPU والرسم المهني والتقاعد' : 'CPU Tax, Patente & CNSS Report',
    endEdge + (isAr ? 20 : -20),
    curY + 34,
    {
      font: 'bold 15px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#34d399',
      align: isAr ? 'left' : 'right'
    }
  );
  drawText(
    `${new Date().toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR')}${titleSuffix ? ` · ${titleSuffix}` : ''}`,
    endEdge + (isAr ? 20 : -20),
    curY + 58,
    { font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#e2e8f0', align: isAr ? 'left' : 'right' }
  );

  curY += 114;

  // Aggregates for selected records + Annual Patente
  const totalTurnover = records.reduce((s, r) => s + r.turnover, 0);
  const totalTax = records.reduce((s, r) => s + r.calculatedTax, 0);
  const totalAmo = records.reduce((s, r) => s + r.quarterlyAmo, 0);
  const totalRet = records.reduce((s, r) => s + r.quarterlyRetirement, 0);
  const annualPatente = Math.max(0, Number(cpuSettings.annualPatenteTax) || 0);
  const quarterlyPatente = Number((annualPatente / 4).toFixed(2));
  const totalAll = records.reduce((s, r) => s + r.totalDue, 0);
  const paidAll = records.filter((r) => r.status === 'paid').reduce((s, r) => s + r.totalDue, 0);

  // KPI Cards Row
  const gap = 10;
  const kpiW = (contentW - gap * 4) / 5;
  const kpiH = 74;
  const kpis = [
    {
      label: isAr ? 'رقم المعاملات' : 'Turnover',
      val: `${totalTurnover.toFixed(0)} ${currencySymbol}`,
      color: '#0f172a'
    },
    {
      label: isAr ? `الضريبة CPU` : 'CPU Tax',
      val: `${totalTax.toFixed(2)} ${currencySymbol}`,
      color: '#2563eb'
    },
    {
      label: isAr ? 'الباتنتا (سنوية)' : 'Annual Patente',
      val: `${annualPatente.toFixed(2)} ${currencySymbol}`,
      color: '#0d9488'
    },
    {
      label: isAr ? 'بريم الصحة AMO' : 'AMO Health',
      val: `${totalAmo.toFixed(2)} ${currencySymbol}`,
      color: '#d97706'
    },
    {
      label: isAr ? `التقاعد CNSS` : 'CNSS Ret.',
      val: `${totalRet.toFixed(2)} ${currencySymbol}`,
      color: '#7c3aed'
    }
  ];

  kpis.forEach((k, i) => {
    const cx = isAr ? width - padX - (i + 1) * kpiW - i * gap : padX + i * (kpiW + gap);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx, curY, kpiW, kpiH);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, curY, kpiW, kpiH);

    const tx = isAr ? cx + kpiW - 8 : cx + 8;
    drawText(k.label, tx, curY + 22, {
      font: 'bold 10px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#475569'
    });
    drawText(k.val, tx, curY + 50, {
      font: 'bold 12px monospace',
      color: k.color
    });
  });

  curY += kpiH + 18;

  // Grand Totals & Retirement Progress Strip
  ctx.fillStyle = '#ecfdf5';
  ctx.fillRect(padX, curY, contentW, 64);
  ctx.strokeStyle = '#6ee7b7';
  ctx.strokeRect(padX, curY, contentW, 64);

  drawText(
    isAr
      ? `مجموع CPU + CNSS للتريمسترات: ${totalAll.toFixed(2)} ${currencySymbol} (مدفوع: ${paidAll.toFixed(2)}) · الرسم المهني (الباتنتا): ${annualPatente.toFixed(2)} ${currencySymbol}/سنة (${quarterlyPatente.toFixed(2)}/تريمستر)`
      : `CPU + CNSS Total: ${totalAll.toFixed(2)} ${currencySymbol} (Paid: ${paidAll.toFixed(2)}) · Annual Patente: ${annualPatente.toFixed(2)} ${currencySymbol}/yr`,
    startEdge - (isAr ? 14 : -14),
    curY + 24,
    { font: 'bold 11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#065f46', maxWidth: contentW - 28 }
  );
  drawText(
    isAr
      ? `أيام التقاعد المجمعة: ${retirementSummary.totalAccumulatedDays} يوم · المتبقي لـ 1320 يوم: ${retirementSummary.remainingTo1320} يوم · المتبقي لـ 3240 يوم: ${retirementSummary.remainingTo3240} يوم`
      : `Accumulated Retirement Days: ${retirementSummary.totalAccumulatedDays}d · Left for 1320d: ${retirementSummary.remainingTo1320}d · Left for 3240d: ${retirementSummary.remainingTo3240}d`,
    startEdge - (isAr ? 14 : -14),
    curY + 46,
    { font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#047857', maxWidth: contentW - 28 }
  );

  curY += 84;

  // Section: Selected Trimesters Table
  drawText(
    isAr ? 'تفاصيل التريمسترات المحددة:' : 'Selected Trimesters Breakdown:',
    startEdge,
    curY,
    { font: 'bold 13px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#0f172a' }
  );
  curY += 12;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(padX, curY, contentW, rowH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(padX, curY, contentW, rowH);

  const cols = isAr
    ? {
        period: width - padX - 14,
        ca: width - padX - 185,
        tax: width - padX - 295,
        amo: width - padX - 385,
        ret: width - padX - 480,
        tot: width - padX - 580,
        status: padX + 14
      }
    : {
        period: padX + 14,
        ca: padX + 185,
        tax: padX + 295,
        amo: padX + 385,
        ret: padX + 480,
        tot: padX + 580,
        status: width - padX - 14
      };

  drawText(isAr ? 'التريمستر' : 'Quarter', cols.period, curY + 21, { font: 'bold 11px "Cairo", sans-serif', color: '#334155' });
  drawText(isAr ? 'رقم المعاملات' : 'Turnover', cols.ca, curY + 21, { font: 'bold 11px "Cairo", sans-serif', color: '#334155', align: 'center' });
  drawText(isAr ? 'الضريبة' : 'CPU Tax', cols.tax, curY + 21, { font: 'bold 11px "Cairo", sans-serif', color: '#334155', align: 'center' });
  drawText(isAr ? 'الصحة AMO' : 'AMO', cols.amo, curY + 21, { font: 'bold 11px "Cairo", sans-serif', color: '#334155', align: 'center' });
  drawText(isAr ? 'التقاعد' : 'Retire.', cols.ret, curY + 21, { font: 'bold 11px "Cairo", sans-serif', color: '#334155', align: 'center' });
  drawText(isAr ? 'المجموع' : 'Total', cols.tot, curY + 21, { font: 'bold 11px "Cairo", sans-serif', color: '#334155', align: 'center' });
  drawText(isAr ? 'الحالة' : 'Status', cols.status, curY + 21, {
    font: 'bold 11px "Cairo", sans-serif',
    color: '#334155',
    align: isAr ? 'left' : 'right'
  });

  curY += rowH;

  if (records.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, curY, contentW, 42);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(padX, curY, contentW, 42);
    drawText(isAr ? 'لا توجد تريمسترات محددة' : 'No quarters selected', width / 2, curY + 26, {
      font: '12px "Cairo", sans-serif',
      color: '#94a3b8',
      align: 'center'
    });
  } else {
    records.forEach((r, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(padX, curY, contentW, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(padX, curY, contentW, rowH);

      drawText(`${r.year} - ${getQuarterLabel(r.quarter, language)}`, cols.period, curY + 21, {
        font: 'bold 10px "Cairo", sans-serif',
        color: '#0f172a',
        maxWidth: 165
      });
      drawText(r.turnover.toFixed(0), cols.ca, curY + 21, {
        font: 'bold 11px monospace',
        color: '#0f172a',
        align: 'center'
      });
      drawText(r.calculatedTax.toFixed(2), cols.tax, curY + 21, {
        font: 'bold 11px monospace',
        color: '#2563eb',
        align: 'center'
      });
      drawText(r.quarterlyAmo.toFixed(2), cols.amo, curY + 21, {
        font: 'bold 11px monospace',
        color: '#b45309',
        align: 'center'
      });
      drawText(r.retirementEnabled ? r.quarterlyRetirement.toFixed(2) : isAr ? 'معطل' : 'Off', cols.ret, curY + 21, {
        font: 'bold 11px monospace',
        color: r.retirementEnabled ? '#7c3aed' : '#94a3b8',
        align: 'center'
      });
      drawText(r.totalDue.toFixed(2), cols.tot, curY + 21, {
        font: 'bold 11px monospace',
        color: '#0f172a',
        align: 'center'
      });
      drawText(
        r.status === 'paid' ? (isAr ? 'مدفوع ✓' : 'Paid ✓') : (isAr ? 'غير مدفوع' : 'Unpaid'),
        cols.status,
        curY + 21,
        {
          font: 'bold 10px "Cairo", sans-serif',
          color: r.status === 'paid' ? '#059669' : '#dc2626',
          align: isAr ? 'left' : 'right'
        }
      );

      curY += rowH;
    });
  }

  // Footer
  drawText(
    `${isAr ? 'مُستخرج آلياً من نظام ضرائبي CPU · نسبة الضريبة:' : 'Generated by Kadi POS CPU Tax Module · Rate:'} ${cpuSettings.professionCoeffPct}% × ${cpuSettings.taxRatePct}% | ${isAr ? 'معامل التقاعد:' : 'Ret. Coeff:'} ×${cpuSettings.retirementCoeff}`,
    width / 2,
    height - 46,
    { font: '10px "Cairo", sans-serif', color: '#64748b', align: 'center' }
  );

  const filename = `CPU_Tax_CNSS_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return { filename };
}

export interface RemoteFlyerProductItem {
  id: string;
  name: string;
  price: number;
  unitType?: string;
  categoryName?: string;
  color?: string;
}

export interface RemoteFlyerInput {
  title: string;
  subtitle: string;
  products: RemoteFlyerProductItem[];
  zones: DeliveryZone[];
  catalogUrl: string;
  qrMatrix: boolean[][];
  whatsappPhone: string;
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
}

function renderRemoteFlyerCanvas(input: RemoteFlyerInput): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  filenameBase: string;
} {
  const {
    title,
    subtitle,
    products,
    zones,
    qrMatrix,
    whatsappPhone,
    settings,
    currencySymbol,
    language
  } = input;
  const isAr = language === 'ar';
  const items = products.slice(0, 18);
  const cols = 3;
  const rowsCount = Math.max(1, Math.ceil(items.length / cols));

  const scale = 2;
  const width = 794;
  const cardH = 148;
  const cardGap = 14;
  const gridH = rowsCount * cardH + Math.max(0, rowsCount - 1) * cardGap;
  const height = Math.max(1123, 270 + gridH + 225);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize flyer canvas');
  }
  ctx.scale(scale, scale);

  // Clean paper background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  const padX = 34;
  const contentW = width - padX * 2;
  const startEdge = isAr ? width - padX : padX;
  const endEdge = isAr ? padX : width - padX;
  let curY = 28;

  const drawText = (
    text: string,
    x: number,
    y: number,
    options?: {
      font?: string;
      color?: string;
      align?: CanvasTextAlign;
      maxWidth?: number;
    }
  ) => {
    ctx.save();
    ctx.font = options?.font || '12px "Cairo", "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = options?.color || '#0f172a';
    ctx.textAlign = options?.align || (isAr ? 'right' : 'left');
    ctx.direction = isAr ? 'rtl' : 'ltr';
    if (options?.maxWidth) {
      ctx.fillText(text, x, y, options.maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  };

  // Newspaper / Flyer Top Masthead
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(padX, curY, contentW, 114);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(padX, curY, contentW, 8);

  drawText(
    settings.storeName || 'Kadi POS',
    startEdge - (isAr ? 20 : -20),
    curY + 40,
    { font: 'bold 23px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#ffffff', maxWidth: 420 }
  );
  drawText(
    title || (isAr ? 'صحيفة عروض البيع عن بعد' : 'Remote Sales Promotional Flyer'),
    startEdge - (isAr ? 20 : -20),
    curY + 70,
    { font: 'bold 15px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#a7f3d0', maxWidth: 460 }
  );
  drawText(
    subtitle || (isAr ? 'اطلب عبر واتساب والتوصيل لباب الدار' : 'Order via WhatsApp & get home delivery'),
    startEdge - (isAr ? 20 : -20),
    curY + 95,
    { font: '11px "Cairo", "Segoe UI", Tahoma, sans-serif', color: '#e2e8f0', maxWidth: 460 }
  );

  drawText(
    isAr ? 'نشرة العروض' : 'CATALOG FLYER',
    endEdge + (isAr ? 20 : -20),
    curY + 40,
    {
      font: 'bold 14px "Cairo", "Segoe UI", Tahoma, sans-serif',
      color: '#fde68a',
      align: isAr ? 'left' : 'right'
    }
  );
  drawText(
    new Date().toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR'),
    endEdge + (isAr ? 20 : -20),
    curY + 64,
    { font: 'bold 11px monospace', color: '#cbd5e1', align: isAr ? 'left' : 'right' }
  );
  if (whatsappPhone) {
    drawText(
      `WhatsApp: ${whatsappPhone}`,
      endEdge + (isAr ? 20 : -20),
      curY + 92,
      { font: 'bold 12px monospace', color: '#34d399', align: isAr ? 'left' : 'right' }
    );
  }

  curY += 132;

  // Product Newspaper Grid (3 columns)
  const cardW = (contentW - cardGap * (cols - 1)) / cols;

  if (items.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(padX, curY, contentW, 120);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(padX, curY, contentW, 120);
    drawText(
      isAr ? 'لا توجد منتجات محددة في الصحيفة' : 'No products selected for flyer',
      width / 2,
      curY + 66,
      { font: 'bold 14px "Cairo", sans-serif', color: '#64748b', align: 'center' }
    );
    curY += 140;
  } else {
    items.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const visualCol = isAr ? cols - 1 - col : col;
      const x = padX + visualCol * (cardW + cardGap);
      const y = curY + row * (cardH + cardGap);

      // Card container
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cardW, cardH);

      // Accent top strip
      const accent = item.color || '#059669';
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, cardW, 28);

      drawText(
        item.categoryName || (isAr ? 'متوفر الآن' : 'In Stock'),
        isAr ? x + cardW - 10 : x + 10,
        y + 18,
        { font: 'bold 10px "Cairo", sans-serif', color: '#ffffff', maxWidth: cardW - 20 }
      );

      // Product Name (2 lines max simple wrap)
      const name = item.name || '-';
      const words = name.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= 24) {
          line1 = (line1 + ' ' + w).trim();
        } else {
          line2 = (line2 + ' ' + w).trim();
        }
      }
      drawText(line1, isAr ? x + cardW - 12 : x + 12, y + 54, {
        font: 'bold 13px "Cairo", "Segoe UI", Tahoma, sans-serif',
        color: '#0f172a',
        maxWidth: cardW - 24
      });
      if (line2) {
        drawText(line2, isAr ? x + cardW - 12 : x + 12, y + 74, {
          font: 'bold 12px "Cairo", "Segoe UI", Tahoma, sans-serif',
          color: '#334155',
          maxWidth: cardW - 24
        });
      }

      // Price pill footer inside card
      ctx.fillStyle = '#ecfdf5';
      ctx.fillRect(x + 10, y + cardH - 46, cardW - 20, 34);
      ctx.strokeStyle = '#a7f3d0';
      ctx.strokeRect(x + 10, y + cardH - 46, cardW - 20, 34);

      drawText(
        `${Number(item.price || 0).toFixed(2)} ${currencySymbol}`,
        x + cardW / 2,
        y + cardH - 23,
        {
          font: 'bold 16px monospace',
          color: '#047857',
          align: 'center'
        }
      );
    });
    curY += gridH + 20;
  }

  // Bottom Zones + QR Code Call-To-Action Strip
  const footerBoxH = 148;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, footerBoxH);

  // Draw QR Matrix block on end side
  const qrBoxSize = 112;
  const qrX = isAr ? padX + 18 : width - padX - qrBoxSize - 18;
  const qrY = curY + 18;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX, qrY, qrBoxSize, qrBoxSize);

  const matrixDim = qrMatrix.length || 25;
  const cellSize = (qrBoxSize - 12) / matrixDim;
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < matrixDim; r++) {
    for (let c = 0; c < matrixDim; c++) {
      if (qrMatrix[r]?.[c]) {
        ctx.fillRect(qrX + 6 + c * cellSize, qrY + 6 + r * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }
  }

  // Delivery zones & WhatsApp ordering CTA on start side
  const ctaX = isAr ? width - padX - 20 : padX + 20;
  drawText(
    isAr ? '🚚 التوصيل متوفر للمناطق التالية:' : '🚚 Active Delivery Zones:',
    ctaX,
    curY + 34,
    { font: 'bold 13px "Cairo", sans-serif', color: '#fbbf24' }
  );

  const activeZones = zones.filter((z) => z.active);
  const zonesLine =
    activeZones
      .map((z) =>
        z.fee === 0
          ? `${z.name}: ${isAr ? 'فابور' : 'Free'}`
          : `${z.name}: ${z.fee.toFixed(0)} ${currencySymbol}`
      )
      .join('   ·   ') || (isAr ? 'توصيل سريع' : 'Fast Delivery');

  drawText(zonesLine, ctaX, curY + 62, {
    font: 'bold 11px "Cairo", sans-serif',
    color: '#f8fafc',
    maxWidth: contentW - qrBoxSize - 60
  });

  drawText(
    isAr
      ? '📱 امسح رمز QR بكاميرا الهاتف لفتح صفحة البيع عن بعد واختيار مشترياتك وإرسال الطلب واتساب!'
      : '📱 Scan the QR code to open our Remote Storefront page and send your WhatsApp order!',
    ctaX,
    curY + 94,
    {
      font: '11px "Cairo", sans-serif',
      color: '#a7f3d0',
      maxWidth: contentW - qrBoxSize - 60
    }
  );

  if (whatsappPhone) {
    drawText(
      `${isAr ? 'واتساب الطلبات السريعة:' : 'Order WhatsApp:'} ${whatsappPhone}`,
      ctaX,
      curY + 122,
      { font: 'bold 12px monospace', color: '#34d399' }
    );
  }

  const safeStore = (settings.storeName || 'store').replace(/[^\u0600-\u06FFa-zA-Z0-9_-]/g, '_');
  const filenameBase = `Flyer_${safeStore}_${new Date().toISOString().slice(0, 10)}`;

  return { canvas, width, height, filenameBase };
}

export function generateAndDownloadRemoteFlyerPdf(input: RemoteFlyerInput): { filename: string } {
  const { canvas, width, height, filenameBase } = renderRemoteFlyerCanvas(input);
  const filename = `${filenameBase}.pdf`;
  saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
  return { filename };
}

export async function generateAndDownloadRemoteFlyerPng(
  input: RemoteFlyerInput
): Promise<{ filename: string; blob: Blob }> {
  const { canvas, filenameBase } = renderRemoteFlyerCanvas(input);
  const filename = `${filenameBase}.png`;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG export failed'))),
      'image/png',
      0.95
    );
  });
  triggerPdfDownload(blob, filename);
  return { filename, blob };
}

export async function shareRemoteFlyerOnWhatsApp(input: RemoteFlyerInput): Promise<{
  filename: string;
  mode: 'native_file_share' | 'download_and_wa_link';
}> {
  const { filename, blob } = await generateAndDownloadRemoteFlyerPng(input);
  const isAr = input.language === 'ar';

  const topItemsText = input.products
    .slice(0, 8)
    .map((p, idx) => `${idx + 1}. ${p.name} — *${p.price.toFixed(2)} ${input.currencySymbol}*`)
    .join('\n');

  const text = [
    `📰 *${input.title || input.settings.storeName}*`,
    input.subtitle,
    '',
    topItemsText,
    '',
    isAr ? `🛒 اطلب الآن مباشرة من صفحة البيع عن بعد:` : `🛒 Order online from our storefront:`,
    input.catalogUrl
  ]
    .filter(Boolean)
    .join('\n');

  if (typeof navigator !== 'undefined' && typeof File !== 'undefined') {
    try {
      const imgFile = new File([blob], filename, { type: 'image/png' });
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [imgFile] });
      if (canShareFiles && typeof navigator.share === 'function') {
        await navigator.share({
          files: [imgFile],
          title: input.title || input.settings.storeName,
          text
        });
        return { filename, mode: 'native_file_share' };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { filename, mode: 'native_file_share' };
      }
    }
  }

  openExternalLinkSafely(`https://wa.me/?text=${encodeURIComponent(text)}`);
  return { filename, mode: 'download_and_wa_link' };
}



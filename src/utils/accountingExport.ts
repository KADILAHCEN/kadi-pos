import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import {
  CpuTaxSettings,
  Expense,
  Order,
  Product,
  StoreSettings,
  SupplierInvoice
} from '../types';
import { drawStoreLogoBadge, saveCanvasAsPaginatedA4Pdf, triggerPdfDownload } from './pdfReport';

export type AccountingPeriodType = 'monthly' | 'quarterly' | 'custom';

export interface AccountingReportParams {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  vatRatePct: number; // 20, 14, 10, or 0
  periodLabel: string;
}

export interface AccountingOfficialInvoiceRow {
  id: string;
  date: string;
  invoiceNumber: string;
  supplierName: string;
  supplierIce: string;
  ttc: number;
  ht: number;
  tvaDeductible: number;
  status: SupplierInvoice['status'];
}

export interface AccountingOrderRow {
  orderNumber: string;
  date: string;
  customerName: string;
  paymentMethod: string;
  ttcNet: number;
  taxableTtc: number;
  exemptTtc: number;
  ht: number;
  tvaCollectee: number;
}

export interface AccountingTvaReport {
  periodLabel: string;
  startDate: string;
  endDate: string;
  vatRatePct: number;
  ordersCount: number;
  totalSalesTtc: number;
  taxableSalesTtc: number;
  exemptSalesTtc: number;
  salesHt: number;
  tvaCollectee: number;
  officialInvoicesCount: number;
  officialPurchasesTtc: number;
  officialPurchasesHt: number;
  tvaDeductible: number;
  informalInvoicesCount: number;
  informalPurchasesTotal: number;
  netTvaPayable: number; // positive = à payer, negative = crédit de TVA
  operatingExpensesTotal: number;
  estimatedCpuTax: number;
  orderRows: AccountingOrderRow[];
  officialInvoiceRows: AccountingOfficialInvoiceRow[];
  periodExpenses: Expense[];
}

export function getMonthRange(yearMonth: string): { start: string; end: string; label: string } {
  const [yStr, mStr] = yearMonth.split('-');
  const y = parseInt(yStr, 10) || new Date().getFullYear();
  const m = parseInt(mStr, 10) || 1;
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  const dd = String(lastDay).padStart(2, '0');
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${dd}`,
    label: `${y}-${mm}`
  };
}

export function getQuarterRangeForAccounting(
  year: number,
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
): { start: string; end: string; label: string } {
  const ranges: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', [string, string]> = {
    Q1: [`${year}-01-01`, `${year}-03-31`],
    Q2: [`${year}-04-01`, `${year}-06-30`],
    Q3: [`${year}-07-01`, `${year}-09-30`],
    Q4: [`${year}-10-01`, `${year}-12-31`]
  };
  const [start, end] = ranges[quarter];
  return { start, end, label: `${year} ${quarter}` };
}

export function computeAccountingTvaReport(params: {
  orders: Order[];
  products: Product[];
  supplierInvoices: SupplierInvoice[];
  expenses: Expense[];
  cpuSettings?: CpuTaxSettings;
  reportParams: AccountingReportParams;
}): AccountingTvaReport {
  const { orders, products, supplierInvoices, expenses, cpuSettings, reportParams } = params;
  const { startDate, endDate, vatRatePct, periodLabel } = reportParams;
  const startMs = new Date(`${startDate}T00:00:00`).getTime();
  const endMs = new Date(`${endDate}T23:59:59.999`).getTime();

  const productById = new Map<string, Product>();
  products.forEach((p) => productById.set(p.id, p));

  const vatMultiplier = 1 + Math.max(0, vatRatePct) / 100;

  let totalSalesTtc = 0;
  let taxableSalesTtc = 0;
  let exemptSalesTtc = 0;
  let salesHt = 0;
  let tvaCollectee = 0;

  const orderRows: AccountingOrderRow[] = [];

  orders.forEach((o) => {
    if (o.status === 'refunded') return;
    const ms = new Date(o.date).getTime();
    if (Number.isNaN(ms) || ms < startMs || ms > endMs) return;

    const netOrderTtc = Math.max(0, Number(((o.grandTotal || 0) - (o.refundedAmount || 0)).toFixed(2)));
    if (netOrderTtc <= 0) return;

    // Split taxable vs exempt items proportionally to net order total
    let rawTaxable = 0;
    let rawExempt = 0;
    o.items.forEach((it) => {
      const prod = productById.get(it.productId);
      const effectiveQty = Math.max(0, it.quantity - (it.returnedQty || 0));
      const lineShare = it.quantity > 0 ? (it.total * effectiveQty) / it.quantity : it.total;
      if (prod?.taxExempt) {
        rawExempt += lineShare;
      } else {
        rawTaxable += lineShare;
      }
    });

    const rawSum = rawTaxable + rawExempt;
    const orderTaxableTtc =
      rawSum > 0
        ? Number(((netOrderTtc * rawTaxable) / rawSum).toFixed(2))
        : netOrderTtc;
    const orderExemptTtc = Number(Math.max(0, netOrderTtc - orderTaxableTtc).toFixed(2));

    const orderTaxableHt = vatRatePct > 0 ? orderTaxableTtc / vatMultiplier : orderTaxableTtc;
    const orderTva = orderTaxableTtc - orderTaxableHt;
    const orderTotalHt = Number((orderTaxableHt + orderExemptTtc).toFixed(2));
    const orderTvaClean = Number(orderTva.toFixed(2));

    totalSalesTtc += netOrderTtc;
    taxableSalesTtc += orderTaxableTtc;
    exemptSalesTtc += orderExemptTtc;
    salesHt += orderTotalHt;
    tvaCollectee += orderTvaClean;

    orderRows.push({
      orderNumber: o.orderNumber,
      date: o.date.slice(0, 16).replace('T', ' '),
      customerName: o.customerName || '-',
      paymentMethod: o.paymentMethod,
      ttcNet: netOrderTtc,
      taxableTtc: orderTaxableTtc,
      exemptTtc: orderExemptTtc,
      ht: orderTotalHt,
      tvaCollectee: orderTvaClean
    });
  });

  const officialInvoiceRows: AccountingOfficialInvoiceRow[] = [];
  let officialPurchasesTtc = 0;
  let officialPurchasesHt = 0;
  let tvaDeductible = 0;
  let informalInvoicesCount = 0;
  let informalPurchasesTotal = 0;

  supplierInvoices.forEach((inv) => {
    const ms = new Date(`${inv.date}T12:00:00`).getTime();
    if (Number.isNaN(ms) || ms < startMs || ms > endMs) return;

    const cleanIce = (inv.supplierIce || '').trim();
    const isOfficial = inv.invoiceType === 'official_ice' || cleanIce.length >= 5;
    const ttc = Math.max(0, Number(inv.totalAmount) || 0);

    if (isOfficial) {
      const ht = Number((vatRatePct > 0 ? ttc / vatMultiplier : ttc).toFixed(2));
      const tva = Number((ttc - ht).toFixed(2));
      officialPurchasesTtc += ttc;
      officialPurchasesHt += ht;
      tvaDeductible += tva;
      officialInvoiceRows.push({
        id: inv.id,
        date: inv.date,
        invoiceNumber: inv.invoiceNumber,
        supplierName: inv.supplierName,
        supplierIce: cleanIce || '-',
        ttc,
        ht,
        tvaDeductible: tva,
        status: inv.status
      });
    } else {
      informalInvoicesCount++;
      informalPurchasesTotal += ttc;
    }
  });

  const periodExpenses = expenses.filter((e) => {
    const ms = new Date(`${e.date}T12:00:00`).getTime();
    return !Number.isNaN(ms) && ms >= startMs && ms <= endMs;
  });
  const operatingExpensesTotal = Number(
    periodExpenses.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2)
  );

  const coeffPct = cpuSettings?.professionCoeffPct ?? 6;
  const cpuRatePct = cpuSettings?.taxRatePct ?? 10;
  const estimatedCpuTax = Number(
    (totalSalesTtc * (coeffPct / 100) * (cpuRatePct / 100)).toFixed(2)
  );

  const cleanTvaCol = Number(tvaCollectee.toFixed(2));
  const cleanTvaDed = Number(tvaDeductible.toFixed(2));

  return {
    periodLabel,
    startDate,
    endDate,
    vatRatePct,
    ordersCount: orderRows.length,
    totalSalesTtc: Number(totalSalesTtc.toFixed(2)),
    taxableSalesTtc: Number(taxableSalesTtc.toFixed(2)),
    exemptSalesTtc: Number(exemptSalesTtc.toFixed(2)),
    salesHt: Number(salesHt.toFixed(2)),
    tvaCollectee: cleanTvaCol,
    officialInvoicesCount: officialInvoiceRows.length,
    officialPurchasesTtc: Number(officialPurchasesTtc.toFixed(2)),
    officialPurchasesHt: Number(officialPurchasesHt.toFixed(2)),
    tvaDeductible: cleanTvaDed,
    informalInvoicesCount,
    informalPurchasesTotal: Number(informalPurchasesTotal.toFixed(2)),
    netTvaPayable: Number((cleanTvaCol - cleanTvaDed).toFixed(2)),
    operatingExpensesTotal,
    estimatedCpuTax,
    orderRows,
    officialInvoiceRows,
    periodExpenses
  };
}

export function exportAccountingTvaExcel(
  report: AccountingTvaReport,
  settings: StoreSettings,
  currencySymbol: string,
  language: 'ar' | 'fr' | 'en'
): string {
  const isAr = language === 'ar';
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryRows = [
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? 'المتجر / الشركة' : 'Entreprise', [isAr ? 'القيمة' : 'Valeur']: settings.storeName },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: 'ICE / Identifiant Fiscal', [isAr ? 'القيمة' : 'Valeur']: settings.taxNumber || '-' },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? 'السجل التجاري / Patente' : 'RC / Patente', [isAr ? 'القيمة' : 'Valeur']: settings.commercialRegistration || '-' },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? 'الفترة المحاسبية' : 'Période', [isAr ? 'القيمة' : 'Valeur']: `${report.periodLabel} (${report.startDate} → ${report.endDate})` },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? 'سعر الضريبة TVA المعتمد' : 'Taux TVA (%)', [isAr ? 'القيمة' : 'Valeur']: `${report.vatRatePct}%` },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `رقم المعاملات الإجمالي TTC (${currencySymbol})` : `CA Total TTC (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.totalSalesTtc },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `مبيعات معفاة من TVA (${currencySymbol})` : `Ventes Exonérées (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.exemptSalesTtc },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `صافي المبيعات HT (${currencySymbol})` : `Total Ventes HT (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.salesHt },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `TVA المحصلة على المبيعات (${currencySymbol})` : `TVA Collectée (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.tvaCollectee },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `المشتريات الرسمية بـ ICE (TTC)` : `Achats Officiels ICE (TTC)`, [isAr ? 'القيمة' : 'Valeur']: report.officialPurchasesTtc },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `TVA القابلة للاسترجاع (${currencySymbol})` : `TVA Déductible (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.tvaDeductible },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `صافي TVA الواجب أداؤها (${currencySymbol})` : `TVA Nette à Payer (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.netTvaPayable },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `فواتير غير رسمية / نوار (خارج TVA)` : `Achats Informels (Hors TVA)`, [isAr ? 'القيمة' : 'Valeur']: report.informalPurchasesTotal },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `مصاريف التشغيل العامة (${currencySymbol})` : `Charges Générales (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.operatingExpensesTotal },
    { [isAr ? 'البيان المحاسبي' : 'Rubrique']: isAr ? `تقدير الضريبة الموحدة CPU (${currencySymbol})` : `Estimation CPU (${currencySymbol})`, [isAr ? 'القيمة' : 'Valeur']: report.estimatedCpuTax }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'TVA_Summary');

  // Sheet 2: Official ICE Invoices
  const iceRows = report.officialInvoiceRows.map((r, i) => ({
    '#': i + 1,
    [isAr ? 'التاريخ' : 'Date']: r.date,
    [isAr ? 'رقم الفاتورة' : 'N° Facture']: r.invoiceNumber,
    [isAr ? 'المورد' : 'Fournisseur']: r.supplierName,
    ICE: r.supplierIce,
    [`TTC (${currencySymbol})`]: r.ttc,
    [`HT (${currencySymbol})`]: r.ht,
    [`TVA Déductible (${currencySymbol})`]: r.tvaDeductible,
    [isAr ? 'الحالة' : 'Statut']: r.status
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(iceRows), 'Achats_ICE');

  // Sheet 3: Sales Journal
  const salesRows = report.orderRows.map((r, i) => ({
    '#': i + 1,
    [isAr ? 'رقم الفاتورة' : 'Ticket']: r.orderNumber,
    [isAr ? 'التاريخ' : 'Date']: r.date,
    [isAr ? 'الزبون' : 'Client']: r.customerName,
    [isAr ? 'الدفع' : 'Mode']: r.paymentMethod,
    [`TTC (${currencySymbol})`]: r.ttcNet,
    [`HT (${currencySymbol})`]: r.ht,
    [`TVA Collectée (${currencySymbol})`]: r.tvaCollectee,
    [`Exonéré (${currencySymbol})`]: r.exemptTtc
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'Journal_Ventes');

  // Sheet 4: Expenses
  const expRows = report.periodExpenses.map((e, i) => ({
    '#': i + 1,
    [isAr ? 'التاريخ' : 'Date']: e.date,
    [isAr ? 'البيان' : 'Libellé']: e.name,
    [isAr ? 'التصنيف' : 'Catégorie']: e.category,
    [`Montant (${currencySymbol})`]: e.amount,
    [isAr ? 'ملاحظات' : 'Notes']: e.notes || ''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Charges');

  const safeLabel = report.periodLabel.replace(/\s+/g, '_');
  const filename = `KadiPOS_Compta_TVA_${safeLabel}.xlsx`;
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

  return filename;
}

export function exportAccountingTvaPdf(
  report: AccountingTvaReport,
  settings: StoreSettings,
  currencySymbol: string,
  language: 'ar' | 'fr' | 'en'
): string {
  const isAr = language === 'ar';
  const rows = report.officialInvoiceRows.slice(0, 60);
  const width = 794;
  const rowH = 26;
  const height = Math.max(1123, 500 + Math.max(1, rows.length) * rowH + 140);
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
  let curY = 34;

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

  // Dark slate accountant header
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 92);
  const logoDrawn = drawStoreLogoBadge(
    ctx,
    settings.storeLogo,
    isAr ? width - padX - 66 : padX + 14,
    curY + 18,
    54
  );
  const titleX = startEdge - (isAr ? 16 + (logoDrawn ? 64 : 0) : -(16 + (logoDrawn ? 64 : 0)));
  drawText(settings.storeName || 'Kadi POS', titleX, curY + 32, {
    font: 'bold 18px "Cairo", sans-serif',
    color: '#ffffff',
    maxWidth: 320
  });
  drawText(
    `ICE: ${settings.taxNumber || '-'} · RC: ${settings.commercialRegistration || '-'}`,
    titleX,
    curY + 54,
    { font: '10px "Cairo", monospace', color: '#cbd5e1', maxWidth: 340 }
  );
  drawText(`${settings.address || ''} · ${settings.phone || ''}`, titleX, curY + 72, {
    font: '10px "Cairo", sans-serif',
    color: '#94a3b8',
    maxWidth: 340
  });

  drawText(
    isAr ? 'بيان المحاسبة والـ TVA الرسمي' : 'Déclaration Comptable TVA & ICE',
    endEdge + (isAr ? 16 : -16),
    curY + 34,
    { font: 'bold 14px "Cairo", sans-serif', color: '#34d399', align: isAr ? 'left' : 'right' }
  );
  drawText(
    `${report.periodLabel} (${report.startDate} → ${report.endDate})`,
    endEdge + (isAr ? 16 : -16),
    curY + 56,
    { font: '10px "Cairo", sans-serif', color: '#e2e8f0', align: isAr ? 'left' : 'right' }
  );
  drawText(
    `${isAr ? 'معدل TVA' : 'TVA'}: ${report.vatRatePct}%`,
    endEdge + (isAr ? 16 : -16),
    curY + 74,
    { font: 'bold 10px "Cairo", sans-serif', color: '#fbbf24', align: isAr ? 'left' : 'right' }
  );

  curY += 112;

  // 4 Summary Cards
  const cardW = (contentW - 24) / 3;
  const kpis = [
    {
      label: isAr ? 'إجمالي المبيعات (TTC)' : 'CA Ventes (TTC)',
      val: `${report.totalSalesTtc.toFixed(2)} ${currencySymbol}`,
      sub: `HT: ${report.salesHt.toFixed(2)} · ${report.ordersCount} ${isAr ? 'فاتورة' : 'tickets'}`,
      bg: '#f8fafc',
      border: '#cbd5e1',
      valColor: '#0f172a'
    },
    {
      label: isAr ? 'TVA المحصلة - TVA المسترجعة' : 'TVA Collectée / Déductible',
      val: `${report.tvaCollectee.toFixed(2)} / ${report.tvaDeductible.toFixed(2)}`,
      sub: `${isAr ? 'فواتير رسمية ICE:' : 'Factures ICE:'} ${report.officialInvoicesCount}`,
      bg: '#eff6ff',
      border: '#bfdbfe',
      valColor: '#1d4ed8'
    },
    {
      label:
        report.netTvaPayable >= 0
          ? isAr
            ? 'صافي TVA المستحقة للدولة'
            : 'TVA Nette à Payer'
          : isAr
          ? 'فائض / رصيد TVA مسترجع'
          : 'Crédit de TVA',
      val: `${Math.abs(report.netTvaPayable).toFixed(2)} ${currencySymbol}`,
      sub: `${isAr ? 'تقدير CPU:' : 'CPU Est.:'} ${report.estimatedCpuTax.toFixed(2)} ${currencySymbol}`,
      bg: report.netTvaPayable >= 0 ? '#fef2f2' : '#ecfdf5',
      border: report.netTvaPayable >= 0 ? '#fecaca' : '#a7f3d0',
      valColor: report.netTvaPayable >= 0 ? '#b91c1c' : '#047857'
    }
  ];

  kpis.forEach((k, idx) => {
    const kx = padX + idx * (cardW + 12);
    ctx.fillStyle = k.bg;
    ctx.fillRect(kx, curY, cardW, 64);
    ctx.strokeStyle = k.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(kx, curY, cardW, 64);
    drawText(k.label, kx + cardW / 2, curY + 18, {
      font: 'bold 10px "Cairo", sans-serif',
      color: '#475569',
      align: 'center'
    });
    drawText(k.val, kx + cardW / 2, curY + 38, {
      font: 'bold 13px "Cairo", monospace',
      color: k.valColor,
      align: 'center'
    });
    drawText(k.sub, kx + cardW / 2, curY + 54, {
      font: '9.5px "Cairo", sans-serif',
      color: '#64748b',
      align: 'center'
    });
  });

  curY += 84;

  // Section header for ICE deductible invoices
  drawText(
    isAr
      ? `سجل فواتير المشتريات الرسمية (ICE) القابلة لاسترجاع TVA (${rows.length})`
      : `Relevé des Factures Fournisseurs ICE (${rows.length})`,
    startEdge,
    curY,
    { font: 'bold 13px "Cairo", sans-serif', color: '#0f172a' }
  );
  curY += 12;

  // Table header
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(padX, curY, contentW, 28);
  const cols = isAr
    ? [
        { label: 'التاريخ', x: padX + contentW - 10, align: 'right' as CanvasTextAlign },
        { label: 'رقم الفاتورة', x: padX + contentW - 105, align: 'right' as CanvasTextAlign },
        { label: 'المورد / ICE', x: padX + contentW - 220, align: 'right' as CanvasTextAlign },
        { label: 'HT', x: padX + 185, align: 'left' as CanvasTextAlign },
        { label: 'TVA', x: padX + 100, align: 'left' as CanvasTextAlign },
        { label: 'TTC', x: padX + 12, align: 'left' as CanvasTextAlign }
      ]
    : [
        { label: 'Date', x: padX + 10, align: 'left' as CanvasTextAlign },
        { label: 'Facture', x: padX + 95, align: 'left' as CanvasTextAlign },
        { label: 'Fournisseur / ICE', x: padX + 195, align: 'left' as CanvasTextAlign },
        { label: 'HT', x: padX + contentW - 180, align: 'right' as CanvasTextAlign },
        { label: 'TVA', x: padX + contentW - 100, align: 'right' as CanvasTextAlign },
        { label: 'TTC', x: padX + contentW - 12, align: 'right' as CanvasTextAlign }
      ];

  cols.forEach((c) =>
    drawText(c.label, c.x, curY + 18, {
      font: 'bold 10px "Cairo", sans-serif',
      color: '#ffffff',
      align: c.align
    })
  );
  curY += 28;

  if (rows.length === 0) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padX, curY, contentW, 44);
    drawText(
      isAr
        ? 'لا توجد فواتير شراء رسمية (ICE) مسجلة ضمن هذه الفترة.'
        : 'Aucune facture ICE officielle enregistrée sur cette période.',
      width / 2,
      curY + 26,
      { align: 'center', color: '#64748b' }
    );
    curY += 54;
  } else {
    rows.forEach((r, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(padX, curY, contentW, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(padX, curY + rowH);
      ctx.lineTo(padX + contentW, curY + rowH);
      ctx.stroke();

      drawText(r.date, cols[0].x, curY + 17, { align: cols[0].align, font: '10px monospace' });
      drawText(r.invoiceNumber, cols[1].x, curY + 17, {
        align: cols[1].align,
        font: 'bold 10px monospace',
        maxWidth: 100
      });
      drawText(`${r.supplierName} (${r.supplierIce})`, cols[2].x, curY + 17, {
        align: cols[2].align,
        font: '10px "Cairo", sans-serif',
        maxWidth: 230
      });
      drawText(r.ht.toFixed(2), cols[3].x, curY + 17, {
        align: cols[3].align,
        font: '10px monospace'
      });
      drawText(r.tvaDeductible.toFixed(2), cols[4].x, curY + 17, {
        align: cols[4].align,
        font: 'bold 10px monospace',
        color: '#047857'
      });
      drawText(r.ttc.toFixed(2), cols[5].x, curY + 17, {
        align: cols[5].align,
        font: 'bold 10px monospace'
      });
      curY += rowH;
    });
  }

  curY += 20;
  drawText(
    `${isAr ? 'ملاحظة: المصاريف العامة المسجلة:' : 'Charges générales:'} ${report.operatingExpensesTotal.toFixed(2)} ${currencySymbol} · ${isAr ? 'المشتريات غير الرسمية (نوار):' : 'Achats informels:'} ${report.informalPurchasesTotal.toFixed(2)} ${currencySymbol}`,
    width / 2,
    curY,
    { font: '10px "Cairo", sans-serif', color: '#64748b', align: 'center' }
  );

  const safeLabel = report.periodLabel.replace(/\s+/g, '_');
  const filename = `KadiPOS_Compta_TVA_${safeLabel}.pdf`;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const { blob } = (() => {
    // Reuse paginated helper if exported or convert inline
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const renderedH = (height * pdfWidth) / width;
    if (renderedH <= pdfHeight + 2) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, renderedH);
      return { blob: pdf.output('blob') };
    }
    saveCanvasAsPaginatedA4Pdf(canvas, width, height, filename);
    return { blob: null as unknown as Blob };
  })();

  if (blob) {
    triggerPdfDownload(blob, filename, pdf);
  }
  return filename;
}

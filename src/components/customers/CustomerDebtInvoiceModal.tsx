import React, { useEffect, useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Customer } from '../../types';
import { buildCustomerDebtInvoiceData } from '../../utils/debtInvoice';
import {
  generateAndDownloadCustomerDebtInvoicePdf,
  downloadAndSendDebtInvoiceViaWhatsApp
} from '../../utils/pdfReport';
import { bluetoothPrinter, BluetoothPrinterState } from '../../utils/bluetoothPrinter';
import { BluetoothPrinterModal } from '../printer/BluetoothPrinterModal';
import { playSound } from '../../utils/audio';
import {
  Printer,
  Bluetooth,
  Download,
  Copy,
  Check,
  X,
  FileText,
  Receipt,
  Loader2,
  AlertTriangle,
  Phone,
  Calendar,
  ShoppingBag,
  ArrowDownRight,
  CheckCircle2,
  MessageCircle
} from 'lucide-react';

interface CustomerDebtInvoiceModalProps {
  customer: Customer;
  onClose: () => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const CustomerDebtInvoiceModal: React.FC<CustomerDebtInvoiceModalProps> = ({
  customer,
  onClose
}) => {
  const { creditTransactions, orders, settings, currencySymbol, language, updateSettings } =
    usePos();
  const isAr = language === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const locale = isAr ? 'ar-MA' : language === 'fr' ? 'fr-MA' : 'en-US';

  const [viewMode, setViewMode] = useState<'detailed' | 'thermal'>('detailed');
  const [printerState, setPrinterState] = useState<BluetoothPrinterState>(() =>
    bluetoothPrinter.getState()
  );
  const [showBtPrinterModal, setShowBtPrinterModal] = useState(false);
  const [statusToast, setStatusToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingWaPdf, setSendingWaPdf] = useState(false);

  useEffect(() => {
    return bluetoothPrinter.subscribe(setPrinterState);
  }, []);

  const invoiceData = useMemo(
    () => buildCustomerDebtInvoiceData(customer, creditTransactions, orders, language),
    [customer, creditTransactions, orders, language]
  );

  const paperWidth = settings.receiptPaperWidth || '80mm';
  const isBtConnected =
    printerState.status === 'connected' || printerState.status === 'printing';
  const isPrintingBt = printerState.status === 'printing';

  const issueDateStr = new Date().toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formatShortDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return iso;
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setStatusToast({ type, message });
    setTimeout(() => {
      setStatusToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  // Hidden iframe print — works reliably inside preview iframes & long tables without window.open or dark-mode artifacts
  const handleSystemPrint = () => {
    const isThermal = viewMode === 'thermal';
    const pageRule = isThermal
      ? `@page { size: ${paperWidth === '58mm' ? '58mm' : '80mm'} auto; margin: 3mm; }`
      : `@page { size: A4 portrait; margin: 12mm; }`;

    const purchaseRowsHtml =
      invoiceData.purchaseItems.length === 0
        ? `<tr><td colspan="${isThermal ? 3 : 6}" style="text-align:center;padding:14px;color:#64748b;">${
            isAr ? 'لا توجد مشتريات مسجلة على الحساب' : 'No credit purchases recorded'
          }</td></tr>`
        : invoiceData.purchaseItems
            .map((item, idx) => {
              if (isThermal) {
                return `
                  <tr>
                    <td style="padding:5px 2px;border-bottom:1px dashed #cbd5e1;">
                      <div style="font-weight:700;font-size:11px;">${escapeHtml(item.description)}</div>
                      <div style="font-size:9px;color:#475569;">${escapeHtml(
                        formatShortDate(item.date)
                      )} · ${escapeHtml(item.sourceLabel)}</div>
                    </td>
                    <td style="padding:5px 2px;border-bottom:1px dashed #cbd5e1;text-align:center;font-family:monospace;font-size:11px;">
                      ${item.quantity} × ${item.unitPrice.toFixed(2)}
                    </td>
                    <td style="padding:5px 2px;border-bottom:1px dashed #cbd5e1;text-align:end;font-family:monospace;font-weight:700;font-size:11px;">
                      ${item.total.toFixed(2)}
                    </td>
                  </tr>
                `;
              }
              return `
                <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">
                    ${escapeHtml(formatShortDate(item.date))}
                  </td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:10px;font-family:monospace;color:#334155;">
                    ${escapeHtml(item.sourceLabel)}
                  </td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#0f172a;">
                    ${escapeHtml(item.description)}
                    ${
                      item.discount > 0
                        ? `<div style="font-size:10px;color:#be123c;">${
                            isAr ? 'خصم:' : 'Disc:'
                          } -${item.discount.toFixed(2)} ${escapeHtml(currencySymbol)}</div>`
                        : ''
                    }
                  </td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:monospace;font-size:12px;">
                    ${item.quantity}
                  </td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:center;font-family:monospace;font-size:12px;">
                    ${item.unitPrice.toFixed(2)}
                  </td>
                  <td style="padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:end;font-family:monospace;font-weight:700;font-size:12px;color:#0f172a;">
                    ${item.total.toFixed(2)} ${escapeHtml(currencySymbol)}
                  </td>
                </tr>
              `;
            })
            .join('');

    const paymentsHtml =
      invoiceData.paymentItems.length > 0
        ? `
          <div style="margin-top:16px;">
            <div style="font-weight:800;font-size:${isThermal ? '11px' : '13px'};margin-bottom:6px;color:#065f46;">
              ${isAr ? 'الدفعات المسددة سابقاً:' : 'Recorded Payments:'}
            </div>
            <table style="width:100%;border-collapse:collapse;">
              ${invoiceData.paymentItems
                .map(
                  (p) => `
                  <tr>
                    <td style="padding:5px 4px;border-bottom:1px solid #d1fae5;font-size:${
                      isThermal ? '10px' : '11px'
                    };color:#334155;">
                      ${escapeHtml(formatShortDate(p.date))} — ${escapeHtml(p.notes)}
                    </td>
                    <td style="padding:5px 4px;border-bottom:1px solid #d1fae5;text-align:end;font-family:monospace;font-weight:700;color:#047857;font-size:${
                      isThermal ? '11px' : '12px'
                    };">
                      -${p.amount.toFixed(2)} ${escapeHtml(currencySymbol)}
                    </td>
                  </tr>
                `
                )
                .join('')}
            </table>
          </div>
        `
        : '';

    const html = `<!DOCTYPE html>
      <html lang="${isAr ? 'ar' : language}" dir="${dir}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(
          isAr ? `فاتورة الدين - ${customer.name}` : `Debt Invoice - ${customer.name}`
        )}</title>
        <style>
          ${pageRule}
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: ${isThermal ? '4px' : '8px'};
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            direction: ${dir};
          }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
        <div style="max-width:${isThermal ? (paperWidth === '58mm' ? '54mm' : '74mm') : '100%'};margin:0 auto;">
          <div style="text-align:center;padding-bottom:12px;border-bottom:2px solid #0f172a;">
            ${
              settings.storeLogo &&
              (settings.storeLogo.startsWith('data:image/') || settings.storeLogo.startsWith('https://'))
                ? `<img src="${escapeHtml(settings.storeLogo)}" alt="${escapeHtml(
                    settings.storeName
                  )}" style="width:${isThermal ? '42px' : '58px'};height:${
                    isThermal ? '42px' : '58px'
                  };object-fit:contain;margin:0 auto 6px;display:block;border-radius:8px;" />`
                : ''
            }
            <div style="font-size:${isThermal ? '15px' : '22px'};font-weight:900;">${escapeHtml(
      settings.storeName
    )}</div>
            ${
              settings.address
                ? `<div style="font-size:${isThermal ? '10px' : '12px'};color:#475569;margin-top:2px;">${escapeHtml(
                    settings.address
                  )}</div>`
                : ''
            }
            ${
              settings.phone
                ? `<div style="font-size:${isThermal ? '10px' : '12px'};color:#475569;font-family:monospace;">${escapeHtml(
                    settings.phone
                  )}</div>`
                : ''
            }
            <div style="display:inline-block;margin-top:8px;padding:4px 12px;border-radius:6px;background:#fef3c7;border:1px solid #f59e0b;color:#92400e;font-weight:900;font-size:${
              isThermal ? '11px' : '14px'
            };">
              ${isAr ? 'فاتورة الدين بتفاصيل المشتريات' : 'Customer Debt Invoice (Itemized)'}
            </div>
          </div>

          <div style="margin:12px 0;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:${
            isThermal ? '10px' : '12px'
          };">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span><strong>${isAr ? 'الزبون:' : 'Customer:'}</strong> ${escapeHtml(
      customer.name
    )}</span>
              <span style="font-family:monospace;">${escapeHtml(customer.phone)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:#475569;font-size:${
              isThermal ? '9px' : '11px'
            };">
              <span>${isAr ? 'تاريخ الطباعة:' : 'Issued:'} ${escapeHtml(issueDateStr)}</span>
              <span>${isAr ? 'عدد السلع/البنود:' : 'Items:'} ${
      invoiceData.purchaseItems.length
    }</span>
            </div>
          </div>

          <div style="font-weight:800;font-size:${
            isThermal ? '11px' : '13px'
          };margin-bottom:6px;color:#0f172a;">
            ${isAr ? 'تفاصيل المشتريات على الحساب:' : 'Credit Purchases Details:'}
          </div>

          <table>
            <thead>
              <tr style="background:#0f172a;color:#ffffff;font-size:${
                isThermal ? '10px' : '11px'
              };">
                ${
                  isThermal
                    ? `
                      <th style="padding:5px 3px;text-align:start;">${
                        isAr ? 'المنتج' : 'Item'
                      }</th>
                      <th style="padding:5px 3px;text-align:center;">${
                        isAr ? 'ك × ث' : 'Qty×Price'
                      }</th>
                      <th style="padding:5px 3px;text-align:end;">${
                        isAr ? 'المجموع' : 'Total'
                      }</th>
                    `
                    : `
                      <th style="padding:8px 6px;text-align:start;">${
                        isAr ? 'التاريخ' : 'Date'
                      }</th>
                      <th style="padding:8px 6px;text-align:start;">${
                        isAr ? 'رقم الفاتورة' : 'Ref'
                      }</th>
                      <th style="padding:8px 6px;text-align:start;">${
                        isAr ? 'السلعة / البيان' : 'Item Description'
                      }</th>
                      <th style="padding:8px 6px;text-align:center;">${
                        isAr ? 'الكمية' : 'Qty'
                      }</th>
                      <th style="padding:8px 6px;text-align:center;">${
                        isAr ? 'ثمن الوحدة' : 'Unit Price'
                      }</th>
                      <th style="padding:8px 6px;text-align:end;">${
                        isAr ? 'المجموع' : 'Total'
                      }</th>
                    `
                }
              </tr>
            </thead>
            <tbody>
              ${purchaseRowsHtml}
            </tbody>
          </table>

          ${paymentsHtml}

          <div style="margin-top:16px;padding:12px;border:2px solid #0f172a;border-radius:10px;background:#fffbeb;">
            <div style="display:flex;justify-content:space-between;font-size:${
              isThermal ? '11px' : '12px'
            };margin-bottom:4px;">
              <span>${isAr ? 'مجموع المشتريات بالكريدي:' : 'Total Credit Purchases:'}</span>
              <strong style="font-family:monospace;">${invoiceData.totalPurchasesDebt.toFixed(
                2
              )} ${escapeHtml(currencySymbol)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:${
              isThermal ? '11px' : '12px'
            };color:#047857;margin-bottom:6px;">
              <span>${isAr ? 'إجمالي الدفعات المسددة:' : 'Total Payments:'}</span>
              <strong style="font-family:monospace;">-${invoiceData.totalPayments.toFixed(
                2
              )} ${escapeHtml(currencySymbol)}</strong>
            </div>
            <div style="border-top:1px dashed #b45309;padding-top:8px;display:flex;justify-content:space-between;font-size:${
              isThermal ? '14px' : '17px'
            };font-weight:900;color:#b45309;">
              <span>${isAr ? 'صافي الدين الباقي في الذمة:' : 'Remaining Balance Due:'}</span>
              <span style="font-family:monospace;">${invoiceData.remainingDebt.toFixed(
                2
              )} ${escapeHtml(currencySymbol)}</span>
            </div>
          </div>

          <div style="text-align:center;margin-top:16px;font-size:${
            isThermal ? '10px' : '11px'
          };color:#64748b;">
            ${escapeHtml(settings.receiptFooterMsg || '')}
          </div>
        </div>
      </body>
      </html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc || !iframe.contentWindow) {
      document.body.removeChild(iframe);
      showToast('error', isAr ? 'تعذر فتح نافذة الطباعة' : 'Could not prepare print frame');
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        playSound('success');
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1200);
      }
    }, 150);
  };

  const handleDownloadPdf = () => {
    try {
      const { filename } = generateAndDownloadCustomerDebtInvoicePdf({
        data: invoiceData,
        settings,
        currencySymbol,
        language
      });
      playSound('success');
      showToast(
        'success',
        isAr ? `تم تحميل ملف PDF: ${filename}` : `Downloaded PDF: ${filename}`
      );
    } catch {
      playSound('error');
      showToast('error', isAr ? 'حدث خطأ أثناء إنشاء PDF' : 'Failed to generate PDF');
    }
  };

  const handleDownloadPdfAndWhatsApp = async () => {
    if (sendingWaPdf) return;
    setSendingWaPdf(true);
    try {
      const res = await downloadAndSendDebtInvoiceViaWhatsApp({
        data: invoiceData,
        settings,
        currencySymbol,
        language
      });
      playSound('success');
      showToast(
        'success',
        res.mode === 'native_file_share'
          ? isAr
            ? `تم تحميل ومشاركة فاتورة الدين PDF (${res.filename})`
            : `Shared Debt Invoice PDF (${res.filename})`
          : res.phoneTargeted
          ? isAr
            ? `تم تحميل PDF (${res.filename}) وفتح واتساب الزبون — أرفق الملف واضغط إرسال`
            : `PDF downloaded (${res.filename}) & WhatsApp opened`
          : isAr
          ? `تم تحميل PDF (${res.filename}) وفتح واتساب`
          : `PDF downloaded (${res.filename}) & WhatsApp opened`
      );
    } catch {
      playSound('error');
      showToast('error', isAr ? 'تعذر تجهيز PDF أو فتح واتساب' : 'Failed to share debt PDF');
    } finally {
      setSendingWaPdf(false);
    }
  };

  const executeBluetoothPrint = async () => {
    const res = await bluetoothPrinter.printCustomerDebtInvoice(
      invoiceData,
      settings,
      currencySymbol,
      language
    );
    if (res.success) {
      playSound('success');
      showToast(
        'success',
        isAr
          ? `تمت طباعة فاتورة الدين عبر البلوتوث (${paperWidth})`
          : `Debt invoice printed via Bluetooth (${paperWidth})`
      );
    } else {
      playSound('error');
      showToast('error', res.error || (isAr ? 'فشل الطباعة عبر البلوتوث' : 'Bluetooth print failed'));
    }
  };

  const handleBluetoothPrintClick = async () => {
    if (!bluetoothPrinter.isConnected()) {
      setShowBtPrinterModal(true);
      return;
    }
    await executeBluetoothPrint();
  };

  const handleCopySummary = () => {
    const lines: string[] = [
      `${settings.storeName} — ${isAr ? 'فاتورة الدين بالمشتريات' : 'Debt Invoice'}`,
      `${isAr ? 'الزبون:' : 'Customer:'} ${customer.name} (${customer.phone})`,
      `${isAr ? 'التاريخ:' : 'Date:'} ${issueDateStr}`,
      '--------------------------------',
      isAr ? 'تفاصيل المشتريات:' : 'Purchases:'
    ];

    invoiceData.purchaseItems.forEach((it, idx) => {
      lines.push(
        `${idx + 1}. ${it.description} (${it.quantity} × ${it.unitPrice.toFixed(2)}) = ${it.total.toFixed(2)} ${currencySymbol}`
      );
    });

    if (invoiceData.paymentItems.length > 0) {
      lines.push('--------------------------------');
      lines.push(isAr ? 'الدفعات المسددة:' : 'Payments:');
      invoiceData.paymentItems.forEach((p) => {
        lines.push(`- ${formatShortDate(p.date)}: -${p.amount.toFixed(2)} ${currencySymbol}`);
      });
    }

    lines.push('--------------------------------');
    lines.push(
      `${isAr ? 'مجموع المشتريات:' : 'Total Purchases:'} ${invoiceData.totalPurchasesDebt.toFixed(2)} ${currencySymbol}`
    );
    lines.push(
      `${isAr ? 'إجمالي المدفوع:' : 'Total Paid:'} ${invoiceData.totalPayments.toFixed(2)} ${currencySymbol}`
    );
    lines.push(
      `${isAr ? 'الدين الباقي بذمته:' : 'Balance Due:'} ${invoiceData.remainingDebt.toFixed(2)} ${currencySymbol}`
    );

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      dir={dir}
    >
      <div
        className={`w-full ${
          viewMode === 'detailed' ? 'max-w-3xl' : 'max-w-lg'
        } bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh] overflow-hidden transition-all duration-200`}
      >
        {/* Top Modal Action Bar */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {isAr ? 'فاتورة الدين بتفاصيل المشتريات' : 'Customer Debt Invoice (Itemized)'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {customer.name} · <span className="font-mono">{customer.phone}</span>
              </p>
            </div>
          </div>

          {/* Mode Toggle + Close */}
          <div className="flex items-center gap-2">
            <div className="inline-flex p-1 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300/70 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('detailed')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                  viewMode === 'detailed'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isAr ? 'مفصلة A4' : 'A4 Detailed'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('thermal')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                  viewMode === 'thermal'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>{isAr ? `حراري (${paperWidth})` : `Thermal (${paperWidth})`}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSystemPrint}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>{isAr ? 'طباعة الفاتورة' : 'Print Invoice'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>{isAr ? 'تحميل PDF' : 'Save PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadPdfAndWhatsApp()}
              disabled={sendingWaPdf}
              className="px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
              title={isAr ? 'تحميل فاتورة الدين PDF وبعثها في واتساب' : 'Download PDF & Send via WhatsApp'}
            >
              {sendingWaPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              <span>
                {sendingWaPdf
                  ? (isAr ? 'جاري التجهيز...' : 'Preparing...')
                  : (isAr ? 'PDF + واتساب' : 'PDF + WhatsApp')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleBluetoothPrintClick}
              disabled={isPrintingBt}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 ${
                isBtConnected
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
              }`}
            >
              {isPrintingBt ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bluetooth className="w-4 h-4" />
              )}
              <span>
                {isBtConnected
                  ? isAr
                    ? `طباعة بلوتوث (${paperWidth})`
                    : `BT Print (${paperWidth})`
                  : isAr
                  ? 'طباعة بالبلوتوث'
                  : 'Bluetooth Print'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ التفاصيل' : 'Copy'}</span>
            </button>
          </div>

          {viewMode === 'thermal' && (
            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              {(['80mm', '58mm'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => updateSettings({ receiptPaperWidth: size })}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-colors ${
                    paperWidth === size
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Toast */}
        {statusToast && (
          <div
            className={`mx-4 sm:mx-6 mt-3 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border shrink-0 ${
              statusToast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {statusToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusToast.message}</span>
          </div>
        )}

        {/* Printable Invoice Preview Paper */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950">
          {viewMode === 'detailed' ? (
            /* A4 Detailed Invoice Preview */
            <div className="bg-white text-slate-900 rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 space-y-5 max-w-2xl mx-auto">
              {/* Store Header & Invoice Title */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b-2 border-slate-900">
                <div className="flex items-start gap-3">
                  {settings.storeLogo && (
                    <img
                      src={settings.storeLogo}
                      alt={settings.storeName}
                      className="w-14 h-14 object-contain rounded-xl border border-slate-200 bg-white p-1 shrink-0"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{settings.storeName}</h2>
                    {settings.address && (
                      <p className="text-xs text-slate-600 mt-0.5">{settings.address}</p>
                    )}
                    {settings.phone && (
                      <p className="text-xs text-slate-600 font-mono mt-0.5 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <span>{settings.phone}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-end">
                  <span className="inline-block px-3 py-1 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black">
                    {isAr ? 'فاتورة الدين بتفاصيل المشتريات' : 'Itemized Debt Invoice'}
                  </span>
                  <div className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-end gap-1 font-mono">
                    <Calendar className="w-3 h-3" />
                    <span>{issueDateStr}</span>
                  </div>
                </div>
              </div>

              {/* Customer Card & Quick Totals */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">
                    {isAr ? 'بيانات الزبون المدين' : 'Customer Information'}
                  </div>
                  <div className="font-black text-sm text-slate-900">{customer.name}</div>
                  <div className="font-mono text-slate-600">{customer.phone}</div>
                  {customer.notes && <div className="text-[11px] text-slate-500">{customer.notes}</div>}
                </div>

                <div className="flex flex-col justify-center sm:items-end space-y-1">
                  <div className="text-[10px] font-bold text-amber-800 uppercase">
                    {isAr ? 'صافي الدين الباقي في الذمة' : 'Remaining Balance Due'}
                  </div>
                  <div className="text-2xl font-black text-rose-600 font-mono tabular-nums">
                    {invoiceData.remainingDebt.toFixed(2)} {currencySymbol}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isAr
                      ? `${invoiceData.purchaseItems.length} بنود مشتريات · ${invoiceData.paymentItems.length} دفعات`
                      : `${invoiceData.purchaseItems.length} items · ${invoiceData.paymentItems.length} payments`}
                  </div>
                </div>
              </div>

              {/* Itemized Purchases Table */}
              <div>
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 mb-2">
                  <ShoppingBag className="w-4 h-4 text-amber-600" />
                  <span>{isAr ? 'تفاصيل المشتريات على الحساب:' : 'Itemized Credit Purchases:'}</span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="py-2 px-2.5 text-start font-bold">
                          {isAr ? 'التاريخ' : 'Date'}
                        </th>
                        <th className="py-2 px-2.5 text-start font-bold">
                          {isAr ? 'المرجع' : 'Ref'}
                        </th>
                        <th className="py-2 px-2.5 text-start font-bold">
                          {isAr ? 'السلعة / البيان' : 'Item Description'}
                        </th>
                        <th className="py-2 px-2 text-center font-bold">
                          {isAr ? 'الكمية' : 'Qty'}
                        </th>
                        <th className="py-2 px-2 text-center font-bold">
                          {isAr ? 'ثمن الوحدة' : 'Price'}
                        </th>
                        <th className="py-2 px-2.5 text-end font-bold">
                          {isAr ? 'المجموع' : 'Total'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoiceData.purchaseItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400">
                            {isAr ? 'لا توجد مشتريات مسجلة لهذا الزبون' : 'No credit purchases found'}
                          </td>
                        </tr>
                      ) : (
                        invoiceData.purchaseItems.map((item, idx) => (
                          <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                            <td className="py-2 px-2.5 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                              {formatShortDate(item.date)}
                            </td>
                            <td className="py-2 px-2.5 text-slate-500 whitespace-nowrap font-mono text-[10px]">
                              {item.sourceLabel}
                            </td>
                            <td className="py-2 px-2.5 font-semibold text-slate-900">
                              <div>{item.description}</div>
                              {item.discount > 0 && (
                                <div className="text-[10px] text-rose-600 font-bold">
                                  {isAr ? 'خصم:' : 'Discount:'} -{item.discount.toFixed(2)}{' '}
                                  {currencySymbol}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums">
                              {item.quantity}
                            </td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums">
                              {item.unitPrice.toFixed(2)}
                            </td>
                            <td className="py-2 px-2.5 text-end font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                              {item.total.toFixed(2)} {currencySymbol}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recorded Payments Section */}
              {invoiceData.paymentItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-black text-emerald-800 mb-2">
                    <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    <span>{isAr ? 'الدفعات المسددة سابقاً:' : 'Recorded Payments:'}</span>
                  </div>
                  <div className="border border-emerald-200 rounded-xl divide-y divide-emerald-100 bg-emerald-50/40">
                    {invoiceData.paymentItems.map((pay) => (
                      <div
                        key={pay.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] text-emerald-700 shrink-0">
                            {formatShortDate(pay.date)}
                          </span>
                          <span className="font-semibold text-slate-800 truncate">{pay.notes}</span>
                        </div>
                        <span className="font-mono font-black tabular-nums text-emerald-700 shrink-0">
                          -{pay.amount.toFixed(2)} {currencySymbol}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totals Summary Box */}
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-700">
                  <span>{isAr ? 'مجموع المشتريات بالكريدي:' : 'Total Credit Purchases:'}</span>
                  <span className="font-mono font-bold tabular-nums">
                    {invoiceData.totalPurchasesDebt.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>{isAr ? 'إجمالي الدفعات المسددة:' : 'Total Payments Received:'}</span>
                  <span className="font-mono tabular-nums">
                    -{invoiceData.totalPayments.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="pt-2 border-t border-amber-300 flex justify-between items-center text-base font-black text-amber-950">
                  <span>{isAr ? 'صافي الدين الباقي في الذمة:' : 'Remaining Balance Due:'}</span>
                  <span className="font-mono text-lg text-rose-700 tabular-nums">
                    {invoiceData.remainingDebt.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>

              {settings.receiptFooterMsg && (
                <div className="text-center text-[11px] text-slate-500 pt-1">
                  {settings.receiptFooterMsg}
                </div>
              )}
            </div>
          ) : (
            /* Thermal Receipt Preview (58mm / 80mm) */
            <div
              className={`bg-white text-slate-900 rounded-xl shadow-sm border border-slate-200 p-4 mx-auto font-sans ${
                paperWidth === '58mm' ? 'max-w-[260px]' : 'max-w-[340px]'
              }`}
            >
              <div className="text-center pb-3 border-b border-dashed border-slate-400">
                {settings.storeLogo && (
                  <img
                    src={settings.storeLogo}
                    alt={settings.storeName}
                    className="w-11 h-11 object-contain mx-auto mb-1 rounded-lg"
                  />
                )}
                <div className="font-black text-sm">{settings.storeName}</div>
                {settings.phone && (
                  <div className="text-[10px] font-mono text-slate-500">{settings.phone}</div>
                )}
                <div className="mt-1.5 inline-block px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-black">
                  {isAr ? 'فاتورة الدين بالمشتريات' : 'DEBT INVOICE'}
                </div>
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-400 text-[11px] space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAr ? 'الزبون:' : 'Customer:'}</span>
                  <span className="font-bold">{customer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAr ? 'الهاتف:' : 'Phone:'}</span>
                  <span className="font-mono">{customer.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isAr ? 'التاريخ:' : 'Date:'}</span>
                  <span className="font-mono text-[10px]">{issueDateStr}</span>
                </div>
              </div>

              <div className="py-2 border-b border-dashed border-slate-400 space-y-1.5">
                <div className="text-[10px] font-black text-slate-700">
                  {isAr ? 'تفاصيل المشتريات:' : 'Purchases:'}
                </div>
                {invoiceData.purchaseItems.length === 0 ? (
                  <div className="text-center text-[10px] text-slate-400 py-2">
                    {isAr ? 'لا توجد مشتريات مسجلة' : 'No purchases'}
                  </div>
                ) : (
                  invoiceData.purchaseItems.map((it) => (
                    <div key={it.id} className="text-[11px] flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold leading-snug">{it.description}</div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          {formatShortDate(it.date)} · {it.quantity} × {it.unitPrice.toFixed(2)}
                        </div>
                      </div>
                      <span className="font-mono font-bold tabular-nums shrink-0">
                        {it.total.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {invoiceData.paymentItems.length > 0 && (
                <div className="py-2 border-b border-dashed border-slate-400 space-y-1">
                  <div className="text-[10px] font-black text-emerald-700">
                    {isAr ? 'الدفعات المسددة:' : 'Payments:'}
                  </div>
                  {invoiceData.paymentItems.map((p) => (
                    <div key={p.id} className="text-[10px] flex justify-between gap-2 text-emerald-800">
                      <span className="truncate">
                        {formatShortDate(p.date)} · {p.notes}
                      </span>
                      <span className="font-mono font-bold shrink-0">-{p.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="py-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-600">{isAr ? 'مجموع المشتريات:' : 'Purchases:'}</span>
                  <span className="font-mono font-bold">
                    {invoiceData.totalPurchasesDebt.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>{isAr ? 'المسدد:' : 'Paid:'}</span>
                  <span className="font-mono">
                    -{invoiceData.totalPayments.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-black pt-1.5 border-t border-slate-300 text-rose-700">
                  <span>{isAr ? 'الباقي بذمته:' : 'Balance Due:'}</span>
                  <span className="font-mono">
                    {invoiceData.remainingDebt.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>

              {settings.receiptFooterMsg && (
                <div className="text-center pt-2 border-t border-dashed border-slate-300 text-[9px] text-slate-500">
                  {settings.receiptFooterMsg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>

      {/* Bluetooth Printer Pairing Modal */}
      <BluetoothPrinterModal
        isOpen={showBtPrinterModal}
        onClose={() => setShowBtPrinterModal(false)}
        onConnectedAndPrint={async () => {
          setShowBtPrinterModal(false);
          await executeBluetoothPrint();
        }}
      />
    </div>
  );
};

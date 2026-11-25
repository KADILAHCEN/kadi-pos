import React, { useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { Order } from '../../types';
import { ReceiptModal } from '../pos/ReceiptModal';
import {
  generateAndDownloadDetailedInvoicePdf,
  downloadAndSendInvoiceViaWhatsApp
} from '../../utils/pdfReport';
import { playSound } from '../../utils/audio';
import {
  Receipt,
  Search,
  Filter,
  Printer,
  RotateCcw,
  CheckCircle2,
  Clock,
  Eye,
  X,
  Download,
  FileText,
  RefreshCw,
  Database,
  MessageCircle,
  FileSpreadsheet,
  ArrowLeftRight,
  Landmark
} from 'lucide-react';
import { exportOrdersToExcel, exportOrdersToPdf } from '../../utils/exportReports';
import { ReturnExchangeModal } from './ReturnExchangeModal';
import { AccountingTvaExportModal } from '../cpu/AccountingTvaExportModal';

export const OrdersView: React.FC = () => {
  const {
    orders,
    customers,
    refundOrder,
    settings,
    currencySymbol,
    language,
    isOnline,
    offlineSalesQueue,
    isSyncingOfflineSales,
    syncPendingOfflineSales
  } = usePos();
  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<Order | null>(null);
  const [receiptViewMode, setReceiptViewMode] = useState<'thermal' | 'detailed'>('thermal');
  const [pdfFeedback, setPdfFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [refundConfirmOrder, setRefundConfirmOrder] = useState<Order | null>(null);
  const [exchangeOrder, setExchangeOrder] = useState<Order | null>(null);
  const [showAccountingExportModal, setShowAccountingExportModal] = useState(false);

  const handleDirectDownloadPdf = (order: Order) => {
    try {
      const res = generateAndDownloadDetailedInvoicePdf({
        order,
        settings,
        currencySymbol,
        language
      });
      if (settings.enableSoundEffects) playSound('success');
      setPdfFeedback({
        ok: true,
        msg: isAr
          ? `✅ تم تنزيل الفاتورة بصيغة PDF بنجاح: ${res.filename}`
          : `✅ Invoice PDF downloaded: ${res.filename}`
      });
    } catch (err) {
      if (settings.enableSoundEffects) playSound('error');
      const details = err instanceof Error ? err.message : '';
      setPdfFeedback({
        ok: false,
        msg: isAr
          ? `⚠️ تعذر تحميل ملف PDF للفاتورة ${order.orderNumber}${details ? ` (${details})` : ''}`
          : `⚠️ Failed to download PDF for ${order.orderNumber}`
      });
    }
    setTimeout(() => setPdfFeedback(null), 4000);
  };

  const handleDownloadPdfAndWhatsApp = async (order: Order) => {
    try {
      const resolvedPhone =
        order.customerPhone ||
        (order.customerId ? customers.find((c) => c.id === order.customerId)?.phone : '') ||
        '';
      const res = await downloadAndSendInvoiceViaWhatsApp({
        order,
        settings,
        currencySymbol,
        language,
        customerPhoneOverride: resolvedPhone
      });
      if (settings.enableSoundEffects) playSound('success');
      setPdfFeedback({
        ok: true,
        msg:
          res.mode === 'native_file_share'
            ? isAr
              ? `✅ تم تنزيل ومشاركة الفاتورة PDF (${res.filename})`
              : `✅ Shared Invoice PDF: ${res.filename}`
            : res.phoneTargeted
            ? isAr
              ? `✅ تم تحميل الفاتورة PDF (${res.filename}) وفتح واتساب الزبون — أرفق الملف واضغط إرسال`
              : `✅ Downloaded ${res.filename} & opened customer WhatsApp`
            : isAr
            ? `✅ تم تحميل الفاتورة PDF (${res.filename}) وفتح واتساب — اختر الزبون وأرفق الملف`
            : `✅ Downloaded ${res.filename} & opened WhatsApp`
      });
    } catch (err) {
      if (settings.enableSoundEffects) playSound('error');
      const details = err instanceof Error ? err.message : '';
      setPdfFeedback({
        ok: false,
        msg: isAr
          ? `⚠️ تعذر تحميل وإرسال PDF للفاتورة ${order.orderNumber}${details ? ` (${details})` : ''}`
          : `⚠️ Failed to send PDF via WhatsApp for ${order.orderNumber}`
      });
    }
    setTimeout(() => setPdfFeedback(null), 5000);
  };

  const filteredOrders = orders.filter((o) => {
    const matchesMethod = filterMethod === 'all' || o.paymentMethod === filterMethod;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      o.orderNumber.toLowerCase().includes(query) ||
      (o.customerName && o.customerName.toLowerCase().includes(query)) ||
      o.items.some((i) => i.productName.toLowerCase().includes(query));

    return matchesMethod && matchesQuery;
  });

  const handleRefund = (order: Order) => {
    setRefundConfirmOrder(order);
  };

  const confirmRefundNow = () => {
    if (!refundConfirmOrder) return;
    refundOrder(refundConfirmOrder.id, true);
    if (settings.enableSoundEffects) playSound('click');
    setRefundConfirmOrder(null);
  };

  const exportSalesCsv = () => {
    const headers = [
      isAr ? 'رقم الفاتورة' : 'Invoice Number',
      isAr ? 'التاريخ والوقت' : 'Date Time',
      isAr ? 'العميل' : 'Customer',
      isAr ? 'طريقة الدفع' : 'Payment Method',
      isAr ? 'عدد القطع' : 'Items Count',
      isAr ? 'المجموع قبل الضريبة' : 'Subtotal',
      isAr ? 'الخصم' : 'Discount',
      isAr ? 'الضريبة' : 'Tax',
      isAr ? 'المجموع النهائي' : 'Grand Total',
      isAr ? 'التكلفة الإجمالية' : 'Total Cost',
      isAr ? 'صافي الربح' : 'Net Profit',
      isAr ? 'الحالة' : 'Status'
    ];

    const rows = filteredOrders.map((o) => {
      const itemsCount = o.items.reduce((sum, it) => sum + it.quantity, 0);
      return [
        `"${o.orderNumber}"`,
        `"${new Date(o.date).toLocaleString(isAr ? 'ar-MA' : 'fr-FR')}"`,
        `"${(o.customerName || (isAr ? 'عميل عام' : 'Walk-in')).replace(/"/g, '""')}"`,
        `"${o.paymentMethod}"`,
        itemsCount,
        o.subtotal.toFixed(2),
        o.discountTotal.toFixed(2),
        o.taxTotal.toFixed(2),
        o.grandTotal.toFixed(2),
        o.costTotal.toFixed(2),
        o.profitTotal.toFixed(2),
        `"${o.status === 'refunded' ? (isAr ? 'مسترجع' : 'Refunded') : (isAr ? 'مكتمل' : 'Completed')}"`
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `kadi_pos_sales_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950 p-3 sm:p-6">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {t.orders}
          </h2>
          <p className="text-xs text-slate-500">
            {orders.length} {isAr ? 'فاتورة مسجلة' : 'invoices recorded'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[200px]">
            <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 rtl:right-auto top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'ابحث برقم الفاتورة أو العميل...' : 'Search invoice or customer...'}
              className="w-full py-2 px-9 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
            />
          </div>

          {/* Payment filter */}
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="py-2 px-3 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
          >
            <option value="all">{isAr ? 'جميع وسائل الدفع' : 'All Payments'}</option>
            <option value="cash">{t.cash}</option>
            <option value="card">{t.card}</option>
            <option value="apple_pay">{t.apple_pay}</option>
            <option value="split">{t.split}</option>
            <option value="credit">{t.credit}</option>
          </select>

          {/* Offline IndexedDB Sync Queue Trigger */}
          {offlineSalesQueue.length > 0 && (
            <button
              type="button"
              onClick={() => void syncPendingOfflineSales()}
              disabled={!isOnline || isSyncingOfflineSales}
              className="px-3.5 py-2 text-xs font-extrabold rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
              title={
                isAr
                  ? 'مزامنة المبيعات المحفوظة مؤقتاً في IndexedDB'
                  : 'Sync queued IndexedDB offline sales'
              }
            >
              {isSyncingOfflineSales ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>
                {isSyncingOfflineSales
                  ? (isAr ? 'جاري المزامنة...' : 'Syncing...')
                  : (isAr
                    ? `مزامنة IndexedDB (${offlineSalesQueue.length})`
                    : `Sync Offline (${offlineSalesQueue.length})`)}
              </span>
            </button>
          )}

          {/* Export Excel (.xlsx) Button */}
          <button
            type="button"
            onClick={() => {
              const filename = exportOrdersToExcel(filteredOrders, currencySymbol, language);
              if (settings.enableSoundEffects) playSound('success');
              setPdfFeedback({
                ok: true,
                msg: isAr ? `✅ تم تصدير ملف إكسل: ${filename}` : `✅ Exported Excel: ${filename}`
              });
              setTimeout(() => setPdfFeedback(null), 4000);
            }}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
            title={isAr ? 'تصدير سجل المبيعات كملف Excel (.xlsx)' : 'Export Sales to Excel'}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isAr ? 'تصدير إكسل' : 'Excel'}</span>
          </button>

          {/* Export PDF Button */}
          <button
            type="button"
            onClick={() => {
              const filename = exportOrdersToPdf({
                orders: filteredOrders,
                settings,
                currencySymbol,
                language,
                filterSummary: filterMethod === 'all' ? undefined : filterMethod
              });
              if (settings.enableSoundEffects) playSound('success');
              setPdfFeedback({
                ok: true,
                msg: isAr ? `✅ تم تحميل تقرير PDF: ${filename}` : `✅ Exported PDF: ${filename}`
              });
              setTimeout(() => setPdfFeedback(null), 4000);
            }}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
            title={isAr ? 'تصدير سجل المبيعات كملف PDF' : 'Export Sales to PDF'}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isAr ? 'تصدير PDF' : 'PDF'}</span>
          </button>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={exportSalesCsv}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
            title={isAr ? 'تصدير سجل المبيعات كملف CSV' : 'Export Sales to CSV'}
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
          </button>

          {/* Accounting TVA + ICE Export Modal Trigger */}
          <button
            type="button"
            onClick={() => setShowAccountingExportModal(true)}
            className="px-3.5 py-2 text-xs font-black rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 transition-colors flex items-center gap-1.5 shadow-2xs shrink-0 whitespace-nowrap"
            title={isAr ? 'تصدير كشف المحاسبة والضريبة على القيمة المضافة TVA وفواتير ICE' : 'Export Accounting TVA & ICE Report'}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>{isAr ? 'تصدير المحاسبة TVA' : 'Accounting TVA'}</span>
          </button>
        </div>
      </div>

      {pdfFeedback && (
        <div
          className={`mb-3 px-4 py-2.5 rounded-xl text-xs font-bold border shrink-0 ${
            pdfFeedback.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}
        >
          {pdfFeedback.msg}
        </div>
      )}

      {/* Orders Table Container */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left rtl:text-right border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-xs text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3.5 px-4">{t.invoice_no}</th>
                <th className="py-3.5 px-4">{t.date_time}</th>
                <th className="py-3.5 px-3">{t.customer_name}</th>
                <th className="py-3.5 px-3">{isAr ? 'طريقة الدفع' : 'Method'}</th>
                <th className="py-3.5 px-3">{isAr ? 'العناصر' : 'Items'}</th>
                <th className="py-3.5 px-4 font-mono font-bold">{t.total_to_pay}</th>
                <th className="py-3.5 px-3">{isAr ? 'الربح' : 'Profit'}</th>
                <th className="py-3.5 px-4 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-900 dark:text-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <span>{isAr ? 'لا توجد فواتير مطابقة' : 'No matching invoices'}</span>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => {
                  const isRefunded = o.status === 'refunded';
                  const isPartiallyRefunded = o.status === 'partially_refunded';
                  const totalItems = o.items.reduce((sum, it) => sum + it.quantity, 0);

                  return (
                    <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-extrabold text-slate-900 dark:text-white">
                        <div>{o.orderNumber}</div>
                        {o.syncStatus === 'pending_sync' && (
                          <div className="text-[10px] font-sans font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                            {isAr ? 'أوفلاين · في انتظار المزامنة (IndexedDB)' : 'Offline · Pending Sync'}
                          </div>
                        )}
                        {o.syncStatus === 'syncing' && (
                          <div className="text-[10px] font-sans font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                            {isAr ? 'جاري المزامنة...' : 'Syncing...'}
                          </div>
                        )}
                        {o.createdOffline && o.syncStatus === 'synced' && (
                          <div className="text-[10px] font-sans font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {isAr ? 'أوفلاين · تمت المزامنة' : 'Offline · Synced'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(o.date).toLocaleDateString()} {new Date(o.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {o.customerName || (isAr ? 'عميل عام' : 'Walk-in')}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 uppercase">
                          {o.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                        {totalItems} {isAr ? 'قطع' : 'items'}
                      </td>
                      <td className="py-3 px-4 font-mono font-black text-slate-900 dark:text-white tabular-nums">
                        <span className={isRefunded ? 'line-through text-slate-400' : ''}>
                          {o.grandTotal.toFixed(2)} {currencySymbol}
                        </span>
                        {isRefunded && (
                          <span className="mr-1 text-[10px] text-rose-500 font-bold">
                            ({isAr ? 'مسترجع' : 'Refunded'})
                          </span>
                        )}
                        {isPartiallyRefunded && (
                          <span className="mr-1 inline-block px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                            {isAr ? 'إرجاع / تبديل جزئي' : 'Partial Return/Exch'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          +{o.profitTotal.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDirectDownloadPdf(o)}
                            className="px-2 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-emerald-600 dark:hover:bg-emerald-600 text-white transition-colors text-[11px] font-bold flex items-center gap-1"
                            title={isAr ? 'تنزيل الفاتورة بصيغة PDF مباشرة' : 'Download Invoice PDF'}
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-400" />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownloadPdfAndWhatsApp(o)}
                            className="px-2 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors text-[11px] font-bold flex items-center gap-1"
                            title={isAr ? 'تحميل الفاتورة PDF وبعثها في واتساب' : 'Download PDF & Send via WhatsApp'}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>{isAr ? 'PDF + واتساب' : 'WA PDF'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setReceiptViewMode('detailed');
                              setSelectedReceipt(o);
                            }}
                            className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors text-[11px] font-bold flex items-center gap-1"
                            title={isAr ? 'فتح فاتورة مفصلة بالمنتوجات والثمن' : 'Detailed Itemized Invoice'}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{isAr ? 'فاتورة مفصلة' : 'Detailed'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setReceiptViewMode('thermal');
                              setSelectedReceipt(o);
                            }}
                            className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                            title={isAr ? 'عرض الإيصال الحراري والباركود' : 'View thermal receipt & QR'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setReceiptViewMode('thermal');
                              setSelectedReceipt(o);
                            }}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={t.print_receipt}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {!isRefunded && (
                            <>
                              <button
                                type="button"
                                onClick={() => setExchangeOrder(o)}
                                className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
                                title={isAr ? 'إرجاع جزئي أو استبدال سلع داخل الفاتورة' : 'Partial Return / Exchange'}
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                <span>{isAr ? 'إرجاع / تبديل' : 'Return/Exch'}</span>
                              </button>
                              <button
                                onClick={() => handleRefund(o)}
                                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                                title={isAr ? 'استرجاع الفاتورة بالكامل' : 'Full Refund'}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Receipt / Detailed Invoice Modal */}
      {selectedReceipt && (
        <ReceiptModal
          order={selectedReceipt}
          initialViewMode={receiptViewMode}
          onClose={() => setSelectedReceipt(null)}
        />
      )}

      {/* Refund Confirmation Modal */}
      {refundConfirmOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
          onClick={() => setRefundConfirmOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {isAr ? 'استرجاع الفاتورة' : 'Refund Invoice'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {isAr
                    ? `هل أنت متأكد من استرجاع الفاتورة ${refundConfirmOrder.orderNumber} (${refundConfirmOrder.grandTotal.toFixed(2)} ${currencySymbol}) وإعادة السلع إلى المخزون؟`
                    : `Refund order ${refundConfirmOrder.orderNumber} (${refundConfirmOrder.grandTotal.toFixed(2)} ${currencySymbol}) and restore items to stock?`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRefundConfirmOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmRefundNow}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs"
              >
                {isAr ? 'تأكيد الاسترجاع' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item-Level Partial Return & Exchange Modal */}
      <ReturnExchangeModal
        order={exchangeOrder}
        isOpen={!!exchangeOrder}
        onClose={() => setExchangeOrder(null)}
        onSuccess={(message) => {
          if (settings.enableSoundEffects) playSound('success');
          setPdfFeedback({ ok: true, msg: message });
          setTimeout(() => setPdfFeedback(null), 4500);
        }}
      />

      {/* Accounting TVA & ICE Export Modal */}
      <AccountingTvaExportModal
        isOpen={showAccountingExportModal}
        onClose={() => setShowAccountingExportModal(false)}
      />
    </div>
  );
};

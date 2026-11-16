import React, { useEffect, useMemo, useState } from 'react';
import { Order } from '../../types';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { generateQRMatrix } from '../../utils/zatca';
import { bluetoothPrinter, BluetoothPrinterState } from '../../utils/bluetoothPrinter';
import { BluetoothPrinterModal } from '../printer/BluetoothPrinterModal';
import { playSound } from '../../utils/audio';
import {
  generateAndDownloadDetailedInvoicePdf,
  downloadAndSendInvoiceViaWhatsApp,
  buildOrderWhatsAppSummaryText
} from '../../utils/pdfReport';
import { cleanPhoneForWhatsApp, openExternalLinkSafely } from '../../utils/remoteCatalog';
import { Printer, Share2, Check, X, Bluetooth, Loader2, FileText, Download, MessageCircle } from 'lucide-react';

interface ReceiptModalProps {
  order: Order;
  onClose: () => void;
  initialViewMode?: 'thermal' | 'detailed';
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
  onClose,
  initialViewMode = 'thermal'
}) => {
  const { settings, updateSettings, currencySymbol, language, customers } = usePos();
  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [viewMode, setViewMode] = useState<'thermal' | 'detailed'>(initialViewMode);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(settings.receiptPaperWidth || '80mm');
  const [btPrinterState, setBtPrinterState] = useState<BluetoothPrinterState>(() =>
    bluetoothPrinter.getState()
  );
  const [showBtPrinterModal, setShowBtPrinterModal] = useState(false);
  const [btFeedback, setBtFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingWaPdf, setSendingWaPdf] = useState(false);

  const resolvedCustomerPhone = useMemo(() => {
    if (order.customerPhone) return order.customerPhone;
    if (order.customerId) {
      return customers.find((c) => c.id === order.customerId)?.phone || '';
    }
    return '';
  }, [order.customerPhone, order.customerId, customers]);

  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode, order.id]);

  useEffect(() => {
    return bluetoothPrinter.subscribe(setBtPrinterState);
  }, []);

  // Generate QR matrix for SVG rendering
  const qrMatrix = useMemo(() => {
    return generateQRMatrix(order.zatcaQrString || order.orderNumber, 25);
  }, [order]);

  const handlePrint = () => {
    window.print();
  };

  const executeBluetoothPrint = async () => {
    setBtFeedback(null);
    const res = await bluetoothPrinter.printOrderReceipt(
      order,
      { ...settings, receiptPaperWidth: paperWidth },
      currencySymbol,
      language
    );
    if (res.success) {
      playSound('success');
      setBtFeedback({
        ok: true,
        msg: isAr ? `✅ تمت طباعة الفاتورة عبر البلوتوث (${paperWidth})` : `✅ Printed via Bluetooth (${paperWidth})`
      });
    } else {
      playSound('error');
      setBtFeedback({
        ok: false,
        msg: res.error || (isAr ? 'فشل الطباعة عبر البلوتوث' : 'Bluetooth print failed')
      });
    }
    setTimeout(() => setBtFeedback(null), 4000);
  };

  const handleBluetoothPrintClick = async () => {
    if (!bluetoothPrinter.isConnected()) {
      setShowBtPrinterModal(true);
      return;
    }
    await executeBluetoothPrint();
  };

  const handleWhatsAppShare = () => {
    const cleanPhone = cleanPhoneForWhatsApp(resolvedCustomerPhone);
    const summaryText = buildOrderWhatsAppSummaryText(order, settings, currencySymbol, language);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(summaryText)}`
      : `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
    openExternalLinkSafely(url);
  };

  const handleDownloadDetailedPdf = () => {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    setBtFeedback(null);
    try {
      const res = generateAndDownloadDetailedInvoicePdf({
        order,
        settings,
        currencySymbol,
        language
      });
      playSound('success');
      setBtFeedback({
        ok: true,
        msg: isAr
          ? `✅ تم تحميل الفاتورة بصيغة PDF بنجاح: ${res.filename}`
          : `✅ Downloaded Invoice PDF: ${res.filename}`
      });
    } catch (err) {
      playSound('error');
      const msg = err instanceof Error ? err.message : '';
      setBtFeedback({
        ok: false,
        msg: isAr
          ? `⚠️ تعذر إنشاء ملف PDF للفاتورة ${msg ? `(${msg})` : ''}`
          : `⚠️ Failed to generate PDF ${msg ? `(${msg})` : ''}`
      });
    } finally {
      setDownloadingPdf(false);
      setTimeout(() => setBtFeedback(null), 4500);
    }
  };

  const handleDownloadPdfAndSendWhatsApp = async () => {
    if (sendingWaPdf) return;
    setSendingWaPdf(true);
    setBtFeedback(null);
    try {
      const res = await downloadAndSendInvoiceViaWhatsApp({
        order,
        settings,
        currencySymbol,
        language,
        customerPhoneOverride: resolvedCustomerPhone
      });
      playSound('success');
      setBtFeedback({
        ok: true,
        msg:
          res.mode === 'native_file_share'
            ? isAr
              ? `✅ تم تحميل ومشاركة الفاتورة PDF (${res.filename}) بنجاح`
              : `✅ Shared Invoice PDF (${res.filename})`
            : res.phoneTargeted
            ? isAr
              ? `✅ تم تحميل PDF (${res.filename}) وفتح واتساب الزبون — أرفق الملف واضغط إرسال`
              : `✅ PDF downloaded (${res.filename}) & WhatsApp opened for customer`
            : isAr
            ? `✅ تم تحميل PDF (${res.filename}) وفتح واتساب — اختر الزبون وأرفق الملف`
            : `✅ PDF downloaded (${res.filename}) & WhatsApp opened`
      });
    } catch (err) {
      playSound('error');
      const msg = err instanceof Error ? err.message : '';
      setBtFeedback({
        ok: false,
        msg: isAr
          ? `⚠️ تعذر تحميل وإرسال الفاتورة ${msg ? `(${msg})` : ''}`
          : `⚠️ Failed to send PDF via WhatsApp ${msg ? `(${msg})` : ''}`
      });
    } finally {
      setSendingWaPdf(false);
      setTimeout(() => setBtFeedback(null), 5500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`relative w-full transition-all duration-200 ${
          viewMode === 'detailed'
            ? 'max-w-3xl'
            : paperWidth === '58mm'
            ? 'max-w-[320px]'
            : 'max-w-sm'
        } bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]`}
      >
        {/* Actions Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrint}
              className="px-2.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                {viewMode === 'detailed'
                  ? (isAr ? 'طباعة الفاتورة المفصلة' : 'Print Detailed Invoice')
                  : `${t.print_receipt} (${paperWidth})`}
              </span>
            </button>
            <button
              type="button"
              onClick={handleDownloadDetailedPdf}
              disabled={downloadingPdf}
              className="px-2.5 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-60 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
            >
              {downloadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{downloadingPdf ? (isAr ? 'جاري التحميل...' : 'Saving...') : (isAr ? 'تحميل PDF' : 'Save PDF')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPdfAndSendWhatsApp()}
              disabled={sendingWaPdf}
              className="px-2.5 py-1.5 text-xs font-bold bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
              title={isAr ? 'تحميل الفاتورة PDF وبعثها في واتساب مباشرة' : 'Download PDF & Send via WhatsApp'}
            >
              {sendingWaPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <MessageCircle className="w-3.5 h-3.5" />
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
              disabled={btPrinterState.status === 'printing'}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60 ${
                btPrinterState.status === 'connected' || btPrinterState.status === 'printing'
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
              }`}
              title={isAr ? 'طباعة مباشرة على طابعة البلوتوث الحرارية' : 'Direct Bluetooth ESC/POS Print'}
            >
              {btPrinterState.status === 'printing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bluetooth className="w-3.5 h-3.5" />
              )}
              <span>
                {btPrinterState.status === 'printing'
                  ? (isAr ? 'جاري الطباعة...' : 'Printing...')
                  : (isAr ? 'بلوتوث' : 'BT Print')}
              </span>
            </button>
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl transition-colors"
              title={t.share_whatsapp}
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Thermal vs Detailed Invoice Switcher */}
            <div className="flex items-center p-0.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setViewMode('thermal')}
                className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  viewMode === 'thermal'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Printer className="w-3 h-3" />
                <span>{isAr ? 'إيصال حراري' : 'Thermal'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detailed')}
                className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  viewMode === 'detailed'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>{isAr ? 'فاتورة مفصلة' : 'Detailed'}</span>
              </button>
            </div>

            {/* Quick 80mm / 58mm Paper Switcher (only in thermal mode) */}
            {viewMode === 'thermal' && (
              <div className="flex items-center p-0.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setPaperWidth('80mm');
                    updateSettings({ receiptPaperWidth: '80mm' });
                  }}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    paperWidth === '80mm'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  80mm
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaperWidth('58mm');
                    updateSettings({ receiptPaperWidth: '58mm' });
                  }}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    paperWidth === '58mm'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  58mm
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bluetooth Print Status Feedback Banner */}
        {btFeedback && (
          <div
            className={`px-4 py-2 text-xs font-bold border-b shrink-0 ${
              btFeedback.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
            }`}
          >
            {btFeedback.msg}
          </div>
        )}

        {/* Scrollable Receipt Body & Printable Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950/40 flex justify-center">
          {viewMode === 'detailed' ? (
            /* DETAILED ITEMIZED COMMERCIAL INVOICE (فاتورة مفصلة بالمنتوجات والثمن) */
            <div
              id="thermal-receipt-print"
              className="w-full max-w-2xl bg-white text-slate-950 shadow-sm border border-slate-200 rounded-2xl p-6 sm:p-8 font-sans select-text space-y-6"
            >
              {/* Invoice Top Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
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
                    <p className="text-xs text-slate-600 mt-1">{settings.address}</p>
                    <p className="text-xs text-slate-600 font-mono mt-0.5">{settings.phone}</p>
                    {settings.taxNumber && (
                      <p className="text-[11px] text-slate-500 font-mono mt-1">
                        {t.tax_no}: {settings.taxNumber}
                        {settings.commercialRegistration ? ` · ${t.cr_no}: ${settings.commercialRegistration}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-end">
                  <div className="text-sm font-black text-emerald-700">
                    {isAr ? 'فاتورة مفصلة بالمنتوجات والثمن' : 'Detailed Itemized Invoice'}
                  </div>
                  <div className="text-base font-black font-mono text-slate-900 mt-1">
                    {order.orderNumber}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {new Date(order.date).toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR')}{' '}
                    {new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              {(settings.showReceiptHeaderMsg ?? true) && settings.receiptHeaderMsg?.trim() && (
                <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold text-center">
                  {settings.receiptHeaderMsg}
                </div>
              )}

              {/* Customer & Cashier Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <div className="text-[11px] text-slate-500">{t.customer_name}</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {order.customerName || (isAr ? 'عميل عام' : 'Walk-in Customer')}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{t.cashier}</div>
                  <div className="font-bold text-slate-900 mt-0.5">{order.cashierName}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{isAr ? 'طريقة الدفع' : 'Payment'}</div>
                  <div className="font-bold uppercase text-emerald-700 mt-0.5">{order.paymentMethod}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">{isAr ? 'عدد الأصناف' : 'Line Items'}</div>
                  <div className="font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {order.items.length} ({order.items.reduce((s, i) => s + i.quantity, 0)} {isAr ? 'قطعة' : 'qty'})
                  </div>
                </div>
              </div>

              {/* Detailed Products & Prices Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-start border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 text-start">#</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المنتوج والوصف' : 'Product'}</th>
                      <th className="py-2.5 px-3 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'ثمن الوحدة' : 'Unit Price'}</th>
                      <th className="py-2.5 px-3 text-end">{t.discount}</th>
                      <th className="py-2.5 px-3 text-end">{t.total}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {order.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{it.productName}</div>
                          {(it.variantName || (it.modifiers && it.modifiers.length > 0)) && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {it.variantName}
                              {it.modifiers && it.modifiers.length > 0 ? ` · ${it.modifiers.join(', ')}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums text-slate-800">
                          {it.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700">
                          {it.price.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono tabular-nums text-rose-600">
                          {it.discount > 0 ? `-${it.discount.toFixed(2)} ${currencySymbol}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono font-black tabular-nums text-emerald-700">
                          {it.total.toFixed(2)} {currencySymbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals & QR */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-6 pt-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white border border-slate-200 rounded-xl shrink-0">
                    <svg
                      viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                      className="w-20 h-20"
                      shapeRendering="crispEdges"
                    >
                      {qrMatrix.map((row, rIdx) =>
                        row.map((cell, cIdx) =>
                          cell ? (
                            <rect
                              key={`${rIdx}-${cIdx}`}
                              x={cIdx}
                              y={rIdx}
                              width="1"
                              height="1"
                              fill="#0f172a"
                            />
                          ) : null
                        )
                      )}
                    </svg>
                  </div>
                  <div className="text-[11px] text-slate-500 space-y-1">
                    <div className="font-bold text-slate-700">
                      {isAr ? 'فاتورة مفصلة معتمدة' : 'Certified Itemized Invoice'}
                    </div>
                    {(settings.showReceiptFooterMsg ?? true) && settings.receiptFooterMsg?.trim() && (
                      <div className="whitespace-pre-line leading-relaxed">{settings.receiptFooterMsg}</div>
                    )}
                  </div>
                </div>

                <div className="w-full sm:w-64 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.subtotal}:</span>
                    <span className="font-mono tabular-nums font-semibold">
                      {order.subtotal.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  {order.discountTotal > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>{t.discount}:</span>
                      <span className="font-mono tabular-nums">
                        -{order.discountTotal.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.vat_tax} (15%):</span>
                    <span className="font-mono tabular-nums font-semibold">
                      {order.taxTotal.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  {typeof order.deliveryFee === 'number' && order.deliveryFee > 0 && (
                    <div className="flex justify-between text-amber-700 font-bold">
                      <span>{isAr ? `التوصيل (${order.deliveryZoneName || 'توصيل'}):` : `Delivery (${order.deliveryZoneName || ''}):`}</span>
                      <span className="font-mono tabular-nums">
                        +{order.deliveryFee.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-300 text-slate-900">
                    <span>{t.total_to_pay}:</span>
                    <span className="font-mono tabular-nums text-emerald-700">
                      {order.grandTotal.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  {order.amountTendered && order.amountTendered > order.grandTotal && (
                    <div className="pt-1 text-[11px] text-slate-500 flex justify-between font-mono tabular-nums">
                      <span>{t.amount_received}: {order.amountTendered.toFixed(2)}</span>
                      <span>{t.change_due}: {order.changeAmount?.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              id="thermal-receipt-print"
              className={`w-full bg-white text-slate-950 shadow-sm border border-slate-200/80 font-sans select-text transition-all ${
                paperWidth === '58mm'
                  ? 'print-paper-58mm max-w-[260px] p-3 text-[10px] rounded-xl'
                  : 'print-paper-80mm max-w-[320px] p-5 text-xs rounded-2xl'
              }`}
            >
              {/* Header info */}
              <div className="text-center pb-4 border-b border-dashed border-slate-300">
                {settings.storeLogo && (
                  <img
                    src={settings.storeLogo}
                    alt={settings.storeName}
                    className="w-12 h-12 object-contain mx-auto mb-1.5 rounded-lg"
                  />
                )}
                <h2 className="text-lg font-black tracking-tight">{settings.storeName}</h2>
                <div className="text-[10px] text-slate-600 mt-0.5">{settings.address}</div>
                <div className="text-[10px] text-slate-600 font-mono">{settings.phone}</div>
                <div className="mt-2 inline-block px-2.5 py-0.5 bg-slate-100 text-[10px] font-bold rounded">
                  {t.tax_invoice}
                </div>
                {(settings.showReceiptHeaderMsg ?? true) && settings.receiptHeaderMsg?.trim() && (
                  <div className="mt-2 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 leading-snug">
                    {settings.receiptHeaderMsg}
                  </div>
                )}
              </div>

              {/* Meta details */}
              <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.invoice_no}:</span>
                  <span className="font-bold font-mono">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.date_time}:</span>
                  <span className="font-mono">{new Date(order.date).toLocaleDateString()} {new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.cashier}:</span>
                  <span>{order.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t.tax_no}:</span>
                  <span className="font-mono font-bold">{settings.taxNumber}</span>
                </div>
                {order.customerName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.customer_name}:</span>
                    <span className="font-bold">{order.customerName}</span>
                  </div>
                )}
              </div>

              {/* Items Table (with unit price shown) */}
              <div className="py-3 border-b border-dashed border-slate-300">
                <table className="w-full text-left rtl:text-right">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] text-slate-500 font-bold">
                      <th className="pb-1">{t.item}</th>
                      <th className="pb-1 text-center">{t.qty}</th>
                      <th className="pb-1 text-right rtl:text-left">{t.total}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {order.items.map((it, idx) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1.5 font-medium leading-tight">
                          <div>{it.productName}</div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            {it.quantity} × {it.price.toFixed(2)} {currencySymbol}
                            {it.variantName ? ` · ${it.variantName}` : ''}
                          </div>
                        </td>
                        <td className="py-1.5 text-center font-mono font-bold tabular-nums">
                          {it.quantity}
                        </td>
                        <td className="py-1.5 text-right rtl:text-left font-mono font-bold tabular-nums">
                          {it.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            {/* Financial Summary */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">{t.subtotal}:</span>
                <span className="font-mono">{order.subtotal.toFixed(2)} {currencySymbol}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>{t.discount}:</span>
                  <span className="font-mono">-{order.discountTotal.toFixed(2)} {currencySymbol}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">{t.vat_tax} (15%):</span>
                <span className="font-mono">{order.taxTotal.toFixed(2)} {currencySymbol}</span>
              </div>
              {typeof order.deliveryFee === 'number' && order.deliveryFee > 0 && (
                <div className="flex justify-between text-amber-700 font-bold">
                  <span>{isAr ? `التوصيل (${order.deliveryZoneName || 'توصيل'}):` : `Delivery (${order.deliveryZoneName || ''}):`}</span>
                  <span className="font-mono">+{order.deliveryFee.toFixed(2)} {currencySymbol}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-200">
                <span>{t.total_to_pay}:</span>
                <span className="font-mono">{order.grandTotal.toFixed(2)} {currencySymbol}</span>
              </div>
            </div>

            {/* Payment & Change */}
            <div className="py-2.5 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'طريقة الدفع' : 'Payment'}:</span>
                <span className="font-bold uppercase">{order.paymentMethod}</span>
              </div>
              {order.amountTendered && order.amountTendered > order.grandTotal && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.amount_received}:</span>
                    <span className="font-mono">{order.amountTendered.toFixed(2)} {currencySymbol}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-500">{t.change_due}:</span>
                    <span className="font-mono">{order.changeAmount?.toFixed(2)} {currencySymbol}</span>
                  </div>
                </>
              )}
              {order.pointsEarned && order.pointsEarned > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold pt-1">
                  <span>{isAr ? 'النقاط المكتسبة' : 'Points earned'}:</span>
                  <span>+{order.pointsEarned} pts</span>
                </div>
              )}
            </div>

            {/* ZATCA Simplified E-Invoice QR Code */}
            <div className="py-4 flex flex-col items-center justify-center">
              <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
                <svg
                  viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                  className="w-28 h-28"
                  shapeRendering="crispEdges"
                >
                  {qrMatrix.map((row, rIdx) =>
                    row.map((cell, cIdx) =>
                      cell ? (
                        <rect
                          key={`${rIdx}-${cIdx}`}
                          x={cIdx}
                          y={rIdx}
                          width="1"
                          height="1"
                          fill="#0f172a"
                        />
                      ) : null
                    )
                  )}
                </svg>
              </div>
              <div className="text-[9px] text-slate-400 font-mono mt-1.5">
                {isAr ? 'فاتورة معتمدة إلكترونياً' : 'ZATCA E-Invoice Certified'}
              </div>
            </div>

            {/* Footer note */}
            {(settings.showReceiptFooterMsg ?? true) && settings.receiptFooterMsg?.trim() && (
              <div className="text-center pt-2 border-t border-dashed border-slate-200 text-[10px] text-slate-600 whitespace-pre-line leading-relaxed">
                {settings.receiptFooterMsg}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Footer Done Button */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            <span>{isAr ? 'تم - طلب جديد' : isFr ? 'Terminé - Nouvelle vente' : 'Done - New Order'}</span>
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

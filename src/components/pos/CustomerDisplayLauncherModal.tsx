import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Monitor,
  QrCode,
  Sparkles,
  X
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { generateQRMatrix } from '../../utils/zatca';
import {
  buildCustomerDisplaySnapshot,
  getCustomerDisplayUrl
} from '../../utils/customerDisplaySync';
import { CustomerDisplayView } from './CustomerDisplayView';

interface CustomerDisplayLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerDisplayLauncherModal: React.FC<CustomerDisplayLauncherModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    cart,
    cartSubtotal,
    cartDiscountTotal,
    cartTaxTotal,
    cartGrandTotal,
    selectedCustomer,
    settings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const [copied, setCopied] = useState(false);
  const [showQrBox, setShowQrBox] = useState(false);

  const displayUrl = useMemo(() => getCustomerDisplayUrl(), []);
  const qrMatrix = useMemo(() => generateQRMatrix(displayUrl, 25), [displayUrl]);

  const liveSnapshot = useMemo(
    () =>
      buildCustomerDisplaySnapshot({
        cart,
        cartSubtotal,
        cartDiscountTotal,
        cartTaxTotal,
        cartGrandTotal,
        selectedCustomer,
        settings,
        currencySymbol,
        language
      }),
    [
      cart,
      cartSubtotal,
      cartDiscountTotal,
      cartTaxTotal,
      cartGrandTotal,
      selectedCustomer,
      settings,
      currencySymbol,
      language
    ]
  );

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5">
      <div className="w-full max-w-5xl max-h-[94vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Launcher Controls */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black flex items-center gap-2">
                <span>{isAr ? 'شاشة عرض العميل (Customer Display)' : 'Customer Display Screen'}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
                  {isAr ? 'مزامنة فورية' : 'LIVE SYNC'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">
                {isAr
                  ? 'افتحها في شاشة أو تبويب ثانوي واسحبها لشاشة العميل لتعرض الفاتورة والمجموع مباشرة'
                  : 'Open in a secondary window/tab on your customer-facing monitor for real-time totals'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isAr ? 'فتح في شاشة / نافذة ثانية' : 'Open Secondary Screen'}</span>
            </a>

            <button
              type="button"
              onClick={() => void handleCopyUrl()}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-100 flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isAr ? 'تم النسخ!' : 'Copied!') : isAr ? 'نسخ الرابط' : 'Copy URL'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowQrBox((prev) => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                showQrBox
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optional QR Helper Strip for Connecting a Tablet / Second Browser Window */}
        {showQrBox && (
          <div className="px-5 py-3 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-900/60 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="text-xs text-indigo-950 dark:text-indigo-200 space-y-0.5 min-w-0">
                <div className="font-black">
                  {isAr
                    ? 'رابط الشاشة الثانوية المخصصة للعميل (نفس المتصفح / نفس الجهاز):'
                    : 'Direct Customer Display URL (same browser / dual monitor):'}
                </div>
                <div className="font-mono text-[11px] truncate opacity-80" dir="ltr">
                  {displayUrl}
                </div>
              </div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-indigo-200 shrink-0">
              <svg
                viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}
                className="w-16 h-16"
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
          </div>
        )}

        {/* Embedded Live Customer Display View (also serves as Popup Mode) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-100 dark:bg-slate-950">
          <CustomerDisplayView liveSnapshotOverride={liveSnapshot} embedded />
        </div>
      </div>
    </div>
  );
};

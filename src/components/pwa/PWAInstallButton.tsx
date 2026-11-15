import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import {
  Download,
  Share2,
  PlusSquare,
  Smartphone,
  CheckCircle,
  X,
  Copy,
  Check,
  MoreVertical
} from 'lucide-react';
import { usePos } from '../../context/PosContext';

interface PWAInstallButtonProps {
  variant?: 'navbar' | 'banner' | 'settings';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'navbar' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { language } = usePos();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://ais-pre-vlflnu747qtck4aikt6rlo-324765339943.europe-west2.run.app';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2200);
    } catch {
      // ignore clipboard errors in restricted frames
    }
  };

  // If already running inside standalone app, show active badge in navbar
  if (isInstalled && variant === 'navbar') {
    return (
      <div className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
        <CheckCircle className="w-3 h-3" />
        <span>{isAr ? 'مثبت' : 'Installed'}</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const buttonText = isAr ? 'تثبيت بالهاتف' : isFr ? 'Installer' : 'Install App';

  return (
    <>
      {variant === 'navbar' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="relative p-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black shadow-2xs transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
          title={isAr ? 'نشر وتنزيل التطبيق على الهاتف (Android / iPhone)' : 'Install App on Phone'}
        >
          <Smartphone className="w-4 h-4" />
          <span className="hidden xl:inline">{buttonText}</span>
        </button>
      )}

      {variant === 'settings' && (
        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                {isAr ? 'نشر وتثبيت kadi pos على الهاتف (Android & iPhone)' : 'Install kadi pos as Native Mobile App'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'يعمل بكامل الشاشة وبدون إنترنت على الهواتف والأجهزة اللوحية (iPhone / Android) والكمبيوتر'
                  : 'Works standalone and offline on iPhone, Android and desktop computers'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleInstallClick}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{isInstalled ? (isAr ? 'مشاركة / إعادة تثبيت' : 'Share / Reinstall') : buttonText}</span>
          </button>
        </div>
      )}

      {/* Installation & Phone Publishing Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-900 dark:text-white text-sm">
                  {isAr ? 'تثبيت وتشغيل التطبيق على الهاتف' : 'Install App on Your Phone'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Direct Chrome Install button if available */}
            {isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  await install();
                  setShowGuideModal(false);
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>{isAr ? 'تثبيت فوري بضغطة واحدة' : 'Install Immediately (1-Tap)'}</span>
              </button>
            )}

            {/* Step 1: Copy link to open directly on phone */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                {isAr ? '1. افتح رابط التطبيق على متصفح الهاتف (أو أرسله لنفسك عبر واتساب):' : '1. Open this app link on your phone browser:'}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  dir="ltr"
                  className="flex-1 px-2.5 py-1.5 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUrl ? (isAr ? 'تم النسخ!' : 'Copied!') : isAr ? 'نسخ الرابط' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Android & iPhone step-by-step instructions */}
            <div className="space-y-2.5 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 space-y-1.5">
                <div className="font-black text-emerald-800 dark:text-emerald-300">
                  {isAr ? '📱 لهواتف أندرويد (Google Chrome):' : '📱 Android (Chrome):'}
                </div>
                <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                  <li>
                    {isAr ? 'اضغط على النقاط الثلاث ' : 'Tap the menu icon '}
                    <MoreVertical className="inline w-3.5 h-3.5 text-slate-700 dark:text-slate-200" />
                    {isAr ? ' في أعلى متصفح Chrome.' : ' in top-right Chrome.'}
                  </li>
                  <li>
                    {isAr ? 'اختر ' : 'Select '}
                    <strong className="text-emerald-700 dark:text-emerald-300">
                      {isAr ? '«تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»' : '«Install app» or «Add to Home screen»'}
                    </strong>
                    .
                  </li>
                </ol>
              </div>

              <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50 space-y-1.5">
                <div className="font-black text-blue-800 dark:text-blue-300">
                  {isAr ? '🍏 لهواتف آيفون وآيباد (Safari):' : '🍏 iPhone & iPad (Safari):'}
                </div>
                <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                  <li>
                    {isAr ? 'اضغط على زر المشاركة ' : 'Tap the Share icon '}
                    <Share2 className="inline w-3.5 h-3.5 text-blue-600 mx-0.5" />
                    {isAr ? ' في أسفل متصفح Safari.' : ' in Safari toolbar.'}
                  </li>
                  <li>
                    {isAr ? 'اختر ' : 'Tap '}
                    <strong className="text-blue-700 dark:text-blue-300">
                      {isAr ? '«إضافة إلى الصفحة الرئيسية»' : '«Add to Home Screen»'}
                    </strong>
                    <PlusSquare className="inline w-3.5 h-3.5 text-blue-600 mx-0.5" />
                    {isAr ? ' ثم اضغط «إضافة».' : ' then «Add».'}
                  </li>
                </ol>
              </div>
            </div>

            {isIOS && (
              <p className="text-[10px] text-center text-slate-400">
                {isAr
                  ? 'سيعمل التطبيق بأيقونة خاصة على الشاشة الرئيسية وبدون إنترنت.'
                  : 'App will run full-screen from your Home Screen with offline support.'}
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Share2, PlusSquare, Smartphone, Monitor, CheckCircle, X } from 'lucide-react';
import { usePos } from '../../context/PosContext';

interface PWAInstallButtonProps {
  variant?: 'navbar' | 'banner' | 'settings';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'navbar' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { language } = usePos();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  // If already running inside standalone app, show active badge or hide in navbar
  if (isInstalled && variant === 'navbar') {
    return (
      <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold border border-emerald-500/20">
        <CheckCircle className="w-3.5 h-3.5" />
        <span>{isAr ? 'تطبيق مثبت' : isFr ? 'App installée' : 'App Installed'}</span>
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

  const buttonText = isAr ? 'حمل التطبيق' : isFr ? 'Installer l’App' : 'Install App';

  return (
    <>
      {variant === 'navbar' && (
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all active:scale-95 shrink-0"
          title={isAr ? 'تثبيت تطبيق الكاشير على جهازك' : 'Install Kadi POS application'}
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{buttonText}</span>
        </button>
      )}

      {variant === 'settings' && (
        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                {isAr ? 'تثبيت kadi pos كتطبيق أصلي (PWA)' : 'Install kadi pos as Native App'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'يعمل بكامل الشاشة وبدون إنترنت على الأجهزة اللوحية (iPad / Android) والكمبيوتر'
                  : 'Works standalone and offline on iPad, Android tablets and desktop computers'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleInstallClick}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{isInstalled ? (isAr ? 'إعادة تثبيت' : 'Reinstall') : buttonText}</span>
          </button>
        </div>
      )}

      {/* Installation Guide Modal (For iOS and Manual Browser flow) */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  {isAr ? 'تحميل وتثبيت التطبيق' : 'Install Application'}
                </h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* iOS Safari Guide */}
            {isIOS ? (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'خطوات التثبيت على أجهزة iPhone و iPad:' : 'Installation on iOS Safari:'}</span>
                </div>
                <ol className="space-y-2 list-decimal list-inside bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] leading-relaxed">
                  <li>
                    {isAr ? 'اضغط على زر المشاركة ' : 'Tap the Share button '}
                    <Share2 className="inline w-3.5 h-3.5 text-blue-500 mx-1" />
                    {isAr ? 'في أسفل متصفح Safari.' : 'in the Safari toolbar.'}
                  </li>
                  <li>
                    {isAr ? 'مرر للأسفل واضغط على ' : 'Scroll down and tap '}
                    <span className="font-bold text-emerald-600">
                      {isAr ? '«إضافة إلى الصفحة الرئيسية»' : '«Add to Home Screen»'}
                    </span>
                    <PlusSquare className="inline w-3.5 h-3.5 text-emerald-600 mx-1" />
                  </li>
                  <li>
                    {isAr ? 'اضغط «إضافة» (Add) في الزاوية العلوية.' : 'Tap «Add» in the top-right corner.'}
                  </li>
                </ol>
              </div>
            ) : (
              /* Android & Desktop Chrome / Edge Guide */
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'تثبيت التطبيق على جهازك:' : 'Install on your device:'}</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {isAr
                    ? 'يمكنك تثبيت نظام كادي كاشير على الأندرويد، الويندوز والماك للعمل كنافذة مستقلة بدون أشرطة المتصفح ومع دعم كامل للمس والمخزون دون إنترنت.'
                    : 'Install Kadi POS on Android, Windows or Mac for full-screen register experience with offline support.'}
                </p>
                {isInstallable && (
                  <button
                    onClick={async () => {
                      await install();
                      setShowGuideModal(false);
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isAr ? 'تأكيد التثبيت الفوري' : 'Confirm Direct Install'}</span>
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              {isAr ? 'تم / إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

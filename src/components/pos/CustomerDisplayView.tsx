import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  ShoppingBag,
  Sparkles,
  Sun,
  Tag,
  User
} from 'lucide-react';
import {
  CUSTOMER_DISPLAY_CHANNEL,
  CUSTOMER_DISPLAY_STORAGE_KEY,
  CustomerDisplaySnapshot,
  readStoredCustomerDisplaySnapshot,
  requestCustomerDisplaySync
} from '../../utils/customerDisplaySync';

interface CustomerDisplayViewProps {
  /** Optional direct snapshot when rendered inline inside the POS launcher modal */
  liveSnapshotOverride?: CustomerDisplaySnapshot | null;
  embedded?: boolean;
}

export const CustomerDisplayView: React.FC<CustomerDisplayViewProps> = ({
  liveSnapshotOverride,
  embedded = false
}) => {
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot | null>(() =>
    liveSnapshotOverride || readStoredCustomerDisplaySnapshot()
  );
  const [now, setNow] = useState(() => new Date());
  const [darkDisplay, setDarkDisplay] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep synced when override prop is passed (embedded modal preview)
  useEffect(() => {
    if (liveSnapshotOverride) {
      setSnapshot(liveSnapshotOverride);
    }
  }, [liveSnapshotOverride]);

  // Listen to real-time BroadcastChannel & cross-tab storage events
  useEffect(() => {
    if (liveSnapshotOverride) return;

    requestCustomerDisplaySync();

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      channel.onmessage = (event) => {
        const data = event.data as { type?: string; payload?: CustomerDisplaySnapshot };
        if (data?.type === 'DISPLAY_UPDATE' && data.payload) {
          setSnapshot(data.payload);
        }
      };
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === CUSTOMER_DISPLAY_STORAGE_KEY && e.newValue) {
        try {
          setSnapshot(JSON.parse(e.newValue) as CustomerDisplaySnapshot);
        } catch {
          // Ignore malformed JSON
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, [liveSnapshotOverride]);

  // Live clock
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Track browser fullscreen state
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const target = containerRef.current || document.documentElement;
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial in restricted iframes
    }
  };

  const lang = snapshot?.language || 'ar';
  const isAr = lang === 'ar';
  const currency = snapshot?.currencySymbol || 'د.م';
  const items = snapshot?.items || [];
  const completedOrder = snapshot?.completedOrder;

  const isRecentlyCompleted = useMemo(() => {
    if (!completedOrder || items.length > 0) return false;
    const elapsed = now.getTime() - new Date(completedOrder.completedAt).getTime();
    return elapsed < 15000;
  }, [completedOrder, items.length, now]);

  const timeString = now.toLocaleTimeString(isAr ? 'ar-MA' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const dateString = now.toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div
      ref={containerRef}
      dir={isAr ? 'rtl' : 'ltr'}
      className={`w-full flex flex-col overflow-hidden select-none transition-colors ${
        embedded ? 'min-h-[540px] h-full rounded-2xl' : 'h-screen'
      } ${
        darkDisplay
          ? 'bg-slate-950 text-slate-50'
          : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Top Store Banner */}
      <header
        className={`px-5 sm:px-8 py-4 border-b flex items-center justify-between gap-4 shrink-0 ${
          darkDisplay
            ? 'bg-slate-900/90 border-slate-800'
            : 'bg-white border-slate-200 shadow-2xs'
        }`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          {snapshot?.storeLogo ? (
            <img
              src={snapshot.storeLogo}
              alt={snapshot.storeName}
              className="w-12 h-12 rounded-2xl object-contain bg-white p-1 border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
              K
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-black tracking-tight truncate">
              {snapshot?.storeName || 'Kadi POS'}
            </h1>
            {snapshot?.welcomeMsg ? (
              <p className="text-xs sm:text-sm font-bold text-emerald-500 truncate mt-0.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>{snapshot.welcomeMsg}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {isAr ? 'شاشة عرض العميل المباشرة' : 'Live Customer Display'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold ${
              darkDisplay
                ? 'bg-slate-800 text-slate-200'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4 text-emerald-500" />
            <span className="font-mono text-sm font-black">{timeString}</span>
            <span className="text-[11px] opacity-70 hidden md:inline">· {dateString}</span>
          </div>

          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[11px] font-black">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{isAr ? 'متصل مباشر' : 'LIVE SYNC'}</span>
          </span>

          <button
            type="button"
            onClick={() => setDarkDisplay((d) => !d)}
            className={`p-2.5 rounded-xl border transition-colors ${
              darkDisplay
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title={isAr ? 'تبديل الإضاءة' : 'Toggle Contrast'}
          >
            {darkDisplay ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className={`p-2.5 rounded-xl border transition-colors ${
              darkDisplay
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title={isAr ? 'ملء الشاشة' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {isRecentlyCompleted && completedOrder ? (
        /* Checkout Thank You State */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mb-6 animate-bounce">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-emerald-500 mb-3">
            {isAr ? 'تم تسجيل الدفع بنجاح!' : 'Payment Confirmed!'}
          </h2>
          <p className="text-lg sm:text-xl font-bold opacity-80 mb-8">
            {snapshot?.footerMsg ||
              (isAr ? 'شكراً لتسوقكم معنا! مرحباً بكم دائماً' : 'Thank you for shopping with us!')}
          </p>

          <div
            className={`w-full max-w-lg rounded-3xl p-6 border space-y-4 ${
              darkDisplay
                ? 'bg-slate-900 border-slate-800'
                : 'bg-white border-slate-200 shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-70">{isAr ? 'رقم الفاتورة:' : 'Receipt #:'}</span>
              <span className="font-mono font-black">{completedOrder.orderNumber}</span>
            </div>
            <div className="flex items-center justify-between text-xl sm:text-2xl font-black pt-3 border-t border-slate-700/30">
              <span>{isAr ? 'الإجمالي المدفوع:' : 'Total Paid:'}</span>
              <span className="font-mono text-emerald-500">
                {completedOrder.grandTotal.toFixed(2)} {currency}
              </span>
            </div>
            {completedOrder.changeAmount !== undefined && completedOrder.changeAmount > 0 && (
              <div className="flex items-center justify-between text-lg font-black text-amber-500 pt-2 border-t border-slate-700/20">
                <span>{isAr ? 'الباقي لكم (الصرف):' : 'Change Due:'}</span>
                <span className="font-mono">
                  {completedOrder.changeAmount.toFixed(2)} {currency}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : items.length === 0 ? (
        /* Idle / Welcome Standby State */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div
            className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 border ${
              darkDisplay
                ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-400'
                : 'bg-emerald-50 border-emerald-200 text-emerald-600'
            }`}
          >
            <Monitor className="w-12 h-12" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">
            {snapshot?.welcomeMsg ||
              (isAr ? `أهلاً وسهلاً بكم في ${snapshot?.storeName || 'متجرنا'}` : `Welcome to ${snapshot?.storeName || 'Our Store'}`)}
          </h2>

          <p className="text-base sm:text-lg opacity-70 max-w-xl leading-relaxed">
            {isAr
              ? 'ستظهر هنا قائمة السلع المختارة وثمن كل منتج والمجموع المطلوب دفعه بشكل فوري ومباشر أثناء تمرير طلبكم.'
              : 'Your selected items, unit prices, discounts, and total due will appear here in real time during checkout.'}
          </p>

          {snapshot?.customerName && (
            <div className="mt-6 px-5 py-2.5 rounded-2xl bg-emerald-600/15 border border-emerald-500/40 text-emerald-500 font-black text-sm flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>
                {isAr ? `مرحباً بالزبون الكريم: ${snapshot.customerName}` : `Customer: ${snapshot.customerName}`}
              </span>
            </div>
          )}

          {snapshot?.footerMsg && (
            <div className="mt-10 px-6 py-3 rounded-2xl border border-dashed border-slate-500/30 text-sm opacity-75 whitespace-pre-line max-w-lg">
              {snapshot.footerMsg}
            </div>
          )}
        </div>
      ) : (
        /* Active Live Cart Split Screen */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Itemized Live List */}
          <div className="lg:col-span-7 flex flex-col overflow-hidden p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
              <div className="flex items-center gap-2 text-sm sm:text-base font-black">
                <ShoppingBag className="w-5 h-5 text-emerald-500" />
                <span>{isAr ? 'تفاصيل الفاتورة الجارية' : 'Current Order Items'}</span>
              </div>
              <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-500 text-xs font-black font-mono">
                {snapshot?.totalItemsCount || 0} {isAr ? 'قطعة' : 'items'}
              </span>
            </div>

            <div
              className={`flex-1 overflow-y-auto rounded-3xl border divide-y ${
                darkDisplay
                  ? 'bg-slate-900/70 border-slate-800 divide-slate-800/80'
                  : 'bg-white border-slate-200 divide-slate-100 shadow-xs'
              }`}
            >
              {items.map((item, idx) => {
                const isLatest = idx === 0;
                return (
                  <div
                    key={item.id}
                    className={`px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                      isLatest
                        ? darkDisplay
                          ? 'bg-emerald-950/30'
                          : 'bg-emerald-50/70'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border border-slate-700/30 bg-white shrink-0"
                        />
                      ) : (
                        <div
                          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                            darkDisplay
                              ? 'bg-slate-800 text-emerald-400'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.name.slice(0, 2)}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-lg font-black truncate">
                            {item.name}
                          </span>
                          {isLatest && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black shrink-0">
                              {isAr ? 'مضاف الآن' : 'LATEST'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm opacity-70 font-mono mt-0.5">
                          {item.quantity} × {item.price.toFixed(2)} {currency}
                          {item.variantName ? ` · ${item.variantName}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="text-end shrink-0">
                      <div className="text-base sm:text-xl font-black font-mono tabular-nums text-emerald-500">
                        {item.lineTotal.toFixed(2)} <span className="text-xs">{currency}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right/Side Giant Total Summary Panel */}
          <div
            className={`lg:col-span-5 p-5 sm:p-7 border-t lg:border-t-0 lg:border-s flex flex-col justify-between gap-5 ${
              darkDisplay
                ? 'bg-slate-900 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="space-y-4">
              {snapshot?.customerName && (
                <div
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                    darkDisplay
                      ? 'bg-slate-800/80 border-slate-700'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <User className="w-4 h-4 text-emerald-500" />
                    <span>{snapshot.customerName}</span>
                  </div>
                  {typeof snapshot.customerPoints === 'number' && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-500 text-xs font-black font-mono">
                      {snapshot.customerPoints} pts
                    </span>
                  )}
                </div>
              )}

              {/* Financial Breakdown */}
              <div
                className={`p-5 rounded-3xl border space-y-3 text-sm sm:text-base ${
                  darkDisplay
                    ? 'bg-slate-950/60 border-slate-800'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="opacity-70 font-bold">
                    {isAr ? 'المجموع الفرعي:' : 'Subtotal:'}
                  </span>
                  <span className="font-mono font-bold tabular-nums">
                    {(snapshot?.subtotal || 0).toFixed(2)} {currency}
                  </span>
                </div>

                {(snapshot?.discountTotal || 0) > 0 && (
                  <div className="flex justify-between items-center text-rose-500 font-black">
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-4 h-4" />
                      <span>{isAr ? 'الخصم الممنوح:' : 'Discount:'}</span>
                    </span>
                    <span className="font-mono tabular-nums">
                      -{(snapshot?.discountTotal || 0).toFixed(2)} {currency}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="opacity-70 font-bold">
                    {isAr ? 'الضريبة:' : 'Tax (VAT):'}
                  </span>
                  <span className="font-mono font-bold tabular-nums">
                    {(snapshot?.taxTotal || 0).toFixed(2)} {currency}
                  </span>
                </div>
              </div>

              {/* Giant Amount To Pay Card */}
              <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-xl text-center space-y-2">
                <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-100">
                  {isAr ? 'إجمالي المبلغ المطلوب دفعه' : 'TOTAL AMOUNT DUE'}
                </div>
                <div className="text-4xl sm:text-6xl font-black font-mono tabular-nums tracking-tight">
                  {(snapshot?.grandTotal || 0).toFixed(2)}{' '}
                  <span className="text-xl sm:text-2xl font-sans font-extrabold text-emerald-100">
                    {currency}
                  </span>
                </div>
              </div>
            </div>

            {snapshot?.footerMsg && (
              <div className="text-center text-xs sm:text-sm opacity-75 whitespace-pre-line leading-relaxed pt-2 border-t border-slate-700/25">
                {snapshot.footerMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  WifiOff,
  Database,
  RefreshCw,
  CheckCircle2,
  CloudOff,
  Cloud,
  AlertTriangle,
  MonitorSmartphone,
  LogIn
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { formatFriendlySyncError } from '../../utils/firestoreSync';

export const OfflineIndicator: React.FC = () => {
  const {
    language,
    isOnline,
    offlineSalesQueue,
    isSyncingOfflineSales,
    lastOfflineSyncResult,
    syncPendingOfflineSales,
    cloudSyncState,
    forceCloudSyncNow,
    signInCloudSync,
    setCurrentTab
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [recentSyncedCount, setRecentSyncedCount] = useState<number>(0);
  const [showSyncedBannerHighlight, setShowSyncedBannerHighlight] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [localActionError, setLocalActionError] = useState<string | null>(null);
  const wasOfflineOrPendingRef = useRef(
    !isOnline ||
      cloudSyncState.hasPendingLocalChanges ||
      cloudSyncState.hasPendingWrites ||
      offlineSalesQueue.length > 0
  );

  // Track transition from offline / pending writes -> fully synced on Firestore
  useEffect(() => {
    const isNowPendingOrOffline =
      !isOnline ||
      !cloudSyncState.isSignedIn ||
      cloudSyncState.status === 'error' ||
      cloudSyncState.status === 'syncing' ||
      cloudSyncState.hasPendingLocalChanges ||
      cloudSyncState.hasPendingWrites ||
      isSyncingOfflineSales ||
      offlineSalesQueue.length > 0;

    if (isNowPendingOrOffline) {
      wasOfflineOrPendingRef.current = true;
      return;
    }

    if (wasOfflineOrPendingRef.current && cloudSyncState.status === 'synced' && !cloudSyncState.fromCache) {
      wasOfflineOrPendingRef.current = false;
      setRecentSyncedCount(lastOfflineSyncResult?.syncedCount || 0);
      setShowSyncedBannerHighlight(true);
      const timer = setTimeout(() => {
        setShowSyncedBannerHighlight(false);
        setRecentSyncedCount(0);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [
    isOnline,
    cloudSyncState.isSignedIn,
    cloudSyncState.status,
    cloudSyncState.fromCache,
    cloudSyncState.hasPendingLocalChanges,
    cloudSyncState.hasPendingWrites,
    isSyncingOfflineSales,
    offlineSalesQueue.length,
    lastOfflineSyncResult
  ]);

  useEffect(() => {
    if (!lastOfflineSyncResult || lastOfflineSyncResult.syncedCount <= 0) return;
    setRecentSyncedCount(lastOfflineSyncResult.syncedCount);
    setShowSyncedBannerHighlight(true);
    const timer = setTimeout(() => {
      setShowSyncedBannerHighlight(false);
      setRecentSyncedCount(0);
    }, 5000);
    return () => clearTimeout(timer);
  }, [lastOfflineSyncResult]);

  const openDevicesPanel = () => {
    try {
      sessionStorage.setItem('kadi_settings_subtab', 'devices');
    } catch {
      // ignore
    }
    setCurrentTab('settings');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('kadi:open-connected-devices'));
    }, 40);
  };

  const handleManualSync = async () => {
    setLocalActionError(null);
    setIsManualSyncing(true);
    try {
      if (offlineSalesQueue.length > 0) {
        await syncPendingOfflineSales();
      }
      const res = await forceCloudSyncNow(
        isAr ? 'تحديث ومزامنة فورية من شريط الحالة' : 'Manual sync from status bar'
      );
      if (!res.success && res.error) {
        setLocalActionError(formatFriendlySyncError(res.error, isAr));
      }
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalActionError(null);
    setIsConnectingGoogle(true);
    try {
      const res = await signInCloudSync();
      if (!res.success && res.error) {
        setLocalActionError(formatFriendlySyncError(res.error, isAr));
      }
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const formatLastSyncTime = (): string | null => {
    const raw = cloudSyncState.lastSyncedAtIso || cloudSyncState.lastUpdated;
    if (!raw) return null;
    try {
      const date = new Date(raw);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleTimeString(isAr ? 'ar-MA' : isFr ? 'fr-FR' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return null;
    }
  };

  const pendingChangesCount =
    offlineSalesQueue.length +
    (cloudSyncState.hasPendingLocalChanges || cloudSyncState.hasPendingWrites ? 1 : 0);
  const lastSyncTimeLabel = formatLastSyncTime();
  const otherDevicesCount = Math.max(0, cloudSyncState.activeDevicesCount - 1);

  // 1) OFF: Browser offline — no network connection
  if (!isOnline) {
    const offlineFullText = isAr
      ? 'غير متصل بالإنترنت — وضع أوفلاين شغال (البيع + الكريدي + المخزون) والتغييرات محفوظة محلياً في IndexedDB'
      : isFr
      ? 'Hors ligne — Vente, Crédit & Stock enregistrés localement dans IndexedDB'
      : 'Offline mode active (POS + Credit + Stock saved locally in IndexedDB)';

    return (
      <div
        role="status"
        aria-live="polite"
        title={offlineFullText}
        className="bg-rose-700 text-white text-[10px] font-bold px-2.5 sm:px-3 py-0.5 flex flex-nowrap items-center justify-between gap-1.5 shadow-xs border-b border-rose-800"
      >
        <div className="flex flex-nowrap items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-rose-950/70 border border-rose-400/40 text-[9px] font-black tracking-wider shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>OFF</span>
          </span>
          <WifiOff className="w-3 h-3 shrink-0 text-rose-200" />
          <span className="truncate">
            {isAr
              ? 'وضع أوفلاين متاح (البيع + الكريدي + المخزون) — محفوظ محلياً'
              : isFr
              ? 'Mode hors ligne actif (Vente + Crédit + Stock) — Local'
              : 'Offline mode ready (POS + Credit + Stock) — Saved locally'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex items-center gap-1 bg-rose-900/80 border border-rose-500/30 px-1.5 py-0.2 rounded-md text-[9.5px] font-mono tabular-nums whitespace-nowrap">
            <Database className="w-2.5 h-2.5 shrink-0" />
            <span>
              {pendingChangesCount > 0
                ? isAr
                  ? `${pendingChangesCount} للمزامنة`
                  : `${pendingChangesCount} pending`
                : isAr
                ? 'IndexedDB محلي'
                : 'IndexedDB'}
            </span>
          </span>
        </div>
      </div>
    );
  }

  // 2) OFF: Online but not signed in with Google / Firestore Auth required
  if (!cloudSyncState.isSignedIn) {
    const signInFullText =
      localActionError ||
      (isAr
        ? 'مزامنة Firestore متوقفة — التعديلات محفوظة على هذا الجهاز فقط ولن تصل للأجهزة الأخرى'
        : isFr
        ? 'Sync Firestore désactivée — Modifications locales uniquement'
        : 'Firestore sync OFF — Changes are stored on this device only');

    return (
      <div
        role="status"
        aria-live="polite"
        title={signInFullText}
        className="bg-amber-600 text-white text-[10px] font-bold px-2.5 sm:px-3 py-0.5 flex flex-nowrap items-center justify-between gap-1.5 shadow-xs border-b border-amber-700"
      >
        <div className="flex flex-nowrap items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-amber-950/50 border border-amber-200/40 text-[9px] font-black tracking-wider shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-200" />
            <span>OFF</span>
          </span>
          <CloudOff className="w-3 h-3 shrink-0 text-amber-100" />
          <span className="truncate">
            {localActionError
              ? localActionError
              : isAr
              ? 'المزامنة متوقفة (حفظ محلي فقط)'
              : isFr
              ? 'Sync désactivée (local)'
              : 'Sync OFF (local only)'}
          </span>
          {pendingChangesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-amber-800/80 text-[9px] font-mono tabular-nums shrink-0 whitespace-nowrap">
              {isAr ? `${pendingChangesCount} محلي` : `${pendingChangesCount}`}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={isConnectingGoogle}
          onClick={() => void handleGoogleSignIn()}
          className="px-2 py-0.5 rounded-md bg-white text-amber-900 hover:bg-amber-50 disabled:opacity-60 text-[9.5px] font-black transition-colors flex items-center gap-1 shrink-0 shadow-2xs whitespace-nowrap"
        >
          {isConnectingGoogle ? (
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <LogIn className="w-2.5 h-2.5" />
          )}
          <span>
            {isConnectingGoogle
              ? isAr
                ? 'جاري الربط...'
                : 'Connecting...'
              : isAr
              ? 'تفعيل المزامنة'
              : 'Enable Sync'}
          </span>
        </button>
      </div>
    );
  }

  // 3) OFF: Signed in & online, but Firestore reported an error (permission / unavailable / quota)
  if (cloudSyncState.status === 'error') {
    const friendlyError =
      localActionError ||
      formatFriendlySyncError(cloudSyncState.lastError, isAr) ||
      (isAr ? 'تعذرت المزامنة مع Firestore' : 'Firestore sync error');

    return (
      <div
        role="alert"
        title={friendlyError}
        className="bg-rose-700 text-white text-[10px] font-bold px-2.5 sm:px-3 py-0.5 flex flex-nowrap items-center justify-between gap-1.5 shadow-xs border-b border-rose-800"
      >
        <div className="flex flex-nowrap items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-rose-950/70 border border-rose-300/40 text-[9px] font-black tracking-wider shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>OFF</span>
          </span>
          <AlertTriangle className="w-3 h-3 shrink-0 text-amber-300" />
          <span className="truncate">
            {isAr ? `توقف المزامنة: ${friendlyError}` : `Sync Error: ${friendlyError}`}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={isManualSyncing}
            onClick={() => void handleManualSync()}
            className="px-2 py-0.5 rounded-md bg-white text-rose-800 hover:bg-rose-50 disabled:opacity-60 text-[9.5px] font-black transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'إعادة' : 'Retry'}</span>
          </button>
          <button
            type="button"
            onClick={openDevicesPanel}
            className="px-2 py-0.5 rounded-md bg-rose-900/80 hover:bg-rose-950 text-white border border-rose-400/30 text-[9.5px] font-bold transition-colors whitespace-nowrap"
          >
            {isAr ? 'التفاصيل' : 'Details'}
          </button>
        </div>
      </div>
    );
  }

  // 4) SYNCING / PENDING: Actively writing or pending server acknowledgement on Firestore
  const isActivelySyncingOrPending =
    isManualSyncing ||
    isSyncingOfflineSales ||
    cloudSyncState.status === 'syncing' ||
    cloudSyncState.hasPendingLocalChanges ||
    cloudSyncState.hasPendingWrites ||
    offlineSalesQueue.length > 0;

  if (isActivelySyncingOrPending) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-blue-600 text-white text-[10px] font-bold px-2.5 sm:px-3 py-0.5 flex flex-nowrap items-center justify-between gap-1.5 shadow-xs border-b border-blue-700"
      >
        <div className="flex flex-nowrap items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-blue-900/60 border border-blue-200/40 text-[9px] font-black tracking-wider shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-300 animate-pulse" />
            <span>ON</span>
          </span>
          <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
          <span className="truncate">
            {offlineSalesQueue.length > 0
              ? isAr
                ? `مزامنة ${offlineSalesQueue.length} فواتير مع Firestore...`
                : `Syncing ${offlineSalesQueue.length} queued sales...`
              : isAr
              ? 'جاري المزامنة مع Firestore...'
              : isFr
              ? 'Synchronisation Firestore...'
              : 'Syncing with Firestore...'}
          </span>
        </div>

        <button
          type="button"
          disabled={isManualSyncing || isSyncingOfflineSales}
          onClick={() => void handleManualSync()}
          className="px-2 py-0.5 rounded-md bg-white text-blue-800 hover:bg-blue-50 disabled:opacity-60 text-[9.5px] font-black transition-colors shrink-0 whitespace-nowrap"
        >
          {isAr ? 'مزامنة' : 'Sync'}
        </button>
      </div>
    );
  }

  // 5) CACHE / CONNECTING: Waiting for live Firestore server confirmation (snapshot still fromCache)
  if (cloudSyncState.fromCache) {
    const cacheFullText = isAr
      ? 'الاتصال بخادم Firestore غير مؤكد بعد (عرض من الكاش المحلي) — لم تتأكد المزامنة مع الأجهزة الأخرى'
      : 'Reading from local Firestore cache — awaiting server confirmation';

    return (
      <div
        role="status"
        aria-live="polite"
        title={cacheFullText}
        className="bg-amber-600 text-white text-[10px] font-bold px-2.5 sm:px-3 py-0.5 flex flex-nowrap items-center justify-between gap-1.5 shadow-xs border-b border-amber-700"
      >
        <div className="flex flex-nowrap items-center gap-1.5 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-amber-950/50 border border-amber-200/40 text-[9px] font-black tracking-wider shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-200" />
            <span>OFF</span>
          </span>
          <Database className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {isAr ? 'كاش محلي — بانتظار تأكيد الخادم' : 'Local cache — awaiting server'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleManualSync()}
          className="px-2 py-0.5 rounded-md bg-white text-amber-900 hover:bg-amber-50 text-[9.5px] font-black transition-colors flex items-center gap-1 shrink-0 whitespace-nowrap"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          <span>{isAr ? 'فحص' : 'Verify'}</span>
        </button>
      </div>
    );
  }

  // 6) ON: Confirmed live connection & 100% synced with Firestore server & multi-device store
  return (
    <div
      role="status"
      aria-live="polite"
      className={`text-white text-[10px] font-bold px-2.5 sm:px-3 py-0.5 flex flex-nowrap items-center justify-between gap-1.5 transition-colors border-b ${
        showSyncedBannerHighlight
          ? 'bg-emerald-600 border-emerald-700'
          : 'bg-emerald-700 dark:bg-emerald-950/90 border-emerald-800 dark:border-emerald-900'
      }`}
    >
      <div className="flex flex-nowrap items-center gap-1.5 min-w-0 flex-1">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-950/50 border border-emerald-300/40 text-[9px] font-black tracking-wider shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
          <span>ON</span>
        </span>
        {showSyncedBannerHighlight ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-200 shrink-0" />
        ) : (
          <Cloud className="w-3 h-3 text-emerald-200 shrink-0" />
        )}
        <span className="truncate">
          {recentSyncedCount > 0
            ? isAr
              ? `تمت مزامنة ${recentSyncedCount} ${recentSyncedCount === 1 ? 'فاتورة' : 'فواتير'} مع Firestore`
              : `Synced ${recentSyncedCount} queued sale(s)`
            : isAr
            ? 'متصل — جميع التغييرات متزامنة'
            : isFr
            ? 'Connecté — Tout est synchronisé'
            : 'Connected — All changes synced'}
        </span>

        <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-900/60 border border-emerald-400/20 text-[9.5px] font-semibold text-emerald-100 shrink-0">
          <MonitorSmartphone className="w-2.5 h-2.5 shrink-0" />
          <span>
            {otherDevicesCount > 0
              ? isAr
                ? `${otherDevicesCount} ${otherDevicesCount === 1 ? 'جهاز آخر' : 'أجهزة أخرى'}`
                : `${otherDevicesCount} other(s)`
              : isAr
              ? 'جاهز للمزامنة'
              : 'Ready'}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {lastSyncTimeLabel && (
          <span
            className="hidden md:inline-block text-[9.5px] font-mono tabular-nums text-emerald-100/90 px-1"
            title={cloudSyncState.deviceName}
          >
            {lastSyncTimeLabel}
          </span>
        )}
        <button
          type="button"
          onClick={openDevicesPanel}
          className="px-1.5 py-0.2 rounded-md bg-emerald-900/70 hover:bg-emerald-900 border border-emerald-400/30 text-[9.5px] font-extrabold text-emerald-50 transition-colors tabular-nums flex items-center gap-1 whitespace-nowrap"
          title={isAr ? 'عرض الأجهزة المتصلة وحالة المزامنة' : 'View connected devices'}
        >
          <MonitorSmartphone className="w-2.5 h-2.5 shrink-0" />
          <span>
            {isAr
              ? `الأجهزة (${cloudSyncState.activeDevicesCount})`
              : `Devices (${cloudSyncState.activeDevicesCount})`}
          </span>
        </button>
        <button
          type="button"
          disabled={isManualSyncing}
          onClick={() => void handleManualSync()}
          className="px-1.5 py-0.2 rounded-md bg-white/15 hover:bg-white/25 text-white text-[9.5px] font-extrabold transition-colors flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
          title={isAr ? 'تحديث ومزامنة فورية مع Firestore' : 'Sync now'}
        >
          <RefreshCw className={`w-2.5 h-2.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isAr ? 'تحديث' : 'Sync'}</span>
        </button>
      </div>
    </div>
  );
};

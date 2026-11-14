import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, Wifi, Database, RefreshCw, CheckCircle2 } from 'lucide-react';
import { usePos } from '../../context/PosContext';

export const OfflineIndicator: React.FC = () => {
  const {
    language,
    isOnline,
    offlineSalesQueue,
    isSyncingOfflineSales,
    lastOfflineSyncResult,
    syncPendingOfflineSales
  } = usePos();
  const isAr = language === 'ar';

  const [showReconnectedBanner, setShowReconnectedBanner] = useState(false);
  const [recentSyncedCount, setRecentSyncedCount] = useState<number>(0);
  const wasOfflineRef = useRef(!isOnline);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowReconnectedBanner(false);
      return;
    }

    if (wasOfflineRef.current && !isSyncingOfflineSales && offlineSalesQueue.length === 0) {
      wasOfflineRef.current = false;
      setRecentSyncedCount(lastOfflineSyncResult?.syncedCount || 0);
      setShowReconnectedBanner(true);
      const timer = setTimeout(() => setShowReconnectedBanner(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, isSyncingOfflineSales, offlineSalesQueue.length, lastOfflineSyncResult]);

  useEffect(() => {
    if (!lastOfflineSyncResult || lastOfflineSyncResult.syncedCount <= 0) return;
    setRecentSyncedCount(lastOfflineSyncResult.syncedCount);
    setShowReconnectedBanner(true);
    const timer = setTimeout(() => setShowReconnectedBanner(false), 5000);
    return () => clearTimeout(timer);
  }, [lastOfflineSyncResult]);

  if (isOnline && isSyncingOfflineSales) {
    return (
      <div className="bg-blue-600 text-white text-[11px] font-bold px-4 py-1.5 flex items-center justify-center gap-2 shadow-xs">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>
          {isAr
            ? `تمت استعادة الاتصال — جاري مزامنة ${offlineSalesQueue.length} مبيعات محفوظة مؤقتاً في IndexedDB تلقائياً...`
            : `Connection restored — Auto-syncing ${offlineSalesQueue.length} sales from IndexedDB...`}
        </span>
      </div>
    );
  }

  if (isOnline && offlineSalesQueue.length > 0) {
    return (
      <div className="bg-amber-600 text-white text-[11px] font-bold px-4 py-1.5 flex items-center justify-center gap-3 shadow-xs">
        <Database className="w-3.5 h-3.5 shrink-0" />
        <span>
          {isAr
            ? `توجد ${offlineSalesQueue.length} فواتير محفوظة في IndexedDB بانتظار المزامنة`
            : `${offlineSalesQueue.length} offline sales queued in IndexedDB`}
        </span>
        <button
          type="button"
          onClick={() => void syncPendingOfflineSales()}
          className="px-2.5 py-0.5 rounded-lg bg-white text-amber-800 hover:bg-amber-50 text-[10px] font-extrabold transition-colors"
        >
          {isAr ? 'مزامنة الآن' : 'Sync Now'}
        </button>
      </div>
    );
  }

  if (showReconnectedBanner) {
    return (
      <div className="bg-emerald-600 text-white text-[11px] font-bold px-4 py-1.5 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-1">
        {recentSyncedCount > 0 ? (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Wifi className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>
          {recentSyncedCount > 0
            ? isAr
              ? `تمت استعادة الاتصال ومزامنة ${recentSyncedCount} ${recentSyncedCount === 1 ? 'فاتورة' : 'فواتير'} من IndexedDB تلقائياً بنجاح`
              : `Back online — Auto-synced ${recentSyncedCount} offline sale(s) from IndexedDB`
            : isAr
            ? 'تمت استعادة الاتصال بالإنترنت — البيانات محفوظة في IndexedDB ومتزامنة'
            : 'Internet reconnected — Data synchronized'}
        </span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="bg-amber-600 text-white text-[11px] font-bold px-4 py-1.5 flex flex-wrap items-center justify-center gap-2 shadow-xs">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span>
          {isAr
            ? 'وضع الأوفلاين نشط — يتم تخزين كافة المبيعات مؤقتاً في IndexedDB ومزامنتها تلقائياً عند عودة الإنترنت'
            : 'Offline Mode Active — Sales are safely cached in IndexedDB and will auto-sync online'}
        </span>
        <span className="flex items-center gap-1 bg-amber-800/80 px-2 py-0.5 rounded text-[10px] font-mono tabular-nums">
          <Database className="w-3 h-3" />
          <span>
            {offlineSalesQueue.length > 0
              ? isAr
                ? `قائمة الانتظار: ${offlineSalesQueue.length}`
                : `Queued: ${offlineSalesQueue.length}`
              : isAr
              ? 'IndexedDB جاهز'
              : 'IndexedDB Ready'}
          </span>
        </span>
      </div>
    );
  }

  return null;
};


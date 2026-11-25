import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Edit3,
  Laptop,
  LogIn,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Wifi,
  WifiOff,
  Activity,
  Database,
  AlertTriangle,
  Link2
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import {
  DEVICE_ACTIVE_WINDOW_MS,
  FIRESTORE_COLLECTION,
  formatFriendlySyncError
} from '../../utils/firestoreSync';

function formatRelativeTime(ms: number, nowMs: number, isAr: boolean): string {
  if (!ms || ms <= 0) return isAr ? 'غير متوفر' : 'N/A';
  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diffSec < 15) return isAr ? 'الآن (مباشر)' : 'Just now';
  if (diffSec < 60) return isAr ? `منذ ${diffSec} ثانية` : `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isAr ? `منذ ${diffMin} دقيقة` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return isAr ? `منذ ${diffHr} ساعة` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return isAr ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
}

function formatSyncDateTime(iso: string, isAr: boolean): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(isAr ? 'ar-MA' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function isMobileAgent(ua: string): boolean {
  return /Android|iOS|iPhone|iPad/i.test(ua || '');
}

export const ConnectedDevicesSection: React.FC = () => {
  const {
    cloudSyncState,
    signInCloudSync,
    signOutCloudSync,
    forceCloudSyncNow,
    renameCurrentDevice,
    removeConnectedDevice,
    removeInactiveDevices,
    addAllowedSyncEmail,
    removeAllowedSyncEmail,
    joinCloudStore,
    usePersonalCloudStore,
    isOnline,
    language
  } = usePos();

  const isAr = language === 'ar';
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftDeviceName, setDraftDeviceName] = useState(cloudSyncState.deviceName);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedStoreId, setCopiedStoreId] = useState(false);
  const [joinStoreInput, setJoinStoreInput] = useState('');
  const [copiedStoreUrl, setCopiedStoreUrl] = useState(false);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isSyncBusy, setIsSyncBusy] = useState(false);
  const [isCleaningDevices, setIsCleaningDevices] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    setDraftDeviceName(cloudSyncState.deviceName);
  }, [cloudSyncState.deviceName]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const isConnectedAndSynced =
    isOnline &&
    cloudSyncState.isSignedIn &&
    (cloudSyncState.status === 'synced' || cloudSyncState.status === 'syncing');

  const hasSyncError = isOnline && cloudSyncState.isSignedIn && cloudSyncState.status === 'error';

  const count = cloudSyncState.activeDevicesCount;
  const statusHeadline = isConnectedAndSynced
    ? `متصل ومزامن مع ${count} أجهزة ✅`
    : !isOnline
    ? isAr
      ? 'لا يوجد إنترنت (وضع محلي) ⚠️'
      : 'Offline (Local Mode) ⚠️'
    : hasSyncError
    ? isAr
      ? 'خطأ في صلاحيات أو مزامنة السحابة ⚠️'
      : 'Cloud Sync Error ⚠️'
    : isAr
    ? 'غير متصل بحساب Google ⚠️'
    : 'Google Sign-In Required ⚠️';

  const handleSignIn = async () => {
    setIsAuthBusy(true);
    setActionMsg(null);
    const res = await signInCloudSync();
    setIsAuthBusy(false);
    if (!res.success && res.error) {
      setActionMsg({ type: 'err', text: formatFriendlySyncError(res.error, isAr) });
    } else if (res.success) {
      setActionMsg({
        type: 'ok',
        text: isAr
          ? 'تم ربط حسابك وتفعيل المزامنة الفورية مع Firestore بنجاح'
          : 'Signed in & Firestore real-time sync active'
      });
    }
  };

  const handleManualSync = async () => {
    setIsSyncBusy(true);
    setActionMsg(null);
    try {
      const res = await forceCloudSyncNow(
        isAr ? 'مزامنة يدوية من إدارة الأجهزة' : 'Manual sync'
      );
      if (res.success) {
        setActionMsg({
          type: 'ok',
          text: isAr ? 'تمت المزامنة الفورية ودمج البيانات مع السحابة' : 'Synced & merged successfully'
        });
      } else if (res.error) {
        setActionMsg({ type: 'err', text: formatFriendlySyncError(res.error, isAr) });
      }
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handleCleanInactiveDevices = async () => {
    setIsCleaningDevices(true);
    setActionMsg(null);
    try {
      const res = await removeInactiveDevices();
      if (res.error) {
        setActionMsg({ type: 'err', text: formatFriendlySyncError(res.error, isAr) });
      } else {
        setActionMsg({
          type: 'ok',
          text:
            res.removedCount > 0
              ? isAr
                ? `تمت إزالة ${res.removedCount} أجهزة خاملة/قديمة من القائمة بنجاح`
                : `Removed ${res.removedCount} inactive devices`
              : isAr
              ? 'جميع الأجهزة المسجلة حالياً نشطة ولا توجد أجهزة خاملة'
              : 'All registered devices are currently active'
        });
      }
    } finally {
      setIsCleaningDevices(false);
    }
  };

  const handleCopyStoreLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedStoreUrl(true);
      setTimeout(() => setCopiedStoreUrl(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleSaveDeviceName = async () => {
    if (!draftDeviceName.trim()) return;
    await renameCurrentDevice(draftDeviceName.trim());
    setIsEditingName(false);
    setActionMsg({
      type: 'ok',
      text: isAr ? 'تم تحديث اسم هذا الجهاز على جميع الأجهزة' : 'Device name updated across all terminals'
    });
  };

  const handleCopyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(cloudSyncState.deviceId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail.trim()) return;
    const res = await addAllowedSyncEmail(newStaffEmail.trim());
    if (res.success) {
      setNewStaffEmail('');
      setActionMsg({
        type: 'ok',
        text: isAr ? 'تمت إضافة البريد الإلكتروني لقائمة الأجهزة المصرح لها' : 'Authorized email added'
      });
    } else if (res.error) {
      setActionMsg({ type: 'err', text: res.error });
    }
  };

  return (
    <section
      id="connected-devices"
      className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 max-w-4xl"
    >
      {/* Top Header & Live Connection Pill */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isConnectedAndSynced
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
              }`}
            >
              {isConnectedAndSynced ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                <span>{isAr ? 'إدارة الأجهزة المتصلة والمزامنة الفورية' : 'Connected Devices & Real-time Sync'}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {FIRESTORE_COLLECTION}/{cloudSyncState.storeDocId}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'مزامنة لحظية (onSnapshot) لعدد غير محدود من الأجهزة (+10 أجهزة) عبر Firebase Firestore مع العمل التلقائي من localStorage عند انقطاع الإنترنت.'
                  : 'Instant onSnapshot sync for unlimited devices (10+) via Firebase Firestore with automatic localStorage offline fallback.'}
              </p>
            </div>
          </div>
        </div>

        {/* Exact live status indicator */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`px-3.5 py-2 rounded-2xl border text-xs font-black flex items-center gap-2 shadow-2xs ${
              isConnectedAndSynced
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isConnectedAndSynced ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{statusHeadline}</span>
          </div>

          {cloudSyncState.isSignedIn ? (
            <>
              <button
                type="button"
                disabled={!isOnline || isSyncBusy}
                onClick={() => void handleManualSync()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncBusy ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'مزامنة الآن' : 'Sync Now'}</span>
              </button>
              <button
                type="button"
                onClick={() => void signOutCloudSync()}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500" />
                <span>{isAr ? 'خروج' : 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!isOnline || isAuthBusy}
              onClick={() => void handleSignIn()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {isAuthBusy
                  ? isAr
                    ? 'جاري الربط...'
                    : 'Connecting...'
                  : isAr
                  ? 'ربط حساب Google للمزامنة الفورية'
                  : 'Sign In with Google to Sync'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Connection Diagnostics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
        <div
          className={`px-3 py-2 rounded-xl border flex items-center justify-between font-bold ${
            isOnline
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300'
          }`}
        >
          <span>{isAr ? '1. اتصال الإنترنت' : '1. Internet'}</span>
          <span>{isOnline ? (isAr ? 'متصل ✅' : 'Online ✅') : isAr ? 'منقطع ⚠️' : 'Offline ⚠️'}</span>
        </div>

        <div
          className={`px-3 py-2 rounded-xl border flex items-center justify-between font-bold ${
            cloudSyncState.isSignedIn
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300'
          }`}
        >
          <span>{isAr ? '2. حساب Google' : '2. Google Auth'}</span>
          <span className="truncate max-w-[140px]" title={cloudSyncState.userEmail || ''}>
            {cloudSyncState.isSignedIn
              ? cloudSyncState.userEmail || (isAr ? 'مفعّل ✅' : 'Signed in ✅')
              : isAr
              ? 'غير مسجل ⚠️'
              : 'Required ⚠️'}
          </span>
        </div>

        <div
          className={`px-3 py-2 rounded-xl border flex items-center justify-between font-bold ${
            isConnectedAndSynced
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300'
              : hasSyncError
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          <span>{isAr ? '3. حالة المزامنة' : '3. Cloud Sync'}</span>
          <span>
            {cloudSyncState.status === 'syncing'
              ? isAr
                ? 'جاري الرفع...'
                : 'Syncing...'
              : isConnectedAndSynced
              ? isAr
                ? 'متزامن لحظياً ✅'
                : 'Live ✅'
              : hasSyncError
              ? isAr
                ? 'متوقف (خطأ) ⚠️'
                : 'Error ⚠️'
              : isAr
              ? 'في الانتظار'
              : 'Standby'}
          </span>
        </div>
      </div>

      {/* Offline or Pending Sync Banner */}
      {(!isOnline || cloudSyncState.hasPendingLocalChanges) && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold">
            <Database className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {!isOnline
                ? isAr
                  ? 'أنت تعمل الآن من النسخة الاحتياطية المحلية (localStorage + IndexedDB). ستتم المزامنة والدمج التلقائي فور عودة الإنترنت.'
                  : 'Operating from offline localStorage/IndexedDB fallback. Auto-sync will merge changes when internet returns.'
                : isAr
                ? 'توجد تعديلات محلية محفوظة أوفلاين جاهزة للدمج والرفع نحو Firestore.'
                : 'Offline local changes ready to merge & upload to Firestore.'}
            </span>
          </div>
          {isOnline && cloudSyncState.isSignedIn && (
            <button
              type="button"
              onClick={() => void handleManualSync()}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px]"
            >
              {isAr ? 'رفع ومزامنة الآن' : 'Sync Pending'}
            </button>
          )}
        </div>
      )}

      {/* Auth / Error Feedback Banner */}
      {(cloudSyncState.lastError || actionMsg) && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex flex-wrap items-center justify-between gap-3 ${
            cloudSyncState.lastError || actionMsg?.type === 'err'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-start gap-2 flex-1 min-w-[200px]">
            {(cloudSyncState.lastError || actionMsg?.type === 'err') && (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>
              {cloudSyncState.lastError
                ? formatFriendlySyncError(cloudSyncState.lastError, isAr)
                : actionMsg?.text}
            </span>
          </div>
          {cloudSyncState.lastError && isOnline && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSyncBusy}
                onClick={() => void handleManualSync()}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black"
              >
                {isAr ? 'إعادة المحاولة' : 'Retry Sync'}
              </button>
              <button
                type="button"
                disabled={isAuthBusy}
                onClick={() => void handleSignIn()}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 text-[11px] font-black"
              >
                {isAr ? 'تبديل حساب Google' : 'Switch Google'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
          <div className="text-[11px] text-slate-500 font-semibold">
            {isAr ? 'الأجهزة النشطة الآن' : 'Active Synced Devices'}
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
            {cloudSyncState.activeDevicesCount}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
          <div className="text-[11px] text-slate-500 font-semibold">
            {isAr ? 'إجمالي الأجهزة المسجلة' : 'Registered Devices'}
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
            {cloudSyncState.devices.length}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
          <div className="text-[11px] text-slate-500 font-semibold">
            {isAr ? 'آخر تحديث مشترك' : 'Last Store Update'}
          </div>
          <div className="text-xs font-extrabold text-slate-900 dark:text-white mt-1.5">
            {cloudSyncState.lastUpdated
              ? formatRelativeTime(cloudSyncState.lastUpdated, nowMs, isAr)
              : isAr
              ? 'بانتظار المزامنة'
              : 'Pending'}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
          <div className="text-[11px] text-slate-500 font-semibold">
            {isAr ? 'آخر تعديل بواسطة' : 'Last Updated By'}
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1.5 truncate" title={cloudSyncState.updatedBy || ''}>
            {cloudSyncState.updatedBy || (isAr ? 'محلي' : 'Local')}
          </div>
        </div>
      </div>

      {/* Store Workspace Isolation Card (عزل بيانات كل تاجر أو الانضمام لمتجر زميل) */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {isAr
                  ? 'مساحة المتجر السحابية المعزولة (Store Workspace ID)'
                  : 'Isolated Store Cloud Workspace'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'كل حساب تاجر يحصل تلقائياً على مساحة مستقلة (store_<uid>). شارك هذا المعرف مع أجهزتك الأخرى أو انضم لمعرف متجر زميل.'
                : 'Each merchant account gets an isolated store_<uid> workspace. Share this ID across your terminals or join a colleague store.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <code className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200">
              {cloudSyncState.storeDocId}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(cloudSyncState.storeDocId);
                  setCopiedStoreId(true);
                  setTimeout(() => setCopiedStoreId(false), 1800);
                } catch {
                  // ignore
                }
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
            >
              {copiedStoreId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedStoreId ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            type="text"
            value={joinStoreInput}
            onChange={(e) => setJoinStoreInput(e.target.value)}
            placeholder={isAr ? 'أدخل معرف متجر للانضمام (مثال: store_abc123...)' : 'Enter store ID to join (e.g. store_abc123)'}
            className="flex-1 min-w-[200px] px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => {
              const res = joinCloudStore(joinStoreInput.trim());
              setActionMsg({ type: res.success ? 'ok' : 'err', text: res.message });
              if (res.success) setJoinStoreInput('');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap transition-colors"
          >
            {isAr ? 'انضمام لمتجر زميل' : 'Join Store'}
          </button>
          {cloudSyncState.customStoreDocId && (
            <button
              type="button"
              onClick={() => {
                usePersonalCloudStore();
                setActionMsg({
                  type: 'ok',
                  text: isAr
                    ? 'تمت العودة إلى مساحة متجرك الشخصي المستقل بنجاح'
                    : 'Switched back to your personal store workspace'
                });
              }}
              className="px-3.5 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 text-xs font-bold whitespace-nowrap"
            >
              {isAr ? 'العودة لمتجري المستقل' : 'Back to My Store'}
            </button>
          )}
        </div>
      </div>

      {/* Current Terminal Identity Card */}
      <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
              {isAr ? 'هذا الجهاز' : 'THIS DEVICE'}
            </span>
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={draftDeviceName}
                  onChange={(e) => setDraftDeviceName(e.target.value)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white dark:bg-slate-900 border border-emerald-400 text-slate-900 dark:text-white"
                  placeholder={isAr ? 'مثال: كاشير 1 - الباب' : 'Terminal name'}
                />
                <button
                  type="button"
                  onClick={() => void handleSaveDeviceName()}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                >
                  {isAr ? 'حفظ' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftDeviceName(cloudSyncState.deviceName);
                    setIsEditingName(false);
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-[11px] font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-900 dark:text-white">
                  {cloudSyncState.deviceName}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="p-1 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-800"
                  title={isAr ? 'تعديل اسم الجهاز' : 'Rename Device'}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              ID: {cloudSyncState.deviceId}
            </span>
            <button
              type="button"
              onClick={() => void handleCopyDeviceId()}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedId ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ المعرف' : 'Copy ID')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopyStoreLink()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50"
            >
              {copiedStoreUrl ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
              <span>
                {copiedStoreUrl
                  ? isAr
                    ? 'تم نسخ رابط الربط'
                    : 'Link Copied'
                  : isAr
                  ? 'نسخ رابط فتح المتجر على جهاز آخر'
                  : 'Copy Join Link'}
              </span>
            </button>
            {cloudSyncState.userEmail && (
              <span className="font-bold text-slate-700 dark:text-slate-300">
                · {cloudSyncState.userEmail}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Connected Devices Table / List */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>
              {isAr
                ? `قائمة الأجهزة المتزامنة مع Firestore (${cloudSyncState.devices.length})`
                : `Firestore Synced Devices (${cloudSyncState.devices.length})`}
            </span>
          </h4>
          <div className="flex items-center gap-2">
            {cloudSyncState.isOwner &&
              cloudSyncState.devices.some(
                (d) =>
                  d.deviceId !== cloudSyncState.deviceId &&
                  (d.online === false || nowMs - (d.lastUpdatedMs || 0) >= DEVICE_ACTIVE_WINDOW_MS)
              ) && (
                <button
                  type="button"
                  disabled={isCleaningDevices}
                  onClick={() => void handleCleanInactiveDevices()}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-600 hover:text-rose-600 dark:text-slate-300 text-[11px] font-bold transition-colors"
                >
                  {isCleaningDevices
                    ? isAr
                      ? 'جاري التنظيف...'
                      : 'Cleaning...'
                    : isAr
                    ? 'تنظيف الأجهزة الخاملة'
                    : 'Remove Inactive'}
                </button>
              )}
            <span className="text-[11px] text-slate-500">
              {isAr ? 'يتم تحديث القائمة تلقائياً في نفس الثانية' : 'Auto-updated live via onSnapshot'}
            </span>
          </div>
        </div>

        {!cloudSyncState.isSignedIn ? (
          <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 text-center space-y-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr
                ? 'قم بربط حساب Google على هذا الجهاز وعلى باقي الأجهزة (بنفس البريد أو عبر قائمة المصرح لهم) لعرض ومزامنة جميع الأجهزة فوراً.'
                : 'Sign in with Google on this terminal and other POS devices to view & sync all connected devices in real time.'}
            </p>
          </div>
        ) : cloudSyncState.devices.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 text-center text-xs text-slate-500">
            {isAr
              ? 'جاري تسجيل هذا الجهاز ومزامنة البيانات مع السحابة...'
              : 'Registering this device and fetching connected terminals...'}
          </div>
        ) : (
          <div className="space-y-2">
            {cloudSyncState.devices.map((dev) => {
              const isMe = dev.deviceId === cloudSyncState.deviceId;
              const ageMs = nowMs - (dev.lastUpdatedMs || 0);
              const isWithinWindow = dev.online && (isMe || ageMs < DEVICE_ACTIVE_WINDOW_MS);
              const isFresh = dev.online && (isMe || ageMs < 120_000);
              const MobileOrDesktopIcon = isMobileAgent(dev.userAgent) ? Smartphone : Laptop;

              return (
                <div
                  key={dev.deviceId}
                  className={`p-3.5 rounded-2xl border transition-colors flex flex-wrap items-center justify-between gap-3 ${
                    isMe
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isWithinWindow
                          ? isFresh
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                            : 'bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      <MobileOrDesktopIcon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                          {dev.deviceName}
                        </span>
                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black">
                            {isAr ? 'هذا الجهاز' : 'This Device'}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 ${
                            isWithinWindow
                              ? isFresh
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                                : 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isWithinWindow
                                ? isFresh
                                  ? 'bg-emerald-500 animate-pulse'
                                  : 'bg-sky-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          {isWithinWindow
                            ? isFresh
                              ? isAr
                                ? 'متصل الآن'
                                : 'Active Now'
                              : isAr
                              ? 'متزامن'
                              : 'Synced'
                            : isAr
                            ? 'خامل / غير متصل'
                            : 'Offline / Idle'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <UserCheck className="w-3 h-3 text-slate-400" />
                          <span>{dev.cashierName}</span>
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {dev.userAgent}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          #{dev.deviceId}
                        </span>
                      </div>

                      {/* Last Activity & Exact Sync Date */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                          <Activity className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{isAr ? 'آخر نشاط:' : 'Last activity:'}</span>
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {dev.lastActivity}
                          </span>
                        </span>

                        <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{isAr ? 'تاريخ المزامنة:' : 'Sync date:'}</span>
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300" dir="ltr">
                            {formatSyncDateTime(dev.lastSyncAt, isAr)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            ({formatRelativeTime(dev.lastUpdatedMs, nowMs, isAr)})
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Owner can remove stale devices */}
                  {cloudSyncState.isOwner && !isMe && (
                    <div className="shrink-0">
                      {confirmRemoveId === dev.deviceId ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              void removeConnectedDevice(dev.deviceId);
                              setConfirmRemoveId(null);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-black"
                          >
                            {isAr ? 'تأكيد الإزالة' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-[11px] font-bold"
                          >
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(dev.deviceId)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title={isAr ? 'إزالة الجهاز من القائمة' : 'Remove Device'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-Staff Authorized Google Accounts (Owner Only) */}
      {cloudSyncState.isSignedIn && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                {isAr ? 'صلاحية ربط أجهزة إضافية بحسابات Google أخرى' : 'Authorized Staff Google Accounts'}
              </span>
            </div>
            {cloudSyncState.ownerEmail && (
              <span className="text-[11px] font-mono font-bold text-slate-500">
                {isAr ? 'مالك المتجر:' : 'Owner:'} {cloudSyncState.ownerEmail}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {isAr
              ? 'أي جهاز مسجل بنفس حساب المالك يتزامن تلقائياً (حتى 10 أجهزة أو أكثر). إذا أردت ربط جهاز كاشير ببريد Google مختلف، أضف بريده هنا:'
              : 'Any device using the owner account syncs automatically (10+ devices). Add extra cashier Google emails below if needed:'}
          </p>

          {cloudSyncState.isOwner && (
            <form onSubmit={(e) => void handleAddEmail(e)} className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="email"
                  dir="ltr"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="cashier@gmail.com"
                  className="w-full ps-9 pe-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'منح صلاحية المزامنة' : 'Authorize Email'}</span>
              </button>
            </form>
          )}

          {cloudSyncState.allowedEmails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cloudSyncState.allowedEmails.map((em) => (
                <div
                  key={em}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                >
                  <span>{em}</span>
                  {cloudSyncState.isOwner && (
                    <button
                      type="button"
                      onClick={() => void removeAllowedSyncEmail(em)}
                      className="text-rose-500 hover:text-rose-700 font-black"
                      title={isAr ? 'سحب الصلاحية' : 'Revoke'}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

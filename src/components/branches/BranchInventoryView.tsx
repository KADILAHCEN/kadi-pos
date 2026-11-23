import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Database,
  History,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { usePos } from '../../context/PosContext';
import {
  activeFirebaseConfig,
  auth,
  signInWithGoogleForFirestore
} from '../../firebase';
import { playSound } from '../../utils/audio';
import {
  addBranchProduct,
  adjustBranchProductStock,
  BRANCH_CONFIGS,
  BranchKey,
  BranchProductItem,
  BranchStoreSnapshot,
  BranchSyncState,
  clearBranchSalesLog,
  detectAndConnectProjectRtdb,
  getBranchKeyFromPosBranchId,
  getConfiguredRtdbUrl,
  getDeviceSlotForBranch,
  loadLocalBranchSnapshot,
  ORDERED_BRANCH_KEYS,
  pingBranchDevicePresence,
  resetBranchToDefaults,
  resolveAndSaveRtdbUrlFromInput,
  saveBranchKey,
  saveDeviceSlotForBranch,
  setConfiguredRtdbUrl,
  subscribeBranchData
} from '../../utils/branchRtdbSync';

export const BranchInventoryView: React.FC = () => {
  const { activeBranchId, setActiveBranchId, settings } = usePos();

  const [branchKey, setBranchKey] = useState<BranchKey>(() =>
    getBranchKeyFromPosBranchId(activeBranchId)
  );
  const branchConfig = BRANCH_CONFIGS[branchKey];

  // Keep branchKey synchronized when user switches branch from Navbar / BranchGate
  useEffect(() => {
    const mapped = getBranchKeyFromPosBranchId(activeBranchId);
    if (mapped !== branchKey) {
      setBranchKey(mapped);
    }
  }, [activeBranchId]);

  const [deviceInfo, setDeviceInfo] = useState(() => getDeviceSlotForBranch(branchKey));
  useEffect(() => {
    setDeviceInfo(getDeviceSlotForBranch(branchKey));
  }, [branchKey]);

  const [snapshot, setSnapshot] = useState<BranchStoreSnapshot>(() =>
    loadLocalBranchSnapshot(branchKey)
  );
  const [syncState, setSyncState] = useState<BranchSyncState>({
    mode: 'local',
    rtdbConnected: false,
    rtdbUrl: getConfiguredRtdbUrl(),
    error: null
  });

  // Device rename inline state
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [deviceNameDraft, setDeviceNameDraft] = useState(deviceInfo.deviceName);

  // Add new item inline state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdStock, setNewProdStock] = useState('20');

  // Optional RTDB URL modal & Auth state
  const [showRtdbModal, setShowRtdbModal] = useState(false);
  const [rtdbUrlInput, setRtdbUrlInput] = useState(() => getConfiguredRtdbUrl() || '');
  const [rtdbUrlError, setRtdbUrlError] = useState<string | null>(null);
  const [rtdbReconnectTick, setRtdbReconnectTick] = useState(0);
  const [authUser, setAuthUser] = useState<User | null>(() => auth.currentUser);
  const [isProbingRtdb, setIsProbingRtdb] = useState(false);

  // Confirm reset banner (no window.confirm)
  const [confirmReset, setConfirmReset] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const showToast = (text: string, isError = false) => {
    setToastMsg({ text, isError });
    window.setTimeout(() => {
      setToastMsg((prev) => (prev?.text === text ? null : prev));
    }, 2600);
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setRtdbReconnectTick((v) => v + 1);
    });
    return () => unsubAuth();
  }, []);

  // Automatically probe kadi-pos-default-rtdb regional endpoint on first load if not saved yet
  useEffect(() => {
    if (getConfiguredRtdbUrl()) return;
    let cancelled = false;
    setIsProbingRtdb(true);
    void detectAndConnectProjectRtdb(activeFirebaseConfig.projectId)
      .then((detectedUrl) => {
        if (cancelled || !detectedUrl) return;
        setRtdbUrlInput(detectedUrl);
        setRtdbReconnectTick((v) => v + 1);
      })
      .finally(() => {
        if (!cancelled) setIsProbingRtdb(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to isolated branch data (only this branch's products, sales, devices)
  useEffect(() => {
    const unsub = subscribeBranchData(
      branchKey,
      (nextSnap) => setSnapshot(nextSnap),
      (nextSync) => setSyncState(nextSync)
    );
    void pingBranchDevicePresence(branchKey, deviceInfo.deviceId, deviceInfo.deviceName);
    return () => {
      unsub();
    };
  }, [branchKey, deviceInfo.deviceId, deviceInfo.deviceName, rtdbReconnectTick]);

  const handleSwitchBranch = (nextKey: BranchKey) => {
    saveBranchKey(nextKey);
    setBranchKey(nextKey);
    setActiveBranchId(BRANCH_CONFIGS[nextKey].posBranchId);
    setConfirmReset(false);
    setIsEditingDeviceName(false);
  };

  const handleSwitchDeviceSlot = (slotId: string) => {
    const updated = saveDeviceSlotForBranch(branchKey, slotId);
    setDeviceInfo(updated);
    setDeviceNameDraft(updated.deviceName);
    setIsEditingDeviceName(false);
    void pingBranchDevicePresence(branchKey, updated.deviceId, updated.deviceName);
    showToast(`تم التحويل إلى: ${updated.deviceName}`);
  };

  const handleSaveDeviceName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceNameDraft.trim()) return;
    const updated = saveDeviceSlotForBranch(branchKey, deviceInfo.deviceId, deviceNameDraft.trim());
    setDeviceInfo(updated);
    setIsEditingDeviceName(false);
    void pingBranchDevicePresence(branchKey, updated.deviceId, updated.deviceName);
    showToast(`✅ تم تحديث اسم الجهاز إلى "${updated.deviceName}"`);
  };

  const handleAdjustStock = async (prod: BranchProductItem, delta: -1 | 1) => {
    const res = await adjustBranchProductStock({
      branchKey,
      productId: prod.id,
      delta,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName
    });

    if (!res.success) {
      if (settings.enableSoundEffects !== false) playSound('error');
      showToast(res.error || 'تعذر تحديث المخزون', true);
      return;
    }

    if (settings.enableSoundEffects !== false) {
      playSound(delta < 0 ? 'beep' : 'success');
    }
  };

  const handleAddNewBranchProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await addBranchProduct({
      branchKey,
      name: newProdName,
      stock: Number(newProdStock) || 0,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName
    });
    if (!res.success) {
      showToast(res.error || 'أدخل اسم المنتوج', true);
      return;
    }
    setNewProdName('');
    setNewProdStock('20');
    setShowAddForm(false);
    if (settings.enableSoundEffects !== false) playSound('success');
    showToast(`✅ تزاد المنتوج غير في ${branchConfig.labelAr}`);
  };

  const handleSaveRtdbUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = rtdbUrlInput.trim();
    if (!cleaned) {
      setConfiguredRtdbUrl(null);
      setRtdbUrlError(null);
      setRtdbReconnectTick((v) => v + 1);
      setShowRtdbModal(false);
      showToast('تم تفعيل الوضع المحلي الفوري بين نوافذ المتصفح');
      return;
    }
    setIsProbingRtdb(true);
    const res = await resolveAndSaveRtdbUrlFromInput(cleaned);
    setIsProbingRtdb(false);
    if (res.error) {
      setRtdbUrlError(res.error);
      return;
    }
    if (res.url) {
      setRtdbUrlInput(res.url);
    }
    setRtdbUrlError(null);
    setRtdbReconnectTick((v) => v + 1);
    setShowRtdbModal(false);
    showToast('✅ تم ربط Firebase Realtime Database بنجاح!');
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogleForFirestore();
      setRtdbReconnectTick((v) => v + 1);
      showToast('✅ تم تسجيل الدخول بنجاح! جاري مزامنة الفروع...');
    } catch {
      showToast('تعذر إتمام تسجيل الدخول بـ Google', true);
    }
  };

  const orderedProducts = useMemo(() => {
    const priorityOrder = ['aicha', 'hommos', 'sanida', 'halib'];
    return Object.values(snapshot.products).sort((a, b) => {
      const ia = priorityOrder.indexOf(a.id);
      const ib = priorityOrder.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [snapshot.products]);

  const branchSalesOnly = useMemo(
    () => snapshot.sales.filter((s) => s.type === 'sale'),
    [snapshot.sales]
  );

  const totalUnitsLeft = useMemo(
    () => orderedProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0),
    [orderedProducts]
  );

  return (
    <div
      dir="rtl"
      className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-3 sm:p-5 space-y-4 pb-24 lg:pb-6"
    >
      {/* Floating feedback toast */}
      {toastMsg && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-sm font-black flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
            toastMsg.isError
              ? 'bg-rose-600 text-white'
              : 'bg-slate-900 dark:bg-emerald-700 text-white'
          }`}
        >
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Top Branch + Device Control Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Active Branch & RTDB Path */}
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                مخزون {branchConfig.labelAr}
              </h1>
              <p className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                مخزون ومبيعات مستقلة 100% · البيع هنا ما كينقصش من الفروع الآخرين
              </p>
            </div>
          </div>

          {/* Right controls: Sync badge */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRtdbModal(true)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-black flex items-center gap-2 transition-colors ${
                syncState.rtdbConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}
            >
              {syncState.rtdbConnected ? (
                <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Database className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>
                {syncState.rtdbConnected
                  ? 'متصل بالمزامنة الفورية ✅'
                  : isProbingRtdb
                  ? 'جاري الاتصال...'
                  : 'إعداد المزامنة السحابية'}
              </span>
            </button>
          </div>
        </div>

        {/* Big Branch Switcher Pills + Device Name Bar */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* 3 Branches Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-slate-500 dark:text-slate-400">الفروع (3):</span>
            {ORDERED_BRANCH_KEYS.map((key) => {
              const cfg = BRANCH_CONFIGS[key];
              const isSelected = key === branchKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSwitchBranch(key)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-black transition-all border ${
                    isSelected
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-400'
                  }`}
                >
                  {cfg.labelAr}
                </button>
              );
            })}
          </div>

          {/* 2 Devices for Current Branch + Editable Device Name */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center gap-2 flex-wrap">
              <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
              {isEditingDeviceName ? (
                <form onSubmit={handleSaveDeviceName} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={deviceNameDraft}
                    onChange={(e) => setDeviceNameDraft(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-emerald-500 bg-white dark:bg-slate-900 text-xs font-black text-slate-900 dark:text-white"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="p-1.5 rounded-lg bg-emerald-600 text-white"
                    title="حفظ"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingDeviceName(false)}
                    className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    اسم الجهاز:
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm font-black">
                    {deviceInfo.deviceName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDeviceNameDraft(deviceInfo.deviceName);
                      setIsEditingDeviceName(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
                    title="تغيير اسم الجهاز"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {branchConfig.devices.map((dev) => {
                const active = dev.id === deviceInfo.deviceId;
                return (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => handleSwitchDeviceSlot(dev.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-black transition-colors ${
                      active
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
                    }`}
                  >
                    جهاز {dev.slotIndex}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RTDB Permission / Auth Quick Action Banner if blocked by Firebase Rules */}
      {syncState.mode === 'rtdb' && !syncState.rtdbConnected && syncState.error && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-amber-950 dark:text-amber-100">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm space-y-1">
              <div className="font-black">
                قاعدة البيانات {activeFirebaseConfig.projectId}-default-rtdb موجودة لكن صلاحيات القراءة/الكتابة مقفولة حالياً
              </div>
              <div className="text-amber-800 dark:text-amber-300 font-bold">
                {!authUser
                  ? 'سجّل الدخول بحساب Google أو فعّل قواعد branches في Firebase Realtime Database Rules.'
                  : 'المستخدم مسجل، افتح تبويب Rules في Realtime Database وسمح بالوصول لمسار branches.'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!authUser && (
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
              >
                تسجيل الدخول بـ Google
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRtdbModal(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black"
            >
              عرض قواعد Realtime DB
            </button>
          </div>
        </div>
      )}

      {/* KPI & Quick Toolbar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">الفرع النشط</div>
          <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
            {branchConfig.labelAr}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">مجموع المخزون هنا</div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
            {totalUnitsLeft} حبة
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">مبيعات {branchConfig.shortAr}</div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">
            {branchSalesOnly.length} عملية
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">أجهزة هذا الفرع</div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">2 أجهزة مستقلة</div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>سلعة جديدة</span>
          </button>
        </div>
      </div>

      {/* Optional Add Product to Current Branch Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddNewBranchProduct}
          className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-500 p-4 flex flex-col sm:flex-row items-end gap-3 shadow-sm"
        >
          <div className="flex-1 w-full">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
              سميت المنتوج (غير في {branchConfig.labelAr})
            </label>
            <input
              type="text"
              value={newProdName}
              onChange={(e) => setNewProdName(e.target.value)}
              placeholder="مثال: أتاي، زيت لوسيور، كسكس..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
            />
          </div>
          <div className="w-full sm:w-36">
            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
              الكمية الأولية
            </label>
            <input
              type="number"
              min="0"
              value={newProdStock}
              onChange={(e) => setNewProdStock(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-black text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="submit"
              className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black"
            >
              حفظ في {branchConfig.shortAr}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* Main Products Grid — Giant Arabic Cards & Big -1 / +1 Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {orderedProducts.map((prod) => {
          const isOut = prod.stock <= 0;
          const isLow = prod.stock > 0 && prod.stock <= 10;
          return (
            <div
              key={prod.id}
              className={`bg-white dark:bg-slate-900 rounded-3xl border-2 p-5 shadow-xs flex flex-col justify-between gap-4 transition-all ${
                isOut
                  ? 'border-rose-500 ring-2 ring-rose-500/20'
                  : isLow
                  ? 'border-amber-400'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* Card Title + Status */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-snug">
                    {prod.name}
                  </h2>
                  {prod.updatedByDevice && (
                    <div className="text-[11px] font-bold text-slate-400 mt-1">
                      آخر تعديل: {prod.updatedByDevice}
                    </div>
                  )}
                </div>
                <span
                  className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${
                    isOut
                      ? 'bg-rose-600 text-white'
                      : isLow
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {isOut ? 'نفذ ❌' : isLow ? 'قريب يسالي' : 'متوفر ✅'}
                </span>
              </div>

              {/* Giant Stock Counter */}
              <div className="py-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-center">
                <div className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                  المخزون في {branchConfig.labelAr}
                </div>
                <div
                  className={`text-5xl font-black tabular-nums mt-1 ${
                    isOut
                      ? 'text-rose-600 dark:text-rose-400'
                      : isLow
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {prod.stock}
                </div>
              </div>

              {/* Giant Arabic Touch Buttons: بيع -1 & زيد +1 */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void handleAdjustStock(prod, -1)}
                  className={`min-h-[64px] rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${
                    isOut
                      ? 'bg-rose-200 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 cursor-not-allowed'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  <Minus className="w-6 h-6 stroke-[3]" />
                  <span>بيع -1</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleAdjustStock(prod, 1)}
                  className="min-h-[64px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg sm:text-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <Plus className="w-6 h-6 stroke-[3]" />
                  <span>زيد +1</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Branch Devices (2 devices) + Branch-Only Sales History Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 2 Devices Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <span>أجهزة {branchConfig.labelAr} (2)</span>
            </h3>
            <span className="text-xs font-bold text-slate-400">من أصل 6 أجهزة</span>
          </div>

          <div className="space-y-2.5">
            {branchConfig.devices.map((slot) => {
              const status = snapshot.devices[slot.id];
              const isMe = slot.id === deviceInfo.deviceId;
              const isRecentlyActive =
                status && status.lastSeen > 0 && Date.now() - status.lastSeen < 5 * 60 * 1000;
              return (
                <div
                  key={slot.id}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${
                    isMe
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isMe || isRecentlyActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                      <span className="truncate">
                        {isMe ? deviceInfo.deviceName : status?.deviceName || slot.defaultName}
                      </span>
                      {isMe && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
                          هذا الجهاز
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {status?.lastAction || 'جاهز للبيع والمزامنة'}
                    </div>
                  </div>
                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => handleSwitchDeviceSlot(slot.id)}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-black text-slate-700 dark:text-slate-200 hover:border-emerald-500 shrink-0"
                    >
                      استعمال
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Branch Reset control (without window.confirm) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            {confirmReset ? (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 space-y-2">
                <div className="text-xs font-black text-rose-800 dark:text-rose-200">
                  واش متأكد باغي ترجع مخزون {branchConfig.labelAr} للأصل (94 / 50 / 80 / 30)؟
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void resetBranchToDefaults(branchKey);
                      setConfirmReset(false);
                      showToast(`✅ تم إرجاع مخزون ${branchConfig.labelAr} للقيم الأصلية`);
                    }}
                    className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-black"
                  >
                    نعم، رجع المخزون
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إرجاع مخزون {branchConfig.shortAr} للأصل (94/50/80/30)</span>
              </button>
            )}
          </div>
        </div>

        {/* Branch-Only Sales & Restock History Log */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                سجل مبيعات {branchConfig.labelAr} بوحدو ({snapshot.sales.length})
              </h3>
            </div>
            {snapshot.sales.length > 0 && (
              <button
                type="button"
                onClick={() => void clearBranchSalesLog(branchKey)}
                className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح سجل {branchConfig.shortAr}</span>
              </button>
            )}
          </div>

          {snapshot.sales.length === 0 ? (
            <div className="p-10 text-center text-slate-400 flex flex-col items-center justify-center gap-2 flex-1">
              <CheckCircle2 className="w-9 h-9 text-emerald-500 opacity-75" />
              <span className="text-sm font-bold">
                باقي ما كاين حتى عملية في {branchConfig.labelAr} — جرب تضغط على "بيع -1" أو "زيد +1"
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {snapshot.sales.map((entry) => {
                const isSale = entry.type === 'sale';
                return (
                  <div
                    key={entry.id}
                    className="p-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-black shrink-0 ${
                          isSale
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {isSale ? 'بيع -1' : 'زيد +1'}
                      </span>
                      <div className="min-w-0">
                        <div className="font-black text-sm text-slate-900 dark:text-white truncate">
                          {entry.productName}
                        </div>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                          <span>📱 {entry.deviceName}</span>
                          <span>·</span>
                          <span>المتبقي: {entry.stockAfter}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-mono font-bold text-slate-400 tabular-nums shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString('ar-MA', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Firebase Realtime Database URL Configuration Modal */}
      {showRtdbModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowRtdbModal(false)}
        >
          <form
            onSubmit={handleSaveRtdbUrl}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    ربط Firebase Realtime Database
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    مزامنة فورية بين 6 أجهزة في 3 فروع عبر المسارات المستقلة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRtdbModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
              مزامنة فورية ومستقلة بين أجهزة كل فرع (فرع صفرو، فرع 2، فرع 3).
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                رابط Firebase Realtime Database (Database URL):
              </label>
              <input
                type="url"
                value={rtdbUrlInput}
                onChange={(e) => {
                  setRtdbUrlInput(e.target.value);
                  if (rtdbUrlError) setRtdbUrlError(null);
                }}
                placeholder={`https://${activeFirebaseConfig.projectId}-default-rtdb.firebaseio.com`}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white dir-ltr text-left"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setRtdbUrlInput(
                      `https://${activeFirebaseConfig.projectId}-default-rtdb.firebaseio.com`
                    );
                    setRtdbUrlError(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300 dir-ltr"
                >
                  US: {activeFirebaseConfig.projectId}-default-rtdb.firebaseio.com
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRtdbUrlInput(
                      `https://${activeFirebaseConfig.projectId}-default-rtdb.europe-west1.firebasedatabase.app`
                    );
                    setRtdbUrlError(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300 dir-ltr"
                >
                  EU: {activeFirebaseConfig.projectId}-default-rtdb.europe-west1.firebasedatabase.app
                </button>
              </div>
              {rtdbUrlError && (
                <div className="mt-1.5 text-xs font-bold text-rose-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{rtdbUrlError}</span>
                </div>
              )}
              {syncState.error && (
                <div className="mt-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-2">
                  <div className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <WifiOff className="w-4 h-4 shrink-0" />
                    <span>{syncState.error}</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    في Firebase Console ← Realtime Database ← Rules أضف:
                  </div>
                  <pre className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 text-[10px] font-mono overflow-x-auto dir-ltr text-left">
{`{
  "rules": {
    "branches": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}`}
                  </pre>
                  {!authUser && (
                    <button
                      type="button"
                      onClick={() => void handleGoogleSignIn()}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
                    >
                      تسجيل الدخول بحساب Google لتفعيل المزامنة
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRtdbModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                إغلاق
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
              >
                حفظ وتفعيل المزامنة
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

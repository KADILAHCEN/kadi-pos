import React, { useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Branch } from '../../types';
import {
  Building2,
  Plus,
  RefreshCw,
  ArrowLeftRight,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  Calendar,
  Layers,
  Edit2,
  Trash2,
  X,
  TrendingUp,
  FileText,
  AlertCircle
} from 'lucide-react';
import { getBranchKeyFromPosBranchId, saveBranchKey } from '../../utils/branchRtdbSync';

export const BranchManagementSection: React.FC = () => {
  const {
    branches,
    activeBranchId,
    setActiveBranchId,
    addBranch,
    updateBranch,
    deleteBranch,
    branchTransfers,
    transferStockBetweenBranches,
    syncBranchData,
    isSyncing,
    lastSyncTime,
    orders,
    products,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransfersHistory, setShowTransfersHistory] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);

  // Add/Edit Form State
  const [formName, setFormName] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formCity, setFormCity] = useState('صفرو');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formManager, setFormManager] = useState('');
  const [formIsMain, setFormIsMain] = useState(false);

  // Transfer Form State
  const [transferProductId, setTransferProductId] = useState('');
  const [transferFromBranchId, setTransferFromBranchId] = useState(activeBranchId);
  const [transferToBranchId, setTransferToBranchId] = useState(
    branches.find((b) => b.id !== activeBranchId)?.id || ''
  );
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingBranch(null);
    setFormName('');
    setFormNameEn('');
    setFormCode(`BR-0${branches.length + 1}`);
    setFormCity('صفرو');
    setFormAddress('');
    setFormPhone('+212 5 ');
    setFormManager('');
    setFormIsMain(false);
    setShowAddEditModal(true);
  };

  const openEditModal = (b: Branch) => {
    setEditingBranch(b);
    setFormName(b.name);
    setFormNameEn(b.nameEn || '');
    setFormCode(b.code);
    setFormCity(b.city);
    setFormAddress(b.address);
    setFormPhone(b.phone);
    setFormManager(b.managerName);
    setFormIsMain(b.isMain);
    setShowAddEditModal(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) return;

    if (editingBranch) {
      updateBranch(editingBranch.id, {
        name: formName.trim(),
        nameEn: formNameEn.trim() || formName.trim(),
        code: formCode.trim().toUpperCase(),
        city: formCity.trim(),
        address: formAddress.trim(),
        phone: formPhone.trim(),
        managerName: formManager.trim(),
        isMain: formIsMain
      });
    } else {
      addBranch({
        name: formName.trim(),
        nameEn: formNameEn.trim() || formName.trim(),
        code: formCode.trim().toUpperCase(),
        city: formCity.trim(),
        address: formAddress.trim(),
        phone: formPhone.trim(),
        managerName: formManager.trim() || 'مدير الفرع',
        isMain: formIsMain,
        status: 'active'
      });
    }

    setShowAddEditModal(false);
  };

  const handleManualSync = async () => {
    const res = await syncBranchData();
    setSyncToast(res.message);
    setTimeout(() => setSyncToast(null), 3000);
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);

    if (!transferProductId) {
      setTransferError(isAr ? 'يرجى اختيار المنتج المطلوب تحويله' : 'Please select a product');
      return;
    }
    if (transferFromBranchId === transferToBranchId) {
      setTransferError(isAr ? 'لا يمكن التحويل إلى نفس الفرع' : 'Source and destination branches cannot be identical');
      return;
    }
    if (transferQuantity <= 0) {
      setTransferError(isAr ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be positive');
      return;
    }

    const success = transferStockBetweenBranches(
      transferProductId,
      transferFromBranchId,
      transferToBranchId,
      transferQuantity,
      transferNotes
    );

    if (success) {
      setShowTransferModal(false);
      setTransferNotes('');
      setTransferQuantity(1);
    } else {
      setTransferError(isAr ? 'فشل إتمام التحويل، يرجى التحقق من توفر المخزون' : 'Failed to transfer stock');
    }
  };

  // Selected product for transfer info
  const selectedProduct = products.find((p) => p.id === transferProductId);
  const fromBranchObj = branches.find((b) => b.id === transferFromBranchId);
  const currentFromStock = selectedProduct
    ? (selectedProduct.branchStocks?.[transferFromBranchId] !== undefined
      ? selectedProduct.branchStocks[transferFromBranchId]
      : selectedProduct.stock)
    : 0;

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 max-w-4xl">
      {/* Header & Cloud Sync Hub */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              {isAr ? 'إدارة الفروع المتعددة ومزامنة المخزون (Multi-Branch)' : 'Multi-Branch & Stock Sync'}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'إنشاء الفروع (صفرو، فاس...)، تتبع المبيعات والمخزون مستقلاً لكل فرع، وتحويل البضائع مع مزامنة سحابية مركزية.'
              : 'Independent branch management, per-branch sales & inventory metrics, and cloud synchronization.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-2 shadow-2xs disabled:opacity-50"
            title={isAr ? 'مزامنة بيانات الفروع مع السحابة' : 'Sync branch data'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
            <span>
              {isSyncing
                ? isAr ? 'جارِ المزامنة...' : 'Syncing...'
                : isAr ? 'مزامنة الفروع الآن' : 'Sync All Branches'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowTransferModal(true)}
            className="px-3.5 py-2 text-xs font-bold rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors flex items-center gap-2 shadow-2xs"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{isAr ? 'تحويل مخزون بين الفروع' : 'Transfer Stock'}</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAr ? 'إضافة فرع جديد' : 'Add Branch'}</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {isAr ? 'حالة شبكة الفروع:' : 'Branch Network Status:'}{' '}
            <strong className="text-emerald-600 dark:text-emerald-400">
              {isAr ? 'متصلة ومحدثة مع السحابة' : 'Online & Connected'}
            </strong>
          </span>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          {isAr ? 'آخر مزامنة:' : 'Last sync:'} {lastSyncTime}
        </span>
      </div>

      {syncToast && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Branches Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {branches.map((b) => {
          const isActive = b.id === activeBranchId;
          const branchOrders = orders.filter((o) => o.branchId === b.id);
          const branchRevenue = branchOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);

          return (
            <div
              key={b.id}
              className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                isActive
                  ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
              }`}
            >
              <div>
                {/* Branch Top info */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                        {b.code}
                      </span>
                      {b.isMain && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {isAr ? 'الفرع الرئيسي' : 'HQ Main'}
                        </span>
                      )}
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white mt-1 truncate">
                      {b.name}
                    </h4>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(b)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title={isAr ? 'تعديل بيانات الفرع' : 'Edit'}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!b.isMain && branches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDeletingBranch(b)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        title={isAr ? 'حذف الفرع' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Branch Details */}
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 mb-3">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{b.managerName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono text-[11px]">{b.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-[11px] truncate">{b.address}</span>
                  </div>
                </div>

                {/* Sales & Orders metrics per branch */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs mb-3">
                  <div>
                    <span className="block text-[10px] text-slate-400">{isAr ? 'المبيعات' : 'Sales'}</span>
                    <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {branchRevenue.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">{isAr ? 'الفواتير' : 'Orders'}</span>
                    <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {branchOrders.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action / Active branch selector */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                {isActive ? (
                  <div className="w-full py-1.5 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'الفرع النشط الحالي لنقطة البيع' : 'Currently Active Branch'}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      saveBranchKey(getBranchKeyFromPosBranchId(b.id));
                      setActiveBranchId(b.id);
                    }}
                    className="w-full py-1.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 hover:border-emerald-400 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
                  >
                    {isAr ? 'التبديل والبيع من هذا الفرع' : 'Switch to this branch'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transfer History Quick Trigger */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setShowTransfersHistory(!showTransfersHistory)}
          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>
            {showTransfersHistory
              ? isAr ? 'إخفاء سجل التحويلات السابقة' : 'Hide transfer logs'
              : isAr ? `عرض سجل التحويلات السابقة بين الفروع (${branchTransfers.length})` : `View Transfer Logs (${branchTransfers.length})`}
          </span>
        </button>
      </div>

      {/* Transfers History Table */}
      {showTransfersHistory && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl animate-in fade-in">
          <table className="w-full text-xs text-left rtl:text-right">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3">{isAr ? 'رقم التحويل' : 'Ref'}</th>
                <th className="p-3">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="p-3">{isAr ? 'من فرع' : 'From'}</th>
                <th className="p-3">{isAr ? 'إلى فرع' : 'To'}</th>
                <th className="p-3">{isAr ? 'السلعة / الكمية' : 'Item / Qty'}</th>
                <th className="p-3">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="p-3">{isAr ? 'ملاحظات' : 'Notes'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {branchTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400">
                    {isAr ? 'لا توجد تحويلات سابقة مسجلة' : 'No transfers yet'}
                  </td>
                </tr>
              ) : (
                branchTransfers.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {tr.transferNumber}
                    </td>
                    <td className="p-3 text-slate-500 font-mono">
                      {new Date(tr.date).toLocaleDateString()}
                    </td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      {tr.fromBranchName}
                    </td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      {tr.toBranchName}
                    </td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {tr.productName} ({tr.quantity} {tr.unit})
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {isAr ? 'مكتمل' : 'Completed'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 text-[11px]">
                      {tr.notes || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Branch Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleSaveBranch}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <span>
                  {editingBranch
                    ? isAr ? 'تعديل بيانات الفرع' : 'Edit Branch'
                    : isAr ? 'إضافة فرع جديد' : 'New Branch'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddEditModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'اسم الفرع (بالعربية) *' : 'Branch Name (AR) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فرع صفرو - حي بن صفار"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'رمز الفرع (Code) *' : 'Branch Code *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="SEF-02"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'المدينة *' : 'City *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="صفرو / فاس"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'اسم مدير الفرع' : 'Branch Manager'}
                </label>
                <input
                  type="text"
                  placeholder="الحاج التهامي"
                  value={formManager}
                  onChange={(e) => setFormManager(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'العنوان التفصيلي' : 'Address'}
              </label>
              <input
                type="text"
                placeholder="شارع الحسن الثاني، قرب باب المقام، صفرو"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'رقم الهاتف' : 'Phone'}
              </label>
              <input
                type="text"
                placeholder="+212 5 35 66 12 84"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isMainCheckbox"
                checked={formIsMain}
                onChange={(e) => setFormIsMain(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded"
              />
              <label htmlFor="isMainCheckbox" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                {isAr ? 'تعيين هذا الفرع كمقر رئيسي (HQ)' : 'Set as Main Headquarter'}
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddEditModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
              >
                {isAr ? 'حفظ الفرع' : 'Save Branch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inter-Branch Stock Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleExecuteTransfer}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                <span>{isAr ? 'تحويل مخزون بين الفروع' : 'Transfer Stock Between Branches'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'اختر المنتج المطلوب تحويله *' : 'Product to transfer *'}
              </label>
              <select
                required
                value={transferProductId}
                onChange={(e) => setTransferProductId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="">{isAr ? '-- حدد منتجاً من المخزون --' : '-- Select Product --'}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (المخزون الإجمالي: {p.stock} {p.unitType})
                  </option>
                ))}
              </select>
            </div>

            {/* From & To Branches */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'من فرع (المُرسِل)' : 'From Branch'}
                </label>
                <select
                  value={transferFromBranchId}
                  onChange={(e) => setTransferFromBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'إلى فرع (المُستلِم)' : 'To Branch'}
                </label>
                <select
                  value={transferToBranchId}
                  onChange={(e) => setTransferToBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} - {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Available stock hint */}
            {selectedProduct && fromBranchObj && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-300 flex items-center justify-between">
                <span>{isAr ? 'المخزون المتوفر في الفرع المُرسِل:' : 'Available in source branch:'}</span>
                <strong className="font-mono tabular-nums">
                  {currentFromStock} {selectedProduct.unitType}
                </strong>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'الكمية المراد نقلها' : 'Quantity'}
              </label>
              <input
                type="number"
                min={0.1}
                step="any"
                max={currentFromStock > 0 ? currentFromStock : undefined}
                required
                value={transferQuantity}
                onChange={(e) => setTransferQuantity(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-base font-bold font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'ملاحظات التحويل (اختياري)' : 'Transfer Notes'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: تعويض نقص زيت الزيتون بفرع فاس' : 'e.g. Weekly replenishment'}
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            {transferError && (
              <div className="text-xs text-rose-600 font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{transferError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
              >
                {isAr ? 'تأكيد ونقل البضاعة' : 'Confirm Transfer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deletingBranch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
          onClick={() => setDeletingBranch(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {isAr ? 'حذف الفرع' : 'Delete Branch'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  {isAr
                    ? `هل أنت متأكد من حذف "${deletingBranch.name}"؟`
                    : `Are you sure you want to delete "${deletingBranch.name}"?`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingBranch(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteBranch(deletingBranch.id);
                  setDeletingBranch(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-xs"
              >
                {isAr ? 'تأكيد الحذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

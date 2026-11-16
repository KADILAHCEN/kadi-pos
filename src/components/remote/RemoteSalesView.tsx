import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  DeliveryZone,
  Order,
  RemoteOrder,
  RemoteOrderItem,
  RemoteOrderStatus
} from '../../types';
import {
  OFFICIAL_APP_URL,
  buildCatalogLink,
  buildCatalogShareWhatsAppUrl,
  buildOrderStatusWhatsAppUrl,
  buildQrImageUrl,
  openExternalLinkSafely,
  parseWhatsAppOrderMessage
} from '../../utils/remoteCatalog';
import { generateQRMatrix } from '../../utils/zatca';
import { PublicCatalogView } from './PublicCatalogView';
import { ReceiptModal } from '../pos/ReceiptModal';
import { playSound } from '../../utils/audio';
import {
  downloadAndSendInvoiceViaWhatsApp,
  generateAndDownloadRemoteFlyerPdf,
  generateAndDownloadRemoteFlyerPng,
  shareRemoteFlyerOnWhatsApp
} from '../../utils/pdfReport';
import {
  Send,
  Link2,
  Share2,
  Copy,
  Check,
  Eye,
  Plus,
  Trash2,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  FileText,
  Edit3,
  QrCode,
  ShoppingBag,
  X,
  Wand2,
  Download,
  Newspaper,
  Image as ImageIcon,
  Loader2,
  ExternalLink
} from 'lucide-react';

type RemoteTab = 'orders' | 'catalog' | 'flyer' | 'zones';

export const RemoteSalesView: React.FC = () => {
  const {
    products,
    categories,
    orders,
    deliveryZones,
    addDeliveryZone,
    updateDeliveryZone,
    deleteDeliveryZone,
    remoteOrders,
    createRemoteOrder,
    acceptRemoteOrderToInvoice,
    updateRemoteOrderStatus,
    markRemoteOrderDeliveredAndCollected,
    deleteRemoteOrder,
    currentUser,
    settings,
    updateSettings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const [activeTab, setActiveTab] = useState<RemoteTab>('orders');
  const [statusFilter, setStatusFilter] = useState<'all' | RemoteOrderStatus>('all');
  const [courierModeToggle, setCourierModeToggle] = useState(false);
  const isCourierMode = currentUser.role === 'courier' || courierModeToggle;
  const [toastMsg, setToastMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Catalog link state
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedStatusText, setCopiedStatusText] = useState(false);
  const [copiedQrImage, setCopiedQrImage] = useState(false);
  const [qrMode, setQrMode] = useState<'app' | 'catalog'>('app');
  const [qrImgFailed, setQrImgFailed] = useState(false);
  const [showCatalogPreview, setShowCatalogPreview] = useState(false);
  const [waPhoneInput, setWaPhoneInput] = useState(settings.whatsappBusinessPhone || settings.phone || '');

  // Preview invoice modal after accepting remote order
  const [invoiceModalOrder, setInvoiceModalOrder] = useState<Order | null>(null);

  // Manual WhatsApp order entry modal
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [waPasteText, setWaPasteText] = useState('');
  const [waParseFeedback, setWaParseFeedback] = useState<string | null>(null);
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('');
  const [manualCustomerAddress, setManualCustomerAddress] = useState('');
  const [manualZoneId, setManualZoneId] = useState(deliveryZones[0]?.id || '');
  const [manualNotes, setManualNotes] = useState('');
  const [manualItemQtyMap, setManualItemQtyMap] = useState<Record<string, number>>({});
  const [manualProdSearch, setManualProdSearch] = useState('');

  // Delivery zones form state
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFee, setNewZoneFee] = useState('5');
  const [newZoneMinutes, setNewZoneMinutes] = useState('25');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [editZoneFee, setEditZoneFee] = useState('');

  // Promotional Newspaper / Flyer ("صحف للبيع عن بعد") state
  const [flyerTitle, setFlyerTitle] = useState(
    `صحيفة عروض ${settings.storeName || 'المتجر'} — اطلب عن بعد`
  );
  const [flyerSubtitle, setFlyerSubtitle] = useState(
    'اختر منتجاتك واطلب عبر واتساب مع التوصيل السريع حتى لباب الدار'
  );
  const [flyerSearch, setFlyerSearch] = useState('');
  const [selectedFlyerProductIds, setSelectedFlyerProductIds] = useState<string[]>(() =>
    products
      .filter((p) => (p.stock || 0) > 0)
      .slice(0, 9)
      .map((p) => p.id)
  );
  const [exportingFlyer, setExportingFlyer] = useState(false);

  const showToast = (text: string, ok: boolean = true) => {
    setToastMsg({ ok, text });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const catalogData = useMemo(() => {
    const res = buildCatalogLink(products, deliveryZones, settings, currencySymbol);
    return res;
  }, [products, deliveryZones, settings, currencySymbol]);

  const effectiveCatalogUrl = generatedUrl || catalogData.url;
  const storeAppUrl = (settings.publicAppUrl || OFFICIAL_APP_URL).trim();
  const activeQrTargetUrl = qrMode === 'app' ? storeAppUrl : effectiveCatalogUrl;
  const activeQrImageUrl = useMemo(() => buildQrImageUrl(activeQrTargetUrl, 300), [activeQrTargetUrl]);
  const catalogQrMatrix = useMemo(() => generateQRMatrix(activeQrTargetUrl, 25), [activeQrTargetUrl]);
  const sharePayload = useMemo(
    () =>
      buildCatalogShareWhatsAppUrl(
        effectiveCatalogUrl,
        settings.storeName || 'متجر كادي',
        deliveryZones,
        currencySymbol,
        catalogData.payload.products.length
      ),
    [effectiveCatalogUrl, settings.storeName, deliveryZones, currencySymbol, catalogData.payload.products.length]
  );

  const handleGenerateMyCatalog = () => {
    const res = buildCatalogLink(products, deliveryZones, settings, currencySymbol);
    setGeneratedUrl(res.url);
    setActiveTab('catalog');
    if (settings.enableSoundEffects) playSound('success');
    showToast(
      isAr
        ? `✅ تم توليد رابط كتالوجي بنجاح (${res.payload.products.length} منتج بالثمن والصور)`
        : `✅ Catalog link generated (${res.payload.products.length} items)`
    );
  };

  const handleCopyCatalogUrl = async () => {
    try {
      await navigator.clipboard.writeText(effectiveCatalogUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyWhatsAppStatusText = async () => {
    try {
      await navigator.clipboard.writeText(sharePayload.statusText);
      setCopiedStatusText(true);
      setTimeout(() => setCopiedStatusText(false), 2000);
      showToast(isAr ? 'تم نسخ نص الستاتوس الجاهز للنشر في واتساب' : 'Status text copied!');
    } catch {
      // ignore
    }
  };

  const counts = useMemo(() => {
    return {
      all: remoteOrders.length,
      new: remoteOrders.filter((r) => r.status === 'new').length,
      on_the_way: remoteOrders.filter((r) => r.status === 'on_the_way').length,
      delivered: remoteOrders.filter((r) => r.status === 'delivered').length,
      rejected: remoteOrders.filter((r) => r.status === 'rejected').length
    };
  }, [remoteOrders]);

  const activeDeliveries = useMemo(
    () => remoteOrders.filter((r) => r.status === 'new' || r.status === 'on_the_way'),
    [remoteOrders]
  );

  const courierTotalToCollect = useMemo(
    () => activeDeliveries.reduce((sum, r) => sum + (r.grandTotal || 0), 0),
    [activeDeliveries]
  );

  const filteredOrders = useMemo(() => {
    const base = isCourierMode && statusFilter === 'all' ? activeDeliveries : remoteOrders;
    if (statusFilter === 'all') return base;
    return remoteOrders.filter((r) => r.status === statusFilter);
  }, [remoteOrders, statusFilter, isCourierMode, activeDeliveries]);

  const handleAcceptOrder = (ro: RemoteOrder) => {
    const res = acceptRemoteOrderToInvoice(ro.id, 'cash');
    if (res.success && res.order) {
      showToast(
        isAr
          ? `✅ تم قبول الطلب ${ro.orderNumber} وتحويله لفاتورة ${res.order.orderNumber} مع التوصيل (+${ro.deliveryFee.toFixed(2)} ${currencySymbol})`
          : `✅ Converted ${ro.orderNumber} to Invoice ${res.order.orderNumber}`
      );
      setInvoiceModalOrder(res.order);
    } else {
      showToast(res.message || (isAr ? 'تعذر تحويل الطلب' : 'Failed to convert'), false);
    }
  };

  const handleStatusChange = (ro: RemoteOrder, nextStatus: RemoteOrderStatus, notifyWa: boolean = false) => {
    updateRemoteOrderStatus(ro.id, nextStatus);
    if (notifyWa) {
      const { url } = buildOrderStatusWhatsAppUrl(
        ro,
        nextStatus,
        settings.storeName || 'متجر كادي',
        currencySymbol
      );
      openExternalLinkSafely(url);
    }
    const label =
      nextStatus === 'on_the_way'
        ? isAr ? 'في الطريق' : 'On the way'
        : nextStatus === 'delivered'
        ? isAr ? 'تم التوصيل' : 'Delivered'
        : nextStatus === 'rejected'
        ? isAr ? 'مرفوض' : 'Rejected'
        : isAr ? 'جديد' : 'New';
    showToast(isAr ? `تم تحديث حالة الطلب ${ro.orderNumber} إلى: ${label}` : `Updated ${ro.orderNumber} → ${label}`);
  };

  const handleSendWaStatusMessage = (ro: RemoteOrder, targetStatus: RemoteOrderStatus) => {
    const { url } = buildOrderStatusWhatsAppUrl(
      ro,
      targetStatus,
      settings.storeName || 'متجر كادي',
      currencySymbol
    );
    openExternalLinkSafely(url);
  };

  const handleCreateManualOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const zone =
      deliveryZones.find((z) => z.id === manualZoneId) ||
      deliveryZones[0] || { id: 'zone-douar', name: 'الدوار (فابور)', fee: 0, active: true };

    const items: RemoteOrderItem[] = Object.entries(manualItemQtyMap)
      .filter(([, q]) => q > 0)
      .map(([pid, qty]): RemoteOrderItem | null => {
        const prod = products.find((p) => p.id === pid);
        if (!prod) return null;
        return {
          productId: prod.id,
          productName: prod.name,
          price: prod.price,
          costPrice: prod.costPrice,
          quantity: qty,
          total: Number((prod.price * qty).toFixed(2)),
          image: prod.image
        };
      })
      .filter((x): x is RemoteOrderItem => x !== null);

    if (items.length === 0) {
      showToast(isAr ? 'اختر منتجاً واحداً على الأقل' : 'Pick at least one item', false);
      return;
    }

    const subtotal = Number(items.reduce((s, it) => s + it.total, 0).toFixed(2));
    const deliveryFee = Number(zone.fee || 0);
    const grandTotal = Number((subtotal + deliveryFee).toFixed(2));

    const created = createRemoteOrder({
      customerName: manualCustomerName.trim() || (isAr ? 'زبون واتساب' : 'WhatsApp Customer'),
      customerPhone: manualCustomerPhone.trim() || '-',
      customerAddress: manualCustomerAddress.trim() || undefined,
      deliveryZoneId: zone.id,
      deliveryZoneName: zone.name,
      deliveryFee,
      items,
      itemsSubtotal: subtotal,
      grandTotal,
      notes: manualNotes.trim() || undefined,
      source: 'whatsapp_manual'
    });

    setShowManualOrderModal(false);
    setWaPasteText('');
    setWaParseFeedback(null);
    setManualCustomerName('');
    setManualCustomerPhone('');
    setManualCustomerAddress('');
    setManualNotes('');
    setManualItemQtyMap({});
    setActiveTab('orders');
    setStatusFilter('new');
    showToast(isAr ? `✅ تم تسجيل طلب واتساب جديد: ${created.orderNumber}` : `Created ${created.orderNumber}`);
  };

  const handleAutoParseWhatsAppText = () => {
    if (!waPasteText.trim()) return;
    const parsed = parseWhatsAppOrderMessage(waPasteText, products, deliveryZones);
    if (parsed.customerName) setManualCustomerName(parsed.customerName);
    if (parsed.customerPhone) setManualCustomerPhone(parsed.customerPhone);
    if (parsed.customerAddress) setManualCustomerAddress(parsed.customerAddress);
    if (parsed.notes) setManualNotes(parsed.notes);
    if (parsed.zoneId) setManualZoneId(parsed.zoneId);
    if (parsed.matchedCount > 0) {
      setManualItemQtyMap(parsed.matchedItems);
    }
    if (settings.enableSoundEffects) playSound('success');
    setWaParseFeedback(
      isAr
        ? `✅ تم التعرف على ${parsed.matchedCount} منتج(ات)${parsed.customerName ? ` للزبون "${parsed.customerName}"` : ''}${parsed.zoneId ? ' وتحديد منطقة التوصيل تلقائياً' : ''}.`
        : `✅ Parsed ${parsed.matchedCount} item(s)${parsed.customerName ? ` for ${parsed.customerName}` : ''}.`
    );
  };

  const handleAddZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    addDeliveryZone({
      name: newZoneName.trim(),
      fee: Math.max(0, parseFloat(newZoneFee) || 0),
      active: true,
      estimatedMinutes: Math.max(5, parseInt(newZoneMinutes, 10) || 20)
    });
    setNewZoneName('');
    setNewZoneFee('5');
    setNewZoneMinutes('25');
    showToast(isAr ? '✅ تمت إضافة منطقة التوصيل' : 'Delivery zone added');
  };

  const saveEditZone = (zone: DeliveryZone) => {
    updateDeliveryZone(zone.id, {
      name: editZoneName.trim() || zone.name,
      fee: Math.max(0, parseFloat(editZoneFee) || 0)
    });
    setEditingZoneId(null);
    showToast(isAr ? 'تم تحديث منطقة التوصيل' : 'Zone updated');
  };

  const manualFilteredProducts = useMemo(() => {
    const q = manualProdSearch.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 24);
  }, [products, manualProdSearch]);

  const statusBadge = (st: RemoteOrderStatus) => {
    switch (st) {
      case 'new':
        return (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            {isAr ? 'جديد' : 'New'}
          </span>
        );
      case 'on_the_way':
        return (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            {isAr ? 'في الطريق' : 'On the way'}
          </span>
        );
      case 'delivered':
        return (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            {isAr ? 'تم التوصيل' : 'Delivered'}
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            {isAr ? 'مرفوض' : 'Rejected'}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 space-y-5">
      {/* Header & Top "كتالوجي" Quick Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-600" />
            <span>{isAr ? 'البيع عن بعد وطلبات واتساب' : 'Remote Sales & WhatsApp Orders'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'رابط كتالوجي بالثمن والصور، استقبال طلبات واتساب، قبول وتحويل لفاتورة، ومناطق التوصيل'
              : 'Shareable product catalog, incoming WhatsApp orders, invoice conversion & delivery zones'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateMyCatalog}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-sm transition-colors"
          >
            <Link2 className="w-4 h-4" />
            <span>{isAr ? 'كتالوجي (توليد ومشاركة الرابط)' : 'My Catalog Link'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('flyer')}
            className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Newspaper className="w-4 h-4" />
            <span>{isAr ? 'صحيفة العروض PDF/صورة' : 'Catalog Flyer'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCatalogPreview(true)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
          >
            <Eye className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'صفحة البيع عن بعد (كزبون)' : 'Customer Page'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCourierModeToggle((prev) => !prev)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors border ${
              isCourierMode
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800 hover:bg-violet-50'
            }`}
            title={isAr ? 'وضع الموزّع لمتابعة التوصيلات وتحصيل المبالغ' : 'Courier Delivery Mode'}
          >
            <Truck className="w-4 h-4" />
            <span>{isAr ? (isCourierMode ? 'وضع الموزّع مفعّل' : 'وضع الموزّع (Livreur)') : 'Courier Mode'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManualOrderModal(true)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>{isAr ? 'تسجيل طلب واتساب' : 'Add WhatsApp Order'}</span>
          </button>
        </div>
      </div>

      {isCourierMode && (
        <div className="p-4 rounded-2xl bg-violet-600 text-white flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black">
                {isAr
                  ? `وضع الموزّع (Livreur) — ${currentUser.name}`
                  : `Courier Delivery Mode — ${currentUser.name}`}
              </div>
              <div className="text-xs text-violet-100">
                {isAr
                  ? `${activeDeliveries.length} طلبات جاهزة أو في الطريق للتوصيل`
                  : `${activeDeliveries.length} active deliveries`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-end">
              <div className="text-[11px] text-violet-100">
                {isAr ? 'المبلغ الواجب تحصيله عند التسليم' : 'Cash on Delivery Total'}
              </div>
              <div className="text-xl font-black font-mono tabular-nums">
                {courierTotalToCollect.toFixed(2)} {currencySymbol}
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-bold border ${
            toastMsg.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}
        >
          {toastMsg.text}
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-2xs">
          <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center justify-between">
            <span>{isAr ? 'طلبات جديدة' : 'New Orders'}</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
            {counts.new}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isAr ? 'تنتظر القبول أو الرفض' : 'Awaiting accept/reject'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 shadow-2xs">
          <div className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center justify-between">
            <span>{isAr ? 'في الطريق' : 'On The Way'}</span>
            <Truck className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
            {counts.on_the_way}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isAr ? 'تم إشعار الزبائن عبر واتساب' : 'Dispatched for delivery'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-2xs">
          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span>{isAr ? 'تم التوصيل' : 'Delivered'}</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
            {counts.delivered}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isAr ? 'مكتملة ومُفوترة' : 'Completed & invoiced'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span>{isAr ? 'مناطق التوصيل' : 'Delivery Zones'}</span>
            <MapPin className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
            {deliveryZones.filter((z) => z.active).length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {isAr ? 'مفعلة في الكتالوج والفواتير' : 'Active in catalog & orders'}
          </div>
        </div>
      </div>

      {/* Section Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'orders'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>{isAr ? 'طلبات جديدة والتتبع' : 'Orders Inbox'}</span>
          {counts.new > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 font-mono">
              {counts.new}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'catalog'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Share2 className="w-4 h-4" />
          <span>{isAr ? 'كتالوجي ومشاركة واتساب' : 'Catalog & WhatsApp Share'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('flyer')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'flyer'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Newspaper className="w-4 h-4" />
          <span>{isAr ? 'صحيفة العروض للبيع عن بعد' : 'Promotional Flyer'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('zones')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'zones'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>{isAr ? 'مناطق التوصيل' : 'Delivery Zones'}</span>
        </button>
      </div>

      {/* TAB 1: ORDERS INBOX */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: isAr ? `الكل (${counts.all})` : `All (${counts.all})` },
                { id: 'new', label: isAr ? `طلبات جديدة (${counts.new})` : `New (${counts.new})` },
                { id: 'on_the_way', label: isAr ? `في الطريق (${counts.on_the_way})` : `On the way (${counts.on_the_way})` },
                { id: 'delivered', label: isAr ? `تم التوصيل (${counts.delivered})` : `Delivered (${counts.delivered})` },
                { id: 'rejected', label: isAr ? `مرفوض (${counts.rejected})` : `Rejected (${counts.rejected})` }
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === f.id
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-transparent'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {isAr ? 'لا توجد طلبات عن بعد في هذا التصنيف حالياً' : 'No remote orders in this filter'}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCatalogPreview(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  {isAr ? 'جرّب طلب زبون من الكتالوج' : 'Try Customer Catalog Order'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualOrderModal(true)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  {isAr ? '+ تسجيل طلب واتساب يدوياً' : '+ Log WhatsApp Order'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredOrders.map((ro) => {
                const linkedOrder = ro.linkedOrderId
                  ? orders.find((o) => o.id === ro.linkedOrderId)
                  : undefined;

                return (
                  <div
                    key={ro.id}
                    className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between gap-4"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                            {ro.orderNumber}
                          </span>
                          {statusBadge(ro.status)}
                          {ro.linkedOrderNumber && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {isAr ? `فاتورة ${ro.linkedOrderNumber}` : `Inv ${ro.linkedOrderNumber}`}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 font-mono">
                          {new Date(ro.createdAt).toLocaleString(isAr ? 'ar-MA' : 'fr-FR')}
                        </div>
                      </div>

                      <div className="text-end">
                        <div className="text-[11px] text-slate-500">{isAr ? 'المجموع مع التوصيل' : 'Total incl. delivery'}</div>
                        <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                          {ro.grandTotal.toFixed(2)} {currencySymbol}
                        </div>
                      </div>
                    </div>

                    {/* Customer & Zone Strip */}
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <div className="font-extrabold text-slate-900 dark:text-white">{ro.customerName}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-mono">
                          <Phone className="w-3 h-3" />
                          <span>{ro.customerPhone}</span>
                          {ro.customerPhone && ro.customerPhone !== '-' && (
                            <a
                              href={`tel:${ro.customerPhone.replace(/\s+/g, '')}`}
                              className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-sans font-bold hover:underline"
                            >
                              {isAr ? 'اتصال' : 'Call'}
                            </a>
                          )}
                        </div>
                        {ro.customerAddress && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>{ro.customerAddress}</span>
                          </div>
                        )}
                      </div>

                      <div className="sm:text-end space-y-1">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold text-[11px]">
                          <Truck className="w-3.5 h-3.5" />
                          <span>{ro.deliveryZoneName}</span>
                          <span className="font-mono">
                            ({ro.deliveryFee === 0 ? (isAr ? 'فابور' : 'Free') : `+${ro.deliveryFee.toFixed(2)} ${currencySymbol}`})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {isAr ? 'السلع:' : 'Items:'} {ro.itemsSubtotal.toFixed(2)} {currencySymbol}
                        </div>
                      </div>
                    </div>

                    {/* Items list */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {ro.items.map((it, idx) => (
                        <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {it.productName}
                            <span className="text-slate-400 font-mono ms-1.5">×{it.quantity}</span>
                          </div>
                          <div className="font-mono font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                            {it.total.toFixed(2)} {currencySymbol}
                          </div>
                        </div>
                      ))}
                    </div>

                    {ro.notes && (
                      <div className="text-[11px] text-slate-500 italic px-1">
                        {isAr ? `ملاحظة: ${ro.notes}` : `Note: ${ro.notes}`}
                      </div>
                    )}

                    {/* Action Controls */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ro.status === 'new' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAcceptOrder(ro)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isAr ? 'قبول وتحويل لفاتورة' : 'Accept → Invoice'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(ro, 'rejected')}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isAr ? 'رفض' : 'Reject'}</span>
                            </button>
                          </>
                        )}

                        {ro.status !== 'rejected' && (
                          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
                            {(
                              [
                                { id: 'new', label: isAr ? 'جديد' : 'New' },
                                { id: 'on_the_way', label: isAr ? 'في الطريق' : 'On Way' },
                                { id: 'delivered', label: isAr ? 'تم التوصيل' : 'Delivered' }
                              ] as const
                            ).map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => handleStatusChange(ro, st.id)}
                                className={`px-2.5 py-1 rounded-lg transition-colors ${
                                  ro.status === st.id
                                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                                    : 'text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white'
                                }`}
                              >
                                {st.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {(ro.status === 'new' || ro.status === 'on_the_way') && (
                          <button
                            type="button"
                            onClick={() => {
                              markRemoteOrderDeliveredAndCollected(ro.id, currentUser.name);
                              if (settings.enableSoundEffects) playSound('success');
                              showToast(
                                isAr
                                  ? `✅ تم تأكيد التوصيل وتحصيل ${ro.grandTotal.toFixed(2)} ${currencySymbol} (${ro.orderNumber})`
                                  : `✅ Delivered & collected ${ro.grandTotal.toFixed(2)} ${currencySymbol}`
                              );
                            }}
                            className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-black flex items-center gap-1.5 shadow-2xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isAr ? 'تم التوصيل وتحصيل المبلغ ✓' : 'Delivered & Collected ✓'}</span>
                          </button>
                        )}

                        {ro.status === 'delivered' && ro.collectedOnDelivery && (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                            {isAr
                              ? `تم التحصيل (${ro.assignedCourierName || currentUser.name}) ✓`
                              : `Collected (${ro.assignedCourierName || currentUser.name}) ✓`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleSendWaStatusMessage(
                              ro,
                              ro.status === 'delivered'
                                ? 'delivered'
                                : ro.status === 'rejected'
                                ? 'rejected'
                                : 'on_the_way'
                            )
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold flex items-center gap-1"
                          title={isAr ? 'إرسال رسالة واتساب للزبون: الطلب ديالك في الطريق' : 'Notify customer via WhatsApp'}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>
                            {ro.status === 'delivered'
                              ? (isAr ? 'واتساب: تم التوصيل' : 'WA Delivered')
                              : (isAr ? 'واتساب: في الطريق' : 'WA On the way')}
                          </span>
                        </button>

                        {linkedOrder && (
                          <>
                            <button
                              type="button"
                              onClick={() => setInvoiceModalOrder(linkedOrder)}
                              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-[11px] font-bold flex items-center gap-1"
                            >
                              <FileText className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{isAr ? 'الفاتورة / PDF' : 'Invoice'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await downloadAndSendInvoiceViaWhatsApp({
                                    order: linkedOrder,
                                    settings,
                                    currencySymbol,
                                    language,
                                    customerPhoneOverride: ro.customerPhone
                                  });
                                  if (settings.enableSoundEffects) playSound('success');
                                  showToast(
                                    res.mode === 'native_file_share'
                                      ? isAr
                                        ? `✅ تم تحميل ومشاركة PDF (${res.filename})`
                                        : `✅ Shared PDF (${res.filename})`
                                      : isAr
                                      ? `✅ تم تحميل PDF (${res.filename}) وفتح واتساب الزبون — أرفق الملف واضغط إرسال`
                                      : `✅ PDF downloaded (${res.filename}) & WhatsApp opened`
                                  );
                                } catch {
                                  if (settings.enableSoundEffects) playSound('error');
                                  showToast(
                                    isAr ? 'تعذر تجهيز PDF للفاتورة' : 'Failed to export invoice PDF',
                                    false
                                  );
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1"
                              title={isAr ? 'تنزيل الفاتورة PDF وإرسالها في واتساب للزبون' : 'Download PDF & Send via WhatsApp'}
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{isAr ? 'PDF + واتساب' : 'PDF + WA'}</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => deleteRemoteOrder(ro.id)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title={isAr ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CATALOG LINK & WHATSAPP / STATUS SHARING */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-emerald-600" />
                  <span>{isAr ? 'رابط كتالوجي الإلكتروني بالثمن والصور' : 'My Shareable Store Catalog Link'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? `يتضمن ${catalogData.payload.products.length} منتجاً متوفراً مع الصور والأثمان ومناطق التوصيل.`
                    : `Includes ${catalogData.payload.products.length} in-stock products with prices, images, and delivery zones.`}
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateMyCatalog}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <QrCode className="w-4 h-4" />
                <span>{isAr ? 'تحديث الرابط الآن' : 'Refresh Catalog Link'}</span>
              </button>
            </div>

            {/* Merchant WhatsApp Receiving Phone */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-green-600" />
                <span>{isAr ? 'رقم الواتساب الذي يستقبل طلبات الزبائن:' : 'WhatsApp Number for Incoming Orders:'}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  value={waPhoneInput}
                  onChange={(e) => setWaPhoneInput(e.target.value)}
                  placeholder="06XXXXXXXX / +2126XXXXXXXX"
                  className="flex-1 px-3.5 py-2 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => {
                    updateSettings({ whatsappBusinessPhone: waPhoneInput.trim() });
                    showToast(isAr ? '✅ تم حفظ رقم واتساب المتجر' : 'WhatsApp phone saved');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold"
                >
                  {isAr ? 'حفظ' : 'Save'}
                </button>
              </div>
            </div>

            {/* Shareable Link Box */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                {isAr ? 'رابط الكتالوج الجاهز للمشاركة:' : 'Generated Catalog URL:'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={effectiveCatalogUrl}
                  dir="ltr"
                  className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={handleCopyCatalogUrl}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}</span>
                </button>
              </div>
            </div>

            {/* Share Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => openExternalLinkSafely(sharePayload.url)}
                className="py-3 px-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{isAr ? 'مشاركة في واتساب' : 'Share on WhatsApp'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleCopyWhatsAppStatusText();
                  openExternalLinkSafely(sharePayload.url);
                }}
                className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs"
              >
                <Share2 className="w-4 h-4" />
                <span>{isAr ? 'نشر في ستاتوس واتساب' : 'Share to WA Status'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCatalogPreview(true)}
                className="py-3 px-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'معاينة كزبون' : 'Open Storefront'}</span>
              </button>
            </div>

            {/* WhatsApp Status Message Preview */}
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-900 dark:text-emerald-300">
                  {isAr ? 'نص رسالة واتساب / الستاتوس الجاهز:' : 'Ready WhatsApp / Status Caption:'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyWhatsAppStatusText}
                  className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1"
                >
                  {copiedStatusText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isAr ? 'نسخ النص' : 'Copy Text'}</span>
                </button>
              </div>
              <pre className="text-xs font-sans whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                {sharePayload.statusText}
              </pre>
            </div>
          </div>

          {/* QR Code Card */}
          <div className="lg:col-span-5 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center space-y-4 shadow-xs">
            <div className="w-full flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'رمز QR المتجر الحقيقي' : 'Scannable Store QR'}</span>
              </div>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setQrMode('app');
                    setQrImgFailed(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    qrMode === 'app'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'التطبيق المباشر' : 'Store App'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQrMode('catalog');
                    setQrImgFailed(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    qrMode === 'catalog'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'رابط الكتالوج' : 'Catalog Link'}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              {!qrImgFailed ? (
                <img
                  src={activeQrImageUrl}
                  alt={isAr ? 'رمز QR متجر كادي بوس' : 'Kadi POS Store QR Code'}
                  width={192}
                  height={192}
                  onError={() => setQrImgFailed(true)}
                  className="w-48 h-48 object-contain rounded-lg"
                />
              ) : (
                <svg
                  viewBox={`0 0 ${catalogQrMatrix.length} ${catalogQrMatrix.length}`}
                  className="w-48 h-48"
                  shapeRendering="crispEdges"
                >
                  {catalogQrMatrix.map((row, rIdx) =>
                    row.map((cell, cIdx) =>
                      cell ? (
                        <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width="1" height="1" fill="#0f172a" />
                      ) : null
                    )
                  )}
                </svg>
              )}
            </div>

            <div
              dir="ltr"
              className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate"
            >
              {activeQrTargetUrl}
            </div>

            <div className="w-full grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeQrImageUrl);
                    setCopiedQrImage(true);
                    setTimeout(() => setCopiedQrImage(false), 2000);
                  } catch {
                    // ignore
                  }
                }}
                className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                {copiedQrImage ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedQrImage ? (isAr ? 'تم نسخ QR' : 'QR Copied') : (isAr ? 'نسخ رابط QR' : 'Copy QR URL')}</span>
              </button>
              <button
                type="button"
                onClick={() => openExternalLinkSafely(activeQrImageUrl)}
                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{isAr ? 'فتح / تحميل QR' : 'Open QR'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              {isAr
                ? 'يمكن للزبون مسح هذا الرمز بكاميرا الهاتف لفتح التطبيق أو كتالوج متجرك مباشرة.'
                : 'Customers can scan this QR code with their phone camera to open your store directly.'}
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: DELIVERY ZONES MANAGER */}
      {activeTab === 'zones' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Add New Zone Form */}
          <form
            onSubmit={handleAddZone}
            className="lg:col-span-4 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs"
          >
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'إضافة منطقة توصيل جديدة' : 'Add Delivery Zone'}</span>
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'اسم المنطقة *' : 'Zone Name *'}
              </label>
              <input
                type="text"
                required
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder={isAr ? 'مثال: الحي الصناعي' : 'e.g. Downtown'}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? `ثمن التوصيل (${currencySymbol})` : `Fee (${currencySymbol})`}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={newZoneFee}
                  onChange={(e) => setNewZoneFee(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'المدة (دقيقة)' : 'ETA (min)'}
                </label>
                <input
                  type="number"
                  min="5"
                  value={newZoneMinutes}
                  onChange={(e) => setNewZoneMinutes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة المنطقة' : 'Save Zone'}</span>
            </button>
          </form>

          {/* Zones Table */}
          <div className="lg:col-span-8 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr ? 'مناطق التوصيل المفعلة وتكلفة الشحن' : 'Configured Delivery Zones & Pricing'}
              </h3>
              <span className="text-[11px] text-slate-500">
                {isAr ? 'يُضاف الثمن تلقائياً للفاتورة عند الطلب' : 'Automatically added to invoices'}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {deliveryZones.map((zone) => {
                const isEditing = editingZoneId === zone.id;
                return (
                  <div
                    key={zone.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editZoneName}
                          onChange={(e) => setEditZoneName(e.target.value)}
                          className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                        />
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editZoneFee}
                          onChange={(e) => setEditZoneFee(e.target.value)}
                          className="w-24 px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                        />
                        <button
                          type="button"
                          onClick={() => saveEditZone(zone)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                        >
                          {isAr ? 'حفظ' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingZoneId(null)}
                          className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs"
                        >
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                            <Truck className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{zone.name}</span>
                              {!zone.active && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-500">
                                  {isAr ? 'معطلة' : 'Paused'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                              {zone.fee === 0
                                ? isAr
                                  ? 'التوصيل فابور (0.00)'
                                  : 'Free Delivery (0.00)'
                                : `${zone.fee.toFixed(2)} ${currencySymbol}`}
                              {zone.estimatedMinutes ? ` · ~${zone.estimatedMinutes} min` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateDeliveryZone(zone.id, { active: !zone.active })}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                              zone.active
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                                : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                            }`}
                          >
                            {zone.active ? (isAr ? 'مفعلة' : 'Active') : (isAr ? 'موقفة' : 'Inactive')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingZoneId(zone.id);
                              setEditZoneName(zone.name);
                              setEditZoneFee(String(zone.fee));
                            }}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {deliveryZones.length > 1 && (
                            <button
                              type="button"
                              onClick={() => deleteDeliveryZone(zone.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title={isAr ? 'حذف' : 'Delete'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PROMOTIONAL NEWSPAPER / FLYER FOR REMOTE SALES ("صحيفة العروض للبيع عن بعد") */}
      {activeTab === 'flyer' && (() => {
        const availableProducts = products.filter((p) => (p.stock || 0) > 0);
        const flyerProducts = availableProducts.filter((p) =>
          selectedFlyerProductIds.includes(p.id)
        );
        const effectiveFlyerProducts = (flyerProducts.length > 0 ? flyerProducts : availableProducts.slice(0, 9)).slice(0, 18);

        const flyerPayloadItems = effectiveFlyerProducts.map((p) => {
          const cat = categories.find((c) => c.id === p.categoryId);
          return {
            id: p.id,
            name: p.name,
            price: p.price,
            unitType: p.unitType,
            categoryName: cat?.name || (isAr ? 'عرض متوفر' : 'Featured'),
            color: p.color || '#059669'
          };
        });

        const flyerInput = {
          title: flyerTitle,
          subtitle: flyerSubtitle,
          products: flyerPayloadItems,
          zones: deliveryZones,
          catalogUrl: effectiveCatalogUrl,
          qrMatrix: catalogQrMatrix,
          whatsappPhone: waPhoneInput || settings.whatsappBusinessPhone || settings.phone || '',
          settings,
          currencySymbol,
          language
        };

        const filteredPicker = availableProducts
          .filter(
            (p) =>
              !flyerSearch.trim() ||
              p.name.toLowerCase().includes(flyerSearch.trim().toLowerCase())
          )
          .slice(0, 40);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Controls: Headline, Product Selection, Export PDF / PNG / WhatsApp */}
            <div className="lg:col-span-5 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-amber-500" />
                  <span>{isAr ? 'إعداد صحيفة العروض للبيع عن بعد' : 'Promotional Catalog Flyer'}</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr
                    ? 'أنشئ نشرة عروض مصوّرة بأثمان المنتجات ومناطق التوصيل ورمز QR وحمّلها كملف PDF أو صورة للستاتوس والواتساب.'
                    : 'Build a printable A4 catalog newspaper/flyer with prices, zones & QR code.'}
                </p>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'عنوان الصحيفة الرئيسي:' : 'Flyer Headline:'}
                  </label>
                  <input
                    type="text"
                    value={flyerTitle}
                    onChange={(e) => setFlyerTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'النص الترويجي:' : 'Promo Subtitle:'}
                  </label>
                  <input
                    type="text"
                    value={flyerSubtitle}
                    onChange={(e) => setFlyerSubtitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              {/* Export & Share Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={exportingFlyer}
                  onClick={() => {
                    try {
                      const res = generateAndDownloadRemoteFlyerPdf(flyerInput);
                      if (settings.enableSoundEffects) playSound('success');
                      showToast(
                        isAr ? `📄 تم تحميل صحيفة العروض PDF: ${res.filename}` : `Downloaded ${res.filename}`
                      );
                    } catch {
                      if (settings.enableSoundEffects) playSound('error');
                      showToast(isAr ? 'تعذر إنشاء ملف PDF' : 'PDF export failed', false);
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>{isAr ? 'تحميل الصحيفة PDF' : 'Save Flyer PDF'}</span>
                </button>

                <button
                  type="button"
                  disabled={exportingFlyer}
                  onClick={async () => {
                    setExportingFlyer(true);
                    try {
                      const res = await generateAndDownloadRemoteFlyerPng(flyerInput);
                      if (settings.enableSoundEffects) playSound('success');
                      showToast(
                        isAr ? `🖼️ تم حفظ صورة الصحيفة للستاتوس: ${res.filename}` : `Saved ${res.filename}`
                      );
                    } catch {
                      if (settings.enableSoundEffects) playSound('error');
                      showToast(isAr ? 'تعذر حفظ الصورة' : 'PNG export failed', false);
                    } finally {
                      setExportingFlyer(false);
                    }
                  }}
                  className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center justify-center gap-1.5"
                >
                  {exportingFlyer ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  <span>{isAr ? 'صورة للستاتوس PNG' : 'Save Image PNG'}</span>
                </button>

                <button
                  type="button"
                  disabled={exportingFlyer}
                  onClick={async () => {
                    setExportingFlyer(true);
                    try {
                      const res = await shareRemoteFlyerOnWhatsApp(flyerInput);
                      if (settings.enableSoundEffects) playSound('success');
                      showToast(
                        res.mode === 'native_file_share'
                          ? isAr
                            ? `✅ تمت مشاركة الصحيفة (${res.filename})`
                            : `Shared ${res.filename}`
                          : isAr
                          ? `✅ تم حفظ صورة الصحيفة (${res.filename}) وفتح واتساب لإرسالها مع رابط الطلب`
                          : `Saved ${res.filename} & opened WhatsApp`
                      );
                    } catch {
                      if (settings.enableSoundEffects) playSound('error');
                      showToast(isAr ? 'تعذر مشاركة الصحيفة' : 'Share failed', false);
                    } finally {
                      setExportingFlyer(false);
                    }
                  }}
                  className="sm:col-span-2 py-2.5 px-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{isAr ? 'تحميل صورة الصحيفة + إرسال في واتساب' : 'Download Flyer & Share on WhatsApp'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCatalogPreview(true)}
                  className="sm:col-span-2 py-2.5 px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-4 h-4" />
                  <span>{isAr ? 'فتح صفحة البيع عن بعد التفاعلية (للزبون)' : 'Open Interactive Storefront Page'}</span>
                </button>
              </div>

              {/* Product Selector Checklist (up to 18 items) */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">
                    {isAr
                      ? `المنتجات المعروضة بالصحيفة (${effectiveFlyerProducts.length}/18)`
                      : `Featured Items (${effectiveFlyerProducts.length}/18)`}
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedFlyerProductIds(availableProducts.slice(0, 12).map((p) => p.id))
                      }
                      className="font-bold text-emerald-600 hover:underline"
                    >
                      {isAr ? 'أول 12 منتج' : 'Top 12'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFlyerProductIds([])}
                      className="font-bold text-slate-400 hover:text-rose-500"
                    >
                      {isAr ? 'مسح' : 'Clear'}
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={flyerSearch}
                  onChange={(e) => setFlyerSearch(e.target.value)}
                  placeholder={isAr ? 'ابحث عن منتج لإضافته للصحيفة...' : 'Search product...'}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />

                <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPicker.map((p) => {
                    const checked = selectedFlyerProductIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedFlyerProductIds((prev) =>
                                prev.includes(p.id)
                                  ? prev.filter((id) => id !== p.id)
                                  : prev.length >= 18
                                  ? prev
                                  : [...prev, p.id]
                              )
                            }
                            className="w-4 h-4 rounded text-emerald-600"
                          />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {p.name}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-emerald-600 shrink-0">
                          {p.price.toFixed(2)} {currencySymbol}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Live Promotional Newspaper / Flyer Sheet Preview */}
            <div className="lg:col-span-7 bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Newspaper Masthead */}
              <div className="bg-emerald-950 text-white p-5 sm:p-6 border-b-4 border-emerald-400 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black mb-1.5">
                    {isAr ? '📰 نشرة وعروض البيع عن بعد' : '📰 REMOTE CATALOG FLYER'}
                  </div>
                  <h4 className="text-xl font-black tracking-tight">{flyerTitle}</h4>
                  <p className="text-xs text-emerald-100 mt-1">{flyerSubtitle}</p>
                </div>
                <div className="text-end space-y-0.5">
                  <div className="text-sm font-black text-emerald-300">{settings.storeName}</div>
                  {waPhoneInput && (
                    <div className="text-xs font-mono text-white flex items-center justify-end gap-1">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{waPhoneInput}</span>
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-emerald-200/80">
                    {new Date().toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR')}
                  </div>
                </div>
              </div>

              {/* 3-Column Promotional Product Grid */}
              <div className="p-5 bg-slate-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {effectiveFlyerProducts.map((p) => {
                    const cat = categories.find((c) => c.id === p.categoryId);
                    return (
                      <div
                        key={p.id}
                        className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col justify-between"
                      >
                        <div>
                          <div
                            className="px-3 py-1.5 text-[10px] font-black text-white flex items-center justify-between"
                            style={{ backgroundColor: p.color || '#059669' }}
                          >
                            <span className="truncate">{cat?.name || (isAr ? 'عرض متوفر' : 'Available')}</span>
                            <span className="font-mono opacity-90">{p.unitType}</span>
                          </div>
                          {p.image ? (
                            <div className="h-24 w-full bg-slate-100 overflow-hidden">
                              <img
                                src={p.image}
                                alt={p.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : null}
                          <div className="p-3">
                            <div className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-2">
                              {p.name}
                            </div>
                          </div>
                        </div>

                        <div className="px-3 pb-3">
                          <div className="py-1.5 px-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center font-mono font-black text-base text-emerald-700 tabular-nums">
                            {p.price.toFixed(2)} {currencySymbol}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Zones + QR Code Callout */}
              <div className="bg-slate-900 text-white p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-[220px]">
                  <div className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                    <Truck className="w-4 h-4" />
                    <span>{isAr ? 'مناطق التوصيل المتاحة:' : 'Delivery Zones:'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {deliveryZones
                      .filter((z) => z.active)
                      .map((z) => (
                        <span
                          key={z.id}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-100"
                        >
                          {z.name}:{' '}
                          <span className="text-emerald-400 font-mono">
                            {z.fee === 0 ? (isAr ? 'فابور' : 'Free') : `${z.fee} ${currencySymbol}`}
                          </span>
                        </span>
                      ))}
                  </div>
                  <p className="text-[11px] text-emerald-200">
                    {isAr
                      ? '📱 امسح رمز QR لفتح صفحة البيع عن بعد واختيار المنتجات وإرسال الطلب واتساب مباشرة.'
                      : '📱 Scan QR code to open storefront and order via WhatsApp.'}
                  </p>
                </div>

                <div className="p-2 rounded-2xl bg-white shrink-0">
                  <svg
                    viewBox={`0 0 ${catalogQrMatrix.length} ${catalogQrMatrix.length}`}
                    className="w-24 h-24"
                    shapeRendering="crispEdges"
                  >
                    {catalogQrMatrix.map((row, rIdx) =>
                      row.map((cell, cIdx) =>
                        cell ? (
                          <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width="1" height="1" fill="#0f172a" />
                        ) : null
                      )
                    )}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fullscreen Customer Storefront Preview Modal */}
      {showCatalogPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
          <PublicCatalogView
            isPreview
            onClosePreview={() => setShowCatalogPreview(false)}
            onOrderCreated={(num) => {
              showToast(isAr ? `📥 وصل طلب جديد #${num} إلى طلبات جديدة!` : `New Order #${num} received!`);
              setActiveTab('orders');
              setStatusFilter('new');
            }}
          />
        </div>
      )}

      {/* Manual WhatsApp Order Entry Modal */}
      {showManualOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form
            onSubmit={handleCreateManualOrder}
            className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-600" />
                <span>{isAr ? 'تسجيل طلب وارد من واتساب' : 'Log Incoming WhatsApp Order'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowManualOrderModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Auto-parse pasted WhatsApp order message */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isAr ? 'لصق رسالة طلب واتساب (تفكيك تلقائي)' : 'Paste WhatsApp Order Message (Auto-Parse)'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoParseWhatsAppText}
                    disabled={!waPasteText.trim()}
                    className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-black transition-colors"
                  >
                    {isAr ? 'تحليل وتعبئة تلقائية' : 'Auto-Fill Order'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={waPasteText}
                  onChange={(e) => setWaPasteText(e.target.value)}
                  placeholder={
                    isAr
                      ? 'ألصق هنا رسالة الطلب التي أرسلها الزبون في واتساب لاستخراج الاسم، الهاتف، المنطقة، والمنتجات تلقائياً...'
                      : 'Paste the incoming WhatsApp order message here to auto-fill customer, zone & items...'
                  }
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-xl focus:outline-hidden focus:border-emerald-500"
                />
                {waParseFeedback && (
                  <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    {waParseFeedback}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'اسم الزبون *' : 'Customer Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={manualCustomerName}
                    onChange={(e) => setManualCustomerName(e.target.value)}
                    placeholder={isAr ? 'مثال: سعاد التازي' : 'Customer Name'}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'رقم الهاتف *' : 'Phone *'}
                  </label>
                  <input
                    type="tel"
                    required
                    value={manualCustomerPhone}
                    onChange={(e) => setManualCustomerPhone(e.target.value)}
                    placeholder="06XXXXXXXX"
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'منطقة التوصيل *' : 'Delivery Zone *'}
                  </label>
                  <select
                    value={manualZoneId}
                    onChange={(e) => setManualZoneId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {deliveryZones.filter((z) => z.active).map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} ({z.fee === 0 ? (isAr ? 'فابور' : 'Free') : `+${z.fee} ${currencySymbol}`})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={manualCustomerAddress}
                  onChange={(e) => setManualCustomerAddress(e.target.value)}
                  placeholder={isAr ? 'العنوان بالتفصيل (اختياري)...' : 'Delivery Address...'}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder={isAr ? 'ملاحظات الطلب...' : 'Notes...'}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              {/* Pick Products */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    {isAr ? 'اختر السلع المطلوبة:' : 'Select Ordered Items:'}
                  </label>
                  <input
                    type="text"
                    value={manualProdSearch}
                    onChange={(e) => setManualProdSearch(e.target.value)}
                    placeholder={isAr ? 'بحث...' : 'Search...'}
                    className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
                  {manualFilteredProducts.map((p) => {
                    const q = manualItemQtyMap[p.id] || 0;
                    return (
                      <div key={p.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                          <div className="text-[11px] font-mono text-emerald-600">{p.price.toFixed(2)} {currencySymbol}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setManualItemQtyMap((prev) => ({
                                ...prev,
                                [p.id]: Math.max(0, (prev[p.id] || 0) - 1)
                              }))
                            }
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-mono font-bold tabular-nums">{q}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setManualItemQtyMap((prev) => ({
                                ...prev,
                                [p.id]: (prev[p.id] || 0) + 1
                              }))
                            }
                            className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowManualOrderModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
              >
                {isAr ? 'إدراج في طلبات جديدة' : 'Add to New Orders'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Detailed Invoice Modal after Accept */}
      {invoiceModalOrder && (
        <ReceiptModal
          order={invoiceModalOrder}
          initialViewMode="detailed"
          onClose={() => setInvoiceModalOrder(null)}
        />
      )}
    </div>
  );
};

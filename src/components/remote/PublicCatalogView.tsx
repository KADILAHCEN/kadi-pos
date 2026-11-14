import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  DeliveryZone,
  RemoteOrderItem
} from '../../types';
import {
  DEFAULT_DELIVERY_ZONES,
  PUBLIC_CATALOG_SNAPSHOT_KEY,
  REMOTE_ORDERS_CHANNEL,
  SharedCatalogPayload,
  buildCustomerWhatsAppOrderUrl,
  decodeCatalogFromHash,
  openExternalLinkSafely
} from '../../utils/remoteCatalog';
import { playSound } from '../../utils/audio';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  Truck,
  Send,
  CheckCircle2,
  MapPin,
  Phone,
  User,
  ArrowRight,
  Copy,
  Check,
  Store,
  Package
} from 'lucide-react';

interface PublicCatalogViewProps {
  isPreview?: boolean;
  onClosePreview?: () => void;
  onOrderCreated?: (orderNumber: string) => void;
}

export const PublicCatalogView: React.FC<PublicCatalogViewProps> = ({
  isPreview = false,
  onClosePreview,
  onOrderCreated
}) => {
  const {
    products: contextProducts,
    categories,
    deliveryZones: contextZones,
    settings,
    currencySymbol: ctxCurrency,
    language,
    createRemoteOrder
  } = usePos();

  const isAr = language === 'ar';

  // Decode hash payload (#cat=...) when opened via shared catalog link on any phone/browser
  const hashCatalog: SharedCatalogPayload | null = useMemo(() => {
    if (isPreview) return null;
    return decodeCatalogFromHash();
  }, [isPreview]);

  // Read localStorage snapshot as fallback
  const snapshot: SharedCatalogPayload | null = useMemo(() => {
    try {
      const raw = localStorage.getItem(PUBLIC_CATALOG_SNAPSHOT_KEY);
      return raw ? (JSON.parse(raw) as SharedCatalogPayload) : null;
    } catch {
      return null;
    }
  }, []);

  const externalPayload = hashCatalog || (!isPreview && contextProducts.length === 0 ? snapshot : null);

  const catalogProducts = useMemo(() => {
    if (externalPayload && externalPayload.products.length > 0) {
      return externalPayload.products;
    }
    if (contextProducts && contextProducts.length > 0) {
      return contextProducts.filter((p) => (p.stock || 0) > 0).slice(0, 80);
    }
    return snapshot?.products || [];
  }, [externalPayload, contextProducts, snapshot]);

  const activeZones: DeliveryZone[] = useMemo(() => {
    const src =
      externalPayload && externalPayload.zones.length > 0
        ? externalPayload.zones
        : contextZones && contextZones.length > 0
        ? contextZones
        : snapshot?.zones || DEFAULT_DELIVERY_ZONES;
    const filtered = src.filter((z) => z.active);
    return filtered.length > 0 ? filtered : DEFAULT_DELIVERY_ZONES;
  }, [externalPayload, contextZones, snapshot]);

  const storeName = externalPayload?.storeName || settings.storeName || snapshot?.storeName || 'متجر كادي';
  const currencySymbol = externalPayload?.currencySymbol || ctxCurrency || snapshot?.currencySymbol || 'د.م';
  const merchantWa =
    externalPayload?.whatsappPhone ||
    settings.whatsappBusinessPhone ||
    settings.phone ||
    snapshot?.whatsappPhone ||
    '';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('cat-all');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedZoneId, setSelectedZoneId] = useState<string>(activeZones[0]?.id || 'zone-douar');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedOrderNo, setSubmittedOrderNo] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const selectedZone = useMemo(
    () => activeZones.find((z) => z.id === selectedZoneId) || activeZones[0] || DEFAULT_DELIVERY_ZONES[0],
    [activeZones, selectedZoneId]
  );

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return catalogProducts.filter((p) => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q);
      const matchesCat =
        selectedCatId === 'cat-all' ||
        !('categoryId' in p) ||
        (p as { categoryId?: string }).categoryId === selectedCatId;
      return matchesSearch && matchesCat;
    });
  }, [catalogProducts, searchTerm, selectedCatId]);

  const cartItems: RemoteOrderItem[] = useMemo(() => {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const prod = catalogProducts.find((p) => p.id === productId);
        if (!prod) return null;
        return {
          productId: prod.id,
          productName: prod.name,
          price: prod.price,
          costPrice: prod.costPrice || 0,
          quantity: qty,
          total: Number((prod.price * qty).toFixed(2)),
          image: prod.image
        } as RemoteOrderItem;
      })
      .filter((it): it is RemoteOrderItem => it !== null);
  }, [quantities, catalogProducts]);

  const itemsSubtotal = useMemo(
    () => Number(cartItems.reduce((s, it) => s + it.total, 0).toFixed(2)),
    [cartItems]
  );
  const deliveryFee = Number(selectedZone?.fee || 0);
  const grandTotal = Number((itemsSubtotal + deliveryFee).toFixed(2));
  const totalItemsCount = useMemo(
    () => cartItems.reduce((s, it) => s + it.quantity, 0),
    [cartItems]
  );

  const changeQty = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, Number(((prev[productId] || 0) + delta).toFixed(2)));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
    if (settings.enableSoundEffects) playSound('click');
  };

  const handleSubmitWhatsAppOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (cartItems.length === 0) {
      setErrorMsg(isAr ? 'المرجو اختيار منتج واحد على الأقل من الكتالوج.' : 'Please select at least one product.');
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg(isAr ? 'المرجو إدخال اسم الزبون الكامل.' : 'Please enter your name.');
      return;
    }

    const created = createRemoteOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || 'غير مسجل',
      customerAddress: customerAddress.trim() || undefined,
      deliveryZoneId: selectedZone.id,
      deliveryZoneName: selectedZone.name,
      deliveryFee,
      items: cartItems,
      itemsSubtotal,
      grandTotal,
      notes: notes.trim() || undefined,
      source: isPreview ? 'storefront' : 'catalog_link'
    });

    // Notify any open merchant POS tabs immediately via BroadcastChannel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(REMOTE_ORDERS_CHANNEL);
        bc.postMessage({ type: 'NEW_REMOTE_ORDER', order: created });
        bc.close();
      }
    } catch {
      // ignore BroadcastChannel errors
    }

    const { url } = buildCustomerWhatsAppOrderUrl(merchantWa, {
      storeName,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      zone: selectedZone,
      items: cartItems,
      itemsSubtotal,
      grandTotal,
      currencySymbol,
      notes: notes.trim()
    });

    openExternalLinkSafely(url);
    setSubmittedOrderNo(created.orderNumber);
    setQuantities({});
    onOrderCreated?.(created.orderNumber);
  };

  const handleCopyOrderSummary = async () => {
    if (cartItems.length === 0) return;
    const { message } = buildCustomerWhatsAppOrderUrl(merchantWa, {
      storeName,
      customerName: customerName.trim() || (isAr ? 'زبون' : 'Customer'),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      zone: selectedZone,
      items: cartItems,
      itemsSubtotal,
      grandTotal,
      currencySymbol,
      notes: notes.trim()
    });
    try {
      await navigator.clipboard.writeText(message);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const exitCatalogToPos = () => {
    if (onClosePreview) {
      onClosePreview();
      return;
    }
    if (typeof window !== 'undefined') {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, '', cleanUrl);
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Storefront Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                {storeName}
              </h1>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {isAr ? 'كتالوج الطلب المباشر عبر واتساب' : 'Direct WhatsApp Storefront'}
                </span>
                {merchantWa && (
                  <span className="font-mono tabular-nums">· {merchantWa}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 font-mono tabular-nums">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              <span>{totalItemsCount} {isAr ? 'منتج' : 'items'}</span>
              <span>·</span>
              <span>{grandTotal.toFixed(2)} {currencySymbol}</span>
            </div>

            <button
              type="button"
              onClick={exitCatalogToPos}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{isPreview ? (isAr ? 'إغلاق المعاينة' : 'Close Preview') : (isAr ? 'دخول التاجر / POS' : 'Merchant POS')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Submitted Confirmation Banner */}
      {submittedOrderNo && (
        <div className="bg-emerald-600 text-white px-4 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>
                {isAr
                  ? `تم إرسال طلبك بنجاح! رقم الطلب: ${submittedOrderNo} — وصل إلى "طلبات جديدة" في المتجر.`
                  : `Order ${submittedOrderNo} sent & registered in New Orders!`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSubmittedOrderNo(null)}
              className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px]"
            >
              {isAr ? 'إخفاء' : 'Dismiss'}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Products Catalog (7/12) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search + Categories */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isAr ? 'ابحث عن منتج بالاسم...' : 'Search products...'}
                className="w-full ps-10 pe-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {categories.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCatId(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                      selectedCatId === cat.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isAr ? cat.name : cat.nameEn || cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Grid */}
          {filteredProducts.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
              <Package className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-500">
                {isAr ? 'لا توجد منتجات مطابقة للبحث حالياً' : 'No matching products available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {filteredProducts.map((prod) => {
                const qty = quantities[prod.id] || 0;
                return (
                  <div
                    key={prod.id}
                    className={`rounded-2xl bg-white dark:bg-slate-900 border overflow-hidden flex flex-col justify-between transition-all shadow-2xs ${
                      qty > 0
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    {/* Product Image */}
                    <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 relative overflow-hidden flex items-center justify-center">
                      {prod.image ? (
                        <img
                          src={prod.image}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                      )}
                      {qty > 0 && (
                        <span className="absolute top-2 end-2 px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-xs font-black font-mono tabular-nums shadow">
                          ×{qty}
                        </span>
                      )}
                    </div>

                    {/* Product Info & Action */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                      <div>
                        <h3 className="text-xs font-extrabold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                          {prod.name}
                        </h3>
                        <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono tabular-nums">
                          {prod.price.toFixed(2)} <span className="text-[11px] font-bold">{currencySymbol}</span>
                        </div>
                      </div>

                      {qty === 0 ? (
                        <button
                          type="button"
                          onClick={() => changeQty(prod.id, 1)}
                          className="w-full py-2 rounded-xl bg-slate-900 hover:bg-emerald-600 dark:bg-slate-800 dark:hover:bg-emerald-600 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isAr ? 'أضف للطلب' : 'Add'}</span>
                        </button>
                      ) : (
                        <div className="flex items-center justify-between gap-1 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => changeQty(prod.id, -1)}
                            className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          >
                            {qty <= 1 ? <Trash2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                          </button>
                          <span className="font-mono font-black text-xs text-emerald-800 dark:text-emerald-300 tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQty(prod.id, 1)}
                            className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart & Delivery Checkout Sidebar (5/12) */}
        <form
          onSubmit={handleSubmitWhatsAppOrder}
          className="lg:col-span-5 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 lg:sticky lg:top-24"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'سلة طلبك وإرسال واتساب' : 'Your Order & WhatsApp Checkout'}</span>
            </h2>
            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={() => setQuantities({})}
                className="text-[11px] font-bold text-rose-600 hover:underline"
              >
                {isAr ? 'إفراغ السلة' : 'Clear'}
              </button>
            )}
          </div>

          {/* Selected Cart Items */}
          {cartItems.length === 0 ? (
            <div className="py-6 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-500">
              {isAr
                ? 'اختر المنتجات من الكتالوج لتظهر هنا ويُحسب المجموع تلقائياً.'
                : 'Select items from the catalog to build your order.'}
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800">
              {cartItems.map((it) => (
                <div key={it.productId} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{it.productName}</div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {it.quantity} × {it.price.toFixed(2)} {currencySymbol}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {it.total.toFixed(2)} {currencySymbol}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQty(it.productId, -it.quantity)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Delivery Zone Selection */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'اختر منطقة التوصيل:' : 'Delivery Zone:'}</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2">
              {activeZones.map((zone) => {
                const isSelected = selectedZone?.id === zone.id;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setSelectedZoneId(zone.id)}
                    className={`p-2.5 rounded-xl border text-start flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white">{zone.name}</div>
                      {zone.estimatedMinutes !== undefined && (
                        <div className="text-[10px] text-slate-500">
                          {isAr ? `حوالي ${zone.estimatedMinutes} دقيقة` : `~${zone.estimatedMinutes} min`}
                        </div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-black font-mono tabular-nums ${
                        zone.fee === 0
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                      }`}
                    >
                      {zone.fee === 0 ? (isAr ? 'فابور (0)' : 'Free') : `+${zone.fee.toFixed(2)} ${currencySymbol}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer Info Inputs */}
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                <User className="w-3.5 h-3.5" />
                <span>{isAr ? 'الاسم الكامل *' : 'Full Name *'}</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={isAr ? 'مثال: كريم بنعلي' : 'Customer Name'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{isAr ? 'رقم الهاتف / واتساب' : 'Phone / WhatsApp'}</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="06XXXXXXXX"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{isAr ? 'العنوان / الحي / الدوار' : 'Address'}</span>
                </label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder={isAr ? 'رقم الدار أو الحي...' : 'Street / Neighborhood'}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAr ? 'ملاحظة إضافية للطلب (اختياري)...' : 'Optional delivery note...'}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
          </div>

          {/* Totals Box */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? 'مجموع المنتجات:' : 'Items Subtotal:'}</span>
              <span className="font-mono font-bold tabular-nums">{itemsSubtotal.toFixed(2)} {currencySymbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? `التوصيل (${selectedZone?.name || ''}):` : 'Delivery Fee:'}</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                {deliveryFee === 0 ? (isAr ? 'فابور (0.00)' : 'Free') : `+${deliveryFee.toFixed(2)} ${currencySymbol}`}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-black">
              <span>{isAr ? 'المجموع النهائي:' : 'Grand Total:'}</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 text-base tabular-nums">
                {grandTotal.toFixed(2)} {currencySymbol}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{isAr ? 'إرسال الطلب واتساب تلقائياً' : 'Send Order via WhatsApp'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyOrderSummary}
              disabled={cartItems.length === 0}
              className="py-3 px-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
              title={isAr ? 'نسخ نص الطلب' : 'Copy order message'}
            >
              {copiedMsg ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

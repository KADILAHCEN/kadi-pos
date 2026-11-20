import React, { useState, useEffect, useRef } from 'react';
import { Product, UnitType } from '../../types';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import {
  Pencil,
  X,
  Check,
  Tag,
  Barcode,
  Layers,
  Sparkles,
  Camera,
  Upload,
  Image as ImageIcon,
  Scale,
  DollarSign,
  Calendar,
  AlertTriangle,
  Smartphone,
  Search,
  Loader2,
  Globe
} from 'lucide-react';
import { playSound } from '../../utils/audio';
import { compressImageFile } from '../../utils/imageUtils';
import { ProductCameraModal } from './ProductCameraModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { lookupProductByBarcode } from '../../utils/openFoodFacts';
import { bluetoothScanner } from '../../utils/bluetoothScanner';

interface EditProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  product,
  isOpen,
  onClose
}) => {
  const { products, categories, updateProduct, currencySymbol, language, settings, isOnline } = usePos();
  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const sampleImages = [
    { label: isAr ? 'زيت زيتون ومائدة' : 'Huile d’Olive & Table', url: '/src/assets/images/grocery_olive_oil_1794130799863.jpg' },
    { label: isAr ? 'شاي وسكر ومشروبات' : 'Thé, Sucre & Boissons', url: '/src/assets/images/grocery_moroccan_tea_1794130814562.jpg' },
    { label: isAr ? 'كسكس ودقيق وبقوليات' : 'Couscous & Farine', url: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg' },
    { label: isAr ? 'حليب وجبن أحمر' : 'Lait & Fromage Rouge', url: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg' },
    { label: isAr ? 'سردين معلب وهريسة' : 'Sardines & Harissa', url: '/src/assets/images/grocery_canned_sardines_1794130855776.jpg' }
  ];

  const paletteColors = ['#059669', '#2563EB', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0D9488', '#475569'];

  // Form Fields
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [categoryId, setCategoryId] = useState('');
  const [unitType, setUnitType] = useState<UnitType>('piece');
  const [stock, setStock] = useState<number>(0);
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [image, setImage] = useState<string>('');
  const [color, setColor] = useState<string>('#059669');
  const [repType, setRepType] = useState<'image' | 'color'>('image');

  // Camera, Lookup & File Upload
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [barcodeLookupNote, setBarcodeLookupNote] = useState<{
    type: 'searching' | 'found' | 'not_found' | 'offline';
    text: string;
    imageUrl?: string;
  } | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setNameEn(product.nameEn || '');
      setPrice(product.price || 0);
      setCostPrice(product.costPrice || 0);
      setCategoryId(product.categoryId || categories[0]?.id || 'cat-all');
      setUnitType(product.unitType || 'piece');
      setStock(product.stock || 0);
      setBarcode(product.barcode || '');
      setSku(product.sku || '');
      setExpiryDate(product.expiryDate || '');
      setImage(product.image || '');
      setColor(product.color || '#059669');
      setRepType(product.image ? 'image' : 'color');
      setIsProcessingImage(false);
      setIsLookingUpBarcode(false);
      setBarcodeLookupNote(null);
    }
  }, [product, categories]);

  const handleLookupBarcode = async (targetCode?: string, forceFillName = false) => {
    if (isLookingUpBarcode) return;
    const code = (targetCode ?? barcode).trim();
    if (!code) {
      setBarcodeLookupNote({
        type: 'not_found',
        text: isAr ? 'كتب الباركود أولا' : 'Enter a barcode first'
      });
      return;
    }

    setIsLookingUpBarcode(true);
    setBarcodeLookupNote({
      type: 'searching',
      text: isAr ? 'كنقلب على المنتوج...' : 'Searching OpenFoodFacts...'
    });

    const res = await lookupProductByBarcode(code);
    setIsLookingUpBarcode(false);

    if (res.offline) {
      setBarcodeLookupNote({
        type: 'offline',
        text: isAr ? 'ما كاينش أنترنت — كتب البيانات يدوي' : 'Offline — enter details manually'
      });
      return;
    }

    if (res.found) {
      if (forceFillName || !name.trim()) setName(res.name);
      if (forceFillName || !nameEn.trim()) setNameEn(res.nameEn || res.name);
      setBarcodeLookupNote({
        type: 'found',
        text: isAr ? `لقيتو: ${res.name}` : `Found: ${res.name}`,
        imageUrl: res.imageUrl || undefined
      });
      if (settings.enableSoundEffects) playSound('beep');
    } else {
      setBarcodeLookupNote({
        type: 'not_found',
        text: isAr ? 'ما لقيتوش، احتفظ بالاسم الحالي' : 'Not found — keep current name'
      });
    }
  };

  useEffect(() => {
    if (!isOpen || !product || showBarcodeScanner) {
      bluetoothScanner.popScope('edit_product_modal');
      return;
    }
    bluetoothScanner.pushScope('edit_product_modal');
    const unsubscribe = bluetoothScanner.onScan((payload) => {
      if (bluetoothScanner.getActiveScope() !== 'edit_product_modal') return;
      const clean = payload.barcode.trim();
      if (!clean) return;
      setBarcode(clean);
      setSku((prev) => prev || `SKU-${clean.slice(-4)}`);
      if (settings.bluetoothSoundFeedback !== false) playSound('beep');
      if (isOnline && clean.length >= 8) {
        void handleLookupBarcode(clean, !name.trim());
      }
    });
    return () => {
      unsubscribe();
      bluetoothScanner.popScope('edit_product_modal');
    };
  }, [isOpen, product, showBarcodeScanner, isOnline, settings.bluetoothSoundFeedback, name]);

  if (!isOpen || !product) return null;

  const duplicateOtherProduct = barcode.trim()
    ? products.find(
        (p) =>
          p.id !== product.id &&
          p.barcode &&
          p.barcode.trim().toLowerCase() === barcode.trim().toLowerCase()
      )
    : undefined;

  const handleCaptureFromCamera = (dataUrl: string) => {
    setImage(dataUrl);
    setRepType('image');
    playSound('beep');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      const dataUrl = await compressImageFile(file, 800, 800, 0.85);
      setImage(dataUrl);
      setRepType('image');
      playSound('beep');
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setImage(dataUrl);
          setRepType('image');
          playSound('beep');
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsProcessingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (duplicateOtherProduct) {
      playSound('error');
      return;
    }

    updateProduct(product.id, {
      name: name.trim(),
      nameEn: nameEn.trim() || name.trim(),
      price: Math.max(0, Number(price)),
      costPrice: Math.max(0, Number(costPrice)),
      categoryId,
      unitType,
      stock: Math.max(0, Number(stock)),
      barcode: barcode.trim(),
      sku: sku.trim(),
      image: repType === 'image' ? image : undefined,
      color: color,
      expiryDate: expiryDate ? expiryDate : undefined
    });

    playSound('success');
    onClose();
  };

  const profit = price - costPrice;
  const marginPercent = price > 0 ? ((profit / price) * 100).toFixed(1) : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-900 dark:text-white">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-2xs">
              <Pencil className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {isAr ? 'تعديل بيانات المنتج والمميزة والصورة' : 'Edit Product, Pricing & Photo'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'تحديث الاسم، ثمن البيع، الفئة، الوحدة والصورة' : 'Update name, price, category, unit and photo'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          {/* Section 1: Barcode & SKU (Top for Instant Scan / Lookup) */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border-2 border-emerald-200 dark:border-emerald-800/80 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Barcode className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'الكود بار (الباركود) ورمز SKU' : 'Barcode & SKU'}</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {isAr ? 'اسكاني بالبلوتوث أو الكاميرا لتحديث الباركود' : 'Scan via Bluetooth or Camera'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1 gap-1.5 flex-wrap">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {isAr ? 'الكود بار (الباركود)' : t.barcode}
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={isLookingUpBarcode}
                      onClick={() => void handleLookupBarcode(barcode, true)}
                      className="px-2 py-0.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
                    >
                      {isLookingUpBarcode ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Search className="w-3 h-3" />
                      )}
                      <span>{isAr ? 'قلب بالباركود' : 'Lookup'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBarcodeScanner(true)}
                      className="px-2 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
                      title={isAr ? 'قراءة الباركود بالكاميرا' : 'Scan barcode with camera'}
                    >
                      <Camera className="w-3 h-3 text-emerald-400" />
                      <span>{isAr ? 'مسح بالكاميرا' : 'Camera Scan'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const code = '628' + Math.floor(100000000 + Math.random() * 900000000).toString();
                        setBarcode(code);
                        if (!sku) setSku('SKU-' + code.slice(-4));
                        setBarcodeLookupNote(null);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold hover:bg-emerald-200 flex items-center gap-1 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{isAr ? 'توليد' : 'Generate'}</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  data-barcode-allow-input="true"
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value);
                    if (barcodeLookupNote) setBarcodeLookupNote(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && barcode.trim().length >= 6) {
                      e.preventDefault();
                      void handleLookupBarcode(barcode.trim(), false);
                    }
                  }}
                  placeholder={isAr ? 'اسكاني أو كتب الباركود...' : 'Scan or enter barcode...'}
                  className={`w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl font-mono text-sm font-bold text-slate-900 dark:text-white ${
                    duplicateOtherProduct
                      ? 'border-rose-500 ring-2 ring-rose-500/30'
                      : 'border-emerald-300 dark:border-emerald-700'
                  }`}
                />
                {barcodeLookupNote && (
                  <div className="mt-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{barcodeLookupNote.text}</span>
                    </div>
                    {barcodeLookupNote.imageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!barcodeLookupNote.imageUrl) return;
                          setImage(barcodeLookupNote.imageUrl);
                          setRepType('image');
                        }}
                        className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black shrink-0"
                      >
                        {isAr ? 'اعتماد الصورة' : 'Use Photo'}
                      </button>
                    )}
                  </div>
                )}
                {duplicateOtherProduct && (
                  <p className="mt-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                    {isAr
                      ? `⚠️ هذا الباركود مستعمل بالفعل لمنتوج "${duplicateOtherProduct.name}"`
                      : `⚠️ Barcode already used by "${duplicateOtherProduct.name}"`}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.sku}
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Names (الاسم) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'اسم المنتج' : 'Product Name'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم المنتج بالعربية *' : 'Name (Arabic) *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium text-sm focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الاسم بالفرنسية / الإنجليزية' : 'Name (French / English)'}
                </label>
                <input
                  type="text"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Pricing (الثمن والتكلفة) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'الثمن والأسعار' : 'Pricing & Margin'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ثمن البيع بالدرهم *' : 'Selling Price *'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-sm focus:border-emerald-500"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currencySymbol}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ثمن الشراء / التكلفة' : 'Cost Price'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={costPrice}
                    onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-sm focus:border-emerald-500"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between text-xs">
              <span className="text-emerald-900 dark:text-emerald-300 font-medium">
                {isAr ? 'هامش الربح لكل وحدة:' : 'Profit per unit:'}
              </span>
              <span className="font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">
                +{profit.toFixed(2)} {currencySymbol} ({marginPercent}%)
              </span>
            </div>
          </div>

          {/* Section 3: Feature / Unit & Category (المميزة والفئة) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'المميزة / الوحدة والفئة' : 'Feature / Unit & Category'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'المميزة / وحدة القياس *' : 'Unit Type *'}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'piece' as UnitType, label: isAr ? 'حبة / قطعة' : 'Piece' },
                    { id: 'kg' as UnitType, label: isAr ? 'كيلوغرام (وزن)' : 'Kg' },
                    { id: 'liter' as UnitType, label: isAr ? 'لتر (سائل)' : 'Liter' },
                    { id: 'box' as UnitType, label: isAr ? 'كرتون / صندوق' : 'Box' }
                  ].map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnitType(u.id)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                        unitType === u.id
                          ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الفئة / الصنف *' : 'Category *'}
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold"
                >
                  {categories
                    .filter((c) => c.id !== 'cat-all')
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {isAr ? cat.name : cat.nameEn}
                      </option>
                    ))}
                </select>

                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'الكمية في المخزون' : 'Current Stock'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Expiry Date (تاريخ انتهاء الصلاحية) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>{isAr ? 'تاريخ انتهاء الصلاحية (Date d’expiration)' : 'Expiration Date'}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {isAr ? 'تنبيه ذكي عند اقتراب الانتهاء' : 'Smart alerts before expiry'}
              </span>
            </div>

            <div className="space-y-2">
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:border-amber-500"
              />

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {[
                  { label: isAr ? '+ أسبوع' : '+ 1 Week', days: 7 },
                  { label: isAr ? '+ شهر' : '+ 1 Month', days: 30 },
                  { label: isAr ? '+ 3 أشهر' : '+ 3 Months', days: 90 },
                  { label: isAr ? '+ 6 أشهر' : '+ 6 Months', days: 180 },
                  { label: isAr ? '+ سنة' : '+ 1 Year', days: 365 },
                  { label: isAr ? '+ سنتين' : '+ 2 Years', days: 730 }
                ].map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + p.days);
                      setExpiryDate(d.toISOString().slice(0, 10));
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-500 hover:text-amber-600 transition-colors shadow-2xs"
                  >
                    {p.label}
                  </button>
                ))}
                {expiryDate && (
                  <button
                    type="button"
                    onClick={() => setExpiryDate('')}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    {isAr ? 'مسح التاريخ' : 'Clear Date'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Photo / Image (الصورة) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'صورة المنتج' : 'Product Photo'}</span>
              </div>
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setRepType('image')}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    repType === 'image' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'صورة' : 'Image'}
                </button>
                <button
                  type="button"
                  onClick={() => setRepType('color')}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    repType === 'color' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'لون وشكل' : 'Color'}
                </button>
              </div>
            </div>

            {repType === 'image' ? (
              <div className="space-y-3">
                {/* Active Photo Preview & Camera Buttons */}
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 border border-slate-300 dark:border-slate-700">
                    {image ? (
                      <img src={image} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Tag className="w-8 h-8" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCameraModal(true)}
                        className="py-2.5 px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-400 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                      >
                        <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{isAr ? 'كاميرا مباشرة' : 'Live Camera'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="py-2.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                        title={isAr ? 'كاميرا الهاتف السريعة' : 'Phone camera'}
                      >
                        <Smartphone className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'كاميرا الهاتف' : 'Phone Snap'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="py-2.5 px-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs"
                        title={isAr ? 'معرض صور الهاتف' : 'Photo gallery'}
                      >
                        <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{isAr ? 'معرض الصور' : 'Gallery'}</span>
                      </button>
                    </div>

                    {isProcessingImage && (
                      <div className="text-[10px] text-emerald-600 font-bold animate-pulse text-center">
                        {isAr ? 'جاري تحسين وضغط الصورة...' : 'Processing photo...'}
                      </div>
                    )}

                    <input
                      type="file"
                      ref={nativeCameraInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={galleryInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Moroccan Presets */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-2">
                    {isAr ? 'أو اختر من صور المواد الغذائية الجاهزة:' : 'Or choose preset photo:'}
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {sampleImages.map((img) => (
                      <button
                        key={img.url}
                        type="button"
                        onClick={() => setImage(img.url)}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all ${
                          image === img.url
                            ? 'border-emerald-600 ring-2 ring-emerald-500/30 scale-105'
                            : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                        {image === img.url && (
                          <div className="absolute inset-0 bg-emerald-600/30 flex items-center justify-center">
                            <Check className="w-5 h-5 text-white stroke-[3]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {paletteColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`h-10 rounded-xl flex items-center justify-center text-white transition-all ${
                      color === c ? 'ring-3 ring-emerald-400 shadow-md scale-105' : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    {color === c && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>
                ))}
              </div>
            )}
          </div>


          {/* Submit Footer */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm hover:shadow transition-all flex items-center gap-2 active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
            </button>
          </div>
        </form>

        {/* Camera Modal */}
        <ProductCameraModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          onCapture={handleCaptureFromCamera}
        />

        {/* Camera Barcode Scanner Modal */}
        {showBarcodeScanner && (
          <BarcodeScannerModal
            mode="field"
            title={isAr ? 'تحديث باركود المنتج بالكاميرا' : 'Scan Product Barcode'}
            onClose={() => setShowBarcodeScanner(false)}
            onScanned={(code) => {
              setBarcode(code);
              if (!sku) setSku('SKU-' + code.slice(-4));
              if (isOnline && code.trim().length >= 8) {
                void handleLookupBarcode(code, !name.trim());
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

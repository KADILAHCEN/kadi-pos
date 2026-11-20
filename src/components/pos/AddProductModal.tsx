import React, { useState, useMemo } from 'react';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { UnitType, Product, ProductVariant } from '../../types';
import {
  PackagePlus,
  X,
  Check,
  Tag,
  Barcode,
  Layers,
  Sparkles,
  TrendingUp,
  Image as ImageIcon,
  Palette,
  Plus,
  Trash2,
  Scale,
  ShieldAlert,
  Info,
  Camera,
  Upload,
  RefreshCw,
  Calendar,
  Loader2,
  Smartphone,
  Search,
  Globe
} from 'lucide-react';
import { playSound } from '../../utils/audio';
import { ProductCameraModal } from './ProductCameraModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { compressImageFile } from '../../utils/imageUtils';
import { lookupProductByBarcode } from '../../utils/openFoodFacts';
import { bluetoothScanner } from '../../utils/bluetoothScanner';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategoryId?: string;
  onAddedAndAddToCart?: (product: Product) => void;
  onProductAdded?: (product: Product) => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  defaultCategoryId,
  onAddedAndAddToCart,
  onProductAdded
}) => {
  const { products, categories, addCategory, addProduct, currencySymbol, language, settings, isOnline } = usePos();
  const t = getT(language);
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [barcodeErrorAlert, setBarcodeErrorAlert] = useState<string | null>(null);
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [barcodeLookupNote, setBarcodeLookupNote] = useState<{
    type: 'searching' | 'found' | 'not_found' | 'offline';
    text: string;
    imageUrl?: string;
  } | null>(null);

  // Loyverse Palette Colors
  const loyverseColors = [
    { name: 'Emerald', hex: '#10B981' },
    { name: 'Blue', hex: '#3B82F6' },
    { name: 'Indigo', hex: '#6366F1' },
    { name: 'Purple', hex: '#8B5CF6' },
    { name: 'Amber', hex: '#F59E0B' },
    { name: 'Rose', hex: '#F43F5E' },
    { name: 'Cyan', hex: '#06B6D4' },
    { name: 'Dark Slate', hex: '#334155' }
  ];

  // Commercial Real Images
  const sampleImages = [
    { label: isAr ? 'زيت زيتون ومائدة' : 'Huile d’Olive & Table', url: '/src/assets/images/grocery_olive_oil_1794130799863.jpg' },
    { label: isAr ? 'شاي وسكر ومشروبات' : 'Thé, Sucre & Boissons', url: '/src/assets/images/grocery_moroccan_tea_1794130814562.jpg' },
    { label: isAr ? 'كسكس ودقيق وبقوليات' : 'Couscous & Farine', url: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg' },
    { label: isAr ? 'حليب وجبن أحمر' : 'Lait & Fromage Rouge', url: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg' },
    { label: isAr ? 'سردين معلب وهريسة' : 'Sardines & Harissa', url: '/src/assets/images/grocery_canned_sardines_1794130855776.jpg' }
  ];

  // Loyverse Form State
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [categoryId, setCategoryId] = useState(
    defaultCategoryId && defaultCategoryId !== 'cat-all'
      ? defaultCategoryId
      : categories.find((c) => c.id !== 'cat-all')?.id || categories[0]?.id || ''
  );

  // Loyverse "Sold by" (طريقة البيع: بالحبة / بالوزن)
  const [soldBy, setSoldBy] = useState<'each' | 'weight'>('each');
  const [unitType, setUnitType] = useState<UnitType>('piece');

  // Pricing & Cost
  const [price, setPrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);

  // Inventory Tracking
  const [trackStock, setTrackStock] = useState<boolean>(true);
  const [stockInput, setStockInput] = useState<string>('20');
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(5);
  const [expiryDate, setExpiryDate] = useState<string>('');

  // Representation on POS (صورة أو لون Loyverse)
  const [repType, setRepType] = useState<'image' | 'color'>('image');
  const [selectedImage, setSelectedImage] = useState<string>(sampleImages[0].url);
  const [selectedColor, setSelectedColor] = useState<string>(loyverseColors[0].hex);
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState<boolean>(false);
  const [customCapturedImage, setCustomCapturedImage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = React.useRef<HTMLInputElement>(null);

  // Reset form cleanly whenever modal is opened
  React.useEffect(() => {
    if (isOpen) {
      setName('');
      setNameEn('');
      setCategoryId(
        defaultCategoryId && defaultCategoryId !== 'cat-all'
          ? defaultCategoryId
          : categories.find((c) => c.id !== 'cat-all')?.id || categories[0]?.id || ''
      );
      setSoldBy('each');
      setUnitType('piece');
      setPrice(0);
      setCostPrice(0);
      setTrackStock(true);
      setStockInput('20');
      setLowStockThreshold(5);
      setExpiryDate('');
      setBarcode('');
      setSku('');
      setHasVariants(false);
      setBarcodeErrorAlert(null);
      setIsLookingUpBarcode(false);
      setBarcodeLookupNote(null);
      setCustomCapturedImage(null);
      setSelectedImage(sampleImages[0].url);
      setRepType('image');
    }
  }, [isOpen, defaultCategoryId]);

  // Capture Bluetooth/USB HID barcode scans directly inside AddProductModal
  React.useEffect(() => {
    if (!isOpen || showBarcodeScanner) {
      bluetoothScanner.popScope('add_product_modal');
      return;
    }

    bluetoothScanner.pushScope('add_product_modal');
    const unsubscribe = bluetoothScanner.onScan((payload) => {
      if (bluetoothScanner.getActiveScope() !== 'add_product_modal') return;
      const clean = payload.barcode.trim();
      if (!clean) return;

      setBarcode(clean);
      setSku((prev) => prev || `SKU-${clean.slice(-4)}`);
      setBarcodeErrorAlert(null);
      if (settings.bluetoothSoundFeedback !== false) {
        playSound('beep');
      }
      if (clean.length >= 6) {
        void handleLookupBarcode(clean, !name.trim());
      }
    });

    return () => {
      unsubscribe();
      bluetoothScanner.popScope('add_product_modal');
    };
  }, [isOpen, showBarcodeScanner, settings.bluetoothSoundFeedback, name]);

  const handleCaptureFromCamera = (dataUrl: string) => {
    setCustomCapturedImage(dataUrl);
    setSelectedImage(dataUrl);
    setRepType('image');
  };

  const handleFileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      const dataUrl = await compressImageFile(file, 300, 300, 0.6);
      setCustomCapturedImage(dataUrl);
      setSelectedImage(dataUrl);
      setRepType('image');
      playSound('beep');
    } catch (err) {
      console.error('Error compressing mobile image:', err);
      // Fallback
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setCustomCapturedImage(dataUrl);
          setSelectedImage(dataUrl);
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

  // Barcode & SKU
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');

  // Variants (Loyverse multi-size / flavor variants)
  const [hasVariants, setHasVariants] = useState<boolean>(false);
  const [variantsList, setVariantsList] = useState<Array<{ name: string; price: number; costPrice: number; stock: number; sku: string }>>([
    { name: isAr ? 'صغير (Small)' : 'Small', price: 20, costPrice: 8, stock: 25, sku: 'VAR-SM' },
    { name: isAr ? 'كبير (Large)' : 'Large', price: 28, costPrice: 11, stock: 25, sku: 'VAR-LG' }
  ]);

  // Inline Category Creator
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');

  // Cart option
  const [addToCartNow, setAddToCartNow] = useState(false);

  // Real-time duplicate barcode detection (MUST be called before any conditional return!)
  const duplicateProduct = useMemo(() => {
    if (!barcode.trim()) return null;
    const clean = barcode.trim().toLowerCase();
    return products.find((p) => p.barcode && p.barcode.trim().toLowerCase() === clean);
  }, [barcode, products]);

  if (!isOpen) return null;

  // Real-time Profit Margin
  const profit = price - costPrice;
  const marginPercent = price > 0 ? ((profit / price) * 100).toFixed(1) : '0';

  const generateBarcode = () => {
    const code = '628' + Math.floor(100000000 + Math.random() * 900000000).toString();
    setBarcode(code);
    if (!sku) {
      setSku('SKU-' + code.slice(-4));
    }
    setBarcodeLookupNote(null);
  };

  const handleLookupBarcode = async (targetCode?: string, forceFillName = true) => {
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
      text: isOnline
        ? isAr
          ? 'كنقلب في Open Food / Beauty / Products...'
          : 'Searching Open Food, Beauty & Products...'
        : isAr
        ? 'كنقلب في الذاكرة المحلية (أوفلاين)...'
        : 'Checking offline IndexedDB cache...'
    });

    const res = await lookupProductByBarcode(code);
    setIsLookingUpBarcode(false);

    if (res.found) {
      if (forceFillName || !name.trim()) {
        setName(res.name);
      }
      if (forceFillName || !nameEn.trim()) {
        setNameEn(res.nameEn || res.name);
      }
      const srcTag = res.fromCache
        ? isAr
          ? 'من الذاكرة أوفلاين'
          : 'Offline Cache'
        : res.sourceLabel || 'OpenFacts';
      setBarcodeLookupNote({
        type: 'found',
        text: isAr ? `لقيتو (${srcTag}): ${res.name}` : `Found (${srcTag}): ${res.name}`,
        imageUrl: res.imageUrl || undefined
      });
      if (settings.enableSoundEffects) playSound('beep');
      return;
    }

    if (res.offline) {
      setBarcodeLookupNote({
        type: 'offline',
        text: isAr ? 'ما كاينش أنترنت ومامسجلش — كتب الاسم يدوي' : 'Offline & not cached — enter name manually'
      });
      return;
    }

    setBarcodeLookupNote({
      type: 'not_found',
      text: res.error
        ? isAr
          ? 'تعذر الاتصال، كتب الاسم يدوي'
          : 'Lookup failed — enter name manually'
        : isAr
        ? 'ما لقيتوش فـ 3 قواعد، كتب الاسم يدوي'
        : 'Not found in Food/Beauty/Products DBs'
    });
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const catName = newCatName.trim();
    const catEn = newCatNameEn.trim() || catName;
    const createdCat = addCategory({
      name: catName,
      nameEn: catEn,
      color: selectedColor,
      image: sampleImages[0].url
    });
    if (createdCat?.id) {
      setCategoryId(createdCat.id);
    }
    setNewCatName('');
    setNewCatNameEn('');
    setShowNewCatInput(false);
    if (settings.enableSoundEffects) playSound('click');
  };

  const addVariantRow = () => {
    setVariantsList((prev) => [
      ...prev,
      {
        name: isAr ? `متغير ${prev.length + 1}` : `Variant ${prev.length + 1}`,
        price: Number(price.toFixed(2)),
        costPrice: Number(costPrice.toFixed(2)),
        stock: 20,
        sku: `VAR-${Date.now().toString().slice(-4)}`
      }
    ]);
  };

  const removeVariantRow = (index: number) => {
    setVariantsList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateVariantRow = (index: number, field: string, val: any) => {
    setVariantsList((prev) =>
      prev.map((v, idx) => (idx === index ? { ...v, [field]: val } : v))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      playSound('error');
      setBarcodeErrorAlert(isAr ? '⚠️ يرجى إدخال اسم السلعة أولاً لحفظها' : 'Please enter item name first');
      return;
    }

    const finalBarcode = barcode.trim() || '628' + Math.floor(100000000 + Math.random() * 900000000).toString();

    // Prevent duplicate barcode with explicit warning alert
    const matchedDuplicate = products.find(
      (p) => p.barcode && p.barcode.trim().toLowerCase() === finalBarcode.toLowerCase()
    );
    if (matchedDuplicate) {
      playSound('error');
      setBarcodeErrorAlert(
        isAr
          ? `⚠️ تنبيه هام: هذا الباركود (${finalBarcode}) كاين من قبل ومسجل مسبقاً للمنتج: "${matchedDuplicate.name}"! لا يمكن إضافة منتج مكرر بنفس الباركود.`
          : `⚠️ Important Warning: Barcode (${finalBarcode}) already exists for product: "${matchedDuplicate.name}"!`
      );
      return;
    }

    const finalSku = sku.trim() || 'SKU-' + finalBarcode.slice(-4);
    const finalImage = repType === 'image' ? selectedImage : undefined;
    const finalColor = selectedColor;

    // Build ProductVariant array if hasVariants is true
    const parsedVariants: ProductVariant[] | undefined = hasVariants && variantsList.length > 0
      ? variantsList.map((v, i) => ({
          id: `var-${Date.now()}-${i}`,
          name: v.name,
          sku: v.sku || `SKU-${finalBarcode.slice(-4)}-${i + 1}`,
          price: Number(v.price) || price,
          costPrice: Number(v.costPrice) || costPrice,
          stock: Number(v.stock) || 0
        }))
      : undefined;

    const parsedSingleStock = parseFloat(stockInput.replace(',', '.'));
    const safeSingleStock =
      Number.isFinite(parsedSingleStock) && parsedSingleStock >= 0 ? parsedSingleStock : 0;

    const totalStock = hasVariants && parsedVariants
      ? parsedVariants.reduce((sum, v) => sum + v.stock, 0)
      : safeSingleStock;

    const finalCategoryId =
      categoryId && categoryId !== 'cat-all'
        ? categoryId
        : categories.find((c) => c.id !== 'cat-all')?.id || 'cat-oils-grains';

    const newProductData: Omit<Product, 'id'> = {
      name: name.trim(),
      nameEn: nameEn.trim() || name.trim(),
      sku: finalSku,
      barcode: finalBarcode,
      categoryId: finalCategoryId,
      price: Math.max(0, Number(price) || 0),
      costPrice: Math.max(0, Number(costPrice) || 0),
      stock: trackStock ? totalStock : 9999,
      lowStockThreshold: Math.max(1, Number(lowStockThreshold) || 5),
      unitType: soldBy === 'weight' ? (unitType === 'liter' ? 'liter' : 'kg') : (unitType === 'box' ? 'box' : 'piece'),
      image: finalImage,
      color: finalColor,
      hasVariants,
      variants: parsedVariants,
      expiryDate: expiryDate ? expiryDate : undefined
    };

    const res = addProduct(newProductData);
    if (!res.success) {
      playSound('error');
      setBarcodeErrorAlert(res.message || 'حدث خطأ في إضافة السلعة');
      return;
    }

    if (settings.enableSoundEffects) playSound('success');

    const createdItem: Product = res.product || {
      ...newProductData,
      id: `prod-${Date.now()}`
    };

    // Notify parent to switch view/category and display success toast
    onProductAdded?.(createdItem);

    // Add to cart if checked
    if (addToCartNow && onAddedAndAddToCart) {
      onAddedAndAddToCart(createdItem);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh]">
        {/* Loyverse Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  {isAr ? 'إضافة سلعة جديدة' : 'Add New Item'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {isAr ? 'المخزون والبيع' : 'POS & Inventory'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? 'إضافة بطاقة سلعة متكاملة بالثمن والمخزون والصورة والباركود' : 'Add comprehensive item with pricing, inventory and photo'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* Prominent Duplicate Barcode Alert Banner */}
          {barcodeErrorAlert && (
            <div className="p-4 rounded-2xl bg-rose-500/15 border-2 border-rose-500 text-rose-950 dark:text-rose-200 text-xs font-bold flex items-start justify-between gap-3 shadow-md animate-bounce">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-black text-rose-700 dark:text-rose-300">
                    ⚠️ تنبيه هام: الباركود مكرر ومسجل من قبل!
                  </div>
                  <div className="text-xs font-semibold mt-1 leading-relaxed">
                    {barcodeErrorAlert}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBarcodeErrorAlert(null)}
                className="p-1 hover:bg-rose-200/50 dark:hover:bg-rose-900/50 rounded-lg text-rose-700 dark:text-rose-300 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Section 1: Barcode & SKU (Placed First for Instant Scan / Lookup) */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border-2 border-emerald-200 dark:border-emerald-800/80 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Barcode className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'الكود بار (الباركود) ورمز SKU' : 'Barcode & SKU'}</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {isAr ? 'اسكاني بالبلوتوث أو الكاميرا أو ولّد باركود تلقائي' : 'Scan via Bluetooth, Camera, or Generate'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {isAr ? 'الكود بار (الباركود)' : t.barcode}
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={isLookingUpBarcode}
                      onClick={() => void handleLookupBarcode()}
                      className="px-2 py-0.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
                      title={isAr ? 'جلب اسم المنتوج بالباركود من OpenFoodFacts' : 'Lookup product name from OpenFoodFacts'}
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
                      onClick={generateBarcode}
                      className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900 flex items-center gap-1 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{isAr ? 'توليد تلقائي' : 'Generate'}</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  data-barcode-allow-input="true"
                  value={barcode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBarcode(val);
                    if (!sku && val.trim().length >= 4) {
                      setSku('SKU-' + val.trim().slice(-4));
                    }
                    if (barcodeErrorAlert) setBarcodeErrorAlert(null);
                    if (barcodeLookupNote) setBarcodeLookupNote(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && barcode.trim().length >= 6) {
                      e.preventDefault();
                      void handleLookupBarcode(barcode.trim(), !name.trim());
                    }
                  }}
                  placeholder={isAr ? 'مثال: 6111035000430 (أو اسكاني دابا)' : 'e.g. 628100000000'}
                  className={`w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl font-mono text-sm font-bold text-slate-900 dark:text-white transition-colors ${
                    duplicateProduct
                      ? 'border-rose-500 ring-2 ring-rose-500/30'
                      : 'border-emerald-300 dark:border-emerald-700 focus:border-emerald-500 focus:outline-hidden'
                  }`}
                />
                {barcodeLookupNote && (
                  <div
                    className={`mt-2 px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center justify-between gap-2 ${
                      barcodeLookupNote.type === 'found'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                        : barcodeLookupNote.type === 'searching'
                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {barcodeLookupNote.imageUrl ? (
                        <img
                          src={barcodeLookupNote.imageUrl}
                          alt={name || barcode}
                          className="w-7 h-7 rounded-lg object-cover border border-emerald-300 shrink-0 bg-white"
                        />
                      ) : barcodeLookupNote.type === 'searching' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{barcodeLookupNote.text}</span>
                    </div>
                    {barcodeLookupNote.imageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!barcodeLookupNote.imageUrl) return;
                          setCustomCapturedImage(barcodeLookupNote.imageUrl);
                          setSelectedImage(barcodeLookupNote.imageUrl);
                          setRepType('image');
                        }}
                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black shrink-0"
                      >
                        {isAr ? 'استعمال الصورة' : 'Use Photo'}
                      </button>
                    )}
                  </div>
                )}
                {duplicateProduct && (
                  <div className="mt-2.5 p-3 rounded-xl bg-amber-500/15 border-2 border-amber-500 text-amber-950 dark:text-amber-200 text-xs font-bold shadow-sm flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-black text-amber-700 dark:text-amber-300">
                        ⚠️ تنبيه هام: هذا الباركود كاين من قبل!
                      </div>
                      <div className="text-[11px] font-semibold mt-0.5">
                        مسجل مسبقاً للمنتج: <span className="underline font-black text-slate-900 dark:text-white">"{duplicateProduct.name}"</span>
                      </div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        الثمن: {duplicateProduct.price.toFixed(2)} {currencySymbol} · المخزون: {duplicateProduct.stock} {duplicateProduct.unitType}
                      </div>
                      <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">
                        🚫 لا يمكن إضافة منتج مكرر بنفس الباركود. المرجو تغييره أو الضغط على "توليد تلقائي".
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.sku} ({isAr ? 'يتملأ تلقائياً' : 'Auto'})
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="SKU-COF-01"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Name and Category */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'البيانات الأساسية للصنف' : 'Item Identification'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم الصنف (بالعربية)' : 'Item Name (Arabic)'} *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? 'مثال: فلات وايت مختص' : 'e.g. Specialty Flat White'}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الاسم بالإنجليزية / الفرنسية' : 'Item Name (English / French)'}
                </label>
                <input
                  type="text"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Flat White Coffee"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Category Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t.category} *
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCatInput(!showNewCatInput)}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isAr ? '+ إنشاء فئة جديدة' : '+ Create Category'}</span>
                </button>
              </div>

              {showNewCatInput ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder={isAr ? 'اسم الفئة (عربي)...' : 'Category Name (AR)...'}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                    <input
                      type="text"
                      value={newCatNameEn}
                      onChange={(e) => setNewCatNameEn(e.target.value)}
                      placeholder="Category Name (EN)..."
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowNewCatInput(false)}
                      className="px-3 py-1 text-slate-500 hover:text-slate-700 text-xs"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                    >
                      {isAr ? 'إضافة الفئة' : 'Add Category'}
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold focus:border-emerald-500"
                >
                  {categories
                    .filter((c) => c.id !== 'cat-all')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {isAr ? c.name : c.nameEn}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>

          {/* Section 2: Loyverse "Sold By" (طريقة البيع: بالحبة / بالوزن) & Unit */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'طريقة البيع ووحدة القياس (Sold by)' : 'Sold by & Unit'}</span>
              </div>
              <span className="text-[11px] text-slate-400 font-normal">
                {isAr ? 'الحبة والكيلو واللتر' : 'Each / By Weight'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSoldBy('each');
                  setUnitType('piece');
                }}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                  soldBy === 'each'
                    ? 'border-emerald-600 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span>📦</span>
                <span>{isAr ? 'بالحبة / القطعة (Each)' : 'Each (Per item)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSoldBy('weight');
                  setUnitType('kg');
                }}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${
                  soldBy === 'weight'
                    ? 'border-emerald-600 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span>⚖️</span>
                <span>{isAr ? 'بالوزن / الحجم (Weight/Volume)' : 'Weight / Volume'}</span>
              </button>
            </div>

            {/* If sold by weight, allow picking Kg vs Liter */}
            {soldBy === 'weight' && (
              <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  {isAr ? 'حدد الوحدة الدقيقة:' : 'Unit of measure:'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUnitType('kg')}
                    className={`px-3 py-1 rounded-lg border text-xs font-bold ${
                      unitType === 'kg'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300'
                    }`}
                  >
                    {t.unit_kg} (kg)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitType('liter')}
                    className={`px-3 py-1 rounded-lg border text-xs font-bold ${
                      unitType === 'liter'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300'
                    }`}
                  >
                    {t.unit_liter} (L)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Pricing, Cost & Live Margin ("ونسبة الارباح") */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'التسعير ونسبة الأرباح' : 'Pricing & Profit Margins'}</span>
              </div>
              <span className="text-emerald-600 font-extrabold tabular-nums">
                +{marginPercent}% {t.profit}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.price} ({currencySymbol}) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    value={price === 0 ? '' : price}
                    placeholder="0.00"
                    onChange={(e) => {
                      const val = e.target.value;
                      setPrice(val === '' ? 0 : parseFloat(val) || 0);
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold tabular-nums text-sm focus:border-emerald-500"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currencySymbol}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t.cost} ({currencySymbol}) ({isAr ? 'اختياري' : 'Optional'})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={costPrice === 0 ? '' : costPrice}
                    placeholder="0.00"
                    onChange={(e) => {
                      const val = e.target.value;
                      setCostPrice(val === '' ? 0 : parseFloat(val) || 0);
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold tabular-nums text-sm focus:border-emerald-500"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            {/* Profit margin banner */}
            <div className="p-2.5 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/80 flex items-center justify-between">
              <span className="text-emerald-900 dark:text-emerald-200 font-medium">
                {isAr ? 'صافي الربح المتوقع لكل وحدة:' : 'Net Profit per unit:'}
              </span>
              <span className="font-black text-emerald-800 dark:text-emerald-300 tabular-nums">
                +{profit.toFixed(2)} {currencySymbol} ({marginPercent}%)
              </span>
            </div>
          </div>

          {/* Section 4: Inventory Tracking (إدارة المخزون والتتبع) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'إدارة المخزون والتتبع' : 'Inventory Tracking'}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[11px] text-slate-500">
                  {trackStock ? (isAr ? 'المخزون مفعل' : 'Tracking on') : (isAr ? 'مخزون لا نهائي' : 'Infinite')}
                </span>
                <input
                  type="checkbox"
                  checked={trackStock}
                  onChange={(e) => setTrackStock(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-sm"
                />
              </label>
            </div>

            {trackStock && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 animate-in fade-in">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {t.stock_available} ({isAr ? 'الكمية الحالية في المتجر' : 'Current Stock'})
                    </label>
                    <button
                      type="button"
                      onClick={() => setStockInput('0')}
                      className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-[10px] font-extrabold text-slate-700 dark:text-slate-200"
                    >
                      0
                    </button>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    value={stockInput}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setStockInput(e.target.value)}
                    onBlur={() => {
                      if (stockInput.trim() === '') setStockInput('0');
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t.min_alert} ({isAr ? 'تنبيه نقص المخزون' : 'Low Stock Alert'})
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(parseFloat(e.target.value) || 5)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold tabular-nums"
                  />
                </div>

                {/* Expiry Date / تاريخ انتهاء الصلاحية */}
                <div className="pt-2 sm:col-span-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      <span>{isAr ? 'تاريخ انتهاء الصلاحية (اختياري)' : 'Expiration Date (Optional)'}</span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {isAr ? 'ينبهك النظام قبل 30 يوماً من انتهائه' : 'Alerts 30 days before expiry'}
                    </span>
                  </div>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
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
                        className="px-2 py-0.5 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                    {expiryDate && (
                      <button
                        type="button"
                        onClick={() => setExpiryDate('')}
                        className="px-2 py-0.5 text-[10px] font-bold text-rose-500 hover:underline"
                      >
                        {isAr ? 'مسح' : 'Clear'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Representation on POS (شكل الصنف بشاشة الكاشير مثل Loyverse: صورة أو لون) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'التمثيل في شاشة المبيعات (مثل Loyverse)' : 'Representation on POS'}</span>
              </div>
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setRepType('image')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    repType === 'image'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'صورة' : 'Image'}
                </button>
                <button
                  type="button"
                  onClick={() => setRepType('color')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    repType === 'color'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'لون وشكل' : 'Color'}
                </button>
              </div>
            </div>

            {repType === 'image' ? (
              <div className="space-y-3">
                {/* Custom Camera Capture Card / Trigger */}
                {customCapturedImage ? (
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border-2 border-emerald-500 shadow-sm flex items-center gap-3">
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-emerald-200 dark:border-emerald-700">
                      <img
                        src={customCapturedImage}
                        alt="Captured product"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[9px] font-bold text-center py-0.5">
                        {isAr ? 'كاميرا' : 'Camera'}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{isAr ? 'تم التقاط صورة مخصصة للمنتج بنجاح' : 'Custom photo captured'}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {isAr ? 'ستظهر هذه الصورة في الكاشير والفاتورة والمخزون' : 'Appears in POS and inventory'}
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => setShowCameraModal(true)}
                          className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{isAr ? 'إعادة التقاط بالكاميرا' : 'Retake photo'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomCapturedImage(null);
                            setSelectedImage(sampleImages[0].url);
                          }}
                          className="px-2 py-1 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          {isAr ? 'حذف واسترجاع النماذج' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 3 Direct Camera & Upload Action Buttons */
                  <div className="space-y-2">
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
                        title={isAr ? 'التقاط فوري عبر كاميرا الهاتف' : 'Instant phone camera'}
                      >
                        <Smartphone className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'كاميرا الهاتف' : 'Phone Snap'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="py-2.5 px-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                        title={isAr ? 'معرض صور الهاتف' : 'Upload from phone'}
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
                      onChange={handleFileImageUpload}
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={galleryInputRef}
                      onChange={handleFileImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                )}

                {/* Pre-made Moroccan Grocery Images */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    {isAr ? 'أو اختر صورة جاهزة للمنتجات المغربية:' : 'Or choose a ready Moroccan grocery photo:'}
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {sampleImages.map((img) => {
                      const isSelected = !customCapturedImage && selectedImage === img.url;
                      return (
                        <button
                          key={img.url}
                          type="button"
                          onClick={() => {
                            setCustomCapturedImage(null);
                            setSelectedImage(img.url);
                          }}
                          className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all ${
                            isSelected
                              ? 'border-emerald-600 shadow-md ring-2 ring-emerald-500/30 scale-102'
                              : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-emerald-600/30 flex items-center justify-center">
                              <Check className="w-5 h-5 text-white stroke-[3]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Loyverse Signature Color Palette */
              <div className="space-y-2">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {loyverseColors.map((c) => {
                    const isSelected = selectedColor === c.hex;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setSelectedColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`h-10 rounded-xl flex items-center justify-center text-white transition-all ${
                          isSelected
                            ? 'ring-3 ring-emerald-400 shadow-md scale-105'
                            : 'opacity-85 hover:opacity-100'
                        }`}
                        title={c.name}
                      >
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>


          {/* Section 7: Loyverse Variants Builder (المتغيرات مثل الأحجام: صغير / كبير) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>{isAr ? 'المتغيرات والأحجام (Variants)' : 'Item Variants'}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[11px] text-slate-500">
                  {hasVariants ? (isAr ? 'مفعل' : 'Enabled') : (isAr ? 'صنف بدون أحجام' : 'Single Item')}
                </span>
                <input
                  type="checkbox"
                  checked={hasVariants}
                  onChange={(e) => setHasVariants(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-sm"
                />
              </label>
            </div>

            {hasVariants && (
              <div className="space-y-2 pt-1 animate-in fade-in">
                {variantsList.map((variant, index) => (
                  <div
                    key={index}
                    className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) => updateVariantRow(index, 'name', e.target.value)}
                        placeholder="اسم الحجم / المتغير"
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold"
                      />
                    </div>
                    <div className="col-span-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.25"
                          value={variant.price}
                          onChange={(e) => updateVariantRow(index, 'price', parseFloat(e.target.value) || 0)}
                          placeholder="السعر"
                          className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono font-bold tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={variant.stock}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          updateVariantRow(index, 'stock', Number.isFinite(n) && n >= 0 ? n : 0);
                        }}
                        placeholder="0"
                        className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div className="col-span-2 text-end">
                      <button
                        type="button"
                        onClick={() => removeVariantRow(index)}
                        disabled={variantsList.length <= 1}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addVariantRow}
                  className="px-3 py-1.5 rounded-xl border border-dashed border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إضافة حجم أو متغير آخر' : 'Add another variant'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick checkbox: Add to cart immediately */}
          {onAddedAndAddToCart && (
            <label className="flex items-center gap-2 cursor-pointer select-none px-1">
              <input
                type="checkbox"
                checked={addToCartNow}
                onChange={(e) => setAddToCartNow(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'إضافة الصنف فوراً إلى سلة المبيعات بعد الحفظ' : 'Add to cart immediately upon saving'}
              </span>
            </label>
          )}

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{isAr ? 'حفظ السلعة في النظام' : 'Save Item'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Live Phone Camera Snapshot Capture Modal */}
      <ProductCameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCaptureFromCamera}
        isAr={isAr}
      />

      {/* Camera Barcode Scanner Modal */}
      {showBarcodeScanner && (
        <BarcodeScannerModal
          mode="field"
          title={isAr ? 'قراءة باركود السلعة بالكاميرا' : 'Scan Item Barcode'}
          onClose={() => setShowBarcodeScanner(false)}
          onScanned={(code) => {
            setBarcode(code);
            if (!sku) {
              setSku('SKU-' + code.slice(-4));
            }
            setBarcodeErrorAlert(null);
            if (code.trim().length >= 6) {
              void handleLookupBarcode(code, !name.trim());
            }
          }}
        />
      )}
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { usePos } from '../../context/PosContext';
import { Category } from '../../types';
import {
  Layers,
  X,
  Camera,
  Upload,
  Check,
  Palette,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Plus,
  AlertTriangle,
  Pencil,
  RotateCcw,
  Smartphone,
  Eye
} from 'lucide-react';
import { playSound } from '../../utils/audio';
import { compressImageFile } from '../../utils/imageUtils';
import { ProductCameraModal } from '../pos/ProductCameraModal';

interface AddCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated?: (cat: Category) => void;
  initialTab?: 'create' | 'manage';
}

export const AddCategoryModal: React.FC<AddCategoryModalProps> = ({
  isOpen,
  onClose,
  onCategoryCreated,
  initialTab = 'create'
}) => {
  const { categories, products, addCategory, updateCategory, deleteCategory, language, settings } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [selectedColor, setSelectedColor] = useState('#059669');
  const [selectedImage, setSelectedImage] = useState<string>('/src/assets/images/grocery_olive_oil_1794130799863.jpg');

  // Camera & Image state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageToast, setImageToast] = useState<string | null>(null);

  // Dual file input refs: one for phone photo gallery, one for native phone camera
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setEditingCategoryId(null);
      setName('');
      setNameEn('');
      setSelectedColor('#059669');
      setSelectedImage('/src/assets/images/grocery_olive_oil_1794130799863.jpg');
      setIsProcessingImage(false);
      setImageToast(null);
    }
  }, [isOpen, initialTab]);

  const sampleCategoryImages = [
    { label: isAr ? 'زيوت ومواد دهنية' : 'Huiles & Cuisine', url: '/src/assets/images/grocery_olive_oil_1794130799863.jpg' },
    { label: isAr ? 'شاي وسكر ومشروبات' : 'Thé & Boissons', url: '/src/assets/images/grocery_moroccan_tea_1794130814562.jpg' },
    { label: isAr ? 'كسكس ودقيق وحبوب' : 'Couscous & Farines', url: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg' },
    { label: isAr ? 'حليب وأجبان طازجة' : 'Produits Laitiers', url: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg' },
    { label: isAr ? 'معلبات ومصبرات' : 'Conserves & Poissons', url: '/src/assets/images/grocery_canned_sardines_1794130855776.jpg' }
  ];

  const categoryColors = [
    '#059669', // Emerald
    '#2563EB', // Blue
    '#D97706', // Amber
    '#DC2626', // Red
    '#7C3AED', // Purple
    '#DB2777', // Pink
    '#0D9488', // Teal
    '#B45309', // Brown
    '#4B5563'  // Slate
  ];

  if (!isOpen) return null;

  // Handle direct snapshot from live Camera Viewfinder
  const handleCaptureCamera = (dataUrl: string) => {
    setSelectedImage(dataUrl);
    setShowCameraModal(false);
    playSound('beep');
    setImageToast(isAr ? 'تم التقاط صورة الصنف بنجاح' : 'Category photo captured');
    setTimeout(() => setImageToast(null), 3000);
  };

  // Handle image upload from Gallery or Phone Camera
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      // Auto compress to ultra-lightweight 300px JPEG (~8-15KB)
      const dataUrl = await compressImageFile(file, 300, 300, 0.6);
      setSelectedImage(dataUrl);
      playSound('beep');
      setImageToast(isAr ? 'تم تحميل صورة الصنف من الهاتف وتحسينها' : 'Photo uploaded from phone');
      setTimeout(() => setImageToast(null), 3000);
    } catch (err) {
      console.warn('Image compression fallback:', err);
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setSelectedImage(dataUrl);
          playSound('beep');
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsProcessingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  // Switch to edit existing category
  const startEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setName(cat.name);
    setNameEn(cat.nameEn || cat.name);
    setSelectedColor(cat.color || '#059669');
    setSelectedImage(cat.image || '/src/assets/images/grocery_olive_oil_1794130799863.jpg');
    setActiveTab('create');
  };

  const cancelEditMode = () => {
    setEditingCategoryId(null);
    setName('');
    setNameEn('');
    setSelectedColor('#059669');
    setSelectedImage('/src/assets/images/grocery_olive_oil_1794130799863.jpg');
  };

  // Form submit for new category or update
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingCategoryId) {
      // Update existing category
      updateCategory(editingCategoryId, {
        name: name.trim(),
        nameEn: nameEn.trim() || name.trim(),
        color: selectedColor,
        image: selectedImage
      });

      if (settings.enableSoundEffects) playSound('success');
      setEditingCategoryId(null);
      setActiveTab('manage');
      return;
    }

    // Create new category
    const newCatData: Omit<Category, 'id'> = {
      name: name.trim(),
      nameEn: nameEn.trim() || name.trim(),
      color: selectedColor,
      image: selectedImage
    };

    const created = addCategory(newCatData);
    if (settings.enableSoundEffects) playSound('success');

    if (onCategoryCreated) {
      onCategoryCreated(created);
    }

    setName('');
    setNameEn('');
    onClose();
  };

  const handleDeleteCategory = (cat: Category) => {
    const assignedCount = products.filter((p) => p.categoryId === cat.id).length;
    const msg = isAr
      ? `هل أنت متأكد من حذف وإلغاء صنف "${cat.name}"؟\nسيتم نقل كافة منتجات هذا الصنف (${assignedCount} منتج) تلقائياً إلى صنف آخر حتى لا تضيع.`
      : `Delete category "${cat.name}"? ${assignedCount} products will be safely moved.`;

    if (confirm(msg)) {
      deleteCategory(cat.id);
    }
  };

  const customCategories = categories.filter((c) => c.id !== 'cat-all');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                {editingCategoryId
                  ? (isAr ? 'تعديل صورة وبيانات الصنف' : 'Edit Category & Photo')
                  : (isAr ? 'إدارة وإضافة وإلغاء الأصناف / الفئات' : 'Category Management & Photos')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isAr
                  ? 'إضافة الصور من الكاميرا ومكتبة الهاتف أو إلغاء وتعديل الأصناف'
                  : 'Add pictures from camera & phone or manage categories'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Add vs Manage & Delete */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (editingCategoryId) cancelEditMode();
              setActiveTab('create');
            }}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'create'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>
              {editingCategoryId
                ? (isAr ? 'تعديل الصنف الحالي' : 'Edit Category')
                : (isAr ? '+ إضافة صنف جديد' : '+ Create Category')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (editingCategoryId) cancelEditMode();
              setActiveTab('manage');
            }}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'manage'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{isAr ? 'إدارة وتعديل وإلغاء الأصناف' : 'Manage & Edit'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {customCategories.length}
            </span>
          </button>
        </div>

        {/* Floating image feedback toast */}
        {imageToast && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center animate-in fade-in flex items-center justify-center gap-1.5 shadow-md">
            <Check className="w-4 h-4" />
            <span>{imageToast}</span>
          </div>
        )}

        {/* Body content based on activeTab */}
        {activeTab === 'create' ? (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
            {/* Category Preview Card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-white shadow-2xs group">
                  <img
                    src={selectedImage}
                    alt="Category preview"
                    className="w-full h-full object-cover"
                  />
                  <span
                    className="absolute top-1 right-1 rtl:right-1 rtl:left-auto left-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs"
                    style={{ backgroundColor: selectedColor }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                    <span>{isAr ? 'معاينة بطاقة الصنف' : 'Category Preview'}</span>
                    {editingCategoryId && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">
                        {isAr ? 'وضع التعديل' : 'Editing'}
                      </span>
                    )}
                  </div>
                  <div className="font-black text-sm text-slate-900 dark:text-white truncate">
                    {name || (isAr ? 'اسم الصنف الجديد...' : 'New Category...')}
                  </div>
                  <div className="text-xs text-slate-500 truncate font-sans">
                    {nameEn || (isAr ? 'الاسم بالفرنسية / الإنجليزية' : 'English name')}
                  </div>
                </div>
              </div>

              {selectedImage && (
                <button
                  type="button"
                  onClick={() => setSelectedImage('/src/assets/images/grocery_olive_oil_1794130799863.jpg')}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs"
                  title={isAr ? 'استعادة الصورة الافتراضية' : 'Reset photo'}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Name fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم الصنف (بالعربية) *' : 'Category Name (AR) *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? 'مثال: ألبان وأجبان طازجة، تمور وفواكه جافة...' : 'e.g. Fresh Dairy, Dry Fruits...'}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-emerald-500 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الاسم بالفرنسية / الإنجليزية (اختياري)' : 'Name in French / English (Optional)'}
                </label>
                <input
                  type="text"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Produits Laitiers & Fromages"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-emerald-500 font-sans text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Camera / Phone Image Capture Controls ("إضافة الصور من الكاميرة والهاتف") */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'إضافة صورة الصنف من الكاميرا والهاتف:' : 'Add Photo from Camera & Phone:'}</span>
                </label>
                {isProcessingImage && (
                  <span className="text-[10px] text-emerald-600 font-bold animate-pulse">
                    {isAr ? 'جاري تحسين وضغط الصورة...' : 'Processing photo...'}
                  </span>
                )}
              </div>

              {/* 3 Dedicated Options for Mobile & Desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {/* 1. Live Camera Viewfinder */}
                <button
                  type="button"
                  onClick={() => setShowCameraModal(true)}
                  className="p-2.5 rounded-xl border border-emerald-400 dark:border-emerald-700 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-700 text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95"
                >
                  <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{isAr ? 'كاميرا مباشرة' : 'Live Camera'}</span>
                </button>

                {/* 2. Fast Mobile Shutter Camera */}
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="p-2.5 rounded-xl border border-emerald-400 dark:border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95"
                  title={isAr ? 'التقاط فوري عبر تطبيق كاميرا الهاتف' : 'Instant phone camera'}
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>{isAr ? 'كاميرا الهاتف' : 'Phone Snap'}</span>
                </button>

                {/* 3. Phone Photo Gallery / Device Album */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95"
                  title={isAr ? 'اختيار صورة محفوظة في ألبوم الهاتف' : 'Choose from photo album'}
                >
                  <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{isAr ? 'معرض الصور' : 'Gallery'}</span>
                </button>
              </div>

              {/* Hidden Inputs */}
              {/* Native Mobile Camera trigger */}
              <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageFileChange}
                className="hidden"
              />
              {/* Phone Gallery/Files trigger (no capture attribute to allow picking from albums) */}
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                className="hidden"
              />

              {/* Moroccan Presets Gallery */}
              <div className="space-y-1.5 pt-1 border-t border-emerald-200/50 dark:border-emerald-900/30">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {isAr ? 'أو اختر من صور المواد الغذائية المغربية الجاهزة:' : 'Or choose grocery preset:'}
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {sampleCategoryImages.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedImage(s.url);
                        playSound('click');
                      }}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        selectedImage === s.url
                          ? 'border-emerald-600 ring-2 ring-emerald-500/40 scale-105 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                      }`}
                      title={s.label}
                    >
                      <img src={s.url} alt={s.label} className="w-full h-full object-cover" />
                      {selectedImage === s.url && (
                        <div className="absolute inset-0 bg-emerald-600/30 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white stroke-[3]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Color Badge Palette */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {isAr ? 'لون تمييز الصنف في الشاشة:' : 'Badge Color on POS:'}
              </label>
              <div className="flex items-center gap-2">
                {categoryColors.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSelectedColor(col)}
                    className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                      selectedColor === col ? 'scale-115 ring-2 ring-offset-2 ring-emerald-500' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: col }}
                  >
                    {selectedColor === col && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (editingCategoryId) cancelEditMode();
                  onClose();
                }}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm"
              >
                {editingCategoryId
                  ? (isAr ? 'حفظ تعديلات الصنف' : 'Save Changes')
                  : (isAr ? 'حفظ الصنف الجديد' : 'Save Category')}
              </button>
            </div>
          </form>
        ) : (
          /* Manage & Edit & Delete Existing Categories Tab */
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
            {/* Integrated Add Category Header inside Manage Categories */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {isAr ? `قائمة الأصناف المسجلة (${customCategories.length})` : `Categories (${customCategories.length})`}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAr ? 'أضف صنفاً جديداً أو عدّل الأصناف الحالية' : 'Create a new category or edit existing ones'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  cancelEditMode();
                  setActiveTab('create');
                }}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? '+ إضافة صنف' : '+ Add Category'}</span>
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                {isAr
                  ? 'يمكنك تعديل أي صنف لتغيير اسمه أو التقاط صورة جديدة له من كاميرا الهاتف، أو حذفه مع نقل منتجاته بأمان.'
                  : 'You can edit any category to update its name or snap a new photo with your phone camera, or delete it safely.'}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              {customCategories.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  {isAr ? 'لا توجد أصناف قابلة للتعديل أو الحذف' : 'No custom categories'}
                </div>
              ) : (
                customCategories.map((cat) => {
                  const prodCount = products.filter((p) => p.categoryId === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      className="p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {cat.image ? (
                          <img
                            src={cat.image}
                            alt={cat.name}
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        ) : (
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 font-bold"
                            style={{ backgroundColor: cat.color || '#059669' }}
                          >
                            <Layers className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {cat.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {cat.nameEn || cat.name} · <span className="font-bold text-emerald-600 dark:text-emerald-400">{prodCount}</span> {isAr ? 'منتج مسجل' : 'items'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Edit Category (with camera & phone photo upload) */}
                        <button
                          type="button"
                          onClick={() => startEditCategory(cat)}
                          className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold transition-colors flex items-center gap-1"
                          title={isAr ? `تعديل صنف ${cat.name} وصورته` : `Edit category ${cat.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>{isAr ? 'تعديل' : 'Edit'}</span>
                        </button>

                        {/* Delete Category */}
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold transition-colors flex items-center gap-1"
                          title={isAr ? `إلغاء وحذف صنف ${cat.name}` : `Delete category ${cat.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isAr ? 'حذف' : 'Delete'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  cancelEditMode();
                  setActiveTab('create');
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? '+ إنشاء صنف جديد الآن' : '+ Create Category'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Camera Capture Modal with live viewfinder & mobile support */}
      <ProductCameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCaptureCamera}
        isAr={isAr}
        title={isAr ? 'التقاط صورة الصنف بالكاميرا' : 'Capture Category Photo'}
      />
    </div>
  );
};

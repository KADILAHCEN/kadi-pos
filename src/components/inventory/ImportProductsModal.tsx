import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { usePos } from '../../context/PosContext';
import { Product, UnitType } from '../../types';
import { playSound } from '../../utils/audio';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  Layers,
  ArrowRight,
  Database,
  RefreshCw,
  Sparkles,
  Info,
  HelpCircle,
  Tag,
  Search,
  Check
} from 'lucide-react';

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (stats: { added: number; updated: number; categoriesCreated: number }) => void;
}

interface ParsedRowItem {
  raw: Record<string, any>;
  name: string;
  nameEn: string;
  barcode: string;
  sku: string;
  categoryName: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  unitType: UnitType;
  isValid: boolean;
  validationIssues: string[];
  isBarcodeGenerated: boolean;
}

export const ImportProductsModal: React.FC<ImportProductsModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { categories, products, importProductsBulk, currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Flow steps: 'upload' -> 'preview' -> 'done'
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRowItem[]>([]);
  const [discoveredCategories, setDiscoveredCategories] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'merge' | 'append' | 'replace'>('merge');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [searchPreview, setSearchPreview] = useState<string>('');
  const [filterValidOnly, setFilterValidOnly] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Import Result Stats
  const [resultStats, setResultStats] = useState<{
    added: number;
    updated: number;
    categoriesCreated: number;
  } | null>(null);

  if (!isOpen) return null;

  // Generate and download a pristine sample Excel template (.xlsx or .csv)
  const handleDownloadTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
    const sampleData = [
      {
        'اسم المنتج (بالعربية)': 'زيت زيتون واد سوس بكر ممتاز (1 لتر)',
        'الاسم بالفرنسية / الإنجليزية': "Huile d'olive Vierge Extra Oued Souss 1L",
        'الباركود (Barcode)': '611100010001',
        'رمز السلعة (SKU)': 'OIL-SOU-1L',
        'الفئة / التصنيف': 'زيوت ومواد الطبخ',
        'سعر البيع (د.م)': 75.0,
        'سعر التكلفة (د.م)': 58.0,
        'الكمية المتوفرة بالمخزون': 45,
        'حد التنبيه للمخزون الأدنى': 10,
        'نوع الوحدة (piece / kg / liter / box)': 'liter'
      },
      {
        'اسم المنتج (بالعربية)': 'شاي أخضر الصويري ممتاز (200g)',
        'الاسم بالفرنسية / الإنجليزية': 'Thé Vert Marocain Souiri Qualité Supérieure (200g)',
        'الباركود (Barcode)': '611100020001',
        'رمز السلعة (SKU)': 'TEA-SOU-200',
        'الفئة / التصنيف': 'شاي وسكر ومشروبات',
        'سعر البيع (د.م)': 14.5,
        'سعر التكلفة (د.م)': 10.5,
        'الكمية المتوفرة بالمخزون': 80,
        'حد التنبيه للمخزون الأدنى': 15,
        'نوع الوحدة (piece / kg / liter / box)': 'piece'
      },
      {
        'اسم المنتج (بالعربية)': 'قالب السكر نمر المغربي التقليدي (2kg)',
        'الاسم بالفرنسية / الإنجليزية': 'Pain de Sucre Traditionnel Marocain Enmer (2kg)',
        'الباركود (Barcode)': '611100020003',
        'رمز السلعة (SKU)': 'SUG-ENM-2K',
        'الفئة / التصنيف': 'شاي وسكر ومشروبات',
        'سعر البيع (د.م)': 13.0,
        'سعر التكلفة (د.م)': 10.8,
        'الكمية المتوفرة بالمخزون': 120,
        'حد التنبيه للمخزون الأدنى': 20,
        'نوع الوحدة (piece / kg / liter / box)': 'piece'
      },
      {
        'اسم المنتج (بالعربية)': 'كسكس داري المغربي حبة متوسطة (1kg)',
        'الاسم بالفرنسية / الإنجليزية': 'Couscous Dari Marocain Moyen (1kg)',
        'الباركود (Barcode)': '611100030001',
        'رمز السلعة (SKU)': 'COU-DAR-1K',
        'الفئة / التصنيف': 'حبوب ودقيق وقطاني',
        'سعر البيع (د.م)': 13.5,
        'سعر التكلفة (د.م)': 9.8,
        'الكمية المتوفرة بالمخزون': 90,
        'حد التنبيه للمخزون الأدنى': 15,
        'نوع الوحدة (piece / kg / liter / box)': 'piece'
      },
      {
        'اسم المنتج (بالعربية)': 'جبن أحمر كروان إيدام فاخر (بالكيلو)',
        'الاسم بالفرنسية / الإنجليزية': 'Fromage Rouge Marocain Couronne Edam (kg)',
        'الباركود (Barcode)': '611100040003',
        'رمز السلعة (SKU)': 'CHE-COU-KG',
        'الفئة / التصنيف': 'ألبان وأجبان',
        'سعر البيع (د.م)': 110.0,
        'سعر التكلفة (د.م)': 86.0,
        'الكمية المتوفرة بالمخزون': 35.5,
        'حد التنبيه للمخزون الأدنى': 8,
        'نوع الوحدة (piece / kg / liter / box)': 'kg'
      },
      {
        'اسم المنتج (بالعربية)': 'سردين معلب بالزيت أنكور إسبادون (125g)',
        'الاسم بالفرنسية / الإنجليزية': "Sardines Marocaines à l'Huile (125g)",
        'الباركود (Barcode)': '611100050001',
        'رمز السلعة (SKU)': 'SARD-ANC-125',
        'الفئة / التصنيف': 'معلبات ومصبرات',
        'سعر البيع (د.م)': 6.5,
        'سعر التكلفة (د.م)': 4.8,
        'الكمية المتوفرة بالمخزون': 150,
        'حد التنبيه للمخزون الأدنى': 25,
        'نوع الوحدة (piece / kg / liter / box)': 'piece'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'قائمة المنتجات');

    // Auto-size columns
    const colWidths = [
      { wch: 38 }, // name
      { wch: 40 }, // nameEn
      { wch: 20 }, // barcode
      { wch: 16 }, // sku
      { wch: 22 }, // category
      { wch: 16 }, // price
      { wch: 16 }, // costPrice
      { wch: 22 }, // stock
      { wch: 24 }, // threshold
      { wch: 30 }  // unit
    ];
    worksheet['!cols'] = colWidths;

    if (format === 'csv') {
      XLSX.writeFile(workbook, 'نموذج_استيراد_منتجات_kadi_pos.csv', { bookType: 'csv' });
    } else {
      XLSX.writeFile(workbook, 'نموذج_استيراد_منتجات_kadi_pos.xlsx');
    }
  };

  // Flexible column name matching
  const findValue = (row: Record<string, any>, candidates: string[]): any => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const candNorm = cand.toLowerCase().replace(/[\s\-_()]/g, '');
      const foundKey = keys.find((k) => k.toLowerCase().replace(/[\s\-_()]/g, '').includes(candNorm));
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
        return row[foundKey];
      }
    }
    return undefined;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {
    setUploadError(null);
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
          defval: ''
        });

        if (jsonRows.length === 0) {
          playSound('error');
          setUploadError(isAr ? 'الملف فارغ أو لا يحتوي على بيانات صالحة' : 'The file is empty or has no valid rows');
          setIsProcessing(false);
          return;
        }

        const newDiscoveredCategories = new Set<string>();
        let autoBarcodeCounter = Date.now();

        const parsed: ParsedRowItem[] = jsonRows.map((row, idx) => {
          const issues: string[] = [];

          // 1. Name
          const rawName = findValue(row, [
            'اسم المنتج',
            'الاسم بالعربية',
            'الاسم',
            'product name',
            'name',
            'nom',
            'article',
            'designation',
            'libelle'
          ]);
          const name = String(rawName || '').trim();
          if (!name) {
            issues.push(isAr ? 'اسم المنتج غير محدد' : 'Missing product name');
          }

          // 2. English/French Name
          const rawNameEn = findValue(row, [
            'الاسم بالفرنسية',
            'الاسم بالانجليزية',
            'name en',
            'english name',
            'nom fr',
            'french name'
          ]);
          const nameEn = String(rawNameEn || name).trim();

          // 3. Barcode
          let rawBarcode = findValue(row, [
            'الباركود',
            'باركود',
            'كود الترقيم',
            'barcode',
            'code-barres',
            'code barres',
            'ean',
            'upc'
          ]);
          let barcode = String(rawBarcode || '').trim();
          let isBarcodeGenerated = false;

          if (!barcode) {
            barcode = `611${autoBarcodeCounter++}`;
            isBarcodeGenerated = true;
          }

          // 4. SKU
          const rawSku = findValue(row, ['رمز السلعة', 'كود الصنف', 'sku', 'reference', 'ref']);
          const sku = String(rawSku || `SKU-${idx + 1}`).trim();

          // 5. Category
          const rawCategory = findValue(row, [
            'الفئة',
            'التصنيف',
            'القسم',
            'category',
            'categorie',
            'famille'
          ]);
          const categoryName = String(rawCategory || 'عام').trim();
          if (categoryName) {
            newDiscoveredCategories.add(categoryName);
          }

          // 6. Price
          const rawPrice = findValue(row, [
            'سعر البيع',
            'السعر',
            'ثمن البيع',
            'price',
            'retail price',
            'prix',
            'prix vente'
          ]);
          let price = parseFloat(String(rawPrice).replace(/[^\d.-]/g, ''));
          if (isNaN(price) || price < 0) {
            price = 0;
            issues.push(isAr ? 'سعر البيع غير محدد أو غير صالح' : 'Invalid price');
          }

          // 7. Cost
          const rawCost = findValue(row, [
            'سعر التكلفة',
            'التكلفة',
            'ثمن الشراء',
            'cost',
            'cost price',
            'cout',
            'prix achat'
          ]);
          let costPrice = parseFloat(String(rawCost).replace(/[^\d.-]/g, ''));
          if (isNaN(costPrice) || costPrice < 0) {
            costPrice = Number((price * 0.75).toFixed(2));
          }

          // 8. Stock
          const rawStock = findValue(row, [
            'الكمية',
            'المخزون',
            'الرصيد',
            'stock',
            'quantity',
            'quantite',
            'qte'
          ]);
          let stock = parseFloat(String(rawStock).replace(/[^\d.-]/g, ''));
          if (isNaN(stock) || stock < 0) {
            stock = 0;
          }

          // 9. Low stock threshold
          const rawThreshold = findValue(row, [
            'حد التنبيه',
            'الحد الأدنى',
            'تنبيه المخزون',
            'threshold',
            'low stock',
            'alerte',
            'min'
          ]);
          let lowStockThreshold = parseFloat(String(rawThreshold).replace(/[^\d.-]/g, ''));
          if (isNaN(lowStockThreshold) || lowStockThreshold <= 0) {
            lowStockThreshold = 5;
          }

          // 10. Unit type
          const rawUnit = String(
            findValue(row, ['نوع الوحدة', 'الوحدة', 'unit', 'unite', 'type']) || ''
          ).toLowerCase();

          let unitType: UnitType = 'piece';
          if (rawUnit.includes('kg') || rawUnit.includes('كيلو') || rawUnit.includes('كغ')) {
            unitType = 'kg';
          } else if (
            rawUnit === 'g' ||
            rawUnit === 'غ' ||
            rawUnit.includes('gram') ||
            rawUnit.includes('غرام') ||
            rawUnit === 'gr'
          ) {
            unitType = 'gram';
          } else if (rawUnit.includes('liter') || rawUnit.includes('لتر') || rawUnit.includes('litre')) {
            unitType = 'liter';
          } else if (rawUnit.includes('box') || rawUnit.includes('كرتون') || rawUnit.includes('علبة')) {
            unitType = 'box';
          }

          return {
            raw: row,
            name: name || `منتج مستورد ${idx + 1}`,
            nameEn,
            barcode,
            sku,
            categoryName,
            price,
            costPrice,
            stock,
            lowStockThreshold,
            unitType,
            isValid: issues.length === 0,
            validationIssues: issues,
            isBarcodeGenerated
          };
        });

        setParsedRows(parsed);
        setDiscoveredCategories(Array.from(newDiscoveredCategories));
        setStep('preview');
        playSound('beep');
      } catch (err: any) {
        playSound('error');
        setUploadError(isAr ? `حدث خطأ أثناء قراءة الملف: ${err.message}` : `Error reading file: ${err.message}`);
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleExecuteImport = () => {
    if (parsedRows.length === 0) return;
    setIsProcessing(true);

    // Map category names to IDs or prepare new categories to create
    const catMap = new Map<string, string>();
    categories.forEach((c) => {
      catMap.set(c.name.trim().toLowerCase(), c.id);
      if (c.nameEn) catMap.set(c.nameEn.trim().toLowerCase(), c.id);
    });

    const newCategoriesToCreate: { name: string; nameEn?: string; color?: string }[] = [];
    const colors = ['#059669', '#2563EB', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0D9488'];

    discoveredCategories.forEach((catName, idx) => {
      if (!catMap.has(catName.trim().toLowerCase())) {
        newCategoriesToCreate.push({
          name: catName.trim(),
          nameEn: catName.trim(),
          color: colors[idx % colors.length]
        });
      }
    });

    // Format products for import
    const formattedProducts: Omit<Product, 'id'>[] = parsedRows.map((item, idx) => {
      const assignedCatId =
        catMap.get(item.categoryName.trim().toLowerCase()) ||
        `cat-import-${Date.now()}-${idx}`;

      return {
        name: item.name,
        nameEn: item.nameEn || item.name,
        barcode: item.barcode,
        sku: item.sku,
        categoryId: assignedCatId,
        price: item.price,
        costPrice: item.costPrice,
        stock: item.stock,
        lowStockThreshold: item.lowStockThreshold,
        unitType: item.unitType,
        color: colors[idx % colors.length],
        hasVariants: false
      };
    });

    const stats = importProductsBulk(formattedProducts, importMode, newCategoriesToCreate);
    setResultStats(stats);
    setIsProcessing(false);
    setStep('done');
    playSound('success');

    if (onSuccess) {
      onSuccess(stats);
    }
  };

  const filteredPreview = parsedRows.filter((p) => {
    if (filterValidOnly && !p.isValid) return false;
    if (!searchPreview) return true;
    const q = searchPreview.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      p.categoryName.toLowerCase().includes(q)
    );
  });

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const warningCount = parsedRows.filter((r) => !r.isValid || r.isBarcodeGenerated).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full h-[90vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span>{isAr ? 'استيراد قائمة المنتجات والمخزون' : 'Bulk Product & Stock Import'}</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  Excel & CSV
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {isAr
                  ? 'رفع آلاف السلع بضغطة زر وتحديث أسعار ومخزون بقالة صفرو للمواد الغذائية'
                  : 'Fast onboarding for thousands of grocery items with live validation'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* STEP 1: Upload or Download Template */}
          {step === 'upload' && (
            <div className="space-y-6">
              {uploadError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadError(null)}
                    className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Ready Template Download Banner */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                      {isAr ? 'تحميل نموذج إكسل جاهز ومُعبأ بأمثلة سلع مغربية' : 'Download Sample Grocery Template'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {isAr
                        ? 'نموذج يحتوي على الأعمدة الصحيحة (الاسم، الباركود، الفئة، السعر، التكلفة، المخزون، الوحدة).'
                        : 'Pre-formatted spreadsheet with column headers ready to fill.'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDownloadTemplate('xlsx')}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition-all flex items-center gap-1.5 active:scale-95"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>{isAr ? 'تحميل Excel (.xlsx)' : 'Download Excel'}</span>
                  </button>
                  <button
                    onClick={() => handleDownloadTemplate('csv')}
                    className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-1"
                  >
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Drag & Drop Upload Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-900/50 hover:bg-emerald-50/20 group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-xs">
                  <Upload className="w-8 h-8" />
                </div>

                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white mb-1">
                  {isAr ? 'اسحب ملف الإكسل أو اضغط لاختياره من جهازك' : 'Drag & drop Excel or CSV file here'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  {isAr
                    ? 'يدعم الملفات بصيغة (.xlsx, .xls, .csv) حتى آلاف المنتجات مع التعرف التلقائي الذكي على العناوين'
                    : 'Supports .xlsx, .xls, and .csv files with auto-detected column headers'}
                </p>

                <span className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold group-hover:bg-emerald-600 transition-colors">
                  {isAr ? 'استعراض الملفات...' : 'Browse files...'}
                </span>
              </div>

              {/* Tips & Supported Headers */}
              <div className="p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Info className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'كيف يعمل الاستيراد التلقائي الذكي؟' : 'How does auto-mapping work?'}</span>
                </div>
                <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside leading-relaxed">
                  <li>{isAr ? 'يتعرف النظام تلقائياً على الأعمدة باللغة العربية، الفرنسية أو الإنجليزية (الاسم، الباركود، الفئة، السعر...).' : 'Headers in Arabic, French, and English are detected automatically.'}</li>
                  <li>{isAr ? 'في حال عدم وجود باركود لأحد السلع، يقوم النظام بتوليد كود باركود مغربي فريد تلقائياً.' : 'Missing barcodes are automatically generated.'}</li>
                  <li>{isAr ? 'الفئات غير الموجودة مسبقاً في نقطة البيع يتم إنشاؤها وإضافتها وتلوينها تلقائياً.' : 'New categories are automatically created and assigned.'}</li>
                  <li>{isAr ? 'تحديث فوري لأرصدة وحركات المخزون (Stock Movements) مع تسجيل سبب الاستيراد.' : 'Creates stock audit records with date and reason.'}</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: Live Data Preview & Confirmation */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* File Info & KPI Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-400 font-semibold">{isAr ? 'إجمالي السلع بالملف' : 'Total Items'}</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {parsedRows.length}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{fileName} ({fileSize})</div>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">{isAr ? 'سلع جاهزة ومكتملة' : 'Ready to Import'}</div>
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                    {validCount}
                  </div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">{isAr ? 'بيانات مطابقة 100%' : '100% Valid'}</div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800">
                  <div className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold">{isAr ? 'التصنيفات المكتشفة' : 'Categories Found'}</div>
                  <div className="text-lg font-black text-blue-700 dark:text-blue-300 tabular-nums mt-0.5">
                    {discoveredCategories.length}
                  </div>
                  <div className="text-[10px] text-blue-600 truncate mt-0.5">
                    {discoveredCategories.slice(0, 2).join('، ')}...
                  </div>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800">
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">{isAr ? 'توليد باركود تلقائي' : 'Auto Barcodes'}</div>
                  <div className="text-lg font-black text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                    {parsedRows.filter((r) => r.isBarcodeGenerated).length}
                  </div>
                  <div className="text-[10px] text-amber-600 mt-0.5">{isAr ? 'تم سد الفراغات' : 'Assigned unique IDs'}</div>
                </div>
              </div>

              {/* Import Mode Selector */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  {isAr ? 'اختر طريقة معالجة المخزون الحالي:' : 'Select Import Mode:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className={`p-3 rounded-xl border text-left rtl:text-right transition-all flex flex-col justify-between ${
                      importMode === 'merge'
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-600/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs">{isAr ? 'دمج وتحديث (مُستحسن)' : 'Merge & Update'}</span>
                      {importMode === 'merge' && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      {isAr
                        ? 'تحديث أسعار ورصيد السلع الموجودة بالباركود، وإضافة السلع الجديدة'
                        : 'Update existing products and insert new ones'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportMode('append')}
                    className={`p-3 rounded-xl border text-left rtl:text-right transition-all flex flex-col justify-between ${
                      importMode === 'append'
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-600/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs">{isAr ? 'إضافة كأصناف جديدة' : 'Append Only'}</span>
                      {importMode === 'append' && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      {isAr
                        ? 'إدراج كافة سلع الملف كمنتجات جديدة دون المساس بالمخزون الحالي'
                        : 'Keep all current products and append all imported items'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`p-3 rounded-xl border text-left rtl:text-right transition-all flex flex-col justify-between ${
                      importMode === 'replace'
                        ? 'border-rose-600 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 ring-2 ring-rose-600/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-xs text-rose-600">{isAr ? 'استبدال المخزون بالكامل' : 'Replace All'}</span>
                      {importMode === 'replace' && <Check className="w-4 h-4 text-rose-600" />}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      {isAr
                        ? 'مسح المنتجات الحالية واستبدالها بالكامل بملف الإكسل (للبدء من الصفر)'
                        : 'Wipe current products and replace with this imported list'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 rtl:right-auto top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchPreview}
                    onChange={(e) => setSearchPreview(e.target.value)}
                    placeholder={isAr ? 'بحث سريع في المعاينة...' : 'Search preview rows...'}
                    className="w-full py-1.5 px-8 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterValidOnly(!filterValidOnly)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
                      filterValidOnly
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {isAr ? 'عرض السلع الصالحة فقط' : 'Valid only'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white font-semibold"
                  >
                    {isAr ? 'اختيار ملف آخر' : 'Change File'}
                  </button>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-right rtl:text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">{isAr ? 'اسم المنتج' : 'Product Name'}</th>
                      <th className="p-2.5">{isAr ? 'الباركود' : 'Barcode'}</th>
                      <th className="p-2.5">{isAr ? 'الفئة' : 'Category'}</th>
                      <th className="p-2.5">{isAr ? 'سعر البيع' : 'Price'}</th>
                      <th className="p-2.5">{isAr ? 'التكلفة' : 'Cost'}</th>
                      <th className="p-2.5">{isAr ? 'الكمية' : 'Stock'}</th>
                      <th className="p-2.5">{isAr ? 'الوحدة' : 'Unit'}</th>
                      <th className="p-2.5">{isAr ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredPreview.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="p-2.5 font-mono text-[11px] text-slate-400">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-900 dark:text-white max-w-[200px] truncate">
                          {row.name}
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {row.barcode}
                          {row.isBarcodeGenerated && (
                            <span className="ms-1 px-1 py-0.2 rounded text-[9px] bg-amber-100 text-amber-700 font-sans">
                              {isAr ? 'آلي' : 'auto'}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md font-medium text-[11px]">
                            {row.categoryName}
                          </span>
                        </td>
                        <td className="p-2.5 font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {row.price.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="p-2.5 font-mono text-slate-500 tabular-nums">
                          {row.costPrice.toFixed(2)}
                        </td>
                        <td className="p-2.5 font-bold tabular-nums">
                          <span className={row.stock <= row.lowStockThreshold ? 'text-amber-600' : 'text-emerald-600'}>
                            {row.stock}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-500 text-[11px]">{row.unitType}</td>
                        <td className="p-2.5">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isAr ? 'سليم' : 'Valid'}</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600"
                              title={row.validationIssues.join(' - ')}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              <span>{isAr ? 'تنبيه' : 'Issue'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredPreview.length > 100 && (
                <div className="text-[11px] text-slate-400 text-center">
                  {isAr ? `يتم عرض أول 100 منتج من أصل ${filteredPreview.length} منتج.` : `Showing first 100 of ${filteredPreview.length} items.`}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Success Screen */}
          {step === 'done' && resultStats && (
            <div className="py-8 text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {isAr ? 'تم استيراد قائمة المنتجات والمخزون بنجاح!' : 'Products Imported Successfully!'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {isAr
                    ? 'أصبحت السلع جاهزة الآن للبيع المباشر عبر الكاشير، مسح الباركود، وإدارة المخزون والتنبيهات.'
                    : 'The items are immediately available in the POS register, barcode scanner, and inventory ledger.'}
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">{isAr ? 'أصناف مضافة' : 'Added'}</div>
                  <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
                    +{resultStats.added}
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800">
                  <div className="text-xs text-blue-700 dark:text-blue-300 font-semibold">{isAr ? 'أصناف محدثة' : 'Updated'}</div>
                  <div className="text-2xl font-black text-blue-700 dark:text-blue-300 tabular-nums mt-1">
                    {resultStats.updated}
                  </div>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-800">
                  <div className="text-xs text-purple-700 dark:text-purple-300 font-semibold">{isAr ? 'فئات جديدة' : 'Categories'}</div>
                  <div className="text-2xl font-black text-purple-700 dark:text-purple-300 tabular-nums mt-1">
                    +{resultStats.categoriesCreated}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  {isAr ? 'إغلاق والعودة لنقطة البيع' : 'Back to POS'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {step === 'preview' && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
            >
              {isAr ? 'رجوع' : 'Back'}
            </button>

            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={isProcessing || parsedRows.length === 0}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-md hover:shadow transition-all flex items-center gap-2 active:scale-95"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isAr ? 'جاري الاستيراد والتحديث...' : 'Importing...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isAr ? `تأكيد استيراد (${parsedRows.length}) منتج الآن` : `Confirm Import (${parsedRows.length}) Items`}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

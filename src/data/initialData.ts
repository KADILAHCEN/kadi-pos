import { Category, Customer, Product, Shift, StoreSettings, Branch, BranchTransfer, AppUser, ActivityLogItem, CreditTransaction, TheftAlertSettings } from '../types';
import { DEFAULT_CPU_SETTINGS } from '../utils/cpuTax';

export const initialCategories: Category[] = [
  { id: 'cat-all', name: 'جميع المواد الغذائية', nameEn: 'Tous les produits', iconName: 'Grid' },
  {
    id: 'cat-oils-grains',
    name: 'زيوت ومواد دهنية',
    nameEn: 'Huiles & Matières Grasses',
    iconName: 'Droplet',
    color: '#059669',
    image: '/src/assets/images/grocery_olive_oil_1794130799863.jpg'
  },
  {
    id: 'cat-tea-sugar',
    name: 'شاي، سكر ومشروبات',
    nameEn: 'Thé, Sucre & Boissons',
    iconName: 'Coffee',
    color: '#0284C7',
    image: '/src/assets/images/grocery_moroccan_tea_1794130814562.jpg'
  },
  {
    id: 'cat-flour-couscous',
    name: 'دقيق، كسكس وبقوليات',
    nameEn: 'Farines, Couscous & Légumes Secs',
    iconName: 'Wheat',
    color: '#D97706',
    image: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg'
  },
  {
    id: 'cat-dairy',
    name: 'ألبان، أجبان ومشتقاتها',
    nameEn: 'Produits Laitiers & Fromages',
    iconName: 'Milk',
    color: '#3B82F6',
    image: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg'
  },
  {
    id: 'cat-canned',
    name: 'معلبات، صلصات وتوابل',
    nameEn: 'Conserves, Sauces & Épices',
    iconName: 'Package',
    color: '#DC2626',
    image: '/src/assets/images/grocery_canned_sardines_1794130855776.jpg'
  }
];

const getFutureDateStr = (daysAhead: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
};

export const initialProducts: Product[] = [
  // 1. ZIT ZITOUN - HUILE D'OLIVE (Au Litre & Bouteille)
  {
    id: 'prod-1',
    name: 'زيت زيتون بكر ممتاز وادي سوس (باللتر)',
    nameEn: 'Huile d’Olive Vierge Extra Oued Souss (au Litre)',
    sku: 'OIL-OLV-1L',
    barcode: '611100010001',
    categoryId: 'cat-oils-grains',
    price: 85.0,
    costPrice: 68.0,
    stock: 55.0,
    lowStockThreshold: 10,
    unitType: 'liter',
    color: '#059669',
    image: '/src/assets/images/grocery_olive_oil_1794130799863.jpg',
    hasVariants: false,
    expiryDate: getFutureDateStr(360)
  },
  {
    id: 'prod-2',
    name: 'زيت المائدة لوسيور (بيدون 5 لتر)',
    nameEn: 'Huile de Table Lesieur (Bidon 5L)',
    sku: 'OIL-LES-5L',
    barcode: '611100010005',
    categoryId: 'cat-oils-grains',
    price: 95.0,
    costPrice: 83.5,
    stock: 35,
    lowStockThreshold: 8,
    unitType: 'piece',
    color: '#047857',
    image: '/src/assets/images/grocery_olive_oil_1794130799863.jpg',
    hasVariants: false
  },

  // 2. THE & SUCRE - SHAY & PAIN DE SUCRE
  {
    id: 'prod-3',
    name: 'شاي أخضر صويري ممتاز (السبع 200g)',
    nameEn: 'Thé Vert Marocain Essabaa (Paquet 200g)',
    sku: 'THE-SAB-200',
    barcode: '611100020001',
    categoryId: 'cat-tea-sugar',
    price: 16.5,
    costPrice: 12.8,
    stock: 120,
    lowStockThreshold: 20,
    unitType: 'piece',
    color: '#0284C7',
    image: '/src/assets/images/grocery_moroccan_tea_1794130814562.jpg',
    hasVariants: false
  },
  {
    id: 'prod-4',
    name: 'قالب السكر المغربي التقليدي النمر (2 كغ)',
    nameEn: 'Pain de Sucre Traditionnel Enmer (2kg)',
    sku: 'SUCR-PAIN-2K',
    barcode: '611100020002',
    categoryId: 'cat-tea-sugar',
    price: 13.5,
    costPrice: 10.9,
    stock: 75,
    lowStockThreshold: 15,
    unitType: 'piece',
    color: '#0369A1',
    image: '/src/assets/images/grocery_moroccan_tea_1794130814562.jpg',
    hasVariants: false
  },
  {
    id: 'prod-5',
    name: 'مشروب غازي هاواي أناناس / بومس تفاح',
    nameEn: 'Boisson Gazeuse Hawai Tropical / Poms Pomme',
    sku: 'SOD-HAW-POM',
    barcode: '611100020003',
    categoryId: 'cat-tea-sugar',
    price: 6.0,
    costPrice: 4.2,
    stock: 110,
    lowStockThreshold: 25,
    unitType: 'piece',
    color: '#F59E0B',
    image: '/src/assets/images/grocery_moroccan_tea_1794130814562.jpg',
    hasVariants: true,
    variants: [
      { id: 'var-can-33', name: 'قنينة كانيط (33cl)', sku: 'HAW-33', price: 6.0, costPrice: 4.2, stock: 55 },
      { id: 'var-bot-1l', name: 'قارورة عائلية (1 Litre)', sku: 'HAW-1L', price: 10.0, costPrice: 7.5, stock: 35 },
      { id: 'var-bot-2l', name: 'قارورة كبرى (2 Litres)', sku: 'HAW-2L', price: 14.0, costPrice: 10.5, stock: 20 }
    ]
  },

  // 3. COUSCOUS, FARINE & FECULENTS
  {
    id: 'prod-6',
    name: 'كسكس مغربي داري متوسط ممتاز (باكيت 1 كغ)',
    nameEn: 'Couscous Dari Moyen Supérieur (Paquet 1kg)',
    sku: 'DAR-CS-1KG',
    barcode: '611100030001',
    categoryId: 'cat-flour-couscous',
    price: 14.5,
    costPrice: 11.2,
    stock: 80,
    lowStockThreshold: 15,
    unitType: 'piece',
    color: '#D97706',
    image: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg',
    hasVariants: false
  },
  {
    id: 'prod-7',
    name: 'دقيق القمح اللين ميمونة فاخر (بالكيلو)',
    nameEn: 'Farine de Blé Tendre Maymouna (au Kg)',
    sku: 'FAR-MAY-KG',
    barcode: '611100030002',
    categoryId: 'cat-flour-couscous',
    price: 6.5,
    costPrice: 4.7,
    stock: 160.0,
    lowStockThreshold: 25,
    unitType: 'kg',
    color: '#B45309',
    image: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg',
    hasVariants: false
  },
  {
    id: 'prod-8',
    name: 'عدس بلدي محلي منقى (بالكيلو)',
    nameEn: 'Lentilles Marocaines Triées (au Kg)',
    sku: 'LENT-BEL-KG',
    barcode: '611100030003',
    categoryId: 'cat-flour-couscous',
    price: 19.0,
    costPrice: 14.2,
    stock: 48.0,
    lowStockThreshold: 10,
    unitType: 'kg',
    color: '#78350F',
    image: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg',
    hasVariants: false
  },
  {
    id: 'prod-9',
    name: 'حمص مغربي بلدي للحريرة (بالكيلو)',
    nameEn: 'Pois Chiches pour Harira (au Kg)',
    sku: 'POIS-CHI-KG',
    barcode: '611100030004',
    categoryId: 'cat-flour-couscous',
    price: 22.0,
    costPrice: 16.5,
    stock: 35.0,
    lowStockThreshold: 8,
    unitType: 'kg',
    color: '#92400E',
    image: '/src/assets/images/grocery_couscous_grains_1794130827700.jpg',
    hasVariants: false
  },

  // 4. PRODUITS LAITIERS & FROMAGE ROUGE
  {
    id: 'prod-10',
    name: 'حليب سنطرال معقم طازج UHT (1 لتر)',
    nameEn: 'Lait Entier Centrale UHT (1 Litre)',
    sku: 'LAIT-CEN-1L',
    barcode: '611100040001',
    categoryId: 'cat-dairy',
    price: 7.0,
    costPrice: 5.8,
    stock: 90.0,
    lowStockThreshold: 20,
    unitType: 'liter',
    color: '#2563EB',
    image: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg',
    hasVariants: false,
    expiryDate: getFutureDateStr(6)
  },
  {
    id: 'prod-11',
    name: 'لبن بلدي منعش سنطرال دسم (1 لتر)',
    nameEn: 'Lben Frais Centrale Laitière (1 Litre)',
    sku: 'LBEN-CEN-1L',
    barcode: '611100040002',
    categoryId: 'cat-dairy',
    price: 7.5,
    costPrice: 6.0,
    stock: 45.0,
    lowStockThreshold: 12,
    unitType: 'liter',
    color: '#1D4ED8',
    image: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg',
    hasVariants: false,
    expiryDate: getFutureDateStr(4)
  },
  {
    id: 'prod-12',
    name: 'جبن أحمر هولندي كروان إيدام الأصلي (بالكيلو)',
    nameEn: 'Fromage Rouge Edam Couronne Découpé (au Kg)',
    sku: 'FRM-ROU-KG',
    barcode: '611100040003',
    categoryId: 'cat-dairy',
    price: 95.0,
    costPrice: 76.0,
    stock: 18.5,
    lowStockThreshold: 4,
    unitType: 'kg',
    color: '#DC2626',
    image: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg',
    hasVariants: false,
    expiryDate: getFutureDateStr(20)
  },
  {
    id: 'prod-13',
    name: 'كرتون حليب سنطرال معقم (صندوق 12 لتر)',
    nameEn: 'Carton Lait Centrale Danone UHT (12x1L)',
    sku: 'LAIT-BOX-12',
    barcode: '611100040012',
    categoryId: 'cat-dairy',
    price: 82.0,
    costPrice: 69.5,
    stock: 22,
    lowStockThreshold: 5,
    unitType: 'box',
    color: '#1E40AF',
    image: '/src/assets/images/grocery_dairy_cheese_1794130841045.jpg',
    hasVariants: false,
    expiryDate: getFutureDateStr(28)
  },

  // 5. CONSERVES, EPICES & CONDIMENTS
  {
    id: 'prod-14',
    name: 'سردين معلب بالزيت النباتي أنكور إسبادون (125g)',
    nameEn: 'Sardines Marocaines à l’Huile Végétale (125g)',
    sku: 'SARD-ANC-125',
    barcode: '611100050001',
    categoryId: 'cat-canned',
    price: 6.5,
    costPrice: 4.8,
    stock: 140,
    lowStockThreshold: 30,
    unitType: 'piece',
    color: '#EA580C',
    image: '/src/assets/images/grocery_canned_sardines_1794130855776.jpg',
    hasVariants: false
  },
  {
    id: 'prod-15',
    name: 'طماطم مصبرة مركزة عائشة (علبة 70g)',
    nameEn: 'Double Concentré de Tomates Aïcha (70g)',
    sku: 'TOM-AIC-70',
    barcode: '611100050002',
    categoryId: 'cat-canned',
    price: 4.5,
    costPrice: 3.2,
    stock: 95,
    lowStockThreshold: 20,
    unitType: 'piece',
    color: '#DC2626',
    image: '/src/assets/images/grocery_canned_sardines_1794130855776.jpg',
    hasVariants: false
  },
  {
    id: 'prod-16',
    name: 'هريسة مغربية حارة أصيلة (برطمان 135g)',
    nameEn: 'Harissa Traditionnelle Pimentée du Maroc (135g)',
    sku: 'HAR-MOR-135',
    barcode: '611100050003',
    categoryId: 'cat-canned',
    price: 7.0,
    costPrice: 4.7,
    stock: 60,
    lowStockThreshold: 12,
    unitType: 'piece',
    color: '#B91C1C',
    image: '/src/assets/images/grocery_canned_sardines_1794130855776.jpg',
    hasVariants: false
  }
];

export const initialCustomers: Customer[] = [
  {
    id: 'cust-1',
    name: 'الحاج التهامي الفاسي',
    phone: '0661234567',
    email: 'touhami.fassi@menara.ma',
    points: 340,
    balance: 285.50, // عليه كريدي
    tier: 'Platinum',
    totalSpent: 4250,
    ordersCount: 42,
    createdAt: '2026-01-10',
    notes: 'زبون دائم بالدرب - يسدد كل بداية شهر'
  },
  {
    id: 'cust-2',
    name: 'السيدة فاطمة الزهراء العلمي',
    phone: '0662894512',
    email: 'fz.alami@gmail.com',
    points: 190,
    balance: 140.00, // عليها كريدي
    tier: 'Gold',
    totalSpent: 2180,
    ordersCount: 26,
    createdAt: '2026-02-15',
    notes: 'حساب الأسرة الأسبوعي'
  },
  {
    id: 'cust-3',
    name: 'كريم التازي',
    phone: '0663114477',
    email: 'karim.tazi@hotmail.com',
    points: 120,
    balance: 0, // خالص
    tier: 'Silver',
    totalSpent: 1350,
    ordersCount: 18,
    createdAt: '2026-03-01',
    notes: 'خالص الحساب دائماً نقدياً'
  },
  {
    id: 'cust-4',
    name: 'عبد الرحيم بنسودة (النجار)',
    phone: '0670554433',
    points: 85,
    balance: 450.00, // عليه كريدي
    tier: 'Silver',
    totalSpent: 920,
    ordersCount: 14,
    createdAt: '2026-02-01',
    notes: 'ورشة النجارة بالحي'
  },
  {
    id: 'cust-5',
    name: 'الأستاذ هشام البوعناني',
    phone: '0664889900',
    points: 210,
    balance: 0, // خالص
    tier: 'Gold',
    totalSpent: 2800,
    ordersCount: 31,
    createdAt: '2026-01-20',
    notes: 'أستاذ بالثانوية المجاورة'
  }
];

export const initialCreditTransactions: CreditTransaction[] = [
  {
    id: 'cred-tx-1',
    customerId: 'cust-1',
    customerName: 'الحاج التهامي الفاسي',
    type: 'debt',
    amount: 185.50,
    date: '2026-03-28T10:15:00',
    notes: 'زيت لوسيور 5 لتر + قالب سكر + شاي السبع',
    previousBalance: 100.00,
    newBalance: 285.50,
    recordedBy: 'الحاج رشيد (المدير)'
  },
  {
    id: 'cred-tx-2',
    customerId: 'cust-1',
    customerName: 'الحاج التهامي الفاسي',
    type: 'payment',
    amount: 200.00,
    date: '2026-03-25T17:30:00',
    notes: 'دفعة سداد نقدية من حساب الشهر السابق',
    previousBalance: 300.00,
    newBalance: 100.00,
    recordedBy: 'أمين التازي (كاشير)'
  },
  {
    id: 'cred-tx-3',
    customerId: 'cust-2',
    customerName: 'السيدة فاطمة الزهراء العلمي',
    type: 'debt',
    amount: 140.00,
    date: '2026-03-29T11:45:00',
    notes: 'دقيق الفينو 10 كلغ + حليب سليم + بيض بلدي',
    previousBalance: 0,
    newBalance: 140.00,
    recordedBy: 'الحاج رشيد (المدير)'
  },
  {
    id: 'cred-tx-4',
    customerId: 'cust-4',
    customerName: 'عبد الرحيم بنسودة (النجار)',
    type: 'debt',
    amount: 450.00,
    date: '2026-03-27T19:20:00',
    notes: 'سلعة الأسبوع: زيت، قهوة، معلبات تونة ومصبرات',
    previousBalance: 0,
    newBalance: 450.00,
    recordedBy: 'الحاج رشيد (المدير)'
  }
];

export const initialUsers: AppUser[] = [
  {
    id: 'user-admin',
    name: 'الحاج رشيد (المدير)',
    role: 'manager',
    pin: '1234',
    avatar: '👨‍💼',
    active: true,
    createdAt: '2026-01-01'
  },
  {
    id: 'user-cashier-1',
    name: 'أمين التازي (كاشير)',
    role: 'cashier',
    pin: '0000',
    avatar: '🧑‍💻',
    active: true,
    createdAt: '2026-01-15'
  }
];

export const DEFAULT_THEFT_ALERT_SETTINGS: TheftAlertSettings = {
  enabled: true,
  enableSirenSound: true,
  enablePushNotification: true,
  requireManagerPinToDismiss: true,
  cashShortageThreshold: 20,
  suspiciousPayoutThreshold: 200,
  suspiciousRefundThreshold: 100,
  highDiscountPercentThreshold: 25,
  stockShrinkageUnitsThreshold: 5,
  cartVoidAmountThreshold: 50
};

export const initialSettings: StoreSettings = {
  storeName: 'بقالة صفرو للمواد الغذائية',
  storeNameEn: 'Épicerie Sefrou - Alimentation Générale',
  taxNumber: 'IF: 52189403 · ICE: 002984123000074',
  commercialRegistration: 'RC Sefrou: 14829',
  phone: '+212 5 35 66 12 84',
  email: 'contact@epicerie-sefrou.ma',
  address: 'المغرب - صفرو، شارع الحسن الثاني - قرب باب المقام',
  currency: 'MAD',
  currencySymbol: 'د.م',
  taxRate: 10,
  receiptHeaderMsg: 'أهلاً وسهلاً بكم! نتمنى لكم تسوقاً سعيداً ومباركاً.',
  showReceiptHeaderMsg: true,
  receiptFooterMsg: 'شكراً لزيارتكم بقالة صفرو للمواد الغذائية! مرحباً بكم دائماً.',
  showReceiptFooterMsg: true,
  enableSoundEffects: true,
  enableCameraScanner: true,
  theme: 'dark',
  themeMode: 'dark',
  activePaletteId: 'emerald_oled',
  customPalettes: [],
  protectInventoryWithPin: true,
  protectSettingsWithPin: true,
  language: 'ar',
  receiptPaperWidth: '80mm',
  printerName: 'Xprinter XP-80C / Epson TM-T20 (80mm)',
  printerConnectionType: 'browser_dialog',
  autoPrintOnCheckout: false,
  printCustomerCopy: false,
  managerPin: '1234',
  bluetoothScannerEnabled: true,
  bluetoothScannerMode: 'hid_auto',
  bluetoothInterKeyDelayMs: 60,
  bluetoothSuffixKey: 'Enter',
  bluetoothAutoAddToCart: true,
  bluetoothSoundFeedback: true,
  bluetoothVibrationFeedback: true,
  goldPricePerGram: 750,
  zakatCashOnHand: 5000,
  zakatPayableDebts: 0,
  whatsappBusinessPhone: '+212661234567',
  cpuSettings: DEFAULT_CPU_SETTINGS,
  monthlyProfitTarget: 6000,
  theftAlertSettings: DEFAULT_THEFT_ALERT_SETTINGS
};

export const initialShift: Shift = {
  id: 'shift-101',
  shiftNumber: 101,
  cashierName: 'رشيد (أمين الصندوق)',
  openedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  startingCash: 500.0,
  status: 'open',
  cashTransactions: [
    {
      id: 'tx-1',
      date: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      type: 'pay_out',
      amount: 60.0,
      reason: 'أداء مستحقات موزع الخبز اليومي',
      cashierName: 'رشيد (أمين الصندوق)'
    }
  ]
};

export const initialBranches: Branch[] = [
  {
    id: 'branch-sefrou-main',
    name: 'فرع صفرو - باب المقام (الرئيسي)',
    nameEn: 'Sefrou - Bab El Maqam (Siège)',
    code: 'SEF-01',
    city: 'صفرو',
    address: 'شارع الحسن الثاني - قرب باب المقام، صفرو',
    phone: '+212 5 35 66 12 84',
    managerName: 'الحاج التهامي الفاسي',
    isMain: true,
    status: 'active',
    createdAt: '2026-01-15',
    syncStatus: 'synced',
    lastSyncAt: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
  },
  {
    id: 'branch-sefrou-bensffar',
    name: 'فرع صفرو - حي بن صفار (طريق فاس)',
    nameEn: 'Sefrou - Ben Sffar',
    code: 'SEF-02',
    city: 'صفرو',
    address: 'شارع محمد الخامس - حي بن صفار، صفرو',
    phone: '+212 5 35 66 45 10',
    managerName: 'عمر السليماني',
    isMain: false,
    status: 'active',
    createdAt: '2026-02-01',
    syncStatus: 'synced',
    lastSyncAt: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
  },
  {
    id: 'branch-fes-saada',
    name: 'فرع فاس - المدينة الجديدة (حي السعادة)',
    nameEn: 'Fès - Ville Nouvelle',
    code: 'FES-01',
    city: 'فاس',
    address: 'شارع علال بن عبد الله - حي السعادة، فاس',
    phone: '+212 5 35 73 20 44',
    managerName: 'فاطمة الزهراء العلمي',
    isMain: false,
    status: 'active',
    createdAt: '2026-02-20',
    syncStatus: 'synced',
    lastSyncAt: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
  }
];

export const initialTransfers: BranchTransfer[] = [
  {
    id: 'tr-1',
    transferNumber: 'TR-101',
    date: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    fromBranchId: 'branch-sefrou-main',
    fromBranchName: 'فرع صفرو - باب المقام (الرئيسي)',
    toBranchId: 'branch-sefrou-bensffar',
    toBranchName: 'فرع صفرو - حي بن صفار (طريق فاس)',
    productId: 'prod-1',
    productName: 'زيت زيتون واد سوس بكر ممتاز (1 لتر)',
    quantity: 15,
    unit: 'liter',
    status: 'completed',
    notes: 'إمداد فرع بن صفار بنقص زيت الزيتون',
    createdBy: 'الحاج التهامي'
  },
  {
    id: 'tr-2',
    transferNumber: 'TR-102',
    date: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    fromBranchId: 'branch-sefrou-main',
    fromBranchName: 'فرع صفرو - باب المقام (الرئيسي)',
    toBranchId: 'branch-fes-saada',
    toBranchName: 'فرع فاس - المدينة الجديدة (حي السعادة)',
    productId: 'prod-4',
    productName: 'شاي أخضر الصويري ممتاز (200g)',
    quantity: 30,
    unit: 'piece',
    status: 'completed',
    notes: 'شحنة أتاي الصويري الأسبوعية لفرع فاس',
    createdBy: 'الحاج التهامي'
  }
];

export const initialActivityLogs: ActivityLogItem[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    category: 'auth_login',
    title: 'تسجيل دخول: الحاج رشيد (المدير)',
    description: 'تسجيل الدخول إلى نقطة البيع بصلاحيات الإدارة الكاملة',
    actor: 'الحاج رشيد',
    actorRole: 'manager',
    severity: 'info'
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 85 * 60 * 1000).toISOString(),
    category: 'sale_large',
    title: 'إتمام عملية بيع كبرى (340.00 د.م)',
    description: 'فاتورة #KD-1024 بقيمة إجمالية 340.00 د.م (8 مواد غذائية متنوعة)',
    actor: 'أمين التازي',
    actorRole: 'cashier',
    amount: 340.0,
    severity: 'success',
    metadata: {
      orderNumber: '#KD-1024',
      details: 'طريقة الدفع: نقداً - العميل: الحاج التهامي السملالي'
    }
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    category: 'inventory_major',
    title: 'توريد جوهري في المخزون (+50 لتر)',
    description: 'توريد وتحديث رصيد زيت زيتون واد سوس بكر ممتاز بمقدار +50 لتر (الرصيد الجديد: 62 لتر)',
    actor: 'الحاج رشيد',
    actorRole: 'manager',
    severity: 'warning',
    metadata: {
      productName: 'زيت زيتون واد سوس بكر ممتاز (1 لتر)',
      quantityChange: 50,
      previousStock: 12,
      newStock: 62,
      details: 'فاتورة المورد #SUP-882'
    }
  },
  {
    id: 'log-4',
    timestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    category: 'auth_login',
    title: 'تسجيل دخول: أمين التازي (كاشير)',
    description: 'بدء مناوبة العمل وجلسة الكاشير الصباحية',
    actor: 'أمين التازي',
    actorRole: 'cashier',
    severity: 'info'
  },
  {
    id: 'log-5',
    timestamp: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
    category: 'inventory_major',
    title: 'تسجيل إتلاف مخزون (-5 حبات)',
    description: 'إتلاف -5 حبات حليب سنطرال معقم طازج UHT لانتهاء الصلاحية',
    actor: 'الحاج رشيد',
    actorRole: 'manager',
    severity: 'warning',
    metadata: {
      productName: 'حليب سنطرال معقم طازج UHT (1 لتر)',
      quantityChange: -5,
      previousStock: 50,
      newStock: 45,
      details: 'جرد أسبوعي دوري لتواريخ الصلاحية'
    }
  }
];

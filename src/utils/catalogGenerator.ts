import { Product, UnitType } from '../types';

/**
 * Generator for 2,000+ realistic Moroccan grocery items
 * Spanning multiple authentic Moroccan grocery departments
 */
export function generate2000MoroccanProducts(count: number = 2000): Omit<Product, 'id'>[] {
  const categories = [
    { id: 'cat-oils-grains', name: 'زيوت ومواد الطبخ', nameEn: 'Huiles & Cuisine' },
    { id: 'cat-tea-sugar', name: 'شاي وسكر ومشروبات', nameEn: 'Thé & Boissons' },
    { id: 'cat-grains-flour', name: 'حبوب ودقيق وقطاني', nameEn: 'Couscous & Farines' },
    { id: 'cat-dairy', name: 'ألبان وأجبان', nameEn: 'Produits Laitiers' },
    { id: 'cat-canned', name: 'معلبات ومصبرات', nameEn: 'Conserves & Sauces' },
    { id: 'cat-biscuits', name: 'بسكويت وحلويات', nameEn: 'Biscuits & Confiserie' },
    { id: 'cat-cleaning', name: 'مواد التنظيف والغسيل', nameEn: 'Produits d’Entretien' },
    { id: 'cat-spices', name: 'توابل وعطارة مغربية', nameEn: 'Épices Marocaines' }
  ];

  const brandNames = [
    'واد سوس', 'لوسيور', 'عافية', 'ميمونة', 'داري', 'سنطرال', 'جودة', 'أنكور', 'عائشة',
    'بيمو', 'هنريس', 'طون إيزابيل', 'أتاي سلطان', 'السبع', 'الصويري', 'سيد علي', 'عين سايس',
    'أومو', 'تيد', 'ماجيكس', 'أكسيون', 'كروان', 'لافاش كيري', 'جبال', 'نمر', 'فاسيلي'
  ];

  const itemTemplates = [
    { prefix: 'زيت زيتون بكر ممتاز', prefixEn: 'Huile d’Olive Vierge Extra', catId: 'cat-oils-grains', unit: 'liter' as UnitType, minPrice: 65, maxPrice: 95 },
    { prefix: 'زيت المائدة نباتي', prefixEn: 'Huile de Table Végétale', catId: 'cat-oils-grains', unit: 'liter' as UnitType, minPrice: 16, maxPrice: 38 },
    { prefix: 'شاي أخضر صويري ممتاز', prefixEn: 'Thé Vert Souiri Supérieur', catId: 'cat-tea-sugar', unit: 'piece' as UnitType, minPrice: 12, maxPrice: 28 },
    { prefix: 'قالب سكر تقليدي', prefixEn: 'Pain de Sucre Traditionnel', catId: 'cat-tea-sugar', unit: 'piece' as UnitType, minPrice: 11, maxPrice: 15 },
    { prefix: 'مشروب غازي هاواي', prefixEn: 'Soda Hawai Tropical', catId: 'cat-tea-sugar', unit: 'piece' as UnitType, minPrice: 6, maxPrice: 12 },
    { prefix: 'مشروب بومس تفاح', prefixEn: 'Boisson Pomms Pomme', catId: 'cat-tea-sugar', unit: 'piece' as UnitType, minPrice: 6, maxPrice: 12 },
    { prefix: 'كسكس مغربي فاخر', prefixEn: 'Couscous Marocain Fin', catId: 'cat-grains-flour', unit: 'piece' as UnitType, minPrice: 11, maxPrice: 18 },
    { prefix: 'دقيق القمح اللين الممتاز', prefixEn: 'Farine de Blé Tendre Supérieure', catId: 'cat-grains-flour', unit: 'kg' as UnitType, minPrice: 4.5, maxPrice: 10 },
    { prefix: 'سميد متوسط للحرشة والكسكس', prefixEn: 'Semoule Moyenne pour Harcha', catId: 'cat-grains-flour', unit: 'kg' as UnitType, minPrice: 9.5, maxPrice: 14 },
    { prefix: 'عدس مغربي بلدي منقى', prefixEn: 'Lentilles Locales Triées', catId: 'cat-grains-flour', unit: 'kg' as UnitType, minPrice: 16, maxPrice: 26 },
    { prefix: 'حمص مغربي بلدي', prefixEn: 'Pois Chiches Marocains', catId: 'cat-grains-flour', unit: 'kg' as UnitType, minPrice: 18, maxPrice: 28 },
    { prefix: 'حليب معقم طازج UHT', prefixEn: 'Lait Frais Stérilisé UHT', catId: 'cat-dairy', unit: 'liter' as UnitType, minPrice: 7, maxPrice: 11 },
    { prefix: 'لبن بلدي رايب', prefixEn: 'Lben Traditionnel Frais', catId: 'cat-dairy', unit: 'liter' as UnitType, minPrice: 6.5, maxPrice: 9 },
    { prefix: 'جبن أحمر كروان إيدام', prefixEn: 'Fromage Rouge Couronne Edam', catId: 'cat-dairy', unit: 'kg' as UnitType, minPrice: 95, maxPrice: 135 },
    { prefix: 'سردين معلب بالزيت النباتي', prefixEn: 'Sardines Marocaines à l’Huile', catId: 'cat-canned', unit: 'piece' as UnitType, minPrice: 5.5, maxPrice: 9 },
    { prefix: 'طماطم مصبرة مركزة', prefixEn: 'Double Concentré de Tomates', catId: 'cat-canned', unit: 'piece' as UnitType, minPrice: 4, maxPrice: 14 },
    { prefix: 'هريسة مغربية حارة أصيلة', prefixEn: 'Harissa Marocaine Traditionnelle', catId: 'cat-canned', unit: 'piece' as UnitType, minPrice: 5, maxPrice: 12 },
    { prefix: 'بسكويت هنريس الشاي الأصيل', prefixEn: 'Biscuits Henry’s Original', catId: 'cat-biscuits', unit: 'piece' as UnitType, minPrice: 2, maxPrice: 5 },
    { prefix: 'بسكويت شوكولاتة ميريندينا', prefixEn: 'Gâteau Chocolat Merendina', catId: 'cat-biscuits', unit: 'piece' as UnitType, minPrice: 2.5, maxPrice: 4 },
    { prefix: 'مسحوق غسيل آلي مركز', prefixEn: 'Lessive en Poudre Concentrée', catId: 'cat-cleaning', unit: 'piece' as UnitType, minPrice: 22, maxPrice: 65 },
    { prefix: 'ماء جافيل معقم ومطهر', prefixEn: 'Eau de Javel Désinfectante', catId: 'cat-cleaning', unit: 'liter' as UnitType, minPrice: 6, maxPrice: 15 },
    { prefix: 'زعفران حر تالوين بلدي', prefixEn: 'Safran Pur de Taliouine', catId: 'cat-spices', unit: 'piece' as UnitType, minPrice: 35, maxPrice: 75 },
    { prefix: 'كمون مغربي بلدي مطحون', prefixEn: 'Cumin Marocain Moulu', catId: 'cat-spices', unit: 'kg' as UnitType, minPrice: 70, maxPrice: 120 }
  ];

  const sizes = ['250g', '500g', '1kg', '2kg', '5kg', '1L', '2L', '5L', 'عبوة عائلية', 'حجم صغير'];
  const colors = ['#059669', '#2563EB', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0D9488', '#4B5563'];

  const generated: Omit<Product, 'id'>[] = [];

  for (let i = 0; i < count; i++) {
    const tmpl = itemTemplates[i % itemTemplates.length];
    const brand = brandNames[Math.floor(i / itemTemplates.length) % brandNames.length];
    const size = sizes[(i * 3) % sizes.length];
    const itemNum = Math.floor(i / (itemTemplates.length * brandNames.length)) + 1;

    const basePrice = Number((tmpl.minPrice + ((i * 7) % (tmpl.maxPrice - tmpl.minPrice))).toFixed(2));
    const costPrice = Number((basePrice * 0.72).toFixed(2));
    const stock = 15 + ((i * 17) % 250);
    const lowStockThreshold = 5 + (i % 15);

    // Realistic unique EAN-13 Moroccan barcode starting with 611
    const barcodeSeq = String(100000000 + i).padStart(9, '0');
    const barcode = `611${barcodeSeq}`;
    const sku = `SEF-${tmpl.catId.replace('cat-', '').toUpperCase().slice(0, 3)}-${String(i + 1).padStart(4, '0')}`;

    const numSuffix = itemNum > 1 ? ` #${itemNum}` : '';

    generated.push({
      name: `${tmpl.prefix} ${brand} (${size})${numSuffix}`,
      nameEn: `${tmpl.prefixEn} ${brand} ${size}${numSuffix}`,
      sku,
      barcode,
      categoryId: tmpl.catId,
      price: basePrice,
      costPrice,
      stock,
      lowStockThreshold,
      unitType: tmpl.unit,
      color: colors[i % colors.length],
      hasVariants: false
    });
  }

  return generated;
}

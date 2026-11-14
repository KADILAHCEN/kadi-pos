import {
  DeliveryZone,
  Product,
  RemoteOrder,
  RemoteOrderItem,
  RemoteOrderStatus,
  StoreSettings
} from '../types';

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { id: 'zone-douar', name: 'الدوار (فابور)', fee: 0, active: true, estimatedMinutes: 15 },
  { id: 'zone-center', name: 'المركز', fee: 5, active: true, estimatedMinutes: 25 },
  { id: 'zone-far', name: 'بعيد', fee: 10, active: true, estimatedMinutes: 45 }
];

export interface SharedCatalogPayload {
  storeName: string;
  phone: string;
  whatsappPhone: string;
  currencySymbol: string;
  zones: DeliveryZone[];
  products: Array<{
    id: string;
    name: string;
    price: number;
    costPrice: number;
    stock: number;
    image?: string;
    unitType?: string;
  }>;
  generatedAt: string;
}

export const PUBLIC_CATALOG_SNAPSHOT_KEY = 'kadi_pos_public_catalog_snapshot_v1';

export function cleanPhoneForWhatsApp(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) {
    // Default Morocco country code +212 when local 06/07/05 entered
    return `212${digits.slice(1)}`;
  }
  return digits;
}

export interface CompactCatalogData {
  s: string; // storeName
  w: string; // whatsappPhone
  c: string; // currencySymbol
  z: Array<{ id: string; n: string; f: number; m?: number }>; // zones
  p: Array<{ id: string; n: string; pr: number; img?: string }>; // products
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function decodeCatalogFromHash(): SharedCatalogPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const hash = window.location.hash || '';
    const match = hash.match(/cat=([A-Za-z0-9\-_]+)/);
    if (!match) return null;
    const compact = JSON.parse(fromBase64Url(match[1])) as CompactCatalogData;
    return {
      storeName: compact.s || 'متجر Kadi POS',
      phone: compact.w || '',
      whatsappPhone: compact.w || '',
      currencySymbol: compact.c || 'د.م',
      zones: (compact.z || []).map((z) => ({
        id: z.id,
        name: z.n,
        fee: z.f,
        active: true,
        estimatedMinutes: z.m
      })),
      products: (compact.p || []).map((p) => ({
        id: p.id,
        name: p.n,
        price: p.pr,
        costPrice: 0,
        stock: 99,
        image: p.img
      })),
      generatedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function buildCatalogLink(
  products: Product[],
  zones: DeliveryZone[],
  settings: StoreSettings,
  currencySymbol: string
): { url: string; payload: SharedCatalogPayload } {
  const activeZones = zones.filter((z) => z.active);
  const catalogProducts = products
    .filter((p) => (p.stock || 0) > 0)
    .slice(0, 60)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      costPrice: p.costPrice,
      stock: p.stock,
      image: p.image && (p.image.startsWith('http') || p.image.startsWith('/')) ? p.image : undefined,
      unitType: p.unitType
    }));

  const payload: SharedCatalogPayload = {
    storeName: settings.storeName || 'متجر Kadi POS',
    phone: settings.phone || '',
    whatsappPhone: settings.whatsappBusinessPhone || settings.phone || '',
    currencySymbol,
    zones: activeZones,
    products: catalogProducts,
    generatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(PUBLIC_CATALOG_SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota
  }

  let baseUrl = 'https://kadi-pos.app';
  if (typeof window !== 'undefined' && window.location) {
    baseUrl = `${window.location.origin}${window.location.pathname}`;
  }

  // Embed compact payload in hash (#cat=...) so link works on any customer phone
  let hashSuffix = '';
  try {
    const compact: CompactCatalogData = {
      s: payload.storeName,
      w: payload.whatsappPhone,
      c: payload.currencySymbol,
      z: activeZones.slice(0, 12).map((z) => ({
        id: z.id,
        n: z.name,
        f: z.fee,
        m: z.estimatedMinutes
      })),
      p: catalogProducts.slice(0, 30).map((p) => ({
        id: p.id,
        n: p.name,
        pr: p.price,
        img: p.image && p.image.length < 220 ? p.image : undefined
      }))
    };
    const encoded = toBase64Url(JSON.stringify(compact));
    if (encoded.length < 6000) {
      hashSuffix = `#cat=${encoded}`;
    }
  } catch {
    // fallback cleanly without hash
  }

  const url = `${baseUrl}?catalog=1&store=${encodeURIComponent(payload.storeName)}${hashSuffix}`;
  return { url, payload };
}

export function buildCustomerWhatsAppOrderUrl(
  merchantWhatsappPhone: string,
  params: {
    storeName: string;
    customerName: string;
    customerPhone: string;
    customerAddress?: string;
    zone: DeliveryZone;
    items: RemoteOrderItem[];
    itemsSubtotal: number;
    grandTotal: number;
    currencySymbol: string;
    notes?: string;
  }
): { url: string; message: string } {
  const itemsLines = params.items
    .map(
      (it, idx) =>
        `${idx + 1}. ${it.productName} × ${it.quantity} = ${it.total.toFixed(2)} ${params.currencySymbol}`
    )
    .join('\n');

  const deliveryText =
    params.zone.fee === 0
      ? `${params.zone.name} (فابور - 0.00 ${params.currencySymbol})`
      : `${params.zone.name} (+${params.zone.fee.toFixed(2)} ${params.currencySymbol})`;

  const message = [
    `🛒 *طلب جديد من كتالوج ${params.storeName}*`,
    `👤 *الاسم:* ${params.customerName}`,
    params.customerPhone ? `📞 *الهاتف:* ${params.customerPhone}` : '',
    params.customerAddress ? `📍 *العنوان:* ${params.customerAddress}` : '',
    `🚚 *منطقة التوصيل:* ${deliveryText}`,
    ``,
    `📦 *المنتجات المختارة:*`,
    itemsLines,
    ``,
    `🧾 *مجموع السلع:* ${params.itemsSubtotal.toFixed(2)} ${params.currencySymbol}`,
    `🚚 *التوصيل:* ${params.zone.fee.toFixed(2)} ${params.currencySymbol}`,
    `💰 *المجموع النهائي:* ${params.grandTotal.toFixed(2)} ${params.currencySymbol}`,
    params.notes ? `📝 *ملاحظة:* ${params.notes}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const cleanWa = cleanPhoneForWhatsApp(merchantWhatsappPhone);
  const url = cleanWa
    ? `https://wa.me/${cleanWa}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return { url, message };
}

export function buildCatalogShareWhatsAppUrl(
  catalogUrl: string,
  storeName: string,
  zones: DeliveryZone[],
  currencySymbol: string,
  productsCount: number
): { url: string; statusText: string } {
  const zonesList = zones
    .filter((z) => z.active)
    .map((z) =>
      z.fee === 0 ? `• ${z.name}: فابور` : `• ${z.name}: ${z.fee} ${currencySymbol}`
    )
    .join('\n');

  const statusText = [
    `🛍️ *مرحباً بكم في كتالوج ${storeName}*`,
    `تصفحوا منتجاتنا (${productsCount} منتج بالثمن والصور) واطلبوا مباشرة عبر واتساب:`,
    `🔗 ${catalogUrl}`,
    ``,
    zonesList ? `🚚 *مناطق التوصيل:*\n${zonesList}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  return {
    url: `https://wa.me/?text=${encodeURIComponent(statusText)}`,
    statusText
  };
}

export function buildOrderStatusWhatsAppUrl(
  order: RemoteOrder,
  targetStatus: RemoteOrderStatus,
  storeName: string,
  currencySymbol: string
): { url: string; message: string } {
  const itemsPreview = order.items
    .map((it) => `• ${it.productName} (${it.quantity})`)
    .join('\n');

  let headline = '';
  if (targetStatus === 'on_the_way') {
    headline = `🚚 *السلام عليكم ${order.customerName}، الطلب ديالك #${order.orderNumber} في الطريق إليك الآن!*`;
  } else if (targetStatus === 'delivered') {
    headline = `✅ *السلام عليكم ${order.customerName}، تم توصيل طلبك #${order.orderNumber} بنجاح. شكراً لتعاملكم مع ${storeName}!*`;
  } else if (targetStatus === 'rejected') {
    headline = `⚠️ *السلام عليكم ${order.customerName}، نعتذر عن عدم توفر الطلب #${order.orderNumber} حالياً.*`;
  } else {
    headline = `📥 *تم استلام طلبك #${order.orderNumber} في ${storeName}*`;
  }

  const message = [
    headline,
    ``,
    itemsPreview,
    `📍 منطقة التوصيل: ${order.deliveryZoneName} (${order.deliveryFee.toFixed(2)} ${currencySymbol})`,
    `💰 المجموع: ${order.grandTotal.toFixed(2)} ${currencySymbol}`
  ].join('\n');

  const cleanWa = cleanPhoneForWhatsApp(order.customerPhone);
  const url = cleanWa
    ? `https://wa.me/${cleanWa}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return { url, message };
}

export const REMOTE_ORDERS_CHANNEL = 'kadi_pos_remote_orders';

export interface ParsedWhatsAppOrderResult {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  zoneId?: string;
  matchedItems: Record<string, number>;
  matchedCount: number;
}

export function parseWhatsAppOrderMessage(
  rawText: string,
  products: Product[],
  zones: DeliveryZone[]
): ParsedWhatsAppOrderResult {
  const text = (rawText || '').trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let customerName = '';
  let customerPhone = '';
  let customerAddress = '';
  let notes = '';
  let zoneId: string | undefined;
  const matchedItems: Record<string, number> = {};

  const stripMd = (s: string) => s.replace(/[*_`]/g, '').trim();

  for (const rawLine of lines) {
    const clean = stripMd(rawLine);

    if (/الاسم\s*:|name\s*:/i.test(clean)) {
      const val = clean.split(':').slice(1).join(':').trim();
      if (val) customerName = val;
      continue;
    }

    if (/الهاتف\s*:|phone\s*:|واتساب\s*:|tel\s*:/i.test(clean)) {
      const val = clean.split(':').slice(1).join(':').trim();
      if (val) customerPhone = val;
      continue;
    }

    if (/العنوان\s*:|address\s*:|الحي\s*:/i.test(clean)) {
      const val = clean.split(':').slice(1).join(':').trim();
      if (val) customerAddress = val;
      continue;
    }

    if (/ملاحظة\s*:|note\s*:/i.test(clean)) {
      const val = clean.split(':').slice(1).join(':').trim();
      if (val) notes = val;
      continue;
    }

    if (/منطقة التوصيل\s*:|التوصيل\s*:|zone\s*:/i.test(clean) && !/التوصيل\s*:\s*[\d.]+\s*(د\.م|MAD|DH)?$/i.test(clean)) {
      const val = clean.split(':').slice(1).join(':').trim().toLowerCase();
      const matchedZone = zones.find(
        (z) =>
          val.includes(z.name.toLowerCase()) ||
          z.name.toLowerCase().includes(val.split('(')[0].trim())
      );
      if (matchedZone) {
        zoneId = matchedZone.id;
      }
      continue;
    }

    // Match product lines like "1. زيت زيتون × 2 = 164.00 د.م" or "2 x شاي أخضر"
    const normalizedLine = clean.replace(/^\d+[.)\-]\s*/, '').replace(/^[•\-*]\s*/, '');
    let qty = 1;
    let candidateName = normalizedLine;

    const timesRight = normalizedLine.match(/^(.+?)\s*[×xX*]\s*(\d+(?:\.\d+)?)(?:\s*=.*)?$/);
    const timesLeft = normalizedLine.match(/^(\d+(?:\.\d+)?)\s*[×xX*]\s*(.+?)(?:\s*=.*)?$/);

    if (timesRight) {
      candidateName = timesRight[1].trim();
      qty = Math.max(1, parseFloat(timesRight[2]) || 1);
    } else if (timesLeft) {
      qty = Math.max(1, parseFloat(timesLeft[1]) || 1);
      candidateName = timesLeft[2].trim();
    }

    const candLower = candidateName.toLowerCase();
    if (candLower.length >= 2) {
      const matchedProd =
        products.find((p) => p.name.toLowerCase() === candLower) ||
        products.find(
          (p) =>
            p.name.toLowerCase().includes(candLower) ||
            candLower.includes(p.name.toLowerCase())
        );

      if (matchedProd) {
        matchedItems[matchedProd.id] = Number(
          ((matchedItems[matchedProd.id] || 0) + qty).toFixed(2)
        );
      }
    }
  }

  // Fallback phone extraction if not labeled
  if (!customerPhone) {
    const phoneMatch = text.match(/(?:\+212|00212|0)[567]\d{8}/);
    if (phoneMatch) {
      customerPhone = phoneMatch[0];
    }
  }

  // Fallback zone extraction if zone name appears anywhere
  if (!zoneId) {
    const lowerText = text.toLowerCase();
    const zMatch = zones.find((z) => lowerText.includes(z.name.toLowerCase()));
    if (zMatch) zoneId = zMatch.id;
  }

  return {
    customerName,
    customerPhone,
    customerAddress,
    notes,
    zoneId,
    matchedItems,
    matchedCount: Object.keys(matchedItems).length
  };
}

export function openExternalLinkSafely(url: string): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

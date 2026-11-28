import { Product } from '../types';

export type PriceAlertStatus = 'loss' | 'zero_profit' | 'healthy' | 'none';

export interface PriceAlertLogEntry {
  id: string;
  productId?: string;
  productName: string;
  costPrice: number;
  sellPrice: number;
  type: 'loss' | 'zero_profit' | 'decimal_mismatch';
  timestamp: string;
  fixed?: boolean;
}

export interface CentimeChoiceSuggestion {
  prompt: string;
  option1Label: string;
  option1Patch: { costPrice?: number; price?: number };
  option2Label: string;
  option2Patch: { costPrice?: number; price?: number };
}

export interface OldStockPriceIssue {
  product: Product;
  reason: 'loss' | 'zero_profit' | 'zero_price' | 'decimal_mismatch';
  message: string;
  suggestedPrice: number;
  suggestedCostPrice: number;
  fixLabel: string;
}

const STORAGE_KEY = 'kadi_price_alerts_v1';
export const PRICE_ALERTS_CHANGED_EVENT = 'kadi:price-alerts-changed';

export function normalizeNumericDigits(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function sanitizeDecimalInput(raw: string): string {
  const normalized = normalizeNumericDigits(raw).replace(/٫/g, '.');
  let result = '';
  let hasSep = false;
  for (const ch of normalized) {
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if ((ch === '.' || ch === ',') && !hasSep) {
      result += ch;
      hasSep = true;
    }
  }
  return result;
}

export function parseMoroccanNumber(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (!raw) return 0;
  const cleaned = normalizeNumericDigits(String(raw)).trim().replace(/٫/g, '.').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatMoroccanPriceTranslation(dh: number): {
  dh: number;
  centimes: number;
  rial: number;
  dhLabel: string;
  centimesLabel: string;
  rialLabel: string;
} {
  const safe = Number.isFinite(dh) && dh > 0 ? dh : 0;
  const centimes = Math.round(safe * 100);
  const rial = Math.round(safe * 20);
  const dhLabel = Number.isInteger(safe) ? `${safe}` : safe.toFixed(2);
  return {
    dh: safe,
    centimes,
    rial,
    dhLabel: `${dhLabel} د.م`,
    centimesLabel: `${centimes} سنتيم`,
    rialLabel: `${rial} ريال`
  };
}

export function evaluatePriceAlert(
  costPrice: number,
  sellPrice: number
): {
  status: PriceAlertStatus;
  profit: number;
  marginPct: number;
} {
  const safeCost = Number.isFinite(costPrice) && costPrice > 0 ? costPrice : 0;
  const safeSell = Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : 0;

  if (safeCost === 0 && safeSell === 0) {
    return { status: 'none', profit: 0, marginPct: 0 };
  }

  const profit = Number((safeSell - safeCost).toFixed(2));
  const marginPct = safeSell > 0 ? Number(((profit / safeSell) * 100).toFixed(1)) : 0;

  if (safeCost > 0 && safeSell < safeCost) {
    return { status: 'loss', profit, marginPct };
  }
  if (safeCost > 0 && safeSell === safeCost) {
    return { status: 'zero_profit', profit: 0, marginPct: 0 };
  }
  if (safeSell > safeCost) {
    return { status: 'healthy', profit, marginPct };
  }
  return { status: 'none', profit, marginPct };
}

export function detectCentimeChoices(
  costPrice: number,
  sellPrice: number
): CentimeChoiceSuggestion | null {
  const cost = Number.isFinite(costPrice) && costPrice > 0 ? costPrice : 0;
  const sell = Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : 0;

  // Case 1: Cost typed in centimes instead of DH (e.g. 130 typed when selling at 2 DH -> meant 1.30 DH)
  if (cost >= 50 && sell > 0 && cost > sell && cost / 100 < sell) {
    const inDh = Number((cost / 100).toFixed(2));
    return {
      prompt: 'واش قصدتي السنتيم ولا الدرهم؟',
      option1Label: `${inDh} د.م (${Math.round(cost)} سنتيم) ✅`,
      option1Patch: { costPrice: inDh },
      option2Label: `${cost} د.م`,
      option2Patch: { costPrice: cost }
    };
  }

  // Case 2: Decimal typed < 5 for cost while sell price is >= 10x larger (e.g. cost 1.30 vs 130 DH when sell is 150 DH)
  if (cost > 0 && cost < 5 && cost % 1 !== 0 && (sell === 0 || sell >= cost * 10)) {
    const times100 = Math.round(cost * 100);
    return {
      prompt: 'واش قصدتي؟',
      option1Label: `${cost.toFixed(2)} د.م (${times100} سنتيم)`,
      option1Patch: { costPrice: Number(cost.toFixed(2)) },
      option2Label: `${times100} د.م (${times100 * 20} ريال)`,
      option2Patch: { costPrice: times100 }
    };
  }

  // Case 3: Sell price typed as small decimal while cost >= 10x larger (e.g. cost 20 DH, typed sell 0.25 instead of 25 DH)
  if (sell > 0 && sell < 5 && sell % 1 !== 0 && cost >= sell * 10) {
    const times100 = Math.round(sell * 100);
    return {
      prompt: 'واش قصدتي ثمن البيع بالدرهم؟',
      option1Label: `${times100} د.م (${times100 * 20} ريال) ✅`,
      option1Patch: { price: times100 },
      option2Label: `${sell.toFixed(2)} د.م (${times100} سنتيم)`,
      option2Patch: { price: Number(sell.toFixed(2)) }
    };
  }

  return null;
}

export function auditOldStockPrices(products: Product[]): OldStockPriceIssue[] {
  const issues: OldStockPriceIssue[] = [];

  for (const p of products) {
    const price = Number(p.price) || 0;
    const cost = Number(p.costPrice) || 0;

    if (price <= 0) {
      const suggested = cost > 0 ? Number((cost + 1).toFixed(2)) : 1;
      issues.push({
        product: p,
        reason: 'zero_price',
        message: 'ثمن البيع صفر (0 د.م)',
        suggestedPrice: suggested,
        suggestedCostPrice: cost,
        fixLabel: `تعيين ${suggested} د.م`
      });
      continue;
    }

    if (cost >= 50 && cost > price && cost / 100 < price) {
      const fixedCost = Number((cost / 100).toFixed(2));
      issues.push({
        product: p,
        reason: 'decimal_mismatch',
        message: `فرق الفاصلة: الشراء ${cost} د.م > البيع ${price} د.م (غالباً ${fixedCost} د.م)`,
        suggestedPrice: price,
        suggestedCostPrice: fixedCost,
        fixLabel: `تحويل الشراء لـ ${fixedCost} د.م`
      });
      continue;
    }

    if (cost > 0 && price < cost) {
      const suggested = Number((cost + 1).toFixed(2));
      issues.push({
        product: p,
        reason: 'loss',
        message: `بيع بالخسارة: الشراء ${cost.toFixed(2)} د.م > البيع ${price.toFixed(2)} د.م`,
        suggestedPrice: suggested,
        suggestedCostPrice: cost,
        fixLabel: `زيد لـ ${suggested} د.م`
      });
      continue;
    }

    if (cost > 0 && price === cost) {
      const suggested = Number((cost + 1).toFixed(2));
      issues.push({
        product: p,
        reason: 'zero_profit',
        message: `بلا ربح: الشراء = البيع = ${price.toFixed(2)} د.م`,
        suggestedPrice: suggested,
        suggestedCostPrice: cost,
        fixLabel: `زيد +1 د.م (${suggested})`
      });
    }
  }

  return issues;
}

export function loadPriceAlerts(): PriceAlertLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function dispatchPriceAlertsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRICE_ALERTS_CHANGED_EVENT));
  }
}

export function sendBrowserPriceNotification(title: string, body: string): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        tag: `kadi-price-alert-${Date.now()}`
      });
    }
  } catch {
    // Ignore in environments where Notification constructor is restricted
  }
}

export function recordPriceAlert(
  entry: Omit<PriceAlertLogEntry, 'id' | 'timestamp'>
): PriceAlertLogEntry | null {
  try {
    const current = loadPriceAlerts();
    const now = Date.now();
    // Avoid recording identical duplicate within 10s
    const recentDuplicate = current.find(
      (item) =>
        item.productName === entry.productName &&
        item.costPrice === entry.costPrice &&
        item.sellPrice === entry.sellPrice &&
        now - new Date(item.timestamp).getTime() < 10_000
    );
    if (recentDuplicate) return recentDuplicate;

    const newItem: PriceAlertLogEntry = {
      ...entry,
      id: `pal-${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    const next = [newItem, ...current].slice(0, 60);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    dispatchPriceAlertsChanged();

    const lossDiff = Math.max(0, entry.costPrice - entry.sellPrice).toFixed(2);
    const notifTitle = '⚠️ تنبيه الأثمنة - Kadi POS';
    const notifBody =
      entry.type === 'loss'
        ? `${entry.productName}: راك كتبيع بالخسارة (-${lossDiff} د.م) | الشراء ${entry.costPrice} / البيع ${entry.sellPrice}`
        : `${entry.productName}: البيع بلا ربح (${entry.sellPrice} د.م)`;
    sendBrowserPriceNotification(notifTitle, notifBody);

    return newItem;
  } catch {
    return null;
  }
}

export function markPriceAlertFixed(productIdOrName: string): void {
  try {
    const current = loadPriceAlerts();
    const updated = current.filter(
      (item) => item.productId !== productIdOrName && item.productName !== productIdOrName
    );
    if (updated.length !== current.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      dispatchPriceAlertsChanged();
    }
  } catch {
    // ignore
  }
}

export function clearPriceAlerts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    dispatchPriceAlertsChanged();
  } catch {
    // ignore
  }
}

import { safeLocalStorageGet, safeLocalStorageSet } from './storage';

export type RemiseHistoryType = 'invoice' | 'manual' | 'offer' | 'buy' | 'save';

export interface RemiseWallet {
  company: string;
  collected: number;
  used: number;
  manual: number;
  fromInvoice: number;
  vendors: Record<string, number>;
  vendorCodes: Record<string, string>;
  offersProfit: number;
  goal?: number;
  updatedAt: string;
}

export interface RemiseHistoryEntry {
  id: string;
  date: string; // ISO string
  company: string;
  vendor: string;
  vendorCode?: string;
  invoiceNumber?: string;
  type: RemiseHistoryType;
  typeLabel: string;
  product: string;
  qty?: number;
  amount: number;
  brut?: number;
  net?: number;
  paid?: number;
  profit?: number;
  soldQty?: number;
  sellPrice?: number;
  note: string;
}

export interface RemiseBoxData {
  wallets: Record<string, RemiseWallet>;
  history: RemiseHistoryEntry[];
}

export const REMISE_STORAGE_KEY = 'kadi_remise_box_v1';

export const MANUAL_REMISE_TYPES = [
  'سامح ليا المورّد',
  'فلوس كاش عطاها ليا المورّد',
  'سلعة فابور (هدية)',
  'نقص في الثمن ما مكتوبش في الفاتورة',
  'رجع ليا فلوس'
] as const;

export const roundMoney = (val: number): number => {
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * 100) / 100;
};

export function computeInvoiceRemise(brut: number, net: number, paid: number): number {
  const b = Number.isFinite(brut) && brut > 0 ? brut : 0;
  const n = Number.isFinite(net) && net > 0 ? net : 0;
  const p = Number.isFinite(paid) && paid > 0 ? paid : 0;

  let remise = 0;
  if (b > 0 && n > 0 && b > n) {
    remise = b - n;
  }
  if (p > 0 && b > 0 && p < b) {
    remise = Math.max(remise, b - p);
  } else if (p > 0 && b === 0 && n > 0 && p < n) {
    remise = Math.max(remise, n - p);
  }
  return roundMoney(Math.max(0, remise));
}

export function getWalletAvailableBalance(wallet: RemiseWallet): number {
  return roundMoney(Math.max(0, wallet.collected - wallet.used));
}

export function getWalletStarCount(wallet: RemiseWallet): number {
  if (wallet.offersProfit > 200) return 5;
  if (wallet.collected > 1000) return 4;
  if (wallet.collected > 500) return 3;
  if (wallet.collected > 200) return 2;
  return 1;
}

export function createEmptyWallet(company: string): RemiseWallet {
  return {
    company: company.trim(),
    collected: 0,
    used: 0,
    manual: 0,
    fromInvoice: 0,
    vendors: {},
    vendorCodes: {},
    offersProfit: 0,
    updatedAt: new Date().toISOString()
  };
}

export function loadRemiseBoxData(): RemiseBoxData {
  try {
    const raw = safeLocalStorageGet(REMISE_STORAGE_KEY, '');
    if (!raw) {
      return { wallets: {}, history: [] };
    }
    const parsed = JSON.parse(raw) as Partial<RemiseBoxData>;
    const wallets: Record<string, RemiseWallet> = {};
    if (parsed.wallets && typeof parsed.wallets === 'object') {
      for (const [key, value] of Object.entries(parsed.wallets)) {
        if (!value || typeof value !== 'object') continue;
        const w = value as Partial<RemiseWallet>;
        const name = (w.company || key).trim();
        if (!name) continue;
        wallets[name] = {
          company: name,
          collected: roundMoney(Number(w.collected) || 0),
          used: roundMoney(Number(w.used) || 0),
          manual: roundMoney(Number(w.manual) || 0),
          fromInvoice: roundMoney(Number(w.fromInvoice) || 0),
          vendors: w.vendors && typeof w.vendors === 'object' ? { ...w.vendors } : {},
          vendorCodes: w.vendorCodes && typeof w.vendorCodes === 'object' ? { ...w.vendorCodes } : {},
          offersProfit: roundMoney(Number(w.offersProfit) || 0),
          goal: typeof w.goal === 'number' && Number.isFinite(w.goal) && w.goal > 0 ? roundMoney(w.goal) : undefined,
          updatedAt: typeof w.updatedAt === 'string' ? w.updatedAt : new Date().toISOString()
        };
      }
    }

    const history: RemiseHistoryEntry[] = Array.isArray(parsed.history)
      ? parsed.history
          .filter((item): item is RemiseHistoryEntry => !!item && typeof item === 'object' && typeof item.company === 'string')
          .map((item) => ({
            ...item,
            id: item.id || `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            amount: roundMoney(Number(item.amount) || 0),
            profit: typeof item.profit === 'number' ? roundMoney(item.profit) : undefined
          }))
      : [];

    return { wallets, history };
  } catch {
    return { wallets: {}, history: [] };
  }
}

export function saveRemiseBoxData(data: RemiseBoxData): void {
  try {
    safeLocalStorageSet(REMISE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

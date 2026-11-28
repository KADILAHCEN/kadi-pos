import { Customer, Order } from '../types';

export interface CustomerVisitInsight {
  visits: number;
  totalSpent: number;
  lastVisitIso: string | null;
  daysSinceLastVisit: number | null;
  isReturningCustomer: boolean;
  isAbsent15Days: boolean;
  whatsappWinBackHref: string | null;
}

const normalizeDigits = (phone?: string): string => (phone || '').replace(/\D+/g, '');

export function normalizePhoneForWhatsApp(rawPhone?: string): string | null {
  const cleanedRaw = (rawPhone || '').replace(/[^\d+]/g, '');
  if (!cleanedRaw) return null;
  let cleaned = cleanedRaw.replace(/^\+/, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = `212${cleaned.slice(1)}`;
  }
  return cleaned.length >= 8 ? cleaned : null;
}

export function computeCustomerVisitInsight(
  customer: Customer | null | undefined,
  orders: Order[],
  storeName = 'المحال'
): CustomerVisitInsight | null {
  if (!customer) return null;

  const custPhoneDigits = normalizeDigits(customer.phone);
  const matchingOrders = orders.filter((o) => {
    if (o.status !== 'completed') return false;
    if (o.customerId && o.customerId === customer.id) return true;
    if (custPhoneDigits.length >= 6 && o.customerPhone) {
      return normalizeDigits(o.customerPhone) === custPhoneDigits;
    }
    return false;
  });

  const latestOrderDateMs = matchingOrders.reduce((maxMs, o) => {
    const ms = Date.parse(o.date || '');
    return Number.isFinite(ms) && ms > maxMs ? ms : maxMs;
  }, 0);

  const storedLastVisitMs = customer.lastVisit ? Date.parse(customer.lastVisit) : NaN;
  let lastVisitMs = 0;
  if (Number.isFinite(storedLastVisitMs) && storedLastVisitMs > latestOrderDateMs) {
    lastVisitMs = storedLastVisitMs;
  } else if (latestOrderDateMs > 0) {
    lastVisitMs = latestOrderDateMs;
  } else if ((customer.ordersCount || 0) > 0 && customer.createdAt) {
    const createdMs = Date.parse(customer.createdAt);
    if (Number.isFinite(createdMs)) lastVisitMs = createdMs;
  }

  const lastVisitIso = lastVisitMs > 0 ? new Date(lastVisitMs).toISOString() : null;
  const daysSinceLastVisit =
    lastVisitMs > 0 ? Math.max(0, Math.floor((Date.now() - lastVisitMs) / 86_400_000)) : null;

  const ordersSpent = matchingOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
  const visits = Math.max(customer.ordersCount || 0, matchingOrders.length);
  const totalSpent = Math.max(customer.totalSpent || 0, Number(ordersSpent.toFixed(2)));

  const waPhone = normalizePhoneForWhatsApp(customer.phone);
  const message = `السلام عليكم ${customer.name}، توحشناك! عندنا سلعة جديدة ومميزة في ${storeName}، مرحبا بيك.`;
  const whatsappWinBackHref = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    : null;

  return {
    visits,
    totalSpent,
    lastVisitIso,
    daysSinceLastVisit,
    isReturningCustomer: visits > 0,
    isAbsent15Days: daysSinceLastVisit !== null && daysSinceLastVisit >= 15,
    whatsappWinBackHref
  };
}

export function computeCumulativeLoyaltyPoints(
  spendAmount: number,
  previousCarrySpend: number,
  pointsPer100: number,
  loyaltyEnabled: boolean
): { pointsEarned: number; nextCarrySpend: number } {
  const cleanCarry = Math.max(0, Number(previousCarrySpend) || 0);
  const cleanSpend = Math.max(0, Number(spendAmount) || 0);
  const cleanRate = Math.max(0, Number(pointsPer100) || 0);

  if (!loyaltyEnabled || cleanRate <= 0) {
    return { pointsEarned: 0, nextCarrySpend: cleanCarry };
  }

  const totalPool = cleanCarry + cleanSpend;
  const pointsEarned = Math.floor((totalPool / 100) * cleanRate + 1e-9);
  const consumedSpend = (pointsEarned * 100) / cleanRate;
  const nextCarrySpend = Number(Math.max(0, totalPool - consumedSpend).toFixed(2));

  return { pointsEarned, nextCarrySpend };
}

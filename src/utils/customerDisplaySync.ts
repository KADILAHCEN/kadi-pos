import { CartItem, Customer, Order, StoreSettings } from '../types';

export const CUSTOMER_DISPLAY_CHANNEL = 'kadi_pos_customer_display_v1';
export const CUSTOMER_DISPLAY_STORAGE_KEY = 'kadi_pos_customer_display_snapshot';

export interface CustomerDisplayLineItem {
  id: string;
  name: string;
  nameEn?: string;
  variantName?: string;
  price: number;
  quantity: number;
  unitType?: string;
  lineTotal: number;
  image?: string;
}

export interface CustomerDisplayCompletedOrder {
  orderNumber: string;
  grandTotal: number;
  paymentMethod: string;
  amountTendered?: number;
  changeAmount?: number;
  pointsEarned?: number;
  completedAt: string;
}

export interface CustomerDisplaySnapshot {
  updatedAt: string;
  storeName: string;
  storeLogo?: string;
  phone?: string;
  address?: string;
  welcomeMsg?: string;
  footerMsg?: string;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  customerName?: string;
  customerPoints?: number;
  items: CustomerDisplayLineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  totalItemsCount: number;
  completedOrder?: CustomerDisplayCompletedOrder;
}

export function buildCustomerDisplaySnapshot(params: {
  cart: CartItem[];
  cartSubtotal: number;
  cartDiscountTotal: number;
  cartTaxTotal: number;
  cartGrandTotal: number;
  selectedCustomer: Customer | null;
  settings: StoreSettings;
  currencySymbol: string;
  language: 'ar' | 'fr' | 'en';
  completedOrder?: Order | null;
}): CustomerDisplaySnapshot {
  const {
    cart,
    cartSubtotal,
    cartDiscountTotal,
    cartTaxTotal,
    cartGrandTotal,
    selectedCustomer,
    settings,
    currencySymbol,
    language,
    completedOrder
  } = params;

  const items: CustomerDisplayLineItem[] = cart.map((item) => {
    const modSum = (item.modifiers || []).reduce((mSum, m) => mSum + m.price, 0);
    const unitGross = (item.price + modSum) * item.quantity;
    let itemDisc = 0;
    if (item.itemDiscount && item.itemDiscount.value > 0) {
      itemDisc =
        item.itemDiscount.type === 'percent'
          ? unitGross * (item.itemDiscount.value / 100)
          : Math.min(unitGross, item.itemDiscount.value);
    }
    const lineTotal = Math.max(0, unitGross - itemDisc);

    return {
      id: item.id,
      name: item.productName,
      nameEn: item.productNameEn,
      variantName: item.variantName,
      price: item.price + modSum,
      quantity: item.quantity,
      unitType: item.unitType,
      lineTotal,
      image: item.image
    };
  });

  const totalItemsCount = cart.reduce((sum, it) => sum + it.quantity, 0);

  const welcomeMsg =
    (settings.showReceiptHeaderMsg ?? true) && settings.receiptHeaderMsg?.trim()
      ? settings.receiptHeaderMsg.trim()
      : undefined;

  const footerMsg =
    (settings.showReceiptFooterMsg ?? true) && settings.receiptFooterMsg?.trim()
      ? settings.receiptFooterMsg.trim()
      : undefined;

  return {
    updatedAt: new Date().toISOString(),
    storeName: settings.storeName,
    storeLogo: settings.storeLogo,
    phone: settings.phone,
    address: settings.address,
    welcomeMsg,
    footerMsg,
    currencySymbol,
    language,
    customerName: selectedCustomer?.name,
    customerPoints: selectedCustomer?.points,
    items,
    subtotal: Number(cartSubtotal.toFixed(2)),
    discountTotal: Number(cartDiscountTotal.toFixed(2)),
    taxTotal: Number(cartTaxTotal.toFixed(2)),
    grandTotal: Number(cartGrandTotal.toFixed(2)),
    totalItemsCount,
    completedOrder: completedOrder
      ? {
          orderNumber: completedOrder.orderNumber,
          grandTotal: Number(completedOrder.grandTotal.toFixed(2)),
          paymentMethod: completedOrder.paymentMethod,
          amountTendered: completedOrder.amountTendered,
          changeAmount: completedOrder.changeAmount,
          pointsEarned: completedOrder.pointsEarned,
          completedAt: completedOrder.date || new Date().toISOString()
        }
      : undefined
  };
}

export function broadcastCustomerDisplaySnapshot(snapshot: CustomerDisplaySnapshot): void {
  try {
    localStorage.setItem(CUSTOMER_DISPLAY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      channel.postMessage({ type: 'DISPLAY_UPDATE', payload: snapshot });
      channel.close();
    } catch {
      // Fallback handled by localStorage storage event
    }
  }
}

export function readStoredCustomerDisplaySnapshot(): CustomerDisplaySnapshot | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_DISPLAY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerDisplaySnapshot;
  } catch {
    return null;
  }
}

export function requestCustomerDisplaySync(): void {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      channel.postMessage({ type: 'REQUEST_SYNC' });
      channel.close();
    } catch {
      // Ignore
    }
  }
}

export function getCustomerDisplayUrl(): string {
  if (typeof window === 'undefined') return '?display=customer';
  const url = new URL(window.location.href);
  url.search = '?display=customer';
  url.hash = '';
  return url.toString();
}

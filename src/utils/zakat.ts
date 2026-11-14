import { Customer, Product, StoreSettings } from '../types';

export interface ZakatSummary {
  goldPricePerGram: number;
  nisabGrams: number;
  nisabValue: number;
  valuationBasis: 'cost' | 'retail';
  includeReceivables: boolean;
  inventoryCostValue: number;
  inventoryRetailValue: number;
  selectedInventoryValue: number;
  totalUnits: number;
  receivablesTotal: number;
  cashOnHand: number;
  payableDebts: number;
  grossZakatableAssets: number;
  zakatableBase: number;
  hasReachedNisab: boolean;
  excessOverNisab: number;
  remainingToNisab: number;
  nisabProgressPct: number;
  zakatRate: number; // 0.025 (2.5%)
  zakatDue: number;
  monthlyReserve: number;
}

export function calculateTradeZakatSummary(
  products: Product[],
  customers: Customer[],
  settings: StoreSettings
): ZakatSummary {
  const nisabGrams = 85;
  const zakatRate = 0.025;
  const goldPricePerGram = Math.max(0, settings.goldPricePerGram ?? 750);
  const nisabValue = Number((goldPricePerGram * nisabGrams).toFixed(2));
  const valuationBasis: 'cost' | 'retail' = settings.zakatValuationBasis || 'cost';
  const includeReceivables = settings.zakatIncludeReceivables ?? true;

  let inventoryCostValue = 0;
  let inventoryRetailValue = 0;
  let totalUnits = 0;

  products.forEach((p) => {
    const qty = Math.max(0, p.stock || 0);
    totalUnits += qty;
    inventoryCostValue += qty * (p.costPrice || 0);
    inventoryRetailValue += qty * (p.price || 0);
  });

  inventoryCostValue = Number(inventoryCostValue.toFixed(2));
  inventoryRetailValue = Number(inventoryRetailValue.toFixed(2));

  const selectedInventoryValue =
    valuationBasis === 'retail' ? inventoryRetailValue : inventoryCostValue;

  const receivablesTotal = Number(
    customers
      .reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0)
      .toFixed(2)
  );

  const cashOnHand = Math.max(0, Number(settings.zakatCashOnHand ?? 5000));
  const payableDebts = Math.max(0, Number(settings.zakatPayableDebts ?? 0));

  const grossZakatableAssets = Number(
    (
      selectedInventoryValue +
      (includeReceivables ? receivablesTotal : 0) +
      cashOnHand
    ).toFixed(2)
  );

  const zakatableBase = Math.max(
    0,
    Number((grossZakatableAssets - payableDebts).toFixed(2))
  );

  const hasReachedNisab = nisabValue > 0 && zakatableBase >= nisabValue;
  const excessOverNisab = hasReachedNisab
    ? Number((zakatableBase - nisabValue).toFixed(2))
    : 0;
  const remainingToNisab =
    !hasReachedNisab && nisabValue > 0
      ? Number((nisabValue - zakatableBase).toFixed(2))
      : 0;
  const nisabProgressPct =
    nisabValue > 0
      ? Math.min(100, Number(((zakatableBase / nisabValue) * 100).toFixed(1)))
      : 0;

  // Automatic 2.5% calculation strictly triggered when Nisab is reached/exceeded
  const zakatDue = hasReachedNisab
    ? Number((zakatableBase * zakatRate).toFixed(2))
    : 0;
  const monthlyReserve = Number((zakatDue / 12).toFixed(2));

  return {
    goldPricePerGram,
    nisabGrams,
    nisabValue,
    valuationBasis,
    includeReceivables,
    inventoryCostValue,
    inventoryRetailValue,
    selectedInventoryValue,
    totalUnits,
    receivablesTotal,
    cashOnHand,
    payableDebts,
    grossZakatableAssets,
    zakatableBase,
    hasReachedNisab,
    excessOverNisab,
    remainingToNisab,
    nisabProgressPct,
    zakatRate,
    zakatDue,
    monthlyReserve
  };
}

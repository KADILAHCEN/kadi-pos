import { Product, StoreSettings } from '../types';

export interface ScaleBarcodeConfig {
  enabled: boolean;
  weightPrefixes: string[];
  pricePrefixes: string[];
}

export const DEFAULT_SCALE_BARCODE_CONFIG: ScaleBarcodeConfig = {
  enabled: true,
  weightPrefixes: ['20', '21', '25', '26'],
  pricePrefixes: ['22', '23', '24', '27', '28', '29']
};

export interface ParsedScaleBarcodeResult {
  rawCode: string;
  prefix: string;
  plu: string;
  pluNormalized: string;
  mode: 'weight' | 'price';
  valueDigits: number;
  weightKg: number;
  embeddedPrice: number;
  quantity: number;
  product: Product | null;
}

export function normalizeScaleBarcodeConfig(
  cfg?: StoreSettings['scaleBarcodeConfig']
): ScaleBarcodeConfig {
  if (!cfg) return DEFAULT_SCALE_BARCODE_CONFIG;
  return {
    enabled: cfg.enabled ?? true,
    weightPrefixes:
      Array.isArray(cfg.weightPrefixes) && cfg.weightPrefixes.length > 0
        ? cfg.weightPrefixes.map((p) => p.trim()).filter(Boolean)
        : DEFAULT_SCALE_BARCODE_CONFIG.weightPrefixes,
    pricePrefixes:
      Array.isArray(cfg.pricePrefixes) && cfg.pricePrefixes.length > 0
        ? cfg.pricePrefixes.map((p) => p.trim()).filter(Boolean)
        : DEFAULT_SCALE_BARCODE_CONFIG.pricePrefixes
  };
}

export function isScaleBarcodeCandidate(
  code: string,
  cfg?: StoreSettings['scaleBarcodeConfig']
): { prefix: string; mode: 'weight' | 'price'; plu: string; pluNormalized: string; valueDigits: number } | null {
  const config = normalizeScaleBarcodeConfig(cfg);
  if (!config.enabled) return null;

  const clean = code.trim();
  if (!/^\d{13}$/.test(clean)) return null;

  const prefix = clean.slice(0, 2);
  const isWeight = config.weightPrefixes.includes(prefix);
  const isPrice = config.pricePrefixes.includes(prefix);
  if (!isWeight && !isPrice) return null;

  const plu = clean.slice(2, 7);
  const pluNormalized = String(parseInt(plu, 10));
  const valueDigits = parseInt(clean.slice(7, 12), 10);
  if (!Number.isFinite(valueDigits)) return null;

  return {
    prefix,
    mode: isWeight ? 'weight' : 'price',
    plu,
    pluNormalized,
    valueDigits
  };
}

export function matchProductByScalePlu(
  products: Product[],
  plu: string,
  pluNormalized: string,
  prefix?: string
): Product | null {
  const pluLower = plu.toLowerCase();
  const normLower = pluNormalized.toLowerCase();
  const fullPrefixPlu = prefix ? `${prefix}${plu}` : '';

  // 1. Exact scalePlu match
  const byPlu = products.find((p) => {
    const sp = (p.scalePlu || '').trim();
    if (!sp) return false;
    const spNorm = /^\d+$/.test(sp) ? String(parseInt(sp, 10)) : sp.toLowerCase();
    return sp === plu || spNorm === normLower || sp.toLowerCase() === pluLower;
  });
  if (byPlu) return byPlu;

  // 2. Match barcode equal to PLU or starting with prefix+PLU
  const byBarcode = products.find((p) => {
    const b = (p.barcode || '').trim();
    if (!b) return false;
    const bNorm = /^\d+$/.test(b) ? String(parseInt(b, 10)) : b;
    return (
      b === plu ||
      bNorm === pluNormalized ||
      (fullPrefixPlu && b.startsWith(fullPrefixPlu))
    );
  });
  if (byBarcode) return byBarcode;

  // 3. Match SKU equal to PLU
  const bySku = products.find((p) => {
    const s = (p.sku || '').trim().toLowerCase();
    return s === pluLower || s === normLower;
  });
  return bySku || null;
}

export function parseScaleBarcode(
  code: string,
  products: Product[],
  cfg?: StoreSettings['scaleBarcodeConfig']
): ParsedScaleBarcodeResult | null {
  const candidate = isScaleBarcodeCandidate(code, cfg);
  if (!candidate) return null;

  const clean = code.trim();
  const product = matchProductByScalePlu(
    products,
    candidate.plu,
    candidate.pluNormalized,
    candidate.prefix
  );

  let weightKg = 0;
  let embeddedPrice = 0;
  let quantity = 0;

  if (product?.unitType === 'gram') {
    if (candidate.mode === 'weight') {
      const grams = Math.max(1, candidate.valueDigits);
      weightKg = Number((grams / 1000).toFixed(3));
      quantity = grams;
      embeddedPrice = Number((grams * product.price).toFixed(2));
    } else {
      embeddedPrice = Number((candidate.valueDigits / 100).toFixed(2));
      quantity =
        product.price > 0
          ? Math.max(1, Math.round(embeddedPrice / product.price))
          : 1;
      weightKg = Number((quantity / 1000).toFixed(3));
    }
  } else if (candidate.mode === 'weight') {
    weightKg = Number((candidate.valueDigits / 1000).toFixed(3));
    embeddedPrice = product ? Number((weightKg * product.price).toFixed(2)) : 0;
    quantity = Math.max(0.001, weightKg);
  } else {
    embeddedPrice = Number((candidate.valueDigits / 100).toFixed(2));
    weightKg =
      product && product.price > 0
        ? Number((embeddedPrice / product.price).toFixed(3))
        : 1;
    quantity = Math.max(0.001, weightKg);
  }

  return {
    rawCode: clean,
    prefix: candidate.prefix,
    plu: candidate.plu,
    pluNormalized: candidate.pluNormalized,
    mode: candidate.mode,
    valueDigits: candidate.valueDigits,
    weightKg,
    embeddedPrice,
    quantity,
    product
  };
}

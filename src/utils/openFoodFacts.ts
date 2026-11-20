import { getKeyVal, setKeyVal } from './storage';

export type OpenFactsSource =
  | 'openfoodfacts'
  | 'openbeautyfacts'
  | 'openproductsfacts'
  | 'indexeddb';

export interface OpenFoodFactsResult {
  found: boolean;
  offline?: boolean;
  fromCache?: boolean;
  source?: OpenFactsSource;
  sourceLabel?: string;
  barcode: string;
  name: string;
  nameEn: string;
  brand: string;
  imageUrl: string;
  quantityLabel: string;
  error?: string;
}

interface OpenFactsApiResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_ar?: string;
    product_name_fr?: string;
    product_name_en?: string;
    generic_name?: string;
    generic_name_ar?: string;
    generic_name_fr?: string;
    brands?: string;
    quantity?: string;
    image_front_small_url?: string;
    image_front_url?: string;
    image_url?: string;
  };
}

interface CachedBarcodeEntry extends OpenFoodFactsResult {
  cachedAt: number;
}

const BARCODE_CACHE_KEY_PREFIX = 'barcode_lookup_cache:';

const OPEN_FACTS_SOURCES: ReadonlyArray<{
  id: Exclude<OpenFactsSource, 'indexeddb'>;
  label: string;
  buildUrl: (barcode: string) => string;
}> = [
  {
    id: 'openfoodfacts',
    label: 'Open Food Facts',
    buildUrl: (barcode) =>
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
  },
  {
    id: 'openbeautyfacts',
    label: 'Open Beauty Facts',
    buildUrl: (barcode) =>
      `https://world.openbeautyfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
  },
  {
    id: 'openproductsfacts',
    label: 'Open Products Facts',
    buildUrl: (barcode) =>
      `https://world.openproductsfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
  }
];

const cleanText = (value?: string): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

const formatDisplayName = (baseName: string, brand: string, quantity: string): string => {
  if (!baseName) return '';
  let result = baseName;

  if (brand) {
    const primaryBrand = brand.split(',')[0].trim();
    if (
      primaryBrand &&
      !result.toLowerCase().includes(primaryBrand.toLowerCase())
    ) {
      result = `${primaryBrand} - ${result}`;
    }
  }

  if (quantity && !result.toLowerCase().includes(quantity.toLowerCase())) {
    result = `${result} (${quantity})`;
  }

  return result;
};

async function getCachedBarcodeFromIndexedDB(
  barcode: string
): Promise<OpenFoodFactsResult | null> {
  try {
    const cached = await getKeyVal<CachedBarcodeEntry>(`${BARCODE_CACHE_KEY_PREFIX}${barcode}`);
    if (cached && cached.found && cached.name) {
      return {
        ...cached,
        fromCache: true
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function saveBarcodeToIndexedDB(result: OpenFoodFactsResult): Promise<void> {
  if (!result.found || !result.barcode || !result.name) return;
  try {
    const entry: CachedBarcodeEntry = {
      ...result,
      fromCache: false,
      cachedAt: Date.now()
    };
    await setKeyVal(`${BARCODE_CACHE_KEY_PREFIX}${result.barcode}`, entry);
  } catch {
    // non-fatal offline cache error
  }
}

export async function lookupProductByBarcode(
  rawBarcode: string,
  externalSignal?: AbortSignal,
  perSourceTimeoutMs = 4500
): Promise<OpenFoodFactsResult> {
  const barcode = cleanText(rawBarcode);

  if (barcode.length < 6) {
    return {
      found: false,
      barcode,
      name: '',
      nameEn: '',
      brand: '',
      imageUrl: '',
      quantityLabel: ''
    };
  }

  // 1. Check IndexedDB first — instant & works 100% offline
  const cached = await getCachedBarcodeFromIndexedDB(barcode);
  if (cached) {
    return cached;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      found: false,
      offline: true,
      barcode,
      name: '',
      nameEn: '',
      brand: '',
      imageUrl: '',
      quantityLabel: ''
    };
  }

  // 2. Query OpenFoodFacts -> OpenBeautyFacts -> OpenProductsFacts
  let lastError: string | undefined;

  for (const source of OPEN_FACTS_SOURCES) {
    if (externalSignal?.aborted) {
      return {
        found: false,
        barcode,
        name: '',
        nameEn: '',
        brand: '',
        imageUrl: '',
        quantityLabel: '',
        error: 'aborted'
      };
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), perSourceTimeoutMs);
    const handleExternalAbort = () => controller.abort();

    if (externalSignal) {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
    }

    try {
      const response = await fetch(source.buildUrl(barcode), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const data = (await response.json()) as OpenFactsApiResponse;
      if (data?.status !== 1 || !data.product) {
        continue;
      }

      const p = data.product;
      const brand = cleanText(p.brands);
      const quantityLabel = cleanText(p.quantity);

      const arName =
        cleanText(p.product_name_ar) ||
        cleanText(p.generic_name_ar) ||
        cleanText(p.product_name) ||
        cleanText(p.product_name_fr) ||
        cleanText(p.product_name_en) ||
        cleanText(p.generic_name_fr) ||
        cleanText(p.generic_name) ||
        brand;

      const latinName =
        cleanText(p.product_name_fr) ||
        cleanText(p.product_name_en) ||
        cleanText(p.product_name) ||
        cleanText(p.generic_name_fr) ||
        cleanText(p.generic_name) ||
        arName;

      // External CDN image URL takes zero IndexedDB storage
      const imageUrl =
        cleanText(p.image_front_small_url) ||
        cleanText(p.image_front_url) ||
        cleanText(p.image_url);

      const formattedPrimary = formatDisplayName(arName, brand, quantityLabel);
      const formattedLatin = formatDisplayName(latinName, brand, quantityLabel);

      if (!formattedPrimary && !formattedLatin) {
        continue;
      }

      const hit: OpenFoodFactsResult = {
        found: true,
        fromCache: false,
        source: source.id,
        sourceLabel: source.label,
        barcode,
        name: formattedPrimary || formattedLatin,
        nameEn: formattedLatin || formattedPrimary,
        brand,
        imageUrl,
        quantityLabel
      };

      // 3. Cache into IndexedDB for future offline scans
      await saveBarcodeToIndexedDB(hit);
      return hit;
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (externalSignal?.aborted) {
        return {
          found: false,
          barcode,
          name: '',
          nameEn: '',
          brand: '',
          imageUrl: '',
          quantityLabel: '',
          error: 'aborted'
        };
      }
      lastError = isAbort ? 'timeout' : err instanceof Error ? err.message : 'network_error';
    } finally {
      window.clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', handleExternalAbort);
      }
    }
  }

  return {
    found: false,
    offline: typeof navigator !== 'undefined' && navigator.onLine === false,
    barcode,
    name: '',
    nameEn: '',
    brand: '',
    imageUrl: '',
    quantityLabel: '',
    error: lastError
  };
}

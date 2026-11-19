export interface OpenFoodFactsResult {
  found: boolean;
  offline?: boolean;
  barcode: string;
  name: string;
  nameEn: string;
  brand: string;
  imageUrl: string;
  quantityLabel: string;
  error?: string;
}

interface OpenFoodFactsApiResponse {
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

export async function lookupProductByBarcode(
  rawBarcode: string,
  externalSignal?: AbortSignal,
  timeoutMs = 8000
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

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  const handleExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timeoutId);
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      return {
        found: false,
        barcode,
        name: '',
        nameEn: '',
        brand: '',
        imageUrl: '',
        quantityLabel: '',
        error: `HTTP ${response.status}`
      };
    }

    const data = (await response.json()) as OpenFoodFactsApiResponse;

    if (data?.status !== 1 || !data.product) {
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
      cleanText(p.generic_name);

    const latinName =
      cleanText(p.product_name_fr) ||
      cleanText(p.product_name_en) ||
      cleanText(p.product_name) ||
      cleanText(p.generic_name_fr) ||
      cleanText(p.generic_name) ||
      arName;

    const imageUrl =
      cleanText(p.image_front_small_url) ||
      cleanText(p.image_front_url) ||
      cleanText(p.image_url);

    const formattedPrimary = formatDisplayName(arName, brand, quantityLabel);
    const formattedLatin = formatDisplayName(latinName, brand, quantityLabel);

    if (!formattedPrimary && !formattedLatin) {
      return {
        found: false,
        barcode,
        name: '',
        nameEn: '',
        brand,
        imageUrl,
        quantityLabel
      };
    }

    return {
      found: true,
      barcode,
      name: formattedPrimary || formattedLatin,
      nameEn: formattedLatin || formattedPrimary,
      brand,
      imageUrl,
      quantityLabel
    };
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    return {
      found: false,
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
      barcode,
      name: '',
      nameEn: '',
      brand: '',
      imageUrl: '',
      quantityLabel: '',
      error: isAbort ? 'timeout' : err instanceof Error ? err.message : 'network_error'
    };
  } finally {
    window.clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', handleExternalAbort);
    }
  }
}

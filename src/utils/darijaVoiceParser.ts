export type VoiceIntentType =
  | 'record_sale'
  | 'record_payment'
  | 'set_cost_price'
  | 'add_product'
  | 'add_customer'
  | 'record_note'
  | 'capture_photo'
  | 'invoice_daily'
  | 'invoice_monthly'
  | 'invoice_customer'
  | 'ask_ai'
  | 'unknown';

export interface ParsedVoiceSaleItem {
  productName: string;
  quantity?: number;
  amountDirham: number;
  originalAmount?: number;
  originalCurrency?: 'riyal' | 'dirham';
}

export interface ParsedVoiceCommand {
  intent: VoiceIntentType;
  customerName?: string;
  productName?: string;
  quantity?: number;
  amountDirham?: number;
  originalAmount?: number;
  originalCurrency?: 'riyal' | 'dirham';
  paymentMethod?: 'credit' | 'cash';
  items?: ParsedVoiceSaleItem[];
  transcript?: string;
  explanation?: string;
}

const ARABIC_WORD_NUMBERS: Record<string, number> = {
  'واحد': 1,
  'وحدة': 1,
  'جوج': 2,
  'زوج': 2,
  'تلاتة': 3,
  'ثلاثة': 3,
  'تلات': 3,
  'ثلاث': 3,
  'ربعة': 4,
  'أربعة': 4,
  'اربع': 4,
  'خمسة': 5,
  'خمس': 5,
  'ستة': 6,
  'ست': 6,
  'سبعة': 7,
  'سبع': 7,
  'تمنية': 8,
  'ثمانية': 8,
  'تمن': 8,
  'تسعود': 9,
  'تسعة': 9,
  'عشرة': 10,
  'عشر': 10,
  'عشرين': 20,
  'ثلاثين': 30,
  'تلاتين': 30,
  'ربعين': 40,
  'أربعين': 40,
  'اربعين': 40,
  'خمسين': 50,
  'ستين': 60,
  'سبعين': 70,
  'تمانين': 80,
  'ثمانين': 80,
  'تسعين': 90,
  'مية': 100,
  'ميا': 100,
  'مائة': 100,
  'ميتين': 200,
  'مئتين': 200,
  'تلتماية': 300,
  'تلتمية': 300,
  'ثلاثمائة': 300,
  'ربعمية': 400,
  'أربعمائة': 400,
  'خمسمية': 500,
  'خمسمائة': 500,
  'ستمية': 600,
  'ستمائة': 600,
  'سبعمية': 700,
  'تمنمية': 800,
  'تسعمية': 900,
  'ألف': 1000,
  'الف': 1000,
  'ألفين': 2000,
  'الفين': 2000
};

/**
 * Normalizes Arabic & Latin text for accurate name matching across Darija variants
 * (removes tashkeel, unifies hamza/alif/taa-marbuta/yaa).
 */
export function normalizeArabicKey(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripArabicAl(normalized: string): string {
  return normalized
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .join(' ')
    .trim();
}

/**
 * Smart entity matcher that handles Arabic definite article ("تيد" <-> "التيد"),
 * hamza differences ("أحمد" <-> "احمد"), and multi-word boundaries while avoiding
 * false partial-name collisions (e.g. "علي" will NOT falsely match "عليوة").
 */
export function matchEntityByName<T extends { name: string; nameEn?: string }>(
  entities: T[],
  query: string
): T | undefined {
  const qNorm = normalizeArabicKey(query);
  if (!qNorm) return undefined;
  const qNoAl = stripArabicAl(qNorm);

  // 1. Exact normalized match on name or nameEn
  const exact = entities.find((e) => {
    const n = normalizeArabicKey(e.name);
    const nEn = e.nameEn ? normalizeArabicKey(e.nameEn) : '';
    return n === qNorm || (nEn && nEn === qNorm);
  });
  if (exact) return exact;

  // 2. Exact match ignoring "ال" prefix ("تيد" === "التيد")
  const alMatch = entities.find((e) => {
    const nNoAl = stripArabicAl(normalizeArabicKey(e.name));
    return nNoAl === qNoAl;
  });
  if (alMatch) return alMatch;

  // 3. Multi-word token boundary match (only when query >= 4 chars & all query words appear as whole words)
  if (qNoAl.length >= 4) {
    const qWords = qNoAl.split(/\s+/).filter((w) => w.length >= 2);
    if (qWords.length > 0) {
      const boundaryMatch = entities.find((e) => {
        const eWords = stripArabicAl(normalizeArabicKey(e.name)).split(/\s+/);
        return qWords.every((qw) => eWords.includes(qw));
      });
      if (boundaryMatch) return boundaryMatch;
    }
  }

  return undefined;
}

function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/،/g, '.');
}

function parseArabicWordAmount(segment: string): number | undefined {
  const tokens = segment.trim().split(/\s+/);
  let sum = 0;
  let foundWord = false;
  for (const tok of tokens) {
    const cleaned = tok.replace(/[^\u0600-\u06FF]/g, '');
    if (cleaned && ARABIC_WORD_NUMBERS[cleaned] !== undefined) {
      sum += ARABIC_WORD_NUMBERS[cleaned];
      foundWord = true;
    }
  }
  return foundWord && sum > 0 ? sum : undefined;
}

/**
 * Extracts Moroccan currency amount accurately without confusing item quantities
 * (e.g. "2 كيلو سكر ب 25 درهم" -> 25 DH, NOT 2).
 * Converts Riyal to Dirham (1 Dirham = 20 Riyal; 100 Riyal = 5 Dirham).
 */
export function extractMoroccanAmount(text: string): {
  amountDirham?: number;
  originalAmount?: number;
  originalCurrency?: 'riyal' | 'dirham';
} {
  const normalized = normalizeDigits(text);

  // 1. Highest priority: explicit currency attached directly to a number
  const currencyNumMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(ريال|ريالات|ryal|rial|درهم|دراهم|د\.م|dh|mad)\b/i
  );
  if (currencyNumMatch) {
    const rawNum = parseFloat(currencyNumMatch[1].replace(',', '.'));
    const unit = currencyNumMatch[2].toLowerCase();
    const isRiyal = /ريال|ryal|rial/.test(unit);
    if (!Number.isNaN(rawNum) && rawNum > 0) {
      if (isRiyal) {
        return {
          amountDirham: Number((rawNum / 20).toFixed(2)),
          originalAmount: rawNum,
          originalCurrency: 'riyal'
        };
      }
      return {
        amountDirham: Number(rawNum.toFixed(2)),
        originalAmount: rawNum,
        originalCurrency: 'dirham'
      };
    }
  }

  // 2. Price prefixed by "ب / بـ / بثمن" before currency word or number
  const prefixedPriceMatch = normalized.match(
    /(?:بثمن|بـ|ب)\s*(\d+(?:[.,]\d+)?)/i
  );
  const isRiyalText = /ريال|ريالات|ryal|rial/i.test(normalized);
  const isDirhamText = /درهم|دراهم|د\.م|dh|mad/i.test(normalized);

  let rawNum: number | undefined;
  if (prefixedPriceMatch) {
    rawNum = parseFloat(prefixedPriceMatch[1].replace(',', '.'));
  } else {
    // 3. Arabic spoken number words near currency (e.g. "مية ريال", "خمسين درهم")
    const wordCurrencyMatch = normalized.match(
      /([\u0600-\u06FF\s]{2,35}?)\s*(ريال|ريالات|درهم|دراهم|د\.م)\b/i
    );
    if (wordCurrencyMatch) {
      rawNum = parseArabicWordAmount(wordCurrencyMatch[1]);
    }
    // 4. Last numeric token fallback
    if (rawNum === undefined) {
      const allNums = Array.from(normalized.matchAll(/(\d+(?:[.,]\d+)?)/g));
      if (allNums.length > 0) {
        rawNum = parseFloat(allNums[allNums.length - 1][1].replace(',', '.'));
      } else {
        rawNum = parseArabicWordAmount(normalized);
      }
    }
  }

  if (rawNum === undefined || Number.isNaN(rawNum) || rawNum <= 0) {
    return {};
  }

  if (isRiyalText && !isDirhamText) {
    return {
      amountDirham: Number((rawNum / 20).toFixed(2)),
      originalAmount: rawNum,
      originalCurrency: 'riyal'
    };
  }

  return {
    amountDirham: Number(rawNum.toFixed(2)),
    originalAmount: rawNum,
    originalCurrency: 'dirham'
  };
}

function cleanEntityName(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/^(?:لـ|ديال|على|من|عن)\s+/g, '')
    .replace(/^لـ(?=\S)/, '')
    .replace(/^ل(?=[أإآا])/g, '')
    .replace(/\s+(?:بـ?|ب|بثمن|ثمن)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

function extractLeadingQuantityAndProduct(rawProduct: string): {
  productName?: string;
  quantity: number;
} {
  let text = rawProduct.trim();
  let quantity = 1;

  // Handle "كيلو ونص" / "نصف كيلو" / "نص" / "ربع"
  if (/^(?:كيلو\s+و\s*نص(?:ف)?)\s+/.test(text)) {
    quantity = 1.5;
    text = text.replace(/^(?:كيلو\s+و\s*نص(?:ف)?)\s+/, '').trim();
  } else if (/^(?:نص|نصف)\s+(?:كيلو|لتر|ليتر)?\s*/.test(text)) {
    quantity = 0.5;
    text = text.replace(/^(?:نص|نصف)\s+(?:كيلو|لتر|ليتر)?\s*/, '').trim();
  } else if (/^(?:ربع)\s+(?:كيلو|لتر|ليتر)?\s*/.test(text)) {
    quantity = 0.25;
    text = text.replace(/^(?:ربع)\s+(?:كيلو|لتر|ليتر)?\s*/, '').trim();
  } else {
    // e.g. "2 كيلو سكر" or "3 قراعي حليب" or "2 تيد"
    const numQtyMatch = text.match(/^(\d+(?:[.,]\d+)?)\s+(?:حبات?|حبة|قطع|قطعة|علب|علبة|قراعي|قرعة|باكيات?|باكية|ساشيات?)?\s*(.+)$/);
    if (numQtyMatch) {
      const parsedQty = parseFloat(numQtyMatch[1].replace(',', '.'));
      if (!Number.isNaN(parsedQty) && parsedQty > 0) {
        quantity = parsedQty;
        text = numQtyMatch[2].trim();
      }
    } else {
      // e.g. "جوج حليب" / "تلاتة خبز"
      const firstWord = text.split(/\s+/)[0];
      if (firstWord && ARABIC_WORD_NUMBERS[firstWord]) {
        const rest = text.slice(firstWord.length).trim();
        if (rest.length >= 2) {
          quantity = ARABIC_WORD_NUMBERS[firstWord];
          text = rest.replace(/^(?:حبات?|حبة|قطع|قطعة|علب|علبة|قراعي|قرعة|باكيات?|باكية)\s+/i, '').trim();
        }
      }
    }
  }

  return {
    productName: cleanEntityName(text),
    quantity
  };
}

function stripTrailingPriceAndPayment(segment: string): string {
  return segment
    .replace(/\s*(?:نقدا|نقداً|كاش|كريدي|بالكريدي|دين|خالص|خلص)\s*$/gi, '')
    .replace(
      /\s*(?:بثمن|بـ|ب)?\s*\d+(?:[.,]\d+)?\s*(?:ريال|ريالات|ryal|rial|درهم|دراهم|د\.م|dh|mad)?\s*$/gi,
      ''
    )
    .replace(
      /\s*(?:بثمن|بـ|ب)?\s*[\u0600-\u06FF]+\s*(?:ريال|ريالات|درهم|دراهم|د\.م)\s*$/gi,
      ''
    )
    .trim();
}

function parseMultiProductPriceList(
  itemsClause: string,
  fallbackAmt: ReturnType<typeof extractMoroccanAmount>
): ParsedVoiceSaleItem[] {
  // Split on " و " or comma when multiple items appear in one sentence
  const rawSegments = itemsClause
    .split(/\s+و(?=\s|\S)|\s*,\s*|\s*،\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSegments.length > 1) {
    const parsedItems: ParsedVoiceSaleItem[] = [];
    for (const seg of rawSegments) {
      const segClean = seg.replace(/^و\s*/i, '').trim();
      const segAmt = extractMoroccanAmount(segClean);
      const rawName = stripTrailingPriceAndPayment(segClean);
      const { productName, quantity } = extractLeadingQuantityAndProduct(rawName);
      if (productName) {
        parsedItems.push({
          productName,
          quantity,
          amountDirham: segAmt.amountDirham || 0,
          originalAmount: segAmt.originalAmount,
          originalCurrency: segAmt.originalCurrency
        });
      }
    }
    if (parsedItems.length > 0) {
      return parsedItems;
    }
  }

  // Single item fallback (even if price omitted -> 0 lets catalog price resolve!)
  const rawName = stripTrailingPriceAndPayment(itemsClause);
  const { productName, quantity } = extractLeadingQuantityAndProduct(rawName);
  if (productName) {
    return [
      {
        productName,
        quantity,
        amountDirham: fallbackAmt.amountDirham || 0,
        originalAmount: fallbackAmt.originalAmount,
        originalCurrency: fallbackAmt.originalCurrency
      }
    ];
  }
  return [];
}

/**
 * Universal local Moroccan Darija, Arabic & French POS voice parser.
 * Supports ANY customer name, ANY product name, multi-item lists, Riyal->Dirham conversion,
 * direct product/customer registration, payments, purchase cost updates, photos, and invoices.
 */
export function parseDarijaVoiceFallback(text: string): ParsedVoiceCommand {
  const raw = text.trim();
  const normalized = normalizeDigits(raw);

  // 1. Invoices: Daily / Monthly / Customer
  if (/فاكتورة\s*(?:ديال\s*)?(?:اليوم|النهار|اليومية|today)/i.test(normalized)) {
    return { intent: 'invoice_daily', transcript: raw };
  }
  if (/فاكتورة\s*(?:ديال\s*)?(?:الشهر|شهر|الشهرية|month)/i.test(normalized)) {
    return { intent: 'invoice_monthly', transcript: raw };
  }
  const custInvMatch = normalized.match(
    /(?:عطيني|جيب|أعطني|بغيت|اعطيني|وريني)?\s*فاكتورة\s*(?:ديال\s*|د\s*|ل\s*|الزبون\s*)?(.+)/i
  );
  if (custInvMatch && custInvMatch[1]) {
    const candidate = cleanEntityName(custInvMatch[1]);
    if (candidate) {
      return {
        intent: 'invoice_customer',
        customerName: candidate,
        transcript: raw
      };
    }
  }

  // 2. Capture / Add Photo to Product ("زيد تصويرة لسلعة" / "صور سلعة")
  const photoMatch = normalized.match(
    /(?:زيد|ضيف|أضف|دير|صور|صوّر|التقط)?\s*(?:تصويرة|صورة|فوطو|كاميرا)\s*(?:ديال\s*|لـ?\s*|على\s*)?(.+)/i
  );
  if (photoMatch && photoMatch[1]) {
    return {
      intent: 'capture_photo',
      productName: cleanEntityName(photoMatch[1]),
      transcript: raw
    };
  }
  if (/^(?:زيد|فتح|حل)\s*(?:تصويرة|صورة|الكاميرا)/i.test(normalized)) {
    return { intent: 'capture_photo', transcript: raw };
  }

  const amtInfo = extractMoroccanAmount(normalized);

  // 3. Direct Add New Product ("زيد سلعة ..." / "سجل سلعة جديدة ...")
  const addProdMatch = normalized.match(
    /^(?:زيد|ضيف|أضف|سجل|قيد|دخل)\s+(?:سلعة|منتج|سلعه)\s*(?:جديدة|جديد)?\s*(?:اسمها|اسمه|سميتها|سميتو)?\s*(.+)$/i
  );
  if (addProdMatch && addProdMatch[1]) {
    const stripped = stripTrailingPriceAndPayment(addProdMatch[1]);
    const cleanProd = cleanEntityName(stripped);
    if (cleanProd) {
      return {
        intent: 'add_product',
        productName: cleanProd,
        ...amtInfo,
        transcript: raw
      };
    }
  }

  // 4. Direct Add New Customer ("زيد زبون ..." / "سجل كليان جديد ...")
  const addCustMatch = normalized.match(
    /^(?:زيد|ضيف|أضف|سجل|قيد|دخل)\s+(?:زبون|كليان|عميل|زبونة)\s*(?:جديد|جديدة)?\s*(?:اسمو|اسمه|اسمها|سميتو|سميتها)?\s*(.+)$/i
  );
  if (addCustMatch && addCustMatch[1]) {
    const cleanCust = cleanEntityName(addCustMatch[1]);
    if (cleanCust) {
      return {
        intent: 'add_customer',
        customerName: cleanCust,
        transcript: raw
      };
    }
  }

  // 5. Purchase cost price update ("سلعة شريتها ب ثمن" or "شريتو ب ثمن")
  const costMatch = normalized.match(
    /^(.+?)\s+(?:شريتها|شريتو|شريته|تشرات|ثمن الشراء|سعر الشراء)\s+(?:بـ?|ب|على)?\s*.+/i
  );
  if (costMatch && amtInfo.amountDirham) {
    return {
      intent: 'set_cost_price',
      productName: cleanEntityName(costMatch[1].replace(/^(?:سلعة|منتج)\s+/i, '')),
      ...amtInfo,
      transcript: raw
    };
  }
  const costPrefixMatch = normalized.match(
    /(?:شريت|ثمن الشراء\s*ديال|سعر الشراء\s*ديال)\s+(.+?)\s+(?:بـ?|ب)\s*.+/i
  );
  if (costPrefixMatch && amtInfo.amountDirham) {
    return {
      intent: 'set_cost_price',
      productName: cleanEntityName(costPrefixMatch[1]),
      ...amtInfo,
      transcript: raw
    };
  }

  // 6. Customer Payment ("فلان خلص ثمن")
  const payMatch = normalized.match(
    /^(.+?)\s+(?:خلص|خلصات|سدد|دفع|عطاني|عطا|جاب)\s+(?:بـ?|ب)?\s*(?:\d|[\u0600-\u06FF]+).*/i
  );
  if (
    payMatch &&
    amtInfo.amountDirham &&
    !/خدا|خدات|شرا|شرات|تقدى|دار/.test(normalized)
  ) {
    return {
      intent: 'record_payment',
      customerName: cleanEntityName(payMatch[1]),
      ...amtInfo,
      transcript: raw
    };
  }

  const isCash = /نقدا|نقداً|كاش|خلص|خالص/i.test(normalized);

  // 7A. Standard Darija/Arabic Sale ("فلان خدا سلعة ب ثمن" or even without explicit price)
  const saleMatch = normalized.match(
    /^(.+?)\s+(?:خدا|خدات|خذى|خذات|اخد|أخذ|أخذت|اشترى|اشترت|شرا|شرات|دار|دارت|دى|دات|تقدى|تقدات|هز|هزات)\s+(.+)$/i
  );
  if (saleMatch) {
    const customerName = cleanEntityName(saleMatch[1]) || 'زبون عام';
    const items = parseMultiProductPriceList(saleMatch[2], amtInfo);
    if (items.length > 0) {
      return {
        intent: 'record_sale',
        customerName,
        productName: items[0].productName,
        quantity: items[0].quantity || 1,
        amountDirham: Number(items.reduce((s, it) => s + it.amountDirham, 0).toFixed(2)),
        originalAmount: items.length === 1 ? items[0].originalAmount : undefined,
        originalCurrency: items.length === 1 ? items[0].originalCurrency : undefined,
        paymentMethod: isCash ? 'cash' : 'credit',
        items,
        transcript: raw
      };
    }
  }

  // 7B. Prefix verb sale ("سجل / زيد / قيد / عطيت / بيع لـ فلان سلعة ب ثمن")
  const prefixSaleMatch = normalized.match(
    /^(?:سجل|قيد|زيد|ضيف|عطيت|عطينا|بيع|بيعت|كريدي)\s+(?:لـ\s*|على\s*|ل\s*)?(\S+(?:\s+\S+)?)\s+(.+)$/i
  );
  if (prefixSaleMatch) {
    const customerName = cleanEntityName(prefixSaleMatch[1]) || 'زبون عام';
    const items = parseMultiProductPriceList(prefixSaleMatch[2], amtInfo);
    if (items.length > 0) {
      return {
        intent: 'record_sale',
        customerName,
        productName: items[0].productName,
        quantity: items[0].quantity || 1,
        amountDirham: Number(items.reduce((s, it) => s + it.amountDirham, 0).toFixed(2)),
        originalAmount: items.length === 1 ? items[0].originalAmount : undefined,
        originalCurrency: items.length === 1 ? items[0].originalCurrency : undefined,
        paymentMethod: isCash ? 'cash' : 'credit',
        items,
        transcript: raw
      };
    }
  }

  // 7C. Product-for-Customer ("سلعة ب ثمن لـ فلان")
  const prodForCustMatch = normalized.match(
    /^(.+?)\s+(?:بثمن|بـ|ب)\s*(\d+(?:[.,]\d+)?\s*(?:ريال|ريالات|درهم|دراهم|د\.م|dh)?)\s+(?:لـ\s*|ل\s*|على\s*)(\S.*)$/i
  );
  if (prodForCustMatch && amtInfo.amountDirham) {
    const { productName, quantity } = extractLeadingQuantityAndProduct(prodForCustMatch[1]);
    const customerName = cleanEntityName(prodForCustMatch[3]) || 'زبون عام';
    if (productName) {
      return {
        intent: 'record_sale',
        customerName,
        productName,
        quantity,
        ...amtInfo,
        paymentMethod: isCash ? 'cash' : 'credit',
        items: [
          {
            productName,
            quantity,
            amountDirham: amtInfo.amountDirham,
            originalAmount: amtInfo.originalAmount,
            originalCurrency: amtInfo.originalCurrency
          }
        ],
        transcript: raw
      };
    }
  }

  // 7D. Shorthand "[Product] [Price]" or "[Customer] [Product] [Price]" (no verb!)
  if (amtInfo.amountDirham) {
    const beforePrice = stripTrailingPriceAndPayment(normalized);
    if (beforePrice) {
      const words = beforePrice.split(/\s+/).filter(Boolean);
      // If multi-word without an explicit verb and >= 2 words, treat whole phrase if it's clearly one product OR let user know;
      // Wait: if someone says "حليب 5 درهم" -> 1-word product, cash quick sale!
      // If someone says "محمد التيد ب 100 ريال" -> word 1 = customer ("محمد"), rest = product ("التيد")!
      if (words.length === 1) {
        return {
          intent: 'record_sale',
          customerName: 'زبون عام',
          productName: cleanEntityName(words[0]),
          quantity: 1,
          ...amtInfo,
          paymentMethod: 'cash',
          items: [
            {
              productName: cleanEntityName(words[0]) || words[0],
              quantity: 1,
              amountDirham: amtInfo.amountDirham,
              originalAmount: amtInfo.originalAmount,
              originalCurrency: amtInfo.originalCurrency
            }
          ],
          transcript: raw
        };
      }
      if (words.length >= 2) {
        const leadingQty = extractLeadingQuantityAndProduct(beforePrice);
        // If starts with a numeric quantity (e.g. "2 كيلو سكر ب 20 درهم"), it's a quick sale for زبون عام
        if (/^\d/.test(words[0]) || ARABIC_WORD_NUMBERS[words[0]]) {
          return {
            intent: 'record_sale',
            customerName: 'زبون عام',
            productName: leadingQty.productName || beforePrice,
            quantity: leadingQty.quantity,
            ...amtInfo,
            paymentMethod: isCash ? 'cash' : 'cash',
            items: [
              {
                productName: leadingQty.productName || beforePrice,
                quantity: leadingQty.quantity,
                amountDirham: amtInfo.amountDirham,
                originalAmount: amtInfo.originalAmount,
                originalCurrency: amtInfo.originalCurrency
              }
            ],
            transcript: raw
          };
        }
        // Otherwise treat first token as customer if there's an explicit "ب" price marker or 2+ words like "رشيد كوكا ب 5 درهم"
        const customerName = cleanEntityName(words[0]) || 'زبون عام';
        const prodPart = words.slice(1).join(' ');
        const { productName, quantity } = extractLeadingQuantityAndProduct(prodPart);
        if (productName) {
          return {
            intent: 'record_sale',
            customerName,
            productName,
            quantity,
            ...amtInfo,
            paymentMethod: isCash ? 'cash' : 'credit',
            items: [
              {
                productName,
                quantity,
                amountDirham: amtInfo.amountDirham,
                originalAmount: amtInfo.originalAmount,
                originalCurrency: amtInfo.originalCurrency
              }
            ],
            transcript: raw
          };
        }
      }
    }
  }

  // 7b. Spoken AI question detection (Darija / Arabic / French / English)
  const isSpokenQuestion =
    /[؟?]/.test(raw) ||
    /^(شحال|كم|كيفاش|كيف|علاش|لماذا|واش|هل|شنو|اشنو|آش|ما هو|ما هي|عطيني نصيحة|نصحني|جاوبني|قول لي|شرح لي|اشرح لي|تحليل|comment|combien|pourquoi|how much|what is|explain)\b/i.test(
      text
    );
  if (isSpokenQuestion) {
    return {
      intent: 'ask_ai',
      transcript: raw,
      explanation: raw
    };
  }

  // 8. Unrestricted free-form voice recording fallback (never reject any non-empty spoken phrase)
  if (raw.length > 0) {
    return {
      intent: 'record_note',
      ...amtInfo,
      transcript: raw,
      explanation: raw
    };
  }

  return {
    intent: 'unknown',
    ...amtInfo,
    transcript: raw
  };
}

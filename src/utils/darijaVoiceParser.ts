export type VoiceIntentType =
  | 'record_sale'
  | 'record_payment'
  | 'set_cost_price'
  | 'capture_photo'
  | 'invoice_daily'
  | 'invoice_monthly'
  | 'invoice_customer'
  | 'unknown';

export interface ParsedVoiceCommand {
  intent: VoiceIntentType;
  customerName?: string;
  productName?: string;
  quantity?: number;
  amountDirham?: number;
  originalAmount?: number;
  originalCurrency?: 'riyal' | 'dirham';
  paymentMethod?: 'credit' | 'cash';
  transcript?: string;
  explanation?: string;
}

const ARABIC_WORD_NUMBERS: Record<string, number> = {
  'واحد': 1,
  'جوج': 2,
  'زوج': 2,
  'تلاتة': 3,
  'ثلاثة': 3,
  'ربعة': 4,
  'أربعة': 4,
  'خمسة': 5,
  'ستة': 6,
  'سبعة': 7,
  'تمنية': 8,
  'ثمانية': 8,
  'تسعود': 9,
  'تسعة': 9,
  'عشرة': 10,
  'عشرين': 20,
  'ثلاثين': 30,
  'تلاتين': 30,
  'ربعين': 40,
  'أربعين': 40,
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
 * Normalizes Arabic-Indic digits (٠-٩) to Western digits and extracts currency amount.
 * Converts Moroccan Riyal to Dirham using 1 Dirham = 20 Riyal (100 Riyal = 5 Dirham).
 */
export function extractMoroccanAmount(text: string): {
  amountDirham?: number;
  originalAmount?: number;
  originalCurrency?: 'riyal' | 'dirham';
} {
  const normalized = text
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/،/g, '.');

  const isRiyal = /ريال|ريالات|ryal|rial/i.test(normalized);
  const isDirham = /درهم|دراهم|د\.م|dh|mad/i.test(normalized);

  // Try numeric digits first (e.g. "100 ريال" or "12.5 درهم")
  const numMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
  let rawNum: number | undefined;

  if (numMatch) {
    rawNum = parseFloat(numMatch[1].replace(',', '.'));
  } else {
    // Fallback to Arabic/Darija spoken number words
    const tokens = normalized.split(/\s+/);
    let sum = 0;
    let foundWord = false;
    for (const tok of tokens) {
      const cleaned = tok.replace(/[^\u0600-\u06FF]/g, '');
      if (cleaned && ARABIC_WORD_NUMBERS[cleaned] !== undefined) {
        sum += ARABIC_WORD_NUMBERS[cleaned];
        foundWord = true;
      }
    }
    if (foundWord && sum > 0) {
      rawNum = sum;
    }
  }

  if (rawNum === undefined || Number.isNaN(rawNum) || rawNum <= 0) {
    return {};
  }

  // Rule: 100 Riyal = 5 Dirham (1 Dirham = 20 Riyal)
  if (isRiyal && !isDirham) {
    const dirham = Number((rawNum / 20).toFixed(2));
    return {
      amountDirham: dirham,
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
    .replace(/^(ل|لـ|ال|ديال)\s+/g, '')
    .replace(/^لـ(?=\S)/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

/**
 * Local deterministic Moroccan Darija & Arabic parser for instant zero-latency execution
 * or offline fallback when Gemini server is unavailable.
 */
export function parseDarijaVoiceFallback(text: string): ParsedVoiceCommand {
  const raw = text.trim();
  const normalized = raw.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  // 1. Invoices: Daily / Monthly / Customer
  if (/فاكتورة\s*(?:ديال\s*)?(?:اليوم|النهار|اليومية|today)/i.test(normalized)) {
    return { intent: 'invoice_daily', transcript: raw };
  }
  if (/فاكتورة\s*(?:ديال\s*)?(?:الشهر|شهر|الشهرية|month)/i.test(normalized)) {
    return { intent: 'invoice_monthly', transcript: raw };
  }
  const custInvMatch = normalized.match(/(?:عطيني|جيب|أعطني|بغيت|اعطيني)?\s*فاكتورة\s*(?:ديال\s*|د\s*|ل\s*)?(.+)/i);
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

  // 3. Purchase cost price update ("سلعة شريتها ب ثمن" or "شريتو ب ثمن")
  const costMatch = normalized.match(
    /^(.+?)\s+(?:شريتها|شريتو|شريته|تشرات|ثمن الشراء|سعر الشراء|شريت)\s+(?:بـ?|ب|على)?\s*.+/i
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

  // 4. Customer Payment ("فلان خلص ثمن")
  const payMatch = normalized.match(/^(.+?)\s+(?:خلص|سدد|دفع|عطاني)\s+(?:بـ?|ب)?\s*.+/i);
  if (payMatch && amtInfo.amountDirham) {
    return {
      intent: 'record_payment',
      customerName: cleanEntityName(payMatch[1]),
      ...amtInfo,
      transcript: raw
    };
  }

  // 5. Customer took product ("فلان خدا سلعة ب ثمن")
  const saleMatch = normalized.match(
    /^(.+?)\s+(?:خدا|خدات|خذى|أخذ|اشترى|شرا|دار|دات|تقدى)\s+(.+?)\s+(?:بـ?|ب|بثمن)\s*(.+)$/i
  );
  if (saleMatch && amtInfo.amountDirham) {
    const isCash = /نقدا|كاش|خلص|خالص/i.test(normalized);
    return {
      intent: 'record_sale',
      customerName: cleanEntityName(saleMatch[1]),
      productName: cleanEntityName(saleMatch[2]),
      quantity: 1,
      paymentMethod: isCash ? 'cash' : 'credit',
      ...amtInfo,
      transcript: raw
    };
  }

  return {
    intent: 'unknown',
    ...amtInfo,
    transcript: raw
  };
}

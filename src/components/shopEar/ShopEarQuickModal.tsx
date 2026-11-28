import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import { getLocalTodayYMD } from '../../utils/expenses';
import { safeParseJsonResponse } from '../../utils/aiVoice';
import { parseMoroccanNumber, sanitizeDecimalInput } from '../../utils/priceAlerts';
import {
  Ear,
  Mic,
  MicOff,
  Plus,
  Search,
  User,
  Phone,
  X,
  CheckCircle2,
  ClipboardList,
  Loader2
} from 'lucide-react';

interface SpeechRecognitionAlt {
  transcript: string;
}
interface SpeechRecognitionRes {
  isFinal: boolean;
  0: SpeechRecognitionAlt;
}
interface SpeechRecognitionEvt {
  results: ArrayLike<SpeechRecognitionRes>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvt) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const cleanSpokenProductName = (raw: string): string =>
  raw
    .trim()
    .replace(
      /^(سول\s+على|سولت\s+على|بغى|بغات|بغاو|باغي|كاين|واش\s+كاين|عطيني|عندك|خصنا|ما\s+كاينش|ما\s+لقيناش)\s+/i,
      ''
    )
    .trim();

export const ShopEarQuickModal: React.FC = () => {
  const {
    products,
    customers,
    shopEarRequests,
    addShopEarRequest,
    setCurrentTab,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [estimatedPrice, setEstimatedPrice] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [customerPhone, setCustomerPhone] = useState('');
  const [inputSource, setInputSource] = useState<'manual' | 'voice' | 'catalog'>('manual');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    const handleOpen = (ev?: Event) => {
      const detail = (ev as CustomEvent<{ initialQuery?: string }> | undefined)?.detail;
      if (detail?.initialQuery) {
        setItemName(detail.initialQuery);
      }
      setSavedNotice(null);
      setVoiceError(null);
      setIsOpen(true);
    };
    window.addEventListener('kadi:open-shop-ear-modal', handleOpen);
    return () => window.removeEventListener('kadi:open-shop-ear-modal', handleOpen);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const todayYMD = getLocalTodayYMD();

  const todayQuickChips = useMemo(() => {
    const map = new Map<string, { itemName: string; count: number; productId?: string; price?: number }>();
    shopEarRequests.forEach((req) => {
      if (req.dateKey !== todayYMD || req.status === 'notified') return;
      const prev = map.get(req.normalizedName);
      if (prev) {
        prev.count += 1;
      } else {
        map.set(req.normalizedName, {
          itemName: req.itemName,
          count: 1,
          productId: req.productId,
          price: req.estimatedUnitPrice
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [shopEarRequests, todayYMD]);

  const catalogSuggestions = useMemo(() => {
    const q = itemName.trim().toLowerCase();
    if (!q) {
      // Show out-of-stock / low-stock products first as smart suggestions
      return products
        .filter((p) => p.stock <= p.lowStockThreshold)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5);
    }
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 6);
  }, [products, itemName]);

  const customerSuggestions = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q))
      )
      .slice(0, 4);
  }, [customers, customerSearch]);

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  };

  const startFallbackRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 200) return;
        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const res = String(reader.result || '');
              resolve(res.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || 'audio/webm' })
          });
          const parsed = await safeParseJsonResponse<{ text?: string }>(res);
          const transcribedText = parsed.data?.text;
          if (transcribedText) {
            setItemName(cleanSpokenProductName(transcribedText));
            setInputSource('voice');
            setSelectedProductId(undefined);
          } else {
            setVoiceError(isAr ? 'ما قدرناش نفهمو الصوت، عاود تكلم ولا كتب السمية.' : 'Could not transcribe audio.');
          }
        } catch {
          setVoiceError(isAr ? 'تعذر تحويل الصوت، جرب الكتابة.' : 'Audio transcription failed.');
        } finally {
          setIsTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch {
      setVoiceError(isAr ? 'المرجو السماح للميكروفون أو كتابة اسم السلعة.' : 'Microphone permission required.');
    }
  };

  const handleToggleVoice = () => {
    setVoiceError(null);
    if (isListening) {
      stopVoiceCapture();
      return;
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = isAr ? 'ar-MA' : 'fr-FR';
        rec.continuous = false;
        rec.interimResults = true;
        rec.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((r) => r[0]?.transcript || '')
            .join(' ')
            .trim();
          if (transcript) {
            setItemName(cleanSpokenProductName(transcript));
            setInputSource('voice');
            setSelectedProductId(undefined);
          }
        };
        rec.onerror = () => {
          setIsListening(false);
          recognitionRef.current = null;
          void startFallbackRecorder();
        };
        rec.onend = () => {
          setIsListening(false);
          recognitionRef.current = null;
        };
        recognitionRef.current = rec;
        setIsListening(true);
        rec.start();
        return;
      } catch {
        // Fallback below
      }
    }
    void startFallbackRecorder();
  };

  const handleSelectCatalogProduct = (p: (typeof products)[number]) => {
    setItemName(p.name);
    setSelectedProductId(p.id);
    setEstimatedPrice(p.price > 0 ? String(p.price) : '');
    setInputSource('catalog');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = itemName.trim();
    if (!clean) return;

    const priceNum = parseMoroccanNumber(estimatedPrice);
    addShopEarRequest({
      itemName: clean,
      productId: selectedProductId,
      estimatedUnitPrice: priceNum > 0 ? priceNum : undefined,
      customerId: selectedCustomerId,
      customerName: customerSearch.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      inputSource
    });

    const todaySameCount =
      shopEarRequests.filter(
        (r) => r.dateKey === todayYMD && r.itemName.trim().toLowerCase() === clean.toLowerCase()
      ).length + 1;

    setSavedNotice(
      isAr
        ? `تسجلات "${clean}" — سول عليها ${todaySameCount} ديال الناس اليوم`
        : `Logged "${clean}" (${todaySameCount}x today)`
    );
    setItemName('');
    setSelectedProductId(undefined);
    setEstimatedPrice('');
    setCustomerSearch('');
    setSelectedCustomerId(undefined);
    setCustomerPhone('');
    setInputSource('manual');
  };

  const handleQuickBump = (chip: { itemName: string; productId?: string; price?: number }) => {
    addShopEarRequest({
      itemName: chip.itemName,
      productId: chip.productId,
      estimatedUnitPrice: chip.price,
      inputSource: 'manual'
    });
    const todaySameCount =
      shopEarRequests.filter(
        (r) =>
          r.dateKey === todayYMD &&
          r.itemName.trim().toLowerCase() === chip.itemName.trim().toLowerCase()
      ).length + 1;
    setSavedNotice(
      isAr
        ? `+1 على "${chip.itemName}" — سول عليها ${todaySameCount} ديال الناس اليوم`
        : `+1 for "${chip.itemName}" (${todaySameCount}x today)`
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Ear className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {isAr ? 'ودن الحانوت — السلعة المطلوبة' : 'Shop Ear — Requested Item'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'سول زبون على سلعة ما كايناش؟ سجلها بالكتابة ولا بالصوت في ثانية.'
                  : 'Log out-of-stock or requested items by typing or voice.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopVoiceCapture();
              setIsOpen(false);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {savedNotice && (
            <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* Today's fast +1 chips */}
          {todayQuickChips.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                {isAr ? 'سولو عليها اليوم (اضغط +1 للتكرار السريع):' : 'Asked today (tap +1):'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {todayQuickChips.map((chip) => (
                  <button
                    key={chip.itemName}
                    type="button"
                    onClick={() => handleQuickBump(chip)}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{chip.itemName}</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[10px] font-black font-mono tabular-nums">
                      {chip.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product Name + Voice Mic */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {isAr ? 'شنو السلعة اللي سول عليها الزبون؟' : 'Which item did the customer ask for?'}
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => {
                    setItemName(e.target.value);
                    setSelectedProductId(undefined);
                    setInputSource('manual');
                  }}
                  placeholder={isAr ? 'مثال: حليب نيدو كبير...' : 'e.g., Nido Milk Large...'}
                  autoFocus
                  required
                  className="w-full ps-9 pe-3 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                type="button"
                onClick={handleToggleVoice}
                disabled={isTranscribing}
                className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors ${
                  isListening
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                }`}
                title={isAr ? 'سجل اسم السلعة بالصوت' : 'Record item name by voice'}
              >
                {isTranscribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
                <span>
                  {isTranscribing
                    ? isAr
                      ? 'جاري الفهم...'
                      : 'Wait...'
                    : isListening
                    ? isAr
                      ? 'وقف'
                      : 'Stop'
                    : isAr
                    ? 'بالصوت'
                    : 'Voice'}
                </span>
              </button>
            </div>
            {voiceError && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">{voiceError}</p>
            )}

            {/* Catalog quick pick */}
            {catalogSuggestions.length > 0 && !selectedProductId && (
              <div className="mt-2 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-36 overflow-y-auto">
                {catalogSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectCatalogProduct(p)}
                    className="w-full px-3 py-1.5 text-start flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {p.name}
                    </span>
                    <span
                      className={`text-[10px] font-mono tabular-nums shrink-0 ${
                        p.stock <= 0
                          ? 'text-rose-600 dark:text-rose-400 font-black'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {p.stock <= 0
                        ? isAr
                          ? 'سالا (0)'
                          : 'Out (0)'
                        : `${isAr ? 'الباقي' : 'Stock'}: ${p.stock}`}{' '}
                      · {p.price.toFixed(0)} {currencySymbol}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Optional Customer + Phone + Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="relative">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'اسم الزبون (اختياري — باش تصيفط ليه مني تجي)' : 'Customer Name (optional)'}
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomerId(undefined);
                  }}
                  placeholder={isAr ? 'مثال: سي محمد / فاطمة...' : 'Customer name...'}
                  className="w-full ps-8 pe-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              {customerSuggestions.length > 0 && !selectedCustomerId && (
                <div className="absolute left-0 right-0 z-10 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800">
                  {customerSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setCustomerSearch(c.name);
                        if (c.phone) setCustomerPhone(c.phone);
                      }}
                      className="w-full px-3 py-1.5 text-start text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'رقم واتساب ديالو (اختياري)' : 'WhatsApp Phone (optional)'}
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="06XXXXXXXX"
                  className="w-full ps-8 pe-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Estimated unit price (optional) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
              {isAr
                ? `ثمن البيع التقريبي (${currencySymbol}) — اختياري لحساب الفلوس اللي ضاعت`
                : `Estimated Price (${currencySymbol}) - optional`}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={estimatedPrice}
              onChange={(e) => setEstimatedPrice(sanitizeDecimalInput(e.target.value))}
              placeholder={isAr ? 'مثال: 65' : '0'}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                stopVoiceCapture();
                setIsOpen(false);
                setCurrentTab('shop_ear');
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
            >
              <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
              <span>{isAr ? 'ورقة الجملة والملخص' : 'Wholesale Sheet'}</span>
            </button>

            <button
              type="submit"
              disabled={!itemName.trim()}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 text-xs sm:text-sm font-black flex items-center gap-1.5 transition-colors"
            >
              <Ear className="w-4 h-4" />
              <span>{isAr ? 'سجل في ودن الحانوت' : 'Save Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Send,
  Sparkles,
  Volume2,
  X,
  AlertCircle,
  Calendar,
  CalendarDays,
  UserCheck
} from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { ParsedVoiceCommand, parseDarijaVoiceFallback } from '../../utils/darijaVoiceParser';
import { VoiceCameraModal } from './VoiceCameraModal';
import { VoiceInvoicesModal, VoiceInvoiceTab } from './VoiceInvoicesModal';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceLogEntry {
  id: string;
  time: string;
  transcript: string;
  summary: string;
  conversionBadge?: string;
  status: 'success' | 'error';
}

const EXAMPLE_COMMANDS = [
  'محمد خدا التيد ب 100 ريال',
  'التيد شريتو ب 60 ريال',
  'محمد خلص 100 ريال',
  'زيد تصويرة ل التيد',
  'عطيني فاكتورة اليوم',
  'عطيني فاكتورة الشهر',
  'عطيني فاكتورة محمد'
];

export const VoiceAssistantModal: React.FC = () => {
  const {
    products,
    customers,
    recordVoiceSale,
    updateProductPurchaseCostAndRecalculateProfit,
    settleCustomerCredit,
    addCustomer,
    currencySymbol,
    language
  } = usePos();
  const isAr = language === 'ar';

  const [isOpen, setIsOpen] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [isListeningSpeech, setIsListeningSpeech] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [logs, setLogs] = useState<VoiceLogEntry[]>([]);

  // Nested action modals
  const [cameraModalState, setCameraModalState] = useState<{ open: boolean; productName?: string }>({
    open: false
  });
  const [invoiceModalState, setInvoiceModalState] = useState<{
    open: boolean;
    tab: VoiceInvoiceTab;
    customerName?: string;
  }>({ open: false, tab: 'daily' });

  const speechRecRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const hasWebSpeech =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition
    );

  // Listen for Navbar top compact Mic toggle
  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener('kadi:toggle-voice-assistant', handleToggle);
    return () => window.removeEventListener('kadi:toggle-voice-assistant', handleToggle);
  }, []);

  // Cleanup active mic streams on close/unmount
  useEffect(() => {
    if (!isOpen) {
      try {
        speechRecRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListeningSpeech(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      setIsRecordingAudio(false);
    }
  }, [isOpen]);

  const appendLog = useCallback((entry: Omit<VoiceLogEntry, 'id' | 'time'>) => {
    setLogs((prev) => [
      {
        ...entry,
        id: `vlog-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        time: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
      },
      ...prev.slice(0, 14)
    ]);
  }, []);

  const applyParsedCommand = useCallback(
    (cmd: ParsedVoiceCommand, spokenTranscript: string) => {
      const riyalBadge =
        cmd.originalCurrency === 'riyal' && cmd.originalAmount && cmd.amountDirham
          ? `${cmd.originalAmount} ريال = ${cmd.amountDirham.toFixed(2)} ${currencySymbol}`
          : undefined;

      switch (cmd.intent) {
        case 'record_sale': {
          if (!cmd.amountDirham || cmd.amountDirham <= 0) {
            setStatusError(
              isAr
                ? 'لم أتمكن من تحديد الثمن بالدرهم أو الريال. مثال: "محمد خدا التيد ب 100 ريال"'
                : 'Could not determine sale price. Example: "Mohamed took Tide for 100 riyal"'
            );
            return;
          }
          const res = recordVoiceSale({
            customerName: cmd.customerName || 'زبون عام',
            productName: cmd.productName || 'سلعة جديدة',
            priceDirham: cmd.amountDirham,
            quantity: cmd.quantity || 1,
            paymentMethod: cmd.paymentMethod || 'credit',
            note: `تسجيل صوتي: ${spokenTranscript}`
          });
          const prodTag = res.createdProduct ? ' (أضيفت تلقائياً لقائمة السلع)' : '';
          const custTag = res.createdCustomer ? ' (زبون جديد)' : '';
          appendLog({
            transcript: spokenTranscript,
            summary: `${res.customer.name}${custTag} أخذ "${res.product.name}"${prodTag} بمبلغ ${res.order.grandTotal.toFixed(2)} ${currencySymbol} (${res.order.paymentMethod === 'credit' ? 'كريدي' : 'نقداً'})`,
            conversionBadge: riyalBadge,
            status: 'success'
          });
          setCommandText('');
          return;
        }

        case 'record_payment': {
          if (!cmd.amountDirham || cmd.amountDirham <= 0 || !cmd.customerName) {
            setStatusError(
              isAr
                ? 'المرجو ذكر اسم الزبون والمبلغ. مثال: "محمد خلص 200 ريال"'
                : 'Please specify customer name and payment amount.'
            );
            return;
          }
          const q = cmd.customerName.trim().toLowerCase();
          let targetCust =
            customers.find((c) => c.name.trim().toLowerCase() === q) ||
            customers.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.trim().toLowerCase()));
          if (!targetCust) {
            targetCust = addCustomer({
              name: cmd.customerName.trim(),
              phone: '',
              notes: 'تم إنشاؤه تلقائياً عند تسديد صوتي'
            });
          }
          const payRes = settleCustomerCredit(
            targetCust.id,
            cmd.amountDirham,
            `تسديد صوتي: ${spokenTranscript}`
          );
          if (!payRes.success) {
            setStatusError(payRes.message || (isAr ? 'تعذر تسجيل الدفعة' : 'Payment failed'));
            appendLog({
              transcript: spokenTranscript,
              summary: payRes.message || 'تعذر تسجيل الدفعة',
              conversionBadge: riyalBadge,
              status: 'error'
            });
            return;
          }
          appendLog({
            transcript: spokenTranscript,
            summary: `✓ تم تسجيل تسديد ${cmd.amountDirham.toFixed(2)} ${currencySymbol} من الزبون "${targetCust.name}"`,
            conversionBadge: riyalBadge,
            status: 'success'
          });
          setCommandText('');
          return;
        }

        case 'set_cost_price': {
          if (!cmd.amountDirham || cmd.amountDirham <= 0 || !cmd.productName) {
            setStatusError(
              isAr
                ? 'المرجو ذكر اسم السلعة وثمن الشراء. مثال: "التيد شريتو ب 60 ريال"'
                : 'Please specify product name and purchase cost.'
            );
            return;
          }
          const costRes = updateProductPurchaseCostAndRecalculateProfit(cmd.productName, cmd.amountDirham);
          appendLog({
            transcript: spokenTranscript,
            summary: `✓ تم تحديث ثمن الشراء لـ "${costRes.product.name}" إلى ${costRes.product.costPrice.toFixed(2)} ${currencySymbol} — ربح الوحدة: ${costRes.unitProfit.toFixed(2)} ${currencySymbol} (${costRes.marginPct}%)`,
            conversionBadge: riyalBadge,
            status: 'success'
          });
          setCommandText('');
          return;
        }

        case 'capture_photo': {
          setCameraModalState({ open: true, productName: cmd.productName });
          appendLog({
            transcript: spokenTranscript,
            summary: cmd.productName
              ? `📷 تم فتح الكاميرا لإضافة صورة لسلعة "${cmd.productName}"`
              : '📷 تم فتح الكاميرا لتصوير السلعة',
            status: 'success'
          });
          setCommandText('');
          return;
        }

        case 'invoice_daily': {
          setInvoiceModalState({ open: true, tab: 'daily' });
          appendLog({
            transcript: spokenTranscript,
            summary: '📄 تم عرض فاكتورة اليوم حسب الزبائن',
            status: 'success'
          });
          setCommandText('');
          return;
        }

        case 'invoice_monthly': {
          setInvoiceModalState({ open: true, tab: 'monthly' });
          appendLog({
            transcript: spokenTranscript,
            summary: '📊 تم عرض فاكتورة الشهر الكاملة',
            status: 'success'
          });
          setCommandText('');
          return;
        }

        case 'invoice_customer': {
          setInvoiceModalState({ open: true, tab: 'customer', customerName: cmd.customerName });
          appendLog({
            transcript: spokenTranscript,
            summary: cmd.customerName
              ? `🧾 تم عرض فاكتورة الزبون "${cmd.customerName}" نهار بنهار`
              : '🧾 تم عرض صفحة فاكتورة الزبون',
            status: 'success'
          });
          setCommandText('');
          return;
        }

        default: {
          setStatusError(
            isAr
              ? 'ما فهمتش الأمر مزيان. جرب بحال: "محمد خدا التيد ب 100 ريال" أو "عطيني فاكتورة اليوم"'
              : 'Command not recognized. Try one of the examples below.'
          );
          appendLog({
            transcript: spokenTranscript,
            summary: isAr ? 'أمر غير واضح — جرب صياغة أخرى' : 'Unrecognized command',
            status: 'error'
          });
        }
      }
    },
    [
      isAr,
      currencySymbol,
      recordVoiceSale,
      customers,
      addCustomer,
      settleCustomerCredit,
      updateProductPurchaseCostAndRecalculateProfit,
      appendLog
    ]
  );

  const executeVoiceInput = useCallback(
    async (payload: { transcript?: string; audioBase64?: string; audioMimeType?: string }) => {
      const trimmedText = payload.transcript?.trim() || '';
      if (!trimmedText && !payload.audioBase64) return;

      setIsProcessing(true);
      setStatusError(null);

      try {
        const res = await fetch('/api/ai/voice-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: trimmedText || undefined,
            audioBase64: payload.audioBase64,
            audioMimeType: payload.audioMimeType,
            existingProducts: products.map((p) => p.name),
            existingCustomers: customers.map((c) => c.name)
          })
        });

        if (res.ok) {
          const data = (await res.json()) as { command?: ParsedVoiceCommand };
          const serverCmd = data.command;
          const finalTranscript = serverCmd?.transcript || trimmedText || 'تسجيل صوتي';
          if (serverCmd && serverCmd.intent && serverCmd.intent !== 'unknown') {
            applyParsedCommand(serverCmd, finalTranscript);
            return;
          }
          if (finalTranscript && trimmedText) {
            const localFallback = parseDarijaVoiceFallback(finalTranscript);
            applyParsedCommand(localFallback, finalTranscript);
            return;
          }
        }
      } catch {
        // Network or server unavailable -> gracefully use deterministic Darija fallback
      } finally {
        setIsProcessing(false);
      }

      if (trimmedText) {
        const fallbackCmd = parseDarijaVoiceFallback(trimmedText);
        applyParsedCommand(fallbackCmd, trimmedText);
      } else {
        setStatusError(
          isAr
            ? 'تعذر تحليل التسجيل الصوتي عبر الخادم. يمكنك استخدام زر الميكروفون المباشر أو كتابة الأمر.'
            : 'Could not transcribe audio clip via server. Try live mic or typing the command.'
        );
      }
    },
    [products, customers, applyParsedCommand, isAr]
  );

  const handleToggleWebSpeech = () => {
    setStatusError(null);
    if (isListeningSpeech) {
      try {
        speechRecRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListeningSpeech(false);
      return;
    }

    const SpeechCtor =
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
          webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        }
      ).webkitSpeechRecognition;

    if (!SpeechCtor) {
      setStatusError(
        isAr
          ? 'التعرف الصوتي المباشر غير مدعوم هنا — استخدم "تسجيل صوتي لـ Gemini" بجانبه.'
          : 'Web Speech API unavailable here — use Gemini Audio Record instead.'
      );
      return;
    }

    try {
      const rec = new SpeechCtor();
      rec.lang = 'ar-MA';
      rec.continuous = false;
      rec.interimResults = true;

      let latestFinal = '';
      rec.onresult = (evt) => {
        let combined = '';
        for (let i = 0; i < evt.results.length; i += 1) {
          const item = evt.results[i];
          combined += item[0].transcript;
          if (item.isFinal) {
            latestFinal = combined.trim();
          }
        }
        setCommandText(combined.trim());
      };

      rec.onerror = (evt) => {
        setIsListeningSpeech(false);
        if (evt.error === 'not-allowed') {
          setStatusError(isAr ? 'المرجو السماح بإذن الميكروفون في المتصفح.' : 'Microphone permission denied.');
        }
      };

      rec.onend = () => {
        setIsListeningSpeech(false);
        if (latestFinal) {
          void executeVoiceInput({ transcript: latestFinal });
        }
      };

      speechRecRef.current = rec;
      rec.start();
      setIsListeningSpeech(true);
    } catch {
      setIsListeningSpeech(false);
      setStatusError(isAr ? 'تعذر تشغيل الميكروفون المباشر.' : 'Failed to start microphone.');
    }
  };

  const handleToggleAudioRecorder = async () => {
    setStatusError(null);
    if (isRecordingAudio) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingAudio(false);
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setStatusError(isAr ? 'تسجيل الصوت غير مدعوم في هذا المتصفح.' : 'Audio recording is unsupported.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          if (base64) {
            void executeVoiceInput({
              audioBase64: base64,
              audioMimeType: blob.type || 'audio/webm'
            });
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingAudio(true);
    } catch {
      setStatusError(isAr ? 'تعذر الوصول للميكروفون.' : 'Microphone access denied.');
      setIsRecordingAudio(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed top-16 end-4 z-[55] w-[calc(100vw-2rem)] sm:w-[440px] max-h-[82vh] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-900 via-slate-900 to-teal-900 text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                <Volume2 className="w-4 h-4 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-xs font-black tracking-wide">
                  {isAr ? 'التسجيل الصوتي الكامل (Kadi Voice)' : 'Kadi Full Voice POS'}
                </h3>
                <p className="text-[10px] text-emerald-200/90">
                  {isAr ? 'هضر بالدارجة · 100 ريال = 5 درهم' : 'Speak Moroccan Darija · 100 Riyal = 5 DH'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-300 hover:text-white rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {/* Dual Mic Controls */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isProcessing || isRecordingAudio}
                onClick={handleToggleWebSpeech}
                className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
                  isListeningSpeech
                    ? 'bg-rose-600 text-white border-rose-500 animate-pulse shadow-lg shadow-rose-500/30'
                    : hasWebSpeech
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                }`}
              >
                {isListeningSpeech ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>
                  {isListeningSpeech
                    ? isAr
                      ? 'وقف الاستماع...'
                      : 'Stop Listening'
                    : isAr
                    ? 'تحدث الآن (مباشر)'
                    : 'Live Speak'}
                </span>
              </button>

              <button
                type="button"
                disabled={isProcessing || isListeningSpeech}
                onClick={handleToggleAudioRecorder}
                className={`py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all border ${
                  isRecordingAudio
                    ? 'bg-amber-600 text-white border-amber-500 animate-pulse shadow-lg shadow-amber-500/30'
                    : 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white border-slate-700'
                }`}
              >
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>
                  {isRecordingAudio
                    ? isAr
                      ? 'إنهاء وإرسال الصوت'
                      : 'Finish & Send'
                    : isAr
                    ? 'تسجيل لـ Gemini'
                    : 'Record Clip'}
                </span>
              </button>
            </div>

            {/* Transcript / Command Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void executeVoiceInput({ transcript: commandText });
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                placeholder={
                  isAr
                    ? 'مثال: محمد خدا التيد ب 100 ريال...'
                    : 'Say or type: Mohamed took Tide for 100 riyal...'
                }
                className="flex-1 px-3.5 py-2.5 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={isProcessing || !commandText.trim()}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{isAr ? 'تنفيذ' : 'Run'}</span>
              </button>
            </form>

            {statusError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{statusError}</span>
              </div>
            )}

            {/* 3 Quick Invoices + Camera Triggers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setInvoiceModalState({ open: true, tab: 'daily' })}
                className="px-2.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-[11px] font-black flex items-center justify-center gap-1 hover:bg-emerald-100"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{isAr ? 'فاكتورة اليوم' : 'Daily'}</span>
              </button>
              <button
                type="button"
                onClick={() => setInvoiceModalState({ open: true, tab: 'monthly' })}
                className="px-2.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 text-[11px] font-black flex items-center justify-center gap-1 hover:bg-indigo-100"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>{isAr ? 'فاكتورة الشهر' : 'Monthly'}</span>
              </button>
              <button
                type="button"
                onClick={() => setInvoiceModalState({ open: true, tab: 'customer' })}
                className="px-2.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-[11px] font-black flex items-center justify-center gap-1 hover:bg-amber-100"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{isAr ? 'فاكتورة زبون' : 'Customer'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraModalState({ open: true })}
                className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-black flex items-center justify-center gap-1 hover:bg-slate-200"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isAr ? 'تصوير سلعة' : 'Camera'}</span>
              </button>
            </div>

            {/* Darija Examples */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-black text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-500" />
                <span>{isAr ? 'أمثلة بالدارجة (اضغط للتجربة فوراً):' : 'Darija Examples (tap to test):'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_COMMANDS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setCommandText(ex);
                      void executeVoiceInput({ transcript: ex });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Executed Voice Feed */}
            {logs.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-[11px] font-black text-slate-500 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isAr ? 'سجل الأوامر المنفذة:' : 'Executed Commands:'}</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {logs.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                        item.status === 'success'
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
                        <span className="truncate">« {item.transcript} »</span>
                        <span>{item.time}</span>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-start gap-1.5">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            item.status === 'success' ? 'text-emerald-600' : 'text-rose-500'
                          }`}
                        />
                        <span>{item.summary}</span>
                      </div>
                      {item.conversionBadge && (
                        <div className="inline-block px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-mono text-[10px] font-black">
                          💱 {item.conversionBadge}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voice-Triggered Camera Modal */}
      <VoiceCameraModal
        isOpen={cameraModalState.open}
        initialProductName={cameraModalState.productName}
        onClose={() => setCameraModalState({ open: false })}
        onSaved={(productName) => {
          appendLog({
            transcript: `تصويرة لـ ${productName}`,
            summary: `✓ تم حفظ الصورة بنجاح على السلعة "${productName}"`,
            status: 'success'
          });
        }}
      />

      {/* Voice-Triggered 3-Tab Invoices Modal */}
      <VoiceInvoicesModal
        isOpen={invoiceModalState.open}
        initialTab={invoiceModalState.tab}
        initialCustomerName={invoiceModalState.customerName}
        onClose={() => setInvoiceModalState((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
};

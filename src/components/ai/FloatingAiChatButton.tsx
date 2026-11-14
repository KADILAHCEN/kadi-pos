import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  X,
  Maximize2,
  Copy,
  Check,
  Trash2
} from 'lucide-react';
import { usePos } from '../../context/PosContext';

type ChatMode = 'advisor' | 'tutor' | 'investigator';

export const FloatingAiChatButton: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    products,
    orders,
    expenses,
    customers,
    settings,
    cpuSettings,
    cpuRecords,
    zakatSummary,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [isOpen, setIsOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('advisor');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    const onToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener('kadi:toggle-ai-chat', onToggle);
    return () => window.removeEventListener('kadi:toggle-ai-chat', onToggle);
  }, []);

  const storeSummary = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'completed');
    const totalRevenue = completed.reduce((s, o) => s + o.grandTotal, 0);
    const totalGrossProfit = completed.reduce((s, o) => s + o.profitTotal, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const totalReceivables = customers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
    const unpaidCpuTotal = cpuRecords
      .filter((r) => r.status !== 'paid')
      .reduce((s, r) => s + r.totalDue, 0);
    const criticalLowStockCount = products.filter(
      (p) => p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold * 0.2
    ).length;

    return {
      storeName: settings.storeName,
      activeTab: currentTab,
      currencySymbol,
      completedOrdersCount: completed.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
      grossMarginPercent:
        totalRevenue > 0 ? Number(((totalGrossProfit / totalRevenue) * 100).toFixed(2)) : 0,
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfitBeforeTax: Number((totalGrossProfit - totalExpenses).toFixed(2)),
      criticalLowStockCount,
      customerCreditReceivables: Number(totalReceivables.toFixed(2)),
      annualPatenteTax: cpuSettings.annualPatenteTax || 0,
      unpaidCpuTotal: Number(unpaidCpuTotal.toFixed(2)),
      zakatDueAmount: Number(zakatSummary.zakatDue.toFixed(2))
    };
  }, [
    orders,
    expenses,
    customers,
    cpuRecords,
    products,
    settings.storeName,
    currentTab,
    currencySymbol,
    cpuSettings.annualPatenteTax,
    zakatSummary.zakatDue
  ]);

  const handleSend = async (customText?: string) => {
    const q = (customText ?? input).trim();
    if (!q || isSending) return;
    if (!customText) setInput('');

    const next = [...messages, { role: 'user' as const, text: q }];
    setMessages(next);
    setIsSending(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history: messages,
          storeSummary,
          language,
          mode: chatMode
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'MISSING_API_KEY') {
          throw new Error(
            isAr
              ? 'مفتاح GEMINI_API_KEY غير مضاف على الخادم حالياً.'
              : 'GEMINI_API_KEY is not configured on the server.'
          );
        }
        throw new Error(data?.error || 'AI request failed');
      }
      setMessages([...next, { role: 'assistant', text: data.reply || '' }]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to connect to AI');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const quickPrompts = isAr
    ? [
        'كم صافي الربح الحقيقي اليوم وماذا تنصحني؟',
        'علّمني حساب ضريبة CPU والباتنتا بأرقام متجري',
        'هل هناك أي ثغرات أو هدر مالي يجب الانتباه له؟'
      ]
    : isFr
    ? [
        'Quel est mon bénéfice net réel et vos conseils ?',
        'Expliquez mon impôt CPU et Patente avec mes chiffres',
        'Y a-t-il des pertes ou anomalies à surveiller ?'
      ]
    : [
        'What is my net profit & top recommendation?',
        'Explain my CPU & Patente taxes using store numbers',
        'Are there any money leaks or inventory risks?'
      ];

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed top-16 end-4 z-50 w-[min(94vw,390px)] h-[min(76vh,520px)] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-3">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-violet-950 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black truncate">
                  {isAr ? 'محادثة الذكاء الاصطناعي - Kadi AI' : 'Kadi AI Assistant Chat'}
                </div>
                <div className="text-[10px] text-indigo-200 truncate">
                  {isAr ? 'مرتبط مباشرة بأرقام متجرك' : 'Connected to live store metrics'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setCurrentTab('ai_assistant');
                }}
                title={isAr ? 'فتح الصفحة الكاملة' : 'Open Full AI View'}
                className="p-1.5 rounded-lg hover:bg-white/15 text-indigo-100 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  title={isAr ? 'مسح المحادثة' : 'Clear Chat'}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-indigo-100 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title={isAr ? 'إغلاق' : 'Close'}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mode Selector Bar */}
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 shrink-0">
            {(['advisor', 'tutor', 'investigator'] as ChatMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChatMode(m)}
                className={`flex-1 py-1.5 px-2 rounded-xl text-[10px] font-black transition-colors ${
                  chatMode === m
                    ? m === 'investigator'
                      ? 'bg-rose-600 text-white'
                      : m === 'tutor'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-violet-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {m === 'advisor'
                  ? isAr
                    ? 'مستشار'
                    : 'Advisor'
                  : m === 'tutor'
                  ? isAr
                    ? 'علّمني'
                    : 'Tutor'
                  : isAr
                  ? 'المحقق السري'
                  : 'Auditor'}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-900/60 text-[11px] text-slate-700 dark:text-slate-200 flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? 'مرحباً! اسألني في أي وقت عن أرباحك، ضرائب CPU والباتنتا، المخزون الحرج أو كشف التجاوزات.'
                      : 'Hi! Ask anything about your real-time profit, CPU/Patente taxes, critical stock, or audit risks.'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {quickPrompts.map((qp) => (
                    <button
                      key={qp}
                      type="button"
                      onClick={() => handleSend(qp)}
                      className="text-start px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/50 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-slate-900 dark:bg-emerald-700 text-white ms-7'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 me-7'
                }`}
              >
                <div>{m.text}</div>
                {m.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => handleCopy(m.text, idx)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-violet-600"
                  >
                    {copiedIdx === idx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>{isAr ? 'تم النسخ' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{isAr ? 'نسخ' : 'Copy'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}

            {isSending && (
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 me-7">
                {isAr ? 'جاري التفكير والكتابة...' : 'Thinking...'}
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isAr ? 'اكتب رسالتك للذكاء الاصطناعي...' : 'Type a message to AI...'}
              className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
  );
};

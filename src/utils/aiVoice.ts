export type AiSpeechLang = 'ar' | 'fr' | 'en';

let activeAudioElement: HTMLAudioElement | null = null;
let activeSpeechToken = 0;

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_#>~|]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[•✓✔✕✖📄📊🧾📷🎙️💱✅⚠️]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stopAiSpeech(): void {
  activeSpeechToken += 1;
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {
      // ignore audio stop errors
    }
    activeAudioElement = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore speechSynthesis cancel errors
    }
  }
}

function speakWithBrowserSynthesis(
  cleanText: string,
  language: AiSpeechLang,
  token: number,
  opts?: { onStart?: () => void; onEnd?: () => void }
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !cleanText) {
      opts?.onEnd?.();
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voices = window.speechSynthesis.getVoices();

      if (language === 'ar') {
        const arVoice =
          voices.find((v) => v.lang.toLowerCase().startsWith('ar-ma')) ||
          voices.find((v) => v.lang.toLowerCase().startsWith('ar-sa')) ||
          voices.find((v) => v.lang.toLowerCase().startsWith('ar'));
        if (arVoice) utterance.voice = arVoice;
        utterance.lang = arVoice?.lang || 'ar-MA';
      } else if (language === 'fr') {
        const frVoice = voices.find((v) => v.lang.toLowerCase().startsWith('fr'));
        if (frVoice) utterance.voice = frVoice;
        utterance.lang = frVoice?.lang || 'fr-FR';
      } else {
        const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
        if (enVoice) utterance.voice = enVoice;
        utterance.lang = enVoice?.lang || 'en-US';
      }

      utterance.rate = 1.0;
      utterance.onstart = () => {
        if (token === activeSpeechToken) opts?.onStart?.();
      };
      utterance.onend = () => {
        if (token === activeSpeechToken) opts?.onEnd?.();
        resolve();
      };
      utterance.onerror = () => {
        if (token === activeSpeechToken) opts?.onEnd?.();
        resolve();
      };

      opts?.onStart?.();
      window.speechSynthesis.speak(utterance);
    } catch {
      opts?.onEnd?.();
      resolve();
    }
  });
}

export async function speakAiText(
  text: string,
  language: AiSpeechLang = 'ar',
  opts?: { onStart?: () => void; onEnd?: () => void }
): Promise<void> {
  const clean = stripMarkdownForSpeech(text);
  if (!clean) {
    opts?.onEnd?.();
    return;
  }

  stopAiSpeech();
  const token = activeSpeechToken;

  try {
    const res = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean.slice(0, 1400),
        voiceName: 'Kore'
      })
    });

    if (token !== activeSpeechToken) return;

    if (res.ok) {
      const parsed = await safeParseJsonResponse<{ audioBase64?: string; mimeType?: string }>(res);
      const data = parsed.data;
      if (data?.audioBase64 && token === activeSpeechToken) {
        const mime = data.mimeType || 'audio/wav';
        const audio = new Audio(`data:${mime};base64,${data.audioBase64}`);
        activeAudioElement = audio;

        await new Promise<void>((resolve) => {
          audio.onplay = () => {
            if (token === activeSpeechToken) opts?.onStart?.();
          };
          audio.onended = () => {
            if (activeAudioElement === audio) activeAudioElement = null;
            if (token === activeSpeechToken) opts?.onEnd?.();
            resolve();
          };
          audio.onerror = () => {
            if (activeAudioElement === audio) activeAudioElement = null;
            resolve();
          };
          opts?.onStart?.();
          audio.play().catch(() => {
            if (activeAudioElement === audio) activeAudioElement = null;
            resolve();
          });
        });

        if (token === activeSpeechToken) {
          opts?.onEnd?.();
        }
        return;
      }
    }
  } catch {
    // Fall back silently to browser SpeechSynthesis
  }

  if (token !== activeSpeechToken) return;
  await speakWithBrowserSynthesis(clean.slice(0, 900), language, token, opts);
}

export async function safeParseJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<{ data: T | null; isNonJson: boolean; rawText: string }> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { data: null, isNonJson: true, rawText };
  }
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return { data: JSON.parse(cleaned) as T, isNonJson: false, rawText };
  } catch {
    return { data: null, isNonJson: true, rawText };
  }
}

export function buildLocalStoreFallbackReply(
  storeSummary: Record<string, unknown>,
  language: AiSpeechLang = 'ar'
): string {
  const cur = String(storeSummary.currencySymbol || 'DH');
  const rev = Number(storeSummary.totalRevenue || 0);
  const gross = Number(storeSummary.totalGrossProfit || 0);
  const exp = Number(storeSummary.totalExpenses || 0);
  const net = Number(storeSummary.netProfitBeforeTax ?? gross - exp);
  const ordersCount = Number(storeSummary.completedOrdersCount || 0);
  const credit = Number(storeSummary.customerCreditReceivables || 0);
  const critical = Number(storeSummary.criticalLowStockCount || 0);

  if (language === 'ar') {
    return [
      `ملخص الأرباح والحسابات الحية لمتجرك:`,
      `• إجمالي المبيعات: ${rev.toFixed(2)} ${cur} (${ordersCount} فاتورة)`,
      `• الربح الإجمالي: ${gross.toFixed(2)} ${cur}`,
      `• المصاريف المسجلة: ${exp.toFixed(2)} ${cur}`,
      `• صافي الربح قبل الضريبة: ${net.toFixed(2)} ${cur}`,
      `• ديون الكريدي عند الزبائن: ${credit.toFixed(2)} ${cur}`,
      `• سلع في المخزون الحرج: ${critical} صنف`
    ].join('\n');
  }
  if (language === 'fr') {
    return [
      `Résumé en direct de votre boutique :`,
      `• Ventes totales : ${rev.toFixed(2)} ${cur} (${ordersCount} factures)`,
      `• Bénéfice brut : ${gross.toFixed(2)} ${cur}`,
      `• Dépenses : ${exp.toFixed(2)} ${cur}`,
      `• Bénéfice net avant impôt : ${net.toFixed(2)} ${cur}`,
      `• Crédits clients : ${credit.toFixed(2)} ${cur}`,
      `• Stock critique : ${critical} articles`
    ].join('\n');
  }
  return [
    `Live store profit summary:`,
    `• Total Sales: ${rev.toFixed(2)} ${cur} (${ordersCount} orders)`,
    `• Gross Profit: ${gross.toFixed(2)} ${cur}`,
    `• Expenses: ${exp.toFixed(2)} ${cur}`,
    `• Net Profit Before Tax: ${net.toFixed(2)} ${cur}`,
    `• Customer Credit: ${credit.toFixed(2)} ${cur}`,
    `• Critical Low Stock: ${critical} items`
  ].join('\n');
}

export async function transcribeAudioWithServer(
  audioBase64: string,
  audioMimeType: string,
  language: AiSpeechLang = 'ar'
): Promise<string> {
  const res = await fetch('/api/ai/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, audioMimeType, language })
  });
  const parsed = await safeParseJsonResponse<{ transcript?: string; error?: string }>(res);
  if (parsed.isNonJson || !parsed.data) {
    throw new Error(
      language === 'ar' ? 'خدمة تفريغ الصوت غير متاحة حالياً.' : 'Audio transcription unavailable.'
    );
  }
  if (!res.ok) {
    throw new Error(parsed.data.error || 'Transcription failed');
  }
  return (parsed.data.transcript || '').trim();
}

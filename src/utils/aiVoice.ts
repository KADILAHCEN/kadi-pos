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
      const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
      if (data.audioBase64 && token === activeSpeechToken) {
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
  const data = (await res.json()) as { transcript?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Transcription failed');
  }
  return (data.transcript || '').trim();
}

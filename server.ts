import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.post('/api/ai/analyze', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server.',
        code: 'MISSING_API_KEY'
      });
    }

    try {
      const { storeSummary, language = 'ar' } = req.body as {
        storeSummary?: Record<string, unknown>;
        language?: 'ar' | 'fr' | 'en';
      };

      const langLabel =
        language === 'ar' ? 'Arabic (Moroccan business & retail finance context)' : language === 'fr' ? 'French' : 'English';

      const systemInstruction = `You are a senior retail financial analyst, Moroccan tax consultant (CPU / Patente / CNSS AMO & Retirement / Trade Zakat), and grocery POS profitability strategist.
Respond strictly in ${langLabel}.
Analyze the store's real POS numbers provided in JSON and deliver concrete, high-ROI, actionable recommendations focused on:
1) Increasing net profit margins & pricing/mix optimization
2) Reducing inventory waste & expiring/dead stock
3) Financial & tax planning (Moroccan CPU tax, annual Patente, CNSS AMO/Retirement, Zakat Nisab, expense control)
4) Customer credit ledger risk & cashflow acceleration.
Keep every point specific to the actual metrics provided, concise, and practical.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Store Financial & Operational Snapshot:\n${JSON.stringify(storeSummary || {}, null, 2)}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              healthScore: {
                type: Type.INTEGER,
                description: 'Overall financial & operational health score from 0 to 100.'
              },
              executiveSummary: {
                type: Type.STRING,
                description: '2-3 sentence executive diagnosis of store performance.'
              },
              taxAdvisory: {
                type: Type.STRING,
                description: 'Specific tax & Patente & CNSS optimization guidance.'
              },
              growthForecast: {
                type: Type.STRING,
                description: 'Short 30-day revenue and net profit growth forecast.'
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    category: {
                      type: Type.STRING,
                      description: 'One of: margin, tax, waste, growth, cashflow'
                    },
                    impact: {
                      type: Type.STRING,
                      description: 'One of: high, medium'
                    },
                    driver: {
                      type: Type.STRING,
                      description: 'The specific metric or root cause driving this insight.'
                    },
                    action: {
                      type: Type.STRING,
                      description: 'Exact concrete step for the store owner to take.'
                    },
                    estimatedMonthlyImpact: {
                      type: Type.STRING,
                      description: 'Estimated financial impact in store currency.'
                    }
                  }
                }
              }
            }
          }
        }
      });

      const rawText = (response.text || '{}').trim();
      const parsed = JSON.parse(rawText);
      return res.json({ analysis: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate AI financial analysis';
      console.error('Gemini analyze error:', error);
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server.',
        code: 'MISSING_API_KEY'
      });
    }

    try {
      const { question, history = [], storeSummary, language = 'ar', mode = 'advisor' } = req.body as {
        question: string;
        history?: { role: 'user' | 'assistant'; text: string }[];
        storeSummary?: Record<string, unknown>;
        language?: 'ar' | 'fr' | 'en';
        mode?: 'advisor' | 'tutor' | 'investigator';
      };

      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const langLabel =
        language === 'ar' ? 'Arabic (Moroccan retail & Darija-friendly clear business Arabic)' : language === 'fr' ? 'French' : 'English';

      const transcript = history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Store Owner' : 'Advisor'}: ${m.text}`)
        .join('\n');

      const modeRole =
        mode === 'tutor'
          ? `You are a patient, practical Financial & Moroccan Tax Coach inside Kadi POS. Teach the store owner step by step using simple formulas and their REAL store numbers (gross profit vs net pocket profit, break-even daily sales, Moroccan CPU tax = turnover * profession coeff * tax rate, CNSS AMO & Retirement, annual Patente, Trade Zakat Nisab 85g gold, and credit cashflow). Always give a clear worked numerical example using the provided store data.`
          : mode === 'investigator'
          ? `You are a Confidential Internal Forensic Auditor ("المحقق السري") inside Kadi POS. Analyze the provided store numbers and audit anomaly flags (shift cash discrepancies, heavy discounts, refunds, below-cost pricing, inventory waste/shrinkage, over-limit customer credit, and overdue taxes). Pinpoint hidden money leaks, rank risks by severity, and give discreet, concrete preventive controls for the store owner.`
          : `You are an expert financial, tax (CPU, Patente, CNSS, Zakat), and retail growth advisor integrated inside Kadi POS. Help the owner finalize ("تشطيب") financial decisions, polish summaries/reports, optimize profit margins, and reduce waste.`;

      const prompt = `Live Store Data Context:\n${JSON.stringify(storeSummary || {}, null, 2)}\n\n${
        transcript ? `Recent Conversation:\n${transcript}\n\n` : ''
      }Store Owner Request: ${question}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: `${modeRole} Always respond in ${langLabel}. Ground every answer in the provided live store numbers, avoid generic fluff, and present crisp structured bullet points.`
        }
      });

      return res.json({ reply: (response.text || '').trim() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate AI reply';
      console.error('Gemini chat error:', error);
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/voice-command', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server.',
        code: 'MISSING_API_KEY'
      });
    }

    try {
      const { transcript, audioBase64, audioMimeType, existingProducts = [], existingCustomers = [] } = req.body as {
        transcript?: string;
        audioBase64?: string;
        audioMimeType?: string;
        existingProducts?: string[];
        existingCustomers?: string[];
      };

      if (!transcript?.trim() && !audioBase64) {
        return res.status(400).json({ error: 'Transcript or audio is required' });
      }

      const systemInstruction = `You are a Moroccan Darija & Arabic Voice POS Parser for Kadi POS.
Convert spoken Moroccan Darija commands (from text OR audio) into strict structured JSON.
CRITICAL CURRENCY RULE:
- Moroccan Riyal (ريال): 1 Dirham = 20 Riyal, so 100 Riyal = 5 Dirham (divide Riyal amount by 20 to get amountDirham).
- Example: "100 ريال" -> originalAmount: 100, originalCurrency: "riyal", amountDirham: 5.
- Example: "1000 ريال" -> originalAmount: 1000, originalCurrency: "riyal", amountDirham: 50.
- Example: "25 درهم" -> originalAmount: 25, originalCurrency: "dirham", amountDirham: 25.

SUPPORTED INTENTS:
1) "record_sale": e.g. "محمد خدا التيد ب 100 ريال" or "فاطمة خدات 2 كيلو سكر ب 20 درهم" -> extract customerName, productName, quantity (default 1), amountDirham, originalAmount, originalCurrency, paymentMethod ("cash" if explicitly paid/cash/خلص/نقداً, else "credit").
2) "record_payment": e.g. "محمد خلص 200 ريال" -> customerName + amountDirham.
3) "set_cost_price": e.g. "التيد شريتو ب 60 ريال" or "السكر ثمن الشراء 8 درهم" -> productName + amountDirham (purchase cost).
4) "capture_photo": e.g. "زيد تصويرة ل التيد" or "صور السكر" -> productName.
5) "invoice_daily": e.g. "عطيني فاكتورة اليوم".
6) "invoice_monthly": e.g. "عطيني فاكتورة الشهر".
7) "invoice_customer": e.g. "عطيني فاكتورة محمد" -> customerName.
8) "unknown": if unclear.

Match existing product/customer names when close:
Known products: ${existingProducts.slice(0, 60).join(', ')}
Known customers: ${existingCustomers.slice(0, 60).join(', ')}
If audio is provided, transcribe what was said into "transcript" in Arabic/Darija script.`;

      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
      if (audioBase64 && audioMimeType) {
        parts.push({
          inlineData: {
            data: audioBase64,
            mimeType: audioMimeType
          }
        });
      }
      if (transcript?.trim()) {
        parts.push({ text: `Spoken command transcript: ${transcript.trim()}` });
      } else {
        parts.push({ text: 'Transcribe and parse the Moroccan Darija voice command from the audio.' });
      }

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: parts,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: {
                type: Type.STRING,
                description:
                  'One of: record_sale, record_payment, set_cost_price, capture_photo, invoice_daily, invoice_monthly, invoice_customer, unknown'
              },
              transcript: { type: Type.STRING },
              customerName: { type: Type.STRING },
              productName: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              amountDirham: { type: Type.NUMBER },
              originalAmount: { type: Type.NUMBER },
              originalCurrency: { type: Type.STRING, description: 'riyal or dirham' },
              paymentMethod: { type: Type.STRING, description: 'credit or cash' },
              explanation: { type: Type.STRING, description: 'Short Arabic summary of understood action' }
            }
          }
        }
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      return res.json({ command: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse voice command';
      console.error('Gemini voice command error:', error);
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {}
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kadi POS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';
const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

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

function safeParseGeminiJson<T>(rawText: string, fallback: T): T {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (
      firstBracket !== -1 &&
      lastBracket > firstBracket &&
      (firstBrace === -1 || firstBracket < firstBrace)
    ) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as T;
      } catch {
        // fall through to object extraction
      }
    }

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

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
      const parsed = safeParseGeminiJson<Record<string, unknown>>(rawText, {});
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

      const systemInstruction = `You are a Moroccan Darija, Arabic, and French Voice POS Parser for Kadi POS.
Convert spoken Moroccan Darija commands (from text OR audio) into strict structured JSON with ZERO unnecessary rejections.
UNRESTRICTED RECORDING RULES:
- Accept ANY spoken customer name and ANY spoken product/item name (Moroccan Darija, Standard Arabic, Amazigh, French, English, brand names, weights, decimals like 0.5 or 1.5).
- NEVER reject an entry just because a price was omitted ("محمد خدا التيد" -> intent "record_sale", amountDirham: 0, let POS use catalog price).
- If the merchant speaks a free-form reminder, memo, name, or note that is not a structured transaction ("خصنا السكر غدا", "حسن بنعلي"), use intent "record_note" with "transcript" and "explanation" — NEVER return "unknown" unless the audio/text is completely empty!
- Support recording MULTIPLE products in one sentence via the "items" array.

CRITICAL CURRENCY RULE:
- Moroccan Riyal (ريال): 1 Dirham = 20 Riyal, so 100 Riyal = 5 Dirham (divide Riyal amount by 20 to get amountDirham).
- Example: "100 ريال" -> originalAmount: 100, originalCurrency: "riyal", amountDirham: 5.
- Example: "25 درهم" -> originalAmount: 25, originalCurrency: "dirham", amountDirham: 25.

SUPPORTED INTENTS:
1) "record_sale": Any purchase/credit/sale ("محمد خدا التيد ب 100 ريال", "فاطمة خدات 2 كيلو سكر ب 20 درهم والحليب ب 5 درهم", "محمد خدا التيد", "حليب 5 درهم").
2) "record_payment": e.g. "محمد خلص 200 ريال" -> customerName + amountDirham.
3) "set_cost_price": e.g. "التيد شريتو ب 60 ريال" -> productName + amountDirham.
4) "add_product": e.g. "زيد سلعة عصير ب 10 درهم" -> productName + optional amountDirham.
5) "add_customer": e.g. "زيد زبون رشيد بنعلي" -> customerName.
6) "record_note": Any free-form spoken memo, reminder, name, or unstructured voice entry.
7) "capture_photo": e.g. "زيد تصويرة ل التيد" -> productName.
8) "invoice_daily": e.g. "عطيني فاكتورة اليوم".
9) "invoice_monthly": e.g. "عطيني فاكتورة الشهر".
10) "invoice_customer": e.g. "عطيني فاكتورة محمد" -> customerName.
11) "ask_ai": Any question or request for advice/analysis/answer from the AI ("شحال ربحت اليوم؟", "شنو خاصني نشري؟", "واش عندي شي مشكل فالمخزون؟", "عطيني نصيحة", "كيفاش نحسب الضريبة؟"). Put the cleaned question in "transcript".

Known products (hint only, new goods allowed): ${existingProducts.slice(0, 500).join(', ')}
Known customers (hint only, new names allowed): ${existingCustomers.slice(0, 500).join(', ')}
If audio is provided, transcribe what was said verbatim into "transcript" in Arabic/Darija script.`;

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
        parts.push({ text: 'Transcribe and parse the Moroccan Darija voice recording without restrictions.' });
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
                  'One of: record_sale, record_payment, set_cost_price, add_product, add_customer, record_note, capture_photo, invoice_daily, invoice_monthly, invoice_customer, ask_ai, unknown'
              },
              transcript: { type: Type.STRING },
              customerName: { type: Type.STRING },
              productName: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              amountDirham: { type: Type.NUMBER },
              originalAmount: { type: Type.NUMBER },
              originalCurrency: { type: Type.STRING, description: 'riyal or dirham' },
              paymentMethod: { type: Type.STRING, description: 'credit or cash' },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productName: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    amountDirham: { type: Type.NUMBER },
                    originalAmount: { type: Type.NUMBER },
                    originalCurrency: { type: Type.STRING }
                  }
                }
              },
              explanation: { type: Type.STRING, description: 'Short Arabic summary of understood action or note' }
            }
          }
        }
      });

      const parsed = safeParseGeminiJson<Record<string, unknown>>(response.text || '{}', {
        intent: 'unknown'
      });
      return res.json({ command: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse voice command';
      console.error('Gemini voice command error:', error);
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/tts', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server.',
        code: 'MISSING_API_KEY'
      });
    }

    try {
      const { text, voiceName = 'Kore' } = req.body as {
        text?: string;
        voiceName?: string;
      };

      const cleaned = (text || '')
        .replace(/[`*_#>-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1400);

      if (!cleaned) {
        return res.status(400).json({ error: 'Text is required for TTS' });
      }

      const response = await ai.models.generateContent({
        model: GEMINI_TTS_MODEL,
        contents: cleaned,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const audioBase64 = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/wav';

      if (!audioBase64) {
        return res.status(500).json({ error: 'No audio returned from Gemini TTS' });
      }

      return res.json({ audioBase64, mimeType });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to synthesize AI speech';
      console.error('Gemini TTS error:', error);
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/transcribe', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server.',
        code: 'MISSING_API_KEY'
      });
    }

    try {
      const { audioBase64, audioMimeType = 'audio/webm', language = 'ar' } = req.body as {
        audioBase64?: string;
        audioMimeType?: string;
        language?: 'ar' | 'fr' | 'en';
      };

      if (!audioBase64) {
        return res.status(400).json({ error: 'audioBase64 is required' });
      }

      const promptText =
        language === 'ar'
          ? 'فرّغ هذا التسجيل الصوتي نصياً بدقة بالدارجة المغربية أو العربية الفصحى كما نطق به المتحدث دون إضافة تعليقات.'
          : language === 'fr'
          ? 'Transcris fidèlement cet audio en texte sans commentaire.'
          : 'Transcribe this audio accurately into text without extra commentary.';

      const response = await ai.models.generateContent({
        model: GEMINI_TRANSCRIBE_MODEL,
        contents: [
          {
            inlineData: {
              mimeType: audioMimeType,
              data: audioBase64
            }
          },
          { text: promptText }
        ]
      });

      return res.json({ transcript: (response.text || '').trim() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to transcribe audio';
      console.error('Gemini transcribe error:', error);
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/scan-purchase-invoice', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'خدمة الذكاء الاصطناعي غير مفعلة على السيرفر حالياً.',
        code: 'MISSING_API_KEY'
      });
    }

    try {
      const {
        imageBase64,
        mimeType = 'image/jpeg',
        returnRawArray = false
      } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        returnRawArray?: boolean;
      };

      if (!imageBase64) {
        return res.status(400).json({ error: 'imageBase64 is required' });
      }

      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

      const visionItemsInstruction = `You are a world-class multimodal document Vision AI specialized in reading ANY Moroccan invoice, wholesale receipt, thermal supermarket ticket, delivery slip (BL), or handwritten hanout carnet/bon.
Understand the FULL image visually just like Meta AI:
1. AUTO-CORRECT SCENE & GEOMETRY:
   - The paper may be tilted, rotated sideways/upside-down, crumpled, wrinkled, creased, poorly lit, or photographed on a patterned Moroccan carpet (زربية), wooden table, tiled floor, or counter.
   - Ignore the carpet/background completely, mentally straighten and un-wrinkle the invoice, and read the whole page with full visual layout comprehension — NOT naive flat-line OCR.
2. SUPPORT ANY MOROCCAN INVOICE FORMAT:
   - Atacadao, Marjane, Carrefour, Bim, Metro, Supeco, Asswak Assalam, wholesale A4/A5 invoices, thermal POS receipts, and handwritten paper slips in French, Arabic, or Darija.
   - Thermal receipts (e.g. Atacadao/Marjane) often wrap product descriptions across two lines or place "2 x 14,50  29,00" beneath the item name, or have SKU/EAN barcodes on the left — NEVER mistake barcodes, line numbers, TVA %, or dates for quantity or price.
   - Understand column alignments even when skewed/wrinkled: DESIGNATION/ARTICLE -> "nom", QTE/COLIS -> "quantite", PU/P.U./PRIX -> "prix", MONTANT/PT/TOTAL -> "total".
   - Convert European commas ("14,50" -> 14.5).
3. MATH & RECONCILIATION PER ITEM:
   - If "quantite" is missing or unclear on a single line item, use 1.
   - If "prix" (unit price) is missing but "total" and "quantite" are visible, compute prix = total / quantite.
   - If "total" is missing but "quantite" and "prix" are visible, compute total = quantite * prix.
   - Skip footer/summary/payment rows (TOTAL, TOTAL TTC, TOTAL HT, TVA, SOUS-TOTAL, NET A PAYER, ESPECE, RENDU, TIMBRE, ICE, IF, RC).
4. OUTPUT FORMAT (STRICT):
   - Return ONLY a JSON array of objects matching exactly: [{"nom": "...", "quantite": 0, "prix": 0, "total": 0}]`;

      const callVisionItems = () =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64
                }
              },
              {
                text: 'Read the full invoice image visually (auto-correct any tilt, wrinkles, rotation, or carpet background). Extract every product with nom, quantite, prix (unit price), and total (line total). Return only JSON: [{"nom": "...", "quantite": 0, "prix": 0, "total": 0}].'
              }
            ]
          },
          config: {
            systemInstruction: visionItemsInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nom: {
                    type: Type.STRING,
                    description: 'Clean product name as written on the invoice'
                  },
                  quantite: {
                    type: Type.NUMBER,
                    description: 'Purchased quantity (> 0)'
                  },
                  prix: {
                    type: Type.NUMBER,
                    description: 'Unit price in MAD'
                  },
                  total: {
                    type: Type.NUMBER,
                    description: 'Total line price in MAD'
                  }
                },
                required: ['nom', 'quantite', 'prix', 'total']
              }
            }
          }
        });

      const callInvoiceMeta = () =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64
                }
              },
              {
                text: 'Extract only header/footer metadata from this Moroccan invoice (even if tilted or on a carpet): supplierName, supplierIce (15 digits if present), supplierPhone, invoiceNumber, invoiceDate (YYYY-MM-DD), hasOfficialMarkers, isHandwritten, totalAmount.'
              }
            ]
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                supplierName: { type: Type.STRING },
                supplierIce: { type: Type.STRING },
                supplierPhone: { type: Type.STRING },
                invoiceNumber: { type: Type.STRING },
                invoiceDate: { type: Type.STRING },
                hasOfficialMarkers: { type: Type.BOOLEAN },
                isHandwritten: { type: Type.BOOLEAN },
                totalAmount: { type: Type.NUMBER }
              }
            }
          }
        });

      const runVisionWithRetry = async () => {
        try {
          return await callVisionItems();
        } catch (firstErr) {
          console.warn('Retrying Gemini Vision invoice scan after transient error:', firstErr);
          await new Promise((r) => setTimeout(r, 450));
          return await callVisionItems();
        }
      };

      const [itemsResult, metaResult] = await Promise.allSettled([
        runVisionWithRetry(),
        callInvoiceMeta()
      ]);

      if (itemsResult.status === 'rejected') {
        throw itemsResult.reason;
      }

      type RawVisionItem = {
        nom?: unknown;
        quantite?: unknown;
        prix?: unknown;
        total?: unknown;
      };

      const rawItems = safeParseGeminiJson<RawVisionItem[]>(itemsResult.value.text || '[]', []);
      const normalizedItems = (Array.isArray(rawItems) ? rawItems : [])
        .map((it) => {
          const nom = String(it?.nom ?? '').trim();
          const rawQty = Number(it?.quantite);
          const quantite = Number.isFinite(rawQty) && rawQty > 0 ? Number(rawQty.toFixed(3)) : 1;
          let prix = Number(it?.prix);
          let total = Number(it?.total);
          prix = Number.isFinite(prix) && prix >= 0 ? prix : 0;
          total = Number.isFinite(total) && total >= 0 ? total : 0;

          if (prix === 0 && total > 0 && quantite > 0) {
            prix = Number((total / quantite).toFixed(2));
          } else if (total === 0 && prix > 0) {
            total = Number((quantite * prix).toFixed(2));
          } else {
            prix = Number(prix.toFixed(2));
            total = Number(total.toFixed(2));
          }

          return { nom, quantite, prix, total };
        })
        .filter((it) => it.nom.length > 0);

      if (returnRawArray || req.query.raw === '1') {
        return res.json(normalizedItems);
      }

      const metaFallback = {
        supplierName: '',
        supplierIce: '',
        supplierPhone: '',
        invoiceNumber: '',
        invoiceDate: '',
        hasOfficialMarkers: false,
        isHandwritten: false,
        totalAmount: 0
      };
      const meta =
        metaResult.status === 'fulfilled'
          ? safeParseGeminiJson<typeof metaFallback>(metaResult.value.text || '{}', metaFallback)
          : metaFallback;

      const itemsSum = Number(
        normalizedItems.reduce((sum, it) => sum + (it.total || it.quantite * it.prix), 0).toFixed(2)
      );

      return res.json({
        items: normalizedItems,
        invoice: {
          supplierName: String(meta.supplierName || '').trim(),
          supplierIce: String(meta.supplierIce || '').replace(/\s+/g, '').trim(),
          supplierPhone: String(meta.supplierPhone || '').trim(),
          invoiceNumber: String(meta.invoiceNumber || '').trim(),
          invoiceDate: String(meta.invoiceDate || '').trim(),
          hasOfficialMarkers: Boolean(meta.hasOfficialMarkers),
          isHandwritten: Boolean(meta.isHandwritten),
          totalAmount: Number(meta.totalAmount) > 0 ? Number(meta.totalAmount) : itemsSum,
          items: normalizedItems
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to analyze purchase invoice image';
      console.error('Gemini scan purchase invoice error:', error);
      return res.status(500).json({ error: message });
    }
  });

  app.use('/api', (_req, res) => {
    return res.status(404).json({ error: 'API route not found' });
  });

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.path.startsWith('/api')) {
        const message = err instanceof Error ? err.message : 'Invalid API request';
        return res.status(400).json({ error: message });
      }
      return next(err);
    }
  );

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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  MANUAL_REMISE_TYPES,
  RemiseBoxData,
  RemiseHistoryEntry,
  RemiseWallet,
  createEmptyWallet,
  getWalletAvailableBalance,
  getWalletStarCount,
  loadRemiseBoxData,
  roundMoney,
  saveRemiseBoxData
} from '../../utils/remiseVault';
import {
  isRemiseBlacklistedName,
  runRemiseInvoiceOcr
} from '../../utils/offlineInvoiceOcr';
import { playSound } from '../../utils/audio';
import {
  Coins,
  FilePlus2,
  HandCoins,
  TrendingUp,
  Wallet,
  Star,
  History,
  CheckCircle2,
  AlertTriangle,
  Search,
  Trash2,
  Target,
  Plus,
  Minus,
  Building2,
  Camera,
  Eye,
  EyeOff,
  Loader2,
  X
} from 'lucide-react';

type ActionMode = 'invoice' | 'manual' | 'invest';
type InvestChoice = 'offer' | 'buy' | 'save';

const OTHER_COMPANY_VALUE = 'شركة أخرى';
const OTHER_PRODUCT_VALUE = 'سلعة أخرى - كتبها هنا';

const FIXED_VENDORS_MAP: Record<string, { name: string; code: string }> = {
  IDEAL: { name: 'OUALI ALAMI AHMED', code: 'E16' },
  'LES DOMAINES': { name: 'فندور LES DOMAINES', code: '-' },
  OMAR: { name: 'فندور OMAR', code: '-' }
};

const CORE_REMISE_PRODUCTS = [
  'LEVURE IDEAL 100 SAC',
  'LEVURE IDEAL 50 SAC',
  'CACAO SPECIAL',
  'SUCRE VANILLINE',
  'ETUI SUCRE',
  'SUCRE MORCEAUX',
  'FARINE',
  'HUILE'
] as const;

interface InvoiceLineDraft {
  id: string;
  selectedOption: string;
  customName: string;
  qty: string;
  brut: string;
  net: string;
}

const createLineFromPreset = (
  selectedOption: string = CORE_REMISE_PRODUCTS[0],
  qty = '1',
  brut = '',
  net = '',
  customName = ''
): InvoiceLineDraft => ({
  id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  selectedOption,
  customName,
  qty,
  brut,
  net
});

const createInitialExampleLines = (): InvoiceLineDraft[] => [
  createLineFromPreset('LEVURE IDEAL 100 SAC', '7', '273', '252.01'),
  createLineFromPreset('CACAO SPECIAL', '15', '118.5', '118.5'),
  createLineFromPreset('SUCRE VANILLINE', '1', '39', '36'),
  createLineFromPreset('ETUI SUCRE', '15', '105', '105')
];

const getLineProductName = (line: InvoiceLineDraft): string =>
  line.selectedOption === OTHER_PRODUCT_VALUE
    ? line.customName.trim()
    : line.selectedOption.trim();

const containsVendorOrTotalLeak = (productName: string, currentVendor: string): boolean => {
  const upper = productName.toUpperCase().trim();
  if (!upper) return false;
  if (isRemiseBlacklistedName(upper)) return true;
  if (upper.includes('OUALI') || upper.includes('ALAMI')) return true;
  const vendorTokens = currentVendor
    .toUpperCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && t !== 'فندور');
  return vendorTokens.some((tok) => upper.includes(tok));
};

const fmtMoney = (n: number): string =>
  Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const fmtDateMA = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  try {
    return d.toLocaleDateString('ar-MA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return iso.slice(0, 10);
  }
};

export const RemiseBoxView: React.FC = () => {
  const {
    customers,
    addCustomer,
    updateCustomer,
    suppliers,
    supplierInvoices,
    products,
    categories,
    adjustStock,
    addProduct,
    currencySymbol,
    settings,
    language
  } = usePos();

  const isAr = language === 'ar';
  const pointValue = Math.max(0, Number(settings.loyaltyPointValue ?? 1));

  const [data, setData] = useState<RemiseBoxData>(() => loadRemiseBoxData());
  const [actionMode, setActionMode] = useState<ActionMode>('invoice');

  // 1. OCR Photo Scanner + Multi-line Invoice Form
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string>('');
  const [ocrRawText, setOcrRawText] = useState<string>('');
  const [showOcrText, setShowOcrText] = useState(false);
  const [autoCountNote, setAutoCountNote] = useState<string>('');

  const [companyChoice, setCompanyChoice] = useState<string>('IDEAL');
  const [companyOtherInput, setCompanyOtherInput] = useState<string>('');
  const [vendorInput, setVendorInput] = useState<string>(FIXED_VENDORS_MAP.IDEAL.name);
  const [vendorCodeInput, setVendorCodeInput] = useState<string>(FIXED_VENDORS_MAP.IDEAL.code);
  const [invNumInput, setInvNumInput] = useState('');
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineDraft[]>(() =>
    createInitialExampleLines()
  );
  const [paidOverrideInput, setPaidOverrideInput] = useState('');
  const [invoiceFeedback, setInvoiceFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  // 2. Manual Remise Form
  const [manualCompany, setManualCompany] = useState('');
  const [manualNewCompany, setManualNewCompany] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualType, setManualType] = useState<string>(MANUAL_REMISE_TYPES[0]);
  const [manualNote, setManualNote] = useState('');
  const [manualFeedback, setManualFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  // 3. Invest Remise Form
  const [investCompany, setInvestCompany] = useState('');
  const [investAmount, setInvestAmount] = useState('');
  const [investChoice, setInvestChoice] = useState<InvestChoice>('offer');
  const [soldQtyInput, setSoldQtyInput] = useState('');
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [buyProductNote, setBuyProductNote] = useState('');
  const [buyQtyInput, setBuyQtyInput] = useState('1');
  const [buySellPriceInput, setBuySellPriceInput] = useState('');
  const [linkBuyToInventory, setLinkBuyToInventory] = useState(true);
  const [saveGoalInput, setSaveGoalInput] = useState('');
  const [investFeedback, setInvestFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  // Inline wallet goal editing (replaces window.prompt)
  const [editingGoalCompany, setEditingGoalCompany] = useState<string | null>(null);
  const [editingGoalValue, setEditingGoalValue] = useState('');

  // History filters & safe delete/reset states (no window.confirm)
  const [historySearch, setHistorySearch] = useState('');
  const [historyCompanyFilter, setHistoryCompanyFilter] = useState<string>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'invoice' | 'manual' | 'invest'>('all');
  const [confirmDeleteHistoryId, setConfirmDeleteHistoryId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Customer Points form (integrated with KADI POS customers)
  const [custNameInput, setCustNameInput] = useState('');
  const [custPhoneInput, setCustPhoneInput] = useState('');
  const [custPointsInput, setCustPointsInput] = useState('1');
  const [custSearch, setCustSearch] = useState('');
  const [pointsFeedback, setPointsFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  const skipLocalSyncDispatchRef = useRef(false);

  useEffect(() => {
    saveRemiseBoxData(data);
    if (skipLocalSyncDispatchRef.current) {
      skipLocalSyncDispatchRef.current = false;
      return;
    }
    window.dispatchEvent(new CustomEvent('kadi:remise-box-local-change'));
  }, [data]);

  useEffect(() => {
    const handleReloadFromBackup = () => {
      skipLocalSyncDispatchRef.current = true;
      setData(loadRemiseBoxData());
    };
    window.addEventListener('kadi:remise-box-updated', handleReloadFromBackup);
    return () => {
      window.removeEventListener('kadi:remise-box-updated', handleReloadFromBackup);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const walletList = useMemo(
    () =>
      Object.values(data.wallets).sort(
        (a, b) => getWalletAvailableBalance(b) - getWalletAvailableBalance(a)
      ),
    [data.wallets]
  );

  // Keep company dropdowns defaulted cleanly when wallets exist
  useEffect(() => {
    if (walletList.length === 0) return;
    if (!manualCompany || !data.wallets[manualCompany]) {
      setManualCompany(walletList[0].company);
    }
    if (!investCompany || !data.wallets[investCompany]) {
      setInvestCompany(walletList[0].company);
    }
  }, [walletList, manualCompany, investCompany, data.wallets]);

  // Known fixed companies + previously added wallets/suppliers
  const companyDropdownOptions = useMemo(() => {
    const base = ['IDEAL', 'LES DOMAINES', 'OMAR'];
    const extra = new Set<string>();
    walletList.forEach((w) => {
      if (!base.includes(w.company)) extra.add(w.company);
    });
    suppliers.forEach((s) => {
      const n = s.name?.trim();
      if (n && !base.includes(n)) extra.add(n);
    });
    supplierInvoices.forEach((inv) => {
      const n = inv.supplierName?.trim();
      if (n && !base.includes(n)) extra.add(n);
    });
    return [...base, ...Array.from(extra).sort((a, b) => a.localeCompare(b)), OTHER_COMPANY_VALUE];
  }, [walletList, suppliers, supplierInvoices]);

  // Product dropdown list: Core Remise products + POS catalog products + "Other"
  const productDropdownOptions = useMemo(() => {
    const set = new Set<string>(CORE_REMISE_PRODUCTS);
    products.slice(0, 80).forEach((p) => {
      const n = p.name?.trim();
      if (n && !containsVendorOrTotalLeak(n, vendorInput)) {
        set.add(n);
      }
    });
    return [...Array.from(set), OTHER_PRODUCT_VALUE];
  }, [products, vendorInput]);

  const handleSelectCompany = (nextChoice: string) => {
    setCompanyChoice(nextChoice);
    if (FIXED_VENDORS_MAP[nextChoice]) {
      setVendorInput(FIXED_VENDORS_MAP[nextChoice].name);
      setVendorCodeInput(FIXED_VENDORS_MAP[nextChoice].code);
    } else if (nextChoice !== OTHER_COMPANY_VALUE && data.wallets[nextChoice]) {
      const existingVendors = Object.keys(data.wallets[nextChoice].vendors || {});
      if (existingVendors.length > 0) {
        const firstVendor = existingVendors[0];
        setVendorInput(firstVendor);
        setVendorCodeInput(data.wallets[nextChoice].vendorCodes?.[firstVendor] || '-');
      } else {
        setVendorInput(`فندور ${nextChoice}`);
        setVendorCodeInput('-');
      }
    } else if (nextChoice === OTHER_COMPANY_VALUE) {
      setVendorInput('');
      setVendorCodeInput('');
    } else {
      setVendorInput(`فندور ${nextChoice}`);
      setVendorCodeInput('-');
    }
  };

  const isFixedCompanyVendor = !!FIXED_VENDORS_MAP[companyChoice];

  const totals = useMemo(() => {
    return walletList.reduce(
      (acc, w) => {
        const bal = getWalletAvailableBalance(w);
        acc.collected = roundMoney(acc.collected + w.collected);
        acc.used = roundMoney(acc.used + w.used);
        acc.available = roundMoney(acc.available + bal);
        acc.offersProfit = roundMoney(acc.offersProfit + w.offersProfit);
        return acc;
      },
      { collected: 0, used: 0, available: 0, offersProfit: 0 }
    );
  }, [walletList]);

  // Live totals across all invoice lines
  const invoiceLineSummary = useMemo(() => {
    let totalBrut = 0;
    let totalNet = 0;
    for (const line of invoiceLines) {
      const b = parseFloat(line.brut || '0');
      const n = parseFloat(line.net || '0');
      if (Number.isFinite(b) && b > 0) totalBrut += b;
      if (Number.isFinite(n) && n > 0) totalNet += n;
    }
    totalBrut = roundMoney(totalBrut);
    totalNet = roundMoney(totalNet);
    let totalRemise = roundMoney(Math.max(0, totalBrut - totalNet));
    const paidOverride = parseFloat(paidOverrideInput || '0');
    if (Number.isFinite(paidOverride) && paidOverride > 0 && totalBrut > paidOverride) {
      totalRemise = roundMoney(Math.max(totalRemise, totalBrut - paidOverride));
    }
    return { totalBrut, totalNet, totalRemise };
  }, [invoiceLines, paidOverrideInput]);

  const previewOfferProfit = useMemo(() => {
    const amt = parseFloat(investAmount || '0');
    const q = parseFloat(soldQtyInput || '0');
    const sp = parseFloat(sellPriceInput || '0');
    if (!Number.isFinite(amt) || amt <= 0) return null;
    if (!Number.isFinite(q) || !Number.isFinite(sp) || (q === 0 && sp === 0)) return null;
    return roundMoney(q * sp - amt);
  }, [investAmount, soldQtyInput, sellPriceInput]);

  const selectedInvestWallet: RemiseWallet | undefined = investCompany
    ? data.wallets[investCompany]
    : undefined;
  const selectedInvestBalance = selectedInvestWallet
    ? getWalletAvailableBalance(selectedInvestWallet)
    : 0;

  // OCR Image Upload & Auto-Line Generation
  const handleInvoicePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    setIsScanningOcr(true);
    setOcrProgress(10);
    setOcrStatusMsg('⏳ كنقرا الفاتورة... تسنى شوية...');
    setInvoiceFeedback(null);

    try {
      const res = await runRemiseInvoiceOcr(file, (pct) => setOcrProgress(pct));
      setOcrRawText(res.rawText);

      if (res.companyHint) {
        handleSelectCompany(res.companyHint);
      }
      if (res.vendor && !isFixedCompanyVendor) setVendorInput(res.vendor);
      if (res.vendorCode && !isFixedCompanyVendor) setVendorCodeInput(res.vendorCode);
      if (res.invoiceNumber) setInvNumInput(res.invoiceNumber);

      const safeItems = res.items.filter(
        (item) => !containsVendorOrTotalLeak(item.name, res.vendor || vendorInput)
      );

      if (safeItems.length === 0) {
        setInvoiceLines([createLineFromPreset()]);
        setAutoCountNote('0 — ما لقيتش السطور تلقائياً، اختار من الليستة لتحت');
        setOcrStatusMsg('✅ ساليت القراءة، ولكن ما بانوش سطور واضحين. اختار السلعة من الليستة.');
      } else {
        setInvoiceLines(
          safeItems.map((item, idx) => {
            const matchedOption = productDropdownOptions.find(
              (opt) => opt !== OTHER_PRODUCT_VALUE && opt.toUpperCase() === item.name.toUpperCase()
            );
            return {
              id: `ocr-${Date.now()}-${idx}`,
              selectedOption: matchedOption || OTHER_PRODUCT_VALUE,
              customName: matchedOption ? '' : item.name,
              qty: String(item.qty || 1),
              brut: item.brut > 0 ? String(item.brut) : '',
              net: item.net > 0 ? String(item.net) : ''
            };
          })
        );
        setAutoCountNote(`${safeItems.length} سلعة — وجدت ${safeItems.length} سطر بوحدي`);
        setOcrStatusMsg('✅ ساليت القراءة! لقيت السلع وعمرتهم ليك لتحت. راجعهم وعاد حفظ.');
      }
      playSound('success');
    } catch {
      playSound('error');
      setOcrStatusMsg('❌ ما قدرتش نقرا التصويرة، صورها في الضو مزيان وعاود.');
    } finally {
      setIsScanningOcr(false);
    }
  };

  const handleUpdateLine = (id: string, patch: Partial<InvoiceLineDraft>) => {
    setInvoiceLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const handleAddBlankLine = () => {
    setInvoiceLines((prev) => [...prev, createLineFromPreset()]);
    setAutoCountNote('');
    playSound('click');
  };

  const handleResetInvoiceLines = () => {
    setInvoiceLines([createLineFromPreset()]);
    setAutoCountNote('');
    setInvoiceFeedback(null);
    playSound('click');
  };

  const handleRemoveLine = (id: string) => {
    setInvoiceLines((prev) => {
      const next = prev.filter((line) => line.id !== id);
      return next.length > 0 ? next : [createLineFromPreset()];
    });
    setAutoCountNote('');
    playSound('click');
  };

  // 1. Save Multi-Line Invoice + Collect Remise (with Vendor/Total anti-mix protection)
  const handleAddInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const company =
      companyChoice === OTHER_COMPANY_VALUE ? companyOtherInput.trim() : companyChoice.trim();
    const vendor = vendorInput.trim();
    const vendorCode = vendorCodeInput.trim();
    const invNum = invNumInput.trim();

    if (!company) {
      playSound('error');
      setInvoiceFeedback({ text: 'ختار أو كتب سميت الشركة أولاً (مثال: IDEAL)', isError: true });
      return;
    }

    const validProds: Array<{ name: string; qty: number; brut: number; net: number; remise: number }> = [];

    for (const line of invoiceLines) {
      const cleanName = getLineProductName(line);
      if (!cleanName) continue;

      if (containsVendorOrTotalLeak(cleanName, vendor)) {
        playSound('error');
        setInvoiceFeedback({
          text: `⛔ "${cleanName}" ماشي سلعة! هادي سميت فندور ولا TOTAL. حيدها أو اختار سلعة من الليستة.`,
          isError: true
        });
        return;
      }

      const q = Math.max(0, Number(line.qty || '0'));
      const b = roundMoney(parseFloat(line.brut || '0'));
      const n = roundMoney(parseFloat(line.net || '0'));

      if (n > b) {
        playSound('error');
        setInvoiceFeedback({
          text: `⛔ ${cleanName}: NET (${fmtMoney(n)}) أكبر من BRUT (${fmtMoney(b)}). راجع الأرقام.`,
          isError: true
        });
        return;
      }

      const lineRemise = roundMoney(Math.max(0, b - n));
      validProds.push({ name: cleanName, qty: q || 1, brut: b, net: n, remise: lineRemise });
    }

    if (validProds.length === 0) {
      playSound('error');
      setInvoiceFeedback({
        text: 'زيد سلعة وحدة على الأقل من الليستة.',
        isError: true
      });
      return;
    }

    const totalRemise = invoiceLineSummary.totalRemise;
    if (totalRemise <= 0) {
      playSound('error');
      setInvoiceFeedback({
        text: 'الريميز المحسوب هو 0 درهم — تأكد أن BRUT أكبر من NET فشي سطر على الأقل.',
        isError: true
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const vendorKey = vendor ? (vendorCode && vendorCode !== '-' ? `${vendor} (${vendorCode})` : vendor) : '';

    setData((prev) => {
      const existing = prev.wallets[company] || createEmptyWallet(company);
      const nextVendors = { ...existing.vendors };
      const nextCodes = { ...existing.vendorCodes };
      if (vendor) {
        nextVendors[vendor] = (nextVendors[vendor] || 0) + 1;
        if (vendorCode && vendorCode !== '-') nextCodes[vendor] = vendorCode;
      }

      const updatedWallet: RemiseWallet = {
        ...existing,
        collected: roundMoney(existing.collected + totalRemise),
        fromInvoice: roundMoney(existing.fromInvoice + totalRemise),
        vendors: nextVendors,
        vendorCodes: nextCodes,
        updatedAt: nowIso
      };

      const linesSumRemise = roundMoney(validProds.reduce((s, p) => s + p.remise, 0));
      const extraFromPaid = roundMoney(Math.max(0, totalRemise - linesSumRemise));

      const newEntries: RemiseHistoryEntry[] = validProds.map((p, idx) => ({
        id: `rem-inv-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        date: nowIso,
        company,
        vendor: vendor || vendorKey || '-',
        vendorCode: vendorCode && vendorCode !== '-' ? vendorCode : undefined,
        invoiceNumber: invNum || undefined,
        type: 'invoice',
        typeLabel: invNum ? `فاتورة ${invNum}` : 'فاتورة',
        product: p.name,
        qty: p.qty,
        amount: idx === 0 && extraFromPaid > 0 ? roundMoney(p.remise + extraFromPaid) : p.remise,
        brut: p.brut > 0 ? p.brut : undefined,
        net: p.net > 0 ? p.net : undefined,
        note: `Q:${p.qty} · BRUT:${fmtMoney(p.brut)} · NET:${fmtMoney(p.net)}${
          idx === 0 && extraFromPaid > 0 ? ` (+${fmtMoney(extraFromPaid)} فرق الأداء)` : ''
        }`
      }));

      return {
        wallets: { ...prev.wallets, [company]: updatedWallet },
        history: [...newEntries, ...prev.history]
      };
    });

    playSound('success');
    setManualCompany(company);
    setInvestCompany(company);
    setInvoiceFeedback({
      text: `تسجلات! ${validProds.length} سلع، الريميز: ${fmtMoney(totalRemise)} ${currencySymbol} — الفندور: ${
        vendor || '-'
      } (ما تحسبش كسلعة)`
    });
    setInvNumInput('');
    setPaidOverrideInput('');
    setInvoiceLines([createLineFromPreset()]);
    setAutoCountNote('');
  };

  // 2. Add Manual Remise
  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCompany = (manualCompany === '__new__' ? manualNewCompany : manualCompany).trim();
    const amt = roundMoney(parseFloat(manualAmount || '0'));

    if (!targetCompany || amt <= 0) {
      playSound('error');
      setManualFeedback({ text: 'ختار أو كتب سميت الشركة وكتب مبلغ صحيح أكبر من 0', isError: true });
      return;
    }

    const nowIso = new Date().toISOString();
    setData((prev) => {
      const existing = prev.wallets[targetCompany] || createEmptyWallet(targetCompany);
      const updatedWallet: RemiseWallet = {
        ...existing,
        collected: roundMoney(existing.collected + amt),
        manual: roundMoney(existing.manual + amt),
        updatedAt: nowIso
      };

      const entry: RemiseHistoryEntry = {
        id: `rem-man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: nowIso,
        company: targetCompany,
        vendor: 'يدوي',
        type: 'manual',
        typeLabel: `يدوي - ${manualType}`,
        product: '-',
        amount: amt,
        note: manualNote.trim() || manualType
      };

      return {
        wallets: { ...prev.wallets, [targetCompany]: updatedWallet },
        history: [entry, ...prev.history]
      };
    });

    playSound('success');
    setManualCompany(targetCompany);
    setManualNewCompany('');
    setManualAmount('');
    setManualNote('');
    setManualFeedback({
      text: `تزادت ${fmtMoney(amt)} ${currencySymbol} يدوياً في صندوق ${targetCompany}`
    });
  };

  // 3. Invest Remise (Offer / Buy Stock / Save Goal)
  const handleInvest = (e: React.FormEvent) => {
    e.preventDefault();
    const company = investCompany.trim();
    if (!company || !data.wallets[company]) {
      playSound('error');
      setInvestFeedback({ text: 'ختار الشركة أولاً', isError: true });
      return;
    }

    const wallet = data.wallets[company];
    const balance = getWalletAvailableBalance(wallet);
    const amt = roundMoney(parseFloat(investAmount || '0'));

    if (investChoice === 'save') {
      const goalVal = roundMoney(parseFloat(saveGoalInput || '0'));
      if (goalVal <= 0 && amt <= 0) {
        playSound('error');
        setInvestFeedback({ text: 'كتب الهدف ديال الادخار أو المبلغ اللي باغي تجمع', isError: true });
        return;
      }

      const nowIso = new Date().toISOString();
      setData((prev) => {
        const currentW = prev.wallets[company];
        if (!currentW) return prev;
        const updatedWallet: RemiseWallet = {
          ...currentW,
          goal: goalVal > 0 ? goalVal : currentW.goal,
          updatedAt: nowIso
        };
        const entry: RemiseHistoryEntry = {
          id: `rem-sav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: nowIso,
          company,
          vendor: 'صندوق الريميز',
          type: 'save',
          typeLabel: 'ادخار وتحديد هدف',
          product: '-',
          amount: amt > 0 ? amt : balance,
          note:
            goalVal > 0
              ? `خليتيه يتجمع · الهدف: ${fmtMoney(goalVal)} ${currencySymbol}`
              : 'خليتيه يتجمع في الصندوق'
        };
        return {
          wallets: { ...prev.wallets, [company]: updatedWallet },
          history: [entry, ...prev.history]
        };
      });

      playSound('success');
      setInvestFeedback({
        text:
          goalVal > 0
            ? `خليتيه يتجمع في صندوق ${company}. الهدف الجديد: ${fmtMoney(goalVal)} ${currencySymbol}`
            : `خليتيه يتجمع في صندوق ${company}.`
      });
      setSaveGoalInput('');
      return;
    }

    if (amt <= 0) {
      playSound('error');
      setInvestFeedback({ text: 'كتب المبلغ اللي بغيتي تستثمر', isError: true });
      return;
    }

    if (amt > balance) {
      playSound('error');
      setInvestFeedback({
        text: `ما عندكش هاد المبلغ في صندوق ${company}. الرصيد المتاح: ${fmtMoney(balance)} ${currencySymbol}`,
        isError: true
      });
      return;
    }

    const nowIso = new Date().toISOString();
    if (investChoice === 'offer') {
      const q = Number(soldQtyInput || '0');
      const sp = Number(sellPriceInput || '0');
      const profit = roundMoney(q * sp - amt);

      setData((prev) => {
        const currentW = prev.wallets[company];
        if (!currentW) return prev;
        const updatedWallet: RemiseWallet = {
          ...currentW,
          used: roundMoney(currentW.used + amt),
          offersProfit: roundMoney(currentW.offersProfit + profit),
          updatedAt: nowIso
        };
        const entry: RemiseHistoryEntry = {
          id: `rem-off-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: nowIso,
          company,
          vendor: 'استثمار عرض',
          type: 'offer',
          typeLabel: '1 - عرض ترويجي',
          product: buyProductNote.trim() || 'عرض خاص',
          amount: amt,
          profit,
          soldQty: q > 0 ? q : undefined,
          sellPrice: sp > 0 ? sp : undefined,
          note: `تباعت ${q} حبة بـ ${fmtMoney(sp)} ${currencySymbol} · الصافي ${profit >= 0 ? '+' : ''}${fmtMoney(profit)} ${currencySymbol}`
        };
        return {
          wallets: { ...prev.wallets, [company]: updatedWallet },
          history: [entry, ...prev.history]
        };
      });

      playSound('success');
      setInvestFeedback({
        text: `عرض: ربحتي ${profit >= 0 ? '+' : ''}${fmtMoney(profit)} ${currencySymbol} (${
          profit >= 0 ? 'عرض ناجح' : 'عرض ما خدمش — راجع الثمن أو الكمية'
        })`,
        isError: profit < 0
      });
      setInvestAmount('');
      setSoldQtyInput('');
      setSellPriceInput('');
      setBuyProductNote('');
      return;
    }

    // investChoice === 'buy'
    const productTitle = buyProductNote.trim() || 'سلعة من الريميز';
    const buyQty = Math.max(0, Number(buyQtyInput || '0'));
    const buySellPrice = Math.max(0, Number(buySellPriceInput || '0'));
    const normalizedProd = productTitle.toLowerCase();
    const matchedCatalogProduct = buyProductNote.trim()
      ? products.find(
          (p) =>
            p.name.trim().toLowerCase() === normalizedProd ||
            p.nameEn.trim().toLowerCase() === normalizedProd
        )
      : undefined;

    let inventorySyncNote = '';
    if (linkBuyToInventory && buyQty > 0 && buyProductNote.trim()) {
      if (matchedCatalogProduct) {
        adjustStock(
          matchedCatalogProduct.id,
          buyQty,
          `شراء من صندوق الريميز (${company}) — راس المال 0`,
          'restock'
        );
        inventorySyncNote = ` · تم إضافة +${buyQty} إلى مخزون "${matchedCatalogProduct.name}"`;
      } else {
        const defaultCat =
          categories.find((c) => c.id !== 'cat-all')?.id || categories[0]?.id || 'cat-oils-grains';
        const fallbackSellPrice =
          buySellPrice > 0 ? buySellPrice : roundMoney((amt / buyQty) * 1.25) || 1;
        const createdRes = addProduct({
          name: productTitle,
          nameEn: productTitle,
          sku: `REM-${Date.now().toString().slice(-5)}`,
          barcode: '',
          categoryId: defaultCat,
          price: fallbackSellPrice,
          costPrice: 0,
          stock: buyQty,
          lowStockThreshold: 3,
          unitType: 'piece',
          color: '#059669'
        });
        if (createdRes.success) {
          inventorySyncNote = ` · تم إنشاء "${productTitle}" في المخزون (+${buyQty} بتكلفة 0 ${currencySymbol})`;
        }
      }
    }

    setData((prev) => {
      const currentW = prev.wallets[company];
      if (!currentW) return prev;
      const updatedWallet: RemiseWallet = {
        ...currentW,
        used: roundMoney(currentW.used + amt),
        updatedAt: nowIso
      };
      const entry: RemiseHistoryEntry = {
        id: `rem-buy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: nowIso,
        company,
        vendor: 'شراء سلعة من الريميز',
        type: 'buy',
        typeLabel: '2 - شراء سلعة جديدة',
        product: productTitle,
        qty: buyQty > 0 ? buyQty : undefined,
        amount: amt,
        note: `سلعة راس مالها 0 من جيبك — ربحها 100% صافي${inventorySyncNote}`
      };
      return {
        wallets: { ...prev.wallets, [company]: updatedWallet },
        history: [entry, ...prev.history]
      };
    });

    playSound('success');
    setInvestFeedback({
      text: `شريتي سلعة جديدة بـ ${fmtMoney(amt)} ${currencySymbol} من فلوس الريميز. الربح ديالها 100% صافي، حيت راس مالها 0 من جيبك.${inventorySyncNote}`
    });
    setInvestAmount('');
    setBuyProductNote('');
    setBuyQtyInput('1');
    setBuySellPriceInput('');
  };

  // Save inline goal update on wallet card
  const handleSaveWalletGoal = (company: string) => {
    const val = roundMoney(parseFloat(editingGoalValue || '0'));
    setData((prev) => {
      const w = prev.wallets[company];
      if (!w) return prev;
      return {
        ...prev,
        wallets: {
          ...prev.wallets,
          [company]: {
            ...w,
            goal: val > 0 ? val : undefined,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
    setEditingGoalCompany(null);
    setEditingGoalValue('');
    playSound('click');
  };

  // Delete single history entry (and reverse its effect on wallet safely)
  const handleDeleteHistoryEntry = (entry: RemiseHistoryEntry) => {
    setData((prev) => {
      const nextHistory = prev.history.filter((h) => h.id !== entry.id);
      const w = prev.wallets[entry.company];
      if (!w) {
        return { ...prev, history: nextHistory };
      }
      const nextWallet: RemiseWallet = { ...w, updatedAt: new Date().toISOString() };
      if (entry.type === 'invoice') {
        nextWallet.collected = roundMoney(Math.max(0, nextWallet.collected - entry.amount));
        nextWallet.fromInvoice = roundMoney(Math.max(0, nextWallet.fromInvoice - entry.amount));
      } else if (entry.type === 'manual') {
        nextWallet.collected = roundMoney(Math.max(0, nextWallet.collected - entry.amount));
        nextWallet.manual = roundMoney(Math.max(0, nextWallet.manual - entry.amount));
      } else if (entry.type === 'offer') {
        nextWallet.used = roundMoney(Math.max(0, nextWallet.used - entry.amount));
        if (typeof entry.profit === 'number') {
          nextWallet.offersProfit = roundMoney(nextWallet.offersProfit - entry.profit);
        }
      } else if (entry.type === 'buy') {
        nextWallet.used = roundMoney(Math.max(0, nextWallet.used - entry.amount));
      }
      return {
        wallets: { ...prev.wallets, [entry.company]: nextWallet },
        history: nextHistory
      };
    });
    setConfirmDeleteHistoryId(null);
    playSound('click');
  };

  const handleClearAllRemise = () => {
    setData({ wallets: {}, history: [] });
    setConfirmClearAll(false);
    setInvoiceFeedback(null);
    setManualFeedback(null);
    setInvestFeedback(null);
    playSound('click');
  };

  // Customer Points Integration (reads/writes real POS customers)
  const handleAddCustomerPoints = (e: React.FormEvent) => {
    e.preventDefault();
    const rawName = custNameInput.trim();
    const pts = Math.round(Number(custPointsInput || '0'));

    if (!rawName || !Number.isFinite(pts) || pts === 0) {
      playSound('error');
      setPointsFeedback({ text: 'كتب سميت الزبون وعدد النقاط (مثال: 1)', isError: true });
      return;
    }

    const matched = customers.find(
      (c) =>
        c.name.trim().toLowerCase() === rawName.toLowerCase() ||
        (custPhoneInput.trim() && c.phone.trim() === custPhoneInput.trim())
    );

    if (matched) {
      const nextPts = Math.max(0, Math.round((matched.points || 0) + pts));
      updateCustomer(matched.id, { points: nextPts, updatedAt: Date.now() });
      playSound('success');
      setPointsFeedback({
        text: `${pts >= 0 ? 'تزادت' : 'تنقصات'} ${Math.abs(pts)} نقطة للزبون ${matched.name} (الرصيد: ${nextPts} نقطة)`
      });
    } else {
      if (pts < 0) {
        playSound('error');
        setPointsFeedback({ text: 'ما يمكنش تنقص نقاط لزبون ما مسجلش بعد.', isError: true });
        return;
      }
      const created = addCustomer({
        name: rawName,
        phone: custPhoneInput.trim() || '-',
        balance: 0,
        notes: 'مضاف من صندوق الريميز ونقاط الزبناء'
      });
      updateCustomer(created.id, {
        points: pts,
        tier: pts >= 500 ? 'Platinum' : pts >= 200 ? 'Gold' : 'Silver',
        updatedAt: Date.now()
      });
      playSound('success');
      setPointsFeedback({
        text: `تسجل الزبون ${created.name} بـ ${pts} نقطة ومربوط بالكاشير`
      });
    }

    setCustNameInput('');
    setCustPhoneInput('');
    setCustPointsInput('1');
  };

  const handleQuickAdjustPoints = (customerId: string, currentPoints: number, delta: number) => {
    const next = Math.max(0, Math.round((currentPoints || 0) + delta));
    updateCustomer(customerId, { points: next, updatedAt: Date.now() });
    playSound('click');
  };

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return data.history.filter((h) => {
      if (historyCompanyFilter !== 'all' && h.company !== historyCompanyFilter) return false;
      if (historyTypeFilter === 'invoice' && h.type !== 'invoice') return false;
      if (historyTypeFilter === 'manual' && h.type !== 'manual') return false;
      if (historyTypeFilter === 'invest' && h.type !== 'offer' && h.type !== 'buy' && h.type !== 'save') {
        return false;
      }
      if (!q) return true;
      return (
        h.company.toLowerCase().includes(q) ||
        h.vendor.toLowerCase().includes(q) ||
        (h.vendorCode || '').toLowerCase().includes(q) ||
        (h.invoiceNumber || '').toLowerCase().includes(q) ||
        h.product.toLowerCase().includes(q) ||
        h.typeLabel.toLowerCase().includes(q) ||
        h.note.toLowerCase().includes(q)
      );
    });
  }, [data.history, historySearch, historyCompanyFilter, historyTypeFilter]);

  const sortedCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    return [...customers]
      .filter((c) => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
      })
      .sort((a, b) => (b.points || 0) - (a.points || 0));
  }, [customers, custSearch]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-5 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Title & Core Rule */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {isAr ? 'صندوق الريميز — قراءة الفواتير تلقائياً' : 'Remise Box & Auto-Invoice OCR'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                {isAr
                  ? 'صور الفاتورة — هو يقراها ويوجد السطور بوحدو · كل شركة عندها صندوق مستقل'
                  : 'Snap supplier invoices to auto-extract BRUT/NET lines, collect rebates, and reinvest.'}
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 shrink-0 tabular-nums">
            <span>{walletList.length} {isAr ? 'شركة' : 'companies'}</span>
            <span aria-hidden="true">·</span>
            <span>{data.history.length} {isAr ? 'عملية مسجلة' : 'entries'}</span>
          </div>
        </div>

        {/* 4 Summary Metrics Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'الرصيد المتاح للاستثمار' : 'Available Remise'}
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {fmtMoney(totals.available)} <span className="text-xs font-bold">{currencySymbol}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'إجمالي الريميز المجموع' : 'Total Collected'}
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {fmtMoney(totals.collected)} <span className="text-xs font-bold">{currencySymbol}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'المستثمر والمصروف' : 'Invested / Used'}
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
              {fmtMoney(totals.used)} <span className="text-xs font-bold">{currencySymbol}</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'صافي أرباح العروض' : 'Offers Net Profit'}
            </div>
            <div
              className={`mt-1 text-xl sm:text-2xl font-black tabular-nums ${
                totals.offersProfit >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {totals.offersProfit >= 0 ? '+' : ''}
              {fmtMoney(totals.offersProfit)} <span className="text-xs font-bold">{currencySymbol}</span>
            </div>
          </div>
        </div>

        {/* Main 12-Col Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (6 cols): OCR + Multi-Line Invoice / Manual / Invest + Customer Points */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              {/* Segmented Action Tabs */}
              <div className="p-2 bg-slate-100 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setActionMode('invoice')}
                  className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                    actionMode === 'invoice'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FilePlus2 className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>{isAr ? 'قراءة وحفظ فاتورة' : 'Scan Invoice'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionMode('manual')}
                  className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                    actionMode === 'manual'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <HandCoins className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{isAr ? 'ريميز يدوي' : 'Manual'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionMode('invest')}
                  className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                    actionMode === 'invest'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{isAr ? 'استثمار' : 'Invest'}</span>
                </button>
              </div>

              <div className="p-4">
                {/* TAB 1: OCR PHOTO + AUTO-POPULATED MULTI-LINE INVOICE */}
                {actionMode === 'invoice' && (
                  <form onSubmit={handleAddInvoice} className="space-y-4">
                    {/* Step 1: Snap / Upload Invoice Photo */}
                    <div className="space-y-2.5 pb-4 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-black text-slate-900 dark:text-white">
                          1 - صور الفاتورة
                        </h2>
                        {ocrRawText && (
                          <button
                            type="button"
                            onClick={() => setShowOcrText((v) => !v)}
                            className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                          >
                            {showOcrText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            <span>{showOcrText ? 'إخفاء النص' : 'شوف شنو قرا'}</span>
                          </button>
                        )}
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleInvoicePhotoSelected}
                        className="hidden"
                      />

                      <button
                        type="button"
                        disabled={isScanningOcr}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-black flex items-center justify-center gap-2 transition-colors"
                      >
                        {isScanningOcr ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>كنقرا الفاتورة... {ocrProgress}%</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4 shrink-0" />
                            <span>صور الفاتورة ولا اختار تصويرة</span>
                          </>
                        )}
                      </button>

                      {previewUrl && (
                        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950">
                          <img
                            src={previewUrl}
                            alt="معاينة الفاتورة المصورة"
                            referrerPolicy="no-referrer"
                            className="w-full max-h-56 object-contain"
                          />
                        </div>
                      )}

                      {ocrStatusMsg && (
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {ocrStatusMsg}
                        </p>
                      )}

                      {showOcrText && ocrRawText && (
                        <pre className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {ocrRawText}
                        </pre>
                      )}
                    </div>

                    {/* Step 2A: ORANGE VENDOR ZONE (Locked — NEVER a product) */}
                    <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/35 border-2 border-amber-400 dark:border-amber-700 space-y-2.5">
                      <div>
                        <h2 className="text-sm font-black text-amber-950 dark:text-amber-200">
                          1 - الفندور — هنا بوحدو (ماشي سلعة)
                        </h2>
                        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 mt-0.5">
                          البرتقالي = الفندور | الزرق = السلع · مستحيل يتخلطو
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-bold text-amber-950 dark:text-amber-200 mb-1">
                            سميت الشركة *
                          </label>
                          <select
                            value={companyChoice}
                            onChange={(e) => handleSelectCompany(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-bold"
                          >
                            {companyDropdownOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          {companyChoice === OTHER_COMPANY_VALUE && (
                            <input
                              type="text"
                              value={companyOtherInput}
                              onChange={(e) => setCompanyOtherInput(e.target.value)}
                              placeholder="كتب سميت الشركة إلا ما كانتش في الليستة"
                              className="mt-2 w-full min-h-[42px] px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                            />
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-amber-950 dark:text-amber-200 mb-1">
                            رقم الفاتورة
                          </label>
                          <input
                            type="text"
                            value={invNumInput}
                            onChange={(e) => setInvNumInput(e.target.value)}
                            placeholder="70310011253"
                            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-amber-950 dark:text-amber-200 mb-1">
                            سميت الفندور (هادا ماشي سلعة)
                          </label>
                          <input
                            type="text"
                            value={vendorInput}
                            readOnly={isFixedCompanyVendor}
                            onChange={(e) => setVendorInput(e.target.value)}
                            placeholder="OUALI ALAMI AHMED"
                            className={`w-full min-h-[44px] px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-slate-900 dark:text-white text-sm font-bold ${
                              isFixedCompanyVendor
                                ? 'bg-white/90 dark:bg-slate-900/90 cursor-not-allowed'
                                : 'bg-white dark:bg-slate-950'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-amber-950 dark:text-amber-200 mb-1">
                            كود الفندور
                          </label>
                          <input
                            type="text"
                            value={vendorCodeInput}
                            readOnly={isFixedCompanyVendor}
                            onChange={(e) => setVendorCodeInput(e.target.value)}
                            placeholder="E16"
                            className={`w-full min-h-[44px] px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 text-slate-900 dark:text-white text-sm font-mono ${
                              isFixedCompanyVendor
                                ? 'bg-white/90 dark:bg-slate-900/90 cursor-not-allowed'
                                : 'bg-white dark:bg-slate-950'
                            }`}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                        سميت الفندور ثابتة هنا، ما كتقدرش تدخل للسلع لتحت. باش تبدل الفندور، بدل الشركة الفوق.
                      </p>
                    </div>

                    {/* Step 2B: BLUE PRODUCTS ZONE (Dropdown List First) */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h2 className="text-sm font-black text-blue-900 dark:text-blue-300">
                            2 - السلع — اختار من الليستة (ما تكتبش بيدك)
                          </h2>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                            {autoCountNote || `عدد السلع: ${invoiceLines.length} · كليكي على + زيد سطر`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleResetInvoiceLines}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                          >
                            تفريغ
                          </button>
                          <button
                            type="button"
                            onClick={handleAddBlankLine}
                            className="min-h-[36px] px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>زيد سطر سلعة</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {invoiceLines.map((line, index) => {
                          const b = parseFloat(line.brut || '0');
                          const n = parseFloat(line.net || '0');
                          const lineRem =
                            Number.isFinite(b) && Number.isFinite(n)
                              ? roundMoney(b - n)
                              : 0;
                          const resolvedName = getLineProductName(line);
                          const isBad = containsVendorOrTotalLeak(resolvedName, vendorInput);
                          const isNetOverBrut = Number.isFinite(b) && Number.isFinite(n) && n > b;

                          return (
                            <div
                              key={line.id}
                              className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border-2 border-blue-400 dark:border-blue-700 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center tabular-nums shrink-0">
                                    {index + 1}
                                  </span>
                                  <span className="text-xs font-bold text-blue-950 dark:text-blue-200">
                                    اختار السلعة من الليستة
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(line.id)}
                                  className="px-2.5 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حيد هاد السطر</span>
                                </button>
                              </div>

                              <div>
                                <select
                                  value={line.selectedOption}
                                  onChange={(e) =>
                                    handleUpdateLine(line.id, {
                                      selectedOption: e.target.value,
                                      customName:
                                        e.target.value === OTHER_PRODUCT_VALUE ? line.customName : ''
                                    })
                                  }
                                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold"
                                >
                                  {productDropdownOptions.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>

                                {line.selectedOption === OTHER_PRODUCT_VALUE && (
                                  <input
                                    type="text"
                                    value={line.customName}
                                    onChange={(e) =>
                                      handleUpdateLine(line.id, { customName: e.target.value })
                                    }
                                    placeholder="كتب سميت السلعة الجديدة هنا"
                                    className={`mt-2 w-full min-h-[42px] px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm ${
                                      isBad
                                        ? 'border-rose-500 dark:border-rose-500'
                                        : 'border-blue-300 dark:border-blue-700'
                                    }`}
                                  />
                                )}

                                {isBad && (
                                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                                    ⛔ "{resolvedName}" ماشي سلعة! هادي سميت فندور ولا TOTAL — حيدها.
                                  </p>
                                )}
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                                    الكمية
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={line.qty}
                                    onChange={(e) => handleUpdateLine(line.id, { qty: e.target.value })}
                                    placeholder="7"
                                    className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                                    BRUT
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={line.brut}
                                    onChange={(e) => handleUpdateLine(line.id, { brut: e.target.value })}
                                    placeholder="273"
                                    className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                                    NET
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={line.net}
                                    onChange={(e) => handleUpdateLine(line.id, { net: e.target.value })}
                                    placeholder="252.01"
                                    className={`w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-mono tabular-nums ${
                                      isNetOverBrut
                                        ? 'border-rose-500 dark:border-rose-500'
                                        : 'border-blue-200 dark:border-blue-800'
                                    }`}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-xs tabular-nums">
                                <span className="text-slate-600 dark:text-slate-300">
                                  ريميز هاد السطر:
                                </span>
                                <span
                                  className={`font-mono font-bold ${
                                    isNetOverBrut
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                >
                                  {isNetOverBrut ? 'NET أكبر من BRUT!' : `${fmtMoney(lineRem)} ${currencySymbol}`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Optional Less-Paid Override */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          أو إلا خلصتي أقل من إجمالي الفاتورة — شحال خلصتي؟ (اختياري)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={paidOverrideInput}
                          onChange={(e) => setPaidOverrideInput(e.target.value)}
                          placeholder="خليه خاوي إلا خلصتي كامل"
                          className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                        />
                      </div>

                      {/* Live Invoice Totals Strip */}
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs sm:text-sm font-extrabold text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 tabular-nums">
                        <span>BRUT: {fmtMoney(invoiceLineSummary.totalBrut)}</span>
                        <span aria-hidden="true">|</span>
                        <span>NET: {fmtMoney(invoiceLineSummary.totalNet)}</span>
                        <span aria-hidden="true">|</span>
                        <span className="text-emerald-700 dark:text-emerald-300">
                          الريميز: {fmtMoney(invoiceLineSummary.totalRemise)} {currencySymbol}
                        </span>
                        <span aria-hidden="true">|</span>
                        <span>عدد السلع: {invoiceLines.length}</span>
                      </div>

                      <button
                        type="submit"
                        className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black transition-colors"
                      >
                        حفظ الفاتورة + جمع الريميز
                      </button>

                      {invoiceFeedback && (
                        <div
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
                            invoiceFeedback.isError
                              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                              : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {invoiceFeedback.isError ? (
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                          )}
                          <span>{invoiceFeedback.text}</span>
                        </div>
                      )}
                    </div>
                  </form>
                )}

                {/* TAB 2: MANUAL REMISE */}
                {actionMode === 'manual' && (
                  <form onSubmit={handleAddManual} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        الشركة
                      </label>
                      <select
                        value={manualCompany}
                        onChange={(e) => setManualCompany(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                      >
                        {walletList.map((w) => (
                          <option key={w.company} value={w.company}>
                            {w.company} (متاح: {fmtMoney(getWalletAvailableBalance(w))} {currencySymbol})
                          </option>
                        ))}
                        <option value="__new__">+ شركة جديدة...</option>
                      </select>
                      {(manualCompany === '__new__' || walletList.length === 0) && (
                        <input
                          type="text"
                          value={manualNewCompany}
                          onChange={(e) => setManualNewCompany(e.target.value)}
                          placeholder="كتب سميت الشركة الجديدة (مثال: IDEAL)"
                          className="mt-2 w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        المبلغ ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={manualAmount}
                        onChange={(e) => setManualAmount(e.target.value)}
                        placeholder="مثال: 20"
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        النوع
                      </label>
                      <select
                        value={manualType}
                        onChange={(e) => setManualType(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                      >
                        {MANUAL_REMISE_TYPES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        ملاحظة
                      </label>
                      <input
                        type="text"
                        value={manualNote}
                        onChange={(e) => setManualNote(e.target.value)}
                        placeholder="مثال: فاتورة 5220 خلصت 5200"
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black transition-colors"
                    >
                      زيد الريميز اليدوي
                    </button>

                    {manualFeedback && (
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
                          manualFeedback.isError
                            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {manualFeedback.isError ? (
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        )}
                        <span>{manualFeedback.text}</span>
                      </div>
                    )}
                  </form>
                )}

                {/* TAB 3: INVEST REMISE */}
                {actionMode === 'invest' && (
                  <form onSubmit={handleInvest} className="space-y-3">
                    {walletList.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center space-y-2">
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          ما كاين حتى صندوق شركة دابا. صور فاتورة أو زيد ريميز يدوي باش تبدأ الاستثمار.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActionMode('invoice')}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                        >
                          زيد أول فاتورة
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              الشركة
                            </label>
                            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              المتاح: {fmtMoney(selectedInvestBalance)} {currencySymbol}
                            </span>
                          </div>
                          <select
                            value={investCompany}
                            onChange={(e) => setInvestCompany(e.target.value)}
                            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                          >
                            {walletList.map((w) => (
                              <option key={w.company} value={w.company}>
                                {w.company} ({fmtMoney(getWalletAvailableBalance(w))} {currencySymbol})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            شنو بغيتي تدير بيه؟ (اختار واحد من 3)
                          </label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInvestChoice('offer')}
                              className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                investChoice === 'offer'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              1 - دير عرض
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvestChoice('buy')}
                              className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                investChoice === 'buy'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              2 - شري سلعة
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvestChoice('save')}
                              className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                investChoice === 'save'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              3 - ادخار / هدف
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              المبلغ اللي بغيتي تستثمر
                            </label>
                            {selectedInvestBalance > 0 && (
                              <button
                                type="button"
                                onClick={() => setInvestAmount(String(selectedInvestBalance))}
                                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                استعمل كل الرصيد
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={investAmount}
                            onChange={(e) => setInvestAmount(e.target.value)}
                            placeholder="مثال: 100"
                            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                          />
                        </div>

                        {investChoice === 'offer' && (
                          <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                اسم السلعة أو العرض (اختياري)
                              </label>
                              <input
                                type="text"
                                value={buyProductNote}
                                onChange={(e) => setBuyProductNote(e.target.value)}
                                placeholder="مثال: عرض الخميرة / الزيت"
                                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                  شحال بعتي من بعد العرض؟
                                </label>
                                <input
                                  type="number"
                                  step="1"
                                  min="0"
                                  value={soldQtyInput}
                                  onChange={(e) => setSoldQtyInput(e.target.value)}
                                  placeholder="30"
                                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                  بشحال بعتي الحبة؟
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={sellPriceInput}
                                  onChange={(e) => setSellPriceInput(e.target.value)}
                                  placeholder="10"
                                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                                />
                              </div>
                            </div>
                            {previewOfferProfit !== null && (
                              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                                <span className="font-bold text-slate-600 dark:text-slate-300">
                                  النتيجة المتوقعة:
                                </span>
                                <span
                                  className={`font-mono font-black tabular-nums ${
                                    previewOfferProfit >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {previewOfferProfit >= 0 ? '+' : ''}
                                  {fmtMoney(previewOfferProfit)} {currencySymbol} ·{' '}
                                  {previewOfferProfit >= 0 ? 'عرض ناجح' : 'خسارة'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {investChoice === 'buy' && (() => {
                          const normQuery = buyProductNote.trim().toLowerCase();
                          const matchedProd = normQuery
                            ? products.find(
                                (p) =>
                                  p.name.trim().toLowerCase() === normQuery ||
                                  p.nameEn.trim().toLowerCase() === normQuery
                              )
                            : undefined;
                          return (
                            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                شنو السلعة اللي شريتي من الريميز؟
                              </label>
                              <input
                                type="text"
                                list="kadi-remise-products"
                                value={buyProductNote}
                                onChange={(e) => setBuyProductNote(e.target.value)}
                                placeholder="اختر سلعة من المتجر أو اكتب اسم سلعة جديدة..."
                                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                              />

                              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={linkBuyToInventory}
                                  onChange={(e) => setLinkBuyToInventory(e.target.checked)}
                                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                                />
                                <span>إضافة الكمية تلقائياً إلى مخزون المتجر (بتكلفة 0)</span>
                              </label>

                              {linkBuyToInventory && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                                      الكمية المضافة للمخزون
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={buyQtyInput}
                                      onChange={(e) => setBuyQtyInput(e.target.value)}
                                      placeholder="1"
                                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                                    />
                                  </div>
                                  {!matchedProd && buyProductNote.trim() && (
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                                        ثمن البيع للزبون ({currencySymbol})
                                      </label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={buySellPriceInput}
                                        onChange={(e) => setBuySellPriceInput(e.target.value)}
                                        placeholder="ثمن البيع..."
                                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}

                              {matchedProd && linkBuyToInventory && (
                                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70">
                                  تم ربطها بـ &ldquo;{matchedProd.name}&rdquo; (الرصيد الحالي: {matchedProd.stock})
                                </div>
                              )}

                              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                                السلعة المشراة من الريميز ربحها صافي 100% لأن رأس مالها من خصومات المورد.
                              </p>
                            </div>
                          );
                        })()}

                        {investChoice === 'save' && (
                          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                              الهدف ({currencySymbol})
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={saveGoalInput}
                              onChange={(e) => setSaveGoalInput(e.target.value)}
                              placeholder="2000"
                              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                            />
                          </div>
                        )}

                        <button
                          type="submit"
                          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black transition-colors"
                        >
                          استثمر دابا
                        </button>
                      </>
                    )}

                    {investFeedback && (
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
                          investFeedback.isError
                            ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {investFeedback.isError ? (
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        )}
                        <span>{investFeedback.text}</span>
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>

            {/* Customer Points Card (Synced directly with POS Customers) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 shrink-0" />
                  <h2 className="text-sm font-black text-slate-900 dark:text-white">
                    نقاط الزبون
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  مربوط بالكاشير · 1 نقطة = {pointValue} {currencySymbol}
                </span>
              </div>

              <form onSubmit={handleAddCustomerPoints} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    list="kadi-remise-customers"
                    value={custNameInput}
                    onChange={(e) => setCustNameInput(e.target.value)}
                    placeholder="سميت الزبون"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                  <datalist id="kadi-remise-customers">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>

                  <input
                    type="tel"
                    value={custPhoneInput}
                    onChange={(e) => setCustPhoneInput(e.target.value)}
                    placeholder="الهاتف (إلا كان زبون جديد)"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    step="1"
                    value={custPointsInput}
                    onChange={(e) => setCustPointsInput(e.target.value)}
                    placeholder="النقاط"
                    className="w-28 min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono tabular-nums"
                  />
                  <button
                    type="submit"
                    className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-sm font-black transition-colors whitespace-nowrap"
                  >
                    زيد نقطة للزبون
                  </button>
                </div>

                {pointsFeedback && (
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border ${
                      pointsFeedback.isError
                        ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    <span>{pointsFeedback.text}</span>
                  </div>
                )}
              </form>

              {/* Quick Customer Search & Points List */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                  <input
                    type="text"
                    value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                    placeholder="قلب على زبون..."
                    className="w-full min-h-[38px] ps-8 pe-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                {sortedCustomers.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-3">
                    لا يوجد زبناء مطابقون بعد.
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedCustomers.slice(0, 20).map((c) => (
                      <div
                        key={c.id}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {c.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {c.points || 0} نقطة · القيمة: {fmtMoney((c.points || 0) * pointValue)}{' '}
                            {currencySymbol}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjustPoints(c.id, c.points || 0, -1)}
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                            title="نقص نقطة"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjustPoints(c.id, c.points || 0, 1)}
                            className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 flex items-center justify-center"
                            title="زيد نقطة"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column (6 cols): Company Wallets with Star Ratings + Full History */}
          <div className="lg:col-span-6 space-y-5">
            {/* Company Wallets */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    صناديق الشركات
                  </h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {walletList.length} صندوق
                </span>
              </div>

              {walletList.length === 0 ? (
                <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    مازال ما كاين حتى صندوق شركة
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    صور أول فاتورة أو زيد سطور BRUT و NET، وغادي يتفتح صندوق خاص بالشركة ويتعمر تلقائياً.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {walletList.map((w) => {
                    const available = getWalletAvailableBalance(w);
                    const goal = w.goal && w.goal > 0 ? w.goal : 0;
                    const progressPct = goal > 0 ? Math.min(100, Math.round((available / goal) * 100)) : 0;
                    const vendorPairs = Object.entries(w.vendors);
                    const isEditingGoal = editingGoalCompany === w.company;
                    const stars = getWalletStarCount(w);

                    return (
                      <div key={w.company} className="py-3.5 first:pt-1 last:pb-1 space-y-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black text-slate-900 dark:text-white">
                                {w.company}
                              </span>
                              <span
                                className="inline-flex items-center gap-0.5 text-amber-500"
                                title={`تقييم الصندوق: ${stars}/5`}
                              >
                                {Array.from({ length: stars }).map((_, idx) => (
                                  <Star key={idx} className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                ))}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                              جمعتي: {fmtMoney(w.collected)} · فواتير: {fmtMoney(w.fromInvoice)} · يدوي:{' '}
                              {fmtMoney(w.manual)} · مستعمل: {fmtMoney(w.used)} {currencySymbol}
                            </div>
                          </div>

                          <div className="text-end">
                            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                              الباقي: {fmtMoney(available)} {currencySymbol}
                            </div>
                            <div
                              className={`text-[11px] font-bold tabular-nums ${
                                w.offersProfit >= 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              ربح: {w.offersProfit >= 0 ? '+' : ''}
                              {fmtMoney(w.offersProfit)} {currencySymbol}
                            </div>
                          </div>
                        </div>

                        {vendorPairs.length > 0 && (
                          <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-bold text-slate-700 dark:text-slate-300">الفندورات:</span>
                            {vendorPairs.map(([vName, count], idx) => {
                              const code = w.vendorCodes[vName];
                              return (
                                <React.Fragment key={vName}>
                                  {idx > 0 && <span aria-hidden="true">|</span>}
                                  <span className="tabular-nums">
                                    {vName}
                                    {code ? ` (${code})` : ''}: {count}
                                  </span>
                                </React.Fragment>
                              );
                            })}
                          </div>
                        )}

                        {goal > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs tabular-nums">
                              <span className="text-slate-600 dark:text-slate-400 font-semibold">
                                {fmtMoney(available)} / {fmtMoney(goal)} {currencySymbol}
                              </span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {progressPct}%
                              </span>
                            </div>
                            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-emerald-600 rounded-full transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectCompany(w.company);
                              setActionMode('invoice');
                            }}
                            className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            + فاتورة
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setManualCompany(w.company);
                              setActionMode('manual');
                            }}
                            className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            + يدوي
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setInvestCompany(w.company);
                              setActionMode('invest');
                            }}
                            className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                          >
                            استثمر
                          </button>

                          {!isEditingGoal ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingGoalCompany(w.company);
                                setEditingGoalValue(goal > 0 ? String(goal) : '');
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                            >
                              <Target className="w-3.5 h-3.5" />
                              <span>{goal > 0 ? 'تعديل الهدف' : 'حدد هدف'}</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editingGoalValue}
                                onChange={(e) => setEditingGoalValue(e.target.value)}
                                placeholder="2000"
                                className="w-24 min-h-[36px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveWalletGoal(w.company)}
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                              >
                                حفظ
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingGoalCompany(null)}
                                className="min-h-[36px] px-2 py-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                aria-label="إلغاء"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Full History Ledger + Safe Clear All */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    التاريخ كامل
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={historyCompanyFilter}
                    onChange={(e) => setHistoryCompanyFilter(e.target.value)}
                    className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <option value="all">كل الشركات</option>
                    {walletList.map((w) => (
                      <option key={w.company} value={w.company}>
                        {w.company}
                      </option>
                    ))}
                  </select>

                  <select
                    value={historyTypeFilter}
                    onChange={(e) =>
                      setHistoryTypeFilter(e.target.value as 'all' | 'invoice' | 'manual' | 'invest')
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <option value="all">كل العمليات</option>
                    <option value="invoice">فواتير</option>
                    <option value="manual">يدوي</option>
                    <option value="invest">استثمار</option>
                  </select>
                </div>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="بحث بالشركة، الفندور، رقم الفاتورة، أو السلعة..."
                  className="w-full min-h-[40px] ps-9 pe-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {filteredHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  لا توجد عمليات مسجلة حالياً.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2 px-2 text-start font-bold">التاريخ</th>
                        <th className="py-2 px-2 text-start font-bold">الشركة / الفندور</th>
                        <th className="py-2 px-2 text-start font-bold">النوع والسلعة</th>
                        <th className="py-2 px-2 text-end font-bold">المبلغ</th>
                        <th className="py-2 px-2 text-end font-bold">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredHistory.map((h) => {
                        const isOut = h.type === 'offer' || h.type === 'buy';
                        const isConfirming = confirmDeleteHistoryId === h.id;
                        return (
                          <tr
                            key={h.id}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-2 whitespace-nowrap text-slate-500 dark:text-slate-400 tabular-nums align-top">
                              {fmtDateMA(h.date)}
                            </td>
                            <td className="py-2.5 px-2 align-top">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {h.company}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {h.vendor}
                                {h.vendorCode ? ` (${h.vendorCode})` : ''}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 align-top">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {h.typeLabel}
                                {h.product && h.product !== '-' ? ` · ${h.product}` : ''}
                              </div>
                              {h.note && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                                  {h.note}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-end whitespace-nowrap align-top tabular-nums">
                              <div
                                className={`font-mono font-black ${
                                  h.type === 'save'
                                    ? 'text-slate-700 dark:text-slate-300'
                                    : isOut
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {h.type === 'save' ? '' : isOut ? '-' : '+'}
                                {fmtMoney(h.amount)} {currencySymbol}
                              </div>
                              {typeof h.profit === 'number' && (
                                <div
                                  className={`text-[11px] font-bold ${
                                    h.profit >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  ربح: {h.profit >= 0 ? '+' : ''}
                                  {fmtMoney(h.profit)} {currencySymbol}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-end align-top">
                              {isConfirming ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteHistoryEntry(h)}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold"
                                  >
                                    تأكيد
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteHistoryId(null)}
                                    className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteHistoryId(h.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                  aria-label="حذف السجل"
                                  title="حذف وتحديث الصندوق"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {(walletList.length > 0 || data.history.length > 0) && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                  {!confirmClearAll ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(true)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>مسح كلشي</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                        تمسح جميع الصناديق والتاريخ؟
                      </span>
                      <button
                        type="button"
                        onClick={handleClearAllRemise}
                        className="min-h-[36px] px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                      >
                        تأكيد المسح
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearAll(false)}
                        className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
                      >
                        إلغاء
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

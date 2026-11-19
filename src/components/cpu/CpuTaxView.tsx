import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  CpuCnssBracket,
  CpuQuarterId
} from '../../types';
import {
  DEFAULT_CNSS_BRACKETS,
  calculateCpuBreakdown,
  calculateCpuBreakdownByAnnualTax,
  getQuarterDateRange,
  getQuarterLabel
} from '../../utils/cpuTax';
import { generateAndDownloadCpuTaxPdf } from '../../utils/pdfReport';
import { playSound } from '../../utils/audio';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  PieChart,
  Pie,
  Cell,
  ReferenceLine
} from 'recharts';
import {
  Landmark,
  BellRing,
  CheckCircle2,
  Calculator,
  HeartPulse,
  ShieldCheck,
  Download,
  SlidersHorizontal,
  TrendingUp,
  Award,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Power,
  Check,
  Calendar,
  ArrowDownToLine,
  ArrowUpRight,
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  PieChart as PieChartIcon,
  ListChecks,
  Gauge,
  Activity,
  ShieldAlert,
  Target,
  Coins
} from 'lucide-react';

type CpuSubTab = 'overview' | 'simulator' | 'retirement' | 'settings';

export const CpuTaxView: React.FC = () => {
  const {
    orders,
    expenses,
    settings,
    currencySymbol,
    language,
    cpuSettings,
    updateCpuSettings,
    cpuRecords,
    upsertCpuQuarterTurnover,
    toggleCpuQuarterRetirement,
    markCpuQuarterPaid,
    deleteCpuQuarterRecord,
    cpuAlerts,
    retirementProgress,
    isDark
  } = usePos();

  const isAr = language === 'ar';
  const [subTab, setSubTab] = useState<CpuSubTab>('overview');
  const [toast, setToast] = useState<{ ok: boolean; warn?: boolean; text: string } | null>(null);

  // Quarter turnover declaration form
  const currentYear = new Date().getFullYear();
  const [formYear, setFormYear] = useState<number>(2026);
  const [formQuarter, setFormQuarter] = useState<CpuQuarterId>('Q4');
  const [formInputScope, setFormInputScope] = useState<'quarterly' | 'annual'>('quarterly');
  const [formTurnover, setFormTurnover] = useState<string>(() => {
    const existing = cpuRecords.find((r) => r.year === 2026 && r.quarter === 'Q4');
    return existing ? String(existing.turnover) : '41500';
  });
  const [formRetirementEnabled, setFormRetirementEnabled] = useState<boolean>(
    cpuSettings.retirementEnabled
  );
  const [formNotes, setFormNotes] = useState<string>('');

  // Risk & Threshold Simulator V4 daily sales state
  const [v4DailySales, setV4DailySales] = useState<number>(3600);
  const lastThresholdToastKeyRef = useRef<string>('');
  const [selectedDashboardBracketId, setSelectedDashboardBracketId] = useState<string | null>(null);

  // Multi-select rows for PDF report
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);

  // Interactive Simulator state
  const [simInputPeriod, setSimInputPeriod] = useState<'quarterly' | 'monthly' | 'annual' | 'annual_cpu'>('quarterly');
  const [simTurnover, setSimTurnover] = useState<number>(50000);
  const [simRetirementOn, setSimRetirementOn] = useState<boolean>(cpuSettings.retirementEnabled);

  // Dedicated Tax & Contributions Chart state
  const [taxContribChartMode, setTaxContribChartMode] = useState<'stacked' | 'grouped' | 'area'>('stacked');
  const [taxContribScope, setTaxContribScope] = useState<'all' | 'paid'>('all');

  // Retirement Timeline & Cost Estimator states
  const [estQuartersPerYear, setEstQuartersPerYear] = useState<number>(4);
  const [estBracketId, setEstBracketId] = useState<string>('');

  // Dedicated CPU Settings draft state
  const [draftTaxRate, setDraftTaxRate] = useState<string>(String(cpuSettings.taxRatePct));
  const [draftProfCoeff, setDraftProfCoeff] = useState<string>(String(cpuSettings.professionCoeffPct));
  const [draftRetCoeff, setDraftRetCoeff] = useState<string>(String(cpuSettings.retirementCoeff));
  const [draftAlertDays, setDraftAlertDays] = useState<string>(String(cpuSettings.alertDaysBeforeDue));
  const [draftPriorDays, setDraftPriorDays] = useState<string>(String(cpuSettings.priorAccumulatedDays));
  const [draftAnnualPatente, setDraftAnnualPatente] = useState<string>(String(cpuSettings.annualPatenteTax || 0));
  const [draftRetDefault, setDraftRetDefault] = useState<boolean>(cpuSettings.retirementEnabled);
  const [draftBrackets, setDraftBrackets] = useState<CpuCnssBracket[]>(() =>
    cpuSettings.cnssBrackets.map((b) => ({ ...b }))
  );

  useEffect(() => {
    setDraftTaxRate(String(cpuSettings.taxRatePct));
    setDraftProfCoeff(String(cpuSettings.professionCoeffPct));
    setDraftRetCoeff(String(cpuSettings.retirementCoeff));
    setDraftAlertDays(String(cpuSettings.alertDaysBeforeDue));
    setDraftPriorDays(String(cpuSettings.priorAccumulatedDays));
    setDraftAnnualPatente(String(cpuSettings.annualPatenteTax || 0));
    setDraftRetDefault(cpuSettings.retirementEnabled);
    setDraftBrackets(cpuSettings.cnssBrackets.map((b) => ({ ...b })));
  }, [cpuSettings]);

  const showToast = (text: string, ok: boolean = true, warn: boolean = false) => {
    setToast({ ok, warn, text });
    setTimeout(() => setToast(null), warn ? 5200 : 3500);
  };

  // Sorted records chronologically for chart & table
  const sortedRecordsAsc = useMemo(() => {
    const qOrder: Record<CpuQuarterId, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    return [...cpuRecords].sort(
      (a, b) => a.year - b.year || qOrder[a.quarter] - qOrder[b.quarter]
    );
  }, [cpuRecords]);

  const sortedRecordsDesc = useMemo(() => [...sortedRecordsAsc].reverse(), [sortedRecordsAsc]);

  // Featured record (latest or selected year/quarter)
  const activePreviewCalc = useMemo(() => {
    const val = Math.max(0, parseFloat(formTurnover) || 0);
    return calculateCpuBreakdown(val, cpuSettings, formRetirementEnabled);
  }, [formTurnover, cpuSettings, formRetirementEnabled]);

  const latestRecord = sortedRecordsDesc[0];

  // Historical Sales Daily Average, Annual Projection, 6-Bracket Progress & Next-Month Forecast
  const projectionAndThresholdAnalysis = useMemo(() => {
    const coeffPct = Math.max(0, Number(cpuSettings.professionCoeffPct) || 6);
    const taxPct = Math.max(0, Number(cpuSettings.taxRatePct) || 10);
    const factor = (coeffPct / 100) * (taxPct / 100);
    const retCoeff = Math.max(0, Number(cpuSettings.retirementCoeff) || 1.57);

    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const last30Start = nowMs - 30 * dayMs;
    const prev30Start = nowMs - 60 * dayMs;

    let last30Sales = 0;
    let last30OrdersCount = 0;
    let prev30Sales = 0;

    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const ms = new Date(o.date).getTime();
      if (!Number.isFinite(ms)) return;
      if (ms >= last30Start && ms <= nowMs) {
        last30Sales += Number(o.grandTotal) || 0;
        last30OrdersCount += 1;
      } else if (ms >= prev30Start && ms < last30Start) {
        prev30Sales += Number(o.grandTotal) || 0;
      }
    });

    const hasPosSalesLast30 = last30Sales > 0;
    const rawPosDailyAvg = Number((last30Sales / 30).toFixed(2));
    const fallbackDailyAvg = Number(((activePreviewCalc.turnover || 0) / 90).toFixed(2));
    const effectiveDailyAvg = hasPosSalesLast30 ? rawPosDailyAvg : fallbackDailyAvg;

    // Growth rate comparing last 30 days vs previous 30 days (or latest two quarters fallback)
    let growthRatePct = 0;
    if (prev30Sales > 0 && hasPosSalesLast30) {
      growthRatePct = Number((((last30Sales - prev30Sales) / prev30Sales) * 100).toFixed(1));
    } else if (sortedRecordsAsc.length >= 2) {
      const prevQ = sortedRecordsAsc[sortedRecordsAsc.length - 2];
      const lastQ = sortedRecordsAsc[sortedRecordsAsc.length - 1];
      if (prevQ.turnover > 0) {
        growthRatePct = Number((((lastQ.turnover - prevQ.turnover) / prevQ.turnover) * 100).toFixed(1));
      }
    }

    const currentAnnualTurnover = Number((activePreviewCalc.turnover * 4).toFixed(2));
    const projectedAnnualTurnover = Number((effectiveDailyAvg * 365).toFixed(2));
    const projectedCalc = calculateCpuBreakdown(
      projectedAnnualTurnover / 4,
      cpuSettings,
      formRetirementEnabled
    );

    // Next Month Forecast based on daily avg & growth rate
    const cappedGrowthRatio = Math.max(-0.5, Math.min(1, growthRatePct / 100));
    const nextMonthDailyProjected = Number((effectiveDailyAvg * (1 + cappedGrowthRatio)).toFixed(2));
    const nextMonthTurnover = Number((nextMonthDailyProjected * 30).toFixed(2));
    const nextMonthAnnualized = Number((nextMonthTurnover * 12).toFixed(2));
    const nextMonthCalc = calculateCpuBreakdown(
      nextMonthAnnualized / 4,
      cpuSettings,
      formRetirementEnabled
    );
    const nextMonthProfitEst = Number((nextMonthTurnover * (coeffPct / 100)).toFixed(2));
    const nextMonthCpuTax = Number((nextMonthTurnover * factor).toFixed(2));

    const currentMonthTurnoverEst = Number((effectiveDailyAvg * 30).toFixed(2));
    const currentMonthProfitEst = Number((currentMonthTurnoverEst * (coeffPct / 100)).toFixed(2));
    const currentMonthCpuTax = Number((currentMonthTurnoverEst * factor).toFixed(2));

    // Build all 6 CNSS Brackets with Annual CA Thresholds
    const sortedBrackets = [...cpuSettings.cnssBrackets].sort(
      (a, b) => a.minAnnualTax - b.minAnnualTax
    );

    const fifthBracketMaxTax =
      sortedBrackets.length >= 2 && sortedBrackets[sortedBrackets.length - 2]?.maxAnnualTax
        ? Number(sortedBrackets[sortedBrackets.length - 2].maxAnnualTax)
        : 10000;
    const limitCaCeiling = factor > 0 ? Math.round(fifthBracketMaxTax / factor) : 1666665;

    const currentMatchedIdx = Math.max(
      0,
      sortedBrackets.findIndex((b) => b.id === activePreviewCalc.matchedBracket.id)
    );
    const activeMatchedBracket = sortedBrackets[currentMatchedIdx] || sortedBrackets[0];
    const activeMonthlyAmoRef = Number((activeMatchedBracket?.monthlyAmo || 0).toFixed(2));
    const activeMonthlyRetRef = formRetirementEnabled
      ? Number((activeMonthlyAmoRef * retCoeff).toFixed(2))
      : 0;
    const currentAnnualCpuTax = Number((currentAnnualTurnover * factor).toFixed(2));

    const bracketRows = sortedBrackets.map((b, idx) => {
      const minCa = idx === 0 || factor <= 0 ? 0 : Math.ceil(b.minAnnualTax / factor);
      const maxCa =
        b.maxAnnualTax !== null && factor > 0
          ? Math.floor(b.maxAnnualTax / factor)
          : null;
      const minQuarterCa = Math.round(minCa / 4);
      const maxQuarterCa = maxCa !== null ? Math.round(maxCa / 4) : null;
      const minCpuTax = Number(b.minAnnualTax || 0);
      const maxCpuTax = b.maxAnnualTax !== null ? Number(b.maxAnnualTax) : null;
      const prevMax =
        idx > 0 && sortedBrackets[idx - 1].maxAnnualTax !== null && factor > 0
          ? Math.floor((sortedBrackets[idx - 1].maxAnnualTax || 0) / factor)
          : 0;
      const span = maxCa !== null ? Math.max(1, maxCa - minCa) : Math.max(1, prevMax);

      const calcFillPct = (val: number) => {
        if (maxCa === null) {
          if (val <= prevMax) return 0;
          return Math.min(100, Number((((val - prevMax) / Math.max(1, prevMax * 0.5)) * 100).toFixed(1)));
        }
        if (val >= maxCa) return 100;
        if (val <= minCa) return idx === 0 && val > 0 ? Math.min(100, Number(((val / maxCa) * 100).toFixed(1))) : 0;
        return Math.min(100, Math.max(2, Number((((val - minCa) / span) * 100).toFixed(1))));
      };

      const pctCurrent = calcFillPct(currentAnnualTurnover);
      const pctProjected = calcFillPct(projectedAnnualTurnover);

      const isCurrentBracket = b.id === activePreviewCalc.matchedBracket.id;
      const isProjectedBracket = b.id === projectedCalc.matchedBracket.id;
      const isPassed = maxCa !== null && currentAnnualTurnover > maxCa;
      const remainingCaToCeiling = maxCa !== null ? Math.max(0, maxCa - currentAnnualTurnover) : 0;
      const remainingCpuToCeiling =
        maxCpuTax !== null ? Math.max(0, Number((maxCpuTax - currentAnnualCpuTax).toFixed(2))) : 0;
      const remainingDaysToCeiling =
        maxCa !== null && !isPassed && effectiveDailyAvg > 0
          ? Math.max(0, Math.ceil(remainingCaToCeiling / effectiveDailyAvg))
          : null;

      const monthlyAmo = Number((b.monthlyAmo || 0).toFixed(2));
      const monthlyRetFull = Number((monthlyAmo * retCoeff).toFixed(2));
      const quarterlyRetFull = Number((monthlyRetFull * 3).toFixed(2));
      const annualRetFull = Number((monthlyRetFull * 12).toFixed(2));

      const monthlyRet = formRetirementEnabled ? monthlyRetFull : 0;
      const quarterlyAmo = Number((monthlyAmo * 3).toFixed(2));
      const quarterlyRet = Number((monthlyRet * 3).toFixed(2));
      const quarterlyTotalContrib = Number(((monthlyAmo + monthlyRet) * 3).toFixed(2));
      const totalMonthlyProtection = Number((monthlyAmo + monthlyRet).toFixed(2));

      const deltaMonthlyAmo = Number((monthlyAmo - activeMonthlyAmoRef).toFixed(2));
      const deltaMonthlyRet = Number((monthlyRet - activeMonthlyRetRef).toFixed(2));
      const deltaMonthlyRetFull = Number((monthlyRetFull - Number((activeMonthlyAmoRef * retCoeff).toFixed(2))).toFixed(2));
      const deltaMonthlyTotal = Number((deltaMonthlyAmo + deltaMonthlyRet).toFixed(2));
      const deltaQuarterlyContrib = Number((deltaMonthlyTotal * 3).toFixed(2));
      const deltaAnnualContrib = Number((deltaMonthlyTotal * 12).toFixed(2));

      const statusTone: 'passed' | 'critical' | 'approaching' | 'safe' | 'upcoming' = isPassed
        ? 'passed'
        : pctCurrent >= 90 || pctProjected >= 95
        ? 'critical'
        : pctCurrent >= 70 || pctProjected >= 80
        ? 'approaching'
        : isCurrentBracket
        ? 'safe'
        : 'upcoming';

      const caUsageOfMaxPct =
        maxCa !== null && maxCa > 0
          ? Number(((currentAnnualTurnover / maxCa) * 100).toFixed(1))
          : 100;

      return {
        index: idx + 1,
        bracket: b,
        shortName: isAr ? `شطر ${idx + 1}` : `Tr. ${idx + 1}`,
        minCa,
        maxCa,
        minQuarterCa,
        maxQuarterCa,
        minCpuTax,
        maxCpuTax,
        pctCurrent,
        pctProjected,
        isCurrentBracket,
        isProjectedBracket,
        isPassed,
        remainingCaToCeiling,
        remainingCpuToCeiling,
        remainingDaysToCeiling,
        caUsageOfMaxPct,
        monthlyAmo,
        monthlyRet,
        monthlyRetFull,
        quarterlyAmo,
        quarterlyRet,
        quarterlyRetFull,
        annualRetFull,
        quarterlyTotalContrib,
        totalMonthlyProtection,
        deltaMonthlyAmo,
        deltaMonthlyRet,
        deltaMonthlyRetFull,
        deltaMonthlyTotal,
        deltaQuarterlyContrib,
        deltaAnnualContrib,
        statusTone
      };
    });

    const currentBracketIdx = Math.max(
      0,
      bracketRows.findIndex((r) => r.isCurrentBracket)
    );
    const activeRow = bracketRows[currentBracketIdx];
    const nextRow =
      currentBracketIdx < bracketRows.length - 1 ? bracketRows[currentBracketIdx + 1] : null;

    // Approach percentage within current bracket OR vs projected annual
    const currentInBracketPct = activeRow?.maxCa
      ? Math.min(100, Number(((currentAnnualTurnover / activeRow.maxCa) * 100).toFixed(1)))
      : 100;
    const projectedInBracketPct = activeRow?.maxCa
      ? Math.min(200, Number(((projectedAnnualTurnover / activeRow.maxCa) * 100).toFixed(1)))
      : 100;

    // Global risk percentage vs limitCaCeiling (~1,666,665 MAD)
    const thresholdRiskPct =
      limitCaCeiling > 0
        ? Number(((currentAnnualTurnover / limitCaCeiling) * 100).toFixed(1))
        : 0;
    const projectedThresholdRiskPct =
      limitCaCeiling > 0
        ? Number(((projectedAnnualTurnover / limitCaCeiling) * 100).toFixed(1))
        : 0;

    const effectiveRiskPct = Math.max(thresholdRiskPct, projectedThresholdRiskPct);
    const riskZone: 'safe' | 'moderate' | 'warning' | 'danger' =
      effectiveRiskPct >= 99
        ? 'danger'
        : effectiveRiskPct >= 90
        ? 'warning'
        : effectiveRiskPct >= 70
        ? 'moderate'
        : 'safe';

    const chartRows = bracketRows.map((row) => ({
      name: row.shortName,
      fullLabel: row.bracket.label,
      amoMonthly: row.monthlyAmo,
      retMonthly: row.monthlyRet,
      totalMonthlyContrib: Number((row.monthlyAmo + row.monthlyRet).toFixed(2)),
      maxCaK: row.maxCa !== null ? Math.round(row.maxCa / 1000) : Math.round((limitCaCeiling * 1.25) / 1000),
      isCurrent: row.isCurrentBracket,
      isProjected: row.isProjectedBracket
    }));

    return {
      hasPosSalesLast30,
      last30Sales: Number(last30Sales.toFixed(2)),
      last30OrdersCount,
      rawPosDailyAvg,
      effectiveDailyAvg,
      growthRatePct,
      currentAnnualTurnover,
      projectedAnnualTurnover,
      projectedCalc,
      currentMonthTurnoverEst,
      currentMonthProfitEst,
      currentMonthCpuTax,
      nextMonthTurnover,
      nextMonthProfitEst,
      nextMonthCpuTax,
      nextMonthCalc,
      limitCaCeiling,
      thresholdRiskPct,
      projectedThresholdRiskPct,
      riskZone,
      bracketRows,
      activeRow,
      nextRow,
      currentInBracketPct,
      projectedInBracketPct,
      chartRows
    };
  }, [
    orders,
    cpuSettings,
    activePreviewCalc,
    formRetirementEnabled,
    sortedRecordsAsc,
    isAr
  ]);

  // Automatic Visual Toast Notification when approaching or projected to cross current bracket ceiling
  useEffect(() => {
    const active = projectionAndThresholdAnalysis.activeRow;
    const next = projectionAndThresholdAnalysis.nextRow;
    if (!active || !next || !active.maxCa) return;

    const curPct = projectionAndThresholdAnalysis.currentInBracketPct;
    const projPct = projectionAndThresholdAnalysis.projectedInBracketPct;
    const nearingCurrent = curPct >= 85 && curPct < 100;
    const projectedToCross = projPct >= 90;

    if (!nearingCurrent && !projectedToCross) return;

    const triggerKey = `${active.bracket.id}-${nearingCurrent ? 'cur' : 'proj'}-${Math.round(
      Math.max(curPct, projPct) / 5
    )}`;
    if (lastThresholdToastKeyRef.current === triggerKey) return;
    lastThresholdToastKeyRef.current = triggerKey;

    const remaining = Math.max(0, Math.round(active.remainingCaToCeiling));
    const msg = isAr
      ? projectedToCross && projPct >= 100
        ? `⚠️ تنبيه العتبة: التوقع السنوي (${projectionAndThresholdAnalysis.projectedAnnualTurnover.toLocaleString('en-US')} ${currencySymbol}) سيتجاوز ${active.shortName} نحو ${next.shortName} (AMO سيرتفع إلى ${next.monthlyAmo} ${currencySymbol}/شهر).`
        : `⚠️ تنبيه العتبة: رقم الأعمال يقترب من سقف ${active.shortName} (${Math.max(curPct, projPct).toFixed(0)}%) — متبقي ${remaining.toLocaleString('en-US')} ${currencySymbol} قبل الانتقال لـ ${next.shortName}.`
      : `⚠️ Threshold Alert: Approaching ceiling of ${active.shortName} (${Math.max(curPct, projPct).toFixed(0)}%). ${remaining.toLocaleString('en-US')} ${currencySymbol} left before AMO rises to ${next.monthlyAmo}/mo.`;

    showToast(msg, false, true);
  }, [
    projectionAndThresholdAnalysis.activeRow,
    projectionAndThresholdAnalysis.nextRow,
    projectionAndThresholdAnalysis.currentInBracketPct,
    projectionAndThresholdAnalysis.projectedInBracketPct,
    projectionAndThresholdAnalysis.projectedAnnualTurnover,
    currencySymbol,
    isAr
  ]);

  // Channel Attribution for selected quarter (POS vs Remote WhatsApp)
  const quarterChannelStats = useMemo(() => {
    const { start, end } = getQuarterDateRange(formYear, formQuarter);
    const startMs = new Date(start + 'T00:00:00').getTime();
    const endMs = new Date(end + 'T23:59:59').getTime();

    let posRevenue = 0;
    let posCount = 0;
    let remoteRevenue = 0;
    let remoteCount = 0;

    orders.forEach((o) => {
      if (o.status !== 'completed') return;
      const ms = new Date(o.date).getTime();
      if (ms < startMs || ms > endMs) return;
      if (o.remoteOrderId) {
        remoteRevenue += o.grandTotal || 0;
        remoteCount += 1;
      } else {
        posRevenue += o.grandTotal || 0;
        posCount += 1;
      }
    });

    const total = posRevenue + remoteRevenue;
    const posPct = total > 0 ? Number(((posRevenue / total) * 100).toFixed(1)) : 0;
    const remotePct = total > 0 ? Number(((remoteRevenue / total) * 100).toFixed(1)) : 0;
    const rate =
      (Math.max(0, cpuSettings.professionCoeffPct) / 100) *
      (Math.max(0, cpuSettings.taxRatePct) / 100);
    const posTaxEst = Number((posRevenue * rate).toFixed(2));
    const remoteTaxEst = Number((remoteRevenue * rate).toFixed(2));

    return {
      start,
      end,
      posRevenue,
      posCount,
      remoteRevenue,
      remoteCount,
      total,
      posPct,
      remotePct,
      posTaxEst,
      remoteTaxEst
    };
  }, [orders, formYear, formQuarter, cpuSettings.professionCoeffPct, cpuSettings.taxRatePct]);

  // Real Net Pocket Profit = Gross Sales Profit - Operating Expenses - CPU & CNSS Obligations
  const pocketProfitSummary = useMemo(() => {
    const grossProfit = orders
      .filter((o) => o.status === 'completed')
      .reduce((s, o) => s + (o.profitTotal || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalCpuObligations = cpuRecords.reduce((s, r) => s + (r.totalDue || 0), 0);
    const paidCpuObligations = cpuRecords
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + (r.totalDue || 0), 0);
    const unpaidCpuObligations = Math.max(0, totalCpuObligations - paidCpuObligations);
    const annualPatente = Math.max(0, Number(cpuSettings.annualPatenteTax) || 0);
    const netPocketProfit = grossProfit - totalExpenses - totalCpuObligations - annualPatente;

    return {
      grossProfit,
      totalExpenses,
      totalCpuObligations,
      paidCpuObligations,
      unpaidCpuObligations,
      annualPatente,
      netPocketProfit
    };
  }, [orders, expenses, cpuRecords, cpuSettings.annualPatenteTax]);

  // Recharts dataset
  const chartData = useMemo(() => {
    return sortedRecordsAsc.map((r) => ({
      period: `${r.year} ${r.quarter}`,
      turnover: r.turnover,
      tax: r.calculatedTax,
      amo: r.quarterlyAmo,
      retirement: r.retirementEnabled ? r.quarterlyRetirement : 0,
      paidTotal: r.status === 'paid' ? r.totalDue : 0,
      dueTotal: r.totalDue
    }));
  }, [sortedRecordsAsc]);

  // Dedicated Tax & Social Contributions (AMO + Retirement) Chart Dataset
  const taxContribChartData = useMemo(() => {
    const filtered =
      taxContribScope === 'paid'
        ? sortedRecordsAsc.filter((r) => r.status === 'paid')
        : sortedRecordsAsc;

    return filtered.map((r) => {
      const ret = r.retirementEnabled ? r.quarterlyRetirement : 0;
      const subscriptions = Number((r.quarterlyAmo + ret).toFixed(2));
      return {
        period: `${r.year} ${r.quarter}`,
        tax: Number(r.calculatedTax.toFixed(2)),
        amo: Number(r.quarterlyAmo.toFixed(2)),
        retirement: Number(ret.toFixed(2)),
        subscriptions,
        totalDue: Number(r.totalDue.toFixed(2)),
        status: r.status
      };
    });
  }, [sortedRecordsAsc, taxContribScope]);

  const taxContribDistribution = useMemo(() => {
    const totalTax = Number(
      taxContribChartData.reduce((sum, item) => sum + item.tax, 0).toFixed(2)
    );
    const totalAmo = Number(
      taxContribChartData.reduce((sum, item) => sum + item.amo, 0).toFixed(2)
    );
    const totalRet = Number(
      taxContribChartData.reduce((sum, item) => sum + item.retirement, 0).toFixed(2)
    );
    const totalSubscriptions = Number((totalAmo + totalRet).toFixed(2));
    const grandTotal = Number((totalTax + totalSubscriptions).toFixed(2));

    const slices = [
      {
        id: 'tax',
        name: isAr ? 'الضريبة CPU' : 'CPU Tax',
        value: totalTax,
        color: '#2563eb'
      },
      {
        id: 'amo',
        name: isAr ? 'اشتراك الصحة AMO' : 'AMO Health',
        value: totalAmo,
        color: '#f59e0b'
      },
      {
        id: 'retirement',
        name: isAr ? 'اشتراك التقاعد CNSS' : 'CNSS Retirement',
        value: totalRet,
        color: '#7c3aed'
      }
    ].filter((s) => s.value > 0);

    return {
      totalTax,
      totalAmo,
      totalRet,
      totalSubscriptions,
      grandTotal,
      slices
    };
  }, [taxContribChartData, isAr]);

  // Normalize simulated input to quarterly turnover regardless of chosen horizon
  const effectiveSimQuarterlyTurnover = useMemo(() => {
    const raw = Math.max(0, Number(simTurnover) || 0);
    if (simInputPeriod === 'monthly') return Number((raw * 3).toFixed(2));
    if (simInputPeriod === 'annual') return Number((raw / 4).toFixed(2));
    if (simInputPeriod === 'annual_cpu') {
      const factor =
        (Math.max(0, cpuSettings.professionCoeffPct) / 100) *
        (Math.max(0, cpuSettings.taxRatePct) / 100);
      return factor > 0 ? Number((raw / (4 * factor)).toFixed(2)) : 0;
    }
    return raw;
  }, [simTurnover, simInputPeriod, cpuSettings.professionCoeffPct, cpuSettings.taxRatePct]);

  // Simulator calculations & comparisons
  const simCalc = useMemo(
    () =>
      simInputPeriod === 'annual_cpu'
        ? calculateCpuBreakdownByAnnualTax(simTurnover, cpuSettings, simRetirementOn)
        : calculateCpuBreakdown(effectiveSimQuarterlyTurnover, cpuSettings, simRetirementOn),
    [simInputPeriod, simTurnover, effectiveSimQuarterlyTurnover, cpuSettings, simRetirementOn]
  );

  const simCalcNoRet = useMemo(
    () =>
      simInputPeriod === 'annual_cpu'
        ? calculateCpuBreakdownByAnnualTax(simTurnover, cpuSettings, false)
        : calculateCpuBreakdown(effectiveSimQuarterlyTurnover, cpuSettings, false),
    [simInputPeriod, simTurnover, effectiveSimQuarterlyTurnover, cpuSettings]
  );

  const simCalcWithRet = useMemo(
    () =>
      simInputPeriod === 'annual_cpu'
        ? calculateCpuBreakdownByAnnualTax(simTurnover, cpuSettings, true)
        : calculateCpuBreakdown(effectiveSimQuarterlyTurnover, cpuSettings, true),
    [simInputPeriod, simTurnover, effectiveSimQuarterlyTurnover, cpuSettings]
  );

  // Next CNSS bracket threshold intelligence
  const nextBracketInfo = useMemo(() => {
    const sorted = [...cpuSettings.cnssBrackets].sort((a, b) => a.minAnnualTax - b.minAnnualTax);
    const curIdx = sorted.findIndex((b) => b.id === simCalc.matchedBracket.id);
    const nextB = curIdx >= 0 && curIdx < sorted.length - 1 ? sorted[curIdx + 1] : null;
    if (!nextB) return null;

    const annualTaxGap = Math.max(0, nextB.minAnnualTax - simCalc.annualizedTax);
    const coeffFactor =
      (Math.max(0, cpuSettings.professionCoeffPct) / 100) *
      (Math.max(0, cpuSettings.taxRatePct) / 100);
    const quarterlyTurnoverGap =
      coeffFactor > 0 ? Number((annualTaxGap / (4 * coeffFactor)).toFixed(0)) : 0;

    const deltaMonthlyAmo = Number((nextB.monthlyAmo - simCalc.monthlyAmo).toFixed(2));
    const deltaQuarterlyTotal = Number(
      (deltaMonthlyAmo * 3 * (simRetirementOn ? 1 + cpuSettings.retirementCoeff : 1)).toFixed(2)
    );

    return {
      bracket: nextB,
      annualTaxGap: Number(annualTaxGap.toFixed(2)),
      quarterlyTurnoverGap,
      deltaMonthlyAmo,
      deltaQuarterlyTotal
    };
  }, [cpuSettings, simCalc, simRetirementOn]);

  const simulatorBracketCurve = useMemo(() => {
    return cpuSettings.cnssBrackets.map((b) => {
      const amoQ = Number((b.monthlyAmo * 3).toFixed(2));
      const retQ = simRetirementOn
        ? Number((b.monthlyAmo * cpuSettings.retirementCoeff * 3).toFixed(2))
        : 0;
      return {
        id: b.id,
        name: b.label.split('(')[0].trim(),
        amoQ,
        retQ,
        isCurrent: b.id === simCalc.matchedBracket.id
      };
    });
  }, [cpuSettings.cnssBrackets, cpuSettings.retirementCoeff, simRetirementOn, simCalc.matchedBracket.id]);

  // Sensitivity curve across realistic future turnover scenarios
  const simSensitivityCurve = useMemo(() => {
    const basePoints = [10000, 20000, 40000, 75000, 120000, 200000, 350000, 600000];
    const pointsSet = new Set<number>(basePoints);
    if (effectiveSimQuarterlyTurnover > 0) {
      pointsSet.add(Math.round(effectiveSimQuarterlyTurnover));
    }
    const sortedPoints = Array.from(pointsSet).sort((a, b) => a - b);
    return sortedPoints.map((t) => {
      const c = calculateCpuBreakdown(t, cpuSettings, simRetirementOn);
      return {
        turnoverLabel: t >= 1000 ? `${Math.round(t / 1000)}k` : String(t),
        turnover: t,
        tax: c.quarterlyTax,
        amo: c.quarterlyAmo,
        retirement: c.quarterlyRetirement,
        totalDue: c.totalQuarterlyDue,
        isSimulated: Math.abs(t - Math.round(effectiveSimQuarterlyTurnover)) < 1
      };
    });
  }, [effectiveSimQuarterlyTurnover, cpuSettings, simRetirementOn]);

  const handleApplySimulationToDeclaration = () => {
    setFormTurnover(effectiveSimQuarterlyTurnover.toFixed(2));
    setFormRetirementEnabled(simRetirementOn);
    setSubTab('overview');
    if (settings.enableSoundEffects) playSound('success');
    showToast(
      isAr
        ? `✅ تم نقل رقم المعاملات المحاكى (${effectiveSimQuarterlyTurnover.toLocaleString('en-US')} ${currencySymbol}) إلى نموذج التصريح!`
        : `Applied simulated turnover (${effectiveSimQuarterlyTurnover.toLocaleString('en-US')}) to form!`
    );
  };

  const handleImportPosSalesForQuarter = () => {
    const { start, end } = getQuarterDateRange(formYear, formQuarter);
    const startMs = new Date(start + 'T00:00:00').getTime();
    const endMs = new Date(end + 'T23:59:59').getTime();

    const revenueSum = orders
      .filter((o) => {
        if (o.status !== 'completed') return false;
        const ms = new Date(o.date).getTime();
        return ms >= startMs && ms <= endMs;
      })
      .reduce((sum, o) => sum + (o.grandTotal || 0), 0);

    setFormTurnover(revenueSum.toFixed(2));
    if (settings.enableSoundEffects) playSound('beep');
    showToast(
      isAr
        ? `تم استيراد رقم المعاملات من مبيعات التطبيق (${start} ← ${end}): ${revenueSum.toFixed(2)} ${currencySymbol}`
        : `Imported POS sales for ${formYear}-${formQuarter}: ${revenueSum.toFixed(2)} ${currencySymbol}`
    );
  };

  const handleSaveQuarterTurnover = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Math.max(0, parseFloat(formTurnover) || 0);
    const saved = upsertCpuQuarterTurnover(
      formYear,
      formQuarter,
      val,
      formRetirementEnabled,
      formNotes.trim() || undefined
    );
    showToast(
      isAr
        ? `✅ تم حساب وحفظ ${saved.year}-${saved.quarter}: المجموع الكلي ${saved.totalDue.toFixed(2)} ${currencySymbol}`
        : `Saved ${saved.year}-${saved.quarter}: Total ${saved.totalDue.toFixed(2)} ${currencySymbol}`
    );
  };

  const handleToggleRowSelection = (id: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDownloadCpuPdf = () => {
    const targetRecords =
      selectedRecordIds.length > 0
        ? sortedRecordsAsc.filter((r) => selectedRecordIds.includes(r.id))
        : sortedRecordsAsc;

    const res = generateAndDownloadCpuTaxPdf({
      records: targetRecords,
      cpuSettings,
      retirementSummary: retirementProgress,
      settings,
      currencySymbol,
      language,
      titleSuffix:
        selectedRecordIds.length > 0
          ? isAr
            ? `${targetRecords.length} تريمستر محدد`
            : `${targetRecords.length} selected`
          : isAr
          ? 'كامل التريمسترات'
          : 'All Quarters'
    });
    if (settings.enableSoundEffects) playSound('success');
    showToast(isAr ? `📄 تم تحميل تقرير PDF: ${res.filename}` : `Downloaded PDF: ${res.filename}`);
  };

  const handleGlobalRetirementToggle = () => {
    const next = !formRetirementEnabled;
    setFormRetirementEnabled(next);
    setSimRetirementOn(next);
    updateCpuSettings({ retirementEnabled: next });
    showToast(
      next
        ? isAr
          ? '✅ تم تفعيل احتساب بريم التقاعد (CNSS × 1.57) في المجموع'
          : 'Retirement calculation enabled'
        : isAr
        ? '⏸️ تم إيقاف بريم التقاعد — لن يُحسب في المجموع الكلي'
        : 'Retirement calculation disabled'
    );
  };

  // Settings Tab Handlers
  const handleSaveCpuSettingsTab = (e: React.FormEvent) => {
    e.preventDefault();
    updateCpuSettings({
      taxRatePct: Math.max(0, parseFloat(draftTaxRate) || 10),
      professionCoeffPct: Math.max(0, parseFloat(draftProfCoeff) || 6),
      retirementCoeff: Math.max(0, parseFloat(draftRetCoeff) || 1.57),
      alertDaysBeforeDue: Math.max(1, parseInt(draftAlertDays, 10) || 7),
      priorAccumulatedDays: Math.max(0, parseInt(draftPriorDays, 10) || 0),
      annualPatenteTax: Math.max(0, parseFloat(draftAnnualPatente) || 0),
      retirementEnabled: draftRetDefault,
      cnssBrackets: draftBrackets
    });
    setFormRetirementEnabled(draftRetDefault);
    setSimRetirementOn(draftRetDefault);
    showToast(isAr ? '✅ تم حفظ إعدادات ضرائبي CPU وجدول CNSS والرسم المهني بنجاح' : 'CPU & Patente settings saved');
  };

  const handleUpdateBracketField = (
    idx: number,
    field: keyof CpuCnssBracket,
    value: string
  ) => {
    setDraftBrackets((prev) =>
      prev.map((b, i) => {
        if (i !== idx) return b;
        if (field === 'label') return { ...b, label: value };
        if (field === 'maxAnnualTax') {
          return { ...b, maxAnnualTax: value === '' ? null : Math.max(0, parseFloat(value) || 0) };
        }
        return { ...b, [field]: Math.max(0, parseFloat(value) || 0) };
      })
    );
  };

  const handleAddBracket = () => {
    const last = draftBrackets[draftBrackets.length - 1];
    const nextMin = last ? (last.maxAnnualTax ?? last.minAnnualTax + 10000) + 0.01 : 0;
    setDraftBrackets((prev) => [
      ...prev,
      {
        id: `cnss-${Date.now()}`,
        label: isAr ? `الشريحة ${prev.length + 1}` : `Bracket ${prev.length + 1}`,
        minAnnualTax: Number(nextMin.toFixed(2)),
        maxAnnualTax: null,
        monthlyAmo: last ? last.monthlyAmo + 200 : 100
      }
    ]);
  };

  const handleResetDefaultBrackets = () => {
    setDraftTaxRate('10');
    setDraftProfCoeff('6');
    setDraftRetCoeff('1.57');
    setDraftAlertDays('7');
    setDraftAnnualPatente('0');
    setDraftBrackets(DEFAULT_CNSS_BRACKETS.map((b) => ({ ...b })));
    showToast(isAr ? 'تمت استعادة الجدول والمعاملات الافتراضية (اضغط حفظ للتأكيد)' : 'Restored defaults');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-600" />
            <span>{isAr ? 'ضرائبي CPU — المساهمة المهنية الموحدة و CNSS' : 'CPU Tax, AMO & CNSS Retirement'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? `AMO كيتحسب على مبلغ الضريبة CPU السنوية (ماشي رقم المعاملات) · التقاعد = AMO × ${cpuSettings.retirementCoeff} · التريمستر = CPU + (AMO × 3) + (التقاعد × 3)`
              : `AMO is calculated from Annual CPU Tax (not turnover) · Retirement = AMO × ${cpuSettings.retirementCoeff} · Total = CPU + AMO×3 + Ret×3`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Global Retirement Toggle */}
          <button
            type="button"
            onClick={handleGlobalRetirementToggle}
            className={`px-3.5 py-2 rounded-xl text-xs font-black border flex items-center gap-2 transition-colors ${
              formRetirementEnabled
                ? 'bg-violet-50 dark:bg-violet-950/50 border-violet-300 dark:border-violet-800 text-violet-800 dark:text-violet-300'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>
              {isAr
                ? formRetirementEnabled
                  ? 'التقاعد: مفعّل (×' + cpuSettings.retirementCoeff + ')'
                  : 'التقاعد: متوقف (لا يُحسب)'
                : formRetirementEnabled
                ? 'Retirement: ON'
                : 'Retirement: OFF'}
            </span>
          </button>

          {/* PDF Export Button */}
          <button
            type="button"
            onClick={handleDownloadCpuPdf}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-sm transition-colors"
          >
            <Download className="w-4 h-4 text-emerald-400 dark:text-white" />
            <span>
              {isAr ? 'تحميل التقرير PDF' : 'Download PDF Report'}
              {selectedRecordIds.length > 0 ? ` (${selectedRecordIds.length})` : ''}
            </span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {toast && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs font-bold border flex items-center gap-2.5 shadow-sm ${
            toast.warn
              ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
              : toast.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
          }`}
        >
          {toast.warn ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          ) : toast.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* 7-Day Upcoming / Overdue Payment Alert Banner */}
      {cpuAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 animate-pulse">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-black text-amber-950 dark:text-amber-200">
                {isAr
                  ? `تنبيه موعد دفع CPU (${cpuSettings.alertDaysBeforeDue} أيام قبل الأجل أو متأخر)`
                  : `CPU Payment Alert (${cpuSettings.alertDaysBeforeDue}d reminder)`}
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 space-y-0.5">
                {cpuAlerts.map((a) => (
                  <div key={a.recordId} className="font-semibold">
                    {a.year} - {getQuarterLabel(a.quarter, language)} ·{' '}
                    <span className="font-mono font-black">
                      {a.totalDue.toFixed(2)} {currencySymbol}
                    </span>{' '}
                    ·{' '}
                    <span className={a.isOverdue ? 'text-rose-700 dark:text-rose-300 font-black' : 'font-bold'}>
                      {a.isOverdue
                        ? isAr
                          ? `متأخر بـ ${Math.abs(a.daysLeft)} يوم (الاستحقاق: ${a.dueDate})`
                          : `Overdue by ${Math.abs(a.daysLeft)}d`
                        : a.daysLeft === 0
                        ? isAr
                          ? 'آخر يوم للدفع اليوم!'
                          : 'Due today!'
                        : isAr
                        ? `باقي ${a.daysLeft} يوم للدفع (${a.dueDate})`
                        : `${a.daysLeft} days left (${a.dueDate})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => markCpuQuarterPaid(cpuAlerts[0].recordId, true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isAr ? `لقد دفعت (${cpuAlerts[0].year}-${cpuAlerts[0].quarter})` : 'Mark as Paid'}</span>
          </button>
        </div>
      )}

      {/* Top 4 Organized Icon-Badged Formula Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: CPU Tax */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 shadow-2xs flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-300">
              <span>{isAr ? 'الضريبة CPU (للتريمستر)' : 'CPU Tax (Quarterly)'}</span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
              {activePreviewCalc.quarterlyTax.toFixed(2)}{' '}
              <span className="text-xs font-bold text-blue-600">{currencySymbol}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
              {isAr
                ? `CPU السنوية (أساس الشطر): ${activePreviewCalc.annualizedTax.toFixed(2)} ${currencySymbol}`
                : `Annual CPU (base): ${activePreviewCalc.annualizedTax.toFixed(2)} ${currencySymbol}`}
            </div>
          </div>
        </div>

        {/* Card 2: Auto Health AMO */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-2xs flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-300">
              <span>{isAr ? 'الصحة AMO (×3 أشهر)' : 'AMO Health (Quarterly)'}</span>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
              {activePreviewCalc.quarterlyAmo.toFixed(2)}{' '}
              <span className="text-xs font-bold text-amber-600">{currencySymbol}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                {activePreviewCalc.monthlyAmo.toFixed(0)} {currencySymbol}/{isAr ? 'شهر' : 'mo'} × 3
              </span>{' '}
              · {projectionAndThresholdAnalysis.activeRow?.shortName || activePreviewCalc.matchedBracket.label.split('(')[0].trim()}
            </div>
          </div>
        </div>

        {/* Card 3: Auto CNSS Retirement (with ON/OFF toggle) */}
        <div
          className={`p-4 rounded-2xl border shadow-2xs transition-colors flex items-start gap-3 ${
            formRetirementEnabled
              ? 'bg-white dark:bg-slate-900 border-violet-200 dark:border-violet-900/60'
              : 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-950/70 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1 text-xs font-bold text-violet-700 dark:text-violet-300">
              <span className="truncate">{isAr ? `التقاعد (×${cpuSettings.retirementCoeff})` : 'CNSS Retirement'}</span>
              <button
                type="button"
                onClick={handleGlobalRetirementToggle}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-black border shrink-0 ${
                  formRetirementEnabled
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
                }`}
              >
                {formRetirementEnabled ? (isAr ? 'مفعّل ✓' : 'ON') : isAr ? 'متوقف' : 'OFF'}
              </button>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
              {activePreviewCalc.quarterlyRetirement.toFixed(2)}{' '}
              <span className="text-xs font-bold text-violet-600">{currencySymbol}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
              {formRetirementEnabled
                ? `${activePreviewCalc.monthlyRetirement.toFixed(2)} ${currencySymbol}/${isAr ? 'شهر' : 'mo'} × 3`
                : isAr
                ? 'متوقف — غير محسوب في المجموع'
                : 'Excluded from total'}
            </div>
          </div>
        </div>

        {/* Card 4: Grand Total Due (+ Optional Patente Share) */}
        <div className="p-4 rounded-2xl bg-emerald-600 text-white shadow-sm flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-100">
              <span>{isAr ? 'المجموع (CPU + AMO + التقاعد)' : 'Total (CPU + AMO + Ret)'}</span>
            </div>
            <div className="text-2xl font-black mt-1 font-mono tabular-nums">
              {activePreviewCalc.totalQuarterlyDue.toFixed(2)}{' '}
              <span className="text-xs font-bold text-emerald-100">{currencySymbol}</span>
            </div>
            <div className="text-[11px] text-emerald-100 mt-1 font-mono tabular-nums">
              {activePreviewCalc.annualPatenteTax > 0
                ? isAr
                  ? `مع الباتنتا (÷4): ${activePreviewCalc.combinedQuarterlyWithPatente.toFixed(2)} ${currencySymbol}`
                  : `With Patente: ${activePreviewCalc.combinedQuarterlyWithPatente.toFixed(2)} ${currencySymbol}`
                : `${isAr ? 'المعادل الشهري:' : 'Monthly eq.:'} ${activePreviewCalc.totalMonthlyEquivalent.toFixed(2)} ${currencySymbol}`}
            </div>
          </div>
        </div>
      </div>

      {/* Annual Turnover Current vs POS 30-Day Daily Average Annual Projection Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500">
                {isAr ? 'رقم الأعمال الحالي (المعدّل السنوي)' : 'Current Annualized Turnover'}
              </div>
              <div className="text-base font-black font-mono text-slate-900 dark:text-white tabular-nums">
                {projectionAndThresholdAnalysis.currentAnnualTurnover.toLocaleString('en-US')} {currencySymbol}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-700 dark:text-slate-300">
            {projectionAndThresholdAnalysis.activeRow?.shortName}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-sky-700 dark:text-sky-300">
                {isAr
                  ? `التوقع السنوي (${projectionAndThresholdAnalysis.effectiveDailyAvg.toFixed(0)} ${currencySymbol}/يوم × 365)`
                  : `Annual Projection (${projectionAndThresholdAnalysis.effectiveDailyAvg.toFixed(0)}/day × 365)`}
              </div>
              <div className="text-base font-black font-mono text-slate-900 dark:text-white tabular-nums">
                {projectionAndThresholdAnalysis.projectedAnnualTurnover.toLocaleString('en-US', {
                  maximumFractionDigits: 0
                })}{' '}
                {currencySymbol}
              </div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-lg text-[10px] font-black font-mono ${
              projectionAndThresholdAnalysis.growthRatePct >= 0
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
            }`}
          >
            {projectionAndThresholdAnalysis.growthRatePct >= 0 ? '+' : ''}
            {projectionAndThresholdAnalysis.growthRatePct}%
          </span>
        </div>

        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
            projectionAndThresholdAnalysis.riskZone === 'danger'
              ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
              : projectionAndThresholdAnalysis.riskZone === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'
              : 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                projectionAndThresholdAnalysis.riskZone === 'danger'
                  ? 'bg-rose-600 text-white'
                  : projectionAndThresholdAnalysis.riskZone === 'warning'
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {isAr
                  ? `العتبة القصوى (${projectionAndThresholdAnalysis.limitCaCeiling.toLocaleString('en-US')})`
                  : `Max Ceiling (${projectionAndThresholdAnalysis.limitCaCeiling.toLocaleString('en-US')})`}
              </div>
              <div className="text-xs font-black text-slate-900 dark:text-white mt-0.5">
                {projectionAndThresholdAnalysis.riskZone === 'danger'
                  ? isAr
                    ? '⛔ خطر عالي - تجاوز / قرب العتبة القصوى'
                    : '⛔ High Risk — Ceiling Reached'
                  : projectionAndThresholdAnalysis.riskZone === 'warning'
                  ? isAr
                    ? '⚠️ خطر متوسط - قربتي للعتبة'
                    : '⚠️ Warning — Approaching Limit'
                  : projectionAndThresholdAnalysis.riskZone === 'moderate'
                  ? isAr
                    ? '✅ خطر منخفض - نمو مزيان'
                    : '✅ Low Risk — Healthy Growth'
                  : isAr
                  ? '✅ آمن 100% - بعيد عن العتبة'
                  : '✅ 100% Safe'}
              </div>
            </div>
          </div>
          <span className="font-mono text-sm font-black text-slate-900 dark:text-white tabular-nums">
            {projectionAndThresholdAnalysis.projectedThresholdRiskPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit">
        {(
          [
            {
              id: 'overview',
              label: isAr ? 'التصريح والجدول والرسوم البيانية' : 'Trimesters & Charts',
              icon: TrendingUp
            },
            {
              id: 'simulator',
              label: isAr ? 'محاكاة رقم المعاملات المتوقع' : 'Turnover Simulator',
              icon: Sparkles
            },
            {
              id: 'retirement',
              label: isAr ? 'جدول وبرامج التقاعد (1320 / 3240 يوم)' : 'Retirement Schedule (1320 / 3240d)',
              icon: Award
            },
            {
              id: 'settings',
              label: isAr ? 'إعدادات CPU وجدول CNSS' : 'CPU & CNSS Settings',
              icon: SlidersHorizontal
            }
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                active
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: OVERVIEW (TURNOVER INPUT + RECHARTS + TRIMESTERS TABLE) */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          {/* Input Turnover Card + Recharts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Form: User only enters quarterly turnover */}
            <form
              onSubmit={handleSaveQuarterTurnover}
              className="lg:col-span-4 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'إدخال رقم المعاملات في التريمستر' : 'Enter Quarterly Turnover'}</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'السنة' : 'Year'}
                  </label>
                  <select
                    value={formYear}
                    onChange={(e) => setFormYear(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {[currentYear - 1, currentYear, currentYear + 1, 2026].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'التريمستر' : 'Quarter'}
                  </label>
                  <select
                    value={formQuarter}
                    onChange={(e) => setFormQuarter(e.target.value as CpuQuarterId)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="Q1">{getQuarterLabel('Q1', language)}</option>
                    <option value="Q2">{getQuarterLabel('Q2', language)}</option>
                    <option value="Q3">{getQuarterLabel('Q3', language)}</option>
                    <option value="Q4">{getQuarterLabel('Q4', language)}</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setFormInputScope('quarterly')}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        formInputScope === 'quarterly'
                          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {isAr ? 'تريمستر' : 'Quarterly'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormInputScope('annual')}
                      className={`px-2 py-1 rounded-md transition-colors ${
                        formInputScope === 'annual'
                          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {isAr ? 'رقم الأعمال السنوي (÷4)' : 'Annual (÷4)'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleImportPosSalesForQuarter}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <ArrowDownToLine className="w-3 h-3" />
                    <span>{isAr ? 'استيراد المبيعات' : 'Import POS'}</span>
                  </button>
                </div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {formInputScope === 'annual'
                    ? isAr
                      ? `رقم الأعمال السنوي (${currencySymbol}) *`
                      : `Annual Turnover (${currencySymbol}) *`
                    : isAr
                    ? `رقم المعاملات في التريمستر (${currencySymbol}) *`
                    : `Quarterly Turnover (${currencySymbol}) *`}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={
                    formInputScope === 'annual'
                      ? String(Number(((parseFloat(formTurnover) || 0) * 4).toFixed(2)))
                      : formTurnover
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (formInputScope === 'annual') {
                      const num = Math.max(0, parseFloat(val) || 0);
                      setFormTurnover(String(Number((num / 4).toFixed(2))));
                    } else {
                      setFormTurnover(val);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-base font-mono font-black bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-xl tabular-nums"
                />
                {formInputScope === 'annual' && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono mt-1">
                    {isAr ? 'حصة التريمستر (÷4):' : 'Quarterly share (÷4):'}{' '}
                    {activePreviewCalc.turnover.toLocaleString('en-US')} {currencySymbol}
                  </div>
                )}
              </div>

              {/* Optional Retirement Toggle */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {isAr ? 'احتساب بريم التقاعد (اختياري)' : 'Include CNSS Retirement'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {isAr
                      ? `التقاعد = AMO × ${cpuSettings.retirementCoeff} (يُضاف للمجموع عند التشغيل)`
                      : `Retirement = AMO × ${cpuSettings.retirementCoeff}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormRetirementEnabled((p) => !p)}
                  className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                    formRetirementEnabled ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      formRetirementEnabled ? 'translate-x-6.5 rtl:-translate-x-6.5' : 'translate-x-0.5 rtl:-translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder={isAr ? 'ملاحظة اختيارية لهذا التريمستر...' : 'Optional note...'}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />

              {/* Live Calculated Summary Strip */}
              <div className="p-3 rounded-2xl bg-slate-900 text-white space-y-1 text-xs">
                <div className="flex justify-between text-[11px] text-slate-400 pb-1 border-b border-slate-800">
                  <span>{isAr ? 'الضريبة CPU السنوية (أساس AMO):' : 'Annual CPU (AMO Base):'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {activePreviewCalc.annualizedTax.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">{isAr ? 'الضريبة CPU (للتريمستر):' : 'CPU Tax:'}</span>
                  <span className="font-mono font-bold text-sky-400">
                    {activePreviewCalc.quarterlyTax.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">
                    {isAr
                      ? `الصحة AMO (${activePreviewCalc.monthlyAmo.toFixed(0)} × 3 أشهر):`
                      : `AMO (${activePreviewCalc.monthlyAmo.toFixed(0)} × 3):`}
                  </span>
                  <span className="font-mono font-bold text-amber-400">
                    {activePreviewCalc.quarterlyAmo.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">
                    {isAr
                      ? `التقاعد (${activePreviewCalc.monthlyRetirement.toFixed(2)} × 3 أشهر):`
                      : 'Retire (3 mo):'}
                  </span>
                  <span className="font-mono font-bold text-violet-300">
                    {formRetirementEnabled
                      ? `${activePreviewCalc.quarterlyRetirement.toFixed(2)} ${currencySymbol}`
                      : isAr
                      ? '0.00 (متوقف)'
                      : '0.00 (OFF)'}
                  </span>
                </div>
                {activePreviewCalc.annualPatenteTax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-300">{isAr ? 'الرسم المهني - الباتنتا (÷4):' : 'Patente (Quarterly):'}</span>
                    <span className="font-mono font-bold text-rose-300">
                      {activePreviewCalc.quarterlyPatenteTax.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                )}
                <div className="pt-1.5 border-t border-slate-700 flex justify-between font-black text-sm">
                  <span>{isAr ? 'المجموع (CPU + AMO + التقاعد):' : 'Total (CPU + AMO + Ret):'}</span>
                  <span className="font-mono text-emerald-400">
                    {activePreviewCalc.totalQuarterlyDue.toFixed(2)} {currencySymbol}
                  </span>
                </div>
                {activePreviewCalc.annualPatenteTax > 0 && (
                  <div className="flex justify-between text-[11px] text-amber-300 font-bold">
                    <span>{isAr ? 'الإجمالي شاملاً حصة الباتنتا:' : 'Combined w/ Patente:'}</span>
                    <span className="font-mono">
                      {activePreviewCalc.combinedQuarterlyWithPatente.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>{isAr ? 'حفظ واحتساب التريمستر' : 'Save & Calculate Quarter'}</span>
              </button>
            </form>

            {/* Recharts Evolution Visualization */}
            <div className="lg:col-span-8 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>
                      {isAr
                        ? 'تطور رقم المعاملات والمبالغ الضريبية و CNSS عبر التريمسترات'
                        : 'Turnover & CPU/CNSS Payments Evolution Across Trimesters'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr
                      ? 'مقارنة رقم المعاملات مع الضريبة المدفوعة ومستحقات الصحة والتقاعد'
                      : 'Comparing turnover against tax, AMO & retirement contributions'}
                  </p>
                </div>
              </div>

              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} opacity={isDark ? 0.85 : 0.5} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: isDark ? '#34d399' : '#059669' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#ffffff',
                        fontSize: '12px'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar
                      yAxisId="left"
                      dataKey="turnover"
                      name={isAr ? 'رقم المعاملات' : 'Turnover'}
                      fill="#cbd5e1"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="tax"
                      name={isAr ? 'الضريبة CPU' : 'CPU Tax'}
                      fill="#2563eb"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="amo"
                      name={isAr ? 'الصحة AMO' : 'AMO'}
                      fill="#f59e0b"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="retirement"
                      name={isAr ? 'التقاعد CNSS' : 'Retirement'}
                      fill="#7c3aed"
                      radius={[6, 6, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="paidTotal"
                      name={isAr ? 'المدفوع فعلياً' : 'Paid Total'}
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Compact Quick Simulator Bar right below chart */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-emerald-950 dark:text-emerald-200">
                      {isAr ? 'محاكاة سريعة لرقم معاملات مستقبلي متوقع' : 'Quick Future Turnover Simulator'}
                    </div>
                    <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">
                      {isAr ? 'الضريبة:' : 'Tax:'} {simCalc.quarterlyTax.toFixed(0)} · AMO: {simCalc.quarterlyAmo.toFixed(0)} · {isAr ? 'التقاعد:' : 'Ret:'} {simCalc.quarterlyRetirement.toFixed(0)} →{' '}
                      <span className="font-black">
                        {simCalc.totalQuarterlyDue.toFixed(2)} {currencySymbol}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={simTurnover}
                    onChange={(e) => {
                      setSimInputPeriod('quarterly');
                      setSimTurnover(Math.max(0, Number(e.target.value) || 0));
                    }}
                    className="w-32 px-3 py-1.5 text-xs font-mono font-black bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl tabular-nums"
                    title={isAr ? 'أدخل رقم معاملات متوقع' : 'Expected turnover'}
                  />
                  <button
                    type="button"
                    onClick={() => setSubTab('simulator')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1 transition-colors"
                  >
                    <span>{isAr ? 'المحاكي التفصيلي' : 'Full Simulator'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive 6-Bracket Threshold Dashboard + Recharts Chart + Next-Month Analytical Table */}
          <div className="space-y-5">
            {/* Row A: 6-Bracket Dynamic Progress Dashboard + Interactive Position/Projection Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
              {/* Left: Dynamic 6-Bracket Progress Bars Dashboard */}
              <div className="xl:col-span-7 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-600" />
                      <span>
                        {isAr
                          ? 'لوحة الشطور الضريبية الستة — المسافة المتبقية وتأثير AMO والتقاعد'
                          : '6-Bracket Thresholds Dashboard (Remaining Distance & AMO/Retirement Impact)'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isAr
                        ? 'انقر على أي شطر لمقارنة الفارق الدقيق في AMO والتقاعد والمسافة المتبقية رقم أعمالاً وضريبةً'
                        : 'Click any bracket to inspect exact AMO/Retirement impact & remaining CA/CPU distance'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                    <span className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {isAr ? '● آمن / مكتمل' : '● Safe'}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {isAr ? '● اقتراب ≥70%' : '● ≥70%'}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      {isAr ? '● حرج ≥90%' : '● ≥90%'}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                      {isAr ? '│ التوقع السنوي' : '│ Projected'}
                    </span>
                  </div>
                </div>

                {/* 6 Interactive Bracket Rows with Color-Coded Progress Bars */}
                <div className="space-y-2.5">
                  {projectionAndThresholdAnalysis.bracketRows.map((row) => {
                    const isSelected =
                      (selectedDashboardBracketId ||
                        projectionAndThresholdAnalysis.nextRow?.bracket.id ||
                        projectionAndThresholdAnalysis.activeRow?.bracket.id) === row.bracket.id;

                    const barColor =
                      row.statusTone === 'critical'
                        ? 'bg-gradient-to-r from-rose-500 to-rose-600'
                        : row.statusTone === 'approaching'
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                        : row.statusTone === 'safe'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                        : row.statusTone === 'passed'
                        ? 'bg-emerald-600/75'
                        : 'bg-slate-400 dark:bg-slate-600';

                    const pctTextTone =
                      row.statusTone === 'critical'
                        ? 'text-rose-600 dark:text-rose-400'
                        : row.statusTone === 'approaching'
                        ? 'text-amber-600 dark:text-amber-400'
                        : row.statusTone === 'safe' || row.statusTone === 'passed'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500';

                    return (
                      <button
                        type="button"
                        key={row.bracket.id}
                        onClick={() => setSelectedDashboardBracketId(row.bracket.id)}
                        className={`w-full text-start p-3 rounded-2xl border transition-all ${
                          isSelected
                            ? 'bg-emerald-50/75 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-200/80 dark:ring-emerald-900/60 shadow-xs'
                            : row.isCurrentBracket
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700'
                            : row.isProjectedBracket
                            ? 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800 hover:border-sky-400'
                            : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-black text-slate-900 dark:text-white">
                              {row.shortName}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              (
                              {row.maxCa !== null
                                ? `${row.minCa.toLocaleString('en-US')} – ${row.maxCa.toLocaleString('en-US')} ${currencySymbol}`
                                : `> ${row.minCa.toLocaleString('en-US')} ${currencySymbol}`}
                              )
                            </span>
                            {row.isCurrentBracket && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
                                {isAr ? 'موقعك الحالي' : 'Current'}
                              </span>
                            )}
                            {row.isProjectedBracket && (
                              <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-black">
                                {isAr ? 'توقعك السنوي' : 'Projected'}
                              </span>
                            )}
                            {!row.isCurrentBracket && row.deltaMonthlyTotal !== 0 && (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black ${
                                  row.deltaMonthlyTotal > 0
                                    ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                                    : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                }`}
                              >
                                {row.deltaMonthlyTotal > 0 ? '+' : ''}
                                {row.deltaMonthlyTotal.toFixed(0)} {currencySymbol}/{isAr ? 'ش فرق' : 'mo Δ'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                              AMO: {row.monthlyAmo.toFixed(0)}/{isAr ? 'ش' : 'mo'}
                            </span>
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <span className="font-bold text-violet-700 dark:text-violet-300">
                              {isAr ? 'تقاعد:' : 'Ret:'} {row.monthlyRet.toFixed(2)}/{isAr ? 'ش' : 'mo'}
                            </span>
                            <span className={`font-black ${pctTextTone}`}>
                              {row.pctCurrent.toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar Track with Current Bar + Projected Marker */}
                        <div className="relative w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          {row.pctProjected > row.pctCurrent && (
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-sky-300/60 dark:bg-sky-700/45 transition-all duration-300"
                              style={{ width: `${row.pctProjected}%` }}
                            />
                          )}
                          <div
                            className={`relative h-full rounded-full transition-all duration-300 ${barColor}`}
                            style={{ width: `${row.pctCurrent}%` }}
                          />
                          {row.pctProjected > 0 && (
                            <div
                              className="absolute top-0 bottom-0 w-1 bg-sky-600 dark:bg-sky-400 shadow-xs"
                              style={{ left: `calc(${Math.min(99, row.pctProjected)}% - 2px)` }}
                              title={
                                isAr
                                  ? `التوقع السنوي: ${projectionAndThresholdAnalysis.projectedAnnualTurnover.toLocaleString('en-US')} ${currencySymbol}`
                                  : `Projected: ${projectionAndThresholdAnalysis.projectedAnnualTurnover}`
                              }
                            />
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-mono">
                          <span>
                            {row.maxCa !== null
                              ? row.isPassed
                                ? isAr
                                  ? 'تم تجاوز هذا الشطر (100%)'
                                  : 'Passed (100%)'
                                : isAr
                                ? `المتبقي للسقف: ${row.remainingCaToCeiling.toLocaleString('en-US')} ${currencySymbol} (${row.remainingCpuToCeiling.toFixed(0)} CPU${
                                    row.remainingDaysToCeiling !== null ? ` · ~${row.remainingDaysToCeiling} يوم` : ''
                                  })`
                                : `Left: ${row.remainingCaToCeiling.toLocaleString('en-US')} ${currencySymbol} (${row.remainingCpuToCeiling.toFixed(0)} CPU${
                                    row.remainingDaysToCeiling !== null ? ` · ~${row.remainingDaysToCeiling}d` : ''
                                  })`
                              : isAr
                              ? 'الشطر الأعلى (مفتوح فوق 1,666,665)'
                              : 'Top Bracket (> 1,666,665)'}
                          </span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {isAr ? 'التريمستر (AMO+تقاعد):' : 'Q (AMO+Ret):'}{' '}
                            {row.quarterlyTotalContrib.toFixed(2)} {currencySymbol}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Bracket Direct Impact Inspector */}
                {(() => {
                  const inspected =
                    projectionAndThresholdAnalysis.bracketRows.find(
                      (r) =>
                        r.bracket.id ===
                        (selectedDashboardBracketId ||
                          projectionAndThresholdAnalysis.nextRow?.bracket.id ||
                          projectionAndThresholdAnalysis.activeRow?.bracket.id)
                    ) || projectionAndThresholdAnalysis.activeRow;
                  if (!inspected) return null;

                  const targetAnnualCa =
                    inspected.maxCa !== null
                      ? inspected.minCa === 0
                        ? Math.round(inspected.maxCa * 0.6)
                        : Math.round((inspected.minCa + inspected.maxCa) / 2)
                      : Math.round(inspected.minCa * 1.15);

                  return (
                    <div className="p-3.5 rounded-2xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-800 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-black flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {isAr
                              ? `أثر ${inspected.shortName} المباشر على AMO والتقاعد`
                              : `${inspected.shortName} Direct AMO & Retirement Impact`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSimInputPeriod('annual');
                            setSimTurnover(targetAnnualCa);
                            setSubTab('simulator');
                            if (settings.enableSoundEffects) playSound('beep');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black inline-flex items-center gap-1 transition-colors"
                        >
                          <Calculator className="w-3 h-3" />
                          <span>{isAr ? 'محاكاة هذا الشطر' : 'Simulate Bracket'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          <div className="text-[10px] font-sans text-slate-400">
                            {isAr ? 'تأثير AMO (شهر / 3ش)' : 'AMO (Mo / 3Mo)'}
                          </div>
                          <div className="font-black text-amber-400 mt-0.5">
                            {inspected.monthlyAmo.toFixed(0)} / {inspected.quarterlyAmo.toFixed(0)} {currencySymbol}
                          </div>
                          <div className="text-[10px] text-slate-300">
                            {inspected.deltaMonthlyAmo === 0
                              ? isAr
                                ? 'نفس الشطر الحالي'
                                : 'Same as current'
                              : `${inspected.deltaMonthlyAmo > 0 ? '+' : ''}${inspected.deltaMonthlyAmo.toFixed(0)} ${currencySymbol}/${isAr ? 'ش' : 'mo'}`}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          <div className="text-[10px] font-sans text-slate-400">
                            {isAr ? 'تأثير التقاعد (شهر / 3ش)' : 'Ret (Mo / 3Mo)'}
                          </div>
                          <div className="font-black text-violet-300 mt-0.5">
                            {inspected.monthlyRet.toFixed(2)} / {inspected.quarterlyRet.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-300">
                            {inspected.deltaMonthlyRet === 0
                              ? isAr
                                ? 'نفس الشطر الحالي'
                                : 'Same as current'
                              : `${inspected.deltaMonthlyRet > 0 ? '+' : ''}${inspected.deltaMonthlyRet.toFixed(2)} ${currencySymbol}/${isAr ? 'ش' : 'mo'}`}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          <div className="text-[10px] font-sans text-slate-400">
                            {isAr ? 'فارق الالتزام الربع سنوي' : 'Quarterly Impact Δ'}
                          </div>
                          <div
                            className={`font-black mt-0.5 ${
                              inspected.deltaQuarterlyContrib > 0
                                ? 'text-rose-400'
                                : inspected.deltaQuarterlyContrib < 0
                                ? 'text-emerald-400'
                                : 'text-slate-200'
                            }`}
                          >
                            {inspected.deltaQuarterlyContrib > 0 ? '+' : ''}
                            {inspected.deltaQuarterlyContrib.toFixed(2)} {currencySymbol}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {isAr
                              ? `السنوي: ${inspected.deltaAnnualContrib > 0 ? '+' : ''}${inspected.deltaAnnualContrib.toFixed(0)} ${currencySymbol}`
                              : `Yr: ${inspected.deltaAnnualContrib.toFixed(0)}`}
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                          <div className="text-[10px] font-sans text-slate-400">
                            {isAr ? 'المسافة المتبقية' : 'Distance Left'}
                          </div>
                          <div className="font-black text-sky-300 mt-0.5">
                            {inspected.maxCa !== null
                              ? inspected.isPassed
                                ? isAr
                                  ? 'مُجتاز (100%)'
                                  : 'Passed'
                                : `${inspected.remainingCaToCeiling.toLocaleString('en-US')} ${currencySymbol}`
                              : isAr
                              ? 'مفتوح'
                              : 'Open'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {inspected.remainingDaysToCeiling !== null
                              ? isAr
                                ? `~${inspected.remainingDaysToCeiling} يوم عمل متبقي`
                                : `~${inspected.remainingDaysToCeiling}d at pace`
                              : isAr
                              ? `CPU: ${inspected.minCpuTax}–${inspected.maxCpuTax ?? '∞'}`
                              : `CPU: ${inspected.minCpuTax}–${inspected.maxCpuTax ?? '∞'}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Right: Interactive Recharts 6-Bracket Chart + Markers */}
              <div className="xl:col-span-5 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-600" />
                    <span>
                      {isAr
                        ? 'مخطط الشطور الستة وموقع التوقع السنوي'
                        : 'Interactive 6-Bracket Position & Projection Chart'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr
                      ? 'توزيع اشتراكات AMO والتقاعد الشهرية عبر الشطور الستة مع تحديد موقعك الحالي والمتوقع'
                      : 'Monthly AMO & retirement scale across all 6 brackets with current & projected markers'}
                  </p>
                </div>

                <div className="h-64 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={projectionAndThresholdAnalysis.chartRows}
                      margin={{ top: 14, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} opacity={isDark ? 0.85 : 0.5} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                      <YAxis tick={{ fontSize: 10, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const row = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono border border-slate-700">
                              <div className="font-sans font-bold text-slate-100">{row.fullLabel}</div>
                              <div className="text-amber-400">AMO: {row.amoMonthly} {currencySymbol}/{isAr ? 'ش' : 'mo'}</div>
                              <div className="text-violet-300">{isAr ? 'التقاعد:' : 'Ret:'} {row.retMonthly} {currencySymbol}/{isAr ? 'ش' : 'mo'}</div>
                              <div className="text-emerald-400 font-black pt-1 border-t border-slate-700">
                                {isAr ? 'المجموع الشهري:' : 'Total/mo:'} {row.totalMonthlyContrib} {currencySymbol}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      {projectionAndThresholdAnalysis.activeRow && (
                        <ReferenceLine
                          x={projectionAndThresholdAnalysis.activeRow.shortName}
                          stroke="#10b981"
                          strokeWidth={2.5}
                          strokeDasharray="4 4"
                          label={{
                            value: isAr ? 'الحالي' : 'Now',
                            position: 'top',
                            fill: '#10b981',
                            fontSize: 10,
                            fontWeight: 700
                          }}
                        />
                      )}
                      {(() => {
                        const projRow = projectionAndThresholdAnalysis.bracketRows.find(
                          (r) => r.isProjectedBracket
                        );
                        if (!projRow) return null;
                        return (
                          <ReferenceLine
                            x={projRow.shortName}
                            stroke="#0284c7"
                            strokeWidth={2}
                            strokeDasharray="2 2"
                            label={{
                              value: isAr ? 'التوقع' : 'Proj.',
                              position: 'insideTopRight',
                              fill: '#0284c7',
                              fontSize: 10,
                              fontWeight: 700
                            }}
                          />
                        );
                      })()}
                      <Bar dataKey="amoMonthly" stackId="cnss" name={isAr ? 'AMO / شهر' : 'AMO/mo'} radius={[0, 0, 0, 0]}>
                        {projectionAndThresholdAnalysis.chartRows.map((entry, i) => (
                          <Cell
                            key={`amo-cell-${i}`}
                            fill={entry.isCurrent ? '#d97706' : entry.isProjected ? '#0284c7' : '#f59e0b'}
                            opacity={entry.isCurrent || entry.isProjected ? 1 : 0.65}
                          />
                        ))}
                      </Bar>
                      <Bar dataKey="retMonthly" stackId="cnss" name={isAr ? 'التقاعد / شهر' : 'Ret/mo'} radius={[6, 6, 0, 0]}>
                        {projectionAndThresholdAnalysis.chartRows.map((entry, i) => (
                          <Cell
                            key={`ret-cell-${i}`}
                            fill={entry.isCurrent ? '#6d28d9' : entry.isProjected ? '#38bdf8' : '#8b5cf6'}
                            opacity={entry.isCurrent || entry.isProjected ? 1 : 0.65}
                          />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Comparison Summary Strip between Current & Annual Projection */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500">
                      {isAr ? 'الشطر الحالي' : 'Current Bracket'}
                    </div>
                    <div className="font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {projectionAndThresholdAnalysis.activeRow?.shortName} ·{' '}
                      {activePreviewCalc.monthlyAmo.toFixed(0)} {currencySymbol} AMO
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {isAr ? 'التقاعد:' : 'Ret:'} {activePreviewCalc.monthlyRetirement.toFixed(2)} {currencySymbol}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400">
                      {isAr ? 'شطر التوقع السنوي' : 'Projected Bracket'}
                    </div>
                    <div className="font-black text-sky-700 dark:text-sky-300 mt-0.5">
                      {projectionAndThresholdAnalysis.bracketRows.find((r) => r.isProjectedBracket)?.shortName} ·{' '}
                      {projectionAndThresholdAnalysis.projectedCalc.monthlyAmo.toFixed(0)} {currencySymbol} AMO
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {isAr ? 'التقاعد:' : 'Ret:'}{' '}
                      {projectionAndThresholdAnalysis.projectedCalc.monthlyRetirement.toFixed(2)} {currencySymbol}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row B: Analytical Forecast Table for Next Month based on Daily Growth Rate */}
            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-sky-600" />
                    <span>
                      {isAr
                        ? 'الجدول التحليلي لتوقعات الشهر القادم (حسب معدل النمو اليومي)'
                        : 'Next Month Analytical Forecast Table (By Daily Growth Rate)'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr
                      ? `متوسط المبيعات اليومي (آخر 30 يوم): ${projectionAndThresholdAnalysis.effectiveDailyAvg.toFixed(2)} ${currencySymbol}/يوم · معدل النمو: ${projectionAndThresholdAnalysis.growthRatePct >= 0 ? '+' : ''}${projectionAndThresholdAnalysis.growthRatePct}%`
                      : `Daily Avg (30d): ${projectionAndThresholdAnalysis.effectiveDailyAvg.toFixed(2)} ${currencySymbol}/d · Growth: ${projectionAndThresholdAnalysis.growthRatePct}%`}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-xs font-black text-sky-700 dark:text-sky-300 font-mono">
                  {isAr ? 'توقع الشهر القادم:' : 'Next Month:'}{' '}
                  {projectionAndThresholdAnalysis.nextMonthTurnover.toLocaleString('en-US')} {currencySymbol}
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-start border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'الفترة / المقارنة' : 'Period'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'رقم الأعمال الشهري' : 'Monthly CA'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الربح المفترض (6%)' : 'Assumed Profit'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الضريبة CPU (0.6%)' : 'CPU Tax'}</th>
                      <th className="py-2.5 px-3 text-center">{isAr ? 'الشطر المتوقع' : 'Bracket'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الصحة AMO / شهر' : 'AMO / mo'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'التقاعد / شهر' : 'Retire / mo'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'مجموع الالتزام الشهري' : 'Total Monthly'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    <tr>
                      <td className="py-2.5 px-3 font-sans font-bold text-slate-700 dark:text-slate-300">
                        {isAr ? 'الوتيرة الحالية (آخر 30 يوم)' : 'Current Pace (Last 30d)'}
                      </td>
                      <td className="py-2.5 px-3 text-end font-bold">
                        {projectionAndThresholdAnalysis.currentMonthTurnoverEst.toLocaleString('en-US')} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end text-emerald-700 dark:text-emerald-400">
                        {projectionAndThresholdAnalysis.currentMonthProfitEst.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end text-blue-600 font-bold">
                        {projectionAndThresholdAnalysis.currentMonthCpuTax.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans font-bold">
                        {projectionAndThresholdAnalysis.projectedCalc.matchedBracket.label.split('(')[0].trim()}
                      </td>
                      <td className="py-2.5 px-3 text-end text-amber-700 dark:text-amber-400 font-bold">
                        {projectionAndThresholdAnalysis.projectedCalc.monthlyAmo.toFixed(0)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end text-violet-700 dark:text-violet-300 font-bold">
                        {projectionAndThresholdAnalysis.projectedCalc.monthlyRetirement.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end font-black text-slate-900 dark:text-white">
                        {(
                          projectionAndThresholdAnalysis.currentMonthCpuTax +
                          projectionAndThresholdAnalysis.projectedCalc.monthlyAmo +
                          projectionAndThresholdAnalysis.projectedCalc.monthlyRetirement
                        ).toFixed(2)}{' '}
                        {currencySymbol}
                      </td>
                    </tr>

                    <tr className="bg-sky-50/60 dark:bg-sky-950/25 font-bold">
                      <td className="py-2.5 px-3 font-sans font-black text-sky-800 dark:text-sky-300">
                        {isAr ? 'توقع الشهر القادم (مع النمو)' : 'Next Month Forecast'}
                      </td>
                      <td className="py-2.5 px-3 text-end font-black text-slate-900 dark:text-white">
                        {projectionAndThresholdAnalysis.nextMonthTurnover.toLocaleString('en-US')} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end text-emerald-700 dark:text-emerald-400">
                        {projectionAndThresholdAnalysis.nextMonthProfitEst.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end text-blue-600 font-black">
                        {projectionAndThresholdAnalysis.nextMonthCpuTax.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-black">
                          {projectionAndThresholdAnalysis.nextMonthCalc.matchedBracket.label.split('(')[0].trim()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-end text-amber-700 dark:text-amber-400 font-black">
                        {projectionAndThresholdAnalysis.nextMonthCalc.monthlyAmo.toFixed(0)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end text-violet-700 dark:text-violet-300 font-black">
                        {projectionAndThresholdAnalysis.nextMonthCalc.monthlyRetirement.toFixed(2)} {currencySymbol}
                      </td>
                      <td className="py-2.5 px-3 text-end font-black text-sky-700 dark:text-sky-300">
                        {(
                          projectionAndThresholdAnalysis.nextMonthCpuTax +
                          projectionAndThresholdAnalysis.nextMonthCalc.monthlyAmo +
                          projectionAndThresholdAnalysis.nextMonthCalc.monthlyRetirement
                        ).toFixed(2)}{' '}
                        {currencySymbol}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Dedicated Tax & Contributions (الاشتراكات) Analytics Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Bar / Stacked / Area Comparison of Tax vs AMO vs CNSS Retirement */}
            <div className="lg:col-span-7 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs flex flex-col justify-between">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span>
                      {isAr
                        ? 'رسم بياني للضريبة والاشتراكات (CPU · AMO · التقاعد)'
                        : 'Tax & Social Contributions Chart (CPU · AMO · CNSS)'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr
                      ? 'مقارنة صافية بين مبلغ الضريبة CPU واشتراكات الصحة والتقاعد CNSS لكل تريمستر'
                      : 'Clear comparison between CPU tax, AMO health, and CNSS retirement per quarter'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Scope filter */}
                  <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setTaxContribScope('all')}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        taxContribScope === 'all'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {isAr ? 'الكل' : 'All'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaxContribScope('paid')}
                      className={`px-2.5 py-1 rounded-lg transition-colors ${
                        taxContribScope === 'paid'
                          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {isAr ? 'المدفوعة' : 'Paid'}
                    </button>
                  </div>

                  {/* Chart mode toggle */}
                  <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold">
                    {(
                      [
                        { id: 'stacked', label: isAr ? 'مكدس' : 'Stacked' },
                        { id: 'grouped', label: isAr ? 'متجاور' : 'Grouped' },
                        { id: 'area', label: isAr ? 'منحنى' : 'Trend' }
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setTaxContribChartMode(m.id)}
                        className={`px-2.5 py-1 rounded-lg transition-colors ${
                          taxContribChartMode === m.id
                            ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                            : 'text-slate-500'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3 Quick Comparison Summary Pills */}
              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60">
                  <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300">
                    {isAr ? 'إجمالي الضريبة CPU' : 'Total CPU Tax'}
                  </div>
                  <div className="font-mono font-black text-sm text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {taxContribDistribution.totalTax.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-2.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/60">
                  <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {isAr ? 'مجموع الاشتراكات (CNSS)' : 'Total Subscriptions'}
                  </div>
                  <div className="font-mono font-black text-sm text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {taxContribDistribution.totalSubscriptions.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div className="p-2.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/60">
                  <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    {isAr ? 'الإجمالي الكلي' : 'Grand Total'}
                  </div>
                  <div className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                    {taxContribDistribution.grandTotal.toFixed(2)} {currencySymbol}
                  </div>
                </div>
              </div>

              <div className="h-64 w-full" dir="ltr">
                {taxContribChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    {isAr ? 'لا توجد سجلات تريمستر مطابقة للتصفية الحالية' : 'No quarters matching current filter'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    {taxContribChartMode === 'area' ? (
                      <AreaChart data={taxContribChartData} margin={{ top: 10, right: 10, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} opacity={isDark ? 0.85 : 0.5} />
                        <XAxis dataKey="period" tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <YAxis tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono border border-slate-700">
                                <div className="font-bold text-slate-200 font-sans mb-1">{d.period}</div>
                                <div className="text-sky-400">{isAr ? 'الضريبة CPU:' : 'Tax:'} {d.tax.toFixed(2)} {currencySymbol}</div>
                                <div className="text-amber-400">{isAr ? 'اشتراك الصحة AMO:' : 'AMO:'} {d.amo.toFixed(2)} {currencySymbol}</div>
                                <div className="text-violet-300">{isAr ? 'اشتراك التقاعد:' : 'Retirement:'} {d.retirement.toFixed(2)} {currencySymbol}</div>
                                <div className="pt-1 border-t border-slate-700 text-emerald-400 font-black">
                                  {isAr ? 'المجموع:' : 'Total:'} {d.totalDue.toFixed(2)} {currencySymbol}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Area
                          type="monotone"
                          dataKey="tax"
                          stackId="due"
                          name={isAr ? 'الضريبة CPU' : 'CPU Tax'}
                          stroke="#2563eb"
                          fill="#2563eb"
                          fillOpacity={0.65}
                        />
                        <Area
                          type="monotone"
                          dataKey="amo"
                          stackId="due"
                          name={isAr ? 'اشتراك الصحة AMO' : 'AMO'}
                          stroke="#f59e0b"
                          fill="#f59e0b"
                          fillOpacity={0.65}
                        />
                        <Area
                          type="monotone"
                          dataKey="retirement"
                          stackId="due"
                          name={isAr ? 'اشتراك التقاعد CNSS' : 'Retirement'}
                          stroke="#7c3aed"
                          fill="#7c3aed"
                          fillOpacity={0.65}
                        />
                      </AreaChart>
                    ) : (
                      <BarChart data={taxContribChartData} margin={{ top: 10, right: 10, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} opacity={isDark ? 0.85 : 0.5} />
                        <XAxis dataKey="period" tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <YAxis tick={{ fontSize: 11, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono border border-slate-700">
                                <div className="font-bold text-slate-200 font-sans mb-1">{d.period}</div>
                                <div className="text-sky-400">{isAr ? 'الضريبة CPU:' : 'Tax:'} {d.tax.toFixed(2)} {currencySymbol}</div>
                                <div className="text-amber-400">{isAr ? 'اشتراك الصحة AMO:' : 'AMO:'} {d.amo.toFixed(2)} {currencySymbol}</div>
                                <div className="text-violet-300">{isAr ? 'اشتراك التقاعد:' : 'Retirement:'} {d.retirement.toFixed(2)} {currencySymbol}</div>
                                <div className="pt-1 border-t border-slate-700 text-emerald-400 font-black">
                                  {isAr ? 'المجموع:' : 'Total:'} {d.totalDue.toFixed(2)} {currencySymbol}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar
                          dataKey="tax"
                          stackId={taxContribChartMode === 'stacked' ? 'due' : undefined}
                          name={isAr ? 'الضريبة CPU' : 'CPU Tax'}
                          fill="#2563eb"
                          radius={taxContribChartMode === 'stacked' ? [0, 0, 0, 0] : [6, 6, 0, 0]}
                        />
                        <Bar
                          dataKey="amo"
                          stackId={taxContribChartMode === 'stacked' ? 'due' : undefined}
                          name={isAr ? 'اشتراك الصحة AMO' : 'AMO'}
                          fill="#f59e0b"
                          radius={taxContribChartMode === 'stacked' ? [0, 0, 0, 0] : [6, 6, 0, 0]}
                        />
                        <Bar
                          dataKey="retirement"
                          stackId={taxContribChartMode === 'stacked' ? 'due' : undefined}
                          name={isAr ? 'اشتراك التقاعد CNSS' : 'Retirement'}
                          fill="#7c3aed"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Donut PieChart Breakdown: Share of Tax vs Health AMO vs Retirement */}
            <div className="lg:col-span-5 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-violet-600" />
                  <span>
                    {isAr
                      ? 'توزيع الضريبة مقابل الاشتراكات'
                      : 'Tax vs Subscriptions Share'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr
                    ? 'حصة كل من الضريبة وبريم الصحة وبريم التقاعد من المجموع الكلي'
                    : 'Percentage share of CPU tax, AMO health & retirement'}
                </p>
              </div>

              <div className="relative h-52 w-full" dir="ltr">
                {taxContribDistribution.slices.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    {isAr ? 'لا توجد بيانات كافية للرسم الدائري' : 'No data available'}
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={taxContribDistribution.slices}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={56}
                          outerRadius={84}
                          paddingAngle={3}
                        >
                          {taxContribDistribution.slices.map((slice) => (
                            <Cell key={slice.id} fill={slice.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const entry = payload[0].payload;
                            const pct =
                              taxContribDistribution.grandTotal > 0
                                ? ((entry.value / taxContribDistribution.grandTotal) * 100).toFixed(1)
                                : '0';
                            return (
                              <div className="bg-slate-900 text-white px-3 py-2 rounded-xl shadow-xl text-xs font-mono border border-slate-700">
                                <div className="font-sans font-bold text-slate-200">{entry.name}</div>
                                <div className="font-black text-emerald-400 mt-0.5">
                                  {Number(entry.value).toFixed(2)} {currencySymbol} ({pct}%)
                                </div>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-slate-400">
                        {isAr ? 'الإجمالي' : 'Total'}
                      </span>
                      <span className="text-sm font-black font-mono text-slate-900 dark:text-white tabular-nums">
                        {taxContribDistribution.grandTotal.toFixed(0)}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600">{currencySymbol}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Breakdown Legend Bars */}
              <div className="space-y-2.5 text-xs">
                {[
                  {
                    id: 'tax',
                    label: isAr ? 'الضريبة المهنية CPU' : 'CPU Tax',
                    val: taxContribDistribution.totalTax,
                    barClass: 'bg-blue-600',
                    dotClass: 'bg-blue-600'
                  },
                  {
                    id: 'amo',
                    label: isAr ? 'اشتراك الصحة (AMO)' : 'AMO Health',
                    val: taxContribDistribution.totalAmo,
                    barClass: 'bg-amber-500',
                    dotClass: 'bg-amber-500'
                  },
                  {
                    id: 'ret',
                    label: isAr ? 'اشتراك التقاعد (CNSS)' : 'CNSS Retirement',
                    val: taxContribDistribution.totalRet,
                    barClass: 'bg-violet-600',
                    dotClass: 'bg-violet-600'
                  }
                ].map((row) => {
                  const pct =
                    taxContribDistribution.grandTotal > 0
                      ? (row.val / taxContribDistribution.grandTotal) * 100
                      : 0;
                  return (
                    <div key={row.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300">
                          <span className={`w-2.5 h-2.5 rounded-full ${row.dotClass}`} />
                          <span>{row.label}</span>
                        </div>
                        <span className="font-mono font-black text-slate-900 dark:text-white tabular-nums">
                          {row.val.toFixed(2)} {currencySymbol}{' '}
                          <span className="text-[10px] font-bold text-slate-400">({pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.barClass} transition-all duration-300`}
                          style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Channel Attribution (POS vs Remote) & Net Pocket Profit After Tax/CNSS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* POS vs Remote WhatsApp Sales Attribution */}
            <div className="lg:col-span-6 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs flex flex-col justify-between">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
                    <span>
                      {isAr
                        ? `تفصيل مبيعات التريمستر (${formYear} ${formQuarter}): حضوري مقابل عن بعد`
                        : `Quarter Channel Split (${formYear} ${formQuarter})`}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isAr
                      ? `من ${quarterChannelStats.start} إلى ${quarterChannelStats.end}`
                      : `${quarterChannelStats.start} → ${quarterChannelStats.end}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleImportPosSalesForQuarter}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1.5 shadow-2xs"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>{isAr ? 'استيراد المجموع للضريبة' : 'Import Total'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>{isAr ? 'نقطة البيع الحضورية (POS)' : 'In-Store POS'}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">{quarterChannelStats.posPct}%</span>
                  </div>
                  <div className="text-lg font-black font-mono text-slate-900 dark:text-white tabular-nums">
                    {quarterChannelStats.posRevenue.toFixed(2)} {currencySymbol}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between font-mono">
                    <span>{quarterChannelStats.posCount} {isAr ? 'فاتورة' : 'inv'}</span>
                    <span className="text-sky-600 dark:text-sky-400 font-bold">
                      CPU ≈ {quarterChannelStats.posTaxEst.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    <span>{isAr ? 'البيع عن بعد / واتساب' : 'Remote / WhatsApp'}</span>
                    <span className="font-mono">{quarterChannelStats.remotePct}%</span>
                  </div>
                  <div className="text-lg font-black font-mono text-emerald-800 dark:text-emerald-300 tabular-nums">
                    {quarterChannelStats.remoteRevenue.toFixed(2)} {currencySymbol}
                  </div>
                  <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 flex items-center justify-between font-mono">
                    <span>{quarterChannelStats.remoteCount} {isAr ? 'طلب' : 'orders'}</span>
                    <span className="text-sky-700 dark:text-sky-300 font-bold">
                      CPU ≈ {quarterChannelStats.remoteTaxEst.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  <div
                    className="h-full bg-slate-800 dark:bg-sky-500 transition-all duration-300"
                    style={{ width: `${quarterChannelStats.posPct}%` }}
                  />
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${quarterChannelStats.remotePct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 font-mono">
                  <span>{isAr ? 'المجموع الموحّد للتريمستر:' : 'Combined Quarter Total:'}</span>
                  <span className="text-slate-900 dark:text-white font-black">
                    {quarterChannelStats.total.toFixed(2)} {currencySymbol}
                  </span>
                </div>
              </div>
            </div>

            {/* Real Net Pocket Profit After Expenses + CPU + CNSS */}
            <div
              className={`lg:col-span-6 p-5 rounded-3xl border shadow-xs flex flex-col justify-between space-y-4 ${
                pocketProfitSummary.netPocketProfit >= 0
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/80'
                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-emerald-600" />
                    <span>{isAr ? 'صافي الربح الحقيقي في الجيب (بعد المصاريف والضرائب)' : 'Real Net Pocket Profit'}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isAr
                      ? 'الربح الإجمالي للمبيعات − مصاريف المحل − واجبات الضريبة CPU والصحة والتقاعد'
                      : 'Gross sales profit minus store expenses and CPU/AMO/CNSS obligations'}
                  </p>
                </div>
                <div
                  className={`text-2xl font-black font-mono tabular-nums ${
                    pocketProfitSummary.netPocketProfit >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {pocketProfitSummary.netPocketProfit >= 0 ? '+' : ''}
                  {pocketProfitSummary.netPocketProfit.toFixed(2)} {currencySymbol}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-[10px] font-bold text-slate-500">
                    {isAr ? '(+) أرباح المبيعات' : '(+) Gross Profit'}
                  </div>
                  <div className="font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                    +{pocketProfitSummary.grossProfit.toFixed(2)}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-[10px] font-bold text-slate-500">
                    {isAr ? '(-) مصاريف المحل' : '(-) Expenses'}
                  </div>
                  <div className="font-mono font-black text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">
                    -{pocketProfitSummary.totalExpenses.toFixed(2)}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-[10px] font-bold text-slate-500">
                    {isAr ? '(-) CPU + CNSS' : '(-) CPU + CNSS'}
                  </div>
                  <div className="font-mono font-black text-indigo-700 dark:text-indigo-400 mt-0.5 tabular-nums">
                    -{pocketProfitSummary.totalCpuObligations.toFixed(2)}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70">
                  <div className="text-[10px] font-bold text-slate-500">
                    {isAr ? '(-) الباتنتا السنوية' : '(-) Annual Patente'}
                  </div>
                  <div className="font-mono font-black text-amber-700 dark:text-amber-400 mt-0.5 tabular-nums">
                    -{pocketProfitSummary.annualPatente.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <span>
                  {isAr
                    ? `المدفوع من التزامات CPU/CNSS: ${pocketProfitSummary.paidCpuObligations.toFixed(2)} ${currencySymbol}`
                    : `Paid CPU/CNSS: ${pocketProfitSummary.paidCpuObligations.toFixed(2)} ${currencySymbol}`}
                </span>
                <span className="text-amber-700 dark:text-amber-300 font-mono">
                  {isAr
                    ? `متبقي للأداء: ${pocketProfitSummary.unpaidCpuObligations.toFixed(2)} ${currencySymbol}`
                    : `Pending: ${pocketProfitSummary.unpaidCpuObligations.toFixed(2)} ${currencySymbol}`}
                </span>
              </div>
            </div>
          </div>

          {/* Trimesters Table with PDF Checkbox Selection & "لقد دفعت" */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'سجل التريمسترات — الضريبة، الصحة AMO والتقاعد' : 'Quarterly CPU Tax & CNSS Records'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr
                    ? 'حدد التريمسترات المطلوبة لتحميل تقرير PDF مخصص، أو اضغط "لقد دفعت" لتسجيل الأداء وإضافة 90 يوم للتقاعد.'
                    : 'Select quarters for PDF export or click "I Paid" to log payment and earn 90 retirement days.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedRecordIds(
                      selectedRecordIds.length === sortedRecordsDesc.length
                        ? []
                        : sortedRecordsDesc.map((r) => r.id)
                    )
                  }
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {selectedRecordIds.length === sortedRecordsDesc.length
                    ? isAr
                      ? 'إلغاء تحديد الكل'
                      : 'Deselect All'
                    : isAr
                    ? 'تحديد الكل للتقرير'
                    : 'Select All'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCpuPdf}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {isAr
                      ? selectedRecordIds.length > 0
                        ? `تحميل التقرير للمحدد (${selectedRecordIds.length})`
                        : 'تحميل التقرير PDF'
                      : 'Export PDF'}
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-start border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">#</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'التريمستر' : 'Quarter'}</th>
                    <th className="py-3 px-3 text-end">{isAr ? 'رقم المعاملات' : 'Turnover'}</th>
                    <th className="py-3 px-3 text-end">{isAr ? 'الضريبة CPU' : 'CPU Tax'}</th>
                    <th className="py-3 px-3 text-end">{isAr ? 'الصحة AMO' : 'AMO (3m/1m)'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'التقاعد (اختياري)' : 'Retirement'}</th>
                    <th className="py-3 px-3 text-end">{isAr ? 'المجموع الكلي' : 'Total Due'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'الحالة والدفع' : 'Status / Action'}</th>
                    <th className="py-3 px-3 text-center">{isAr ? 'حذف' : 'Del'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedRecordsDesc.map((r) => {
                    const checked = selectedRecordIds.includes(r.id);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleRowSelection(r.id)}
                            className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {r.year} · {getQuarterLabel(r.quarter, language)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>{isAr ? `الاستحقاق: ${r.dueDate}` : `Due: ${r.dueDate}`}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-end font-mono font-bold tabular-nums">
                          {r.turnover.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
                        </td>
                        <td className="py-3 px-3 text-end font-mono font-black text-blue-600 dark:text-blue-400 tabular-nums">
                          {r.calculatedTax.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="py-3 px-3 text-end font-mono tabular-nums">
                          <div className="font-bold text-amber-700 dark:text-amber-400">
                            {r.quarterlyAmo.toFixed(2)} {currencySymbol}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            ({r.monthlyAmo.toFixed(0)}/{isAr ? 'شهر' : 'mo'})
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleCpuQuarterRetirement(r.id, !r.retirementEnabled)}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors ${
                              r.retirementEnabled
                                ? 'bg-violet-50 dark:bg-violet-950/50 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300'
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                          >
                            {r.retirementEnabled ? (
                              <span className="font-mono tabular-nums">
                                {r.quarterlyRetirement.toFixed(2)} {currencySymbol} ✓
                              </span>
                            ) : (
                              <span>{isAr ? 'متوقف (تشغيل)' : 'OFF (Enable)'}</span>
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-end font-mono font-black text-sm text-slate-900 dark:text-white tabular-nums">
                          {r.totalDue.toFixed(2)} {currencySymbol}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {r.status === 'paid' ? (
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[11px] font-black flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isAr ? 'تم الدفع' : 'Paid'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => markCpuQuarterPaid(r.id, false)}
                                className="text-[10px] text-slate-400 hover:underline"
                              >
                                {isAr ? `بتاريخ ${r.paidAt || '-'} · تراجع` : 'Undo'}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markCpuQuarterPaid(r.id, true)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black shadow-2xs transition-colors"
                            >
                              {isAr ? '✓ لقد دفعت' : '✓ I Paid'}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => deleteCpuQuarterRecord(r.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title={isAr ? 'حذف السجل' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INTERACTIVE TURNOVER SIMULATOR (أداة المحاكاة التفاعلية المتكاملة) */}
      {subTab === 'simulator' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Simulator Controls */}
            <div className="lg:col-span-5 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                  <span>{isAr ? 'أداة محاكاة رقم المعاملات المستقبلي المتوقع' : 'Interactive Future Turnover Simulator'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? 'جرّب رقم معاملات شهري أو ربع سنوي أو سنوي متوقع لرؤية أثره الفوري على الضريبة وشريحة CNSS والصحة والتقاعد.'
                    : 'Test expected monthly, quarterly or annual turnover to preview immediate tax, AMO & retirement impact.'}
                </p>
              </div>

              {/* Input Horizon Toggle (Quarterly / Monthly / Annual Turnover / Direct Annual CPU Tax) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
                {(
                  [
                    { id: 'quarterly', label: isAr ? 'ربع سنوي (تريمستر)' : 'Quarterly' },
                    { id: 'monthly', label: isAr ? 'شهري (×3)' : 'Monthly (×3)' },
                    { id: 'annual', label: isAr ? 'سنوي (÷4)' : 'Annual (÷4)' },
                    { id: 'annual_cpu', label: isAr ? 'ضريبة CPU السنوية' : 'Annual CPU Tax' }
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      if (mode.id === simInputPeriod) return;
                      // Convert displayed input seamlessly to preserve simulated scenario
                      if (mode.id === 'monthly') {
                        setSimTurnover(Math.round(effectiveSimQuarterlyTurnover / 3));
                      } else if (mode.id === 'annual') {
                        setSimTurnover(Math.round(effectiveSimQuarterlyTurnover * 4));
                      } else if (mode.id === 'annual_cpu') {
                        setSimTurnover(Math.round(simCalc.annualizedTax));
                      } else {
                        setSimTurnover(Math.round(effectiveSimQuarterlyTurnover));
                      }
                      setSimInputPeriod(mode.id);
                    }}
                    className={`py-2 px-2 rounded-xl transition-colors text-center ${
                      simInputPeriod === mode.id
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                        : 'text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Expected Turnover / Direct Annual CPU Input + Interactive Range Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    {simInputPeriod === 'monthly'
                      ? isAr ? `رقم المعاملات الشهري المتوقع (${currencySymbol}):` : `Monthly Turnover (${currencySymbol}):`
                      : simInputPeriod === 'annual'
                      ? isAr ? `رقم المعاملات السنوي المتوقع (${currencySymbol}):` : `Annual Turnover (${currencySymbol}):`
                      : simInputPeriod === 'annual_cpu'
                      ? isAr ? `مبلغ الضريبة CPU السنوية (${currencySymbol}):` : `Annual CPU Tax (${currencySymbol}):`
                      : isAr ? `رقم المعاملات المتوقع في التريمستر (${currencySymbol}):` : `Quarterly Turnover (${currencySymbol}):`}
                  </label>
                  {simInputPeriod !== 'quarterly' && (
                    <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      = {effectiveSimQuarterlyTurnover.toLocaleString('en-US')} {currencySymbol}/{isAr ? 'تريمستر' : 'Q'}
                    </span>
                  )}
                </div>

                <input
                  type="number"
                  min="0"
                  step={simInputPeriod === 'annual_cpu' ? '50' : '500'}
                  value={simTurnover}
                  onChange={(e) => setSimTurnover(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-4 py-3 text-xl font-mono font-black bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-2xl tabular-nums"
                />

                {(() => {
                  const sliderMax =
                    simInputPeriod === 'annual'
                      ? 2000000
                      : simInputPeriod === 'monthly'
                      ? 200000
                      : simInputPeriod === 'annual_cpu'
                      ? 20000
                      : 600000;
                  const sliderStep =
                    simInputPeriod === 'annual'
                      ? 5000
                      : simInputPeriod === 'monthly'
                      ? 500
                      : simInputPeriod === 'annual_cpu'
                      ? 50
                      : 1000;
                  return (
                    <input
                      type="range"
                      min={0}
                      max={sliderMax}
                      step={sliderStep}
                      value={Math.min(sliderMax, simTurnover)}
                      onChange={(e) => setSimTurnover(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                  );
                })()}

                {/* Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {(simInputPeriod === 'monthly'
                    ? [5000, 10000, 20000, 35000, 50000, 80000]
                    : simInputPeriod === 'annual'
                    ? [60000, 120000, 240000, 400000, 600000, 1000000]
                    : simInputPeriod === 'annual_cpu'
                    ? [400, 750, 1500, 3500, 7500, 15000]
                    : [15000, 30000, 50000, 80000, 150000, 300000]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSimTurnover(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${
                        simTurnover === preset
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {preset.toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulator Retirement Toggle + Savings Difference */}
              <div className="p-3.5 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black text-violet-900 dark:text-violet-200">
                      {isAr ? 'محاكاة مع بريم التقاعد (اختياري)' : 'Simulate with CNSS Retirement'}
                    </div>
                    <div className="text-[11px] text-violet-700 dark:text-violet-300">
                      {isAr ? `معامل × ${cpuSettings.retirementCoeff} من AMO` : `Coeff × ${cpuSettings.retirementCoeff}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSimRetirementOn((v) => !v)}
                    className={`px-3 py-1 rounded-xl text-xs font-black ${
                      simRetirementOn ? 'bg-violet-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {simRetirementOn ? (isAr ? 'مفعّل' : 'ON') : isAr ? 'متوقف' : 'OFF'}
                  </button>
                </div>
                <div className="text-[11px] text-violet-800 dark:text-violet-300 font-mono flex items-center justify-between pt-1 border-t border-violet-200/70 dark:border-violet-800/60">
                  <span>{isAr ? 'الفرق عند إيقاف التقاعد:' : 'Retirement part:'}</span>
                  <span className="font-bold">
                    {simCalcWithRet.quarterlyRetirement.toFixed(2)} {currencySymbol}/{isAr ? 'تريمستر' : 'Q'}
                  </span>
                </div>
              </div>

              {/* Next CNSS Bracket Alert */}
              {nextBracketInfo ? (
                <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1.5 text-xs">
                  <div className="font-black text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{isAr ? 'عتبة الصعود للشريحة الموالية في CNSS:' : 'Next CNSS Bracket Threshold:'}</span>
                  </div>
                  <div className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                    {isAr ? (
                      <>
                        إذا زاد رقم معاملاتك الفصلي بـ{' '}
                        <span className="font-mono font-black underline">
                          +{nextBracketInfo.quarterlyTurnoverGap.toLocaleString('en-US')} {currencySymbol}
                        </span>{' '}
                        ستنتقل إلى <span className="font-bold">{nextBracketInfo.bracket.label.split('(')[0].trim()}</span>{' '}
                        وسيرتفع المجموع الكلي بـ{' '}
                        <span className="font-mono font-black text-rose-700 dark:text-rose-300">
                          +{nextBracketInfo.deltaQuarterlyTotal.toFixed(2)} {currencySymbol}
                        </span>{' '}
                        في التريمستر.
                      </>
                    ) : (
                      <>
                        +{nextBracketInfo.quarterlyTurnoverGap.toLocaleString('en-US')} {currencySymbol}/Q moves to{' '}
                        {nextBracketInfo.bracket.label} (+{nextBracketInfo.deltaQuarterlyTotal.toFixed(2)} {currencySymbol}/Q).
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'أنت حالياً في أعلى شريحة في جدول CNSS المحدد.' : 'Highest CNSS bracket reached.'}
                </div>
              )}

              {/* Apply Simulation to Real Declaration Button */}
              <button
                type="button"
                onClick={handleApplySimulationToDeclaration}
                className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>{isAr ? 'اعتماد هذا الرقم المتوقع في نموذج التصريح' : 'Apply to Quarter Declaration Form'}</span>
              </button>
            </div>

            {/* Right: Instant Simulation Output & Charts */}
            <div className="lg:col-span-7 space-y-4">
              {/* 4 Live Result KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60">
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
                    {isAr ? 'الضريبة المتوقعة (للتريمستر / سنوياً)' : 'Expected CPU Tax'}
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                    {simCalc.quarterlyTax.toFixed(2)} {currencySymbol}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    {isAr ? 'سنوياً (×4):' : 'Annualized:'} {simCalc.annualizedTax.toFixed(2)} {currencySymbol}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60">
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {isAr ? 'الشريحة المطبقة وبريم الصحة AMO' : 'Matched CNSS Bracket & AMO'}
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                    {simCalc.monthlyAmo.toFixed(2)} {currencySymbol}
                    <span className="text-xs font-sans text-slate-500 ms-1">/{isAr ? 'شهر' : 'mo'}</span>
                  </div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 font-bold mt-1">
                    {simCalc.matchedBracket.label} · ({simCalc.quarterlyAmo.toFixed(2)} / {isAr ? 'تريمستر' : 'Q'})
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900/60">
                  <div className="text-xs font-bold text-violet-700 dark:text-violet-300">
                    {isAr ? 'بريم التقاعد المتوقع (AMO × ' + cpuSettings.retirementCoeff + ')' : 'Expected Retirement'}
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1">
                    {simCalc.monthlyRetirement.toFixed(2)} {currencySymbol}
                    <span className="text-xs font-sans text-slate-500 ms-1">/{isAr ? 'شهر' : 'mo'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    {isAr ? 'في التريمستر (3 أشهر):' : 'Quarterly:'} {simCalc.quarterlyRetirement.toFixed(2)} {currencySymbol}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-600 text-white">
                  <div className="text-xs font-bold text-emerald-100">
                    {isAr ? 'المجموع الكلي المتوقع للدفع' : 'Simulated Total Due'}
                  </div>
                  <div className="text-2xl font-black font-mono tabular-nums mt-1">
                    {simCalc.totalQuarterlyDue.toFixed(2)} {currencySymbol}
                  </div>
                  <div className="text-[11px] text-emerald-100 font-mono mt-1 flex items-center justify-between">
                    <span>
                      {isAr ? 'سنوياً:' : 'Annual:'} {(simCalc.totalQuarterlyDue * 4).toFixed(0)} {currencySymbol}
                    </span>
                    <span>
                      {effectiveSimQuarterlyTurnover > 0
                        ? ((simCalc.totalQuarterlyDue / effectiveSimQuarterlyTurnover) * 100).toFixed(2)
                        : '0.00'}
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Scenario Comparison Table */}
              <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-xs">
                <div className="text-xs font-black text-slate-900 dark:text-white flex items-center justify-between">
                  <span>{isAr ? 'مقارنة فورية للسيناريوهات (في التريمستر)' : 'Instant Scenario Comparison (Quarterly)'}</span>
                  {latestRecord && (
                    <span className="text-[11px] font-mono text-slate-500">
                      {isAr ? `المرجع: ${latestRecord.year}-${latestRecord.quarter}` : `Ref: ${latestRecord.year}-${latestRecord.quarter}`}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold">
                      <tr>
                        <th className="py-2 px-3 text-start">{isAr ? 'السيناريو' : 'Scenario'}</th>
                        <th className="py-2 px-3 text-end">{isAr ? 'رقم المعاملات' : 'Turnover'}</th>
                        <th className="py-2 px-3 text-end">{isAr ? 'الضريبة' : 'Tax'}</th>
                        <th className="py-2 px-3 text-end">{isAr ? 'الصحة AMO' : 'AMO'}</th>
                        <th className="py-2 px-3 text-end">{isAr ? 'التقاعد' : 'Retire'}</th>
                        <th className="py-2 px-3 text-end">{isAr ? 'المجموع' : 'Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                      {latestRecord && (
                        <tr className="text-slate-500">
                          <td className="py-2 px-3 font-sans font-bold">{isAr ? `آخر تريمستر (${latestRecord.quarter})` : 'Latest'}</td>
                          <td className="py-2 px-3 text-end">{latestRecord.turnover.toLocaleString('en-US')}</td>
                          <td className="py-2 px-3 text-end">{latestRecord.calculatedTax.toFixed(0)}</td>
                          <td className="py-2 px-3 text-end">{latestRecord.quarterlyAmo.toFixed(0)}</td>
                          <td className="py-2 px-3 text-end">{latestRecord.quarterlyRetirement.toFixed(0)}</td>
                          <td className="py-2 px-3 text-end font-bold">{latestRecord.totalDue.toFixed(2)}</td>
                        </tr>
                      )}
                      <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 font-bold text-slate-900 dark:text-white">
                        <td className="py-2 px-3 font-sans text-emerald-700 dark:text-emerald-300">
                          {isAr ? 'المتوقع (التقاعد مفعّل)' : 'Simulated (Ret ON)'}
                        </td>
                        <td className="py-2 px-3 text-end">{effectiveSimQuarterlyTurnover.toLocaleString('en-US')}</td>
                        <td className="py-2 px-3 text-end text-blue-600">{simCalcWithRet.quarterlyTax.toFixed(0)}</td>
                        <td className="py-2 px-3 text-end text-amber-600">{simCalcWithRet.quarterlyAmo.toFixed(0)}</td>
                        <td className="py-2 px-3 text-end text-violet-600">{simCalcWithRet.quarterlyRetirement.toFixed(0)}</td>
                        <td className="py-2 px-3 text-end text-emerald-700 dark:text-emerald-400">{simCalcWithRet.totalQuarterlyDue.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-bold text-slate-600 dark:text-slate-300">
                          {isAr ? 'المتوقع (بدون التقاعد)' : 'Simulated (Ret OFF)'}
                        </td>
                        <td className="py-2 px-3 text-end">{effectiveSimQuarterlyTurnover.toLocaleString('en-US')}</td>
                        <td className="py-2 px-3 text-end text-blue-600">{simCalcNoRet.quarterlyTax.toFixed(0)}</td>
                        <td className="py-2 px-3 text-end text-amber-600">{simCalcNoRet.quarterlyAmo.toFixed(0)}</td>
                        <td className="py-2 px-3 text-end text-slate-400">0</td>
                        <td className="py-2 px-3 text-end font-bold">{simCalcNoRet.totalQuarterlyDue.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts Row inside Simulator: Sensitivity Curve + Highlighted Brackets */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                  <div className="text-xs font-black text-slate-900 dark:text-white">
                    {isAr ? 'منحنى تأثير تغير رقم المعاملات على الواجبات' : 'Turnover Sensitivity Curve'}
                  </div>
                  <div className="h-52 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={simSensitivityCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} opacity={isDark ? 0.85 : 0.5} />
                        <XAxis dataKey="turnoverLabel" tick={{ fontSize: 10, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <YAxis tick={{ fontSize: 10, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            border: 'none',
                            borderRadius: '12px',
                            color: '#ffffff',
                            fontSize: '12px'
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        {effectiveSimQuarterlyTurnover > 0 && (
                          <ReferenceLine
                            x={
                              effectiveSimQuarterlyTurnover >= 1000
                                ? `${Math.round(effectiveSimQuarterlyTurnover / 1000)}k`
                                : String(Math.round(effectiveSimQuarterlyTurnover))
                            }
                            stroke="#10b981"
                            strokeDasharray="4 4"
                            strokeWidth={2}
                          />
                        )}
                        <Area
                          type="monotone"
                          dataKey="totalDue"
                          name={isAr ? 'المجموع الكلي' : 'Total Due'}
                          fill="#10b981"
                          fillOpacity={0.18}
                          stroke="#10b981"
                          strokeWidth={2.5}
                        />
                        <Line type="monotone" dataKey="tax" name={isAr ? 'الضريبة' : 'Tax'} stroke="#2563eb" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="amo" name="AMO" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
                  <div className="text-xs font-black text-slate-900 dark:text-white">
                    {isAr ? 'الشريحة المختارة ضمن جدول CNSS' : 'Active Bracket in CNSS Scale'}
                  </div>
                  <div className="h-52 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={simulatorBracketCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} opacity={isDark ? 0.85 : 0.5} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <YAxis tick={{ fontSize: 10, fill: isDark ? '#b7c6db' : '#64748b' }} axisLine={{ stroke: isDark ? '#26344a' : '#cbd5e1' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            border: 'none',
                            borderRadius: '12px',
                            color: '#ffffff',
                            fontSize: '12px'
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="amoQ" name={isAr ? 'الصحة AMO' : 'AMO'} radius={[4, 4, 0, 0]}>
                          {simulatorBracketCurve.map((entry, idx) => (
                            <Cell
                              key={entry.id || idx}
                              fill={entry.isCurrent ? '#ea580c' : '#fbbf24'}
                              opacity={entry.isCurrent ? 1 : 0.55}
                            />
                          ))}
                        </Bar>
                        <Bar dataKey="retQ" name={isAr ? 'التقاعد' : 'Retire'} radius={[4, 4, 0, 0]}>
                          {simulatorBracketCurve.map((entry, idx) => (
                            <Cell
                              key={`ret-${entry.id || idx}`}
                              fill={entry.isCurrent ? '#6d28d9' : '#a78bfa'}
                              opacity={entry.isCurrent ? 1 : 0.55}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Risk, Threshold & Expense Ratio Simulator V9 (بيع اليوم - درهم + جدول نسبة % المصاريف) */}
          {(() => {
            const v9Limit = projectionAndThresholdAnalysis.limitCaCeiling || 1666665;
            const coeffPct = Math.max(0.01, Number(cpuSettings.professionCoeffPct) || 6);
            const taxPct = Math.max(0.01, Number(cpuSettings.taxRatePct) || 10);
            const taxFactor = (coeffPct / 100) * (taxPct / 100);
            const retCoeff = Math.max(0, Number(cpuSettings.retirementCoeff) || 1.57);

            const v9Daily = Math.max(0, Number(v4DailySales) || 0);
            const v9Monthly = v9Daily * 30;
            const v9Annual = v9Monthly * 12;
            const v9ProfitMonthly = v9Monthly * (coeffPct / 100);
            const v9TaxMonthly = v9ProfitMonthly * (taxPct / 100);

            const v9Calc = calculateCpuBreakdown(v9Annual / 4, cpuSettings, simRetirementOn);
            const v9AmoMonthly = v9Calc.monthlyAmo;
            const v9RetMonthly = v9Calc.monthlyRetirement;
            const v9TotalCharges = v9TaxMonthly + v9AmoMonthly + v9RetMonthly;
            // الصحيح: صافي = الربح - المصاريف
            const v9NetProfit = v9ProfitMonthly - v9TotalCharges;

            const v9PctLimit = v9Limit > 0 ? Number(((v9Annual / v9Limit) * 100).toFixed(1)) : 0;

            const pTaxCa = v9Monthly > 0 ? (v9TaxMonthly / v9Monthly) * 100 : 0;
            const pAmoCa = v9Monthly > 0 ? (v9AmoMonthly / v9Monthly) * 100 : 0;
            const pRetCa = v9Monthly > 0 ? (v9RetMonthly / v9Monthly) * 100 : 0;
            const pTotalCa = v9Monthly > 0 ? (v9TotalCharges / v9Monthly) * 100 : 0;
            const pNetCa = v9Monthly > 0 ? (v9NetProfit / v9Monthly) * 100 : 0;

            const pTaxProf = v9ProfitMonthly > 0 ? (v9TaxMonthly / v9ProfitMonthly) * 100 : 0;
            const pAmoProf = v9ProfitMonthly > 0 ? (v9AmoMonthly / v9ProfitMonthly) * 100 : 0;
            const pRetProf = v9ProfitMonthly > 0 ? (v9RetMonthly / v9ProfitMonthly) * 100 : 0;
            const pTotalProf = v9ProfitMonthly > 0 ? (v9TotalCharges / v9ProfitMonthly) * 100 : 0;
            const pNetProf = v9ProfitMonthly > 0 ? (v9NetProfit / v9ProfitMonthly) * 100 : 0;

            const v9ActiveBracketIdx = Math.max(
              1,
              projectionAndThresholdAnalysis.bracketRows.findIndex(
                (r) => r.bracket.id === v9Calc.matchedBracket.id
              ) + 1
            );

            const v9BarColor =
              v9PctLimit >= 90
                ? 'bg-rose-500'
                : v9PctLimit >= 70
                ? 'bg-amber-400'
                : 'bg-blue-600';

            const ratioScheduleRows = projectionAndThresholdAnalysis.bracketRows.map((row) => {
              const monthlyCaRef =
                row.maxCa !== null
                  ? Math.round(row.maxCa / 12)
                  : Math.max(Math.round((row.minCa * 1.25) / 12), Math.round(v9Monthly));
              const mProfit = monthlyCaRef * (coeffPct / 100);
              const mTax = mProfit * (taxPct / 100);
              const mAmo = row.monthlyAmo;
              const mRet = simRetirementOn ? Number((mAmo * retCoeff).toFixed(2)) : 0;
              const mTotal = mTax + mAmo + mRet;
              const mNet = mProfit - mTotal;

              return {
                index: row.index,
                bracket: row.bracket,
                isOpenTop: row.maxCa === null,
                monthlyCaRef,
                mProfit,
                taxP: monthlyCaRef > 0 ? (mTax / monthlyCaRef) * 100 : 0,
                amoP: monthlyCaRef > 0 ? (mAmo / monthlyCaRef) * 100 : 0,
                retP: monthlyCaRef > 0 ? (mRet / monthlyCaRef) * 100 : 0,
                totalP: monthlyCaRef > 0 ? (mTotal / monthlyCaRef) * 100 : 0,
                netP: mProfit > 0 ? (mNet / mProfit) * 100 : 0,
                isActive: row.bracket.id === v9Calc.matchedBracket.id
              };
            });

            return (
              <div className="space-y-5">
                {/* Card 1: Kadi POS V9 Daily Sales Calculator + Expense & Profit Ratio Table */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-blue-600" />
                        <span>
                          {isAr
                            ? 'حاسبة العتبة ونسب المصاريف V9 — بيع اليوم (درهم)'
                            : 'Kadi POS V9 — Daily Sales Threshold & Expense Ratio'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isAr
                          ? `الربح = CA × ${coeffPct}% | الضريبة = الربح × ${taxPct}% = CA × ${(taxFactor * 100).toFixed(1)}% | الصافي = الربح - المصاريف`
                          : `Profit = CA × ${coeffPct}% | Tax = CA × ${(taxFactor * 100).toFixed(1)}% | Net = Profit - Charges`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                        {isAr ? `بيع اليوم (${currencySymbol}):` : `Daily Sales (${currencySymbol}):`}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        placeholder={isAr ? 'مثال: 3600' : 'e.g. 3600'}
                        value={v4DailySales}
                        onChange={(e) => setV4DailySales(Math.max(0, Number(e.target.value) || 0))}
                        className="w-36 px-3 py-2 text-lg font-mono font-black text-center bg-blue-50/70 dark:bg-blue-950/30 border-2 border-blue-500 dark:border-blue-600 rounded-xl tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Quick Daily Presets + Sync POS Pace */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[500, 1200, 2500, 3600, 4500, 5000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setV4DailySales(val)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors ${
                          v4DailySales === val
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'
                        }`}
                      >
                        {val.toLocaleString('en-US')} {currencySymbol}/{isAr ? 'يوم' : 'd'}
                      </button>
                    ))}
                    {projectionAndThresholdAnalysis.hasPosSalesLast30 && (
                      <button
                        type="button"
                        onClick={() =>
                          setV4DailySales(Math.round(projectionAndThresholdAnalysis.rawPosDailyAvg))
                        }
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                      >
                        {isAr
                          ? `استعمال معدل المبيعات (${Math.round(projectionAndThresholdAnalysis.rawPosDailyAvg)} ${currencySymbol})`
                          : `Use POS Avg (${Math.round(projectionAndThresholdAnalysis.rawPosDailyAvg)})`}
                      </button>
                    )}
                  </div>

                  {/* Progress Bar + Live V9 Summary + 4% CA Alert */}
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                      <span className="text-slate-900 dark:text-white font-black">
                        {v9PctLimit}% {isAr ? 'من العتبة' : 'of ceiling'} —{' '}
                        {isAr ? `شطر ${v9ActiveBracketIdx}` : `Bracket ${v9ActiveBracketIdx}`} (
                        {v9Calc.matchedBracket.label.split('(')[0].trim()})
                      </span>
                      <span className="font-mono font-black text-slate-700 dark:text-slate-200">
                        {isAr ? 'CA سنوي:' : 'Annual CA:'} {v9Annual.toLocaleString('en-US')} /{' '}
                        {v9Limit.toLocaleString('en-US')} {currencySymbol}
                      </span>
                    </div>

                    <div className="w-full h-5 rounded-xl bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-xl transition-all duration-300 ${v9BarColor}`}
                        style={{ width: `${Math.min(100, v9PctLimit)}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="font-mono text-slate-600 dark:text-slate-300">
                        {isAr ? 'CA شهري:' : 'Monthly CA:'}{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {v9Monthly.toLocaleString('en-US')} {currencySymbol}
                        </strong>{' '}
                        | {isAr ? `ربح (${coeffPct}%):` : `Profit (${coeffPct}%):`}{' '}
                        <strong className="text-emerald-700 dark:text-emerald-400">
                          {v9ProfitMonthly.toFixed(0)} {currencySymbol}
                        </strong>
                      </div>

                      <div className="text-xs font-black font-mono text-slate-900 dark:text-white">
                        Total: {v9TotalCharges.toFixed(0)} {currencySymbol} ={' '}
                        <span className="text-blue-600 dark:text-blue-400">{pTotalCa.toFixed(2)}%</span>{' '}
                        {isAr ? 'من CA' : 'of CA'} ={' '}
                        <span className="text-amber-600 dark:text-amber-400">{pTotalProf.toFixed(2)}%</span>{' '}
                        {isAr ? 'من الربح' : 'of Profit'} |{' '}
                        <span
                          className={
                            v9NetProfit >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {isAr ? 'صافي:' : 'Net:'} {v9NetProfit.toFixed(0)} {currencySymbol} ({pNetProf.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    {/* V9 4% CA Target Alert & Ceiling Check */}
                    <div
                      className={`p-3 rounded-xl border text-xs font-black text-center ${
                        v9Monthly === 0
                          ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                          : pTotalCa >= 4 || v9PctLimit >= 100
                          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {v9Monthly === 0
                        ? isAr
                          ? 'أدخل مبيعات اليوم لحساب النسب ومراقبة عتبة 4% من رقم الأعمال'
                          : 'Enter daily sales to calculate expense ratios vs 4% CA target'
                        : pTotalCa >= 4
                        ? isAr
                          ? `⛔ Total فات 4% من CA (${pTotalCa.toFixed(2)}%) - رد البال`
                          : `⛔ Total exceeded 4% of CA (${pTotalCa.toFixed(2)}%)`
                        : v9PctLimit >= 100
                        ? isAr
                          ? `⚠️ Total تحت 4% (${pTotalCa.toFixed(2)}%) ولكن رقم الأعمال السنوي تجاوز العتبة القصوى للشطر 5!`
                          : `⚠️ Under 4% CA (${pTotalCa.toFixed(2)}%) but Annual CA exceeded max ceiling`
                        : isAr
                        ? `✅ Total ${pTotalCa.toFixed(2)}% من CA - باقي تحت 4%، مزيان`
                        : `✅ Total ${pTotalCa.toFixed(2)}% of CA — Safely under 4% target`}
                    </div>
                  </div>

                  {/* V9 Expense Breakdown Table (% من CA & % من الربح) */}
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs text-start border-collapse">
                      <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3 text-start">{isAr ? 'المصروف' : 'Item'}</th>
                          <th className="py-2.5 px-3 text-end">{isAr ? 'درهم / شهر' : `${currencySymbol} / mo`}</th>
                          <th className="py-2.5 px-3 text-end">{isAr ? '% من CA' : '% of CA'}</th>
                          <th className="py-2.5 px-3 text-end">{isAr ? '% من الربح' : '% of Profit'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                        <tr>
                          <td className="py-2.5 px-3 font-sans font-bold text-blue-700 dark:text-blue-400">
                            {isAr ? `الضريبة CPU (${(taxFactor * 100).toFixed(1)}%)` : 'CPU Tax'}
                          </td>
                          <td className="py-2.5 px-3 text-end font-bold">{v9TaxMonthly.toFixed(0)} {currencySymbol}</td>
                          <td className="py-2.5 px-3 text-end">{pTaxCa.toFixed(2)}%</td>
                          <td className="py-2.5 px-3 text-end">{pTaxProf.toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 font-sans font-bold text-amber-700 dark:text-amber-400">
                            AMO
                          </td>
                          <td className="py-2.5 px-3 text-end font-bold">{v9AmoMonthly.toFixed(0)} {currencySymbol}</td>
                          <td className="py-2.5 px-3 text-end">{pAmoCa.toFixed(2)}%</td>
                          <td className="py-2.5 px-3 text-end">{pAmoProf.toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 font-sans font-bold text-violet-700 dark:text-violet-300">
                            {isAr ? 'تقاعد CNSS' : 'Retirement'}
                          </td>
                          <td className="py-2.5 px-3 text-end font-bold">{v9RetMonthly.toFixed(0)} {currencySymbol}</td>
                          <td className="py-2.5 px-3 text-end">{pRetCa.toFixed(2)}%</td>
                          <td className="py-2.5 px-3 text-end">{pRetProf.toFixed(2)}%</td>
                        </tr>
                        <tr className="bg-slate-50/90 dark:bg-slate-800/50 font-black">
                          <td className="py-2.5 px-3 font-sans text-slate-900 dark:text-white">
                            Total ({isAr ? 'مجموع المصاريف' : 'Total Charges'})
                          </td>
                          <td className="py-2.5 px-3 text-end text-rose-600 dark:text-rose-400">
                            {v9TotalCharges.toFixed(0)} {currencySymbol}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-end ${
                              pTotalCa >= 4 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {pTotalCa.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-end">{pTotalProf.toFixed(2)}%</td>
                        </tr>
                        <tr className="bg-emerald-50/75 dark:bg-emerald-950/30 font-black">
                          <td className="py-2.5 px-3 font-sans text-emerald-800 dark:text-emerald-300">
                            {isAr ? 'صافي الربح (الربح - المصاريف)' : 'Net Profit (Profit - Charges)'}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-end ${
                              v9NetProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {v9NetProfit.toFixed(0)} {currencySymbol}
                          </td>
                          <td className="py-2.5 px-3 text-end text-emerald-700 dark:text-emerald-400">
                            {pNetCa.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-end text-emerald-700 dark:text-emerald-400">
                            {pNetProf.toFixed(2)}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Card 2: جدول نسبة % المصاريف في كل رقم أعمال (Reference Scale) */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        <span>
                          {isAr
                            ? 'جدول نسبة % المصاريف في كل رقم أعمال'
                            : 'Expense Ratio (%) Reference Table Across Brackets'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isAr
                          ? 'السطر المضاء هو شطرك الحالي — انقر على أي شطر لمحاكاة مبيعاته اليومية مباشرة'
                          : 'Highlighted row is your active bracket — click any row to simulate its daily pace'}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                      {isAr ? 'الهدف: Total أقل من 4% من CA' : 'Goal: Total < 4% of CA'}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs text-center border-collapse">
                      <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3">{isAr ? 'شطر' : 'Bracket'}</th>
                          <th className="py-2.5 px-3">{isAr ? 'CA شهري' : 'Monthly CA'}</th>
                          <th className="py-2.5 px-3">{isAr ? 'ضريبة %' : 'Tax %'}</th>
                          <th className="py-2.5 px-3">AMO %</th>
                          <th className="py-2.5 px-3">{isAr ? 'تقاعد %' : 'Ret %'}</th>
                          <th className="py-2.5 px-3">Total %</th>
                          <th className="py-2.5 px-3">{isAr ? 'صافي % من الربح' : 'Net % of Profit'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                        {ratioScheduleRows.map((r) => (
                          <tr
                            key={r.bracket.id}
                            onClick={() => setV4DailySales(Math.max(100, Math.round(r.monthlyCaRef / 30)))}
                            className={`cursor-pointer transition-colors ${
                              r.isActive
                                ? 'bg-blue-100/80 dark:bg-blue-950/60 font-black ring-2 ring-inset ring-blue-500 text-slate-900 dark:text-white'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-sans">
                              <span className="inline-flex items-center gap-1">
                                <span>{r.index}</span>
                                {r.isActive && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-black">
                                    {isAr ? 'دابا' : 'Now'}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-bold">
                              {r.isOpenTop ? '> ' : ''}
                              {r.monthlyCaRef.toLocaleString('en-US')}
                            </td>
                            <td className="py-2.5 px-3 text-blue-700 dark:text-blue-400">
                              {r.taxP.toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 text-amber-700 dark:text-amber-400">
                              {r.amoP.toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 text-violet-700 dark:text-violet-300">
                              {r.retP.toFixed(2)}%
                            </td>
                            <td
                              className={`py-2.5 px-3 font-black ${
                                r.totalP >= 4
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {r.totalP.toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 font-black text-emerald-700 dark:text-emerald-400">
                              {r.netP.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] text-slate-500 text-center pt-1">
                    {isAr
                      ? `القاعدة: الربح = CA × ${coeffPct}% | الضريبة = الربح × ${taxPct}% = CA × ${(taxFactor * 100).toFixed(1)}% | الهدف: Total أقل من 4% من CA`
                      : `Rule: Profit = CA × ${coeffPct}% | Tax = CA × ${(taxFactor * 100).toFixed(1)}% | Target: Total < 4% of CA`}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB-TAB 3: RETIREMENT TRACKER (1320 DAYS & 3240 DAYS) */}
      {subTab === 'retirement' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-6 rounded-3xl bg-violet-600 text-white space-y-2 shadow-sm">
              <div className="text-xs font-bold text-violet-100 flex items-center gap-2">
                <Award className="w-4 h-4" />
                <span>{isAr ? 'إجمالي أيام التقاعد المجمعة (CNSS)' : 'Total Accumulated CNSS Days'}</span>
              </div>
              <div className="text-4xl font-black font-mono tabular-nums">
                {retirementProgress.totalAccumulatedDays.toLocaleString('en-US')}{' '}
                <span className="text-base font-bold">{isAr ? 'يوم' : 'days'}</span>
              </div>
              <div className="text-xs text-violet-100 font-mono">
                {isAr
                  ? `السابقة: ${retirementProgress.priorDays} يوم + من التطبيق: ${retirementProgress.earnedFromAppDays} يوم (${retirementProgress.paidQuartersWithRetirement} تريمستر مدفوع)`
                  : `Prior: ${retirementProgress.priorDays}d + App: ${retirementProgress.earnedFromAppDays}d (${retirementProgress.paidQuartersWithRetirement} paid Q)`}
              </div>
            </div>

            {/* Prior Days quick updater */}
            <div className="lg:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1 max-w-md">
                <div className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'الأيام المصرح بها سابقاً لدى CNSS (قبل التطبيق)' : 'Prior CNSS Accumulated Days'}
                </div>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'كل تريمستر تضغط فيه "لقد دفعت" والتقاعد مفعّل يضيف تلقائياً +90 يوماً إلى رصيد التقاعد الخاص بك.'
                    : 'Every paid quarter with retirement enabled automatically credits +90 days.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={cpuSettings.priorAccumulatedDays}
                  onChange={(e) =>
                    updateCpuSettings({
                      priorAccumulatedDays: Math.max(0, parseInt(e.target.value, 10) || 0)
                    })
                  }
                  className="w-28 px-3.5 py-2.5 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center"
                />
                <span className="text-xs font-bold text-slate-500">{isAr ? 'يوم' : 'days'}</span>
              </div>
            </div>
          </div>

          {/* 1320 Days & 3240 Days Milestone Progress */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Milestone 1: 1320 Days */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-black">
                    {isAr ? 'العتبة الأولى (الحد الأدنى للمعاش)' : 'Threshold 1 (Minimum Pension)'}
                  </span>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white mt-2">
                    {isAr ? 'هدف 1,320 يوم' : '1,320 Days Target'}
                  </h4>
                </div>
                <div className="text-2xl font-black font-mono text-emerald-600 tabular-nums">
                  {retirementProgress.pct1320}%
                </div>
              </div>

              <div className="w-full h-4 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${retirementProgress.pct1320}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-slate-500">{isAr ? 'المتبقي لـ 1320 يوم:' : 'Remaining to 1320d:'}</div>
                  <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {retirementProgress.remainingTo1320} {isAr ? 'يوم' : 'days'}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-slate-500">{isAr ? 'ما يعادل بالتريمسترات:' : 'Quarters Left:'}</div>
                  <div className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                    {retirementProgress.quartersLeftTo1320} {isAr ? 'تريمستر' : 'quarters'}
                  </div>
                </div>
              </div>
            </div>

            {/* Milestone 2: 3240 Days */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2.5 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 text-[11px] font-black">
                    {isAr ? 'العتبة الثانية (المعاش الكامل)' : 'Threshold 2 (Full Pension)'}
                  </span>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white mt-2">
                    {isAr ? 'هدف 3,240 يوم' : '3,240 Days Target'}
                  </h4>
                </div>
                <div className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {retirementProgress.pct3240}%
                </div>
              </div>

              <div className="w-full h-4 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${retirementProgress.pct3240}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-slate-500">{isAr ? 'المتبقي لـ 3240 يوم:' : 'Remaining to 3240d:'}</div>
                  <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    {retirementProgress.remainingTo3240} {isAr ? 'يوم' : 'days'}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                  <div className="text-slate-500">{isAr ? 'ما يعادل بالتريمسترات:' : 'Quarters Left:'}</div>
                  <div className="text-lg font-black font-mono text-indigo-700 dark:text-indigo-400 mt-0.5 tabular-nums">
                    {retirementProgress.quartersLeftTo3240} {isAr ? 'تريمستر' : 'quarters'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Table 1: CNSS Retirement & AMO Premiums Schedule by Bracket */}
          {(() => {
            const currentBracketId = latestRecord
              ? calculateCpuBreakdown(latestRecord.turnover, cpuSettings, latestRecord.retirementEnabled)
                  .matchedBracket.id
              : activePreviewCalc.matchedBracket.id;

            const taxFactor =
              (Math.max(0, cpuSettings.professionCoeffPct) / 100) *
              (Math.max(0, cpuSettings.taxRatePct) / 100);

            const toQuarterlyTurnover = (annualTax: number) =>
              taxFactor > 0 ? Math.round(annualTax / (4 * taxFactor)) : 0;

            const sortedBrackets = [...cpuSettings.cnssBrackets].sort(
              (a, b) => a.minAnnualTax - b.minAnnualTax
            );

            let runningDays = retirementProgress.priorDays;
            const timelineRows = sortedRecordsAsc.map((r) => {
              const earned =
                r.status === 'paid' && r.retirementEnabled
                  ? r.retirementDaysCredited > 0
                    ? r.retirementDaysCredited
                    : 90
                  : 0;
              runningDays += earned;
              return {
                record: r,
                earned,
                cumulativeDays: runningDays,
                rem1320: Math.max(0, 1320 - runningDays),
                rem3240: Math.max(0, 3240 - runningDays)
              };
            });

            const totalPaidRetirementAmount = sortedRecordsAsc
              .filter((r) => r.status === 'paid' && r.retirementEnabled)
              .reduce((sum, r) => sum + (r.quarterlyRetirement || 0), 0);

            return (
              <>
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-violet-600" />
                        <span>
                          {isAr
                            ? 'لوحة الشطور الضريبية التفاعلية وبريمات AMO والتقاعد CNSS'
                            : 'Interactive Tax Brackets, AMO & CNSS Retirement Dashboard'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isAr
                          ? `شرائط تقدم ملونة ديناميكياً حسب القرب من حافة كل شطر، مع توضيح المسافة المتبقية وأثر كل شطر على AMO والتقاعد (×${cpuSettings.retirementCoeff} · +90 يوم/تريمستر).`
                          : `Dynamic color-coded progress bars showing remaining threshold distance & direct AMO/Retirement impact (×${cpuSettings.retirementCoeff}).`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGlobalRetirementToggle}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border flex items-center gap-1.5 transition-colors ${
                          cpuSettings.retirementEnabled
                            ? 'bg-violet-50 dark:bg-violet-950/60 border-violet-300 dark:border-violet-800 text-violet-800 dark:text-violet-300'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>
                          {cpuSettings.retirementEnabled
                            ? isAr
                              ? `التقاعد مفعّل (×${cpuSettings.retirementCoeff})`
                              : `Retirement ON (×${cpuSettings.retirementCoeff})`
                            : isAr
                            ? 'التقاعد متوقف حالياً'
                            : 'Retirement OFF'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadCpuPdf}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isAr ? 'تحميل تقرير التقاعد PDF' : 'Export PDF'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSubTab('settings')}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>{isAr ? 'تعديل الشرائح' : 'Edit Brackets'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Legend & Summary KPI Bar */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                      <div>
                        <span className="text-[10px] font-sans font-bold text-slate-500 block">
                          {isAr ? 'رقم الأعمال السنوي المعتمد' : 'Annual Turnover Base'}
                        </span>
                        <span className="font-black text-slate-900 dark:text-white">
                          {projectionAndThresholdAnalysis.currentAnnualTurnover.toLocaleString('en-US')} {currencySymbol}
                        </span>
                      </div>
                      <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
                      <div>
                        <span className="text-[10px] font-sans font-bold text-sky-600 dark:text-sky-400 block">
                          {isAr ? 'التوقع السنوي (×365 يوم)' : 'Projected Annual (×365d)'}
                        </span>
                        <span className="font-black text-sky-700 dark:text-sky-300">
                          {projectionAndThresholdAnalysis.projectedAnnualTurnover.toLocaleString('en-US')} {currencySymbol}
                        </span>
                      </div>
                      <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
                      <div>
                        <span className="text-[10px] font-sans font-bold text-amber-600 dark:text-amber-400 block">
                          {isAr ? 'المتوسط اليومي للمبيعات' : 'Daily Sales Pace'}
                        </span>
                        <span className="font-black text-amber-700 dark:text-amber-300">
                          {projectionAndThresholdAnalysis.effectiveDailyAvg.toLocaleString('en-US')} {currencySymbol}/{isAr ? 'يوم' : 'd'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                      <span className="px-2 py-1 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        {isAr ? '● آمن (<70%)' : '● Safe (<70%)'}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-amber-100/80 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                        {isAr ? '● اقتراب (70–89%)' : '● Near (70–89%)'}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-rose-100/80 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                        {isAr ? '● حافة الشطر (≥90%)' : '● Critical (≥90%)'}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-sky-100/80 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                        {isAr ? '│ علامة التوقع' : '│ Projection'}
                      </span>
                    </div>
                  </div>

                  {/* Interactive 6-Bracket Progress Cards Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {projectionAndThresholdAnalysis.bracketRows.map((row) => {
                      const b = row.bracket;
                      const isCurrent = b.id === currentBracketId || row.isCurrentBracket;
                      const isInspected = (estBracketId || currentBracketId) === b.id;

                      const barColor =
                        row.statusTone === 'critical'
                          ? 'bg-gradient-to-r from-rose-500 to-rose-600'
                          : row.statusTone === 'approaching'
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                          : row.statusTone === 'safe'
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                          : row.statusTone === 'passed'
                          ? 'bg-emerald-600/75'
                          : 'bg-slate-400 dark:bg-slate-600';

                      const effectiveMonthlyRet = cpuSettings.retirementEnabled ? row.monthlyRetFull : 0;
                      const effectiveQuarterlyRet = cpuSettings.retirementEnabled ? row.quarterlyRetFull : 0;
                      const totalMonthlyProtection = Number((row.monthlyAmo + effectiveMonthlyRet).toFixed(2));

                      const cpuRangeLabel =
                        b.maxAnnualTax === null
                          ? `> ${(b.minAnnualTax === 10001 ? 10000 : Math.floor(b.minAnnualTax)).toLocaleString('en-US')} ${currencySymbol}`
                          : b.minAnnualTax === 0 && b.maxAnnualTax < 500 && b.maxAnnualTax >= 499
                          ? `< 500 ${currencySymbol}`
                          : `${Math.floor(b.minAnnualTax).toLocaleString('en-US')} – ${b.maxAnnualTax.toLocaleString('en-US')} ${currencySymbol}`;

                      const qTurnRangeLabel =
                        row.maxQuarterCa === null
                          ? `> ${row.minQuarterCa.toLocaleString('en-US')} ${currencySymbol}`
                          : `${row.minQuarterCa.toLocaleString('en-US')} – ${row.maxQuarterCa.toLocaleString('en-US')} ${currencySymbol}`;

                      return (
                        <div
                          key={b.id}
                          onClick={() => {
                            setEstBracketId(b.id);
                            setSelectedDashboardBracketId(b.id);
                          }}
                          className={`cursor-pointer p-4 rounded-2xl border transition-all space-y-3 ${
                            isCurrent
                              ? 'bg-violet-50/75 dark:bg-violet-950/25 border-violet-400 dark:border-violet-700 ring-2 ring-violet-200 dark:ring-violet-900/60 shadow-xs'
                              : isInspected
                              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-700 ring-1 ring-emerald-200 dark:ring-emerald-900'
                              : row.isProjectedBracket
                              ? 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-800 hover:border-sky-400'
                              : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          {/* Card Header: Name + Status Badges + CPU/Quarterly CA */}
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                  {b.label.split('(')[0].trim()}
                                </span>
                                {isCurrent && (
                                  <span className="px-2 py-0.5 rounded-md bg-violet-600 text-white text-[10px] font-black">
                                    {isAr ? 'شريحتك الحالية' : 'Current'}
                                  </span>
                                )}
                                {row.isProjectedBracket && (
                                  <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-black">
                                    {isAr ? 'التوقع السنوي' : 'Projected'}
                                  </span>
                                )}
                                {!isCurrent && row.deltaMonthlyTotal !== 0 && (
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black ${
                                      row.deltaMonthlyTotal > 0
                                        ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                                        : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                    }`}
                                  >
                                    {row.deltaMonthlyTotal > 0 ? '+' : ''}
                                    {row.deltaMonthlyTotal.toFixed(0)} {currencySymbol}/{isAr ? 'ش فرق' : 'mo Δ'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2">
                                <span>
                                  {isAr ? 'CPU سنوية:' : 'Annual CPU:'}{' '}
                                  <strong className="text-slate-700 dark:text-slate-200">{cpuRangeLabel}</strong>
                                </span>
                                <span>·</span>
                                <span>
                                  {isAr ? 'CA فصلي:' : 'Q CA:'}{' '}
                                  <strong className="text-slate-700 dark:text-slate-200">{qTurnRangeLabel}</strong>
                                </span>
                              </div>
                            </div>

                            <div className="text-end font-mono tabular-nums">
                              <div className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                                {totalMonthlyProtection.toFixed(2)} {currencySymbol}
                                <span className="text-[10px] font-sans font-bold text-slate-500">/{isAr ? 'ش' : 'mo'}</span>
                              </div>
                              <div className="text-[10px] font-bold text-slate-500">
                                {isAr ? 'نسبة الامتلاء:' : 'Fill:'}{' '}
                                <span
                                  className={
                                    row.statusTone === 'critical'
                                      ? 'text-rose-600 dark:text-rose-400 font-black'
                                      : row.statusTone === 'approaching'
                                      ? 'text-amber-600 dark:text-amber-400 font-black'
                                      : 'text-emerald-600 dark:text-emerald-400 font-black'
                                  }
                                >
                                  {row.pctCurrent.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Dynamic Color-Coded Progress Bar with Current & Projected Markers */}
                          <div className="space-y-1">
                            <div className="relative w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              {row.pctProjected > row.pctCurrent && (
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full bg-sky-300/60 dark:bg-sky-700/45 transition-all duration-300"
                                  style={{ width: `${row.pctProjected}%` }}
                                />
                              )}
                              <div
                                className={`relative h-full rounded-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${row.pctCurrent}%` }}
                              />
                              {row.pctProjected > 0 && (
                                <div
                                  className="absolute top-0 bottom-0 w-1 bg-sky-600 dark:bg-sky-400 shadow-xs"
                                  style={{ left: `calc(${Math.min(99, row.pctProjected)}% - 2px)` }}
                                />
                              )}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                              <span>
                                {row.maxCa !== null
                                  ? row.isPassed
                                    ? isAr
                                      ? '✓ تم تجاوز سقف هذا الشطر (100%)'
                                      : '✓ Bracket Passed (100%)'
                                    : isAr
                                    ? `المسافة المتبقية: ${row.remainingCaToCeiling.toLocaleString('en-US')} ${currencySymbol} رقم أعمال (${row.remainingCpuToCeiling.toFixed(0)} ${currencySymbol} CPU)`
                                    : `Remaining: ${row.remainingCaToCeiling.toLocaleString('en-US')} CA (${row.remainingCpuToCeiling.toFixed(0)} CPU)`
                                  : isAr
                                  ? 'الشطر الأعلى (مفتوح بدون سقف)'
                                  : 'Top Bracket (No Ceiling)'}
                              </span>
                              {row.remainingDaysToCeiling !== null && (
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  {isAr
                                    ? `~${row.remainingDaysToCeiling} يوم متبقي`
                                    : `~${row.remainingDaysToCeiling}d left`}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Direct Impact Metrics Grid: AMO + CNSS Retirement + Annual + Delta */}
                          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono tabular-nums">
                            <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                              <div className="text-[10px] font-sans font-bold text-slate-500">
                                {isAr ? 'الصحة AMO' : 'AMO Health'}
                              </div>
                              <div className="font-black text-amber-700 dark:text-amber-400 mt-0.5">
                                {Number.isInteger(row.monthlyAmo) ? row.monthlyAmo.toFixed(0) : row.monthlyAmo.toFixed(2)}/{isAr ? 'ش' : 'mo'}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {Number.isInteger(row.quarterlyAmo) ? row.quarterlyAmo.toFixed(0) : row.quarterlyAmo.toFixed(2)}/{isAr ? 'تريمستر' : 'Q'}
                              </div>
                            </div>

                            <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                              <div className="text-[10px] font-sans font-bold text-slate-500">
                                {isAr ? `التقاعد (×${cpuSettings.retirementCoeff})` : 'CNSS Pension'}
                              </div>
                              <div
                                className={`font-black mt-0.5 ${
                                  cpuSettings.retirementEnabled
                                    ? 'text-violet-700 dark:text-violet-300'
                                    : 'text-slate-400 line-through'
                                }`}
                              >
                                {row.monthlyRetFull.toFixed(2)}/{isAr ? 'ش' : 'mo'}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {effectiveQuarterlyRet.toFixed(2)}/{isAr ? 'تريمستر' : 'Q'}
                              </div>
                            </div>

                            <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                              <div className="text-[10px] font-sans font-bold text-slate-500">
                                {isAr ? 'التقاعد السنوي (12ش)' : 'Annual Ret (12m)'}
                              </div>
                              <div
                                className={`font-black mt-0.5 ${
                                  cpuSettings.retirementEnabled
                                    ? 'text-indigo-700 dark:text-indigo-300'
                                    : 'text-slate-400'
                                }`}
                              >
                                {row.annualRetFull.toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0
                                })}{' '}
                                {currencySymbol}
                              </div>
                              <div
                                className={`text-[10px] font-bold ${
                                  row.deltaQuarterlyContrib > 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : row.deltaQuarterlyContrib < 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-violet-600 dark:text-violet-400'
                                }`}
                              >
                                {row.deltaQuarterlyContrib === 0
                                  ? isAr
                                    ? 'المرجع الحالي'
                                    : 'Current ref'
                                  : `${row.deltaQuarterlyContrib > 0 ? '+' : ''}${row.deltaQuarterlyContrib.toFixed(0)} ${currencySymbol}/Q`}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Table 2: Chronological Retirement Timeline & Earned Days Table */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <ListChecks className="w-5 h-5 text-emerald-600" />
                        <span>
                          {isAr
                            ? 'الجدول الزمني للتقاعد واحتساب الأيام التراكمية (1320 / 3240 يوم)'
                            : 'Retirement Days & Quarters Timeline Table'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isAr
                          ? 'تتبع تفصيلي للأيام المكتسبة في كل تريمستر مقارنة بعتبتي المعاش الأدنى (1,320 يوم) والمعاش الكامل (3,240 يوم).'
                          : 'Quarter-by-quarter retirement day accumulation against 1,320d and 3,240d thresholds.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 font-black text-violet-800 dark:text-violet-300 font-mono">
                        {isAr
                          ? `مجموع التقاعد المدفوع: ${totalPaidRetirementAmount.toFixed(2)} ${currencySymbol}`
                          : `Paid Retirement: ${totalPaidRetirementAmount.toFixed(2)} ${currencySymbol}`}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <th className="py-3 px-3 text-start font-black">
                            {isAr ? 'الفترة / التريمستر' : 'Period'}
                          </th>
                          <th className="py-3 px-3 text-start font-black">
                            {isAr ? 'حالة التقاعد والدفع' : 'Status'}
                          </th>
                          <th className="py-3 px-3 text-start font-black">
                            {isAr ? 'بريم التقاعد (3 أشهر)' : 'Retirement (3mo)'}
                          </th>
                          <th className="py-3 px-3 text-start font-black">
                            {isAr ? 'الأيام المكتسبة' : 'Earned Days'}
                          </th>
                          <th className="py-3 px-3 text-start font-black">
                            {isAr ? 'الرصيد التراكمي' : 'Total Days'}
                          </th>
                          <th className="py-3 px-3 text-start font-black">
                            {isAr ? 'المتبقي لـ 1,320 يوم' : 'Left to 1,320d'}
                          </th>
                          <th className="py-3 px-3 text-start font-black">
                            {isAr ? 'المتبقي لـ 3,240 يوم' : 'Left to 3,240d'}
                          </th>
                          <th className="py-3 px-3 text-end font-black">
                            {isAr ? 'إجراء' : 'Action'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {/* Opening Prior Days Row */}
                        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                          <td className="py-3 px-3 font-black text-slate-800 dark:text-slate-200">
                            {isAr ? 'الرصيد السابق (قبل التطبيق)' : 'Opening Balance (Prior Days)'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold">
                              {isAr ? 'مصرح به سابقاً' : 'Declared'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400">—</td>
                          <td className="py-3 px-3 font-mono font-black text-slate-700 dark:text-slate-300 tabular-nums">
                            {retirementProgress.priorDays} {isAr ? 'يوم' : 'd'}
                          </td>
                          <td className="py-3 px-3 font-mono font-black text-violet-700 dark:text-violet-300 tabular-nums">
                            {retirementProgress.priorDays.toLocaleString('en-US')} {isAr ? 'يوم' : 'd'}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                            {Math.max(0, 1320 - retirementProgress.priorDays) === 0
                              ? isAr
                                ? 'مكتمل ✓'
                                : 'Reached ✓'
                              : `${Math.max(0, 1320 - retirementProgress.priorDays)} ${isAr ? 'يوم' : 'd'}`}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                            {Math.max(0, 3240 - retirementProgress.priorDays) === 0
                              ? isAr
                                ? 'مكتمل ✓'
                                : 'Reached ✓'
                              : `${Math.max(0, 3240 - retirementProgress.priorDays)} ${isAr ? 'يوم' : 'd'}`}
                          </td>
                          <td className="py-3 px-3 text-end text-[11px] text-slate-400">
                            {isAr ? 'نقطة البداية' : 'Baseline'}
                          </td>
                        </tr>

                        {timelineRows.map(({ record: r, earned, cumulativeDays, rem1320, rem3240 }) => (
                          <tr
                            key={r.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-3 px-3">
                              <div className="font-black text-slate-900 dark:text-white">
                                {r.year} · {r.quarter}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {r.status === 'paid' && r.paidAt
                                  ? `${isAr ? 'دفع:' : 'Paid:'} ${r.paidAt}`
                                  : `${isAr ? 'أجل:' : 'Due:'} ${r.dueDate}`}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                    r.status === 'paid'
                                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                  }`}
                                >
                                  {r.status === 'paid'
                                    ? isAr
                                      ? 'مدفوع'
                                      : 'Paid'
                                    : isAr
                                    ? 'في الانتظار'
                                    : 'Pending'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    r.retirementEnabled
                                      ? 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                  }`}
                                >
                                  {r.retirementEnabled
                                    ? isAr
                                      ? 'تقاعد مفعّل'
                                      : 'Pension ON'
                                    : isAr
                                    ? 'متوقف'
                                    : 'Paused'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold tabular-nums">
                              {r.retirementEnabled ? (
                                <span className="text-violet-700 dark:text-violet-300">
                                  {r.quarterlyRetirement.toFixed(2)} {currencySymbol}
                                </span>
                              ) : (
                                <span className="text-slate-400">0.00 {currencySymbol}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono font-black tabular-nums">
                              {earned > 0 ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  +{earned} {isAr ? 'يوم' : 'd'}
                                </span>
                              ) : (
                                <span className="text-slate-400">+0 {isAr ? 'يوم' : 'd'}</span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono font-black text-slate-900 dark:text-white tabular-nums">
                              {cumulativeDays.toLocaleString('en-US')} {isAr ? 'يوم' : 'd'}
                            </td>
                            <td className="py-3 px-3 font-mono tabular-nums">
                              {rem1320 === 0 ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                                  {isAr ? 'تم بلوغ العتبة ✓' : 'Reached ✓'}
                                </span>
                              ) : (
                                <span className="text-slate-700 dark:text-slate-300 font-bold">
                                  {rem1320.toLocaleString('en-US')} {isAr ? 'يوم' : 'd'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono tabular-nums">
                              {rem3240 === 0 ? (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-black">
                                  {isAr ? 'المعاش الكامل ✓' : 'Full ✓'}
                                </span>
                              ) : (
                                <span className="text-slate-700 dark:text-slate-300 font-bold">
                                  {rem3240.toLocaleString('en-US')} {isAr ? 'يوم' : 'd'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-end">
                              {r.status === 'unpaid' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    markCpuQuarterPaid(r.id, true);
                                    if (settings.enableSoundEffects) playSound('success');
                                    showToast(
                                      isAr
                                        ? r.retirementEnabled
                                          ? `✅ تم تأكيد دفع ${r.year}-${r.quarter} وإضافة +90 يوم لرصيد التقاعد`
                                          : `✅ تم تأكيد دفع ${r.year}-${r.quarter}`
                                        : `Marked ${r.year}-${r.quarter} as paid`
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black inline-flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>
                                    {r.retirementEnabled
                                      ? isAr
                                        ? 'دفع (+90 يوم)'
                                        : 'Pay (+90d)'
                                      : isAr
                                      ? 'تأكيد الدفع'
                                      : 'Mark Paid'}
                                  </span>
                                </button>
                              ) : (
                                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                  ✓ {isAr ? 'محتسب' : 'Credited'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Retirement Timeline & Cost Estimator */}
                {(() => {
                  const selectedBr =
                    sortedBrackets.find((b) => b.id === (estBracketId || currentBracketId)) ||
                    sortedBrackets[0];
                  const quarterlyRetCost = selectedBr
                    ? Number((selectedBr.monthlyAmo * cpuSettings.retirementCoeff * 3).toFixed(2))
                    : 0;
                  const quartersPerYear = Math.max(1, Math.min(4, estQuartersPerYear));

                  const estimateTarget = (remainingDays: number) => {
                    const qNeeded = remainingDays > 0 ? Math.ceil(remainingDays / 90) : 0;
                    const yearsNeeded = qNeeded / quartersPerYear;
                    const monthsNeeded = Math.round(yearsNeeded * 12);
                    const targetDate = new Date();
                    targetDate.setMonth(targetDate.getMonth() + monthsNeeded);
                    const monthLabel = targetDate.toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
                      month: 'long',
                      year: 'numeric'
                    });
                    const remainingBudget = Number((qNeeded * quarterlyRetCost).toFixed(2));
                    return { qNeeded, yearsNeeded, monthLabel, remainingBudget };
                  };

                  const est1320 = estimateTarget(retirementProgress.remainingTo1320);
                  const est3240 = estimateTarget(retirementProgress.remainingTo3240);

                  return (
                    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-900/60 space-y-4 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-violet-600" />
                            <span>
                              {isAr
                                ? 'محاكي تاريخ التقاعد المتوقع وتكلفة المسار (CNSS)'
                                : 'Retirement Timeline & Cost Estimator'}
                            </span>
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {isAr
                              ? 'احسب السنة والشهر المتوقعين لبلوغ عتبة المعاش مع تقدير تكلفة الاشتراكات المتبقية بناءً على شريحتك وعدد التريمسترات السنوية.'
                              : 'Estimate target month/year and remaining pension contribution budget.'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-600 dark:text-slate-300">
                              {isAr ? 'وتيرة الدفع/السنة:' : 'Quarters/yr:'}
                            </span>
                            <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-black">
                              {[1, 2, 3, 4].map((q) => (
                                <button
                                  key={q}
                                  type="button"
                                  onClick={() => setEstQuartersPerYear(q)}
                                  className={`px-2.5 py-1 rounded-lg transition-colors ${
                                    quartersPerYear === q
                                      ? 'bg-violet-600 text-white'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>

                          <select
                            value={selectedBr?.id || ''}
                            onChange={(e) => setEstBracketId(e.target.value)}
                            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                          >
                            {sortedBrackets.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.label.split('(')[0].trim()} —{' '}
                                {(b.monthlyAmo * cpuSettings.retirementCoeff * 3).toFixed(0)} {currencySymbol}/Q
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                              {isAr ? 'تقدير بلوغ 1,320 يوم (الحد الأدنى)' : '1,320 Days Target Estimate'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black font-mono">
                              {est1320.qNeeded} {isAr ? 'تريمستر متبقي' : 'Q left'}
                            </span>
                          </div>
                          {est1320.qNeeded === 0 ? (
                            <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                              {isAr ? '✅ مبروك! تم استيفاء شرط 1,320 يوم بالفعل' : '✅ Already reached 1,320 days!'}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                              <div>
                                <div className="text-slate-500">{isAr ? 'التاريخ المتوقع:' : 'Est. Date:'}</div>
                                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                                  {est1320.monthLabel}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  ({est1320.yearsNeeded.toFixed(1)} {isAr ? 'سنة' : 'yrs'})
                                </div>
                              </div>
                              <div>
                                <div className="text-slate-500">{isAr ? 'التكلفة المتبقية للتقاعد:' : 'Est. Remaining Cost:'}</div>
                                <div className="text-base font-black font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                                  {est1320.remainingBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  ({quarterlyRetCost.toFixed(2)} {currencySymbol}/{isAr ? 'تريمستر' : 'Q'})
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-800/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-indigo-800 dark:text-indigo-300">
                              {isAr ? 'تقدير بلوغ 3,240 يوم (المعاش الكامل)' : '3,240 Days Target Estimate'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black font-mono">
                              {est3240.qNeeded} {isAr ? 'تريمستر متبقي' : 'Q left'}
                            </span>
                          </div>
                          {est3240.qNeeded === 0 ? (
                            <div className="text-sm font-black text-indigo-700 dark:text-indigo-300">
                              {isAr ? '✅ مبروك! تم استيفاء شرط المعاش الكامل 3,240 يوم' : '✅ Already reached 3,240 days!'}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                              <div>
                                <div className="text-slate-500">{isAr ? 'التاريخ المتوقع:' : 'Est. Date:'}</div>
                                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                                  {est3240.monthLabel}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  ({est3240.yearsNeeded.toFixed(1)} {isAr ? 'سنة' : 'yrs'})
                                </div>
                              </div>
                              <div>
                                <div className="text-slate-500">{isAr ? 'التكلفة المتبقية للتقاعد:' : 'Est. Remaining Cost:'}</div>
                                <div className="text-base font-black font-mono text-indigo-700 dark:text-indigo-400 mt-0.5 tabular-nums">
                                  {est3240.remainingBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })} {currencySymbol}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  ({quarterlyRetCost.toFixed(2)} {currencySymbol}/{isAr ? 'تريمستر' : 'Q'})
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </div>
      )}

      {/* SUB-TAB 4: DEDICATED CPU SETTINGS & CNSS BRACKETS EDITOR */}
      {subTab === 'settings' && (
        <form onSubmit={handleSaveCpuSettingsTab} className="space-y-5">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-emerald-600" />
                  <span>{isAr ? 'إعدادات نسب الضريبة ومعاملات CPU' : 'CPU Tax Rates & Coefficients'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr
                    ? 'عدّل نسبة الضريبة (10%)، معامل المهنة (6%)، معامل التقاعد (1.57)، والتنبيه قبل الدفع.'
                    : 'Customize tax rate, profession coefficient, retirement multiplier & alert window.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetDefaultBrackets}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isAr ? 'استعادة الافتراضي' : 'Restore Defaults'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'نسبة الضريبة (%)' : 'Tax Rate (%)'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={draftTaxRate}
                  onChange={(e) => setDraftTaxRate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'معامل المهنة (%)' : 'Profession Coeff (%)'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={draftProfCoeff}
                  onChange={(e) => setDraftProfCoeff(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'معامل التقاعد (× AMO)' : 'Retirement Coeff'}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={draftRetCoeff}
                  onChange={(e) => setDraftRetCoeff(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'التنبيه قبل الدفع (أيام)' : 'Alert Before Due (d)'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={draftAlertDays}
                  onChange={(e) => setDraftAlertDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isAr ? 'أيام CNSS السابقة' : 'Prior CNSS Days'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={draftPriorDays}
                  onChange={(e) => setDraftPriorDays(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-rose-700 dark:text-rose-300 mb-1">
                  {isAr ? `الرسم المهني السنوي - الباتنتا في السنة (${currencySymbol})` : `Annual Patente Tax (${currencySymbol}/yr)`}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={draftAnnualPatente}
                  onChange={(e) => setDraftAnnualPatente(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-black bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <input
                id="cpuDefaultRetCheck"
                type="checkbox"
                checked={draftRetDefault}
                onChange={(e) => setDraftRetDefault(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
              />
              <label htmlFor="cpuDefaultRetCheck" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                {isAr
                  ? 'تفعيل بريم التقاعد افتراضياً عند حساب التريمسترات الجديدة'
                  : 'Enable retirement contribution by default for new calculations'}
              </label>
            </div>
          </div>

          {/* Manual CNSS Brackets Table Editor */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'تحديث جدول بريمات CNSS (الشرائح حسب الضريبة السنوية)' : 'Manual CNSS AMO Brackets Table'}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isAr
                    ? 'عدّل مبالغ بريم الصحة AMO الشهري لكل شريحة ضريبية؛ ويُحسب التقاعد تلقائياً بضرب AMO × المعامل.'
                    : 'Edit monthly AMO per annual tax bracket; retirement auto-scales by multiplier.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddBracket}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? '+ إضافة شريحة' : '+ Add Bracket'}</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-start border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-start">{isAr ? 'اسم الشريحة' : 'Label'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'من ضريبة سنوية' : 'Min Annual Tax'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'إلى ضريبة (فارغ = مفتوح)' : 'Max Annual Tax'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? `AMO شهري (${currencySymbol})` : 'Monthly AMO'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'التقاعد الشهري (تلقائي)' : 'Auto Ret./mo'}</th>
                    <th className="py-2.5 px-3 text-center">{isAr ? 'حذف' : 'Del'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {draftBrackets.map((b, idx) => {
                    const retPreview = (b.monthlyAmo * (parseFloat(draftRetCoeff) || 1.57)).toFixed(2);
                    return (
                      <tr key={b.id}>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={b.label}
                            onChange={(e) => handleUpdateBracketField(idx, 'label', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="any"
                            value={b.minAnnualTax}
                            onChange={(e) => handleUpdateBracketField(idx, 'minAnnualTax', e.target.value)}
                            className="w-24 mx-auto block px-2 py-1.5 text-xs font-mono text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="any"
                            placeholder="∞"
                            value={b.maxAnnualTax === null ? '' : b.maxAnnualTax}
                            onChange={(e) => handleUpdateBracketField(idx, 'maxAnnualTax', e.target.value)}
                            className="w-24 mx-auto block px-2 py-1.5 text-xs font-mono text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="any"
                            value={b.monthlyAmo}
                            onChange={(e) => handleUpdateBracketField(idx, 'monthlyAmo', e.target.value)}
                            className="w-24 mx-auto block px-2 py-1.5 text-xs font-mono font-black text-center bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg"
                          />
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-violet-700 dark:text-violet-300 tabular-nums">
                          {retPreview} {currencySymbol}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {draftBrackets.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftBrackets((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>{isAr ? 'حفظ إعدادات CPU وجدول CNSS' : 'Save CPU Settings & Brackets'}</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

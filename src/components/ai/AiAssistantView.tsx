import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Landmark,
  Users,
  Package,
  Send,
  CheckCircle2,
  Zap,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  Coins,
  Bot,
  MessageSquare,
  X,
  GraduationCap,
  Shield,
  Lock,
  Unlock,
  FileDown,
  Copy,
  Check,
  Eye,
  Trash2,
  SearchCode
} from 'lucide-react';
import { Product } from '../../types';
import { exportAiFinancialTaxPdf } from '../../utils/exportReports';

interface GeminiRecommendation {
  title: string;
  category: 'margin' | 'tax' | 'waste' | 'growth' | 'cashflow' | string;
  impact: 'high' | 'medium' | string;
  driver: string;
  action: string;
  estimatedMonthlyImpact: string;
}

interface GeminiAnalysisResult {
  healthScore: number;
  executiveSummary: string;
  taxAdvisory: string;
  growthForecast: string;
  recommendations: GeminiRecommendation[];
}

interface SmartDriverInsight {
  id: string;
  severity: 'critical' | 'warning' | 'opportunity';
  title: string;
  driverPlus: string;
  recommendation: string;
  impactEstimate: string;
  affectedCount: number;
  bulkLabel?: string;
  navTab?: 'inventory' | 'customers' | 'cpu_tax' | 'analytics';
  bulkType?: 'restock_critical' | 'clearance_discount' | 'margin_bump';
  affectedProducts?: Product[];
}

interface AuditFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  category: 'cash_shift' | 'discount_refund' | 'below_cost' | 'waste_shrinkage' | 'credit_compliance';
  title: string;
  details: string;
  estimatedAmount: number;
  actor?: string;
  date?: string;
}

type AiSubTab = 'advisor' | 'tutor' | 'investigator';
type ChatMode = 'advisor' | 'tutor' | 'investigator';

export const AiAssistantView: React.FC = () => {
  const {
    products,
    orders,
    expenses,
    customers,
    shiftsHistory,
    stockMovements,
    activityLogs,
    settings,
    cpuSettings,
    cpuRecords,
    zakatSummary,
    currencySymbol,
    language,
    bulkUpdateProducts,
    verifyManagerPin,
    setCurrentTab
  } = usePos();

  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [subTab, setSubTab] = useState<AiSubTab>('advisor');
  const [chatMode, setChatMode] = useState<ChatMode>('advisor');

  // Secret Auditor PIN Lock (Privacy Shield)
  const [isAuditorLocked, setIsAuditorLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [bulkSuccessToast, setBulkSuccessToast] = useState<string | null>(null);
  const [confirmInsight, setConfirmInsight] = useState<SmartDriverInsight | null>(null);

  // Gemini API Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<GeminiAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Interactive Financial Chat State
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; text: string; mode?: ChatMode }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Core Financial & Operational Snapshots
  const metrics = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'completed');
    const now = Date.now();
    const last30dOrders = completed.filter((o) => now - new Date(o.date).getTime() <= 30 * 86_400_000);

    const totalRevenue = completed.reduce((s, o) => s + o.grandTotal, 0);
    const totalGrossProfit = completed.reduce((s, o) => s + o.profitTotal, 0);
    const marginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfitBeforeTax = totalGrossProfit - totalExpenses;

    const expenseByCategory: Record<string, number> = {};
    expenses.forEach((e) => {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
    });

    const criticalStock = products.filter(
      (p) => p.lowStockThreshold > 0 && p.stock <= p.lowStockThreshold * 0.2
    );

    const lowMarginProducts = products.filter((p) => {
      if (p.price <= 0 || p.costPrice <= 0) return false;
      const m = ((p.price - p.costPrice) / p.price) * 100;
      return m < 15;
    });

    const qtySold30d: Record<string, number> = {};
    last30dOrders.forEach((o) => {
      o.items.forEach((it) => {
        qtySold30d[it.productId] = (qtySold30d[it.productId] || 0) + it.quantity;
      });
    });

    const slowOrExpiring = products.filter((p) => {
      const sold = qtySold30d[p.id] || 0;
      const isSlow = p.stock > 0 && sold === 0;
      const expiringSoon =
        p.expiryDate &&
        new Date(p.expiryDate).getTime() - now <= 30 * 86_400_000 &&
        p.stock > 0;
      return isSlow || Boolean(expiringSoon);
    });

    const totalReceivables = customers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
    const overLimitCustomers = customers.filter(
      (c) => c.creditLimit && c.creditLimit > 0 && c.balance > c.creditLimit
    );

    const unpaidCpuTotal = cpuRecords
      .filter((r) => r.status !== 'paid')
      .reduce((s, r) => s + r.totalDue, 0);
    const paidCpuTotal = cpuRecords
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.totalDue, 0);
    const annualPatente = cpuSettings.annualPatenteTax || 0;
    const totalInventoryCost = products.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0);

    // Daily break-even revenue needed to cover expenses + annual Patente/CPU reserve
    const effectiveMargin = Math.max(0.12, marginPct / 100);
    const monthlyFixedOverhead = totalExpenses / 1 + (annualPatente + unpaidCpuTotal) / 12;
    const dailyBreakEvenSales = monthlyFixedOverhead / 30 / effectiveMargin;

    return {
      ordersCount: completed.length,
      totalRevenue,
      totalGrossProfit,
      marginPct,
      totalExpenses,
      netProfitBeforeTax,
      expenseByCategory,
      criticalStock,
      lowMarginProducts,
      slowOrExpiring,
      totalReceivables,
      overLimitCustomers,
      unpaidCpuTotal,
      paidCpuTotal,
      annualPatente,
      totalInventoryCost,
      qtySold30d,
      dailyBreakEvenSales
    };
  }, [orders, expenses, products, customers, cpuRecords, cpuSettings]);

  // Secret Internal Auditor ("المحقق السري") Forensics Engine
  const auditReport = useMemo(() => {
    const findings: AuditFinding[] = [];

    // 1. Shift cash discrepancies
    shiftsHistory.forEach((sh) => {
      const diff = Number(sh.discrepancy || 0);
      if (Math.abs(diff) >= 1) {
        findings.push({
          id: `shift-${sh.id}`,
          severity: Math.abs(diff) >= 50 ? 'high' : 'medium',
          category: 'cash_shift',
          title:
            diff < 0
              ? isAr
                ? `عجز نقدي في الصندوق - الوردية #${sh.shiftNumber}`
                : `Cash Shortage - Shift #${sh.shiftNumber}`
              : isAr
              ? `فائض غير مفسّر في الصندوق - الوردية #${sh.shiftNumber}`
              : `Cash Overage - Shift #${sh.shiftNumber}`,
          details: isAr
            ? `الكاشير: ${sh.cashierName} · الفارق المسجل: ${diff.toFixed(2)} ${currencySymbol}`
            : `Cashier: ${sh.cashierName} · Variance: ${diff.toFixed(2)} ${currencySymbol}`,
          estimatedAmount: Math.abs(diff),
          actor: sh.cashierName,
          date: sh.closedAt || sh.openedAt
        });
      }
    });

    // 2. Heavy discounts (>12% of subtotal) & Refunds
    orders.forEach((o) => {
      if (o.status === 'refunded' || o.status === 'partially_refunded') {
        const refAmt = o.refundedAmount ?? o.grandTotal;
        findings.push({
          id: `refund-${o.id}`,
          severity: refAmt >= 150 ? 'high' : 'medium',
          category: 'discount_refund',
          title: isAr
            ? `استرجاع فاتورة ${o.orderNumber}`
            : `Order Refund ${o.orderNumber}`,
          details: isAr
            ? `المسؤول: ${o.cashierName} · المبلغ المسترد: ${refAmt.toFixed(2)} ${currencySymbol}`
            : `Cashier: ${o.cashierName} · Refunded: ${refAmt.toFixed(2)} ${currencySymbol}`,
          estimatedAmount: refAmt,
          actor: o.cashierName,
          date: o.date
        });
      } else if (o.subtotal > 0 && o.discountTotal / o.subtotal > 0.12) {
        const pct = ((o.discountTotal / o.subtotal) * 100).toFixed(1);
        findings.push({
          id: `disc-${o.id}`,
          severity: o.discountTotal > 100 ? 'high' : 'medium',
          category: 'discount_refund',
          title: isAr
            ? `خصم مرتفع (${pct}%) على الفاتورة ${o.orderNumber}`
            : `Heavy Discount (${pct}%) on ${o.orderNumber}`,
          details: isAr
            ? `الكاشير: ${o.cashierName} · قيمة الخصم: ${o.discountTotal.toFixed(2)} ${currencySymbol}`
            : `Cashier: ${o.cashierName} · Discount: ${o.discountTotal.toFixed(2)} ${currencySymbol}`,
          estimatedAmount: o.discountTotal,
          actor: o.cashierName,
          date: o.date
        });
      }
    });

    // 3. Selling or Pricing at/below cost price
    const belowCostProducts = products.filter((p) => p.costPrice > 0 && p.price <= p.costPrice);
    if (belowCostProducts.length > 0) {
      findings.push({
        id: 'below-cost-skus',
        severity: 'high',
        category: 'below_cost',
        title: isAr
          ? `تسعير بخسارة أو هامش صفري (${belowCostProducts.length} أصناف)`
          : `Zero/Negative Margin SKUs (${belowCostProducts.length} items)`,
        details: belowCostProducts
          .slice(0, 4)
          .map((p) => `${p.name} (${p.price}/${p.costPrice})`)
          .join(' · '),
        estimatedAmount: belowCostProducts.reduce(
          (s, p) => s + Math.max(1, p.stock) * Math.max(0, p.costPrice - p.price),
          0
        )
      });
    }

    // 4. Inventory waste & negative audit adjustments
    const wasteMovements = stockMovements.filter(
      (m) => m.type === 'waste' || (m.type === 'audit_adjustment' && m.quantityChange < 0)
    );
    if (wasteMovements.length > 0) {
      const wasteValue = wasteMovements.reduce(
        (s, m) => s + Math.abs(m.quantityChange) * (m.costPerUnit || 0),
        0
      );
      findings.push({
        id: 'waste-shrinkage',
        severity: wasteValue >= 200 ? 'high' : 'medium',
        category: 'waste_shrinkage',
        title: isAr
          ? `فقدان وإتلاف مخزون (${wasteMovements.length} عمليات)`
          : `Stock Shrinkage & Waste (${wasteMovements.length} events)`,
        details: isAr
          ? `تكلفة البضاعة المفقودة/المتلفة: ${wasteValue.toFixed(2)} ${currencySymbol}`
          : `Lost inventory cost: ${wasteValue.toFixed(2)} ${currencySymbol}`,
        estimatedAmount: wasteValue,
        date: wasteMovements[0]?.date
      });
    }

    // 5. Over-limit credit + sensitive activity log alerts
    if (metrics.overLimitCustomers.length > 0) {
      const overAmt = metrics.overLimitCustomers.reduce(
        (s, c) => s + Math.max(0, c.balance - (c.creditLimit || 0)),
        0
      );
      findings.push({
        id: 'credit-over-limit',
        severity: 'medium',
        category: 'credit_compliance',
        title: isAr
          ? `تجاوز سقف الكريدي لدى ${metrics.overLimitCustomers.length} زبائن`
          : `${metrics.overLimitCustomers.length} Customers Exceeded Credit Limit`,
        details: metrics.overLimitCustomers.map((c) => `${c.name} (${c.balance.toFixed(0)})`).join(' · '),
        estimatedAmount: overAmt
      });
    }

    const recentSensitiveLogs = activityLogs.filter(
      (l) => l.severity === 'warning' || l.category === 'settings_change'
    );
    if (recentSensitiveLogs.length > 0) {
      findings.push({
        id: 'audit-log-events',
        severity: 'low',
        category: 'credit_compliance',
        title: isAr
          ? `عمليات حساسة مسجلة في السجل الرقابي (${recentSensitiveLogs.length})`
          : `Sensitive Control Events Logged (${recentSensitiveLogs.length})`,
        details: recentSensitiveLogs
          .slice(0, 2)
          .map((l) => `${l.title} (${l.actor})`)
          .join(' · '),
        estimatedAmount: 0,
        actor: recentSensitiveLogs[0]?.actor,
        date: recentSensitiveLogs[0]?.timestamp
      });
    }

    const severityWeight: Record<AuditFinding['severity'], number> = { high: 16, medium: 8, low: 3 };
    const penalty = findings.reduce((s, f) => s + severityWeight[f.severity], 0);
    const integrityScore = Math.max(15, 100 - penalty);
    const estimatedLeakage = findings.reduce((s, f) => s + f.estimatedAmount, 0);

    const sorted = [...findings].sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 };
      return rank[b.severity] - rank[a.severity];
    });

    return {
      findings: sorted,
      integrityScore,
      estimatedLeakage
    };
  }, [shiftsHistory, orders, products, stockMovements, activityLogs, metrics.overLimitCustomers, currencySymbol, isAr]);

  // Deterministic Internal Smart Insights (driver+ & bulk-action)
  const smartInsights = useMemo<SmartDriverInsight[]>(() => {
    const list: SmartDriverInsight[] = [];

    if (metrics.criticalStock.length > 0) {
      const lostDailyEst = metrics.criticalStock.reduce((s, p) => {
        const vel = (metrics.qtySold30d[p.id] || 1) / 30;
        return s + vel * p.price;
      }, 0);
      list.push({
        id: 'critical_stock',
        severity: 'critical',
        title: isAr
          ? `نفاد وشيك: ${metrics.criticalStock.length} أصناف تحت عتبة 20% الحرجة`
          : `Critical Stock Alert: ${metrics.criticalStock.length} SKUs below 20% threshold`,
        driverPlus: isAr
          ? `Driver+: متوسط السحب اليومي قد يعرض ${lostDailyEst.toFixed(0)} ${currencySymbol}/يوم من المبيعات للانقطاع الفوري.`
          : `Driver+: ${metrics.criticalStock.length} critical SKUs put ~${lostDailyEst.toFixed(0)} ${currencySymbol}/day at risk.`,
        recommendation: isAr
          ? 'قم برفع المخزون الفوري إلى ضعف حد الأمان أو ولد أمر شراء تعويضي من تبويب التنبؤ.'
          : 'Replenish critical SKUs to double safety threshold or generate a replenishment PO.',
        impactEstimate: isAr
          ? `حماية ~${(lostDailyEst * 7).toFixed(0)} ${currencySymbol}/أسبوع`
          : `Protect ~${(lostDailyEst * 7).toFixed(0)} ${currencySymbol}/wk`,
        affectedCount: metrics.criticalStock.length,
        bulkLabel: isAr ? 'تزويد جماعي لحد الأمان (+Bulk Restock)' : 'Bulk Restock All Critical',
        bulkType: 'restock_critical',
        affectedProducts: metrics.criticalStock,
        navTab: 'inventory'
      });
    }

    if (metrics.lowMarginProducts.length > 0) {
      const potentialGain = metrics.lowMarginProducts.reduce(
        (s, p) => s + p.price * 0.05 * Math.max(1, metrics.qtySold30d[p.id] || 4),
        0
      );
      list.push({
        id: 'low_margin',
        severity: 'opportunity',
        title: isAr
          ? `فرصة ربح: ${metrics.lowMarginProducts.length} أصناف بهامش ربح أقل من 15%`
          : `Margin Opportunity: ${metrics.lowMarginProducts.length} SKUs under 15% margin`,
        driverPlus: isAr
          ? `Driver+: هذه المنتجات تستنزف السيولة وتغطي بالكاد مصاريف التشغيل والضريبة الموحدة.`
          : `Driver+: Sub-15% SKUs compress overall gross margin (${metrics.marginPct.toFixed(1)}%).`,
        recommendation: isAr
          ? 'رفع سعر البيع بنسبة +5% لهذه الفئة يحسن هامش الربح الصافي دون التأثير القوي على الطلب.'
          : 'Applying a +5% price adjustment expands store profitability.',
        impactEstimate: isAr
          ? `+${potentialGain.toFixed(0)} ${currencySymbol}/شهر تقديرياً`
          : `+${potentialGain.toFixed(0)} ${currencySymbol}/mo est.`,
        affectedCount: metrics.lowMarginProducts.length,
        bulkLabel: isAr ? 'تحسين جماعي للهامش (+5%)' : 'Bulk Margin Boost (+5%)',
        bulkType: 'margin_bump',
        affectedProducts: metrics.lowMarginProducts
      });
    }

    if (metrics.slowOrExpiring.length > 0) {
      const lockedCapital = metrics.slowOrExpiring.reduce(
        (s, p) => s + Math.max(0, p.stock) * p.costPrice,
        0
      );
      list.push({
        id: 'slow_or_expiring',
        severity: 'warning',
        title: isAr
          ? `تقليل الهدر: ${metrics.slowOrExpiring.length} أصناف راكدة أو قريبة الانتهاء`
          : `Waste Reduction: ${metrics.slowOrExpiring.length} stagnant or expiring SKUs`,
        driverPlus: isAr
          ? `Driver+: سيولة مجمدة بقيمة ${lockedCapital.toFixed(0)} ${currencySymbol} بسعر التكلفة معرضة للتلف أو الركود.`
          : `Driver+: ${lockedCapital.toFixed(0)} ${currencySymbol} in cost capital is locked in stagnant/expiring stock.`,
        recommendation: isAr
          ? 'أطلق عرض تصفية جماعي (-15% كحد أقصى فوق التكلفة) لتحرير رأس المال قبل الخسارة.'
          : 'Apply a 15% clearance markdown (protected above cost) to unlock working capital.',
        impactEstimate: isAr
          ? `تحرير سيولة ${lockedCapital.toFixed(0)} ${currencySymbol}`
          : `Unlock ${lockedCapital.toFixed(0)} ${currencySymbol}`,
        affectedCount: metrics.slowOrExpiring.length,
        bulkLabel: isAr ? 'تخفيض تصفية جماعي (-15%)' : 'Bulk Clearance (-15%)',
        bulkType: 'clearance_discount',
        affectedProducts: metrics.slowOrExpiring
      });
    }

    if (metrics.totalReceivables > 0) {
      list.push({
        id: 'credit_exposure',
        severity: metrics.overLimitCustomers.length > 0 ? 'critical' : 'warning',
        title: isAr
          ? `السيولة والكريدي: ${metrics.totalReceivables.toFixed(0)} ${currencySymbol} مستحقة لدى الزبائن`
          : `Receivables Alert: ${metrics.totalReceivables.toFixed(0)} ${currencySymbol} outstanding credit`,
        driverPlus: isAr
          ? `Driver+: يوجد ${metrics.overLimitCustomers.length} زبائن تجاوزوا السقف المسموح به للديون.`
          : `Driver+: ${metrics.overLimitCustomers.length} customers exceeded their credit limit.`,
        recommendation: isAr
          ? 'أرسل تذكيرات واتساب لطيفة وراجع كناش الكريدي لتحصيل السيولة بسرعة.'
          : 'Send WhatsApp payment reminders and review customer ledger balances.',
        impactEstimate: isAr
          ? `تحصيل حتى ${metrics.totalReceivables.toFixed(0)} ${currencySymbol}`
          : `Recover up to ${metrics.totalReceivables.toFixed(0)} ${currencySymbol}`,
        affectedCount: Math.max(1, metrics.overLimitCustomers.length),
        navTab: 'customers'
      });
    }

    const monthlyReserve = (metrics.unpaidCpuTotal + metrics.annualPatente) / 12;
    list.push({
      id: 'tax_reserve',
      severity: metrics.unpaidCpuTotal > 0 ? 'warning' : 'opportunity',
      title: isAr
        ? 'التخطيط الضريبي (CPU + الباتنتا + CNSS + الزكاة)'
        : 'Tax & Compliance Reserve (CPU + Patente + Zakat)',
      driverPlus: isAr
        ? `Driver+: الباتنتا السنوية (${metrics.annualPatente.toFixed(0)} ${currencySymbol}) + مستحقات CPU غير المؤداة (${metrics.unpaidCpuTotal.toFixed(0)} ${currencySymbol}) + زكاة التجارة (${zakatSummary.zakatDue.toFixed(0)} ${currencySymbol}).`
        : `Driver+: Annual Patente (${metrics.annualPatente.toFixed(0)}) + unpaid CPU (${metrics.unpaidCpuTotal.toFixed(0)}) + Zakat (${zakatSummary.zakatDue.toFixed(0)}).`,
      recommendation: isAr
        ? `خصّص شهرياً ما لا يقل عن ${Math.max(150, monthlyReserve).toFixed(0)} ${currencySymbol} في صندوق مستقل لتفادي أي ضغط على السيولة عند حلول الأقساط.`
        : `Set aside ~${Math.max(150, monthlyReserve).toFixed(0)} ${currencySymbol}/mo into a dedicated tax reserve.`,
      impactEstimate: isAr ? 'استقرار ضريبي 100%' : 'Zero quarter-end shock',
      affectedCount: cpuRecords.filter((r) => r.status !== 'paid').length,
      navTab: 'cpu_tax'
    });

    return list;
  }, [metrics, zakatSummary, cpuRecords, currencySymbol, isAr]);

  const executeConfirmedBulkAction = () => {
    if (!confirmInsight || !confirmInsight.affectedProducts || !confirmInsight.bulkType) return;
    const targets = confirmInsight.affectedProducts;

    if (confirmInsight.bulkType === 'restock_critical') {
      bulkUpdateProducts(
        targets.map((p) => {
          const targetStock = Math.max((p.lowStockThreshold || 5) * 2, 12);
          const delta = Math.max(1, targetStock - Math.max(0, p.stock));
          return {
            id: p.id,
            changes: {},
            stockDelta: delta,
            reason: isAr ? 'تزويد ذكي جماعي (AI Bulk Restock)' : 'AI Smart Bulk Restock'
          };
        })
      );
      setBulkSuccessToast(
        isAr
          ? `✅ تم تزويد ${targets.length} أصناف حرجة بنجاح إلى مستوى الأمان.`
          : `✅ Successfully restocked ${targets.length} critical SKUs.`
      );
    } else if (confirmInsight.bulkType === 'margin_bump') {
      bulkUpdateProducts(
        targets.map((p) => {
          const raised = Math.ceil(p.price * 1.05 * 2) / 2;
          return { id: p.id, changes: { price: raised } };
        })
      );
      setBulkSuccessToast(
        isAr
          ? `✅ تم رفع هوامش الربح (+5%) لـ ${targets.length} أصناف.`
          : `✅ Boosted retail price (+5%) across ${targets.length} thin-margin SKUs.`
      );
    } else if (confirmInsight.bulkType === 'clearance_discount') {
      bulkUpdateProducts(
        targets.map((p) => {
          const discounted = Number(Math.max(p.costPrice * 1.02, p.price * 0.85).toFixed(2));
          return { id: p.id, changes: { price: discounted } };
        })
      );
      setBulkSuccessToast(
        isAr
          ? `✅ تم تطبيق تخفيض التصريف (-15% فوق التكلفة) على ${targets.length} أصناف راكدة.`
          : `✅ Applied clearance markdown (-15%) across ${targets.length} slow SKUs.`
      );
    }

    setConfirmInsight(null);
    setTimeout(() => setBulkSuccessToast(null), 4000);
  };

  const buildStoreSummaryPayload = () => {
    const topProducts = [...products]
      .map((p) => ({
        name: p.name,
        price: p.price,
        cost: p.costPrice,
        stock: p.stock,
        sold30d: metrics.qtySold30d[p.id] || 0
      }))
      .sort((a, b) => b.sold30d - a.sold30d)
      .slice(0, 8);

    return {
      storeName: settings.storeName,
      currency: settings.currency,
      currencySymbol,
      completedOrdersCount: metrics.ordersCount,
      totalRevenue: Number(metrics.totalRevenue.toFixed(2)),
      totalGrossProfit: Number(metrics.totalGrossProfit.toFixed(2)),
      grossMarginPercent: Number(metrics.marginPct.toFixed(2)),
      totalExpenses: Number(metrics.totalExpenses.toFixed(2)),
      expensesByCategory: metrics.expenseByCategory,
      netProfitBeforeTax: Number(metrics.netProfitBeforeTax.toFixed(2)),
      dailyBreakEvenSales: Number(metrics.dailyBreakEvenSales.toFixed(2)),
      inventoryCostValuation: Number(metrics.totalInventoryCost.toFixed(2)),
      criticalLowStockCount: metrics.criticalStock.length,
      slowOrExpiringStockCount: metrics.slowOrExpiring.length,
      lowMarginSkuCount: metrics.lowMarginProducts.length,
      customerCreditReceivables: Number(metrics.totalReceivables.toFixed(2)),
      taxAndCompliance: {
        cpuRatePct: cpuSettings.taxRatePct,
        professionCoeffPct: cpuSettings.professionCoeffPct,
        annualPatenteTax: cpuSettings.annualPatenteTax || 0,
        paidCpuTotal: Number(metrics.paidCpuTotal.toFixed(2)),
        unpaidCpuTotal: Number(metrics.unpaidCpuTotal.toFixed(2)),
        zakatDueAmount: Number(zakatSummary.zakatDue.toFixed(2)),
        zakatReachesNisab: zakatSummary.hasReachedNisab
      },
      secretAuditSummary: {
        integrityScore: auditReport.integrityScore,
        flagsCount: auditReport.findings.length,
        estimatedLeakage: Number(auditReport.estimatedLeakage.toFixed(2)),
        topFlags: auditReport.findings.slice(0, 5).map((f) => ({
          severity: f.severity,
          category: f.category,
          title: f.title,
          details: f.details,
          amount: f.estimatedAmount
        }))
      },
      topSellingProducts: topProducts
    };
  };

  const handleRunGeminiAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeSummary: buildStoreSummaryPayload(),
          language
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'MISSING_API_KEY') {
          throw new Error(
            isAr
              ? 'مفتاح GEMINI_API_KEY غير مضبوط على الخادم بعد. التوصيات الداخلية وتدقيق المحقق السري تعمل بالكامل.'
              : 'GEMINI_API_KEY is not configured on the server yet. Internal insights and Secret Auditor remain active.'
          );
        }
        throw new Error(data?.error || 'AI analysis failed');
      }
      setAnalysisResult(data.analysis as GeminiAnalysisResult);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to reach AI server');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendChat = async (customQuestion?: string, overrideMode?: ChatMode) => {
    const q = (customQuestion ?? chatInput).trim();
    if (!q || isSendingChat) return;
    const activeMode = overrideMode ?? chatMode;
    if (overrideMode) setChatMode(overrideMode);
    if (!customQuestion) setChatInput('');

    const nextHistory = [...chatHistory, { role: 'user' as const, text: q, mode: activeMode }];
    setChatHistory(nextHistory);
    setIsSendingChat(true);
    setChatError(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history: chatHistory.map((m) => ({ role: m.role, text: m.text })),
          storeSummary: buildStoreSummaryPayload(),
          language,
          mode: activeMode
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
        throw new Error(data?.error || 'Failed to get AI response');
      }
      setChatHistory([...nextHistory, { role: 'assistant', text: data.reply || '', mode: activeMode }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Chat request failed');
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleExportPdf = () => {
    exportAiFinancialTaxPdf({
      settings,
      currencySymbol,
      language,
      summary: {
        ordersCount: metrics.ordersCount,
        totalRevenue: metrics.totalRevenue,
        totalGrossProfit: metrics.totalGrossProfit,
        marginPct: metrics.marginPct,
        totalExpenses: metrics.totalExpenses,
        netProfitBeforeTax: metrics.netProfitBeforeTax,
        unpaidCpuTotal: metrics.unpaidCpuTotal,
        paidCpuTotal: metrics.paidCpuTotal,
        annualPatente: metrics.annualPatente,
        zakatDue: zakatSummary.zakatDue,
        totalReceivables: metrics.totalReceivables,
        inventoryCostValuation: metrics.totalInventoryCost,
        integrityScore: auditReport.integrityScore,
        auditFlagsCount: auditReport.findings.length,
        estimatedLeakage: auditReport.estimatedLeakage,
        aiExecutiveSummary: analysisResult?.executiveSummary,
        aiTaxAdvisory: analysisResult?.taxAdvisory
      }
    });
  };

  const handleCopyText = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const quickPromptsByMode: Record<ChatMode, string[]> = {
    advisor: isAr
      ? [
          'ساعدني في تشطيب وصياغة التقرير المالي الشهري للمتجر',
          'كيفاش نرفع هامش الربح الصافي ونقلل الهدر؟',
          'ما هي خطة تحصيل ديون الكريدي وتحسين السيولة؟'
        ]
      : [
          'Help me finalize a crisp monthly financial executive summary',
          'How can I boost net margin and reduce inventory waste?',
          'Action plan to collect customer credit & improve cashflow'
        ],
    tutor: isAr
      ? [
          'علّمني خطوة بخطوة كيف تحسب ضريبة CPU والباتنتا بأرقام متجري',
          'اشرح لي الفرق بين الربح الإجمالي وصافي الجيب ونقطة التعادل',
          'كيفاش نحسب زكاة التجارة على متجري (نصاب 85g ذهب)؟'
        ]
      : [
          'Teach me step-by-step how CPU & Patente are calculated on my store',
          'Explain Gross Margin vs Net Pocket Profit & Daily Break-even',
          'How is Trade Zakat calculated on my inventory & receivables?'
        ],
    investigator: isAr
      ? [
          'حلل ملف المحقق السري: أين يوجد أخطر تسرب مالي حالياً؟',
          'راجع فجوات الصندوق والمرتجعات والخصومات المشبوهة واقترح ضوابط',
          'كيفاش نحمي المحل من البيع بالخسارة وإتلاف المخزون؟'
        ]
      : [
          'Analyze the Secret Auditor dossier: where is the biggest money leak?',
          'Review cash register shortages, refunds & heavy discounts',
          'What controls prevent below-cost leakage & inventory shrinkage?'
        ]
  };

  const tutorLessons = useMemo(() => {
    return [
      {
        id: 'lesson-net-profit',
        badge: isAr ? 'الدرس 1: المحاسبة الصافية' : 'Lesson 1: Real Net Profit',
        title: isAr ? 'الفرق بين رقم المعاملات، الربح الإجمالي، وصافي الجيب' : 'Revenue vs Gross Profit vs Net Profit',
        formula: isAr
          ? 'صافي الجيب = (المبيعات − تكلفة البضاعة) − المصاريف − مخصص الضرائب والباتنتا'
          : 'Net Pocket Profit = (Sales - COGS) - Expenses - Tax Reserve',
        liveValue: `${(metrics.netProfitBeforeTax - (metrics.annualPatente + metrics.unpaidCpuTotal) / 12).toFixed(0)} ${currencySymbol}`,
        explanation: isAr
          ? `متجرك حقق مبيعات ${metrics.totalRevenue.toFixed(0)} ${currencySymbol} وربحاً إجمالياً ${metrics.totalGrossProfit.toFixed(0)} ${currencySymbol} (هامش ${metrics.marginPct.toFixed(1)}%). بعد طرح المصاريف (${metrics.totalExpenses.toFixed(0)}) تبقى ${metrics.netProfitBeforeTax.toFixed(0)} ${currencySymbol} قبل الضرائب.`
          : `Revenue is ${metrics.totalRevenue.toFixed(0)}, gross profit ${metrics.totalGrossProfit.toFixed(0)} (${metrics.marginPct.toFixed(1)}%), and net pre-tax ${metrics.netProfitBeforeTax.toFixed(0)}.`,
        prompt: isAr
          ? 'علّمني بالتفصيل كيف أقرأ صافي الربح الحقيقي لمتجري وكيف أميّز بين السيولة في الصندوق والربح الحقيقي؟'
          : 'Teach me in detail how to read my real net profit vs cash in drawer.'
      },
      {
        id: 'lesson-breakeven',
        badge: isAr ? 'الدرس 2: نقطة التعادل' : 'Lesson 2: Break-Even Point',
        title: isAr ? 'كم يجب أن تبيع يومياً حتى لا تخسر درهماً واحداً؟' : 'Daily Sales Required to Break Even',
        formula: isAr
          ? 'نقطة التعادل اليومية = (المصاريف + قسط الباتنتا والضريبة ÷ 30) ÷ نسبة الهامش'
          : 'Daily Break-even = (Monthly Overhead / 30) / Gross Margin %',
        liveValue: `${metrics.dailyBreakEvenSales.toFixed(0)} ${currencySymbol} / ${isAr ? 'يوم' : 'day'}`,
        explanation: isAr
          ? `بناءً على هامش ربحك الحالي (${metrics.marginPct.toFixed(1)}%) ومصاريفك الثابتة والضريبية، تحتاج لمبيعات يومية تفوق ${metrics.dailyBreakEvenSales.toFixed(0)} ${currencySymbol} لتغطية التكاليف والبدء في جني صافي ربح فعلي.`
          : `At a ${metrics.marginPct.toFixed(1)}% gross margin, your store needs ~${metrics.dailyBreakEvenSales.toFixed(0)} ${currencySymbol}/day in sales to cover expenses & taxes.`,
        prompt: isAr
          ? 'اشرح لي نقطة التعادل (Break-even) بأرقام متجري وكيف أنزلها لزيادة صافي الربح؟'
          : 'Explain my break-even point and how to lower it.'
      },
      {
        id: 'lesson-cpu-patente',
        badge: isAr ? 'الدرس 3: الضريبة المغربية' : 'Lesson 3: Moroccan CPU & Patente',
        title: isAr ? 'كيف تُحسب المساهمة المهنية الموحدة (CPU) وCNSS والباتنتا؟' : 'How CPU Tax, CNSS & Annual Patente Work',
        formula: `CPU = CA × ${cpuSettings.professionCoeffPct}% × ${cpuSettings.taxRatePct}% + AMO/Retraite + Patente/an`,
        liveValue: `${(metrics.unpaidCpuTotal + metrics.annualPatente).toFixed(0)} ${currencySymbol}`,
        explanation: isAr
          ? `تُطبق نسبة ${cpuSettings.taxRatePct}% على الدخل الجزافي (رقم المعاملات × معامل المهنة ${cpuSettings.professionCoeffPct}%)، ويُضاف إليها واجب التغطية الصحية والتقاعد الاختياري ثم الرسم المهني السنوي (الباتنتا: ${metrics.annualPatente.toFixed(0)} ${currencySymbol}).`
          : `Tax rate ${cpuSettings.taxRatePct}% applies to imputed income (Turnover * ${cpuSettings.professionCoeffPct}%), plus CNSS AMO/Retirement and annual Patente (${metrics.annualPatente.toFixed(0)}).`,
        prompt: isAr
          ? 'علّمني طريقة حساب ضريبة CPU و CNSS والباتنتا السنوية في المغرب بمثال رقمي واضح من بيانات متجري.'
          : 'Teach me Moroccan CPU, CNSS and annual Patente calculation using my store figures.'
      },
      {
        id: 'lesson-zakat-credit',
        badge: isAr ? 'الدرس 4: الزكاة والكريدي' : 'Lesson 4: Zakat & Cashflow',
        title: isAr ? 'حساب زكاة التجارة (نصاب 85g ذهب) وحماية الكريدي' : 'Trade Zakat (85g Gold Nisab) & Credit Control',
        formula: isAr
          ? 'الوعاء الزكوي = قيمة المخزون + السيولة + الكريدي المرجو تحصيله − الديون المستحقة (× 2.5%)'
          : 'Zakatable Base = Inventory + Cash + Collectible Receivables - Debts (x 2.5%)',
        liveValue: zakatSummary.hasReachedNisab
          ? `${zakatSummary.zakatDue.toFixed(0)} ${currencySymbol}`
          : isAr
          ? 'دون النصاب'
          : 'Below Nisab',
        explanation: isAr
          ? `النصاب الحالي (${zakatSummary.nisabValue.toFixed(0)} ${currencySymbol}). الوعاء الزكوي لمتجرك يبلغ ${zakatSummary.zakatableBase.toFixed(0)} ${currencySymbol}، والكريدي لدى الزبائن يصل إلى ${metrics.totalReceivables.toFixed(0)} ${currencySymbol}.`
          : `Nisab is ${zakatSummary.nisabValue.toFixed(0)}, zakatable base ${zakatSummary.zakatableBase.toFixed(0)}, and customer credit stands at ${metrics.totalReceivables.toFixed(0)}.`,
        prompt: isAr
          ? 'علّمني كيف أحسب زكاة التجارة على البضاعة والكريدي، وكيف أتجنب أن يبتلع الكريدي رأس مال المحل؟'
          : 'Explain how Trade Zakat works on stock and receivables, and how to prevent credit from draining cash.'
      }
    ];
  }, [metrics, cpuSettings, zakatSummary, currencySymbol, isAr]);

  const handleUnlockAuditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyManagerPin(pinInput)) {
      setIsAuditorLocked(false);
      setPinError(false);
      setPinInput('');
    } else {
      setPinError(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 space-y-6">
      {/* Header + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              {isAr
                ? 'مساعد الذكاء الاصطناعي، التعليم المالي والمحقق السري'
                : isFr
                ? 'Assistant IA, Académie Fiscale & Auditeur Secret'
                : 'AI Advisor, Financial Tutor & Secret Auditor'}
            </h1>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'تشطيب التقارير والشات مع الذكاء الاصطناعي، دروس تطبيقية للمالية والضريبة، ومحقق سري لكشف الثغرات.'
                : 'AI chat & report polishing, interactive financial/tax lessons, and confidential anomaly forensics.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-black flex items-center gap-2 border border-slate-700 transition-colors"
          >
            <FileDown className="w-4 h-4 text-emerald-400" />
            <span>{isAr ? 'تقرير المالية والضريبة PDF' : 'Financial & Tax PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleRunGeminiAnalysis}
            disabled={isAnalyzing}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-xs font-black flex items-center gap-2 shadow-md disabled:opacity-60 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>
              {isAnalyzing
                ? isAr
                  ? 'جاري التحليل بـ Gemini AI...'
                  : 'Analyzing with Gemini...'
                : isAr
                ? 'تشغيل التحليل الشامل بـ Gemini AI'
                : 'Run Gemini Deep Analysis'}
            </span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs gap-1">
          <button
            type="button"
            onClick={() => {
              setSubTab('advisor');
              setChatMode('advisor');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
              subTab === 'advisor'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>{isAr ? 'المستشار والشات الذكي' : 'AI Advisor & Chat'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('tutor');
              setChatMode('tutor');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
              subTab === 'tutor'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>{isAr ? 'علّمني المالية والضريبة' : 'Financial & Tax Tutor'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('investigator');
              setChatMode('investigator');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
              subTab === 'investigator'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <SearchCode className="w-4 h-4" />
            <span>{isAr ? 'المحقق السري (التدقيق)' : 'Secret Auditor'}</span>
            {auditReport.findings.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-mono">
                {auditReport.findings.length}
              </span>
            )}
          </button>
        </div>

        {subTab === 'investigator' && !isAuditorLocked && (
          <button
            type="button"
            onClick={() => setIsAuditorLocked(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 hover:bg-slate-800"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>{isAr ? 'قفل المحقق السري الآن (PIN)' : 'Lock Secret Auditor (PIN)'}</span>
          </button>
        )}
      </div>

      {bulkSuccessToast && (
        <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between">
          <span>{bulkSuccessToast}</span>
          <button type="button" onClick={() => setBulkSuccessToast(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Live Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isAr ? 'الهامش الإجمالي' : 'Gross Margin'}</span>
          </div>
          <div className="mt-1 text-lg font-black font-mono tabular-nums text-emerald-600">
            {metrics.marginPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums">
            {metrics.totalGrossProfit.toFixed(0)} {currencySymbol}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isAr ? 'الصافي قبل الضريبة' : 'Net Pre-Tax'}</span>
          </div>
          <div
            className={`mt-1 text-lg font-black font-mono tabular-nums ${
              metrics.netProfitBeforeTax >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600'
            }`}
          >
            {metrics.netProfitBeforeTax.toFixed(0)} {currencySymbol}
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums">
            {isAr ? 'مصاريف:' : 'Exp:'} {metrics.totalExpenses.toFixed(0)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>{isAr ? 'مخزون حرج <20%' : 'Critical <20%'}</span>
          </div>
          <div className="mt-1 text-lg font-black font-mono tabular-nums text-rose-600">
            {metrics.criticalStock.length}
          </div>
          <div className="text-[10px] text-slate-400">
            {isAr ? 'أصناف تحتاج تزويد' : 'SKUs need restock'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-600" />
            <span>{isAr ? 'مستحقات الكريدي' : 'Credit Receivables'}</span>
          </div>
          <div className="mt-1 text-lg font-black font-mono tabular-nums text-amber-600">
            {metrics.totalReceivables.toFixed(0)} {currencySymbol}
          </div>
          <div className="text-[10px] text-slate-400">
            {metrics.overLimitCustomers.length} {isAr ? 'تجاوزوا السقف' : 'over limit'}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5 text-violet-600" />
            <span>{isAr ? 'النزاهة والضرائب' : 'Integrity & Taxes'}</span>
          </div>
          <div className="mt-1 text-lg font-black font-mono tabular-nums text-violet-600">
            {auditReport.integrityScore}% · {(metrics.unpaidCpuTotal + metrics.annualPatente).toFixed(0)}
          </div>
          <div className="text-[10px] text-slate-400 font-mono tabular-nums">
            {isAr ? 'باتنتا:' : 'Patente:'} {metrics.annualPatente.toFixed(0)} {currencySymbol}
          </div>
        </div>
      </div>

      {/* TAB 1: ADVISOR & SMART INSIGHTS */}
      {subTab === 'advisor' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>
                {isAr
                  ? 'مركز النصائح الذكية التلقائية (driver+ & bulk-action)'
                  : 'Internal Smart Insights Engine (driver+ & bulk-action)'}
              </span>
            </h2>
            <span className="text-[11px] font-bold text-slate-500">
              {smartInsights.length} {isAr ? 'توصيات نشطة' : 'active drivers'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {smartInsights.map((insight) => {
              const borderCls =
                insight.severity === 'critical'
                  ? 'border-rose-200 dark:border-rose-900/70'
                  : insight.severity === 'warning'
                  ? 'border-amber-200 dark:border-amber-900/70'
                  : 'border-emerald-200 dark:border-emerald-900/70';
              const badgeCls =
                insight.severity === 'critical'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                  : insight.severity === 'warning'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300';

              return (
                <div
                  key={insight.id}
                  className={`p-5 rounded-3xl bg-white dark:bg-slate-900 border ${borderCls} shadow-xs flex flex-col justify-between gap-4`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-black text-slate-900 dark:text-white leading-snug">
                        {insight.title}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${badgeCls}`}>
                        {insight.impactEstimate}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700">
                      {insight.driverPlus}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {insight.recommendation}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    {insight.bulkLabel && insight.bulkType && (
                      <button
                        type="button"
                        onClick={() => setConfirmInsight(insight)}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{insight.bulkLabel}</span>
                      </button>
                    )}
                    {insight.navTab && (
                      <button
                        type="button"
                        onClick={() => setCurrentTab(insight.navTab!)}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
                      >
                        <span>{isAr ? 'فتح القسم المختص' : 'Open Section'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: FINANCIAL & TAX ACADEMY ("علّمني المالية والضريبة") */}
      {subTab === 'tutor' && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <GraduationCap className="w-7 h-7 shrink-0" />
              <div>
                <h2 className="text-sm font-black">
                  {isAr ? 'أكاديمية المالية والضريبة التطبيقية لمتجرك' : 'Interactive Store Financial & Tax Tutor'}
                </h2>
                <p className="text-[11px] text-emerald-100">
                  {isAr
                    ? 'كل قاعدة مشروحة ومطبّقة مباشرة على أرقام مبيعاتك ومصاريفك وضرائبك الحقيقية.'
                    : 'Every financial & Moroccan tax rule calculated live on your real store numbers.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleExportPdf}
              className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-black flex items-center gap-1.5"
            >
              <FileDown className="w-4 h-4" />
              <span>{isAr ? 'تحميل ملف التقرير التعليمي PDF' : 'Export Tax Report PDF'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {tutorLessons.map((lesson) => (
              <div
                key={lesson.id}
                className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                      {lesson.badge}
                    </span>
                    <span className="text-xs font-black font-mono text-slate-900 dark:text-white">
                      {lesson.liveValue}
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-slate-900 dark:text-white">{lesson.title}</h3>

                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
                    {lesson.formula}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {lesson.explanation}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSendChat(lesson.prompt, 'tutor')}
                  className="self-start px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1.5 transition-colors"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>{isAr ? 'اشرح لي هذا الدرس بـ Gemini AI' : 'Explain with Gemini Tutor'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SECRET INTERNAL AUDITOR ("المحقق السري") */}
      {subTab === 'investigator' && (
        <div className="space-y-4">
          {isAuditorLocked ? (
            <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/70 text-center max-w-md mx-auto space-y-4 shadow-md">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {isAr ? 'المحقق السري محمي بالرقم السري للمدير' : 'Secret Auditor Locked'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isAr
                    ? 'أدخل الرمز السري للمدير (الافتراضي 1234) لفتح ملف التحقيق المالي والرقابي.'
                    : 'Enter Manager PIN (default 1234) to unlock confidential audit findings.'}
                </p>
              </div>
              <form onSubmit={handleUnlockAuditor} className="space-y-2.5">
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="PIN..."
                  className="w-full px-4 py-2.5 text-center font-mono text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
                {pinError && (
                  <p className="text-[11px] font-bold text-rose-600">
                    {isAr ? 'الرقم السري غير صحيح' : 'Incorrect Manager PIN'}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-4 h-4" />
                  <span>{isAr ? 'فتح ملف التحقيق السري' : 'Unlock Secret Dossier'}</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-5 rounded-3xl bg-slate-900 text-white border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-rose-600/20 border border-rose-500/40 text-rose-400 flex items-center justify-center">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black flex items-center gap-2">
                      <span>{isAr ? 'تقرير المحقق السري للتجاوزات والتسرب المالي' : 'Confidential Internal Forensic Auditor'}</span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-mono">
                        {isAr ? 'سري للمدير' : 'CONFIDENTIAL'}
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isAr
                        ? 'فحص آلي لفجوات الصندوق، المرتجعات، الخصومات المرتفعة، البيع تحت التكلفة، الإتلاف وتجاوزات الكريدي.'
                        : 'Automated audit of shift shortages, refunds, steep discounts, below-cost pricing, waste, and credit violations.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-end">
                    <div className="text-[10px] text-slate-400">{isAr ? 'مؤشر الانضباط' : 'Integrity Score'}</div>
                    <div
                      className={`text-lg font-black font-mono ${
                        auditReport.integrityScore >= 85
                          ? 'text-emerald-400'
                          : auditReport.integrityScore >= 60
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {auditReport.integrityScore}%
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleSendChat(
                        isAr
                          ? 'بصفتك المحقق السري، حلّل لي قائمة التجاوزات المرصودة حالياً وأعطني خطة فورية لإغلاق ثغرات التسرب المالي.'
                          : 'As the Secret Auditor, analyze all current anomalies and give me a concrete control plan to stop revenue leakage.',
                        'investigator'
                      )
                    }
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    <span>{isAr ? 'تحقيق Gemini في الملف السري' : 'AI Forensic Briefing'}</span>
                  </button>
                </div>
              </div>

              {auditReport.findings.length === 0 ? (
                <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? 'لا توجد تجاوزات أو ثغرات مالية مشبوهة!' : 'Zero Anomalies Detected'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr
                      ? 'جميع المناوبات، الفواتير، التسعيرات والمخزون متطابقة وبحالة سليمة 100%.'
                      : 'All shifts, discounts, pricing margins, and stock movements look clean.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {auditReport.findings.map((f) => {
                    const sevBadge =
                      f.severity === 'high'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                        : f.severity === 'medium'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                    const sevLabel =
                      f.severity === 'high'
                        ? isAr
                          ? 'خطر مرتفع'
                          : 'HIGH'
                        : f.severity === 'medium'
                        ? isAr
                          ? 'تنبيه'
                          : 'MEDIUM'
                        : isAr
                        ? 'مراقبة'
                        : 'LOW';

                    return (
                      <div
                        key={f.id}
                        className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-black text-slate-900 dark:text-white">{f.title}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${sevBadge}`}>
                            {sevLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">{f.details}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span>{f.date ? new Date(f.date).toLocaleDateString() : ''}</span>
                          {f.estimatedAmount > 0 && (
                            <span className="font-bold text-rose-600">
                              {isAr ? 'الأثر:' : 'Impact:'} {f.estimatedAmount.toFixed(2)} {currencySymbol}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Shared Section: Gemini Deep Report + Interactive AI Chat ("تشطيب معي الذكاء الاصطناعي") */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* AI Structured Report Panel */}
        <div className="xl:col-span-2 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-violet-600" />
              <span>
                {isAr ? 'التقرير المالي والضريبي العميق (Gemini AI)' : 'Gemini Deep Financial & Tax Report'}
              </span>
            </h2>
            {analysisResult && (
              <div className="px-3 py-1 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-xs font-black text-violet-700 dark:text-violet-300 font-mono">
                {isAr ? 'مؤشر الصحة المالية:' : 'Health Score:'} {analysisResult.healthScore}/100
              </div>
            )}
          </div>

          {analysisError && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{analysisError}</span>
            </div>
          )}

          {!analysisResult && !isAnalyzing && (
            <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-violet-500 mx-auto" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                {isAr
                  ? 'اضغط على زر "تشغيل التحليل الشامل بـ Gemini AI" لتوليد تشخيص مالي وضريبي متكامل واكتشاف فرص رفع الأرباح.'
                  : 'Click "Run Gemini Deep Analysis" to evaluate margins, CPU/Patente taxes, inventory waste, and growth opportunities.'}
              </p>
              <button
                type="button"
                onClick={handleRunGeminiAnalysis}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black"
              >
                {isAr ? 'ابدأ التحليل الآن' : 'Generate AI Report'}
              </button>
            </div>
          )}

          {isAnalyzing && (
            <div className="p-8 text-center space-y-2 text-xs font-bold text-slate-500">
              <RefreshCw className="w-7 h-7 animate-spin text-violet-600 mx-auto" />
              <div>
                {isAr
                  ? 'يقوم Gemini AI الآن بدراسة الفواتير، التكاليف، المخزون، التجاوزات والوضع الضريبي...'
                  : 'Gemini AI is analyzing your sales, inventory, anomalies, and tax posture...'}
              </div>
            </div>
          )}

          {analysisResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="text-[11px] font-black text-slate-500">
                    {isAr ? 'التشخيص التنفيذي' : 'Executive Diagnosis'}
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    {analysisResult.executiveSummary}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 space-y-1">
                  <div className="text-[11px] font-black text-violet-700 dark:text-violet-300">
                    {isAr ? 'الاستشارة الضريبية (CPU & الباتنتا)' : 'Tax & Patente Advisory'}
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    {analysisResult.taxAdvisory}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
                  <div className="text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                    {isAr ? 'توقعات النمو (30 يوماً)' : '30-Day Growth Forecast'}
                  </div>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    {analysisResult.growthForecast}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                <h3 className="text-xs font-black text-slate-700 dark:text-slate-300">
                  {isAr ? 'توصيات Gemini المخصصة لتحسين الربحية وتقليل الهدر:' : 'Gemini Recommendations:'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(analysisResult.recommendations || []).map((rec, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{rec.title}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
                          {rec.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        <strong className="text-slate-800 dark:text-slate-200">Driver:</strong> {rec.driver}
                      </div>
                      <div className="text-[11px] text-slate-700 dark:text-slate-300">
                        <strong className="text-emerald-700 dark:text-emerald-400">
                          {isAr ? 'الإجراء:' : 'Action:'}
                        </strong>{' '}
                        {rec.action}
                      </div>
                      {rec.estimatedMonthlyImpact && (
                        <div className="text-[11px] font-black text-emerald-600 font-mono">
                          {isAr ? 'الأثر المتوقع:' : 'Est. Impact:'} {rec.estimatedMonthlyImpact}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Interactive Financial, Tax Tutor & Secret Investigator Chat */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col h-[560px]">
          <div className="pb-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-black text-slate-900 dark:text-white">
                  {isAr ? 'الشات والتشطيب مع الذكاء الاصطناعي' : 'Interactive AI Chat & Polish'}
                </h2>
              </div>
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setChatHistory([])}
                  className="p-1 text-slate-400 hover:text-rose-500"
                  title={isAr ? 'مسح المحادثة' : 'Clear Chat'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Mode Switcher Inside Chat */}
            <div className="flex items-center gap-1">
              {(['advisor', 'tutor', 'investigator'] as ChatMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setChatMode(m)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors ${
                    chatMode === m
                      ? m === 'investigator'
                        ? 'bg-rose-600 text-white'
                        : m === 'tutor'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-violet-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {m === 'advisor'
                    ? isAr
                      ? 'مستشار وتشطيب'
                      : 'Advisor'
                    : m === 'tutor'
                    ? isAr
                      ? 'علّمني (معلم)'
                      : 'Tutor'
                    : isAr
                    ? 'المحقق السري'
                    : 'Auditor'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {chatHistory.length === 0 && (
              <div className="space-y-2.5">
                <p className="text-[11px] text-slate-500">
                  {chatMode === 'tutor'
                    ? isAr
                      ? 'اختر درساً ليشرحه لك الذكاء الاصطناعي خطوة بخطوة بأرقام متجرك:'
                      : 'Pick a financial/tax topic to learn step-by-step on your store numbers:'
                    : chatMode === 'investigator'
                    ? isAr
                      ? 'اطلب من المحقق السري فحص أخطر الثغرات والفجوات في الصندوق والمخزون:'
                      : 'Ask the Secret Auditor to examine leakage and anomalies:'
                    : isAr
                    ? 'اسأل أو اطلب تشطيب وتنقيح أي تقرير مالي أو ضريبي:'
                    : 'Ask a financial question or request report polishing:'}
                </p>
                <div className="flex flex-col gap-1.5">
                  {quickPromptsByMode[chatMode].map((qp) => (
                    <button
                      key={qp}
                      type="button"
                      onClick={() => handleSendChat(qp)}
                      className="text-start px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/40 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatHistory.map((m, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap relative group ${
                  m.role === 'user'
                    ? 'bg-slate-900 dark:bg-emerald-700 text-white ms-6'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 me-6'
                }`}
              >
                <div>{m.text}</div>
                {m.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => handleCopyText(m.text, idx)}
                    className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-violet-600"
                  >
                    {copiedIdx === idx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span>{isAr ? 'تم النسخ' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{isAr ? 'نسخ النص' : 'Copy'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}

            {isSendingChat && (
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 me-6">
                {isAr ? 'جاري التحليل والكتابة...' : 'Thinking...'}
              </div>
            )}

            {chatError && (
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                {chatError}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChat();
            }}
            className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                chatMode === 'tutor'
                  ? isAr
                    ? 'اسأل المعلم المالي والضريبي...'
                    : 'Ask the Financial & Tax Tutor...'
                  : chatMode === 'investigator'
                  ? isAr
                    ? 'اسأل المحقق السري عن التجاوزات...'
                    : 'Ask the Secret Auditor...'
                  : isAr
                  ? 'دردش أو اطلب تشطيب تقرير مالي...'
                  : 'Chat or polish a financial report...'
              }
              className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isSendingChat}
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Confirmation Modal for Bulk Actions */}
      {confirmInsight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  <Package className="w-5 h-5" />
                </div>
                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                  {isAr ? 'تأكيد تنفيذ الإجراء الجماعي (Bulk Action)' : 'Confirm Bulk Action'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmInsight(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {isAr
                ? `سيتم تطبيق "${confirmInsight.bulkLabel}" على ${confirmInsight.affectedCount} أصناف في المخزون مباشرة.`
                : `This will apply "${confirmInsight.bulkLabel}" across ${confirmInsight.affectedCount} catalog items.`}
            </p>

            {confirmInsight.affectedProducts && (
              <div className="max-h-36 overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 space-y-1 text-[11px]">
                {confirmInsight.affectedProducts.slice(0, 12).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 font-bold">
                    <span className="truncate text-slate-800 dark:text-slate-200">{p.name}</span>
                    <span className="font-mono text-slate-500 shrink-0">
                      {p.stock} | {p.price.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                ))}
                {confirmInsight.affectedProducts.length > 12 && (
                  <div className="text-center text-slate-400 pt-1">
                    +{confirmInsight.affectedProducts.length - 12} {isAr ? 'أصناف أخرى' : 'more SKUs'}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmInsight(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={executeConfirmedBulkAction}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isAr ? 'تأكيد وتنفيذ الآن' : 'Execute Bulk Action'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

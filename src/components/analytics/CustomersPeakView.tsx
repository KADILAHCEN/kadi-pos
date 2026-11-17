import React, { useMemo, useState } from 'react';
import { usePos } from '../../context/PosContext';
import {
  Users,
  Clock,
  ShoppingBag,
  Calendar,
  CreditCard,
  MessageCircle,
  Zap,
  Lock,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from 'recharts';

type TrafficLight = 'green' | 'amber' | 'red';

interface OpenHourSlot {
  hour: number;
  label: string;
  ordersCount: number;
  revenue: number;
  overtimeOrdersCount: number;
  tier: TrafficLight;
}

interface CustomerActivityRow {
  id: string;
  name: string;
  phone: string;
  visits: number;
  totalSpent: number;
  balance: number;
  daysSinceLastVisit: number | null;
  lastVisitIso: string | null;
  tier: TrafficLight;
  statusLabel: string;
}

interface CoPurchasePair {
  key: string;
  productA: string;
  productB: string;
  pairCount: number;
  confidencePct: number;
  tier: TrafficLight;
}

interface CreditDelayRow {
  id: string;
  name: string;
  phone: string;
  balance: number;
  creditLimit?: number;
  daysWaiting: number;
  lastPaymentIso: string | null;
  lastDebtIso: string | null;
  tier: TrafficLight;
  statusLabel: string;
  whatsappUrl: string | null;
}

const normalizePhoneForWa = (rawPhone: string): string | null => {
  const digits = rawPhone.replace(/[^\d+]/g, '');
  if (!digits) return null;
  let cleaned = digits.replace(/^\+/, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length >= 9) {
    // Default Moroccan country code +212 when local 06/07/05 is provided
    cleaned = `212${cleaned.slice(1)}`;
  }
  return cleaned.length >= 8 ? cleaned : null;
};

const toDateKeyLocal = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

const TRAFFIC_STYLES: Record<
  TrafficLight,
  {
    badge: string;
    dot: string;
    barHex: string;
    labelAr: string;
    labelEn: string;
  }
> = {
  green: {
    badge:
      'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    barHex: '#10b981',
    labelAr: 'أخضر',
    labelEn: 'Green'
  },
  amber: {
    badge:
      'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    dot: 'bg-amber-500',
    barHex: '#f59e0b',
    labelAr: 'أصفر',
    labelEn: 'Amber'
  },
  red: {
    badge:
      'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
    dot: 'bg-rose-500',
    barHex: '#ef4444',
    labelAr: 'أحمر',
    labelEn: 'Red'
  }
};

export const CustomersPeakView: React.FC = () => {
  const {
    orders,
    customers,
    creditTransactions,
    currentShift,
    shiftsHistory,
    currentEmergencySession,
    emergencySessions,
    openEmergencySession,
    closeEmergencySession,
    todayEmergencyStats,
    settings,
    currencySymbol,
    language,
    isDark,
    setCurrentTab
  } = usePos();

  const isAr = language === 'ar';
  const [trafficFilter, setTrafficFilter] = useState<'all' | TrafficLight>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [jumuahCutoff, setJumuahCutoff] = useState<string>(() => {
    try {
      return localStorage.getItem('kadi_pos_jumuah_cutoff') || '13:30';
    } catch {
      return '13:30';
    }
  });

  const handleJumuahCutoffChange = (val: string) => {
    setJumuahCutoff(val);
    try {
      localStorage.setItem('kadi_pos_jumuah_cutoff', val);
    } catch {
      // Ignore storage quota issues
    }
  };

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === 'completed'),
    [orders]
  );

  // =========================================================================
  // 1. PEAK HOURS (STRICTLY FROM HOURS WHEN CASH DRAWER WAS OPEN)
  // =========================================================================
  const peakAnalysis = useMemo(() => {
    const openHoursSet = new Set<number>();
    const nowMs = Date.now();

    // Collect open hours from regular shifts + currentShift
    const allShifts = [currentShift, ...shiftsHistory].filter(Boolean);
    allShifts.forEach((sh) => {
      if (!sh.openedAt) return;
      const startMs = new Date(sh.openedAt).getTime();
      if (Number.isNaN(startMs)) return;
      const endMs =
        sh.status === 'open'
          ? nowMs
          : sh.closedAt
          ? new Date(sh.closedAt).getTime()
          : startMs;
      if (Number.isNaN(endMs) || endMs < startMs) return;

      // Walk hour-by-hour up to max 48h per shift to avoid runaway loops
      const cappedEnd = Math.min(endMs, startMs + 48 * 3600 * 1000);
      const cursor = new Date(startMs);
      cursor.setMinutes(0, 0, 0);
      while (cursor.getTime() <= cappedEnd) {
        openHoursSet.add(cursor.getHours());
        cursor.setHours(cursor.getHours() + 1);
      }
    });

    // Include hours from emergency sessions
    const allEmergency = [
      ...(currentEmergencySession ? [currentEmergencySession] : []),
      ...emergencySessions
    ];
    allEmergency.forEach((sess) => {
      const startMs = new Date(sess.openedAt).getTime();
      if (Number.isNaN(startMs)) return;
      const endMs =
        sess.status === 'open'
          ? nowMs
          : sess.closedAt
          ? new Date(sess.closedAt).getTime()
          : startMs;
      const cappedEnd = Math.min(Math.max(endMs, startMs), startMs + 24 * 3600 * 1000);
      const cursor = new Date(startMs);
      cursor.setMinutes(0, 0, 0);
      while (cursor.getTime() <= cappedEnd) {
        openHoursSet.add(cursor.getHours());
        cursor.setHours(cursor.getHours() + 1);
      }
    });

    // Any hour where an actual sale happened was obviously open at that moment
    const hourStats = new Map<
      number,
      { ordersCount: number; revenue: number; overtimeOrdersCount: number }
    >();
    completedOrders.forEach((o) => {
      const d = new Date(o.date);
      if (Number.isNaN(d.getTime())) return;
      const hr = d.getHours();
      openHoursSet.add(hr);
      const prev = hourStats.get(hr) || { ordersCount: 0, revenue: 0, overtimeOrdersCount: 0 };
      hourStats.set(hr, {
        ordersCount: prev.ordersCount + 1,
        revenue: prev.revenue + o.grandTotal,
        overtimeOrdersCount: prev.overtimeOrdersCount + (o.isEmergencyOvertime ? 1 : 0)
      });
    });

    const sortedHours = Array.from(openHoursSet).sort((a, b) => a - b);
    const maxOrders = Math.max(
      1,
      ...sortedHours.map((h) => hourStats.get(h)?.ordersCount || 0)
    );
    const maxRev = Math.max(
      1,
      ...sortedHours.map((h) => hourStats.get(h)?.revenue || 0)
    );

    const slots: OpenHourSlot[] = sortedHours.map((hr) => {
      const st = hourStats.get(hr) || { ordersCount: 0, revenue: 0, overtimeOrdersCount: 0 };
      const orderRatio = st.ordersCount / maxOrders;
      const revRatio = st.revenue / maxRev;
      const score = Math.max(orderRatio, revRatio);

      let tier: TrafficLight = 'green';
      if (st.ordersCount > 0) {
        if (score >= 0.7) tier = 'red';
        else if (score >= 0.35) tier = 'amber';
      }

      return {
        hour: hr,
        label: `${String(hr).padStart(2, '0')}:00`,
        ordersCount: st.ordersCount,
        revenue: Number(st.revenue.toFixed(2)),
        overtimeOrdersCount: st.overtimeOrdersCount,
        tier
      };
    });

    const peakHour = [...slots].sort((a, b) => b.ordersCount - a.ordersCount || b.revenue - a.revenue)[0];
    const quietHour = [...slots]
      .filter((s) => s.ordersCount > 0)
      .sort((a, b) => a.ordersCount - b.ordersCount || a.revenue - b.revenue)[0];

    return {
      slots,
      openHoursCount: slots.length,
      excludedClosedHoursCount: Math.max(0, 24 - slots.length),
      peakHour,
      quietHour
    };
  }, [currentShift, shiftsHistory, currentEmergencySession, emergencySessions, completedOrders]);

  // =========================================================================
  // 2. CUSTOMER ACTIVITY (FREQUENT VS DISAPPEARED)
  // =========================================================================
  const customerActivity = useMemo<CustomerActivityRow[]>(() => {
    const nowMs = Date.now();
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        visits: number;
        totalSpent: number;
        balance: number;
        lastVisitMs: number | null;
        createdAtMs: number;
      }
    >();

    customers.forEach((c) => {
      const createdMs = new Date(c.createdAt).getTime();
      map.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.phone || '',
        visits: c.ordersCount || 0,
        totalSpent: c.totalSpent || 0,
        balance: c.balance || 0,
        lastVisitMs: null,
        createdAtMs: Number.isNaN(createdMs) ? nowMs : createdMs
      });
    });

    const orderVisitsByCustomer = new Map<string, { count: number; spent: number; lastMs: number }>();
    completedOrders.forEach((o) => {
      if (!o.customerId && !o.customerName) return;
      const key =
        o.customerId ||
        customers.find(
          (c) => c.name.trim().toLowerCase() === (o.customerName || '').trim().toLowerCase()
        )?.id ||
        `name:${o.customerName}`;
      const orderMs = new Date(o.date).getTime();
      if (Number.isNaN(orderMs)) return;

      const prev = orderVisitsByCustomer.get(key) || { count: 0, spent: 0, lastMs: 0 };
      orderVisitsByCustomer.set(key, {
        count: prev.count + 1,
        spent: prev.spent + o.grandTotal,
        lastMs: Math.max(prev.lastMs, orderMs)
      });

      if (!map.has(key) && o.customerName) {
        map.set(key, {
          id: key,
          name: o.customerName,
          phone: o.customerPhone || '',
          visits: 0,
          totalSpent: 0,
          balance: 0,
          lastVisitMs: null,
          createdAtMs: orderMs
        });
      }
    });

    const rows: CustomerActivityRow[] = [];
    map.forEach((entry, key) => {
      const fromOrders = orderVisitsByCustomer.get(key);
      const visits = Math.max(entry.visits, fromOrders?.count || 0);
      const totalSpent = Number(Math.max(entry.totalSpent, fromOrders?.spent || 0).toFixed(2));
      const lastMs = fromOrders?.lastMs || (visits > 0 ? entry.createdAtMs : null);
      const daysSince =
        lastMs !== null ? Math.max(0, Math.floor((nowMs - lastMs) / 86400000)) : null;

      let tier: TrafficLight = 'amber';
      let statusLabel = isAr ? 'حضور متقطع' : 'Moderate';

      if (daysSince === null) {
        tier = 'red';
        statusLabel = isAr ? 'غبر (ما تسجلش ليه شراء)' : 'Inactive';
      } else if (daysSince > 21) {
        tier = 'red';
        statusLabel = isAr ? `غبر منذ ${daysSince} يوم` : `Absent ${daysSince}d`;
      } else if (daysSince <= 7 && visits >= 2) {
        tier = 'green';
        statusLabel = isAr ? 'كيجي بزاف (زبون وفي)' : 'Frequent Regular';
      } else if (visits >= 4 && daysSince <= 14) {
        tier = 'green';
        statusLabel = isAr ? 'كيجي بزاف' : 'Frequent';
      } else if (daysSince <= 7) {
        tier = 'green';
        statusLabel = isAr ? 'جاء هاد الأسبوع' : 'Active This Week';
      } else {
        tier = 'amber';
        statusLabel = isAr ? `تباطأ (${daysSince} يوم)` : `Slowing (${daysSince}d)`;
      }

      rows.push({
        id: entry.id,
        name: entry.name,
        phone: entry.phone,
        visits,
        totalSpent,
        balance: entry.balance,
        daysSinceLastVisit: daysSince,
        lastVisitIso: lastMs ? new Date(lastMs).toISOString() : null,
        tier,
        statusLabel
      });
    });

    // Sort: most frequent & active first, or sort nicely so disappeared stand out when filtered
    return rows.sort((a, b) => b.visits - a.visits || b.totalSpent - a.totalSpent);
  }, [customers, completedOrders, isAr]);

  // =========================================================================
  // 3. MARKET BASKET CO-PURCHASES ("اللي شرا هادي، شرا معاها هادي")
  // =========================================================================
  const coPurchases = useMemo<CoPurchasePair[]>(() => {
    const itemSupport = new Map<string, number>();
    const pairCounts = new Map<string, { a: string; b: string; count: number }>();

    completedOrders.forEach((o) => {
      const uniqueNames = Array.from(
        new Set(o.items.map((it) => it.productName.trim()).filter(Boolean))
      );
      uniqueNames.forEach((name) => {
        itemSupport.set(name, (itemSupport.get(name) || 0) + 1);
      });
      if (uniqueNames.length < 2) return;

      for (let i = 0; i < uniqueNames.length; i += 1) {
        for (let j = i + 1; j < uniqueNames.length; j += 1) {
          const [first, second] = [uniqueNames[i], uniqueNames[j]].sort((x, y) =>
            x.localeCompare(y, 'ar')
          );
          const pairKey = `${first}|||${second}`;
          const prev = pairCounts.get(pairKey);
          if (prev) {
            prev.count += 1;
          } else {
            pairCounts.set(pairKey, { a: first, b: second, count: 1 });
          }
        }
      }
    });

    const maxPair = Math.max(1, ...Array.from(pairCounts.values()).map((p) => p.count));
    return Array.from(pairCounts.entries())
      .map(([key, val]) => {
        const supportA = itemSupport.get(val.a) || 1;
        const supportB = itemSupport.get(val.b) || 1;
        const dominantAnchor = supportA >= supportB ? val.a : val.b;
        const companion = dominantAnchor === val.a ? val.b : val.a;
        const anchorSupport = Math.max(1, Math.min(supportA, supportB));
        const confidencePct = Math.min(100, Math.round((val.count / anchorSupport) * 100));

        let tier: TrafficLight = 'amber';
        if (val.count >= 3 || (val.count >= maxPair * 0.7 && confidencePct >= 45)) {
          tier = 'green';
        } else if (val.count === 1 && confidencePct < 25) {
          tier = 'red';
        }

        return {
          key,
          productA: dominantAnchor,
          productB: companion,
          pairCount: val.count,
          confidencePct,
          tier
        };
      })
      .sort((a, b) => b.pairCount - a.pairCount || b.confidencePct - a.confidencePct)
      .slice(0, 10);
  }, [completedOrders]);

  // =========================================================================
  // 4. FRIDAY ANALYSIS (BEFORE PRAYER VS AFTER PRAYER)
  // =========================================================================
  const fridayAnalysis = useMemo(() => {
    const [cutH, cutM] = jumuahCutoff.split(':').map((n) => Number(n) || 0);
    const cutoffMinutes = cutH * 60 + cutM;

    const fridayOrders = completedOrders.filter((o) => {
      const d = new Date(o.date);
      return !Number.isNaN(d.getTime()) && d.getDay() === 5;
    });

    const buildBucket = (list: typeof fridayOrders) => {
      const totalSales = Number(list.reduce((s, o) => s + o.grandTotal, 0).toFixed(2));
      const ordersCount = list.length;
      const avgTicket = ordersCount > 0 ? Number((totalSales / ordersCount).toFixed(2)) : 0;
      const cashSales = Number(
        list
          .filter((o) => o.paymentMethod === 'cash')
          .reduce((s, o) => s + o.grandTotal, 0)
          .toFixed(2)
      );
      const creditSales = Number(
        list
          .filter((o) => o.paymentMethod === 'credit')
          .reduce((s, o) => s + o.grandTotal, 0)
          .toFixed(2)
      );
      const itemQty = new Map<string, number>();
      list.forEach((o) => {
        o.items.forEach((it) => {
          itemQty.set(it.productName, (itemQty.get(it.productName) || 0) + it.quantity);
        });
      });
      const topItems = Array.from(itemQty.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, qty]) => ({ name, qty: Number(qty.toFixed(1)) }));

      return { totalSales, ordersCount, avgTicket, cashSales, creditSales, topItems };
    };

    const beforeList = fridayOrders.filter((o) => {
      const d = new Date(o.date);
      return d.getHours() * 60 + d.getMinutes() < cutoffMinutes;
    });
    const afterList = fridayOrders.filter((o) => {
      const d = new Date(o.date);
      return d.getHours() * 60 + d.getMinutes() >= cutoffMinutes;
    });

    const before = buildBucket(beforeList);
    const after = buildBucket(afterList);

    const strongerPeriod: 'before' | 'after' | 'equal' =
      before.totalSales > after.totalSales
        ? 'before'
        : after.totalSales > before.totalSales
        ? 'after'
        : 'equal';

    return {
      totalFridayOrders: fridayOrders.length,
      before,
      after,
      strongerPeriod
    };
  }, [completedOrders, jumuahCutoff]);

  // =========================================================================
  // 5. CREDIT DELAY ANALYSIS + WHATSAPP BUTTON
  // =========================================================================
  const creditDelayRows = useMemo<CreditDelayRow[]>(() => {
    const nowMs = Date.now();
    const storeName = settings.storeName || 'المحل';

    return customers
      .filter((c) => c.balance > 0)
      .map((c) => {
        const custTx = creditTransactions
          .filter((tx) => tx.customerId === c.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const lastPayment = custTx.find((tx) => tx.type === 'payment');
        const oldestDebt = [...custTx].reverse().find((tx) => tx.type === 'debt');
        const latestDebt = custTx.find((tx) => tx.type === 'debt');

        const refIso =
          lastPayment?.date || oldestDebt?.date || latestDebt?.date || c.createdAt;
        const refMs = new Date(refIso).getTime();
        const daysWaiting = Number.isNaN(refMs)
          ? 0
          : Math.max(0, Math.floor((nowMs - refMs) / 86400000));

        const overLimit = c.creditLimit !== undefined && c.creditLimit > 0 && c.balance >= c.creditLimit;
        const nearLimit =
          c.creditLimit !== undefined && c.creditLimit > 0 && c.balance >= c.creditLimit * 0.75;

        let tier: TrafficLight = 'green';
        let statusLabel = isAr ? 'منتظم' : 'On Track';

        if (daysWaiting >= 15 || overLimit) {
          tier = 'red';
          statusLabel = overLimit
            ? isAr
              ? `متجاوز السقف (${daysWaiting} يوم)`
              : `Over Limit (${daysWaiting}d)`
            : isAr
            ? `متعطل (${daysWaiting} يوم)`
            : `Delayed (${daysWaiting}d)`;
        } else if (daysWaiting >= 7 || nearLimit) {
          tier = 'amber';
          statusLabel = isAr ? `قرب يتعطل (${daysWaiting} يوم)` : `Approaching (${daysWaiting}d)`;
        } else {
          tier = 'green';
          statusLabel = isAr ? `جديد / منتظم (${daysWaiting} يوم)` : `Current (${daysWaiting}d)`;
        }

        const waPhone = normalizePhoneForWa(c.phone || '');
        const waMessage = isAr
          ? `السلام عليكم سي ${c.name}، تحية طيبة من ${storeName}. تذكير ودي بخصوص حساب الكريدي الباقي عليك: ${c.balance.toFixed(
              2
            )} ${currencySymbol}. الله يسهل الأمور وبارك الله فيك.`
          : `Bonjour ${c.name}, petit rappel amical de ${storeName} concernant votre solde crédit de ${c.balance.toFixed(
              2
            )} ${currencySymbol}. Merci !`;
        const whatsappUrl = waPhone
          ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`
          : null;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone || '',
          balance: Number(c.balance.toFixed(2)),
          creditLimit: c.creditLimit,
          daysWaiting,
          lastPaymentIso: lastPayment?.date || null,
          lastDebtIso: latestDebt?.date || null,
          tier,
          statusLabel,
          whatsappUrl
        };
      })
      .sort((a, b) => {
        const rank: Record<TrafficLight, number> = { red: 0, amber: 1, green: 2 };
        if (rank[a.tier] !== rank[b.tier]) return rank[a.tier] - rank[b.tier];
        return b.daysWaiting - a.daysWaiting || b.balance - a.balance;
      });
  }, [customers, creditTransactions, settings.storeName, currencySymbol, isAr]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customerActivity.filter((c) => {
      if (trafficFilter !== 'all' && c.tier !== trafficFilter) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customerActivity, trafficFilter, searchQuery]);

  const filteredCredits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return creditDelayRows.filter((c) => {
      if (trafficFilter !== 'all' && c.tier !== trafficFilter) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [creditDelayRows, trafficFilter, searchQuery]);

  const summaryCounts = useMemo(() => {
    return {
      frequentGreen: customerActivity.filter((c) => c.tier === 'green').length,
      disappearedRed: customerActivity.filter((c) => c.tier === 'red').length,
      delayedCreditRed: creditDelayRows.filter((c) => c.tier === 'red').length,
      delayedCreditTotal: Number(
        creditDelayRows.filter((c) => c.tier === 'red').reduce((s, c) => s + c.balance, 0).toFixed(2)
      )
    };
  }, [customerActivity, creditDelayRows]);

  const allEmergencyLog = useMemo(() => {
    const map = new Map<string, (typeof emergencySessions)[number]>();
    emergencySessions.forEach((s) => map.set(s.id, s));
    if (currentEmergencySession) map.set(currentEmergencySession.id, currentEmergencySession);
    return Array.from(map.values())
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
      .slice(0, 6);
  }, [emergencySessions, currentEmergencySession]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 space-y-5">
      {/* Page Header & Unified Traffic-Light Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isAr ? 'الزبناء و الذروة' : 'Customers & Peak Hours'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'أوقات الذروة (غير من الصندوق محلول) · وفاء الزبناء · المشتريات مع بعضها · الجمعة · تأخير الكريدي و واتساب'
              : 'Open-drawer peak hours · customer frequency · basket pairs · Friday split · credit delays'}
          </p>
        </div>

        {/* Traffic-light filter + search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث باسم الزبون...' : 'Search customer...'}
              className="ps-8 pe-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 w-44 sm:w-52"
            />
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 gap-1">
            {(
              [
                { id: 'all', label: isAr ? 'الكل' : 'All', dot: 'bg-slate-400' },
                { id: 'green', label: isAr ? 'أخضر' : 'Green', dot: 'bg-emerald-500' },
                { id: 'amber', label: isAr ? 'أصفر' : 'Amber', dot: 'bg-amber-500' },
                { id: 'red', label: isAr ? 'أحمر' : 'Red', dot: 'bg-rose-500' }
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setTrafficFilter(btn.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  trafficFilter === btn.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${btn.dot}`} />
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* EMERGENCY RE-OPENING & OVERTIME SALES ("الفتح الاستعجالي والوقت بدل الضائع") */}
      {/* =================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg ${
                  currentEmergencySession?.status === 'open'
                    ? TRAFFIC_STYLES.amber.badge
                    : currentShift.status === 'open'
                    ? TRAFFIC_STYLES.green.badge
                    : TRAFFIC_STYLES.red.badge
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    currentEmergencySession?.status === 'open'
                      ? TRAFFIC_STYLES.amber.dot
                      : currentShift.status === 'open'
                      ? TRAFFIC_STYLES.green.dot
                      : TRAFFIC_STYLES.red.dot
                  }`}
                />
                <span>
                  {currentShift.status === 'open'
                    ? isAr
                      ? 'الصندوق مفتوح (وردية عادية)'
                      : 'Drawer Open (Regular Shift)'
                    : currentEmergencySession?.status === 'open'
                    ? isAr
                      ? 'أصفر · فتح استعجالي مفتوح (بلا مدة محدودة)'
                      : 'Amber · Emergency Open (Unlimited)'
                    : isAr
                    ? 'أحمر · الصندوق مسدود'
                    : 'Red · Drawer Closed'}
                </span>
              </span>

              {currentEmergencySession?.status === 'open' && (
                <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {isAr ? 'تحلّ على:' : 'Opened at:'}{' '}
                  {new Date(currentEmergencySession.openedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}{' '}
                  · {isAr ? 'يتسد غير بيدك' : 'Manual close only'}
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {isAr
                ? `اليوم حليتي استعجالي ${todayEmergencyStats.openingsCount} مرات، و جاوك ${todayEmergencyStats.customersCount} زبون من بعد السدان`
                : `Today you opened emergency ${todayEmergencyStats.openingsCount} times, with ${todayEmergencyStats.customersCount} customers after closing`}
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'حساب الوقت بدل الضائع كيتعزل على مبيعات الوردية العادية باش تعرف بالضبط شحال بعتي من بعد السدان، وبلا ما يتسد بوحدو في 5 ولا 10 دقائق.'
                : 'Overtime sales after closing are tracked separately without any auto-close countdown timer.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {isAr ? 'مبيعات الوقت بدل الضائع اليوم' : 'Today Overtime Sales'}
              </div>
              <div className="text-base font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {todayEmergencyStats.totalSales.toFixed(2)} {currencySymbol}
              </div>
            </div>

            {currentShift.status === 'closed' ? (
              currentEmergencySession?.status === 'open' ? (
                <button
                  type="button"
                  onClick={() => closeEmergencySession()}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إغلاق الفتح الاستعجالي بيدي' : 'Close Emergency'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openEmergencySession()}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isAr ? 'فتح استعجالي (بلا مدة)' : 'Emergency Open'}</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => setCurrentTab('shifts')}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                {isAr ? 'إدارة الصندوق والوردية' : 'Manage Drawer'}
              </button>
            )}
          </div>
        </div>

        {/* Recent emergency sessions table if any */}
        {allEmergencyLog.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {allEmergencyLog.map((sess) => {
              const custCnt = Math.max(sess.customerKeys.length, sess.ordersCount);
              return (
                <div
                  key={sess.id}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {toDateKeyLocal(sess.openedAt)} ·{' '}
                      <span className="font-mono tabular-nums">
                        {new Date(sess.openedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        {sess.closedAt
                          ? ` - ${new Date(sess.closedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}`
                          : ` - ${isAr ? 'مفتوح' : 'Open'}`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {custCnt} {isAr ? 'زبون' : 'customers'} · {sess.ordersCount}{' '}
                      {isAr ? 'عملية بيع' : 'orders'}
                    </div>
                  </div>
                  <div className="font-black font-mono tabular-nums text-amber-700 dark:text-amber-300 shrink-0">
                    {sess.totalSales.toFixed(2)} {currencySymbol}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Top 4 KPI Summary Strip (Green / Amber / Red explicitly labeled) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'أكثر ساعة ذروة (محلول)' : 'Top Open Peak Hour'}</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {peakAnalysis.peakHour ? peakAnalysis.peakHour.label : '--:--'}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${TRAFFIC_STYLES.red.badge}`}>
              {isAr ? 'أحمر · ذروة' : 'Red · Peak'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {peakAnalysis.peakHour
              ? `${peakAnalysis.peakHour.ordersCount} ${isAr ? 'زبون' : 'orders'} · ${peakAnalysis.peakHour.revenue.toFixed(0)} ${currencySymbol}`
              : isAr
              ? 'لا توجد مبيعات مسجلة'
              : 'No orders yet'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'زبناء كيجيو بزاف' : 'Frequent Customers'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {summaryCounts.frequentGreen}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${TRAFFIC_STYLES.green.badge}`}>
              {isAr ? 'أخضر · نشيط' : 'Green · Active'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {isAr ? `من أصل ${customerActivity.length} زبون مسجل` : `of ${customerActivity.length} customers`}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'زبناء غبرو (>21 يوم)' : 'Disappeared (>21d)'}</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {summaryCounts.disappearedRed}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${TRAFFIC_STYLES.red.badge}`}>
              {isAr ? 'أحمر · غبر' : 'Red · Absent'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {isAr ? 'كيستحقو تواصل أو تذكير' : 'Needs follow-up'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{isAr ? 'كريدي متعطل (أحمر)' : 'Overdue Credit'}</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400">
              {summaryCounts.delayedCreditRed}
            </span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${TRAFFIC_STYLES.red.badge}`}>
              {isAr ? 'أحمر · متأخر' : 'Red · Overdue'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {summaryCounts.delayedCreditTotal.toFixed(2)} {currencySymbol}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SECTION 1: PEAK HOURS (ONLY OPEN REGISTER HOURS) */}
      {/* =================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <span>
                {isAr
                  ? '1. أوقات الذروة — غير من الوقت اللي الصندوق محلول فيه'
                  : '1. Peak Hours (Strictly Open Drawer Hours)'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? `تم حساب ${peakAnalysis.openHoursCount} ساعة مفتوحة واستبعاد ${peakAnalysis.excludedClosedHoursCount} ساعة كان الصندوق مسدود فيها.`
                : `Computed across ${peakAnalysis.openHoursCount} open hours (${peakAnalysis.excludedClosedHoursCount} closed hours excluded).`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span className={`px-2 py-0.5 rounded-md ${TRAFFIC_STYLES.red.badge}`}>
              {isAr ? 'أحمر · ذروة' : 'Red · Peak'}
            </span>
            <span className={`px-2 py-0.5 rounded-md ${TRAFFIC_STYLES.amber.badge}`}>
              {isAr ? 'أصفر · متوسط' : 'Amber · Busy'}
            </span>
            <span className={`px-2 py-0.5 rounded-md ${TRAFFIC_STYLES.green.badge}`}>
              {isAr ? 'أخضر · هادئ' : 'Green · Calm'}
            </span>
          </div>
        </div>

        {peakAnalysis.slots.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'افتح الصندوق وسجل مبيعات باش يبانو أوقات الذروة الحقيقية.'
              : 'Open the cash drawer and record sales to analyze open peak hours.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={peakAnalysis.slots}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="peakRevGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: isDark ? '#60a5fa' : '#2563eb' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}
                    formatter={(val, name) => [
                      name === 'ordersCount'
                        ? `${val ?? 0} ${isAr ? 'زبون/فاتورة' : 'orders'}`
                        : `${Number(val ?? 0).toFixed(2)} ${currencySymbol}`,
                      name === 'ordersCount'
                        ? isAr
                          ? 'الزبناء'
                          : 'Orders'
                        : isAr
                        ? 'المداخيل الزمنية'
                        : 'Revenue Timeline'
                    ]}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#peakRevGradient)"
                  />
                  <Bar yAxisId="left" dataKey="ordersCount" radius={[6, 6, 0, 0]} barSize={22}>
                    {peakAnalysis.slots.map((slot) => (
                      <Cell key={slot.hour} fill={TRAFFIC_STYLES[slot.tier].barHex} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
              {peakAnalysis.slots
                .slice()
                .sort((a, b) => b.ordersCount - a.ordersCount || b.revenue - a.revenue)
                .map((slot) => (
                  <div
                    key={slot.hour}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${TRAFFIC_STYLES[slot.tier].dot}`} />
                      <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {slot.label}
                      </span>
                      {slot.overtimeOrdersCount > 0 && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                          · {slot.overtimeOrdersCount} {isAr ? 'استعجالي' : 'overtime'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 font-mono tabular-nums">
                      <span className="text-slate-500 dark:text-slate-400">
                        {slot.ordersCount} {isAr ? 'طلب' : 'ord'}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {slot.revenue.toFixed(0)} {currencySymbol}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* SECTIONS 2 & 3: CUSTOMER ACTIVITY + CO-PURCHASE PAIRS */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* SECTION 2: CUSTOMER ACTIVITY */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" />
                <span>{isAr ? '2. تحليل الزبناء — شكون كيجي بزاف و شكون غبر' : '2. Customer Frequency'}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'أخضر: كيجي بزاف · أصفر: متقطع · أحمر: غبر أكثر من 21 يوم'
                  : 'Green: frequent · Amber: moderate · Red: absent > 21d'}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredCustomers.length} {isAr ? 'زبون' : 'customers'}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {filteredCustomers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                {isAr ? 'ما كاين حتى زبون مطابق للفلتر' : 'No matching customers'}
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const waPhone = normalizePhoneForWa(cust.phone);
                const checkInMsg = isAr
                  ? `السلام عليكم سي ${cust.name}، توحشناك في ${settings.storeName || 'المحل'}، مرحبا بيك في أي وقت!`
                  : `Bonjour ${cust.name}, nous espérons vous revoir bientôt chez ${settings.storeName || 'notre boutique'} !`;
                return (
                  <div
                    key={cust.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {cust.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                            TRAFFIC_STYLES[cust.tier].badge
                          }`}
                        >
                          {TRAFFIC_STYLES[cust.tier].labelAr} · {cust.statusLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                        {cust.visits} {isAr ? 'زيارة' : 'visits'} · {cust.totalSpent.toFixed(0)}{' '}
                        {currencySymbol}
                        {cust.phone ? ` · ${cust.phone}` : ''}
                      </div>
                    </div>

                    {cust.tier === 'red' && waPhone && (
                      <a
                        href={`https://wa.me/${waPhone}?text=${encodeURIComponent(checkInMsg)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{isAr ? 'سول فيه' : 'Ping'}</span>
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* SECTION 3: MARKET BASKET CO-PURCHASES */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-500" />
                <span>
                  {isAr
                    ? '3. المشتريات مع بعضها — "اللي شرا هادي، شرا معاها هادي"'
                    : '3. Frequently Bought Together'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr
                  ? 'منتجات كيتباعو ديما في نفس الفاتورة باش تحطهم قراب لبعضياتهم.'
                  : 'Product pairs appearing together on the same receipt.'}
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {coPurchases.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'مازال ما كايناش فواتير فيها أكثر من منتج واحد باش يبان الارتباط بين السلع.'
                  : 'Multi-item receipts are needed to discover product pairs.'}
              </div>
            ) : (
              coPurchases.map((pair) => (
                <div
                  key={pair.key}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {isAr ? (
                        <>
                          اللي شرا <span className="text-emerald-600 dark:text-emerald-400">{pair.productA}</span>
                          ، شرا معاها{' '}
                          <span className="text-amber-600 dark:text-amber-400">{pair.productB}</span>
                        </>
                      ) : (
                        <>
                          {pair.productA} + {pair.productB}
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                      {isAr
                        ? `تجمعو ${pair.pairCount} مرات · نسبة الترابط ${pair.confidencePct}%`
                        : `${pair.pairCount}x together · ${pair.confidencePct}% confidence`}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                      TRAFFIC_STYLES[pair.tier].badge
                    }`}
                  >
                    {TRAFFIC_STYLES[pair.tier].labelAr} ·{' '}
                    {pair.tier === 'green'
                      ? isAr
                        ? 'ثنائي قوي'
                        : 'Strong'
                      : pair.tier === 'amber'
                      ? isAr
                        ? 'متوسط'
                        : 'Medium'
                      : isAr
                      ? 'عابر'
                      : 'Low'}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* =================================================================== */}
      {/* SECTION 4: FRIDAY ANALYSIS (BEFORE VS AFTER JUMUAH PRAYER) */}
      {/* =================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <span>
                {isAr ? '4. تحليل الجمعة — قبل الصلاة و من بعد الصلاة' : '4. Friday Pre/Post Prayer'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? `تحليل ${fridayAnalysis.totalFridayOrders} فاتورة يوم الجمعة مقارنة بساعة الصلاة`
                : `Analyzing ${fridayAnalysis.totalFridayOrders} Friday orders around Jumuah time`}
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>{isAr ? 'وقت صلاة الجمعة:' : 'Prayer Cutoff:'}</span>
            <input
              type="time"
              value={jumuahCutoff}
              onChange={(e) => handleJumuahCutoffChange(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              key: 'before' as const,
              title: isAr ? `قبل صلاة الجمعة (قبل ${jumuahCutoff})` : `Before Prayer (< ${jumuahCutoff})`,
              data: fridayAnalysis.before,
              tier:
                fridayAnalysis.before.ordersCount === 0
                  ? ('red' as TrafficLight)
                  : fridayAnalysis.strongerPeriod === 'before'
                  ? ('green' as TrafficLight)
                  : ('amber' as TrafficLight)
            },
            {
              key: 'after' as const,
              title: isAr ? `من بعد صلاة الجمعة (بعد ${jumuahCutoff})` : `After Prayer (>= ${jumuahCutoff})`,
              data: fridayAnalysis.after,
              tier:
                fridayAnalysis.after.ordersCount === 0
                  ? ('red' as TrafficLight)
                  : fridayAnalysis.strongerPeriod === 'after'
                  ? ('green' as TrafficLight)
                  : ('amber' as TrafficLight)
            }
          ].map((block) => (
            <div
              key={block.key}
              className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{block.title}</h3>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    TRAFFIC_STYLES[block.tier].badge
                  }`}
                >
                  {TRAFFIC_STYLES[block.tier].labelAr} ·{' '}
                  {block.data.ordersCount === 0
                    ? isAr
                      ? 'بلا مبيعات'
                      : 'No Sales'
                    : fridayAnalysis.strongerPeriod === block.key
                    ? isAr
                      ? 'الفترة الأقوى'
                      : 'Higher Sales'
                    : isAr
                    ? 'نشاط ثانوي'
                    : 'Secondary'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'المدخول' : 'Sales'}
                  </div>
                  <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {block.data.totalSales.toFixed(2)} {currencySymbol}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'الفواتير' : 'Orders'}
                  </div>
                  <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {block.data.ordersCount}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isAr ? 'معدل السلة' : 'Avg Ticket'}
                  </div>
                  <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {block.data.avgTicket.toFixed(2)} {currencySymbol}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="font-bold">{isAr ? 'الأكثر طلباً:' : 'Top Items:'}</span>{' '}
                {block.data.topItems.length > 0
                  ? block.data.topItems.map((it) => `${it.name} (${it.qty})`).join(' · ')
                  : isAr
                  ? 'ما كايناش مبيعات يوم الجمعة مسجلة في هاد الفترة'
                  : 'No Friday orders recorded in this window'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 5: CREDIT DELAY ANALYSIS + WHATSAPP BUTTON */}
      {/* =================================================================== */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-rose-500" />
              <span>
                {isAr ? '5. تحليل الكريدي — شكون كيتعطل و زر واتساب' : '5. Credit Delays & WhatsApp'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'أحمر: متعطل (+15 يوم أو وصل السقف) · أصفر: قريب يتعطل (7-14 يوم) · أخضر: منتظم'
                : 'Red: overdue (15+ days or over limit) · Amber: approaching (7-14d) · Green: current'}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {filteredCredits.length} {isAr ? 'حساب بالكريدي' : 'credit accounts'}
          </span>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-bold text-start">{isAr ? 'الزبون' : 'Customer'}</th>
                <th className="py-2.5 px-3 font-bold text-start">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'الباقي (كريدي)' : 'Balance'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'مدة التأخير' : 'Days'}</th>
                <th className="py-2.5 px-3 font-bold text-end">{isAr ? 'تذكير واتساب' : 'WhatsApp'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCredits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    {isAr ? 'ما كاين حتى زبون عليه كريدي مطابق لهادا الفلتر' : 'No credit balances matching filter'}
                  </td>
                </tr>
              ) : (
                filteredCredits.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">{row.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {row.phone || (isAr ? 'بلا رقم هاتف' : 'No phone')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          TRAFFIC_STYLES[row.tier].badge
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${TRAFFIC_STYLES[row.tier].dot}`} />
                        <span>
                          {TRAFFIC_STYLES[row.tier].labelAr} · {row.statusLabel}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-end font-black font-mono tabular-nums text-rose-600 dark:text-rose-400">
                      {row.balance.toFixed(2)} {currencySymbol}
                    </td>
                    <td className="py-2.5 px-3 text-end font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.daysWaiting} {isAr ? 'يوم' : 'd'}
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      {row.whatsappUrl ? (
                        <a
                          href={row.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentTab('customers')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold transition-colors whitespace-nowrap"
                        >
                          <span>{isAr ? 'أضف الرقم' : 'Add Phone'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

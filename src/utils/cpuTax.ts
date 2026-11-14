import {
  CpuCnssBracket,
  CpuQuarterId,
  CpuQuarterRecord,
  CpuTaxSettings
} from '../types';

export const DEFAULT_CNSS_BRACKETS: CpuCnssBracket[] = [
  {
    id: 'cnss-1',
    label: 'الشريحة 1 (ضريبة سنوية ≤ 500 د.م)',
    minAnnualTax: 0,
    maxAnnualTax: 500,
    monthlyAmo: 100
  },
  {
    id: 'cnss-2',
    label: 'الشريحة 2 (501 – 1,000 د.م)',
    minAnnualTax: 500.01,
    maxAnnualTax: 1000,
    monthlyAmo: 130
  },
  {
    id: 'cnss-3',
    label: 'الشريحة 3 (1,001 – 2,500 د.م)',
    minAnnualTax: 1000.01,
    maxAnnualTax: 2500,
    monthlyAmo: 190
  },
  {
    id: 'cnss-4',
    label: 'الشريحة 4 (2,501 – 5,000 د.م)',
    minAnnualTax: 2500.01,
    maxAnnualTax: 5000,
    monthlyAmo: 250
  },
  {
    id: 'cnss-5',
    label: 'الشريحة 5 (5,001 – 10,000 د.م)',
    minAnnualTax: 5000.01,
    maxAnnualTax: 10000,
    monthlyAmo: 425
  },
  {
    id: 'cnss-6',
    label: 'الشريحة 6 (10,001 – 25,000 د.م)',
    minAnnualTax: 10000.01,
    maxAnnualTax: 25000,
    monthlyAmo: 750
  },
  {
    id: 'cnss-7',
    label: 'الشريحة 7 (25,001 – 50,000 د.م)',
    minAnnualTax: 25000.01,
    maxAnnualTax: 50000,
    monthlyAmo: 1200
  },
  {
    id: 'cnss-8',
    label: 'الشريحة 8 (> 50,000 د.م)',
    minAnnualTax: 50000.01,
    maxAnnualTax: null,
    monthlyAmo: 1800
  }
];

export const DEFAULT_CPU_SETTINGS: CpuTaxSettings = {
  taxRatePct: 10,
  professionCoeffPct: 6,
  retirementCoeff: 1.57,
  retirementEnabled: true,
  priorAccumulatedDays: 540,
  alertDaysBeforeDue: 7,
  annualPatenteTax: 0,
  cnssBrackets: DEFAULT_CNSS_BRACKETS
};

export interface CpuCalculationResult {
  turnover: number;
  quarterlyTax: number;
  annualizedTax: number;
  matchedBracket: CpuCnssBracket;
  monthlyAmo: number;
  quarterlyAmo: number;
  retirementEnabled: boolean;
  monthlyRetirement: number;
  quarterlyRetirement: number;
  annualPatenteTax: number;
  quarterlyPatenteTax: number;
  monthlyPatenteTax: number;
  totalQuarterlyDue: number;
  totalMonthlyEquivalent: number;
  combinedQuarterlyWithPatente: number;
  combinedMonthlyWithPatente: number;
}

export function matchCnssBracket(
  annualizedTax: number,
  brackets: CpuCnssBracket[]
): CpuCnssBracket {
  const list =
    brackets && brackets.length > 0
      ? [...brackets].sort((a, b) => a.minAnnualTax - b.minAnnualTax)
      : DEFAULT_CNSS_BRACKETS;

  const found = list.find((b) => {
    const aboveMin = annualizedTax >= b.minAnnualTax;
    const belowMax = b.maxAnnualTax === null || annualizedTax <= b.maxAnnualTax;
    return aboveMin && belowMax;
  });

  if (found) return found;
  if (annualizedTax <= list[0].minAnnualTax) return list[0];
  return list[list.length - 1];
}

export function calculateCpuBreakdown(
  quarterlyTurnover: number,
  cpuSettings: CpuTaxSettings,
  overrideRetirementEnabled?: boolean
): CpuCalculationResult {
  const turnover = Math.max(0, Number(quarterlyTurnover) || 0);
  const coeff = Math.max(0, Number(cpuSettings.professionCoeffPct) || 0) / 100;
  const taxRate = Math.max(0, Number(cpuSettings.taxRatePct) || 0) / 100;
  const retCoeff = Math.max(0, Number(cpuSettings.retirementCoeff) || 0);
  const retirementEnabled =
    overrideRetirementEnabled !== undefined
      ? overrideRetirementEnabled
      : cpuSettings.retirementEnabled;

  // الضريبة = رقم المعاملات × معامل المهنة (6%) × نسبة الضريبة (10%)
  const quarterlyTax = Number((turnover * coeff * taxRate).toFixed(2));
  const annualizedTax = Number((quarterlyTax * 4).toFixed(2));

  const matchedBracket = matchCnssBracket(annualizedTax, cpuSettings.cnssBrackets);
  const monthlyAmo = Number((matchedBracket.monthlyAmo || 0).toFixed(2));
  const quarterlyAmo = Number((monthlyAmo * 3).toFixed(2));

  // التقاعد = AMO × 1.57 (إذا كان التقاعد مفعلاً)
  const monthlyRetirement = retirementEnabled
    ? Number((monthlyAmo * retCoeff).toFixed(2))
    : 0;
  const quarterlyRetirement = retirementEnabled
    ? Number((monthlyRetirement * 3).toFixed(2))
    : 0;

  // الرسم المهني السنوي (الباتنتا)
  const annualPatenteTax = Math.max(0, Number(cpuSettings.annualPatenteTax) || 0);
  const quarterlyPatenteTax = Number((annualPatenteTax / 4).toFixed(2));
  const monthlyPatenteTax = Number((annualPatenteTax / 12).toFixed(2));

  // المجموع الكلي للتريمستر = الضريبة + بريم الصحة (3 أشهر) + بريم التقاعد (3 أشهر إن وجد)
  const totalQuarterlyDue = Number(
    (quarterlyTax + quarterlyAmo + quarterlyRetirement).toFixed(2)
  );
  const totalMonthlyEquivalent = Number(
    (quarterlyTax / 3 + monthlyAmo + monthlyRetirement).toFixed(2)
  );
  const combinedQuarterlyWithPatente = Number(
    (totalQuarterlyDue + quarterlyPatenteTax).toFixed(2)
  );
  const combinedMonthlyWithPatente = Number(
    (totalMonthlyEquivalent + monthlyPatenteTax).toFixed(2)
  );

  return {
    turnover,
    quarterlyTax,
    annualizedTax,
    matchedBracket,
    monthlyAmo,
    quarterlyAmo,
    retirementEnabled,
    monthlyRetirement,
    quarterlyRetirement,
    annualPatenteTax,
    quarterlyPatenteTax,
    monthlyPatenteTax,
    totalQuarterlyDue,
    totalMonthlyEquivalent,
    combinedQuarterlyWithPatente,
    combinedMonthlyWithPatente
  };
}

export function getQuarterDueDate(year: number, quarter: CpuQuarterId): string {
  switch (quarter) {
    case 'Q1':
      return `${year}-03-31`;
    case 'Q2':
      return `${year}-06-30`;
    case 'Q3':
      return `${year}-09-30`;
    case 'Q4':
      return `${year}-12-31`;
  }
}

export function getQuarterLabel(quarter: CpuQuarterId, language: 'ar' | 'fr' | 'en'): string {
  const isAr = language === 'ar';
  const isFr = language === 'fr';
  switch (quarter) {
    case 'Q1':
      return isAr ? 'التريمستر 1 (يناير - مارس)' : isFr ? 'T1 (Jan - Mar)' : 'Q1 (Jan - Mar)';
    case 'Q2':
      return isAr ? 'التريمستر 2 (أبريل - يونيو)' : isFr ? 'T2 (Avr - Jun)' : 'Q2 (Apr - Jun)';
    case 'Q3':
      return isAr ? 'التريمستر 3 (يوليوز - شتنبر)' : isFr ? 'T3 (Jul - Sep)' : 'Q3 (Jul - Sep)';
    case 'Q4':
      return isAr ? 'التريمستر 4 (أكتوبر - دجنبر)' : isFr ? 'T4 (Oct - Déc)' : 'Q4 (Oct - Dec)';
  }
}

export function getQuarterDateRange(year: number, quarter: CpuQuarterId): { start: string; end: string } {
  switch (quarter) {
    case 'Q1':
      return { start: `${year}-01-01`, end: `${year}-03-31` };
    case 'Q2':
      return { start: `${year}-04-01`, end: `${year}-06-30` };
    case 'Q3':
      return { start: `${year}-07-01`, end: `${year}-09-30` };
    case 'Q4':
      return { start: `${year}-10-01`, end: `${year}-12-31` };
  }
}

export function buildCpuQuarterRecord(
  year: number,
  quarter: CpuQuarterId,
  turnover: number,
  cpuSettings: CpuTaxSettings,
  options?: {
    retirementEnabled?: boolean;
    status?: 'unpaid' | 'paid';
    paidAt?: string;
    notes?: string;
  }
): CpuQuarterRecord {
  const retirementEnabled =
    options?.retirementEnabled !== undefined
      ? options.retirementEnabled
      : cpuSettings.retirementEnabled;
  const calc = calculateCpuBreakdown(turnover, cpuSettings, retirementEnabled);
  const status = options?.status || 'unpaid';

  return {
    id: `${year}-${quarter}`,
    year,
    quarter,
    turnover: calc.turnover,
    calculatedTax: calc.quarterlyTax,
    monthlyAmo: calc.monthlyAmo,
    quarterlyAmo: calc.quarterlyAmo,
    retirementEnabled,
    monthlyRetirement: calc.monthlyRetirement,
    quarterlyRetirement: calc.quarterlyRetirement,
    totalDue: calc.totalQuarterlyDue,
    status,
    paidAt: status === 'paid' ? options?.paidAt || new Date().toISOString().slice(0, 10) : undefined,
    dueDate: getQuarterDueDate(year, quarter),
    retirementDaysCredited: status === 'paid' && retirementEnabled ? 90 : 0,
    notes: options?.notes
  };
}

export interface CpuPaymentAlert {
  recordId: string;
  year: number;
  quarter: CpuQuarterId;
  dueDate: string;
  daysLeft: number; // negative if overdue
  totalDue: number;
  isOverdue: boolean;
}

export function getUpcomingCpuAlerts(
  records: CpuQuarterRecord[],
  alertDaysBeforeDue: number = 7
): CpuPaymentAlert[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return records
    .filter((r) => r.status === 'unpaid')
    .map((r) => {
      const due = new Date(r.dueDate + 'T00:00:00');
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        recordId: r.id,
        year: r.year,
        quarter: r.quarter,
        dueDate: r.dueDate,
        daysLeft: diffDays,
        totalDue: r.totalDue,
        isOverdue: diffDays < 0
      };
    })
    .filter((a) => a.daysLeft <= alertDaysBeforeDue)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface RetirementProgressSummary {
  priorDays: number;
  earnedFromAppDays: number;
  totalAccumulatedDays: number;
  paidQuartersWithRetirement: number;
  remainingTo1320: number;
  pct1320: number;
  remainingTo3240: number;
  pct3240: number;
  quartersLeftTo1320: number;
  quartersLeftTo3240: number;
}

export function computeRetirementProgress(
  records: CpuQuarterRecord[],
  priorDays: number = 0
): RetirementProgressSummary {
  const paidQuarters = records.filter((r) => r.status === 'paid' && r.retirementEnabled);
  const earnedFromAppDays = paidQuarters.reduce(
    (sum, r) => sum + (r.retirementDaysCredited > 0 ? r.retirementDaysCredited : 90),
    0
  );
  const cleanPrior = Math.max(0, Math.round(Number(priorDays) || 0));
  const totalAccumulatedDays = cleanPrior + earnedFromAppDays;

  const remainingTo1320 = Math.max(0, 1320 - totalAccumulatedDays);
  const remainingTo3240 = Math.max(0, 3240 - totalAccumulatedDays);
  const pct1320 = Math.min(100, Number(((totalAccumulatedDays / 1320) * 100).toFixed(1)));
  const pct3240 = Math.min(100, Number(((totalAccumulatedDays / 3240) * 100).toFixed(1)));

  return {
    priorDays: cleanPrior,
    earnedFromAppDays,
    totalAccumulatedDays,
    paidQuartersWithRetirement: paidQuarters.length,
    remainingTo1320,
    pct1320,
    remainingTo3240,
    pct3240,
    quartersLeftTo1320: Math.ceil(remainingTo1320 / 90),
    quartersLeftTo3240: Math.ceil(remainingTo3240 / 90)
  };
}

export function createInitialCpuRecords(cpuSettings: CpuTaxSettings): CpuQuarterRecord[] {
  return [
    buildCpuQuarterRecord(2026, 'Q1', 28000, cpuSettings, {
      status: 'paid',
      paidAt: '2026-03-28',
      notes: 'تريمستر الربع الأول — تم الأداء في الآجال'
    }),
    buildCpuQuarterRecord(2026, 'Q2', 32500, cpuSettings, {
      status: 'paid',
      paidAt: '2026-06-27',
      notes: 'تريمستر الربع الثاني'
    }),
    buildCpuQuarterRecord(2026, 'Q3', 36000, cpuSettings, {
      status: 'paid',
      paidAt: '2026-09-29',
      notes: 'تريمستر الربع الثالث'
    }),
    buildCpuQuarterRecord(2026, 'Q4', 41500, cpuSettings, {
      status: 'unpaid',
      notes: 'التريمستر الحالي (في انتظار الدفع)'
    })
  ];
}

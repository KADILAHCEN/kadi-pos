import { Expense, ExpenseCategory } from '../types';

export interface ExpenseCategoryMeta {
  id: ExpenseCategory;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  badgeClass: string;
  barClass: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryMeta[] = [
  {
    id: 'rent',
    labelAr: 'كراء',
    labelFr: 'Loyer',
    labelEn: 'Rent',
    badgeClass:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
    barClass: 'bg-indigo-500'
  },
  {
    id: 'electricity',
    labelAr: 'كهرباء',
    labelFr: 'Électricité',
    labelEn: 'Electricity',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    barClass: 'bg-amber-500'
  },
  {
    id: 'transport',
    labelAr: 'نقل',
    labelFr: 'Transport',
    labelEn: 'Transport',
    badgeClass:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
    barClass: 'bg-sky-500'
  },
  {
    id: 'merchandise',
    labelAr: 'شراء بضاعة',
    labelFr: 'Achat marchandise',
    labelEn: 'Merchandise Purchase',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    barClass: 'bg-emerald-500'
  },
  {
    id: 'other',
    labelAr: 'أخرى',
    labelFr: 'Autre',
    labelEn: 'Other',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    barClass: 'bg-slate-500'
  }
];

export function getExpenseCategoryLabel(
  cat: ExpenseCategory,
  language: 'ar' | 'fr' | 'en'
): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.id === cat) || EXPENSE_CATEGORIES[4];
  if (language === 'ar') return found.labelAr;
  if (language === 'fr') return found.labelFr;
  return found.labelEn;
}

export function getExpenseCategoryMeta(cat: ExpenseCategory): ExpenseCategoryMeta {
  return EXPENSE_CATEGORIES.find((c) => c.id === cat) || EXPENSE_CATEGORIES[4];
}

export function getLocalTodayYMD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface ExpenseMetrics {
  todayTotal: number;
  monthTotal: number;
  allTimeTotal: number;
  todayCount: number;
  monthCount: number;
  allCount: number;
  byCategory: Record<ExpenseCategory, number>;
}

export function computeExpenseMetrics(expenses: Expense[]): ExpenseMetrics {
  const todayStr = getLocalTodayYMD();
  const monthPrefix = todayStr.slice(0, 7); // YYYY-MM

  const byCategory: Record<ExpenseCategory, number> = {
    rent: 0,
    electricity: 0,
    transport: 0,
    merchandise: 0,
    other: 0
  };

  let todayTotal = 0;
  let monthTotal = 0;
  let allTimeTotal = 0;
  let todayCount = 0;
  let monthCount = 0;

  expenses.forEach((exp) => {
    const amt = Number(exp.amount) || 0;
    const dayStr = exp.date ? exp.date.slice(0, 10) : '';
    allTimeTotal += amt;
    if (dayStr === todayStr) {
      todayTotal += amt;
      todayCount++;
    }
    if (dayStr.startsWith(monthPrefix)) {
      monthTotal += amt;
      monthCount++;
    }
    const catKey: ExpenseCategory = byCategory[exp.category] !== undefined ? exp.category : 'other';
    byCategory[catKey] += amt;
  });

  return {
    todayTotal: Number(todayTotal.toFixed(2)),
    monthTotal: Number(monthTotal.toFixed(2)),
    allTimeTotal: Number(allTimeTotal.toFixed(2)),
    todayCount,
    monthCount,
    allCount: expenses.length,
    byCategory
  };
}

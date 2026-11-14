import React from 'react';
import { usePos } from '../../context/PosContext';
import {
  Scale,
  Coins,
  Package,
  BookOpen,
  Wallet,
  MinusCircle,
  Settings,
  CheckCircle2,
  AlertCircle,
  Calculator,
  Info,
  TrendingUp
} from 'lucide-react';

export const ZakatCalculatorSection: React.FC = () => {
  const {
    settings,
    updateSettings,
    zakatSummary,
    setCurrentTab,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';

  const {
    goldPricePerGram,
    nisabValue,
    valuationBasis,
    includeReceivables,
    selectedInventoryValue,
    receivablesTotal,
    cashOnHand,
    payableDebts,
    zakatableBase,
    hasReachedNisab,
    excessOverNisab,
    remainingToNisab,
    nisabProgressPct,
    zakatDue,
    monthlyReserve
  } = zakatSummary;

  const fmt = (val: number) =>
    val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      id="zakat-calculator-section"
      className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-amber-200/90 dark:border-amber-900/60 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {isAr ? 'زكاة التجارة والحساب الآلي عند تجاوز النصاب (85g ذهب)' : 'Automatic Trade Zakat Calculator (85g Gold Nisab)'}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800">
                {isAr ? 'حساب آلي · 2.5%' : 'Auto 2.5%'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isAr
                ? 'يحسب النظام تلقائياً الوعاء الزكوي (المخزون + كناش الكريدي + السيولة − ديون الموردين) ويستخرج الزكاة الواجبة فوراً عند تجاوز نصاب 85 جرام ذهب'
                : 'Automatically calculates net zakatable trade base and outputs 2.5% Zakat due as soon as the 85g gold Nisab is exceeded'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCurrentTab('settings')}
          className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{isAr ? 'تحديث سعر الذهب من الإعدادات' : 'Update Gold Price in Settings'}</span>
        </button>
      </div>

      {/* Dynamic Gold Nisab Bar */}
      <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-amber-900 dark:text-amber-300">
              {isAr ? 'النصاب الشرعي المعتمد (85 جرام ذهب عيار 24):' : 'Nisab Threshold (85g Pure Gold):'}
            </div>
            <div className="text-lg font-black text-amber-700 dark:text-amber-400 font-mono tabular-nums mt-0.5">
              {fmt(nisabValue)} {currencySymbol}
            </div>
            <div className="text-[10px] text-amber-700/80 dark:text-amber-400/80 font-mono">
              85g × {goldPricePerGram.toFixed(2)} {currencySymbol}/g
            </div>
          </div>
        </div>

        {/* Inline quick gold price editor */}
        <div className="lg:col-span-3">
          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
            {isAr ? `سعر جرام الذهب (${currencySymbol}/جم):` : `Gold Price (${currencySymbol}/g):`}
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={goldPricePerGram === 0 ? '' : goldPricePerGram}
            placeholder="750"
            onChange={(e) => {
              const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
              updateSettings({ goldPricePerGram: val });
            }}
            className="w-full px-3 py-1.5 text-sm font-mono font-black bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 rounded-xl text-slate-900 dark:text-white tabular-nums focus:border-amber-500"
          />
        </div>

        {/* Nisab Progress */}
        <div className="lg:col-span-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-700 dark:text-slate-300">
              {isAr ? 'نسبة بلوغ النصاب:' : 'Nisab Progress:'}
            </span>
            <span
              className={`font-mono font-black ${
                hasReachedNisab ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {nisabProgressPct}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-white dark:bg-slate-800 rounded-full overflow-hidden border border-amber-200 dark:border-amber-900">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                hasReachedNisab ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${nisabProgressPct}%` }}
            />
          </div>
          <div className="text-[10px] font-bold">
            {hasReachedNisab ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                {isAr
                  ? `✅ تم تجاوز النصاب بمقدار +${fmt(excessOverNisab)} ${currencySymbol}`
                  : `✅ Exceeded Nisab by +${fmt(excessOverNisab)} ${currencySymbol}`}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {isAr
                  ? `متبقي لبلوغ النصاب: ${fmt(remainingToNisab)} ${currencySymbol}`
                  : `${fmt(remainingToNisab)} ${currencySymbol} remaining to Nisab`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Assets & Liabilities Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. Inventory Value */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'عروض التجارة (المخزون)' : 'Trade Inventory'}</span>
            </span>
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono tabular-nums">
            {fmt(selectedInventoryValue)} {currencySymbol}
          </div>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => updateSettings({ zakatValuationBasis: 'cost' })}
              className={`flex-1 py-1 rounded-md transition-colors ${
                valuationBasis === 'cost'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isAr ? 'سعر التكلفة' : 'Cost'}
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ zakatValuationBasis: 'retail' })}
              className={`flex-1 py-1 rounded-md transition-colors ${
                valuationBasis === 'retail'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isAr ? 'سعر البيع' : 'Retail'}
            </button>
          </div>
        </div>

        {/* 2. Customer Receivables (كناش الكريدي) */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              <span>{isAr ? 'ديون الزبناء (كناش الكريدي)' : 'Receivables (Credit)'}</span>
            </span>
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white font-mono tabular-nums">
            {fmt(includeReceivables ? receivablesTotal : 0)} {currencySymbol}
          </div>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeReceivables}
              onChange={(e) => updateSettings({ zakatIncludeReceivables: e.target.checked })}
              className="w-3.5 h-3.5 text-emerald-600 rounded"
            />
            <span>{isAr ? 'احتساب الكريدي المرجو سداده' : 'Include collectible credit'}</span>
          </label>
        </div>

        {/* 3. Business Cash Liquidity */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-blue-500" />
              <span>{isAr ? 'السيولة النقدية التجارية' : 'Business Cash'}</span>
            </span>
          </div>
          <input
            type="number"
            step="any"
            min="0"
            value={cashOnHand === 0 ? '' : cashOnHand}
            placeholder="0.00"
            onChange={(e) => {
              const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
              updateSettings({ zakatCashOnHand: val });
            }}
            className="w-full px-2.5 py-1 text-base font-mono font-black bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white tabular-nums"
          />
          <div className="text-[10px] text-slate-400">
            {isAr ? 'النقد بالصندوق والرصيد البنكي للتجارة' : 'Cash in drawer & business bank'}
          </div>
        </div>

        {/* 4. Deductible Supplier Debts */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <MinusCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>{isAr ? 'خصم ديون الموردين (-)' : 'Deductible Debts (-)'}</span>
            </span>
          </div>
          <input
            type="number"
            step="any"
            min="0"
            value={payableDebts === 0 ? '' : payableDebts}
            placeholder="0.00"
            onChange={(e) => {
              const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0);
              updateSettings({ zakatPayableDebts: val });
            }}
            className="w-full px-2.5 py-1 text-base font-mono font-black bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-600 dark:text-rose-400 tabular-nums"
          />
          <div className="text-[10px] text-slate-400">
            {isAr ? 'الالتزامات والديون الحالة عليك للمزودين' : 'Current liabilities to suppliers'}
          </div>
        </div>
      </div>

      {/* Automatic Zakat Calculation Formula & Final Result Card */}
      <div
        className={`p-5 rounded-2xl border space-y-4 ${
          hasReachedNisab
            ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {hasReachedNisab ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
              )}
              <span className="text-sm font-black text-slate-900 dark:text-white">
                {hasReachedNisab
                  ? (isAr
                      ? 'تم تجاوز النصاب (85 جم ذهب) — تم حساب الزكاة آلياً (2.5%)'
                      : 'Nisab Exceeded (85g Gold) — Zakat Automatically Calculated (2.5%)')
                  : (isAr
                      ? 'الوعاء الزكوي لم يبلغ نصاب 85 جم ذهب بعد (لا زكاة واجبة حالياً)'
                      : 'Zakatable Base Below 85g Gold Nisab (0.00 Zakat Due)')}
              </span>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2.5 font-medium">
              <span>
                {isAr ? 'الوعاء الزكوي الصافي:' : 'Net Zakatable Base:'}{' '}
                <strong className="font-mono text-slate-900 dark:text-white">
                  {fmt(zakatableBase)} {currencySymbol}
                </strong>
              </span>
              <span>·</span>
              <span>
                {isAr ? 'النصاب (85 جم ذهب):' : 'Nisab (85g Gold):'}{' '}
                <strong className="font-mono text-amber-700 dark:text-amber-400">
                  {fmt(nisabValue)} {currencySymbol}
                </strong>
              </span>
              {hasReachedNisab && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-bold">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {isAr ? 'الفائض عن النصاب:' : 'Excess over Nisab:'}{' '}
                    <span className="font-mono">+{fmt(excessOverNisab)} {currencySymbol}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-end">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? 'مقدار الزكاة المحسوب آلياً (2.5%)' : 'Auto-Calculated Zakat Due (2.5%)'}
              </div>
              <div
                className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${
                  hasReachedNisab ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                }`}
              >
                {fmt(zakatDue)} {currencySymbol}
              </div>
              {hasReachedNisab && (
                <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  {isAr
                    ? `ما يعادل ادخار ${fmt(monthlyReserve)} ${currencySymbol} شهرياً`
                    : `≈ ${fmt(monthlyReserve)} ${currencySymbol} / month`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Automatic Equation Breakdown */}
        <div className="pt-3 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-sans font-bold">
            <Calculator className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{isAr ? 'المعادلة الآلية المباشرة:' : 'Live Auto Formula:'}</span>
          </div>
          <div className="text-slate-800 dark:text-slate-200 font-bold tabular-nums" dir="ltr">
            {hasReachedNisab ? (
              <span>
                {fmt(zakatableBase)} × 2.5% ={' '}
                <span className="text-emerald-700 dark:text-emerald-400 font-black">
                  {fmt(zakatDue)} {currencySymbol}
                </span>
              </span>
            ) : (
              <span className="text-slate-500">
                {fmt(zakatableBase)} &lt; {fmt(nisabValue)} {currencySymbol} ⇒ 0.00 {currencySymbol}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fiqh Reminder Footnote */}
      <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
        <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <span>
          {isAr
            ? 'قاعدة حساب زكاة عروض التجارة: (قيمة البضاعة الحالية + السيولة النقدية + ديون الكريدي المرجو تحصيلها - ديون الموردين الحالة) × 2.5% عند بلوغ وتجاوز نصاب 85 جراماً من الذهب الخالص وحولان الحول القمري.'
            : 'Trade Zakat Formula: (Inventory Value + Cash + Collectible Receivables - Current Payables) × 2.5% upon reaching/exceeding 85g gold Nisab and completing one lunar year (Hawl).'}
        </span>
      </div>
    </div>
  );
};

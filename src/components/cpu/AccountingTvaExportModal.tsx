import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Landmark, X } from 'lucide-react';
import { usePos } from '../../context/PosContext';
import {
  AccountingPeriodType,
  computeAccountingTvaReport,
  exportAccountingTvaExcel,
  exportAccountingTvaPdf,
  getMonthRange,
  getQuarterRangeForAccounting
} from '../../utils/accountingExport';

interface AccountingTvaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountingTvaExportModal: React.FC<AccountingTvaExportModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    orders,
    products,
    supplierInvoices,
    expenses,
    cpuSettings,
    settings,
    currencySymbol,
    language
  } = usePos();

  const isAr = language === 'ar';
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const defaultQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' =
    now.getMonth() < 3 ? 'Q1' : now.getMonth() < 6 ? 'Q2' : now.getMonth() < 9 ? 'Q3' : 'Q4';

  const [periodType, setPeriodType] = useState<AccountingPeriodType>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>(defaultQuarter);
  const [customStart, setCustomStart] = useState(`${now.getFullYear()}-01-01`);
  const [customEnd, setCustomEnd] = useState(now.toISOString().slice(0, 10));
  const [vatRatePct, setVatRatePct] = useState<number>(20);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const reportParams = useMemo(() => {
    if (periodType === 'monthly') {
      const r = getMonthRange(selectedMonth);
      return { startDate: r.start, endDate: r.end, periodLabel: r.label, vatRatePct };
    }
    if (periodType === 'quarterly') {
      const r = getQuarterRangeForAccounting(selectedYear, selectedQuarter);
      return { startDate: r.start, endDate: r.end, periodLabel: r.label, vatRatePct };
    }
    return {
      startDate: customStart,
      endDate: customEnd,
      periodLabel: `${customStart} → ${customEnd}`,
      vatRatePct
    };
  }, [periodType, selectedMonth, selectedYear, selectedQuarter, customStart, customEnd, vatRatePct]);

  const report = useMemo(
    () =>
      computeAccountingTvaReport({
        orders,
        products,
        supplierInvoices,
        expenses,
        cpuSettings,
        reportParams
      }),
    [orders, products, supplierInvoices, expenses, cpuSettings, reportParams]
  );

  if (!isOpen) return null;

  const handleExportExcel = () => {
    const file = exportAccountingTvaExcel(report, settings, currencySymbol, language);
    setFeedbackMsg(
      isAr ? `تم تصدير ملف المحاسب Excel: ${file}` : `Fichier Excel exporté : ${file}`
    );
  };

  const handleExportPdf = () => {
    const file = exportAccountingTvaPdf(report, settings, currencySymbol, language);
    setFeedbackMsg(
      isAr ? `تم تصدير بيان المحاسبة PDF: ${file}` : `Déclaration PDF exportée : ${file}`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[92vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {isAr
                  ? 'تصدير المحاسبة المغربية والـ TVA و ICE'
                  : 'Export Comptable Maroc TVA & ICE'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {isAr
                  ? 'ملف متكامل للمحاسب (TVA المحصلة والمسترجعة وفواتير ICE والـ CPU)'
                  : 'TVA Collectée, TVA Déductible ICE, Journal des Ventes et Charges'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Period & VAT controls */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'monthly', label: isAr ? 'شهري' : 'Mensuel' },
                  { id: 'quarterly', label: isAr ? 'ربع سنوي (تريمستر)' : 'Trimestriel' },
                  { id: 'custom', label: isAr ? 'فترة مخصصة' : 'Personnalisé' }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPeriodType(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    periodType === tab.id
                      ? 'bg-slate-900 dark:bg-emerald-600 border-slate-900 dark:border-emerald-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {periodType === 'monthly' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'اختر الشهر' : 'Mois'}
                  </label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              )}

              {periodType === 'quarterly' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'السنة' : 'Année'}
                    </label>
                    <input
                      type="number"
                      min={2020}
                      max={2040}
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value) || now.getFullYear())}
                      className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'الربع' : 'Trimestre'}
                    </label>
                    <select
                      value={selectedQuarter}
                      onChange={(e) =>
                        setSelectedQuarter(e.target.value as 'Q1' | 'Q2' | 'Q3' | 'Q4')
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    >
                      <option value="Q1">Q1 (01-03)</option>
                      <option value="Q2">Q2 (04-06)</option>
                      <option value="Q3">Q3 (07-09)</option>
                      <option value="Q4">Q4 (10-12)</option>
                    </select>
                  </div>
                </div>
              )}

              {periodType === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'من تاريخ' : 'Du'}
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'إلى تاريخ' : 'Au'}
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'نسبة TVA المطبقة' : 'Taux TVA appliqué'}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[20, 14, 10, 0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setVatRatePct(rate)}
                      className={`py-2 rounded-xl text-xs font-mono font-bold border transition-colors ${
                        vatRatePct === rate
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {rate}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Live Financial Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {isAr ? 'مبيعات الفترة (TTC)' : 'CA Ventes TTC'}
              </div>
              <div className="font-mono tabular-nums text-base font-black text-slate-900 dark:text-white mt-0.5">
                {report.totalSalesTtc.toFixed(2)} {currencySymbol}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                HT: {report.salesHt.toFixed(2)} · {report.ordersCount} {isAr ? 'فاتورة' : 'tickets'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {isAr ? 'TVA المحصلة' : 'TVA Collectée'}
              </div>
              <div className="font-mono tabular-nums text-base font-black text-blue-700 dark:text-blue-400 mt-0.5">
                {report.tvaCollectee.toFixed(2)} {currencySymbol}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                {isAr ? 'معفاة:' : 'Exonéré:'} {report.exemptSalesTtc.toFixed(2)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {isAr ? 'TVA المسترجعة (فواتير ICE)' : 'TVA Déductible (ICE)'}
              </div>
              <div className="font-mono tabular-nums text-base font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                {report.tvaDeductible.toFixed(2)} {currencySymbol}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                {report.officialInvoicesCount} {isAr ? 'فاتورة رسمية' : 'factures ICE'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {report.netTvaPayable >= 0
                  ? isAr
                    ? 'صافي TVA المستحقة للدولة'
                    : 'TVA Nette à Payer'
                  : isAr
                  ? 'رصيد TVA فائض (Crédit TVA)'
                  : 'Crédit de TVA'}
              </div>
              <div
                className={`font-mono tabular-nums text-base font-black mt-0.5 ${
                  report.netTvaPayable >= 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {Math.abs(report.netTvaPayable).toFixed(2)} {currencySymbol}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {isAr ? 'مشتريات غير رسمية (نوار)' : 'Achats informels'}
              </div>
              <div className="font-mono tabular-nums text-base font-black text-slate-800 dark:text-slate-200 mt-0.5">
                {report.informalPurchasesTotal.toFixed(2)} {currencySymbol}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400">
                {isAr ? 'تقدير الضريبة الموحدة CPU' : 'Estimation CPU'}
              </div>
              <div className="font-mono tabular-nums text-base font-black text-amber-700 dark:text-amber-400 mt-0.5">
                {report.estimatedCpuTax.toFixed(2)} {currencySymbol}
              </div>
            </div>
          </div>

          {feedbackMsg && (
            <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {feedbackMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            {isAr ? 'إغلاق' : 'Fermer'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isAr ? 'تصدير إكسل المحاسب (.xlsx)' : 'Exporter Excel (.xlsx)'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>{isAr ? 'تصدير بيان المحاسبة PDF' : 'Exporter Déclaration PDF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

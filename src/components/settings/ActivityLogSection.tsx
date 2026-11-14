import React, { useState, useMemo } from 'react';
import { usePos } from '../../context/PosContext';
import { ActivityLogCategory, ActivityLogItem } from '../../types';
import {
  ClipboardList,
  LogIn,
  TrendingUp,
  PackageCheck,
  Settings,
  ShieldCheck,
  Search,
  Download,
  Trash2,
  Calendar,
  User,
  Filter,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react';

export const ActivityLogSection: React.FC = () => {
  const { activityLogs, clearActivityLogs, currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [selectedCategory, setSelectedCategory] = useState<ActivityLogCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedToast, setCopiedToast] = useState(false);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      // Category filter
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const inTitle = log.title.toLowerCase().includes(query);
        const inDesc = log.description.toLowerCase().includes(query);
        const inActor = log.actor.toLowerCase().includes(query);
        const inMeta = log.metadata
          ? JSON.stringify(log.metadata).toLowerCase().includes(query)
          : false;
        return inTitle || inDesc || inActor || inMeta;
      }
      return true;
    });
  }, [activityLogs, selectedCategory, searchQuery]);

  // Summary Metrics
  const stats = useMemo(() => {
    let largeSalesCount = 0;
    let largeSalesTotal = 0;
    let inventoryCount = 0;
    let loginsCount = 0;

    activityLogs.forEach((log) => {
      if (log.category === 'sale_large') {
        largeSalesCount++;
        if (log.amount) largeSalesTotal += log.amount;
      } else if (log.category === 'inventory_major') {
        inventoryCount++;
      } else if (log.category === 'auth_login') {
        loginsCount++;
      }
    });

    return {
      total: activityLogs.length,
      largeSalesCount,
      largeSalesTotal,
      inventoryCount,
      loginsCount
    };
  }, [activityLogs]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['التاريخ والوقت', 'التصنيف', 'العملية', 'التفاصيل', 'المستخدم', 'الدور', 'المبلغ'];
    const rows = filteredLogs.map((log) => [
      `"${new Date(log.timestamp).toLocaleString('ar-MA')}"`,
      `"${log.category}"`,
      `"${log.title.replace(/"/g, '""')}"`,
      `"${log.description.replace(/"/g, '""')}"`,
      `"${log.actor}"`,
      `"${log.actorRole === 'manager' ? 'مدير' : 'كاشير'}"`,
      log.amount ? log.amount : ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kadi_activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (
      confirm(
        isAr
          ? 'هل أنت متأكد من تفريغ ومسح سجل النشاطات والعمليات؟'
          : 'Are you sure you want to clear the audit activity log?'
      )
    ) {
      clearActivityLogs();
    }
  };

  const getCategoryDetails = (cat: ActivityLogCategory) => {
    switch (cat) {
      case 'auth_login':
        return {
          label: isAr ? 'تسجيل دخول' : isFr ? 'Connexion' : 'Login',
          icon: LogIn,
          colorClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900/60'
        };
      case 'sale_large':
        return {
          label: isAr ? 'مبيعات كبرى' : isFr ? 'Grande vente' : 'Large Sale',
          icon: TrendingUp,
          colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900/60'
        };
      case 'inventory_major':
        return {
          label: isAr ? 'تعديل مخزون' : isFr ? 'Stock majeur' : 'Stock Adj',
          icon: PackageCheck,
          colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900/60'
        };
      case 'settings_change':
        return {
          label: isAr ? 'إعدادات المنشأة' : isFr ? 'Paramètres' : 'Settings',
          icon: Settings,
          colorClass: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-900/60'
        };
      default:
        return {
          label: isAr ? 'نظام' : 'System',
          icon: ShieldCheck,
          colorClass: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
        };
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return isAr ? 'الآن' : 'Just now';
      if (diffMins < 60) return isAr ? `منذ ${diffMins} دقيقة` : `${diffMins}m ago`;
      if (diffHours < 24) return isAr ? `منذ ${diffHours} ساعة` : `${diffHours}h ago`;
      if (diffDays === 1) return isAr ? 'أمس' : 'Yesterday';
      if (diffDays < 7) return isAr ? `منذ ${diffDays} أيام` : `${diffDays}d ago`;

      return date.toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-100 dark:border-emerald-900/50">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <span>{isAr ? 'سجل النشاطات والعمليات الرقابية' : 'Audit & Activity Log'}</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {activityLogs.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'توثيق آلي لأهم العمليات (تسجيل الدخول، مبيعات كبرى، وتعديلات المخزون الجوهرية)'
                : 'Automated audit trail for logins, large sales, and major inventory changes'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors disabled:opacity-40"
            title={isAr ? 'تحميل كملف CSV' : 'Export CSV'}
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
          </button>

          {activityLogs.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition-colors"
              title={isAr ? 'تفريغ السجل' : 'Clear Log'}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isAr ? 'تفريغ' : 'Clear'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
            <ClipboardList className="w-3 h-3 text-slate-400" />
            <span>{isAr ? 'إجمالي الأحداث' : 'Total Events'}</span>
          </div>
          <div className="text-base font-black text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            {stats.total}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
          <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <LogIn className="w-3 h-3" />
            <span>{isAr ? 'تسجيلات الدخول' : 'User Logins'}</span>
          </div>
          <div className="text-base font-black text-blue-700 dark:text-blue-300 mt-1 tabular-nums font-mono">
            {stats.loginsCount}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
          <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>{isAr ? 'مبيعات كبرى' : 'Large Sales'}</span>
          </div>
          <div className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums font-mono flex items-baseline gap-1">
            <span>{stats.largeSalesCount}</span>
            <span className="text-[10px] font-semibold opacity-80">
              ({stats.largeSalesTotal.toFixed(0)} {currencySymbol})
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
          <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <PackageCheck className="w-3 h-3" />
            <span>{isAr ? 'حركات مخزون جوهرية' : 'Stock Movements'}</span>
          </div>
          <div className="text-base font-black text-amber-700 dark:text-amber-300 mt-1 tabular-nums font-mono">
            {stats.inventoryCount}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {[
            { id: 'all' as const, label: isAr ? 'الكل' : 'All', count: activityLogs.length },
            { id: 'auth_login' as const, label: isAr ? 'تسجيل دخول' : 'Logins', count: stats.loginsCount },
            { id: 'sale_large' as const, label: isAr ? 'مبيعات كبرى' : 'Large Sales', count: stats.largeSalesCount },
            { id: 'inventory_major' as const, label: isAr ? 'المخزون' : 'Stock', count: stats.inventoryCount },
            {
              id: 'settings_change' as const,
              label: isAr ? 'الإعدادات' : 'Settings',
              count: activityLogs.filter((l) => l.category === 'settings_change').length
            }
          ].map((tab) => {
            const isActive = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${
                    isActive ? 'bg-white/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px]">
          <Search className="absolute right-3 rtl:right-3 rtl:left-auto left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث في السجل بالاسم، العملية، الفاتورة...' : 'Search logs...'}
            className="w-full py-1.5 px-8 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 rtl:left-2.5 rtl:right-auto right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
              {isAr ? 'لا توجد أنشطة مسجلة في هذا التصنيف' : 'No activity logs found for this filter'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {isAr
                ? 'يتم توثيق تسجيلات الدخول والمبيعات الكبيرة وتعديلات المخزون آلياً فور حدوثها'
                : 'Operations are automatically logged as they happen'}
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const cat = getCategoryDetails(log.category);
            const CatIcon = cat.icon;

            return (
              <div
                key={log.id}
                className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Category Icon Badge */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${cat.colorClass}`}
                  >
                    <CatIcon className="w-4 h-4" />
                  </div>

                  {/* Log Details */}
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                        {log.title}
                      </span>

                      {/* Severity pill if exists */}
                      {log.severity === 'success' && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          {isAr ? 'ناجحة' : 'Success'}
                        </span>
                      )}
                      {log.severity === 'warning' && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                          {isAr ? 'تنبيه' : 'Alert'}
                        </span>
                      )}

                      {/* Amount tag */}
                      {log.amount && (
                        <span className="font-mono font-extrabold text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {log.amount.toFixed(2)} {currencySymbol}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {log.description}
                    </p>

                    {/* Metadata chips */}
                    {log.metadata && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {log.metadata.orderNumber && (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {log.metadata.orderNumber}
                          </span>
                        )}
                        {log.metadata.productName && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            📦 {log.metadata.productName}
                          </span>
                        )}
                        {log.metadata.quantityChange !== undefined && (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                              log.metadata.quantityChange > 0
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {log.metadata.quantityChange > 0 ? '+' : ''}
                            {log.metadata.quantityChange}
                          </span>
                        )}
                        {log.metadata.details && (
                          <span className="text-[10px] text-slate-400">
                            · {log.metadata.details}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actor & Timestamp */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1 shrink-0 text-start sm:text-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">
                    <User className="w-3 h-3 text-slate-400" />
                    <span>{log.actor}</span>
                    <span className="text-[9px] text-slate-400 font-normal">
                      ({log.actorRole === 'manager' ? (isAr ? 'مدير' : 'Manager') : (isAr ? 'كاشير' : 'Cashier')})
                    </span>
                  </div>

                  <span
                    className="text-[10px] text-slate-400 tabular-nums flex items-center gap-1 mt-0.5"
                    title={new Date(log.timestamp).toLocaleString(isAr ? 'ar-MA' : 'fr-FR')}
                  >
                    <Calendar className="w-2.5 h-2.5" />
                    <span>{formatRelativeTime(log.timestamp)}</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

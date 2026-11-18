import React from 'react';
import { RefreshCw, Wrench, AlertTriangle } from 'lucide-react';

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Kadi POS runtime error caught by AppErrorBoundary:', error, info);
  }

  private handleRetryRender = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleRepairStorageAndReload = () => {
    if (typeof window === 'undefined') return;
    try {
      const keysToCheck = [
        'kadi_pos_settings_v3',
        'kadi_pos_products_v3',
        'kadi_pos_categories_v3',
        'kadi_pos_orders',
        'kadi_pos_customers',
        'kadi_pos_credit_transactions_v1',
        'kadi_pos_current_shift',
        'kadi_pos_shifts_history',
        'kadi_pos_cart',
        'kadi_pos_held_tickets',
        'kadi_pos_users_v3',
        'kadi_pos_branches_v1',
        'kadi_pos_branch_transfers',
        'kadi_pos_activity_logs',
        'kadi_pos_shop_ear_requests_v1',
        'kadi_pos_stock_movements_v3',
        'kadi_pos_stocktake_history',
        'kadi_pos_theft_alerts',
        'kadi_pos_expenses_v1',
        'kadi_pos_supplier_invoices_v1',
        'kadi_pos_delivery_zones_v1',
        'kadi_pos_remote_orders_v1',
        'kadi_pos_cpu_records_v1',
        'kadi_pos_current_emergency_session',
        'kadi_pos_emergency_sessions'
      ];
      keysToCheck.forEach((key) => {
        try {
          const raw = window.localStorage.getItem(key);
          if (raw === null) return;
          const parsed = JSON.parse(raw);
          if (parsed === null || typeof parsed !== 'object') {
            window.localStorage.removeItem(key);
          }
        } catch {
          window.localStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore storage access failures
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans"
        >
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-lg font-black text-white">
                وقع مشكل مؤقت في تشغيل kadi pos
              </h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                ما تخافش، المبيعات والبيانات ديالك باقين محفوظين. جرب إعادة التشغيل ولا إصلاح البيانات المؤقتة.
              </p>
            </div>

            {this.state.errorMessage && (
              <div className="text-[11px] font-mono text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-xl p-2.5 break-words text-left" dir="ltr">
                {this.state.errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleRetryRender}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>حاول مرة أخرى</span>
              </button>

              <button
                type="button"
                onClick={this.handleRepairStorageAndReload}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-2 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                <span>إصلاح البيانات التالفة وإعادة التحميل</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
              >
                تحديث الصفحة
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

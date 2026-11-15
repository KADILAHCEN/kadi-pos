import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Plus, Trophy } from 'lucide-react';
import { usePos } from '../../context/PosContext';
import { Product } from '../../types';

interface WeeklyTopProductsWidgetProps {
  onQuickAddProduct: (product: Product) => void;
}

interface RankedWeeklyProduct {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
  product?: Product;
}

function getCurrentWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export const WeeklyTopProductsWidget: React.FC<WeeklyTopProductsWidgetProps> = ({
  onQuickAddProduct
}) => {
  const { orders, products, currencySymbol, language, setCurrentTab } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kadi_pos_weekly_widget_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kadi_pos_weekly_widget_collapsed', next ? '1' : '0');
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  };

  const { topFive, totalWeeklyRevenue } = useMemo(() => {
    const weekStartMs = getCurrentWeekStart().getTime();
    const productLookup = new Map<string, Product>();
    products.forEach((p) => productLookup.set(p.id, p));

    const aggregated = new Map<string, RankedWeeklyProduct>();
    let revSum = 0;

    orders.forEach((order) => {
      if (order.status === 'refunded') return;
      const orderTs = new Date(order.date).getTime();
      if (Number.isNaN(orderTs) || orderTs < weekStartMs) return;

      order.items.forEach((item) => {
        const matchedProd = productLookup.get(item.productId);
        const key = item.productId || item.productName;
        const existing = aggregated.get(key);
        const qty = Number(item.quantity || 0);
        const rev = Number(item.total || 0);
        revSum += rev;

        if (existing) {
          existing.quantitySold = Number((existing.quantitySold + qty).toFixed(2));
          existing.revenue = Number((existing.revenue + rev).toFixed(2));
          if (!existing.product && matchedProd) existing.product = matchedProd;
        } else {
          aggregated.set(key, {
            productId: key,
            name: matchedProd?.name || item.productName,
            quantitySold: Number(qty.toFixed(2)),
            revenue: Number(rev.toFixed(2)),
            product: matchedProd
          });
        }
      });
    });

    const sorted = Array.from(aggregated.values())
      .sort((a, b) => (b.quantitySold !== a.quantitySold ? b.quantitySold - a.quantitySold : b.revenue - a.revenue))
      .slice(0, 5);

    return {
      topFive: sorted,
      totalWeeklyRevenue: Number(revSum.toFixed(0))
    };
  }, [orders, products]);

  const getRankBadgeClass = (index: number) => {
    if (index === 0) return 'bg-amber-400 text-slate-950';
    if (index === 1) return 'bg-slate-300 text-slate-900';
    if (index === 2) return 'bg-amber-700 text-white';
    return 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200';
  };

  return (
    <section
      aria-label={isAr ? 'أكثر 5 منتجات مبيعاً هذا الأسبوع' : 'Top 5 Weekly Best Sellers'}
      className="mb-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 px-2.5 py-1.5 shrink-0 flex items-center gap-2 shadow-2xs"
    >
      {/* Compact Title Label + Collapse Toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex items-center gap-1.5 text-[11px] font-black text-slate-800 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0"
        title={collapsed ? (isAr ? 'عرض أفضل 5 هذا الأسبوع' : 'Expand Top 5') : isAr ? 'تصغير اللوحة' : 'Minimize'}
      >
        <span className="w-5 h-5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <Trophy className="w-3 h-3" />
        </span>
        <span className="whitespace-nowrap">
          {isAr ? 'أفضل 5 أسبوعياً' : isFr ? 'Top 5 Sem.' : 'Top 5 Week'}
        </span>
        {collapsed ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronUp className="w-3 h-3 text-slate-400" />}
      </button>

      {/* Single-Row Slim Pills for Top 5 Products */}
      {!collapsed && (
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {topFive.length === 0 ? (
            <span className="text-[10px] font-medium text-slate-400 truncate">
              {isAr ? 'لا توجد مبيعات هذا الأسبوع بعد' : 'No sales this week yet'}
            </span>
          ) : (
            topFive.map((item, idx) => {
              const canAdd = Boolean(item.product && item.product.stock > 0);
              return (
                <button
                  key={item.productId}
                  type="button"
                  disabled={!canAdd}
                  onClick={() => item.product && onQuickAddProduct(item.product)}
                  title={`${item.name} · ${item.quantitySold} ${isAr ? 'مبيعة' : 'sold'} (${item.revenue.toFixed(2)} ${currencySymbol})`}
                  className={`group flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] shrink-0 transition-all ${
                    canAdd
                      ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 active:scale-95 cursor-pointer'
                      : 'bg-slate-100/70 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded text-[9px] font-black flex items-center justify-center shrink-0 tabular-nums ${getRankBadgeClass(
                      idx
                    )}`}
                  >
                    {idx + 1}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[105px]">
                    {item.name}
                  </span>
                  <span className="text-[10px] font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    ×{item.quantitySold}
                  </span>
                  {canAdd && (
                    <Plus className="w-3 h-3 text-emerald-600 dark:text-emerald-400 opacity-70 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {collapsed && topFive.length > 0 && (
        <div className="flex-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
          #1 {topFive[0].name} (×{topFive[0].quantitySold}) · {totalWeeklyRevenue} {currencySymbol}
        </div>
      )}

      {/* Mini Analytics Link */}
      <button
        type="button"
        onClick={() => setCurrentTab('analytics')}
        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors shrink-0"
        title={isAr ? 'تفاصيل المبيعات الأسبوعية في التحليلات' : 'View Analytics'}
      >
        <BarChart3 className="w-3.5 h-3.5" />
      </button>
    </section>
  );
};

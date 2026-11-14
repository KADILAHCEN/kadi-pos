import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Flame, Plus, ShoppingBag, Trophy } from 'lucide-react';
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
  const day = now.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
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

  const { topFive, totalWeeklyUnits, totalWeeklyRevenue, weekLabel } = useMemo(() => {
    const weekStart = getCurrentWeekStart();
    const weekStartMs = weekStart.getTime();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const productLookup = new Map<string, Product>();
    products.forEach((p) => productLookup.set(p.id, p));

    const aggregated = new Map<string, RankedWeeklyProduct>();
    let unitsSum = 0;
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

        unitsSum += qty;
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
      .sort((a, b) => {
        if (b.quantitySold !== a.quantitySold) return b.quantitySold - a.quantitySold;
        return b.revenue - a.revenue;
      })
      .slice(0, 5);

    const fmtDate = (d: Date) =>
      d.toLocaleDateString(isAr ? 'ar-MA' : isFr ? 'fr-FR' : 'en-US', {
        month: 'short',
        day: 'numeric'
      });

    return {
      topFive: sorted,
      totalWeeklyUnits: Number(unitsSum.toFixed(2)),
      totalWeeklyRevenue: Number(revSum.toFixed(2)),
      weekLabel: `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`
    };
  }, [orders, products, isAr, isFr]);

  const maxQty = topFive[0]?.quantitySold || 1;

  const getRankStyle = (index: number) => {
    if (index === 0) return 'bg-amber-400 text-slate-950 border-amber-300';
    if (index === 1) return 'bg-slate-200 text-slate-900 border-slate-300';
    if (index === 2) return 'bg-amber-700 text-white border-amber-600';
    return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  return (
    <section
      aria-label={isAr ? 'أكثر 5 منتجات مبيعاً هذا الأسبوع' : 'Top 5 Weekly Best Sellers'}
      className="mb-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0 overflow-hidden transition-all"
    >
      {/* Compact Header Bar */}
      <div className="px-3.5 py-2 bg-gradient-to-r from-emerald-50/80 via-white to-amber-50/70 dark:from-emerald-950/30 dark:via-slate-900 dark:to-amber-950/20 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
            <Trophy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>
                {isAr
                  ? 'لوحة سريعة: أكثر 5 منتجات مبيعاً هذا الأسبوع'
                  : isFr
                  ? 'Top 5 des ventes cette semaine'
                  : 'Quick Widget: Top 5 Best Sellers This Week'}
              </span>
              <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {weekLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {topFive.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg tabular-nums">
              <span>
                {isAr ? 'مبيعات أفضل المنتجات:' : 'Units:'}{' '}
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                  {totalWeeklyUnits}
                </strong>
              </span>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {totalWeeklyRevenue.toFixed(2)} {currencySymbol}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setCurrentTab('analytics')}
            className="px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex items-center gap-1 transition-colors"
            title={isAr ? 'فتح التحليلات الكاملة' : 'Open Full Analytics'}
          >
            <BarChart3 className="w-3 h-3" />
            <span className="hidden md:inline">{isAr ? 'التحليلات' : 'Analytics'}</span>
          </button>

          <button
            type="button"
            onClick={toggleCollapsed}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={collapsed ? (isAr ? 'توسيع اللوحة' : 'Expand') : isAr ? 'طي اللوحة' : 'Collapse'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Top 5 Ranked Product Cards */}
      {!collapsed && (
        <div className="p-2.5">
          {topFive.length === 0 ? (
            <div className="py-3 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
              <ShoppingBag className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {isAr
                  ? 'لا توجد مبيعات مسجلة خلال الأسبوع الحالي بعد — ستظهر هنا تلقائياً عند إتمام أي فاتورة.'
                  : 'No sales recorded this week yet — top 5 products will appear here automatically.'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {topFive.map((item, idx) => {
                const barWidth = Math.max(12, Math.round((item.quantitySold / maxQty) * 100));
                const canQuickAdd = Boolean(item.product && item.product.stock > 0);
                return (
                  <div
                    key={item.productId}
                    className="group relative p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Rank Badge */}
                      <span
                        className={`w-6 h-6 rounded-lg border text-[11px] font-black flex items-center justify-center shrink-0 tabular-nums ${getRankStyle(
                          idx
                        )}`}
                      >
                        #{idx + 1}
                      </span>

                      {/* Optional Thumbnail */}
                      {item.product?.image ? (
                        <img
                          src={item.product.image}
                          alt={item.name}
                          className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-black flex items-center justify-center shrink-0">
                          {item.name.slice(0, 2)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div
                          className="text-xs font-extrabold text-slate-900 dark:text-white truncate"
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                          <span className="text-emerald-600 dark:text-emerald-400 font-black">
                            {item.quantitySold} {isAr ? 'مبيعة' : 'sold'}
                          </span>
                          <span>·</span>
                          <span className="font-mono">
                            {item.revenue.toFixed(0)} {currencySymbol}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Relative Share Progress & 1-Click Add to Cart */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            idx === 0
                              ? 'bg-amber-500'
                              : idx === 1
                              ? 'bg-emerald-500'
                              : 'bg-teal-500'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      {item.product && (
                        <button
                          type="button"
                          disabled={!canQuickAdd}
                          onClick={() => item.product && onQuickAddProduct(item.product)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-0.5 transition-colors shrink-0 ${
                            canQuickAdd
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                          }`}
                          title={
                            canQuickAdd
                              ? isAr
                                ? 'إضافة سريعة للفاتورة'
                                : 'Quick add to cart'
                              : isAr
                              ? 'نفذ المخزون'
                              : 'Out of stock'
                          }
                        >
                          <Plus className="w-3 h-3" />
                          <span>{canQuickAdd ? (isAr ? 'أضف' : 'Add') : isAr ? 'نفذ' : 'Out'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

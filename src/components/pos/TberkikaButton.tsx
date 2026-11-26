import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ear,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Truck,
  Store,
  User,
  Trash2,
  X,
  Check
} from 'lucide-react';
import { usePos } from '../../context/PosContext';

export type TberkikaType = 'غادي يزيد' | 'زاد' | 'ينقص';
export type TberkikaSource = 'مورّد' | 'حانوت' | 'زبون';

export interface TberkikaEntry {
  uid: string;
  id: string;
  productName?: string;
  type: TberkikaType;
  source: TberkikaSource;
  note?: string;
  date: string;
}

const STORAGE_KEY = 'tberkika';
const EVENT_NAME = 'kadi:tberkika-updated';

export function readTberkikaList(): TberkikaEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, idx) => {
        if (typeof item === 'string') {
          try {
            const obj = JSON.parse(item);
            return {
              uid: obj.uid || `tb-${idx}-${obj.date || Date.now()}`,
              id: String(obj.id || ''),
              productName: obj.productName ? String(obj.productName) : undefined,
              type: obj.type as TberkikaType,
              source: obj.source as TberkikaSource,
              note: obj.note ? String(obj.note) : undefined,
              date: String(obj.date || new Date().toISOString())
            } as TberkikaEntry;
          } catch {
            return null;
          }
        }
        if (item && typeof item === 'object' && item.id && item.type && item.source) {
          return {
            uid: String(item.uid || `tb-${idx}-${item.date || Date.now()}`),
            id: String(item.id),
            productName: item.productName ? String(item.productName) : undefined,
            type: item.type as TberkikaType,
            source: item.source as TberkikaSource,
            note: item.note ? String(item.note) : undefined,
            date: String(item.date || new Date().toISOString())
          } as TberkikaEntry;
        }
        return null;
      })
      .filter((x): x is TberkikaEntry => x !== null);
  } catch {
    return [];
  }
}

function writeTberkikaList(list: TberkikaEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function getLatestTberkikaForProduct(
  list: TberkikaEntry[],
  productId: string
): TberkikaEntry | null {
  let latest: TberkikaEntry | null = null;
  for (const item of list) {
    if (item.id !== productId) continue;
    if (!latest || item.date > latest.date) {
      latest = item;
    }
  }
  return latest;
}

interface TberkikaButtonProps {
  productId: string;
  productName: string;
  className?: string;
}

export const TberkikaButton: React.FC<TberkikaButtonProps> = ({
  productId,
  productName,
  className = ''
}) => {
  const { language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<TberkikaType | null>(null);
  const [selectedSource, setSelectedSource] = useState<TberkikaSource | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [entries, setEntries] = useState<TberkikaEntry[]>(() =>
    readTberkikaList().filter((e) => e.id === productId)
  );

  useEffect(() => {
    const sync = () => {
      setEntries(
        readTberkikaList()
          .filter((e) => e.id === productId)
          .sort((a, b) => (b.date > a.date ? 1 : -1))
      );
    };
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, [productId]);

  const latest = entries[0] ?? null;

  const typeOptions: {
    value: TberkikaType;
    labelAr: string;
    labelFr: string;
    labelEn: string;
    activeClass: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'غادي يزيد',
      labelAr: 'غادي يزيد',
      labelFr: 'Va augmenter',
      labelEn: 'About to rise',
      activeClass: 'bg-amber-500 text-white border-amber-500 shadow-xs',
      icon: <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
    },
    {
      value: 'زاد',
      labelAr: 'زاد',
      labelFr: 'A augmenté',
      labelEn: 'Increased',
      activeClass: 'bg-rose-600 text-white border-rose-600 shadow-xs',
      icon: <TrendingUp className="w-3.5 h-3.5 shrink-0" />
    },
    {
      value: 'ينقص',
      labelAr: 'ينقص',
      labelFr: 'En baisse',
      labelEn: 'Dropping',
      activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
      icon: <TrendingDown className="w-3.5 h-3.5 shrink-0" />
    }
  ];

  const sourceOptions: {
    value: TberkikaSource;
    labelAr: string;
    labelFr: string;
    labelEn: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'مورّد',
      labelAr: 'مورّد',
      labelFr: 'Fournisseur',
      labelEn: 'Supplier',
      icon: <Truck className="w-3.5 h-3.5 shrink-0" />
    },
    {
      value: 'حانوت',
      labelAr: 'حانوت',
      labelFr: 'Épicerie',
      labelEn: 'Neighbor shop',
      icon: <Store className="w-3.5 h-3.5 shrink-0" />
    },
    {
      value: 'زبون',
      labelAr: 'زبون',
      labelFr: 'Client',
      labelEn: 'Customer',
      icon: <User className="w-3.5 h-3.5 shrink-0" />
    }
  ];

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedType(latest?.type ?? null);
    setSelectedSource(latest?.source ?? null);
    setNoteInput('');
    setIsOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !selectedSource) return;

    const all = readTberkikaList();
    const newEntry: TberkikaEntry = {
      uid: `tb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      id: productId,
      productName,
      type: selectedType,
      source: selectedSource,
      note: noteInput.trim() || undefined,
      date: new Date().toISOString()
    };
    writeTberkikaList([newEntry, ...all]);
    setIsOpen(false);
  };

  const handleDeleteEntry = (uid: string) => {
    const filtered = readTberkikaList().filter((item) => item.uid !== uid);
    writeTberkikaList(filtered);
  };

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(isAr ? 'ar-MA' : isFr ? 'fr-FR' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };

  const getTypeColorText = (type: TberkikaType) => {
    if (type === 'غادي يزيد') return 'text-amber-600 dark:text-amber-400';
    if (type === 'زاد') return 'text-rose-600 dark:text-rose-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  const buttonToneClass = latest
    ? latest.type === 'غادي يزيد'
      ? 'bg-amber-500 text-white hover:bg-amber-600'
      : latest.type === 'زاد'
      ? 'bg-rose-600 text-white hover:bg-rose-700'
      : 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-white/95 dark:bg-slate-900/95 hover:bg-amber-500 hover:text-white text-slate-700 dark:text-slate-200';

  const modalTitle = latest
    ? `${productName} — ${latest.type} · ${latest.source}`
    : isAr
    ? `الودن (تبركيكة السوق) · ${productName}`
    : isFr
    ? `Info marché · ${productName}`
    : `Market Intel · ${productName}`;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
          }
        }}
        className={`p-1 rounded-lg shadow-sm backdrop-blur-xs transition-all active:scale-90 flex items-center justify-center ${buttonToneClass} ${className}`}
        title={modalTitle}
        aria-label={modalTitle}
      >
        <Ear className="w-3 h-3 stroke-[2]" />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Ear className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {productName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isAr
                        ? 'الودن — سجل أخبار الثمن فالسوق'
                        : isFr
                        ? 'Rumeur prix du marché'
                        : 'Market price intel'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label={isAr ? 'إغلاق' : 'Close'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Price Trend Type */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'شنو واقع فالثمن؟' : isFr ? 'Tendance du prix' : 'Price movement'}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {typeOptions.map((opt) => {
                      const active = selectedType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelectedType(opt.value)}
                          className={`min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-95 whitespace-nowrap ${
                            active
                              ? opt.activeClass
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {opt.icon}
                          <span>{isAr ? opt.labelAr : isFr ? opt.labelFr : opt.labelEn}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Intel Source */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'منين جا الخبر؟ (المصدر)' : isFr ? 'Source' : 'Source'}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {sourceOptions.map((opt) => {
                      const active = selectedSource === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelectedSource(opt.value)}
                          className={`min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-95 whitespace-nowrap ${
                            active
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {opt.icon}
                          <span>{isAr ? opt.labelAr : isFr ? opt.labelFr : opt.labelEn}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional quick note */}
                <div>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder={
                      isAr
                        ? 'ملاحظة اختيارية (مثلاً: الزيادة +2 درهم الأسبوع الجاي)'
                        : isFr
                        ? 'Note optionnelle...'
                        : 'Optional note...'
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {isAr ? 'إلغاء' : isFr ? 'Annuler' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedType || !selectedSource}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isAr ? 'سجل التبركيكة' : isFr ? 'Enregistrer' : 'Save'}</span>
                  </button>
                </div>
              </form>

              {/* Recent saved rumors for this product */}
              {entries.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 max-h-44 overflow-y-auto">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? `السجل (${entries.length})` : `History (${entries.length})`}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {entries.map((entry) => (
                      <div
                        key={entry.uid}
                        className="py-1.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-extrabold ${getTypeColorText(entry.type)}`}>
                              {entry.type}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {entry.source}
                            </span>
                            <span className="text-slate-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {formatDate(entry.date)}
                            </span>
                          </div>
                          {entry.note && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {entry.note}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(entry.uid)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                          title={isAr ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

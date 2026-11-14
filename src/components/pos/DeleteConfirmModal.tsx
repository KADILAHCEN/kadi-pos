import React from 'react';
import { Product } from '../../types';
import { usePos } from '../../context/PosContext';
import { getT } from '../../utils/translations';
import { AlertTriangle, Trash2, X, Tag } from 'lucide-react';
import { playSound } from '../../utils/audio';

interface DeleteConfirmModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (productId: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  product,
  isOpen,
  onClose,
  onConfirm
}) => {
  const { currencySymbol, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  if (!isOpen || !product) return null;

  const handleConfirm = () => {
    playSound('click');
    onConfirm(product.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-black text-base text-rose-700 dark:text-rose-300">
                {isAr ? 'واش متأكد باغي تمسح هذا المنتج؟' : isFr ? 'Êtes-vous sûr de supprimer ?' : 'Are you sure you want to delete?'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'تأكيد عملية الحذف النهائي' : 'Confirm permanent deletion'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product Preview Card */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center gap-3.5">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0 border border-slate-200 dark:border-slate-700">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white"
                  style={{ backgroundColor: product.color || '#059669' }}
                >
                  <Tag className="w-6 h-6 opacity-75" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                {product.name}
              </h4>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {product.barcode || product.sku}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {product.price.toFixed(2)} {currencySymbol}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                  المخزون: {product.stock}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-900/60">
            {isAr
              ? '⚠️ تحذير: سيتم حذف هذا المنتج نهائياً من نقطة البيع وقاعدة بيانات المخزون ولا يمكن التراجع عن هذا الإجراء.'
              : '⚠️ Warning: This product will be permanently removed from POS and inventory.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isAr ? 'إلغاء' : isFr ? 'Annuler' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm hover:shadow transition-all flex items-center gap-2 active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isAr ? 'نعم، مسح المنتج' : isFr ? 'Oui, supprimer' : 'Yes, Delete Item'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { usePos } from '../../context/PosContext';
import { Lock, ShieldAlert, KeyRound, X, Check, Delete } from 'lucide-react';
import { playSound } from '../../utils/audio';

interface PinGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export const PinGateModal: React.FC<PinGateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title,
  description
}) => {
  const { verifyManagerPin, language, settings } = usePos();
  const isAr = language === 'ar';
  const isUsingDefaultPin = !settings.managerPin || settings.managerPin === '1234';

  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      setErrorMsg(null);
      playSound('beep');

      if (nextPin.length === 4) {
        // Auto check 4-digit pin
        setTimeout(() => {
          if (verifyManagerPin(nextPin)) {
            playSound('success');
            onSuccess();
            onClose();
          } else {
            playSound('error');
            setErrorMsg(isAr ? 'رمز PIN غير صحيح! المرجو المحاولة مجدداً.' : 'Invalid PIN! Please try again.');
            setPin('');
          }
        }, 150);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyManagerPin(pin)) {
      playSound('success');
      onSuccess();
      onClose();
    } else {
      playSound('error');
      setErrorMsg(isAr ? 'رمز PIN غير صحيح! المرجو المحاولة مجدداً.' : 'Invalid PIN! Please try again.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 end-4 w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Lock Icon */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-inner mb-3">
          <Lock className="w-7 h-7 stroke-[2.5]" />
        </div>

        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          {title || (isAr ? 'حماية الدخول بالرقم السري' : 'Enter Manager PIN')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[260px] leading-relaxed">
          {description ||
            (isAr
              ? 'هذا القسم محمي بكلمة مرور. المرجو إدخال الرقم السري الخاص بالمدير للمتابعة.'
              : 'This section is protected. Please enter the manager PIN to proceed.')}
        </p>

        {/* PIN Indicators */}
        <div className="flex items-center justify-center gap-3 my-5">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'bg-emerald-600 dark:bg-emerald-400 scale-110 shadow-sm'
                    : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mb-4 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold animate-shake">
            {errorMsg}
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px] mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-900 dark:text-white font-mono font-bold text-lg transition-all active:scale-95 shadow-2xs"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin('')}
            className="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold text-xs transition-all active:scale-95"
          >
            {isAr ? 'مسح' : 'Clear'}
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-900 dark:text-white font-mono font-bold text-lg transition-all active:scale-95 shadow-2xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all active:scale-95"
          >
            <Delete className="w-5 h-5 rtl:scale-x-[-1]" />
          </button>
        </div>

        <div className="text-[11px] text-slate-400">
          {isUsingDefaultPin
            ? isAr
              ? 'الرقم السري الافتراضي للمدير: 1234 (يُنصح بتغييره من الإعدادات)'
              : 'Default Manager PIN: 1234 (change in Settings)'
            : isAr
            ? 'حماية مفعّلة برمز المدير المخصص'
            : 'Custom Manager PIN enabled'}
        </div>
      </div>
    </div>
  );
};

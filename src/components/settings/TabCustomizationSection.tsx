import React, { useState } from 'react';
import { Check, Palette, RotateCcw, Sparkles } from 'lucide-react';
import { usePos } from '../../context/PosContext';
import {
  POS_TAB_CATALOG,
  TAB_COLOR_PRESETS,
  TAB_ICON_OPTIONS,
  TabColorKey,
  TabIconKey,
  resolveTabVisual
} from '../../utils/tabCustomization';

export const TabCustomizationSection: React.FC = () => {
  const { settings, updateSettings, language } = usePos();
  const isAr = language === 'ar';
  const isFr = language === 'fr';

  const [selectedTabId, setSelectedTabId] = useState<string>('pos');
  const [feedback, setFeedback] = useState<string | null>(null);

  const customizations = settings.tabCustomizations || {};
  const activeVisual = resolveTabVisual(selectedTabId, customizations);

  const getTabLabel = (def: (typeof POS_TAB_CATALOG)[number]) =>
    isAr ? def.labelAr : isFr ? def.labelFr : def.labelEn;

  const handleAssign = (updates: { icon?: TabIconKey; color?: TabColorKey }) => {
    const next = {
      ...customizations,
      [selectedTabId]: {
        ...(customizations[selectedTabId] || {}),
        ...updates
      }
    };
    updateSettings({ tabCustomizations: next });
    setFeedback(
      isAr
        ? `تم تحديث "${getTabLabel(activeVisual.definition)}" بنجاح`
        : `Updated "${getTabLabel(activeVisual.definition)}"`
    );
    window.setTimeout(() => setFeedback(null), 2000);
  };

  const handleResetSingle = () => {
    const next = { ...customizations };
    delete next[selectedTabId];
    updateSettings({ tabCustomizations: next });
    setFeedback(isAr ? 'تمت استعادة الإعداد الافتراضي للتبويب' : 'Tab reset to default');
    window.setTimeout(() => setFeedback(null), 2000);
  };

  const handleResetAll = () => {
    updateSettings({ tabCustomizations: {} });
    setFeedback(isAr ? 'تمت استعادة جميع الأيقونات والألوان الافتراضية' : 'All tabs reset to defaults');
    window.setTimeout(() => setFeedback(null), 2500);
  };

  const colorList = Object.values(TAB_COLOR_PRESETS);

  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              {isAr
                ? 'تخصيص أيقونات وألوان التبويبات (POS Tabs)'
                : isFr
                ? 'Icônes et couleurs personnalisées des onglets'
                : 'Customize POS Tab Icons & Colors'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? 'اختر أي تبويب لتغيير أيقونته ولونه لسهولة التمييز البصري في الشريط العلوي وشريط الهاتف'
              : 'Pick any POS tab to assign a custom icon and color for instant visual organization across desktop and mobile.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {feedback && (
            <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{feedback}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleResetAll}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'استعادة الكل' : 'Reset All'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Tab Selector Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {POS_TAB_CATALOG.map((tab) => {
          const { IconComponent, colorPreset } = resolveTabVisual(tab.id, customizations);
          const isSelected = selectedTabId === tab.id;
          const isCustomized = Boolean(customizations[tab.id]?.icon || customizations[tab.id]?.color);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTabId(tab.id)}
              className={`min-h-[46px] p-2.5 rounded-2xl border text-start flex items-center gap-2.5 transition-all ${
                isSelected
                  ? `${colorPreset.activeNavClass} ${colorPreset.ringClass} shadow-xs`
                  : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isSelected ? colorPreset.badgeSolidClass : colorPreset.softCardClass
                } border`}
              >
                <IconComponent className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-extrabold truncate">{getTabLabel(tab)}</div>
                {isCustomized && (
                  <div className="text-[10px] opacity-75 font-bold flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>{isAr ? 'مخصص' : 'Custom'}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Tab Editor Panel */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold ${activeVisual.colorPreset.activeNavClass}`}
            >
              <activeVisual.IconComponent className="w-4 h-4" />
              <span>{getTabLabel(activeVisual.definition)}</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr ? 'معاينة التبويب النشط' : 'Active tab preview'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleResetSingle}
            className="text-xs font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'افتراضي هذا التبويب' : 'Reset this tab'}</span>
          </button>
        </div>

        {/* Color Presets */}
        <div className="space-y-2">
          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
            {isAr ? '1. اختر اللون المميز:' : '1. Choose Accent Color:'}
          </div>
          <div className="flex flex-wrap gap-2">
            {colorList.map((preset) => {
              const isSelectedColor = activeVisual.colorKey === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleAssign({ color: preset.id })}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    isSelectedColor
                      ? `${preset.softCardClass} ${preset.ringClass}`
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/50 shadow-2xs"
                    style={{ backgroundColor: preset.swatchHex }}
                  />
                  <span>{isAr ? preset.labelAr : preset.labelEn}</span>
                  {isSelectedColor && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Icon Picker Grid */}
        <div className="space-y-2">
          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
            {isAr ? '2. اختر الأيقونة:' : '2. Choose Icon:'}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {TAB_ICON_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelectedIcon = activeVisual.iconKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleAssign({ icon: opt.key })}
                  title={isAr ? opt.labelAr : opt.labelEn}
                  className={`min-h-[44px] p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    isSelectedIcon
                      ? `${activeVisual.colorPreset.activeNavClass} ${activeVisual.colorPreset.ringClass}`
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-[9px] font-bold truncate max-w-full">
                    {isAr ? opt.labelAr : opt.labelEn}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

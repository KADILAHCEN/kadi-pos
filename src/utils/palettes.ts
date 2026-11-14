import { AppPalette } from '../types';

export const BUILT_IN_PALETTES: AppPalette[] = [
  {
    id: 'emerald_oled',
    name: 'الزمردي الليلي (الافتراضي)',
    nameEn: 'Emerald OLED',
    isBuiltIn: true,
    primaryColor: '#059669',
    accentColor: '#10b981',
    darkBgColor: '#04060a',
    darkCardColor: '#0a0f18',
    preferredMode: 'keep'
  },
  {
    id: 'royal_sapphire',
    name: 'الأزرق الملكي (Sapphire)',
    nameEn: 'Royal Sapphire',
    isBuiltIn: true,
    primaryColor: '#2563eb',
    accentColor: '#38bdf8',
    darkBgColor: '#04070f',
    darkCardColor: '#0a1120',
    preferredMode: 'keep'
  },
  {
    id: 'cyber_violet',
    name: 'البنفسجي العصري (Violet)',
    nameEn: 'Midnight Violet',
    isBuiltIn: true,
    primaryColor: '#7c3aed',
    accentColor: '#c084fc',
    darkBgColor: '#06050e',
    darkCardColor: '#100c1f',
    preferredMode: 'keep'
  },
  {
    id: 'warm_amber',
    name: 'الذهبي الدافئ (Amber)',
    nameEn: 'Warm Amber Gold',
    isBuiltIn: true,
    primaryColor: '#d97706',
    accentColor: '#fbbf24',
    darkBgColor: '#090704',
    darkCardColor: '#14100a',
    preferredMode: 'keep'
  },
  {
    id: 'crimson_ruby',
    name: 'الياقوتي الداكن (Ruby)',
    nameEn: 'Crimson Ruby',
    isBuiltIn: true,
    primaryColor: '#e11d48',
    accentColor: '#fb7185',
    darkBgColor: '#0a0507',
    darkCardColor: '#160b10',
    preferredMode: 'keep'
  },
  {
    id: 'ocean_teal',
    name: 'تركواز المحيط (Ocean)',
    nameEn: 'Ocean Teal',
    isBuiltIn: true,
    primaryColor: '#0d9488',
    accentColor: '#2dd4bf',
    darkBgColor: '#04090a',
    darkCardColor: '#091416',
    preferredMode: 'keep'
  }
];

function normalizeHex(hex: string, fallback = '#059669'): string {
  const clean = (hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean;
  if (/^#[0-9a-fA-F]{3}$/.test(clean)) {
    return (
      '#' +
      clean[1] +
      clean[1] +
      clean[2] +
      clean[2] +
      clean[3] +
      clean[3]
    );
  }
  return fallback;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const safe = normalizeHex(hex);
  const r = parseInt(safe.slice(1, 3), 16) / 255;
  const g = parseInt(safe.slice(3, 5), 16) / 255;
  const b = parseInt(safe.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hNorm < 60) {
    r = c; g = x; b = 0;
  } else if (hNorm < 120) {
    r = x; g = c; b = 0;
  } else if (hNorm < 180) {
    r = 0; g = c; b = x;
  } else if (hNorm < 240) {
    r = 0; g = x; b = c;
  } else if (hNorm < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function generateBrandColorScale(primaryHex: string, accentHex?: string): Record<string, string> {
  const { h, s, l } = hexToHsl(primaryHex);
  const accentHsl = accentHex ? hexToHsl(accentHex) : { h, s, l: Math.min(62, l + 10) };
  // Clamp base saturation so gray/black inputs remain clean and colorful inputs stay legible
  const brandS = Math.max(25, Math.min(92, s));
  const safePrimaryL = Math.max(32, Math.min(48, l));

  return {
    '50': hslToHex(h, Math.min(brandS, 85), 96),
    '100': hslToHex(h, Math.min(brandS, 82), 91),
    '200': hslToHex(h, Math.min(brandS, 78), 83),
    '300': hslToHex(accentHsl.h, Math.max(30, accentHsl.s), 73),
    '400': hslToHex(accentHsl.h, Math.max(35, accentHsl.s), 61),
    '500': hslToHex(h, brandS, Math.min(54, safePrimaryL + 8)),
    '600': hslToHex(h, brandS, safePrimaryL),
    '700': hslToHex(h, brandS, Math.max(24, safePrimaryL - 7)),
    '800': hslToHex(h, Math.min(brandS, 76), 22),
    '900': hslToHex(h, Math.min(brandS, 74), 15),
    '950': hslToHex(h, Math.min(brandS, 72), 9)
  };
}

export function deriveDarkSurfaceTokens(darkBgHex: string, darkCardHex: string): Record<string, string> {
  const bg = hexToHsl(darkBgHex);
  const card = hexToHsl(darkCardHex);

  // Enforce true dark luminance ranges so text stays readable
  const l950 = Math.min(7, Math.max(2, bg.l));
  const l900 = Math.min(12, Math.max(l950 + 3, card.l));
  const l800 = Math.min(18, l900 + 5);
  const l700 = Math.min(26, l800 + 7);
  const l600 = Math.min(35, l700 + 8);

  const satBg = Math.min(45, bg.s);
  const satCard = Math.min(45, card.s);

  return {
    '950': hslToHex(bg.h, satBg, l950),
    '900': hslToHex(card.h, satCard, l900),
    '800': hslToHex(card.h, satCard, l800),
    '700': hslToHex(card.h, Math.max(18, satCard), l700),
    '600': hslToHex(card.h, Math.max(18, satCard), l600)
  };
}

export function applyPaletteToDocument(palette: AppPalette, isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const brandScale = generateBrandColorScale(palette.primaryColor, palette.accentColor);
  Object.entries(brandScale).forEach(([shade, val]) => {
    root.style.setProperty(`--color-emerald-${shade}`, val);
  });

  const darkSurfaces = deriveDarkSurfaceTokens(palette.darkBgColor, palette.darkCardColor);
  Object.entries(darkSurfaces).forEach(([shade, val]) => {
    root.style.setProperty(`--palette-dark-${shade}`, val);
  });

  root.style.setProperty('--palette-primary', normalizeHex(palette.primaryColor));
  root.style.setProperty('--palette-accent', normalizeHex(palette.accentColor));

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute(
      'content',
      isDark ? darkSurfaces['950'] : brandScale['600']
    );
  }
}

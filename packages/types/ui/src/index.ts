/** Nexora design system tokens (dark-mode-first). */

export const colors = {
  bg: {
    base: '#0B0E14',
    elevated: '#11151E',
    overlay: '#161B26',
  },
  border: {
    default: '#1E2530',
    strong: '#2A3442',
  },
  text: {
    primary: '#F5F7FA',
    secondary: '#A7B0BE',
    muted: '#6B7482',
    inverse: '#0B0E14',
  },
  brand: {
    // Electric indigo/violet accent — premium, technological, minimal.
    primary: '#7C5CFF',
    primaryHover: '#8E72FF',
    accent: '#00D9C0',
    gradient: 'linear-gradient(135deg, #7C5CFF 0%, #00D9C0 100%)',
  },
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
  },
} as const;

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2.5rem',
  xxl: '4rem',
} as const;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  pill: '999px',
} as const;

export const fontSizes = {
  xs: '0.75rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.25rem',
  xl: '1.75rem',
  xxl: '2.5rem',
  display: '4rem',
} as const;

/**
 * Design tokens for Lobster canvas cards.
 * @module canvas/theme
 */

const SCALE = 2; // render at 2x for crisp text
const BASE_WIDTH = 1200;
const BASE_HEIGHT = 675;

module.exports = {
  SCALE,
  BASE_WIDTH,
  BASE_HEIGHT,
  WIDTH: BASE_WIDTH * SCALE,
  DEFAULT_HEIGHT: BASE_HEIGHT * SCALE,
  MAX_HEIGHT: 1600 * SCALE,

  colors: {
    bgTop: '#0B1220',
    bgBottom: '#05070D',
    border: 'rgba(255,255,255,0.10)',
    borderSubtle: 'rgba(255,255,255,0.08)',
    surface: 'rgba(255,255,255,0.05)',
    surfaceHover: 'rgba(255,255,255,0.07)',
    accent: '#FF5A4F',
    accentGlow: 'rgba(255,90,79,0.08)',
    success: '#22C55E',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#38BDF8',
    textPrimary: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    gold: '#FBBF24',
    silver: '#CBD5E1',
    bronze: '#F97316',
  },

  fonts: {
    bold: 'Inter Bold',
    semibold: 'Inter SemiBold',
    regular: 'Inter Regular',
    // fallbacks
    fallback: 'sans-serif',
  },

  sizes: {
    title: 54 * SCALE,
    subtitle: 28 * SCALE,
    value: 34 * SCALE,
    body: 24 * SCALE,
    label: 18 * SCALE,
    small: 18 * SCALE,
    min: 18 * SCALE,
  },

  spacing: {
    outer: 56 * SCALE,
    gap: 24 * SCALE,
    gapSm: 12 * SCALE,
    panelPadding: 24 * SCALE,
  },

  radius: {
    card: 28 * SCALE,
    panel: 18 * SCALE,
    pill: 999 * SCALE,
    avatar: 999 * SCALE,
  },

  line: {
    border: 1.5 * SCALE,
    borderSubtle: 1 * SCALE,
  },
};

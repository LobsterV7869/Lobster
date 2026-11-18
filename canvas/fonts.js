/**
 * Font registration for canvas rendering.
 * Tries to register Inter fonts; falls back to system sans-serif safely.
 * @module canvas/fonts
 */

const path = require('node:path');
const fs = require('node:fs');

let registered = false;
let canvasAvailable = false;
let GlobalFonts = null;

function tryRequireCanvas() {
  try {
    const mod = require('@napi-rs/canvas');
    GlobalFonts = mod.GlobalFonts;
    canvasAvailable = true;
    return true;
  } catch (e) {
    canvasAvailable = false;
    return false;
  }
}

const FONT_CANDIDATES = [
  path.join(__dirname, '..', 'assets', 'fonts'),
  path.join(process.cwd(), 'assets', 'fonts'),
  path.join(__dirname, 'fonts'),
  // common Linux paths
  '/usr/share/fonts/truetype/inter',
  '/usr/share/fonts/inter',
  '/usr/local/share/fonts',
  '/usr/share/fonts',
];

const INTER_FILES = {
  'Inter Regular': ['Inter-Regular.ttf', 'Inter_400Regular.ttf', 'Inter_18pt-Regular.ttf', 'Inter[slnt,wght].ttf'],
  'Inter SemiBold': ['Inter-SemiBold.ttf', 'Inter_600SemiBold.ttf', 'Inter_18pt-SemiBold.ttf'],
  'Inter Bold': ['Inter-Bold.ttf', 'Inter_700Bold.ttf', 'Inter_18pt-Bold.ttf'],
};

/**
 * Register fonts if available. Safe to call multiple times.
 * @returns {{ registered: boolean, canvasAvailable: boolean, families: string[] }}
 */
function registerFonts() {
  if (registered) return { registered: true, canvasAvailable, families: getFamilies() };
  registered = true;
  if (!tryRequireCanvas() || !GlobalFonts) {
    console.log('[canvas/fonts] @napi-rs/canvas not available, using fallback fonts');
    return { registered: false, canvasAvailable: false, families: [] };
  }

  const families = [];
  for (const [family, files] of Object.entries(INTER_FILES)) {
    let done = false;
    for (const dir of FONT_CANDIDATES) {
      for (const file of files) {
        const fp = path.join(dir, file);
        try {
          if (fs.existsSync(fp)) {
            GlobalFonts.registerFromPath(fp, family);
            families.push(family);
            done = true;
            break;
          }
        } catch (e) { /* ignore */ }
      }
      if (done) break;
    }
    if (!done) {
      // try system font by name (some setups have it registered)
    }
  }

  if (families.length) {
    console.log(`[canvas/fonts] Registered: ${families.join(', ')}`);
  } else {
    console.log('[canvas/fonts] Inter fonts not found, falling back to sans-serif');
  }
  return { registered: families.length > 0, canvasAvailable: true, families };
}

function getFamilies() {
  if (!GlobalFonts) return [];
  try {
    return GlobalFonts.families?.map(f => f.family) || [];
  } catch (e) { return []; }
}

/**
 * Get a font string with fallback.
 * @param {'bold'|'semibold'|'regular'} weight
 * @param {number} size
 * @param {string} [extra]
 * @returns {string}
 */
function font(weight, size, extra = '') {
  const theme = require('./theme');
  const family = theme.fonts[weight] || theme.fonts.regular;
  const prefix = extra ? `${extra} ` : '';
  return `${prefix}${Math.round(size)}px "${family}", "${theme.fonts.fallback}"`;
}

module.exports = { registerFonts, font, getFamilies };

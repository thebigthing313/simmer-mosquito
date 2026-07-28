/**
 * The brand scales in sRGB hex, for consumers that cannot read CSS.
 *
 * `tokens.css` is the source of truth: it defines these scales in OKLCH, and
 * that is what browsers actually render. Every value below is the sRGB
 * conversion of the matching `--simmer-*` custom property — nothing here is an
 * independent decision.
 *
 * These two files drifted once, in the quiet way this kind of duplication
 * always does. The four steps aliased into `brand` below stayed in sync because
 * people edited them deliberately; the other sixteen ramp steps diverged and
 * nobody noticed, because the only consumer is the design-token showcase in
 * `apps/preview` — the one screen people go to in order to *look up* a colour.
 *
 * `colors.drift.test.ts` now derives these values from `tokens.css` and fails
 * if they stop matching. Don't hand-edit a value here: change the OKLCH in
 * `tokens.css` and let the test tell you the new hex.
 */

/** sRGB of `--simmer-green-50` … `--simmer-green-900`. */
export const green = {
	50: '#e7faed',
	100: '#cff1da',
	200: '#a7dbb9',
	300: '#7bc296',
	400: '#4ba272',
	500: '#2b8c5d',
	600: '#1b7e53',
	700: '#0c5331',
	800: '#053d22',
	900: '#032815',
} as const;

/** sRGB of `--simmer-yellow-50` … `--simmer-yellow-900`. */
export const yellow = {
	50: '#fcfcea',
	100: '#f5f6ce',
	200: '#eae7a6',
	300: '#ddd474',
	400: '#cdbc43',
	500: '#b09a27',
	600: '#907813',
	700: '#6a5411',
	800: '#48370e',
	900: '#2d2109',
} as const;

/**
 * The named brand constants. These four scale steps are the ones with a brand
 * meaning attached, which is why they are aliased rather than restated.
 */
export const brand = {
	green: green[600],
	darkGreen: green[700],
	darkerGreen: green[800],
	yellow: yellow[100],
	purple: '#893f8c',
	red: '#ef2352',
	blue: '#2d46b6',
} as const;

export type BrandColor = keyof typeof brand;
export type BrandScale = keyof typeof green;

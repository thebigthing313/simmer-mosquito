import { brand, green } from '@simmer-mosquito/design-tokens';

/**
 * The design tokens, in the shape React Native can consume.
 *
 * `packages/design-tokens` is the source of truth and `tokens.css` is where the
 * colour decisions are actually made — in OKLCH, which is what browsers render.
 * The TypeScript constants imported here are the sRGB conversions of those same
 * decisions, maintained for exactly this case: consumers that cannot read CSS
 * variables. Maps and charts already read them; React Native is the third.
 *
 * So nothing below is a colour decision. Anything that looks like one belongs
 * in `tokens.css`, and `colors.drift.test.ts` will notice if the two disagree.
 * The greys are the one gap — `tokens.css` expresses surfaces as semantic
 * variables with no TypeScript counterpart yet, so they are stated here and
 * should move into the package the moment a second platform wants them.
 */

const neutral = {
	0: '#ffffff',
	50: '#f7f8f7',
	100: '#eceeec',
	200: '#d8dcd9',
	400: '#8b938d',
	600: '#4d554f',
	900: '#171a18',
} as const;

export const theme = {
	color: {
		background: neutral[50],
		surface: neutral[0],
		border: neutral[200],
		text: neutral[900],
		textMuted: neutral[600],
		textFaint: neutral[400],
		accent: brand.green,
		accentPressed: brand.darkGreen,
		accentText: neutral[0],
		accentSurface: green[50],
		danger: brand.red,
		fieldBackground: neutral[100],
	},
	/** A 4pt rhythm, matching the web scale. */
	space: {
		xs: 4,
		sm: 8,
		md: 16,
		lg: 24,
		xl: 32,
	},
	radius: {
		sm: 6,
		md: 10,
		lg: 16,
	},
	fontSize: {
		sm: 13,
		base: 15,
		lg: 18,
		title: 26,
	},
} as const;

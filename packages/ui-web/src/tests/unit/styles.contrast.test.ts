import { fileURLToPath } from 'node:url';
import {
	contrastRatio,
	NON_TEXT_AA,
	parseCssColor,
	type RgbColor,
	TEXT_AA,
} from '@simmer-mosquito/design-tokens/color';
import { describe, expect, it } from 'vitest';
import { readDeclarations } from '../../../../../scripts/lib/stylesheet-tokens.mjs';

/**
 * Contrast guard for the semantic token set.
 *
 * This exists because of how the two contrast bugs it now covers actually got
 * shipped: neither was in a base colour. Body copy, headings, and surfaces were
 * always comfortable. What failed were the colours that only appear under a
 * *condition* — focus, error, invalid, inactive — which are exactly the states
 * you have to trigger to look at, and therefore the ones visual review skips.
 * The focus ring sat at 1.24:1 and every form error at 4.07:1 for as long as
 * nobody tabbed into a field and squinted.
 *
 * So the assertions below are deliberately weighted toward state colours rather
 * than the obvious pairs. They read the real stylesheets and resolve the real
 * `var()` and `color-mix()` chains, so editing a token is what moves them —
 * there is no duplicated copy of the palette here to drift out of sync.
 *
 * The colour maths comes from `@simmer-mosquito/design-tokens/color`, which
 * means `packages/design-tokens` has to be built before this suite runs, the
 * same way `apps/server`'s integration suites need `packages/db` built. All of
 * it, including the `color-mix()`: this file kept its own interpolation until
 * #707, and the two had drifted apart. This one mixed in rectangular
 * coordinates and composited `transparent` toward white, where the register
 * mixes in polar OKLCH the short way around the hue circle and answers `null`
 * for a mix the browser leaves see-through. Chrome settled it in #706 and the
 * register is what it settled on.
 *
 * What stays here is the `var()` substitution below, which is the half a
 * browser does for free: following a token's chain until what is left is
 * colour syntax the parser can read. The design-token screen in `apps/preview`
 * gets that substitution from `getComputedStyle` and hands the same kind of
 * text to the same parser, which is why the parser is the shared half and the
 * substitution is not.
 *
 * The declaration reader is not here either. `scripts/lib/stylesheet-tokens.mjs`
 * holds it, because `check-registered-tokens.mjs` asks a different question of
 * the same two files and a second parse of them would be the copy that drifts
 * (#632).
 */

const TOKENS_CSS = fileURLToPath(
	new URL('../../../../design-tokens/src/tokens.css', import.meta.url),
);
const STYLES_CSS = fileURLToPath(new URL('../../styles.css', import.meta.url));

// --- token resolution -------------------------------------------------------

const WHITE: RgbColor = { r: 255, g: 255, b: 255 };

/** `--name: value;` pairs from both stylesheets, later files winning. */
function readVariables(): ReadonlyMap<string, string> {
	const vars = new Map<string, string>();
	for (const file of [TOKENS_CSS, STYLES_CSS]) {
		for (const { name, value } of readDeclarations(file)) {
			vars.set(name, value);
		}
	}
	return vars;
}

const VARS = readVariables();

/** A `var()` reference, anywhere in a value rather than as the whole of one. */
const VAR_REFERENCE = /var\(\s*(--[a-z0-9-]+)\s*\)/gi;

/**
 * Every `var()` in a value replaced by the text the token it names holds.
 *
 * This is the half a browser does before anything else looks at the value, and
 * the half the register cannot do: `parseCssColor` reads colour syntax and
 * knows nothing about the custom properties around it. Substitution is textual
 * and goes all the way down, so a `var()` sitting inside a `color-mix()`
 * argument comes out as the colour it names and the mix is still one string
 * when the parser gets it.
 *
 * `seen` is the path from the token asked for down to this one. A token that
 * names itself would otherwise substitute forever.
 */
function substitute(value: string, seen: ReadonlySet<string>): string {
	return value.replace(VAR_REFERENCE, (_, name: string) => {
		if (seen.has(name)) throw new Error(`circular token reference: ${name}`);
		const next = VARS.get(name);
		if (next === undefined) throw new Error(`unknown token: ${name}`);
		return substitute(next, new Set(seen).add(name));
	});
}

/** One token value as a colour, or a throw naming what stopped it. */
function resolve(value: string): RgbColor {
	const substituted = substitute(value, new Set()).trim();
	const colour = parseCssColor(substituted);
	if (colour === null) throw new Error(`unsupported colour value: ${substituted}`);
	return colour;
}

const token = (name: string): RgbColor => resolve(`var(${name})`);

/** A colour a browser could paint: three whole channels, none out of range. */
function expectPaintable({ r, g, b }: RgbColor): void {
	for (const channel of [r, g, b]) {
		expect(Number.isInteger(channel)).toBe(true);
		expect(channel).toBeGreaterThanOrEqual(0);
		expect(channel).toBeLessThanOrEqual(255);
	}
}
const ratio = (fg: string, bg: string): number => contrastRatio(token(fg), token(bg));

// --- the guard --------------------------------------------------------------

/**
 * The two floors this file asserts against come from the colour register rather
 * than being restated here. `TEXT_AA` is WCAG 1.4.3 for normal text and
 * `NON_TEXT_AA` is 1.4.11 for user-interface components and focus indicators.
 * The register says why the second one is not the large-text allowance, which
 * carries the same number.
 */

/** Every surface a control can sit on, and therefore that a ring must clear. */
const LIGHT_SURFACES = ['--background', '--card', '--muted', '--surface-strong', '--accent'];

describe('semantic token contrast', () => {
	describe('state colours (the ones visual review misses)', () => {
		it('focus ring clears 3:1 on every light surface it can land on', () => {
			for (const surface of LIGHT_SURFACES) {
				expect(
					ratio('--ring', surface),
					`--ring on ${surface} must clear ${NON_TEXT_AA}:1 (WCAG 1.4.11)`,
				).toBeGreaterThanOrEqual(NON_TEXT_AA);
			}
		});

		it('inverse focus ring clears 3:1 on the dark rail', () => {
			expect(ratio('--ring-inverse', '--simmer-green-900')).toBeGreaterThanOrEqual(NON_TEXT_AA);
		});

		it('destructive works as error text, not just as a fill', () => {
			// `text-destructive` carries every FieldError and ~50 inline messages.
			for (const surface of ['--background', '--card', '--muted']) {
				expect(
					ratio('--destructive', surface),
					`--destructive as text on ${surface} must clear ${TEXT_AA}:1`,
				).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('destructive fill carries its own foreground', () => {
			expect(ratio('--destructive-foreground', '--destructive')).toBeGreaterThanOrEqual(TEXT_AA);
			// The destructive Button variant hard-codes `text-white`.
			expect(contrastRatio(WHITE, token('--destructive'))).toBeGreaterThanOrEqual(TEXT_AA);
		});

		it('status tones are readable on their paired backgrounds', () => {
			const pairs: readonly (readonly [string, string])[] = [
				['--success', '--success-bg'],
				['--warning', '--warning-bg'],
				// The environment banner fills with `--attention` rather than the pale
				// `--warning-bg`, because a strip nobody notices is a strip that failed.
				['--warning', '--attention'],
				['--info', '--info-bg'],
				['--catalog', '--catalog-bg'],
				['--danger', '--danger-bg'],
			];
			for (const [fg, bg] of pairs) {
				expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('form control borders are distinguishable from their surface', () => {
			// `--border-strong` is the same job by the other name: DESIGN.md puts it
			// on a 3:1 floor because it draws control boundaries rather than
			// dividers. It was unreachable as a utility until #632 registered it, so
			// the floor had never been asserted.
			for (const border of ['--input', '--border-strong']) {
				for (const surface of ['--background', '--card']) {
					expect(
						ratio(border, surface),
						`${border} on ${surface} must clear ${NON_TEXT_AA}:1 (WCAG 1.4.11)`,
					).toBeGreaterThanOrEqual(NON_TEXT_AA);
				}
			}
		});
	});

	describe('body and supporting copy', () => {
		it('foreground and muted-foreground clear AA on every surface', () => {
			for (const surface of LIGHT_SURFACES) {
				expect(ratio('--foreground', surface), `--foreground on ${surface}`).toBeGreaterThanOrEqual(
					TEXT_AA,
				);
				expect(
					ratio('--muted-foreground', surface),
					`--muted-foreground on ${surface}`,
				).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('quiet metadata clears AA on the surfaces admin puts it on', () => {
			// `--quiet` is 12px caption text in apps/admin — normal size, so 4.5:1.
			for (const surface of ['--background', '--card', '--muted']) {
				expect(ratio('--quiet', surface), `--quiet on ${surface}`).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('primary and sidebar pairs carry their own foreground', () => {
			expect(ratio('--primary-foreground', '--primary')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--secondary-foreground', '--secondary')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--accent-foreground', '--accent')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--sidebar-foreground', '--sidebar')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--sidebar-primary-foreground', '--sidebar-primary')).toBeGreaterThanOrEqual(
				TEXT_AA,
			);
		});
	});

	describe('resolver', () => {
		it('resolves var, nested color-mix, and both oklch lightness forms', () => {
			// --background -> var -> color-mix(in oklch, var(--simmer-green-50) 54%, oklch(99% …))
			expectPaintable(token('--background'));
			// tokens.css writes some values with decimal L rather than percent
			expectPaintable(token('--simmer-purple'));
			expect(() => token('--does-not-exist')).toThrow(/unknown token/);
		});

		it('refuses a token the browser leaves see-through', () => {
			// `--simmer-workshop-chrome` is 94% of a colour and nothing else, so it
			// takes the colour of whatever it is painted over and has no contrast
			// answer of its own. The resolver this file used to carry composited it
			// toward white and gave one anyway. Nothing below asserts on a token
			// like that, and a refusal is what a new assertion on one should get.
			expect(() => token('--simmer-workshop-chrome')).toThrow(/unsupported colour value/);
		});
	});
});

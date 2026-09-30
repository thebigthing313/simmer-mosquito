/**
 * The generated components that scroll draw the `scrollbar-subtle` bar, from
 * the stylesheet (#1261).
 *
 * The files under `components/ui` are regenerated from the shadcn registry, so
 * a class added there by hand is gone after the next regeneration. The bar is
 * applied instead by a rule in `styles.css` keyed on each scroller's
 * `data-slot`. That leaves two things to drift apart with nothing on screen to
 * say so: a regeneration that renames a slot, and a rule that stops naming one.
 * Each case below reads both, the slot off the component's source and the
 * selector off the stylesheet. `autocomplete.tsx` sits beside them and is the
 * one exception: the registry has no autocomplete, so its slot is written by
 * hand and the rule reaches it the same way.
 *
 * The Select scrolls too and is deliberately not in the rule (#1290). Radix
 * hides its viewport's scrollbar because its up and down buttons do the
 * scrolling, and drawing the bar as well put three scroll controls on one list:
 * the bar, the browser's stepper arrow at its foot, and the Radix button. The
 * last case below fails if the viewport comes back into the rule.
 *
 * Read from source rather than rendered because the bar is a computed style,
 * and jsdom neither loads the stylesheet nor measures an overflow.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES_CSS = resolve(HERE, '../../styles.css');
const COMPONENTS_UI = resolve(HERE, '../../components/ui');

/** Each generated scroller: the component module and the slot it renders. */
const SCROLLERS = [
	{ module: 'dropdown-menu.tsx', slot: 'dropdown-menu-content' },
	{ module: 'context-menu.tsx', slot: 'context-menu-content' },
	{ module: 'command.tsx', slot: 'command-list' },
	{ module: 'combobox.tsx', slot: 'combobox-list' },
	// Hand-owned rather than generated: the registry has no autocomplete, so
	// the slot is ours to add and the rule keys on it instead of on a class
	// inside a popover (#1291).
	{ module: 'autocomplete.tsx', slot: 'autocomplete-list' },
	{ module: 'sheet.tsx', slot: 'sheet-content' },
	{ module: 'drawer.tsx', slot: 'drawer-content' },
	{ module: 'sidebar.tsx', slot: 'sidebar-content' },
	{ module: 'table.tsx', slot: 'table-container' },
] as const;

/** Every selector of every rule whose body applies `scrollbar-subtle`. */
function subtleSelectors(): string[] {
	const css = readFileSync(STYLES_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const selectors: string[] = [];
	for (const rule of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
		if (!/@apply\s+scrollbar-subtle\s*;/.test(rule[2] ?? '')) continue;
		for (const selector of (rule[1] ?? '').split(',')) {
			selectors.push(selector.trim().replace(/\s+/g, ' '));
		}
	}
	return selectors;
}

describe('generated scrollers', () => {
	const selectors = subtleSelectors();

	it('reads at least one rule, so a broken parse cannot pass every case', () => {
		expect(selectors.length).toBeGreaterThanOrEqual(SCROLLERS.length);
	});

	for (const scroller of SCROLLERS) {
		const selector = `[data-slot="${scroller.slot}"]`;

		it(`${scroller.module} still renders data-slot="${scroller.slot}"`, () => {
			const source = readFileSync(resolve(COMPONENTS_UI, scroller.module), 'utf8');
			expect(source).toContain(`data-slot="${scroller.slot}"`);
		});

		it(`styles.css applies scrollbar-subtle to ${selector}`, () => {
			expect(selectors).toContain(selector);
		});
	}

	// A hand-written slot can be left behind on a wrapper when the scrolling
	// moves, which the registry cannot do to a generated one. So the element
	// carrying it has to be the one that scrolls.
	it('autocomplete.tsx puts its list slot on the element that scrolls', () => {
		const source = readFileSync(resolve(COMPONENTS_UI, 'autocomplete.tsx'), 'utf8');
		const tag = source.match(/<div\b[^>]*data-slot="autocomplete-list"[^>]*>/)?.[0];
		expect(tag).toMatch(/className="[^"]*\boverflow-y-auto\b[^"]*"/);
	});

	// Radix scrolls a Select with its own buttons and hides the viewport's
	// scrollbar on purpose. Naming the content slot or the viewport here would
	// draw the bar beside those buttons again (#1290).
	it('leaves the Select out, so its scroll buttons are its only scroll control', () => {
		const select = selectors.filter(
			(selector) =>
				selector.includes('select-content') || selector.includes('data-radix-select-viewport'),
		);
		expect(select).toEqual([]);
	});
});

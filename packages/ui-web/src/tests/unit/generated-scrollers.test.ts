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

/**
 * Each generated scroller: the component module, the slot it renders, and the
 * selector that reaches the element that scrolls. The selector is the slot
 * itself except where the scrolling element carries none of its own.
 */
const SCROLLERS = [
	{
		module: 'select.tsx',
		slot: 'select-content',
		selector: '[data-slot="select-content"] [data-radix-select-viewport]',
	},
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
		const selector = 'selector' in scroller ? scroller.selector : `[data-slot="${scroller.slot}"]`;

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
});

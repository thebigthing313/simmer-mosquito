/**
 * The native scrollbar utility and the `ScrollArea` thumb read one colour
 * (#1259).
 *
 * `scrollbar-subtle` is for a scroller `ScrollArea` cannot wrap, so it only
 * earns its place while the two bars look alike. The thumb names its colour as
 * a Tailwind class, `bg-<role>`, and the utility names it as a CSS value, so
 * nothing but this suite joins the two: it reads the role off the thumb in
 * `scroll-area.tsx`, follows it through the `@theme inline` entry that class
 * compiles from, and expects the utility's `scrollbar-color` to be the same
 * value over a transparent track. Changing the thumb's class then fails here
 * until the utility follows it.
 *
 * The thumb is read from source rather than rendered because Radix mounts it
 * only once it has measured a viewport that overflows, and jsdom measures
 * every element at zero.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readBlockDeclarations } from '../../../../../scripts/lib/stylesheet-tokens.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES_CSS = resolve(HERE, '../../styles.css');
const SCROLL_AREA = resolve(HERE, '../../components/ui/scroll-area.tsx');

/** The declarations of one `@utility` block, as `property: value` pairs. */
function utilityDeclarations(name: string): Map<string, string> {
	const css = readFileSync(STYLES_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const block = new RegExp(`@utility\\s+${name}\\s*\\{([^}]*)\\}`).exec(css);
	if (block === null) {
		throw new Error(`No \`@utility ${name}\` block in styles.css.`);
	}
	const declarations = new Map<string, string>();
	for (const line of (block[1] ?? '').split(';')) {
		const colon = line.indexOf(':');
		if (colon === -1) continue;
		declarations.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
	}
	return declarations;
}

/** The colour role the `ScrollArea` thumb paints with, from its `bg-*` class. */
function thumbRole(): string {
	const source = readFileSync(SCROLL_AREA, 'utf8');
	const thumb = /data-slot="scroll-area-thumb"\s+className="([^"]*)"/.exec(source);
	const background = (thumb?.[1] ?? '').split(/\s+/).find((name) => name.startsWith('bg-'));
	if (background === undefined) {
		throw new Error('The ScrollArea thumb carries no `bg-*` class.');
	}
	return background.slice('bg-'.length);
}

describe('scrollbar-subtle', () => {
	it('draws a thin bar', () => {
		expect(utilityDeclarations('scrollbar-subtle').get('scrollbar-width')).toBe('thin');
	});

	it('paints the thumb in the ScrollArea thumb colour over a transparent track', () => {
		const role = thumbRole();
		const theme = readBlockDeclarations(STYLES_CSS, '@theme inline');
		const entry = theme.find((declaration) => declaration.name === `--color-${role}`);

		expect(entry, `--color-${role} is registered in @theme inline`).toBeDefined();
		expect(utilityDeclarations('scrollbar-subtle').get('scrollbar-color')).toBe(
			`${entry?.value} transparent`,
		);
	});
});

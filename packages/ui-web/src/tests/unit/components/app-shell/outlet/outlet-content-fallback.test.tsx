/**
 * The route-loading skeleton draws in the measure the app hands it, read off
 * `pageContainer` rather than written as a class string of its own.
 *
 * It shipped in the 1200 column every route page sat in when it was written.
 * By #1040 that column was the minority in `apps/web`: 69 of 130 routes fill
 * the stage or sit at the record measure, so on a 1920 screen the skeleton
 * reserved 1200px in the middle of a 1616px stage and the page then arrived
 * edge to edge. These cases hold the width to the register: the default is
 * still the column, so `apps/admin` is unchanged, and the record measure is
 * the same class the detail pages read, so the two cannot drift apart.
 *
 * Rendered to a string rather than into a DOM, the trade `card.test.tsx`
 * makes.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OutletContentFallback } from '../../../../../components/app-shell/outlet/outlet-content-fallback';
import { pageContainer } from '../../../../../components/page-container';

const classListsOf = (markup: string): string[][] =>
	[...markup.matchAll(/class="([^"]*)"/g)].map((match) =>
		(match[1] ?? '').split(/\s+/).filter(Boolean),
	);

const measureClass = (measure: 'page' | 'record'): string => {
	const found = pageContainer({ measure })
		.split(/\s+/)
		.find((cls) => cls.startsWith('max-w-'));
	if (found === undefined) {
		throw new Error(`pageContainer names no measure for ${measure}`);
	}
	return found;
};

const columnOf = (markup: string): string[] => {
	const column = classListsOf(markup).find((classes) =>
		classes.some((cls) => cls.startsWith('max-w-')),
	);
	if (column === undefined) {
		throw new Error(`No measured column in: ${markup}`);
	}
	return column;
};

describe('the route-loading skeleton', () => {
	it('draws in the page column by default, which is what the admin console mounts', () => {
		const column = columnOf(renderToStaticMarkup(<OutletContentFallback />));

		expect(column).toContain(measureClass('page'));
		expect(column).not.toContain(measureClass('record'));
	});

	it('draws in the record measure when the app asks for it', () => {
		const column = columnOf(renderToStaticMarkup(<OutletContentFallback measure="record" />));

		expect(column).toContain(measureClass('record'));
		expect(column).not.toContain(measureClass('page'));
	});

	it('names no width of its own beside the register', () => {
		const markup = renderToStaticMarkup(<OutletContentFallback measure="record" />);
		const maxWidths = classListsOf(markup)
			.flat()
			.filter((cls) => cls.startsWith('max-w-'));

		expect(maxWidths).toEqual([measureClass('record')]);
	});
});

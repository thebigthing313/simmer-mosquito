/**
 * The plain padded column draws in the measure the caller hands it, read off
 * `pageContainer` rather than written as a class string of its own.
 *
 * It shipped with no `measure` prop, so every page mounted in it sat in the
 * 1200 column whether or not its skeleton had reserved the 112rem record
 * measure ahead of it (#1043). These cases hold the width to the register:
 * the default is still the column, so `apps/admin` and every `apps/web` mount
 * point are unchanged until one names a measure, and the record measure is
 * the same class the detail pages read, so the two cannot drift apart. They
 * are the cases `outlet-content-fallback.test.tsx` holds the skeleton to, so
 * the layout and the skeleton that stands in for it answer the same question
 * the same way.
 *
 * Rendered to a string rather than into a DOM, the trade `card.test.tsx`
 * makes.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OutletSimpleLayout } from '../../../../../components/app-shell/outlet/simple-layout';
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

describe('the plain padded column', () => {
	it('draws in the page column by default, which is what every mount point draws today', () => {
		const column = columnOf(renderToStaticMarkup(<OutletSimpleLayout>body</OutletSimpleLayout>));

		expect(column).toContain(measureClass('page'));
		expect(column).not.toContain(measureClass('record'));
	});

	it('draws in the record measure when the caller asks for it', () => {
		const column = columnOf(
			renderToStaticMarkup(<OutletSimpleLayout measure="record">body</OutletSimpleLayout>),
		);

		expect(column).toContain(measureClass('record'));
		expect(column).not.toContain(measureClass('page'));
	});

	it('names no width of its own beside the register', () => {
		const markup = renderToStaticMarkup(
			<OutletSimpleLayout measure="record">body</OutletSimpleLayout>,
		);
		const maxWidths = classListsOf(markup)
			.flat()
			.filter((cls) => cls.startsWith('max-w-'));

		expect(maxWidths).toEqual([measureClass('record')]);
	});

	it('keeps the class a caller adds beside the measure rather than in place of it', () => {
		const column = columnOf(
			renderToStaticMarkup(
				<OutletSimpleLayout className="grid content-start gap-5">body</OutletSimpleLayout>,
			),
		);

		expect(column).toContain(measureClass('page'));
		expect(column).toContain('gap-5');
	});

	it('refuses a null measure, which cva would read as no cap at all', () => {
		// @ts-expect-error cva reads null as "skip the default", the third width the register rejects.
		const element = <OutletSimpleLayout measure={null}>body</OutletSimpleLayout>;

		expect(element).toBeDefined();
	});
});

/**
 * The changelog frame draws in the measure the caller hands it, read off
 * `pageContainer` rather than written as a class string of its own, and the
 * release entries wrap at a prose measure whatever that frame is.
 *
 * The page shipped on `pageContainer`'s default, so `apps/web` drew it in the
 * 1200 column under a skeleton that had reserved the 112rem record measure
 * (#1043). These cases hold the width to the register the way
 * `simple-layout.test.tsx` does: the default is still the column, so
 * `apps/admin` is unchanged until it names a measure, and the record measure
 * is the same class the detail pages read. The third case is the one this
 * page adds: release notes are prose, so the list under the header carries a
 * cap of its own and a bullet does not run the width of the stage.
 *
 * What a release parses to and how it reads on screen is
 * `apps/web/src/tests/unit/components/changelog-page.test.tsx`'s. Rendered to
 * a string rather than into a DOM, the trade `card.test.tsx` makes.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChangelogPage } from '../../../../components/changelog/changelog-page';
import { pageContainer } from '../../../../components/page-container';

const MARKDOWN = '# app\n\n## 1.0.0\n\n- Added: A release.\n';

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

const frameOf = (markup: string): string[] => {
	const frame = classListsOf(markup).find((classes) =>
		classes.some((cls) => cls === measureClass('page') || cls === measureClass('record')),
	);
	if (frame === undefined) {
		throw new Error(`No measured frame in: ${markup}`);
	}
	return frame;
};

const renderPage = (measure?: 'page' | 'record'): string =>
	renderToStaticMarkup(
		<ChangelogPage
			currentVersion="1.0.0"
			description="What has changed."
			markdown={MARKDOWN}
			{...(measure === undefined ? {} : { measure })}
			title="What's New"
		/>,
	);

describe('the changelog frame', () => {
	it('draws in the page column by default, which is what the admin console draws', () => {
		const frame = frameOf(renderPage());

		expect(frame).toContain(measureClass('page'));
		expect(frame).not.toContain(measureClass('record'));
	});

	it('draws in the record measure when the caller asks for it', () => {
		const frame = frameOf(renderPage('record'));

		expect(frame).toContain(measureClass('record'));
		expect(frame).not.toContain(measureClass('page'));
	});

	it('caps the release list at a prose measure in either frame', () => {
		for (const measure of ['page', 'record'] as const) {
			const markup = renderPage(measure);
			const list = [...markup.matchAll(/<ol class="([^"]*)"/g)].map((match) => match[1] ?? '');

			expect(list).toHaveLength(1);
			expect(list[0]).toMatch(/\bmax-w-\[\d+rem\]/);
			expect(list[0]).not.toContain(measureClass(measure));
		}
	});

	it('refuses a null measure, which cva would read as no cap at all', () => {
		const element = (
			<ChangelogPage
				currentVersion="1.0.0"
				description="What has changed."
				markdown={MARKDOWN}
				// @ts-expect-error cva reads null as "skip the default", the third width the register rejects.
				measure={null}
				title="What's New"
			/>
		);

		expect(element).toBeDefined();
	});
});

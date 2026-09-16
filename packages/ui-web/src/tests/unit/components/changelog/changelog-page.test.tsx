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
 * is the same class the detail pages read. The two list cases are the ones
 * this page adds: release notes are prose, so in the record frame the list
 * under the header carries a cap of its own and a bullet does not run the
 * width of the stage, while in the page column the list is the markup it was
 * before the prop arrived, which is what `apps/admin` renders.
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

const listClassOf = (markup: string): string => {
	const lists = [...markup.matchAll(/<ol class="([^"]*)"/g)].map((match) => match[1] ?? '');
	if (lists.length !== 1) {
		throw new Error(`Expected one release list in: ${markup}`);
	}
	return lists[0] ?? '';
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

	it('leaves the release list uncapped in the page column, which is the prose measure already', () => {
		const list = listClassOf(renderPage('page'));

		expect(list).toEqual(listClassOf(renderPage()));
		expect(list).not.toMatch(/\bmax-w-/);
	});

	it('caps the release list at a prose measure in the record frame, which the frame no longer is', () => {
		const list = listClassOf(renderPage('record'));

		expect(list).toMatch(/\bmax-w-\[\d+rem\]/);
		expect(list).not.toContain(measureClass('record'));
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

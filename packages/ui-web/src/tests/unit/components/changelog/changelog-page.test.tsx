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
 * this page adds: release notes are prose, so in the record frame the entries
 * carry a cap of their own and a bullet does not run the width of the stage,
 * while in the page column the list is the markup it was before the prop
 * arrived, which is what `apps/admin` renders.
 *
 * The rail cases are #1065's. In the record frame each release is a row from
 * `md:` up, a fixed 12rem rail holding the version, the date and the badge
 * beside the capped entries, with the list gap as the only separator; below
 * `md:` it stacks as it did. The page column is held to the markup it had
 * before the rail, pasted whole, because "unchanged" is a claim a class
 * assertion cannot make and a byte comparison can.
 *
 * The date cases are #1066's. `formatReleaseDate` used to hand
 * `Intl.DateTimeFormat` no locale, so the release date read in whatever the
 * runtime had, and the wording `apps/web`'s suite asserts held on an `en-US`
 * machine and nowhere else. CLAUDE.md's rule that a display formatter pins
 * `en-US` is scoped to `apps/web/src`, which is why #683's sweep did not reach
 * this file. The second case is the one that fails without the pin: it makes
 * the runtime's default locale `de-DE` and asserts the wording is still the
 * `en-US` one, because a case asserting the wording alone passes on the
 * machine that wrote it whatever the formatter does.
 *
 * What a release parses to and how it reads on screen is
 * `apps/web/src/tests/unit/components/changelog-page.test.tsx`'s. Rendered to
 * a string rather than into a DOM, the trade `card.test.tsx` makes.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

const renderPage = (measure?: 'page' | 'record', markdown = MARKDOWN): string =>
	renderToStaticMarkup(
		<ChangelogPage
			currentVersion="1.0.0"
			description="What has changed."
			markdown={markdown}
			{...(measure === undefined ? {} : { measure })}
			title="What's New"
		/>,
	);

/**
 * Two releases, the newer one current and dated, the older one undated, so
 * the frozen markup below holds every branch a release row can take.
 */
const TWO_RELEASES =
	'# app\n\n## 1.0.0 — 2026-09-10\n\n- Added: A second release.\n- Fixed: A bug.\n\n## 0.9.0\n\n- Added: A release.\n';

/**
 * What `apps/admin` rendered at `page` before the record frame grew its rail
 * (#1065), captured off the tree and pasted rather than derived: the page
 * column keeps this markup byte for byte, and a rail that leaked into it
 * would fail here on the branch that wrote it.
 */
const PAGE_MARKUP_BEFORE_RAIL =
	'<div class="mx-auto w-full max-w-[1200px] grid content-start gap-6 px-4 py-6 pb-10 md:px-8"><header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3"><div class="flex min-w-0 items-start gap-3"><span class="inline-flex shrink-0 items-center mt-0.5 size-9 justify-center rounded-md bg-primary/10 text-primary"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history size-5" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l4 2"></path></svg></span><div class="grid min-w-0 gap-1.5"><h1 class="m-0 text-pretty font-semibold text-foreground text-heading leading-heading">What&#x27;s New</h1><div class="max-w-[68ch] text-pretty text-muted-foreground text-sm leading-snug"><p class="m-0">What has changed.</p></div></div></div></header><ol class="grid gap-8"><li class="grid gap-4"><div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2"><h2 class="font-semibold text-foreground text-lg leading-none">1.0.0</h2><span class="text-muted-foreground text-sm">September 10, 2026</span><span data-slot="badge" data-variant="secondary" class="inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;&gt;svg]:pointer-events-none [&amp;&gt;svg]:size-3 bg-secondary text-secondary-foreground [a&amp;]:hover:bg-secondary/90 ml-auto">You&#x27;re on this version</span></div><section class="grid gap-2"><h3 class="font-medium text-muted-foreground text-xs uppercase tracking-wide">Added</h3><ul class="grid list-disc gap-1.5 pl-5 text-foreground text-sm leading-relaxed marker:text-muted-foreground"><li>A second release.</li></ul></section><section class="grid gap-2"><h3 class="font-medium text-muted-foreground text-xs uppercase tracking-wide">Fixed</h3><ul class="grid list-disc gap-1.5 pl-5 text-foreground text-sm leading-relaxed marker:text-muted-foreground"><li>A bug.</li></ul></section></li><li class="grid gap-4"><div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2"><h2 class="font-semibold text-foreground text-lg leading-none">0.9.0</h2></div><section class="grid gap-2"><h3 class="font-medium text-muted-foreground text-xs uppercase tracking-wide">Added</h3><ul class="grid list-disc gap-1.5 pl-5 text-foreground text-sm leading-relaxed marker:text-muted-foreground"><li>A release.</li></ul></section></li></ol></div>';

/**
 * The class list of each release row. A bullet's `<li>` carries no class, so
 * the class-bearing ones are the rows and nothing else.
 */
const releaseRowsOf = (markup: string): string[] =>
	[...markup.matchAll(/<li class="([^"]*)">/g)].map((match) => match[1] ?? '');

/**
 * The first release's rail cell: the element opening its row, holding the
 * version heading, read up to its close. It nests no `div`, so the first
 * `</div>` after it is its own.
 */
const railCellOf = (markup: string): { readonly classes: string; readonly inner: string } => {
	const match = markup.match(/<li class="[^"]*"><div class="([^"]*)">(.*?)<\/div>/);
	if (match === null) {
		throw new Error(`No rail cell in: ${markup}`);
	}
	return { classes: match[1] ?? '', inner: match[2] ?? '' };
};

/** The class list of the element that follows the first release's rail cell. */
const entriesCellOf = (markup: string): string => {
	const match = markup.match(
		/<li class="[^"]*"><div class="[^"]*">.*?<\/div><(\w+) class="([^"]*)">/,
	);
	if (match === null) {
		throw new Error(`Nothing follows the rail cell in: ${markup}`);
	}
	return `${match[1]}.${match[2]}`;
};

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

	it('caps the release entries at a prose measure in the record frame, which the frame no longer is', () => {
		const markup = renderPage('record');

		expect(entriesCellOf(markup)).toMatch(/^div\.(?=.*\bmax-w-\[\d+rem\])(?!.*\bmax-w-\[\d+px\])/);
		expect(listClassOf(markup)).not.toMatch(/\bmax-w-/);
	});
});

const DATED_RELEASE = '# app\n\n## 1.0.0 — 2026-08-13\n\n- Added: A release.\n';

/** The text of the span that follows the first release's version heading. */
const releaseDateOf = (markup: string): string => {
	const match = markup.match(/<\/h2><span[^>]*>([^<]*)<\/span>/);
	const date = match?.[1];
	if (date === undefined) {
		throw new Error(`No release date in: ${markup}`);
	}
	return date;
};

/**
 * Makes `de-DE` the locale a caller gets for passing none, which is what a
 * German machine's runtime does. A caller that names `en-US` is unaffected,
 * and `resolvedOptions` on a real formatter is how the stub is proved live.
 */
const runUnderGermanDefaultLocale = (run: () => string): string => {
	const RealDateTimeFormat = Intl.DateTimeFormat;
	const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function stubbed(
		locale,
		options,
	) {
		return new RealDateTimeFormat(locale ?? 'de-DE', options);
	} as typeof Intl.DateTimeFormat);
	try {
		return run();
	} finally {
		spy.mockRestore();
	}
};

describe('the release date', () => {
	it('reads the calendar date in en-US wording, which is what the formatters in apps/web draw', () => {
		expect(releaseDateOf(renderPage('page', DATED_RELEASE))).toBe('August 13, 2026');
	});

	it('reads the same on a machine whose locale is not en-US', () => {
		const wording = runUnderGermanDefaultLocale(() => {
			expect(new Intl.DateTimeFormat().resolvedOptions().locale).toBe('de-DE');
			return releaseDateOf(renderPage('page', DATED_RELEASE));
		});

		expect(wording).toBe('August 13, 2026');
	});
});

describe('the release rail', () => {
	it('renders the page column exactly as it did before the rail, which is what the admin console draws', () => {
		expect(renderPage('page', TWO_RELEASES)).toBe(PAGE_MARKUP_BEFORE_RAIL);
		expect(renderPage(undefined, TWO_RELEASES)).toBe(PAGE_MARKUP_BEFORE_RAIL);
	});

	it('draws each release as a two-column row from md up in the record frame, with a fixed 12rem rail', () => {
		const rows = releaseRowsOf(renderPage('record', TWO_RELEASES));

		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row).toMatch(/\bmd:grid-cols-\[12rem_/);
		}
	});

	it('separates releases with the list gap alone, with no rule under the version', () => {
		const markup = renderPage('record', TWO_RELEASES);

		expect(markup).not.toMatch(/\bborder-b\b/);
	});

	it('keeps the rail cell in view while a long release scrolls, from md up', () => {
		const { classes } = railCellOf(renderPage('record', TWO_RELEASES));

		expect(classes).toMatch(/\bmd:sticky\b/);
		expect(classes).toMatch(/\bmd:self-start\b/);
		expect(classes).toMatch(/\bmd:top-\S+/);
	});

	it('puts the current-release badge in the rail cell, under the date', () => {
		const { inner } = railCellOf(renderPage('record', TWO_RELEASES));

		expect(inner).toMatch(
			/<h2 [^>]*>1\.0\.0<\/h2><span [^>]*>September 10, 2026<\/span><span data-slot="badge"/,
		);
		expect(inner).toContain('You&#x27;re on this version');
	});

	it('stacks the release below md, which is the shape it had before the rail', () => {
		const rows = releaseRowsOf(renderPage('record', TWO_RELEASES));
		const { classes } = railCellOf(renderPage('record', TWO_RELEASES));

		for (const row of rows) {
			expect(row).not.toMatch(/(^|\s)grid-cols-/);
		}
		expect(classes).toMatch(/(^|\s)flex-wrap\b/);
		expect(classes).not.toMatch(/(^|\s)sticky\b/);
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

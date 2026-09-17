/**
 * A record form with no `aside` scrolls in the shell's `main`, and a split form
 * keeps the scroller it had.
 *
 * `main` reserves its scrollbar gutter, so a page that also scrolls itself
 * arrives one scrollbar narrower than the skeleton it replaces, and a page that
 * does not fits the skeleton's frame (#1053). The column branch used to wrap
 * the fields in `overflow-y-auto` under an `h-full` form, which is the shape
 * the issue swept. These cases hold that branch to a plain block and the split
 * branch to the markup `SplitPage` scrolls today, so neither drifts into the
 * other's shape; #1058 built on the column branch and did not put the inner
 * scroller back.
 *
 * A column form also draws in the measured frame `pageContainer` defines, at
 * the measure the caller names, so it lands where the route-loading skeleton
 * stood (#1058). A split form does not: `SplitPage` is a full-bleed two-column
 * stage and its column is deliberately not the skeleton's shape, so that
 * branch is held to the markup it rendered before the frame arrived, byte for
 * byte, rather than to a rule about which classes it carries.
 *
 * `Link` needs a router in context, so a root-only router sits in a
 * `RouterContextProvider`, which provides the context without mounting a
 * route. Rendered to a string rather than into a DOM, the trade
 * `card.test.tsx` makes.
 */

import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecordFormPage } from '../../../../../components/form/form-components/record-form-page';
import {
	type PageContainerVariants,
	pageContainer,
} from '../../../../../components/page-container';

const router = createRouter({
	routeTree: createRootRoute(),
	history: createMemoryHistory({ initialEntries: ['/'] }),
});

const HEADER = {
	title: 'Edit Contact',
	description: 'The record.',
	backTo: '/',
	backLabel: 'Back',
} as const;

const render = (
	aside?: ReactNode,
	measure?: NonNullable<PageContainerVariants['measure']>,
): string =>
	renderToStaticMarkup(
		<RouterContextProvider router={router}>
			<RecordFormPage
				actions={<button type="submit">Save</button>}
				aside={aside}
				header={HEADER}
				onSubmit={() => {}}
				{...(measure === undefined ? {} : { measure })}
			>
				<p>fields</p>
			</RecordFormPage>
		</RouterContextProvider>,
	);

const classListsOf = (markup: string): string[][] =>
	[...markup.matchAll(/class="([^"]*)"/g)].map((match) =>
		(match[1] ?? '').split(/\s+/).filter(Boolean),
	);

const scrollers = (markup: string): number =>
	classListsOf(markup).filter((classes) => classes.includes('overflow-y-auto')).length;

/**
 * The frame's classes, read off the variant rather than spelled here, so a
 * change to the measure moves the test with it. Padding is not part of the
 * question: the header, the fields and the footer each pad differently, and
 * the frame is the measure.
 */
const frameClasses = (measure: NonNullable<PageContainerVariants['measure']>): string[] =>
	pageContainer({ flow: 'block', gap: 'none', measure, padding: 'none' }).split(/\s+/);

const carriesFrame = (markup: string, measure: NonNullable<PageContainerVariants['measure']>) =>
	classListsOf(markup).some((classes) =>
		frameClasses(measure).every((token) => classes.includes(token)),
	);

/**
 * The split branch as it rendered before #1058, captured off `develop` at
 * 19cd6067. The frame must leave it alone, so this is an equality and not a
 * class rule; a deliberate change to the split shape rewrites this string.
 */
const SPLIT_MARKUP =
	'<div class="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden"><div class="min-h-0 min-w-0 overflow-y-auto"><form class="flex flex-col h-full min-h-0"><header class="sticky top-0 z-10 border-border/50 border-b bg-background grid gap-2 px-5 py-4"><a class="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground active" href="/" data-status="active" aria-current="page"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>Back</a><div class="grid gap-1"><h1 class="m-0 font-semibold text-foreground text-xl leading-tight">Edit Contact</h1><p class="m-0 text-muted-foreground text-sm">The record.</p></div></header><div class="min-h-0 flex-1 overflow-y-auto px-5 py-5"><div class="grid gap-6"><p>fields</p></div></div><footer class="sticky bottom-0 z-10 border-border/50 border-t bg-background flex flex-wrap items-center justify-end gap-2 px-5 py-4"><button type="submit">Save</button></footer></form></div><div class="relative min-h-0 min-w-0 border-border/40 border-l"><div>map</div></div></div>';

describe('RecordFormPage', () => {
	it('scrolls a column form in the shell rather than in a scroller of its own', () => {
		const markup = render();

		expect(scrollers(markup)).toBe(0);
		expect(classListsOf(markup).some((classes) => classes.includes('h-full'))).toBe(false);
	});

	it('keeps a column form at least the stage tall, so a short form still pins its actions at the foot', () => {
		const [form] = classListsOf(render()).filter((classes) => classes.includes('flex-col'));

		expect(form).toContain('min-h-full');
	});

	it('leaves a split form on the scroller it had', () => {
		const markup = render(<div>map</div>);

		expect(scrollers(markup)).toBe(2);
		expect(markup).toContain('grid-cols-[2fr_3fr]');
	});

	it('draws a column form in the frame at the measure the caller names', () => {
		expect(carriesFrame(render(undefined, 'record'), 'record')).toBe(true);
		expect(carriesFrame(render(undefined, 'record'), 'page')).toBe(false);
	});

	it('defaults a column form to the page measure, where the admin console draws', () => {
		expect(carriesFrame(render(), 'page')).toBe(true);
	});

	it('renders a split form byte for byte as it did before the frame arrived', () => {
		const markup = render(<div>map</div>, 'record');

		expect(markup).toBe(SPLIT_MARKUP);
		expect(carriesFrame(markup, 'record')).toBe(false);
		expect(carriesFrame(markup, 'page')).toBe(false);
	});
});

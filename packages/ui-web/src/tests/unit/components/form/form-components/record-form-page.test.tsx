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
 * other's shape; #1058 builds on the column branch and must not put the inner
 * scroller back.
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

const render = (aside?: ReactNode): string =>
	renderToStaticMarkup(
		<RouterContextProvider router={router}>
			<RecordFormPage
				actions={<button type="submit">Save</button>}
				aside={aside}
				header={HEADER}
				onSubmit={() => {}}
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
});

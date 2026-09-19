/** @vitest-environment jsdom */

import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DetailPageShell,
	EditFormSkeleton,
	type RecordDetailLayout,
	RecordDetailPage,
	type RecordReading,
} from '../../../../components/record';
import type { AskAcknowledged } from '../../../../hooks/use-acknowledged-write';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

afterEach(cleanup);

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: {
		main: ['h-[360px]', 'h-64'],
		aside: ['h-72'],
	},
};

interface Region {
	readonly id: string;
	readonly name: string;
}

const header = {
	icon: iconRegistry.entities.region.icon,
	recordType: 'region',
	title: 'North',
} as const;

function page(reading: RecordReading<Region>) {
	return (
		<RecordDetailPage layout={layout} reading={reading} recordType="region">
			{(region) => <p>{region.name}</p>}
		</RecordDetailPage>
	);
}

/**
 * The fork fourteen pages each wrote by hand, and which was asserted nowhere.
 *
 * Its order is the whole of it: a record that has not synced yet is not a
 * record that is missing, and a read that failed is neither.
 */
describe('RecordDetailPage', () => {
	it('stands in for the record while the collection is still answering', () => {
		const { container } = render(page({ isReady: false, record: undefined }));

		// The placeholder, not the content and not either unavailable message.
		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
		expect(screen.queryByText(/could not be/)).toBeNull();
	});

	// The distinction that had gone missing: a record that is not there tells the
	// reader to stop looking, which is the wrong answer for a read that failed.
	it('says a record is missing only once the collection has answered', () => {
		render(page({ isReady: true, record: undefined }));

		expect(
			screen.getByText('This region could not be found, or you do not have access to it.'),
		).toBeTruthy();
	});

	it('says a failed read failed, whatever the collection holds', () => {
		render(page({ isError: true, isReady: true, record: { id: 'r1', name: 'North District' } }));

		expect(screen.getByText('This region could not be loaded. Try again shortly.')).toBeTruthy();
		expect(screen.queryByText('North District')).toBeNull();
	});

	// `isError` outranks readiness too. A page that reports both was reporting a
	// failure that had not resolved into a record either way.
	it('prefers the failure to the placeholder', () => {
		render(page({ isError: true, isReady: false, record: undefined }));

		expect(screen.getByText('This region could not be loaded. Try again shortly.')).toBeTruthy();
	});

	it('renders the record once there is one', () => {
		render(page({ isReady: true, record: { id: 'r1', name: 'North District' } }));

		expect(screen.getByText('North District')).toBeTruthy();
		expect(screen.queryByText(/could not be/)).toBeNull();
	});

	// A record the page already holds outranks readiness. An on-demand collection
	// can report itself unready again while it re-subscribes, and covering a
	// record that is on screen with a placeholder is a flash for nothing.
	it('keeps a record it holds while the collection is still answering', () => {
		const { container } = render(
			page({ isReady: false, record: { id: 'r1', name: 'North District' } }),
		);

		expect(screen.getByText('North District')).toBeTruthy();
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
	});

	/*
	 * The placement the delete needs. A delete is optimistic, so the record leaves
	 * its collection the moment the button is pressed and the danger zone unmounts
	 * before a refusal lands. The hook has to sit in whatever survives that, which
	 * is the frame, which is what renders the unavailable state in the content's
	 * place.
	 */
	it('holds the runner a questioned delete answers through', async () => {
		let runner: AskAcknowledged | undefined;
		render(
			<RecordDetailPage
				deleteRefusals={{ region_in_use: 'acknowledgeUnlink' }}
				layout={layout}
				recordType="region"
				reading={{ isReady: true, record: { id: 'r1', name: 'North District' } }}
			>
				{(region, askDelete) => {
					runner = askDelete;
					return <p>{region.name}</p>;
				}}
			</RecordDetailPage>,
		);

		// Every declared flag goes out as `false` on the first attempt, which is the
		// only thing that makes the server's guard fire at all.
		const flags: Record<string, boolean>[] = [];
		await runner?.(async (acknowledgements) => {
			flags.push({ ...acknowledgements });
		});

		expect(flags).toEqual([{ acknowledgeUnlink: false }]);
	});

	// A page whose delete has no acknowledgeable refusal still gets a runner, and
	// it must ask nothing: the hook's default map is the mission stop's, and
	// inheriting it would offer an answer to a question this record cannot raise.
	it('asks nothing where the page declared no refusals', async () => {
		let runner: AskAcknowledged | undefined;
		render(
			<RecordDetailPage
				layout={layout}
				recordType="region"
				reading={{ isReady: true, record: { id: 'r1', name: 'North District' } }}
			>
				{(region, askDelete) => {
					runner = askDelete;
					return <p>{region.name}</p>;
				}}
			</RecordDetailPage>,
		);

		const flags: Record<string, boolean>[] = [];
		await runner?.(async (acknowledgements) => {
			flags.push({ ...acknowledgements });
		});

		expect(flags).toEqual([{}]);
	});

	/*
	 * The bar is pinned, so the content below it starts at whatever height it
	 * takes. If the placeholder drew a different bar from the record's, the whole
	 * page would shift down or up the moment the record landed.
	 */
	it('stands the header bar in the same shape before the record arrives', () => {
		const { container: loading } = render(page({ isReady: false, record: undefined }));
		const { container: ready } = render(
			<DetailPageShell header={header} layout={layout}>
				<p>cards</p>
			</DetailPageShell>,
		);

		const bar = (root: HTMLElement) => root.querySelector('header')?.className;
		expect(bar(loading)).toBeDefined();
		expect(bar(loading)).toBe(bar(ready));
	});

	// The escape hatch, and the discipline it comes with: a page whose readiness
	// is a Suspense boundary hands over its body, and still draws the frame's
	// placeholder as the fallback rather than one of its own.
	it('lets a page supply its own body', () => {
		render(
			<RecordDetailPage body={() => <p>the habitat</p>} layout={layout} recordType="habitat" />,
		);

		expect(screen.getByText('the habitat')).toBeTruthy();
	});
});

/**
 * The skeleton and the columns read one layout, which is what keeps the
 * placeholder standing in the shape the record actually arrives in.
 */
describe('RecordDetailSkeleton and DetailPageShell', () => {
	function asideTrack(container: HTMLElement): string | undefined {
		return Array.from(container.querySelectorAll('div'))
			.map((node) => node.className)
			.find((name) => name.includes('grid-cols-[minmax'));
	}

	it('reserves the same split the record arrives in', () => {
		const { container: loading } = render(page({ isReady: false, record: undefined }));
		const { container: ready } = render(
			<DetailPageShell aside={<p>notes</p>} header={header} layout={layout}>
				<p>cards</p>
			</DetailPageShell>,
		);

		expect(asideTrack(loading)).toBe(asideTrack(ready));
	});

	it('drops the side column on a page whose layout has none', () => {
		const { container } = render(
			<DetailPageShell header={header} layout={{ skeleton: { main: ['h-40'] } }}>
				<p>cards</p>
			</DetailPageShell>,
		);

		expect(asideTrack(container)).toBeUndefined();
		expect(screen.getByText('cards')).toBeTruthy();
	});
});

describe('EditFormSkeleton', () => {
	it('stands in for as many fields as the form has', () => {
		const { container } = render(<EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />);

		// The title, three single bars, and the pair's own row.
		expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
	});

	it('drops the map half for a form with no geography', () => {
		const { container } = render(<EditFormSkeleton frame="pane" rows={['h-9']} />);

		expect(container.querySelector('.grid-cols-\\[2fr_3fr\\]')).toBeNull();
	});
});

/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordRegions } from '../../../../hooks/use-record-regions';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

const { RecordRegionsBand } = await import('../../../../components/map/record-regions-band');

/**
 * What the band says, per answer.
 *
 * Four of its five states are decisions rather than markup, and each one is
 * something the spec argued for: an empty answer is a sentence and not a gap, a
 * `found: false` is nothing at all rather than an apology under a rendered
 * record, only folders with a hit appear, and a long folder row collapses rather
 * than wrapping down the page.
 */
describe('RecordRegionsBand', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('names the record when it is inside no region', async () => {
		const { findByText } = renderBand({ found: true, groups: [] }, 'habitat');

		expect(await findByText('This habitat is inside none of your regions.')).toBeDefined();
	});

	it('takes the noun it was given', async () => {
		const { findByText } = renderBand({ found: true, groups: [] }, 'weather station');

		expect(await findByText('This weather station is inside none of your regions.')).toBeDefined();
	});

	it('renders nothing at all when the record is not found', async () => {
		// Not an error and not an empty state. If the record is gone the page
		// around this is already showing something it should not, and a band
		// saying so underneath contradicts the page it sits in.
		// The shell with its heading is on screen while the read is in flight, so
		// this waits for the answer before asserting that nothing survived it.
		const { container } = renderBand({ found: false, groups: [] }, 'habitat');

		await waitFor(() => {
			expect(container.textContent).toBe('');
		});
	});

	it('groups regions by folder and labels the unfiled group', async () => {
		const { findByText } = renderBand(
			{
				found: true,
				groups: [
					{ folderId: 'f1', folderName: 'Districts', regions: [{ id: 'r1', name: 'North' }] },
					{ folderId: null, folderName: null, regions: [{ id: 'r2', name: 'Pilot area' }] },
				],
			},
			'habitat',
		);

		expect(await findByText('Districts')).toBeDefined();
		expect(screen.getByText('No folder')).toBeDefined();
		expect(screen.getByText('North')).toBeDefined();
		expect(screen.getByText('Pilot area')).toBeDefined();
	});

	it('collapses a folder past six chips and expands on request', async () => {
		// The region detail page is where this fires: measured on production, one
		// municipality overlaps 38 sections.
		const { findByText } = renderBand(
			{
				found: true,
				groups: [
					{
						folderId: 'f1',
						folderName: 'Sections',
						regions: Array.from({ length: 9 }, (_, index) => ({
							id: `r${index}`,
							name: `Section ${index}`,
						})),
					},
				],
			},
			'region',
		);

		fireEvent.click(await findByText('and 3 more'));
		expect(screen.getByText('Section 8')).toBeDefined();

		fireEvent.click(screen.getByText('Show fewer'));
		expect(screen.queryByText('Section 8')).toBeNull();
	});

	it('says so rather than going quiet when the read fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
		);
		const { findByText } = renderBand(null, 'habitat');

		expect(await findByText('Regions could not be read.')).toBeDefined();
	});
});

/** Render the band over one canned answer. `null` leaves the stubbed fetch alone. */
function renderBand(
	answer: Pick<RecordRegions, 'found' | 'groups'> | null,
	noun: string,
): ReturnType<typeof render> {
	if (answer !== null) {
		vi.stubGlobal(
			'fetch',
			vi.fn(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({ recordType: 'habitats', recordId: 'record-1', ...answer }),
						{ headers: { 'content-type': 'application/json' } },
					),
				),
			),
		);
	}

	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<RecordRegionsBand noun={noun} recordId="record-1" recordType="habitats" />
		</QueryClientProvider>,
	);
}

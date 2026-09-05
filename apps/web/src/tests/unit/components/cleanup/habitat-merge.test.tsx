/** @vitest-environment jsdom */
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NearbyHabitats } from '../../../../hooks/use-merge-candidates';
import type { MinimumRole } from '../../../../lib/write-access';

/**
 * The habitat merge page, which asks the question the other way round.
 *
 * A cleanup page proposes pairs and makes the user pick which one survives. This
 * starts from a habitat somebody was already looking at, so the survivor is
 * decided by how they got here and the only thing left to choose is what folds
 * into it. That is the whole reason habitats are not on a cleanup page, and it
 * is worth pinning: if the target ever came from the list instead, every merge
 * would still be a valid request for the wrong merge.
 *
 * The radius is the other half. It is in the agency's own units, so an agency
 * that works in feet must not be shown metres, and the number that goes over the
 * wire must be metres whatever the buttons say.
 */

const RANK: Record<string, number | undefined> = {
	viewer: 0,
	collector: 1,
	manager: 2,
	admin: 3,
	owner: 4,
};
let signedInRole = 'manager';

vi.mock('../../../../hooks/use-can-write', () => ({
	useHasRole: (minimum: MinimumRole) => (RANK[signedInRole] ?? 0) >= (RANK[minimum] ?? 0),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

let distanceUnit = 'meter';
vi.mock('../../../../hooks/queries/use-organization-settings', () => ({
	useOrganizationSettings: () => ({ unitDefaults: { distance: distanceUnit } }),
}));

// The explorer panel measures the map stage and its own box, and jsdom has no
// observer to report one with. Every observed element reports the same size,
// which is all these assertions need: none of them turns on the layout.
vi.stubGlobal(
	'ResizeObserver',
	class {
		private readonly callback: (entries: readonly { contentRect: DOMRectReadOnly }[]) => void;
		constructor(callback: (entries: readonly { contentRect: DOMRectReadOnly }[]) => void) {
			this.callback = callback;
		}
		observe() {
			this.callback([{ contentRect: { width: 1000, height: 700 } as DOMRectReadOnly }]);
		}
		unobserve() {}
		disconnect() {}
	},
);

const merges = vi.fn();
vi.mock('../../../../hooks/mutations/use-record-merge', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../hooks/mutations/use-record-merge')>()),
	useRecordMerge: () => merges,
}));

const requestedRadii: number[] = [];
// Assigned in `beforeEach`, because the fixtures it is built from are declared
// below the mock and a module-level call would read them before they exist.
let nearby: NearbyHabitats;
vi.mock('../../../../hooks/use-merge-candidates', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../hooks/use-merge-candidates')>();
	return {
		...actual,
		useNearbyHabitats: (_habitatId: string, radiusMetres: number) => {
			requestedRadii.push(radiusMetres);
			return { data: nearby, error: null, isError: false, isPending: false, refetch: vi.fn() };
		},
	};
});

const { HabitatMerge } = await import('../../../../components/cleanup/habitat-merge');

const KEPT = '11111111-1111-4111-8111-111111111111';
const NEAR = '22222222-2222-4222-8222-222222222222';
const FAR = '33333333-3333-4333-8333-333333333333';

function target() {
	return {
		id: KEPT,
		label: 'Catch basin 41',
		detail: 'Roadside ditch',
		createdAt: '2024-03-01T00:00:00.000Z',
		lat: 35.5,
		lng: -90.5,
		fields: { habitat_name: 'Catch basin 41', description: 'Roadside ditch' },
	};
}

function candidate(id: string, label: string, distanceMetres: number, isActive = true) {
	return {
		id,
		label,
		detail: null,
		createdAt: '2025-06-11T00:00:00.000Z',
		lat: 35.5,
		lng: -90.5,
		fields: { habitat_name: label, description: 'Roadside ditch' },
		distanceMetres,
		isActive,
	};
}

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			{/* The shell provides one at the root; the explorer frame's collapse
			    control opens a tooltip and Radix refuses without it. */}
			<TooltipProvider>
				<HabitatMerge habitatId={KEPT} />
			</TooltipProvider>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	distanceUnit = 'meter';
	requestedRadii.length = 0;
	nearby = {
		target: target(),
		candidates: [candidate(NEAR, 'CB-41', 42), candidate(FAR, 'Basin behind 41', 180)],
	};
	signedInRole = 'manager';
	merges.mockReset();
	merges.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('HabitatMerge', () => {
	it('keeps the habitat the page was opened from, whatever is selected', async () => {
		// The survivor is decided by how the user got here. Reading it off the list
		// instead would retire the habitat they were looking at and keep a
		// duplicate, and nothing on the server can tell the two apart.
		renderPage();

		fireEvent.click(screen.getByRole('checkbox', { name: /CB-41/ }));
		fireEvent.click(screen.getByRole('button', { name: 'Merge 1 into Catch basin 41' }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('checkbox'));
		fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

		await vi.waitFor(() => expect(merges).toHaveBeenCalledTimes(1));
		expect(merges.mock.calls[0]?.[0]).toMatchObject({ targetId: KEPT, sourceIds: [NEAR] });
	});

	it('folds in only the habitats that were ticked', () => {
		renderPage();

		fireEvent.click(screen.getByRole('checkbox', { name: /Basin behind 41/ }));

		expect(screen.getByRole('button', { name: 'Merge 1 into Catch basin 41' })).toBeTruthy();
	});

	it('offers no merge until something is selected', () => {
		renderPage();

		expect(screen.queryByRole('button', { name: /^Merge \d/ })).toBeNull();
	});

	it('searches in metres and labels in the organization unit', () => {
		// The buttons say what the agency says. What goes over the wire is metres,
		// because the radius reaches `st_dwithin` over geography.
		distanceUnit = 'foot';
		renderPage();

		expect(screen.getByRole('radio', { name: '250 ft' })).toBeTruthy();
		expect(requestedRadii[0]).toBeCloseTo(76.2, 1);
	});

	it('starts at 100 m for an organization that works in metres', () => {
		renderPage();

		expect(screen.getByRole('radio', { name: '100 m' })).toBeTruthy();
		expect(requestedRadii[0]).toBe(100);
	});

	it('widens the search when a bigger radius is pressed', () => {
		renderPage();

		fireEvent.click(screen.getByRole('radio', { name: '500 m' }));

		expect(requestedRadii.at(-1)).toBe(500);
	});

	it('says how far away each habitat is, in the organization unit', () => {
		distanceUnit = 'foot';
		renderPage();

		// 42 m is 137.8 ft, rounded to the nearest ten because both points are
		// somebody standing near a thing with a phone.
		expect(screen.getByText(/140 ft away/)).toBeTruthy();
	});

	it('offers a retired habitat and marks it as one', () => {
		// A merge may fold in an inactive habitat, so hiding it would put the only
		// way to do that out of reach.
		nearby = { target: target(), candidates: [candidate(NEAR, 'CB-41', 42, false)] };
		renderPage();

		expect(screen.getByText('Retired')).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: /CB-41/ })).toBeTruthy();
	});

	it('shows what the surviving habitat says, to read the candidates against', () => {
		// Every candidate row carries its own description. Without this there is
		// nothing on the page to compare them to, which is the question the page
		// exists to answer.
		renderPage();

		expect(screen.getByText('Keeping')).toBeTruthy();
		expect(screen.getByText('Roadside ditch')).toBeTruthy();
	});

	it('keeps showing it when the search finds nothing', () => {
		// The empty state tells the reader to widen. What they are widening around
		// is still the thing they need to see.
		nearby = { target: target(), candidates: [] };
		renderPage();

		expect(screen.getByText('No other habitats nearby')).toBeTruthy();
		expect(screen.getByText('Roadside ditch')).toBeTruthy();
	});

	it('says so when the surviving habitat has no description', () => {
		nearby = {
			target: { ...target(), fields: { habitat_name: 'Catch basin 41', description: null } },
			candidates: [],
		};
		renderPage();

		expect(screen.getByText('No description recorded.')).toBeTruthy();
	});

	it('says nothing was found rather than showing an empty list', () => {
		nearby = { target: target(), candidates: [] };
		renderPage();

		expect(screen.getByText('No other habitats nearby')).toBeTruthy();
		expect(screen.getByText(/Widen the search/)).toBeTruthy();
	});

	it('hides the merge from a role that cannot write one', () => {
		signedInRole = 'collector';
		renderPage();

		fireEvent.click(screen.getByRole('checkbox', { name: /CB-41/ }));

		expect(screen.queryByRole('button', { name: /^Merge \d/ })).toBeNull();
	});
});

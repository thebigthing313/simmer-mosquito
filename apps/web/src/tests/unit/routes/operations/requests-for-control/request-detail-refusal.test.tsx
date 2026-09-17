/** @vitest-environment jsdom */

/**
 * What the request for control page does with a refused lifecycle write.
 *
 * Mark Resolved and Reopen Request sit in the header's `...`, and the server
 * refuses either on its preconditions. The page used to hold that refusal in a
 * destructive `Alert` under the header, which put it alone among the record
 * pages: the delete dialog and the service request header both report one as
 * a toast, because the menu item that asked has unmounted by the time the
 * answer arrives (#1100). So this asserts the two halves of the rule
 * `DetailPageHeader`'s docblock carries: the toast is raised with the server's
 * sentence, and no `Alert` is drawn for it.
 *
 * What is faked is what `service-request-detail.test.tsx` fakes and for the
 * same reasons: the route module's `Route` hands back the params a match
 * would, the role comes from a variable, and the mutation hook is a recorder
 * whose refusal the case chooses. The record comes from a stand-in for the
 * query hook rather than a seeded collection, since what the page does with a
 * request it already holds is the question and how it reads one is not. The
 * two map cards and the comments column are stand-ins because none of the
 * three is in the question and Mapbox GL has no jsdom.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestRecord } from '../../../../../hooks/queries/use-requested-control-action';
import { organizations } from '../../../../../lib/collections/organizations';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent } from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	params: { id: 'request-1' } as Record<string, string>,
	role: 'manager' as SimmerRole,
	/** The request the page is handed. */
	request: null as RequestRecord | null,
	/** What the server answers the next lifecycle write with; `null` is a success. */
	refusal: null as Error | string | null,
	/** Every lifecycle write the page asked for, in order. */
	writes: [] as ('resolve' | 'reopen')[],
	toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
	toast: { error: (message: string) => harness.toastError(message) },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(
		await importOriginal<object>(),
		() => ({}),
		() => harness.params,
	);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn([], () => ({
			recordType: 'requestedControlAction',
			recordId: harness.params.id,
			found: true,
			blockers: [],
			cascades: [],
			detaches: [],
		})),
	};
});

vi.mock('../../../../../hooks/use-auth-snapshot', async () => {
	const { signedInSnapshotAs } = await import('../../route-mock-stand-ins');
	return { useAuthSnapshot: () => signedInSnapshotAs(harness.role) };
});

vi.mock('../../../../../hooks/queries/use-requested-control-action', () => ({
	useRequestedControlAction: () => ({
		request: harness.request ?? undefined,
		isReady: true,
		isError: false,
	}),
}));

vi.mock('../../../../../hooks/mutations/use-requested-control-action-mutations', () => {
	const write = (kind: 'resolve' | 'reopen') => async () => {
		harness.writes.push(kind);
		if (harness.refusal !== null) {
			throw harness.refusal;
		}
	};
	return {
		useRequestedControlActionMutations: () => ({
			resolve: write('resolve'),
			reopen: write('reopen'),
			remove: async () => {},
			canWrite: true,
		}),
	};
});

vi.mock('../../../../../hooks/queries/use-missions-for-request', () => ({
	useMissionsForRequest: () => ({ missions: [], isReady: true }),
}));

vi.mock('../../../../../hooks/queries/use-habitat-names', () => ({
	useHabitatNames: () => new Map<string, string>(),
}));

vi.mock('../../../../../hooks/queries/use-profile-roster', () => ({
	useProfileRoster: () => [],
}));

vi.mock('../../../../../components/explorer', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../../components/explorer')>()),
	useControlMethodNames: () => new Map<string, string>(),
}));

vi.mock('../../../../../components/comments-section', () => ({
	CommentsSection: () => <p>comments</p>,
}));

vi.mock('../../../../../components/map/record-location-card', () => ({
	RecordLocationCard: () => <p>location card</p>,
}));

vi.mock('../../../../../components/map/record-regions-band', () => ({
	RecordRegionsBand: () => <p>regions band</p>,
}));

let RequestDetail: () => ReactNode;

beforeAll(async () => {
	RequestDetail = await preloadRouteComponent(
		() => import('../../../../../routes/operations/requests-for-control/$id'),
		'request for control detail',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.role = 'manager';
	harness.refusal = null;
	harness.writes.length = 0;
	harness.toastError.mockReset();
});

afterEach(cleanup);

function request(overrides: Partial<RequestRecord> = {}): RequestRecord {
	const requestedAt = new Date('2026-08-04T14:00:00Z');
	return {
		id: harness.params.id as string,
		organizationId: 'org-1',
		controlType: 'application',
		recommendedMethodId: null,
		summary: 'Ditch behind the depot',
		habitatId: null,
		inspectionId: null,
		collectionId: null,
		addressId: null,
		latitude: 30,
		longitude: -90,
		geometryKind: 'Point',
		requestedByProfileId: null,
		requestedAt,
		resolvedAt: null,
		resolvedByProfileId: null,
		createdAt: requestedAt,
		updatedAt: requestedAt,
		createdByProfileId: null,
		updatedByProfileId: null,
		status: 'open',
		...overrides,
	};
}

async function renderPage(record: RequestRecord) {
	harness.request = record;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<Suspense fallback={<span>loading</span>}>
					<RequestDetail />
				</Suspense>
			</TooltipProvider>
		</QueryClientProvider>,
	);
	await screen.findByRole('heading', { level: 1, name: 'Ditch behind the depot' });
}

async function choose(name: string): Promise<void> {
	fireEvent.pointerDown(
		screen.getByRole('button', { name: 'More actions' }),
		new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
	);
	const item = await screen.findByRole('menuitem', { name });
	// Inside `act` so the write settles and the busy flag clears before a case
	// reads the page, rather than as an update React reports as unwrapped.
	await act(async () => {
		fireEvent.click(item);
	});
}

describe('a refused lifecycle write on the request for control page', () => {
	it('is a toast carrying the server sentence, and no Alert', async () => {
		harness.refusal = new Error('This request has already been resolved.');
		await renderPage(request());

		await choose('Mark Resolved');

		await waitFor(() => expect(harness.writes).toEqual(['resolve']));
		await waitFor(() =>
			expect(harness.toastError).toHaveBeenCalledWith('This request has already been resolved.'),
		);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByText('This request has already been resolved.')).toBeNull();
	});

	it('falls back to the page sentence when the refusal carries none', async () => {
		harness.refusal = 'refused';
		await renderPage(request({ status: 'resolved', resolvedAt: new Date('2026-08-05T09:00:00Z') }));

		await choose('Reopen Request');

		await waitFor(() => expect(harness.writes).toEqual(['reopen']));
		await waitFor(() =>
			expect(harness.toastError).toHaveBeenCalledWith('Unable to update this request.'),
		);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('raises no toast when the write goes through', async () => {
		await renderPage(request());

		await choose('Mark Resolved');

		await waitFor(() => expect(harness.writes).toEqual(['resolve']));
		expect(harness.toastError).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

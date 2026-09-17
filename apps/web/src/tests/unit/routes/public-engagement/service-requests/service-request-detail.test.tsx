/** @vitest-environment jsdom */

/**
 * The service request detail page, rendered whole, through the header it
 * opens with (#1088).
 *
 * The page used to draw a bar of its own: a back link, an Edit button and a
 * Close button under the title, and a Danger zone card at the foot of the
 * column. It draws `DetailPageHeader` now, in the `panel` frame, and what this
 * file holds is the part of that the header's own suite cannot: which items the
 * `...` offers per state of the request, that choosing one opens the reason
 * dialog and hands the mutation the reason, that Delete is last and opens the
 * delete dialog, that the pencil and the menu hide below the manager floor, and
 * that none of the retired controls are drawn. The second half is the tabs
 * under it (#1089): five in the product's strip, the active one read from and
 * written to `?tab=`, Details holding the record and Comments the thread, and
 * each family tab listing its family's nearby records as the results rail's
 * own rows (#1087) with the distance in its slot. A row click hands the map the
 * selection under the record's composite key, the map is handed only the
 * active tab's family, and the rail's empty and failed states stand in for the
 * bespoke ones the page drew.
 *
 * What is faked is what `write-attribution.test.tsx` fakes, for the reasons its
 * docblock gives: the route module's `Route` hands back the params a match
 * would, the role comes from a variable, and the map is a stand-in, because the
 * page's context map calls `setCenter` on the instance it is handed and Mapbox
 * GL has no jsdom. `useNavigate` is the one departure from the shared stand-in,
 * whose navigation goes nowhere: here it writes the search back and tells the
 * hooks, because the tab is controlled by the URL and a click that wrote
 * nothing would leave the strip where it was. The mutation hook is a recorder
 * rather than the real one, since what the write does is
 * `use-service-request-mutations.test.ts`'s question and this file's is what
 * the page hands it. The component is preloaded first, since the split build's
 * lazy stand-in would otherwise overrun the test timeout while it imports.
 */

import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NearbyLayerConfig } from '../../../../../components/map/use-nearby-layer';
import { habitat_types } from '../../../../../lib/collections/habitat_types';
import { organizations } from '../../../../../lib/collections/organizations';
import { service_requests } from '../../../../../lib/collections/service_requests';
import { tag_items } from '../../../../../lib/collections/tag_items';
import { tags } from '../../../../../lib/collections/tags';
import { recordNoun } from '../../../../../lib/record-nouns';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent, stubPanelLayout } from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	/** The path params a match would carry. One object, since the stand-in reads it as a store. */
	params: { id: 'sr-1' } as Record<string, string>,
	/** The search params a match would carry: the active tab, when it is not Details. */
	search: {} as Record<string, unknown>,
	/** Who is signed in, for the two floors the header reads. */
	role: 'manager' as string,
	/** Every request the page sent, in order. */
	sent: [] as URL[],
	/** What the page handed the mutation hook. */
	writes: [] as { readonly kind: 'close' | 'reopen' | 'remove'; readonly args: unknown[] }[],
	/** What the nearby endpoint answers with. */
	nearby: [] as readonly unknown[],
	/** The nearby read fails with a 500 rather than answering. */
	nearbyFails: false,
	/** What the canvas was last handed for the nearby layer. */
	nearbyLayer: null as NearbyLayerConfig | null,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { notifyRouterStandIn, routerStandIn } = await import('../../route-mock-stand-ins');
	return {
		...routerStandIn(
			await importOriginal<object>(),
			() => harness.search,
			() => harness.params,
		),
		// A navigation within the route: the search is rewritten the way the
		// router would rewrite it, and every mounted `useSearch` is told.
		useNavigate:
			() =>
			({ search }: { search: (previous: Record<string, unknown>) => Record<string, unknown> }) => {
				harness.search = search(harness.search);
				act(() => notifyRouterStandIn());
				return Promise.resolve();
			},
	};
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	const answer = sessionFetchStandIn(harness.sent, (url) => {
		if (url.pathname.endsWith('/delete-impact')) {
			return {
				recordType: 'serviceRequest',
				recordId: REQUEST_ID,
				found: true,
				blockers: [],
				cascades: [],
				detaches: [],
			};
		}
		if (url.pathname.endsWith('/regions')) {
			return { recordType: 'service_requests', recordId: REQUEST_ID, found: true, groups: [] };
		}
		return {
			request: { id: REQUEST_ID, lat: 30, lng: -90, requestDate: '2026-08-04' },
			radius: { amount: 500, unitCode: 'm', meters: 500 },
			timeWindow: { daysBefore: 30, daysAfter: 30 },
			dateFrom: '2026-07-05',
			dateTo: '2026-09-03',
			items: harness.nearby,
		};
	});
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: (input: URL | string) => {
			const url = input instanceof URL ? input : new URL(input);
			if (harness.nearbyFails && url.pathname.endsWith('/nearby')) {
				harness.sent.push(url);
				return Promise.resolve({ ok: false, status: 500 } as Response);
			}
			return answer(input);
		},
	};
});

vi.mock('../../../../../hooks/use-auth-snapshot', async () => {
	const { signedInSnapshot } = await import('../../route-mock-stand-ins');
	return {
		useAuthSnapshot: () => {
			const snapshot = signedInSnapshot('org-1', 'profile-1');
			return snapshot.authenticated === true
				? { ...snapshot, localIdentity: { ...snapshot.localIdentity, role: harness.role } }
				: snapshot;
		},
	};
});

vi.mock('../../../../../hooks/mutations/use-service-request-mutations', () => ({
	useServiceRequestMutations: () => ({
		close: async (...args: unknown[]) => {
			harness.writes.push({ kind: 'close', args });
		},
		reopen: async (...args: unknown[]) => {
			harness.writes.push({ kind: 'reopen', args });
		},
		remove: async (...args: unknown[]) => {
			harness.writes.push({ kind: 'remove', args });
		},
	}),
}));

vi.mock('../../../../../components/map', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../../components/map')>()),
	MapCanvas: ({ nearbyLayer }: { readonly nearbyLayer?: NearbyLayerConfig }) => {
		harness.nearbyLayer = nearbyLayer ?? null;
		return <p>map surface</p>;
	},
}));

/** The request on screen, read off the params so a case cannot render one and assert another. */
const REQUEST_ID = harness.params.id as string;

let ServiceRequestDetail: () => ReactNode;

beforeAll(async () => {
	// The rail's placeholder rows arrive in a Radix ScrollArea, which measures
	// itself with a ResizeObserver jsdom has not got.
	stubPanelLayout();
	ServiceRequestDetail = await preloadRouteComponent(
		() => import('../../../../../routes/public-engagement/service-requests/$id'),
		'service request detail',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.role = 'manager';
	harness.search = {};
	harness.sent.length = 0;
	harness.writes.length = 0;
	harness.nearby = [];
	harness.nearbyFails = false;
	harness.nearbyLayer = null;
});

/** One record near the request, in the activity row shape the endpoint answers. */
function nearbyItem(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		category: 'inspection',
		family: 'larval',
		id: 'record-1',
		lat: 30.001,
		lng: -90.001,
		distanceMeters: 120,
		date: '2026-08-06',
		occurredAt: null,
		label: null,
		placeName: null,
		refId: null,
		methodRefId: null,
		amount: null,
		unitId: null,
		detail: null,
		stages: null,
		context: null,
		hasBycatch: null,
		tagIds: null,
		...overrides,
	};
}

afterEach(cleanup);

function seedRequest(closedAt: Date | null): void {
	seedRows(service_requests, [
		{
			id: REQUEST_ID,
			organization_id: 'org-1',
			display_name: 12,
			intake_type: 'phone',
			request_date: '2026-08-04',
			details: 'Standing water behind the garage.',
			contact_id: 'contact-1',
			address_id: 'address-1',
			received_by_profile_id: null,
			closed_at: closedAt,
			lat: 30,
			lng: -90,
		},
	]);
}

async function renderPage(closedAt: Date | null = null) {
	seedRequest(closedAt);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<Suspense fallback={<span>loading</span>}>
					<ServiceRequestDetail />
				</Suspense>
			</TooltipProvider>
		</QueryClientProvider>,
	);
	await screen.findByRole('heading', { level: 1, name: '#12' });
}

async function openMenu(): Promise<readonly string[]> {
	fireEvent.pointerDown(
		screen.getByRole('button', { name: 'More actions' }),
		new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
	);
	await screen.findAllByRole('menuitem');
	return screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
}

async function choose(name: string): Promise<void> {
	await openMenu();
	const item = screen.getByRole('menuitem', { name });
	// Radix selects on the pointer-up half of a click, and on a key. The key is
	// the one jsdom can deliver whole.
	fireEvent.keyDown(item, { key: 'Enter' });
}

describe('the service request detail page header', () => {
	it('draws the shared bar and none of the controls it replaced', async () => {
		await renderPage();

		// The eyebrow reads the register, which is what the hand-drawn bar did not.
		expect(screen.getByText(recordNoun('serviceRequest').title)).toBeTruthy();
		expect(screen.getByText('Phone · Aug 4, 2026')).toBeTruthy();
		expect(screen.getByText('Open')).toBeTruthy();
		expect(screen.queryByRole('link', { name: recordNoun('serviceRequest').titleMany })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Close Request' })).toBeNull();
		// The stand-in `Link` is an anchor with no href, so the pencil is found by
		// its name rather than its role. Where it goes is `link-destinations`'.
		expect(screen.getByLabelText('Edit')).toBeTruthy();
		expect(screen.queryByText(/Delete This/)).toBeNull();
	});

	it('draws the Tags at the right end of the bar', async () => {
		seedRows(tags, [{ id: 't1', tag_name: 'Priority', color: null, description: null }]);
		seedRows(tag_items, [
			{ id: 'i1', entity_id: REQUEST_ID, entity_type: 'service_request', tag_id: 't1' },
		]);
		await renderPage();

		await screen.findByText('Priority');
		const bar = screen.getByRole('banner');
		expect(bar.querySelectorAll('[data-slot="badge"]')).toHaveLength(2);
	});

	// The status flag is the one badge in the bar; a Tag row would be a second.
	it('draws no Tag row for an untagged request', async () => {
		await renderPage();

		const bar = screen.getByRole('banner');
		expect(bar.querySelectorAll('[data-slot="badge"]')).toHaveLength(1);
	});

	it('offers Close on an open request, with Delete last', async () => {
		await renderPage();

		expect(await openMenu()).toEqual(['Close Request', 'Delete service request']);
		expect(screen.getByRole('separator')).toBeTruthy();
	});

	it('offers Reopen on a closed request', async () => {
		await renderPage(new Date('2026-08-10T15:00:00Z'));

		expect(screen.getByText('Closed')).toBeTruthy();
		expect(await openMenu()).toEqual(['Reopen Request', 'Delete service request']);
	});

	it('closes with the reason the dialog collected', async () => {
		await renderPage();
		await choose('Close Request');

		expect(await screen.findByRole('heading', { name: 'Close this request' })).toBeTruthy();
		fireEvent.change(screen.getByLabelText('Reason'), { target: { value: ' Drained the pool. ' } });
		fireEvent.click(screen.getByRole('button', { name: 'Close Request' }));

		await waitFor(() =>
			expect(harness.writes).toEqual([{ kind: 'close', args: [REQUEST_ID, 'Drained the pool.'] }]),
		);
	});

	// A close nobody explained is still a close: the command insists on text, so
	// the plain fact goes on the record rather than the write being refused.
	it('reopens with the plain fact when the box is left empty', async () => {
		await renderPage(new Date('2026-08-10T15:00:00Z'));
		await choose('Reopen Request');

		expect(await screen.findByRole('heading', { name: 'Reopen this request' })).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Reopen Request' }));

		await waitFor(() =>
			expect(harness.writes).toEqual([{ kind: 'reopen', args: [REQUEST_ID, 'Reopened'] }]),
		);
	});

	it('opens the delete dialog from the last item', async () => {
		await renderPage();
		await choose('Delete service request');

		expect(await screen.findByRole('heading', { name: 'Delete #12?' })).toBeTruthy();
		await waitFor(() =>
			expect(harness.sent.some((url) => url.pathname.endsWith('/delete-impact'))).toBe(true),
		);
	});

	it('hides the pencil and the menu below the manager floor', async () => {
		harness.role = 'collector';
		await renderPage();

		expect(screen.queryByLabelText('Edit')).toBeNull();
		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});
});

/** The role every nearby pin the map was last handed carries, in order. */
function mapRoles(): readonly unknown[] {
	const data = harness.nearbyLayer?.data;
	return data === null || data === undefined || !('features' in data)
		? []
		: data.features.map((feature) => feature.properties?.role);
}

/** The keys of the nearby pins the map was last handed. */
function mapPinKeys(): readonly unknown[] {
	const data = harness.nearbyLayer?.data;
	return data === null || data === undefined || !('features' in data)
		? []
		: data.features
				.filter((feature) => feature.properties?.role === 'nearby')
				.map((feature) => feature.properties?.id);
}

/** The thread's supporting line, which is what says the Comments tab is showing. */
const COMMENTS_DESCRIPTION = 'Follow-up, resolution notes, and field context for this request.';

function tabNames(): readonly string[] {
	return screen.getAllByRole('tab').map((tab) => tab.textContent ?? '');
}

function activeTab(): string | undefined {
	return screen.getByRole('tab', { selected: true }).textContent ?? undefined;
}

describe('the tabs on the service request detail page', () => {
	it('draws the five tabs in the strip, with a count on each family that has records', async () => {
		harness.nearby = [
			nearbyItem({ id: 'habitat-1', category: 'habitat', label: 'Elm St basin' }),
			nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' }),
			nearbyItem({ id: 'inspection-2', placeName: 'Oak St basin' }),
		];
		await renderPage();

		await waitFor(() =>
			expect(tabNames()).toEqual([
				'Details',
				'Infrastructure1',
				'Surveillance2',
				'Control',
				'Comments',
			]),
		);
		expect(screen.getByRole('tablist', { name: 'Service request sections' })).toBeTruthy();
		// The family toggle chips are gone: the tab is the toggle.
		expect(screen.queryByRole('button', { name: /Surveillance/ })).toBeNull();
	});

	it('opens on Details, holding the record and the regions band', async () => {
		await renderPage();

		expect(activeTab()).toBe('Details');
		expect(screen.getByText('Standing water behind the garage.')).toBeTruthy();
		expect(screen.getByText('Intake')).toBeTruthy();
		expect(screen.getByText('Contact')).toBeTruthy();
		expect(screen.getByText('Address')).toBeTruthy();
		await waitFor(() =>
			expect(harness.sent.some((url) => url.pathname.endsWith('/regions'))).toBe(true),
		);
		expect(screen.queryByText(COMMENTS_DESCRIPTION)).toBeNull();
	});

	it('writes the chosen tab to the search and reads it back', async () => {
		await renderPage();

		fireEvent.mouseDown(screen.getByRole('tab', { name: 'Comments' }));
		await waitFor(() => expect(harness.search).toEqual({ tab: 'comments' }));
		expect(activeTab()).toBe('Comments');
		expect(await screen.findByText(COMMENTS_DESCRIPTION)).toBeTruthy();
		expect(screen.queryByText('Standing water behind the garage.')).toBeNull();

		// Back to the default, which stays out of the URL.
		fireEvent.mouseDown(screen.getByRole('tab', { name: 'Details' }));
		await waitFor(() => expect(harness.search).toEqual({}));
		expect(activeTab()).toBe('Details');
	});

	it('lands on the tab the URL names', async () => {
		harness.search = { tab: 'control' };
		await renderPage();

		expect(activeTab()).toBe('Control');
	});

	it('falls back to Details for a tab the URL misnames', async () => {
		harness.search = { tab: 'nearby' };
		await renderPage();

		expect(activeTab()).toBe('Details');
	});

	it('hands the map the request and its radius alone on Details and Comments', async () => {
		harness.nearby = [nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' })];
		await renderPage();

		await waitFor(() => expect(mapRoles()).toEqual(['ring', 'center']));

		fireEvent.mouseDown(screen.getByRole('tab', { name: 'Comments' }));
		await screen.findByText(COMMENTS_DESCRIPTION);
		expect(mapRoles()).toEqual(['ring', 'center']);
	});

	it("hands the map only the active tab's family", async () => {
		harness.nearby = [
			nearbyItem({ id: 'habitat-1', category: 'habitat', label: 'Elm St basin' }),
			nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' }),
			nearbyItem({ id: 'application-1', category: 'application', placeName: 'Elm St basin' }),
		];
		await renderPage();

		fireEvent.mouseDown(screen.getByRole('tab', { name: /Surveillance/ }));
		await waitFor(() => expect(mapPinKeys()).toEqual(['inspection:inspection-1']));
		expect(mapRoles()).toEqual(['ring', 'nearby', 'center']);

		fireEvent.mouseDown(screen.getByRole('tab', { name: /Infrastructure/ }));
		await waitFor(() => expect(mapPinKeys()).toEqual(['habitat:habitat-1']));
	});
});

describe('the nearby list on a family tab', () => {
	it('draws each record as a results-rail row with the distance in its slot', async () => {
		seedRows(habitat_types, [{ id: 'type-1', name: 'Catch basin' }]);
		harness.nearby = [
			nearbyItem({
				id: 'habitat-1',
				category: 'habitat',
				label: 'Elm St basin',
				refId: 'type-1',
				distanceMeters: 30,
			}),
			nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin', refId: 'type-1' }),
		];
		harness.search = { tab: 'infrastructure' };
		await renderPage();

		// The row's two controls, by the names the rail gives them.
		expect(
			await screen.findByRole('button', { name: 'Show Elm St basin on the map' }),
		).toBeTruthy();
		expect(screen.getByLabelText('View details for Elm St basin')).toBeTruthy();
		// The describer's subtitle, with the category ahead of it, and the
		// distance in the radius unit's family. A place carries no date.
		expect(screen.getByText('Habitat · Catch basin')).toBeTruthy();
		expect(screen.getByText('30 m')).toBeTruthy();
		expect(screen.queryByText('Aug 6')).toBeNull();
		// The family dot, named for what its colour means.
		expect(screen.getByRole('img', { name: 'Infrastructure' })).toBeTruthy();
		// The inspection is the Surveillance tab's, not this one's.
		expect(screen.queryByText('Inspection · Catch basin')).toBeNull();
		expect(screen.queryByText('120 m')).toBeNull();
	});

	it('lists the other family on its own tab, dated', async () => {
		harness.nearby = [
			nearbyItem({ id: 'habitat-1', category: 'habitat', label: 'Elm St basin' }),
			nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' }),
		];
		harness.search = { tab: 'surveillance' };
		await renderPage();

		expect(
			await screen.findByRole('button', { name: 'Show Elm St basin on the map' }),
		).toBeTruthy();
		expect(screen.getByText('120 m')).toBeTruthy();
		expect(screen.getByText('Aug 6')).toBeTruthy();
		expect(screen.getByRole('img', { name: 'Surveillance' })).toBeTruthy();
		expect(screen.queryByRole('img', { name: 'Infrastructure' })).toBeNull();
	});

	it('lists nearest first', async () => {
		harness.nearby = [
			nearbyItem({ id: 'inspection-far', placeName: 'Oak St basin', distanceMeters: 400 }),
			nearbyItem({ id: 'inspection-near', placeName: 'Elm St basin', distanceMeters: 40 }),
		];
		harness.search = { tab: 'surveillance' };
		await renderPage();

		await screen.findByText('40 m');
		const distances = screen.getAllByText(/^\d+ m$/).map((node) => node.textContent);
		expect(distances).toEqual(['40 m', '400 m']);
	});

	it('hands the map the row the reader clicked under its key, and clears it on a second click', async () => {
		harness.nearby = [nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' })];
		harness.search = { tab: 'surveillance' };
		await renderPage();

		const row = await screen.findByRole('button', { name: 'Show Elm St basin on the map' });
		fireEvent.click(row);
		await waitFor(() =>
			expect(harness.nearbyLayer?.selectedIds).toEqual(['inspection:inspection-1']),
		);
		expect(row.getAttribute('aria-pressed')).toBe('true');

		fireEvent.click(row);
		await waitFor(() => expect(harness.nearbyLayer?.selectedIds).toEqual([]));
	});

	it('selects the row the map click names', async () => {
		harness.nearby = [
			nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' }),
			nearbyItem({ id: 'inspection-2', placeName: 'Oak St basin' }),
		];
		harness.search = { tab: 'surveillance' };
		await renderPage();

		await screen.findByRole('button', { name: 'Show Oak St basin on the map' });
		act(() => harness.nearbyLayer?.onSelectFeature?.('inspection:inspection-2'));

		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Show Oak St basin on the map' })
					.getAttribute('aria-pressed'),
			).toBe('true'),
		);
		expect(
			screen
				.getByRole('button', { name: 'Show Elm St basin on the map' })
				.getAttribute('aria-pressed'),
		).toBe('false');
	});

	// A record picked on one family tab is not on the map while another tab is
	// showing, so the ring and the card go with it, and come back with the tab.
	it('keeps the selection off the map while its family is not drawn', async () => {
		harness.nearby = [nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' })];
		harness.search = { tab: 'surveillance' };
		await renderPage();

		fireEvent.click(await screen.findByRole('button', { name: 'Show Elm St basin on the map' }));
		await waitFor(() =>
			expect(harness.nearbyLayer?.selectedIds).toEqual(['inspection:inspection-1']),
		);

		fireEvent.mouseDown(screen.getByRole('tab', { name: 'Details' }));
		await waitFor(() => expect(harness.nearbyLayer?.selectedIds).toEqual([]));

		fireEvent.mouseDown(screen.getByRole('tab', { name: /Surveillance/ }));
		await waitFor(() =>
			expect(harness.nearbyLayer?.selectedIds).toEqual(['inspection:inspection-1']),
		);
	});

	it("draws the rail's empty state, naming the family, when nothing fell inside the radius", async () => {
		harness.nearby = [nearbyItem({ id: 'inspection-1', placeName: 'Elm St basin' })];
		harness.search = { tab: 'control' };
		await renderPage();

		expect(await screen.findByText('Nothing nearby')).toBeTruthy();
		expect(
			screen.getByText('No control records fell within this radius and time window.'),
		).toBeTruthy();
	});

	// The page used to tell a reader whose request had 500'd to try again
	// shortly, with nothing to try. The rail's failed state carries the retry.
	it("draws the rail's failed state with a retry when the read fails", async () => {
		harness.nearbyFails = true;
		harness.search = { tab: 'infrastructure' };
		await renderPage();

		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(screen.getByText('Could not load results')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
		expect(screen.queryByText('Nothing nearby')).toBeNull();
	});
});

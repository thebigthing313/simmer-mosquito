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
 * that none of the retired controls are drawn.
 *
 * What is faked is what `write-attribution.test.tsx` fakes, for the reasons its
 * docblock gives: the route module's `Route` hands back the params a match
 * would, the role comes from a variable, and the map is a stand-in, because the
 * page's context map calls `setCenter` on the instance it is handed and Mapbox
 * GL has no jsdom. The mutation hook is a recorder rather than the real one,
 * since what the write does is `use-service-request-mutations.test.ts`'s
 * question and this file's is what the page hands it. The component is preloaded
 * first, since the split build's lazy stand-in would otherwise overrun the test
 * timeout while it imports.
 */

import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../../lib/collections/organizations';
import { service_requests } from '../../../../../lib/collections/service_requests';
import { tag_items } from '../../../../../lib/collections/tag_items';
import { tags } from '../../../../../lib/collections/tags';
import { recordNoun } from '../../../../../lib/record-nouns';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent } from '../../explorer-route-harness';

const REQUEST_ID = 'sr-1';

const harness = vi.hoisted(() => ({
	/** The path params a match would carry. One object, since the stand-in reads it as a store. */
	params: { id: 'sr-1' } as Record<string, string>,
	/** No search key changes the answer here. */
	search: {} as Record<string, unknown>,
	/** Who is signed in, for the two floors the header reads. */
	role: 'manager' as string,
	/** Every request the page sent, in order. */
	sent: [] as URL[],
	/** What the page handed the mutation hook. */
	writes: [] as { readonly kind: 'close' | 'reopen' | 'remove'; readonly args: unknown[] }[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(
		await importOriginal<object>(),
		() => harness.search,
		() => harness.params,
	);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, (url) => {
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
				items: [],
			};
		}),
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
	MapCanvas: () => <p>map surface</p>,
}));

let ServiceRequestDetail: () => ReactNode;

beforeAll(async () => {
	ServiceRequestDetail = await preloadRouteComponent(
		() => import('../../../../../routes/public-engagement/service-requests/$id'),
		'service request detail',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.role = 'manager';
	harness.sent.length = 0;
	harness.writes.length = 0;
});

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

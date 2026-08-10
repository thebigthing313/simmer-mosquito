/** @vitest-environment jsdom */
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerUrl } from '../../../../../api';
import {
	type LookupKind,
	useCreateFoundation,
} from '../../../../../routes/organizations/$organizationId/-foundations-data';

/**
 * What the console posts when it stands an agency up.
 *
 * These six mutations used to write the operator endpoints, which took whatever
 * the panel handed them. #120 moved them onto the agency's own command
 * endpoints, and each body now has to satisfy a domain command contract instead
 * — a contract nothing in this app enforces, and which no type checks, because
 * the bodies are object literals posted as JSON.
 *
 * So the assertion is the exact body, per mutation. Three of the differences
 * below bit during the move; all of them fail at runtime, as a 400 or a 404, and
 * nowhere else.
 */

const ORGANIZATION_ID = '2f4a1f1c-4a3a-4d21-9d1a-0d9d2f5d4b11';
const NEW_ID = 'be08a10c-7d27-4130-a359-9e8874d4d2b8';
const GEOMETRY: GeoJsonGeometry = { type: 'Point', coordinates: [-119.02, 35.37] };

let posted: { url: string; body: unknown }[] = [];

describe('foundation creates', () => {
	beforeEach(() => {
		posted = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				posted.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
				return new Response(JSON.stringify({ txid: 42 }));
			}),
		);
		// Commands carry client-generated ids; pinning the generator is what lets
		// the bodies below be asserted whole rather than field by field.
		vi.stubGlobal('crypto', { randomUUID: () => NEW_ID });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('posts a region folder to the agency endpoint, with a client-generated id', async () => {
		await create((mutations) =>
			mutations.regionFolder.mutate({ name: 'North County', description: '  ' }),
		);

		expect(posted).toEqual([
			{
				url: `${getServerUrl()}/foundation/region-folders`,
				// An empty-but-typed description is a form saying "not given".
				body: { id: NEW_ID, name: 'North County', description: null },
			},
		]);
	});

	// The agency command names the field `geometry`; the operator endpoint called
	// it `geojson`. Posting the old name is a validation failure on a required
	// field, not a silently unlocated region.
	it('posts a region with `geometry`, not `geojson`', async () => {
		await create((mutations) =>
			mutations.region.mutate({
				name: 'Zone 4',
				regionFolderId: null,
				description: 'Along the canal',
				geojson: GEOMETRY,
			}),
		);

		expect(posted[0]?.url).toBe(`${getServerUrl()}/foundation/regions`);
		expect(posted[0]?.body).toEqual({
			id: NEW_ID,
			name: 'Zone 4',
			regionFolderId: null,
			description: 'Along the canal',
			geometry: GEOMETRY,
		});
	});

	// The address command is the one that genuinely does take `geojson`, so the
	// two sit one panel apart posting different field names on purpose.
	it('posts an address with `geojson`, and the country upper-cased', async () => {
		await create((mutations) =>
			mutations.address.mutate({
				displayName: 'District Office',
				country: 'us',
				addressLine1: '4500 Panorama Dr',
				addressLine2: '',
				locality: 'Bakersfield',
				region: 'CA',
				postalCode: '93306',
				geojson: GEOMETRY,
			}),
		);

		expect(posted[0]?.url).toBe(`${getServerUrl()}/foundation/addresses`);
		expect(posted[0]?.body).toEqual({
			id: NEW_ID,
			displayName: 'District Office',
			country: 'US',
			addressLine1: '4500 Panorama Dr',
			addressLine2: null,
			locality: 'Bakersfield',
			region: 'CA',
			postalCode: '93306',
			geojson: GEOMETRY,
		});
	});

	it('posts an organization species as an id pair', async () => {
		await create((mutations) => mutations.species.mutate('7c9e6679-7425-40de-944b-e07fc1f90ae7'));

		expect(posted).toEqual([
			{
				url: `${getServerUrl()}/foundation/organization-species`,
				body: { id: NEW_ID, speciesId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
			},
		]);
	});

	// A catalog entry is created live and retired later, which is an update; the
	// agency create rejects an `isActive` it has no way to honour.
	it('posts a lookup without `isActive`', async () => {
		await create((mutations) =>
			mutations.lookup.mutate({
				kind: 'habitat_types',
				input: { name: 'Storm drain', description: '', actionThreshold: 5 },
			}),
		);

		expect(posted[0]?.body).toEqual({
			id: NEW_ID,
			name: 'Storm drain',
			description: null,
			actionThreshold: 5,
		});
	});

	// The one thing on this page with no type behind it at all: a snake_case
	// `LookupKind` has to become the hyphenated segment the agency route is
	// registered under. A typo is a 404 at runtime and nothing else notices —
	// the same failure mode `sync-shapes.test.ts` guards for shape paths.
	it.each([
		['collection_methods', 'collection-methods'],
		['collection_lures', 'collection-lures'],
		['habitat_types', 'habitat-types'],
	] as const satisfies readonly (readonly [
		LookupKind,
		string,
	])[])('posts a %s lookup to /foundation/%s', async (kind, path) => {
		await create((mutations) =>
			mutations.lookup.mutate({
				kind,
				input: { name: 'Anything', description: '', actionThreshold: null },
			}),
		);

		expect(posted[0]?.url).toBe(`${getServerUrl()}/foundation/${path}`);
	});

	// A trap is a location-bearing command: it carries a domain location source
	// and the server snapshots the point inside its own transaction. A bare
	// `geojson` here is a raw geometry column by another name, and refused.
	it('posts a trap with a location source, not a geometry', async () => {
		await create((mutations) =>
			mutations.trap.mutate({
				collectionMethodId: 'f81d4fae-7dec-41d0-9a2f-00a0c91e6bf6',
				addressId: null,
				collectionLureId: null,
				trapName: 'CO2-14',
				trapCode: '',
				description: '',
				geojson: GEOMETRY,
			}),
		);

		expect(posted[0]?.url).toBe(`${getServerUrl()}/adult-surveillance/traps`);
		expect(posted[0]?.body).toEqual({
			id: NEW_ID,
			locationSource: { kind: 'geometry', geometry: GEOMETRY },
			collectionMethodId: 'f81d4fae-7dec-41d0-9a2f-00a0c91e6bf6',
			addressId: null,
			collectionLureId: null,
			trapName: 'CO2-14',
			trapCode: null,
			description: null,
		});
	});

	// Every agency endpoint takes the organization from the session, never from
	// the path — that is what entering the agency is for. An operator id leaking
	// into a write path would mean the gate was decorative.
	it('names no organization in any write path', async () => {
		await create((mutations) =>
			mutations.regionFolder.mutate({ name: 'North County', description: '' }),
		);

		expect(posted[0]?.url).not.toContain(ORGANIZATION_ID);
	});
});

type Mutations = ReturnType<typeof useCreateFoundation>;

/** Fire one mutation and wait for the post it makes. */
async function create(fire: (mutations: Mutations) => void): Promise<void> {
	const { result } = renderHook(() => useCreateFoundation(ORGANIZATION_ID), { wrapper: Providers });

	fire(result.current);

	await waitFor(() => {
		expect(posted).toHaveLength(1);
	});
}

function Providers({ children }: { readonly children: ReactNode }) {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

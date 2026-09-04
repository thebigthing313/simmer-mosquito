/** @vitest-environment jsdom */

/**
 * What a GIS write dispatches: regions, the folders they are filed under, and
 * the address book.
 *
 * These three tables are the ones where the geometry *is* the record rather than
 * a snapshot of somewhere else, so a boundary or a pin rides as an argument and
 * never as a location source. Nothing about the row can betray a mistake here:
 * `geom` never syncs, `geojson` is generated, and a polygon re-sent unchanged is
 * refused by the domain but only after the save has already failed in front of
 * the user. Whether the hook passed one is the only signal, so it is what these
 * assert.
 *
 * The other trap is the folder. A region leaves a folder by sending
 * `region_folder_id` as null, not by leaving it out, and the two spellings look
 * the same in a diff.
 *
 * `regionUpdatePlan` and `addressUpdatePlan` are tested as pure functions
 * beside this file. This covers the lines that hand a plan to
 * `mutateCollection`, plus the four operations that build no plan at all.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryCollections } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const FOLDER = '44444444-4444-4444-8444-444444444444';
const OTHER_FOLDER = '55555555-5555-4555-8555-555555555555';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const { dispatches, lastChanges, lastIntents, lastRow, lastWrite, resetDispatches, stubApi } =
	await import('./dispatch-harness');
const { useRegionMutations } = await import('../../../../hooks/mutations/use-region-mutations');
const { useRegionFolderMutations } = await import(
	'../../../../hooks/mutations/use-region-folder-mutations'
);
const { useAddressMutations } = await import('../../../../hooks/mutations/use-address-mutations');

const BOUNDARY = {
	type: 'Polygon',
	coordinates: [
		[
			[-74.4, 40.5],
			[-74.3, 40.5],
			[-74.3, 40.6],
			[-74.4, 40.6],
			[-74.4, 40.5],
		],
	],
} as const;
const PIN = { type: 'Point', coordinates: [-74.35, 40.55] } as const;

/**
 * A client above the region hooks, which clear the `record-regions` cache.
 *
 * `useQueryClient` throws without a provider, so every region write would fail
 * on the hook call rather than on what it dispatched. Local to this file because
 * regions are the only surface here that reads one.
 */
const queryClient = new QueryClient();
function wrapper({ children }: { readonly children: ReactNode }) {
	return createElement(QueryClientProvider, { client: queryClient }, children);
}

function renderRegions() {
	return renderHook(() => useRegionMutations(), { wrapper });
}

beforeEach(() => {
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function regionFields(overrides: Record<string, unknown> = {}) {
	return {
		name: 'North district',
		description: 'Everything above the canal.',
		folderId: FOLDER,
		metadata: null,
		...overrides,
	} as never;
}

describe('a region write', () => {
	it('names the create and carries the boundary as an argument, not a location source', async () => {
		const { result } = renderRegions();

		result.current.create(RECORD, regionFields(), BOUNDARY as never);

		expect(lastIntents()).toEqual(['foundation.createRegion']);
		expect(lastWrite().arguments).toEqual({ geometry: BOUNDARY });
		expect(lastWrite().locationSource).toBeUndefined();
	});

	it('places the new region optimistically, at the polygon type the trigger will write', async () => {
		// `set_owned_centroid()` stores `lower(st_geometrytype(new.geom))`, so a row
		// saying GeoJSON's `Polygon` disagrees with the synced one until Electric
		// replaces it, and every reader that normalizes the column hides that.
		const { result } = renderRegions();

		result.current.create(RECORD, regionFields(), BOUNDARY as never);

		expect(lastRow().geom_type).toBe('st_polygon');
		expect(lastRow().region_folder_id).toBe(FOLDER);
	});

	it('names every command the edit means, in one write', async () => {
		const { result } = renderRegions();

		await result.current.save({
			regionId: RECORD,
			fields: regionFields({ name: 'South district', folderId: OTHER_FOLDER }),
			current: regionFields(),
			geometry: BOUNDARY as never,
		});

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'foundation.updateRegionDetails',
			'foundation.moveRegionToFolder',
			'foundation.updateRegionGeometry',
		]);
	});

	it('leaves the boundary out of an edit that did not redraw it', async () => {
		const { result } = renderRegions();

		await result.current.save({
			regionId: RECORD,
			fields: regionFields({ name: 'South district' }),
			current: regionFields(),
			geometry: null,
		});

		expect(lastIntents()).toEqual(['foundation.updateRegionDetails']);
		expect(lastWrite().arguments).toBeUndefined();
		expect(lastWrite().locationSource).toBeUndefined();
	});

	it('carries the redrawn boundary and moves the centroid with it', async () => {
		const { result } = renderRegions();

		await result.current.save({
			regionId: RECORD,
			fields: regionFields(),
			current: regionFields(),
			geometry: BOUNDARY as never,
		});

		expect(lastIntents()).toEqual(['foundation.updateRegionGeometry']);
		expect(lastWrite().arguments).toEqual({ geometry: BOUNDARY });
		expect(lastChanges().geom_type).toBe('st_polygon');
	});

	it('states the folder as null when a save unfiles the region', async () => {
		// Present-and-null is how a region leaves a folder without joining another.
		// An absent key means the save did not touch the filing at all, and the
		// server reads the two differently.
		const { result } = renderRegions();

		await result.current.save({
			regionId: RECORD,
			fields: regionFields({ folderId: null }),
			current: regionFields(),
			geometry: null,
		});

		expect(lastIntents()).toEqual(['foundation.moveRegionToFolder']);
		expect(Object.keys(lastChanges())).toContain('region_folder_id');
		expect(lastChanges().region_folder_id).toBeNull();
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderRegions();

		await result.current.save({
			regionId: RECORD,
			fields: regionFields(),
			current: regionFields(),
			geometry: null,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('names the tree rename and touches nothing else', async () => {
		const { result } = renderRegions();

		await result.current.rename(RECORD, 'West district');

		expect(lastIntents()).toEqual(['foundation.updateRegionDetails']);
		expect(lastChanges().name).toBe('West district');
		expect(Object.keys(lastChanges())).not.toContain('region_folder_id');
	});

	it('sends a different write for unfiling than for filing, and both name the move', async () => {
		// The drag out of a folder and the drag into one are the same command with
		// different values, so a hook that sent no key for the unfile would look
		// right in the intent and lose the drop.
		const { result } = renderRegions();

		await result.current.move(RECORD, OTHER_FOLDER);
		expect(lastIntents()).toEqual(['foundation.moveRegionToFolder']);
		expect(lastChanges().region_folder_id).toBe(OTHER_FOLDER);

		await result.current.move(RECORD, null);
		expect(lastIntents()).toEqual(['foundation.moveRegionToFolder']);
		expect(Object.keys(lastChanges())).toContain('region_folder_id');
		expect(lastChanges().region_folder_id).toBeNull();

		expect(dispatches()).toHaveLength(2);
	});

	it('names the delete', async () => {
		const { result } = renderRegions();

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['foundation.deleteRegion']);
		expect(lastWrite().operation).toBe('delete');
	});
});

function folderFields(overrides: Record<string, unknown> = {}) {
	return {
		name: 'Northside',
		description: 'Regions above the canal.',
		...overrides,
	} as never;
}

describe('a region folder write', () => {
	it('names the create and files it under the acting agency', async () => {
		const { result } = renderHook(() => useRegionFolderMutations());

		await result.current.create(RECORD, folderFields());

		expect(lastIntents()).toEqual(['foundation.createRegionFolder']);
		expect(lastRow().organization_id).toBe(ORGANIZATION);
	});

	it('names the rename', async () => {
		const { result } = renderHook(() => useRegionFolderMutations());

		await result.current.save(RECORD, folderFields({ name: 'Southside' }), folderFields());

		expect(lastIntents()).toEqual(['foundation.updateRegionFolder']);
		expect(lastChanges().name).toBe('Southside');
	});

	it('dispatches nothing when the dialog was saved untouched', async () => {
		const { result } = renderHook(() => useRegionFolderMutations());

		await result.current.save(RECORD, folderFields(), folderFields());

		expect(dispatches()).toHaveLength(0);
	});
});

function addressFields(overrides: Record<string, unknown> = {}) {
	return {
		displayName: '12 Mill Road',
		addressLine1: '12 Mill Road',
		addressLine2: null,
		locality: 'Cranbury',
		region: 'NJ',
		postalCode: '08512',
		geocoderResponse: null,
		...overrides,
	} as never;
}

describe('an address write', () => {
	it('names the create, carries the pin as an argument, and hands back the id it minted', async () => {
		const { result } = renderHook(() => useAddressMutations());

		const addressId = await result.current.create(addressFields(), 'US', PIN as never);

		expect(lastIntents()).toEqual(['foundation.createAddress']);
		expect(lastWrite().arguments).toEqual({ geometry: PIN });
		expect(lastWrite().locationSource).toBeUndefined();
		expect(lastRow().id).toBe(addressId);
		expect(lastRow().country).toBe('US');
		expect(lastRow().geom_type).toBe('st_point');
	});

	it('leaves the pin out of an edit that only corrected the postcode', async () => {
		// `updateAddressLocation` with the point the address already has is a
		// command with nothing to change, and the domain refuses it, so the whole
		// save fails over the half the user never touched.
		const { result } = renderHook(() => useAddressMutations());

		await result.current.save(
			RECORD,
			addressFields({ postalCode: '08520' }),
			addressFields(),
			null,
		);

		expect(lastIntents()).toEqual(['foundation.updateAddressDetails']);
		expect(lastWrite().arguments).toBeUndefined();
		expect(lastChanges().postal_code).toBe('08520');
		expect(Object.keys(lastChanges())).not.toContain('country');
	});

	it('carries the moved pin and nothing the form did not touch', async () => {
		const { result } = renderHook(() => useAddressMutations());

		await result.current.save(RECORD, addressFields(), addressFields(), PIN as never);

		expect(lastIntents()).toEqual(['foundation.updateAddressLocation']);
		expect(lastWrite().arguments).toEqual({ geometry: PIN });
		expect(lastChanges().geom_type).toBe('st_point');
		expect(Object.keys(lastChanges())).not.toContain('display_name');
	});

	it('names both commands when the correction and the pin both moved', async () => {
		const { result } = renderHook(() => useAddressMutations());

		await result.current.save(
			RECORD,
			addressFields({ locality: 'Plainsboro' }),
			addressFields(),
			PIN as never,
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'foundation.updateAddressDetails',
			'foundation.updateAddressLocation',
		]);
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useAddressMutations());

		await result.current.save(RECORD, addressFields(), addressFields(), null);

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useAddressMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['foundation.deleteAddress']);
		expect(lastWrite().operation).toBe('delete');
	});
});

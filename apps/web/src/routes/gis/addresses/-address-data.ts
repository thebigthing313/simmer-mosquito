import { centroidFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../../auth';
import { checkOwnedGeometry } from '../../../components/map/geojson-adapter';

export interface AddressGeometry {
	readonly geojson: GeoJsonGeometry | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
	/** Set when the column held a shape an Address may not store (#761). */
	readonly unsupportedShape: string | null;
}

// The synced row carries the centroid (lat/lng) but not the geojson — that stays
// server-only — so views needing the drawable geometry read it over HTTP the same
// way habitats and regions do.
function addressGeometryQueryKey(addressId: string): readonly unknown[] {
	return ['address-geometry', addressId];
}

export function useAddressGeometry(addressId: string) {
	return useQuery({
		queryKey: addressGeometryQueryKey(addressId),
		queryFn: ({ signal }) => fetchAddressGeometry(addressId, signal),
		staleTime: Number.POSITIVE_INFINITY,
		placeholderData: (previous) => previous,
	});
}

export function seedAddressGeometryCache(
	queryClient: QueryClient,
	addressId: string,
	geojson: GeoJsonGeometry,
): void {
	const centroid = centroidFromGeoJson(geojson);
	const value: AddressGeometry = {
		geojson,
		lat: centroid?.lat ?? null,
		lng: centroid?.lng ?? null,
		geomType: geojson.type,
		unsupportedShape: null,
	};
	queryClient.setQueryData(addressGeometryQueryKey(addressId), value);
	void queryClient.invalidateQueries({ queryKey: addressGeometryQueryKey(addressId) });
}

async function fetchAddressGeometry(
	addressId: string,
	signal: AbortSignal,
): Promise<AddressGeometry | null> {
	const response = await sessionFetch(new URL(`/map/addresses/${addressId}`, getServerUrl()), {
		signal,
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Address geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly address?: {
			readonly geojson?: unknown;
			readonly lat?: number;
			readonly lng?: number;
			readonly geomType?: string;
		};
	};
	const address = body.address;
	if (address === undefined) {
		return null;
	}

	const checked = checkOwnedGeometry('address', address.geojson);
	return {
		geojson: checked.geometry,
		lat: address.lat ?? null,
		lng: address.lng ?? null,
		geomType: address.geomType ?? null,
		unsupportedShape: checked.unsupportedShape,
	};
}

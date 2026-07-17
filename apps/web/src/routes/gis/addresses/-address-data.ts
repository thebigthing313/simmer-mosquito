import { centroidFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../../auth';

export interface AddressGeometry {
	readonly geojson: GeoJsonGeometry | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
}

// Address point geometry is excluded from the Electric sync shape (the synced
// row carries no lat/lng), so detail views read the point over HTTP the same way
// habitats and regions do.
export function addressGeometryQueryKey(addressId: string): readonly unknown[] {
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
	};
	queryClient.setQueryData(addressGeometryQueryKey(addressId), value);
	void queryClient.invalidateQueries({ queryKey: addressGeometryQueryKey(addressId) });
}

async function fetchAddressGeometry(
	addressId: string,
	signal: AbortSignal,
): Promise<AddressGeometry | null> {
	const response = await fetch(new URL(`/map/addresses/${addressId}`, getServerUrl()), {
		credentials: 'include',
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

	return {
		geojson: (address.geojson ?? null) as GeoJsonGeometry | null,
		lat: address.lat ?? null,
		lng: address.lng ?? null,
		geomType: address.geomType ?? null,
	};
}

import type { AddressRow } from '@simmer-mosquito/sync';
import { useCallback, useRef, useState } from 'react';
import type { DrawGeometry } from './use-map-draw';

/** A finished point geometry, the only shape an address can produce. */
export type DrawPoint = DrawGeometry & { readonly type: 'Point' };

export interface AddressCoord {
	readonly lat: number;
	readonly lng: number;
}

export interface AddressPointController {
	/** The picked address's coordinate, or null when no address is selected. */
	readonly addressCoord: AddressCoord | null;
	/** Wire to the address picker's `onSelect`, alongside the form field update. */
	readonly selectAddress: (address: AddressRow | null) => void;
	/** Wire to the "move to address" affordance; a no-op with no address picked. */
	readonly moveToAddress: () => void;
}

/**
 * The shared address→location rule for the record forms: picking an address
 * remembers its coordinate and, **only when the form has no geometry yet**, seeds
 * a point there so a required location starts somewhere sane. Geometry the user
 * already drew is never replaced — the address is reference data, and moving the
 * record onto it stays an explicit act (`moveToAddress`).
 *
 * The caller owns the geometry state, so `onPlacePoint` is where a form applies
 * its own bookkeeping (geometry type, dirty flag, map preview).
 */
export function useAddressPoint({
	geometry,
	onPlacePoint,
}: {
	readonly geometry: DrawGeometry | null;
	readonly onPlacePoint: (point: DrawPoint) => void;
}): AddressPointController {
	const [addressCoord, setAddressCoord] = useState<AddressCoord | null>(null);
	// Read through refs so the callbacks stay stable across a form's re-renders and
	// never seed against a geometry that has since been drawn.
	const geometryRef = useRef(geometry);
	geometryRef.current = geometry;
	const placeRef = useRef(onPlacePoint);
	placeRef.current = onPlacePoint;

	const selectAddress = useCallback((address: AddressRow | null) => {
		const coord = addressCoordOf(address);
		setAddressCoord(coord);
		if (coord !== null && geometryRef.current === null) {
			placeRef.current(pointAt(coord));
		}
	}, []);

	const moveToAddress = useCallback(() => {
		if (addressCoord === null) {
			return;
		}
		placeRef.current(pointAt(addressCoord));
	}, [addressCoord]);

	return { addressCoord, selectAddress, moveToAddress };
}

/** An address's synced centroid, or null when it is cleared or not yet streamed. */
export function addressCoordOf(address: AddressRow | null): AddressCoord | null {
	if (address === null || typeof address.lat !== 'number' || typeof address.lng !== 'number') {
		return null;
	}
	return { lat: address.lat, lng: address.lng };
}

export function pointAt(coord: AddressCoord): DrawPoint {
	return { type: 'Point', coordinates: [coord.lng, coord.lat] };
}

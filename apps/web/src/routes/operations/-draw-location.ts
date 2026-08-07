import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useState } from 'react';
import { useFitToGeometry } from '../../components/map/geometry-control';
import { type DrawPoint, useAddressPoint } from '../../components/map/use-address-point';
import {
	type DrawGeometry,
	type DrawGeometryType,
	type MapDrawController,
	useMapDraw,
} from '../../components/map/use-map-draw';
import type { RequestMapPoint } from '../../components/pickers/new-address-form';

/**
 * Everything a form's location section needs to hold.
 *
 * The map instance, the shape being drawn, which tool is drawing it, an outline
 * shown behind it for context, and the "you have not placed this yet" error are
 * one piece of state wearing five `useState`s. Pulled out of the route components
 * because they only ever change together, and because leaving them inline put
 * more than twenty hooks in one function.
 *
 * It deliberately does not know about the form: `addressId` and `habitatId` stay
 * form fields, and their `onSelect` handlers call in here for the map's half of
 * the reaction. What lives here is only what a map draws.
 *
 * Three surfaces share it — raising a request, editing one, and placing an ad hoc
 * mission stop — and all three capture the same thing: one Point, LineString, or
 * Polygon the record will own.
 */
export interface DrawLocation {
	readonly geometry: DrawGeometry | null;
	readonly geometryType: DrawGeometryType;
	readonly draw: MapDrawController;
	/**
	 * The shape has been redrawn since the form opened.
	 *
	 * An edit only sends a location source when this is true: the server
	 * re-resolves geometry from whatever it is handed, so re-sending an unchanged
	 * shape is a write nobody asked for.
	 */
	readonly geometryChanged: boolean;
	/** Context drawn behind the record's own shape — a habitat outline, say. */
	readonly referenceGeometry: GeoJsonGeometry | null;
	readonly locationError: string | null;
	readonly addressCoord: ReturnType<typeof useAddressPoint>['addressCoord'];
	readonly onMapReady: (instance: MapboxMap) => void;
	/** Places the inline "create address" subform's point against this form's map. */
	readonly requestMapPoint: RequestMapPoint;
	readonly selectAddress: ReturnType<typeof useAddressPoint>['selectAddress'];
	readonly moveToAddress: ReturnType<typeof useAddressPoint>['moveToAddress'];
	/**
	 * Frame the map on a related record's point.
	 *
	 * With nothing drawn yet it becomes the record's own geometry — picking the
	 * habitat you found the problem at has already told the form where it is. With
	 * a shape in hand it draws behind as context instead, because the shape the
	 * user placed is the answer and must not be overwritten by a later pick.
	 */
	readonly selectReference: (point: { readonly lat: number; readonly lng: number } | null) => void;
	readonly startDraw: () => void;
	readonly changeType: (next: DrawGeometryType) => void;
	readonly clear: () => void;
	readonly clearError: () => void;
	/** Reports the missing shape on submit; returns false when there is nothing to save. */
	readonly requireGeometry: () => boolean;
}

export function useDrawLocation(options: {
	/** The shape the record already holds. Edit forms seed it; create forms do not. */
	readonly initialGeometry?: DrawGeometry | null;
	/** What to say when submit finds no geometry. */
	readonly missingMessage: string;
}): DrawLocation {
	const { initialGeometry = null, missingMessage } = options;

	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry?.type ?? 'Point',
	);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [referenceGeometry, setReferenceGeometry] = useState<GeoJsonGeometry | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);

	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);

	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start, requestPoint } = draw;

	// The record's own geometry frames last, so it wins when a reference pick and a
	// geometry change land on the same render.
	useFitToGeometry(map, referenceGeometry, draw.isDrawing);
	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	// Seeding from an address (or moving onto one) replaces the drawn shape with a
	// point, so the tool selector follows it.
	const placeAddressPoint = useCallback((point: DrawPoint) => {
		setGeometry(point);
		setGeometryType('Point');
		setGeometryChanged(true);
	}, []);
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});

	const selectReference = useCallback(
		(point: { readonly lat: number; readonly lng: number } | null) => {
			if (point === null) {
				setReferenceGeometry(null);
				return;
			}
			const drawn: DrawGeometry = { type: 'Point', coordinates: [point.lng, point.lat] };
			if (geometry === null) {
				// Seeded as the record's own geometry, so it needs no reference copy.
				setGeometry(drawn);
				setGeometryType('Point');
				setGeometryChanged(true);
				setReferenceGeometry(null);
				return;
			}
			setReferenceGeometry(drawn as unknown as GeoJsonGeometry);
		},
		[geometry],
	);

	// Switching tools replaces the shape, so the old one is cleared rather than
	// silently saved under the wrong type.
	const changeType = useCallback(
		(next: DrawGeometryType) => {
			setGeometryType(next);
			setGeometry(null);
			setGeometryChanged(true);
			if (draw.isDrawing) {
				start(next);
			}
		},
		[draw.isDrawing, start],
	);

	const startDraw = useCallback(() => {
		setLocationError(null);
		start(geometryType);
	}, [geometryType, start]);

	const requireGeometry = useCallback(() => {
		if (geometry === null) {
			setLocationError(missingMessage);
			return false;
		}
		setLocationError(null);
		return true;
	}, [geometry, missingMessage]);

	return {
		geometry,
		geometryType,
		draw,
		geometryChanged,
		referenceGeometry,
		locationError,
		addressCoord,
		onMapReady: setMap,
		requestMapPoint: useCallback<RequestMapPoint>(
			(pointOptions) => requestPoint(pointOptions?.prompt),
			[requestPoint],
		),
		selectAddress,
		moveToAddress,
		selectReference,
		startDraw,
		changeType,
		clear: useCallback(() => {
			setGeometry(null);
			setGeometryChanged(true);
		}, []),
		clearError: useCallback(() => setLocationError(null), []),
		requireGeometry,
	};
}

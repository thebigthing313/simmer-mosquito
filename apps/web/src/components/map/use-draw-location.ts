import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useState } from 'react';
import type { RequestMapPoint } from '../pickers/new-address-form';
import { useFitToGeometry } from './geometry-control';
import { type DrawPoint, useAddressPoint } from './use-address-point';
import {
	type DrawGeometry,
	type DrawGeometryType,
	type MapDrawController,
	useMapDraw,
} from './use-map-draw';

/**
 * Everything a record form's location section holds.
 *
 * The map instance, the shape being drawn, which tool is drawing it, an outline
 * shown behind it for context, whether the shape has been redrawn, and the "you
 * have not placed this yet" error are one piece of state wearing six
 * `useState`s. Twelve forms had each written their own copy, and the copies had
 * drifted: the habitat form tracked no redraw flag at all and its route
 * recovered one by comparing two JSON serialisations, so a description edit
 * named `updateHabitatLocation` and was refused for a collector (#427). The
 * registration form's tool selector left the old shape in place, so a point
 * could be saved under `Polygon`.
 *
 * It deliberately does not know about the form: `addressId` and `habitatId` stay
 * form fields, and their `onSelect` handlers call in here for the map's half of
 * the reaction. What lives here is only what a map draws.
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
	 * shape is a write nobody asked for, and on habitats it is a write the
	 * collector floor refuses.
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
	/** The context outline directly, for a form that fetches a whole shape rather than a point. */
	readonly setReferenceGeometry: (next: GeoJsonGeometry | null) => void;
	readonly startDraw: () => void;
	readonly changeType: (next: DrawGeometryType) => void;
	readonly clear: () => void;
	readonly clearError: () => void;
	/** Reports the missing shape on submit; returns false when there is nothing to save. */
	readonly requireGeometry: () => boolean;
}

export interface DrawLocationOptions {
	/** The shape the record already holds. Edit forms seed it; create forms do not. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * The tool a form with no shape yet starts on. A region is an area; every
	 * other record starts as a point and may be widened.
	 */
	readonly geometryType?: DrawGeometryType;
	/** Context the form opens with, such as the trap a collection already names. */
	readonly initialReferenceGeometry?: GeoJsonGeometry | null;
	/**
	 * The map, when the page owns the canvas rather than the form.
	 *
	 * A contact's registrations all draw on one map the page holds, so the
	 * controller is handed the instance rather than claiming it. Left out, the
	 * form wires {@link DrawLocation.onMapReady} to its own `MapCanvas`.
	 */
	readonly map?: MapboxMap | null;
	/** What to say when submit finds no geometry. */
	readonly missingMessage: string;
	/**
	 * Whether a shape must be placed to submit.
	 *
	 * False on the edit forms whose location the record already has:
	 * {@link DrawLocation.requireGeometry} passes an empty map, and the save sends
	 * no location command.
	 */
	readonly required?: boolean;
}

export function useDrawLocation(options: DrawLocationOptions): DrawLocation {
	const {
		initialGeometry = null,
		initialReferenceGeometry = null,
		map: externalMap,
		missingMessage,
		required = true,
	} = options;

	const [ownMap, setOwnMap] = useState<MapboxMap | null>(null);
	const map = externalMap === undefined ? ownMap : externalMap;
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry?.type ?? options.geometryType ?? 'Point',
	);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [referenceGeometry, setReferenceGeometry] = useState<GeoJsonGeometry | null>(
		initialReferenceGeometry,
	);
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
		setLocationError(null);
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
		if (geometry === null && required) {
			setLocationError(missingMessage);
			return false;
		}
		setLocationError(null);
		return true;
	}, [geometry, missingMessage, required]);

	return {
		geometry,
		geometryType,
		draw,
		geometryChanged,
		referenceGeometry,
		locationError,
		addressCoord,
		onMapReady: setOwnMap,
		requestMapPoint: useCallback<RequestMapPoint>(
			(pointOptions) => requestPoint(pointOptions?.prompt),
			[requestPoint],
		),
		selectAddress,
		moveToAddress,
		selectReference,
		setReferenceGeometry,
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

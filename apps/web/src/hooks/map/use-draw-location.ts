import {
	getBaseGeometryType,
	getOwnedGeometryBaseTypes,
	type OwnedGeometryKind,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import type { MapDrawController } from '../../components/map/draw-controller';
import type { RequestMapPoint } from '../../components/pickers/new-address-form';
import type { MissionStopGeometry } from '../operations/use-mission-stop-geometry';
import { type DrawPoint, useAddressPoint } from './use-address-point';
import { useFitToGeometry } from './use-fit-to-geometry';
import { type DrawGeometry, type DrawGeometryType, useMapDraw } from './use-map-draw';
import { useMissionStopSeed } from './use-mission-stop-seed';
/** What a record form's location section holds. */
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
	/** Context drawn behind the record's own shape, such as a habitat outline. */
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
	/**
	 * Say what is wrong with the location, where the missing-shape refusal is
	 * already said. The geocoder refusing a lookup is the one caller: it is a
	 * failure of a way to a point rather than of a save, so putting it in the
	 * form's save alert would be filing it under the wrong heading.
	 */
	readonly reportError: (message: string) => void;
	/** Reports the missing shape on submit; returns false when there is nothing to save. */
	readonly requireGeometry: () => boolean;
	/** The mission stop the form was opened from, or null off a stop. */
	readonly missionStop: MissionStopGeometry | null;
	/** Put the stop's geometry back after an edit or a clear. Does nothing until it has loaded. */
	readonly restoreStopGeometry: () => void;
}

export interface DrawLocationOptions {
	/** The record kind whose geometry this captures. Its policy sets the opening tool. */
	readonly geometryKind: OwnedGeometryKind;
	/** The shape the record already holds. Edit forms seed it; create forms do not. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * The tool a form with no shape yet starts on, where the record's own policy
	 * is not the answer. An ad-hoc inspection follows the habitat it is filed
	 * against.
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
	/**
	 * The mission stop the form was opened from. Its geometry arrives after the
	 * form opens, so it is drawn on the first render that has it, unless a shape
	 * was placed first, and never again: a cleared geometry stays cleared.
	 */
	readonly missionStop?: MissionStopGeometry | null;
}

/** The refusal while the stop's geometry is on its way, since drawing is not the fix. */
const STOP_GEOMETRY_LOADING = "The mission stop's geometry is still loading.";

/**
 * The tool a form opens on with nothing drawn yet.
 *
 * Polygon wherever the record can store one. Opening on the first shape the
 * register lists put every work record on Point, so drawing the area a Habitat
 * or an Application is about started with a tool change.
 */
function openingGeometryType(kind: OwnedGeometryKind): DrawGeometryType {
	const bases = getOwnedGeometryBaseTypes(kind);
	return bases.includes('Polygon') ? 'Polygon' : (bases[0] ?? 'Point');
}

/**
 * Everything a record form's location section holds: the map instance, the
 * shape being drawn, which tool is drawing it, the outline shown behind it,
 * whether the shape has been redrawn, and the missing-location error.
 *
 * `addressId` and `habitatId` stay form fields; their `onSelect` handlers call
 * `selectAddress` and `selectHabitat` for the map's half of the reaction.
 */
export function useDrawLocation(options: DrawLocationOptions): DrawLocation {
	const {
		geometryKind,
		initialGeometry = null,
		initialReferenceGeometry = null,
		map: externalMap,
		missingMessage,
		required = true,
		missionStop = null,
	} = options;

	const [ownMap, setOwnMap] = useState<MapboxMap | null>(null);
	const map = externalMap === undefined ? ownMap : externalMap;
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry === null
			? (options.geometryType ?? openingGeometryType(options.geometryKind))
			: getBaseGeometryType(initialGeometry.type),
	);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [referenceGeometry, setReferenceGeometry] = useState<GeoJsonGeometry | null>(
		initialReferenceGeometry,
	);
	const [locationError, setLocationError] = useState<string | null>(null);
	const placeStopGeometry = (next: DrawGeometry) => {
		setGeometry(next);
		setGeometryType(getBaseGeometryType(next.type));
	};
	const stopGeometry = useMissionStopSeed(missionStop, geometry === null, placeStopGeometry);
	const restoreStopGeometry = () => {
		if (stopGeometry === null) {
			return;
		}
		placeStopGeometry(stopGeometry);
		setGeometryChanged(true);
		setLocationError(null);
	};

	const handleGeometryChange = (next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setLocationError(null);
		}
	};

	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
		geometryKind,
	});
	const { start, requestPoint } = draw;

	// The record's own geometry frames last, so it wins when a reference pick and a
	// geometry change land on the same render.
	useFitToGeometry(map, referenceGeometry, draw.isDrawing);
	useFitToGeometry(map, geometry, draw.isDrawing);

	// Seeding from an address (or moving onto one) replaces the drawn shape with a
	// point, so the tool selector follows it.
	const placeAddressPoint = (point: DrawPoint) => {
		setGeometry(point);
		setGeometryType('Point');
		setGeometryChanged(true);
		setLocationError(null);
	};
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});

	const selectReference = (point: { readonly lat: number; readonly lng: number } | null) => {
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
		setReferenceGeometry(drawn);
	};

	// Switching tools replaces the shape, so the old one is cleared rather than
	// silently saved under the wrong type.
	const changeType = (next: DrawGeometryType) => {
		setGeometryType(next);
		setGeometry(null);
		setGeometryChanged(true);
		if (draw.isDrawing) {
			start(next);
		}
	};

	const startDraw = () => {
		setLocationError(null);
		start(geometryType);
	};

	const requireGeometry = () => {
		if (geometry === null && required) {
			setLocationError(missionStop?.status === 'loading' ? STOP_GEOMETRY_LOADING : missingMessage);
			return false;
		}
		setLocationError(null);
		return true;
	};

	return {
		geometry,
		geometryType,
		draw,
		geometryChanged,
		referenceGeometry,
		locationError,
		addressCoord,
		onMapReady: setOwnMap,
		requestMapPoint: (pointOptions) => requestPoint(pointOptions?.prompt),
		selectAddress,
		moveToAddress,
		selectReference,
		setReferenceGeometry,
		startDraw,
		changeType,
		clear: () => {
			setGeometry(null);
			setGeometryChanged(true);
		},
		clearError: () => setLocationError(null),
		reportError: setLocationError,
		requireGeometry,
		missionStop,
		restoreStopGeometry,
	};
}

import type { Map as MapboxMap } from 'mapbox-gl';
import { type DrawLocation, useDrawLocation } from '../map/use-draw-location';
import type { DrawGeometry } from '../map/use-map-draw';

/**
 * The map half of a registration form, as the shared record-form controller,
 * drawing on the map the page hands in.
 */
export function useRegistrationLocation(
	map: MapboxMap | null,
	initialGeometry: DrawGeometry | null,
): DrawLocation {
	return useDrawLocation({
		geometryKind: 'notificationRegistration',
		initialGeometry,
		map,
		missingMessage: 'Draw the place this registration covers.',
	});
}

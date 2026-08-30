import { convertUnitAmount } from '@simmer-mosquito/domain';
import { circlePolygon } from '@simmer-mosquito/mapping';
import type { RegistrationListing } from '../../hooks/queries/use-registration-directory';

/**
 * What each registration covers, as the map draws it.
 *
 * A ring where the buffer converts to metres, and a bare point where it does
 * not. A registration whose unit the catalog cannot resolve is shown as a point
 * rather than as a circle of the wrong size: generation refuses that unit
 * outright, so drawing a confident ring around it would show coverage nobody is
 * going to be notified inside of.
 */
export function coverageFeatures(
	registrations: readonly RegistrationListing[],
	unitsById: ReadonlyMap<string, { readonly code: string }>,
): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: registrations.map((registration) => {
			const metres = bufferMetres(registration, unitsById);
			const properties = {
				id: registration.id,
				isNoSpray: registration.isNoSpray,
				hasBees: registration.hasBees,
				isActive: registration.isActive,
			};
			return metres === null
				? {
						type: 'Feature' as const,
						id: registration.id,
						properties,
						geometry: {
							type: 'Point' as const,
							coordinates: [registration.lng, registration.lat],
						},
					}
				: {
						type: 'Feature' as const,
						id: registration.id,
						properties,
						geometry: circlePolygon(
							{ lng: registration.lng, lat: registration.lat },
							metres,
						) as unknown as GeoJSON.Polygon,
					};
		}),
	};
}

/** The buffer in metres, or null when there is none the catalog can resolve. */
function bufferMetres(
	registration: RegistrationListing,
	unitsById: ReadonlyMap<string, { readonly code: string }>,
): number | null {
	if (registration.bufferDistance === null || registration.bufferUnitId === null) {
		return null;
	}
	const code = unitsById.get(registration.bufferUnitId)?.code;
	if (code === undefined) {
		return null;
	}
	const metres = convertUnitAmount(registration.bufferDistance, code, 'meter');
	return metres === null || metres <= 0 ? null : metres;
}

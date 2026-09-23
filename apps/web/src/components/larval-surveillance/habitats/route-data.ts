import { commandPathFor, writeCommand } from '@simmer-mosquito/sync';
import { getServerUrl } from '../../../auth';
import type { RouteStopFeature } from '../../../hooks/map/use-route-layer';

/** The slice of a habitat the route surfaces need, geometry, status, address. */
export interface RouteHabitat {
	readonly id: string;
	readonly habitatName: string | null;
	readonly description: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly habitatTypeId: string | null;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}

/** One resolved stop: a route item joined to its habitat, in route order. */
export interface RouteStopView {
	readonly routeItemId: string;
	readonly habitatId: string;
	readonly ordinal: number;
	readonly position: number;
	readonly name: string;
	readonly description: string;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressLabel: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly directionsToNextItem: string | null;
	readonly hasLocation: boolean;
	/** True while the habitat row behind this stop is still resolving. */
	readonly isResolving: boolean;
}

/** A run of consecutive stops that share one address (the grouping cue). */
export interface RouteStopCluster {
	readonly key: string;
	readonly addressId: string | null;
	readonly addressLabel: string | null;
	readonly stops: readonly RouteStopView[];
}

export type StopTone = RouteStopFeature['tone'];

export function stopTone(stop: {
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}): StopTone {
	if (stop.isInaccessible) {
		return 'inaccessible';
	}
	return stop.isActive ? 'default' : 'inactive';
}

/**
 * Update a habitat's description in place. The on-demand habitat subset the
 * route reads streams the change back, so nothing is invalidated.
 */
export async function updateHabitatDescription(
	habitatId: string,
	description: string,
): Promise<void> {
	await patchHabitat(
		habitatId,
		{ intents: ['larvalSurveillance.updateHabitatDetails'], description },
		'Unable to save the description.',
	);
}

/**
 * Link (or unlink, with `null`) the habitat behind a stop to an address book
 * record. Same PATCH endpoint as the description edit.
 */
export async function updateHabitatAddress(
	habitatId: string,
	addressId: string | null,
): Promise<void> {
	await patchHabitat(
		habitatId,
		{ intents: ['larvalSurveillance.updateHabitatConfiguration'], address_id: addressId },
		'Unable to update the linked address.',
	);
}

/**
 * One PATCH on `/commands/habitats/{id}`, with the command it means named. A
 * raw request rather than a collection mutation, because both callers edit a
 * habitat the route page reads through an on-demand subset it does not own.
 * Each caller names its own intent rather than calling `habitatUpdatePlan`,
 * which reads a whole form; these change one field and know which.
 */
async function patchHabitat(
	habitatId: string,
	body: Record<string, unknown>,
	fallbackError: string,
): Promise<void> {
	const url = `${getServerUrl()}${commandPathFor('habitats')}/${habitatId}`;
	await writeCommand(url, 'PATCH', body, fallbackError);
}

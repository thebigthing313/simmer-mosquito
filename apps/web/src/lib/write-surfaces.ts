import type { AuthMe } from '../auth';
import { isBelowRole, type MinimumRole } from './write-access';

/**
 * The role floor for every route in this app whose whole purpose is a write.
 *
 * A floor used to be one fact written in two syntaxes that nothing joined: a
 * `write:` field on a navigation item, and a role named inline in the route's
 * own `beforeLoad`. The two agreed wherever both existed, and said nothing at
 * all wherever one did not, which is how three merge surfaces shipped with an
 * entry point that knew the floor and a route that did not (#623). A Collector
 * pasted the URL, filled the form in, and met the refusal at the save.
 *
 * So the floor is written once, here, and read by all three consumers: the
 * route guard through {@link isBelowWriteFloor}, the sidebar filter through
 * {@link writeSurfaceFloor}, and the controls that link to a surface.
 *
 * Keys are route paths as a `Link` writes one, so `$id` rather than the `$id_`
 * a non-nested route file is named with. Values mirror
 * `apps/server/src/command-permissions.ts`, which is the authority: the server
 * refuses the command whatever this says, and this only keeps the UI from
 * offering work it knows will be refused.
 *
 * `scripts/check-write-surfaces.mjs` holds the register to the route tree in
 * both directions.
 */
export const WRITE_SURFACE_FLOORS = {
	'/adult-surveillance/collections/$id/edit': 'collector',
	'/adult-surveillance/collections/create': 'collector',
	'/adult-surveillance/traps/$id/edit': 'manager',
	'/adult-surveillance/traps/create': 'manager',
	'/adult-surveillance/traps/routes/$id/edit': 'manager',
	'/control-operations/biocontrol/$id/edit': 'collector',
	'/control-operations/biocontrol/create': 'collector',
	'/control-operations/chemical/$id/edit': 'collector',
	'/control-operations/chemical/create': 'collector',
	'/control-operations/source-reduction/$id/edit': 'collector',
	'/control-operations/source-reduction/create': 'collector',
	'/gis/addresses/$id/edit': 'manager',
	// Manager, matching `foundation.mergeAddresses`. The page reads for anyone,
	// and everything it exists to start is a merge.
	'/gis/addresses/cleanup': 'manager',
	// Collector, not manager like the rest of GIS. A collector entering a field
	// record needs to name a location the address book does not hold yet, so
	// creating an entry is field entry. Editing and merging one stay at manager.
	'/gis/addresses/create': 'collector',
	'/gis/regions/$id/edit': 'manager',
	'/gis/regions/create': 'manager',
	'/gis/regions/import': 'manager',
	'/gis/weather/$id/edit': 'manager',
	'/gis/weather/$id/import': 'manager',
	'/gis/weather/create': 'manager',
	'/larval-surveillance/habitats/$id/edit': 'collector',
	// Manager, matching `larvalSurveillance.mergeHabitats`.
	'/larval-surveillance/habitats/$id/merge': 'manager',
	'/larval-surveillance/habitats/create': 'manager',
	'/larval-surveillance/habitats/routes/$id/edit': 'manager',
	'/larval-surveillance/inspections/$id/edit': 'collector',
	'/larval-surveillance/inspections/create': 'collector',
	'/operations/assignments/$id/edit': 'manager',
	'/operations/assignments/create': 'manager',
	'/operations/missions/$id/add-stop': 'manager',
	'/operations/missions/$id/edit': 'manager',
	'/operations/missions/create': 'manager',
	'/operations/requests-for-control/$id/edit': 'collector',
	'/operations/requests-for-control/create': 'collector',
	'/public-engagement/contacts/$id/edit': 'manager',
	// Manager, matching `publicEngagement.mergeContacts`.
	'/public-engagement/contacts/cleanup': 'manager',
	'/public-engagement/contacts/create': 'manager',
	'/public-engagement/outreach/$id/edit': 'collector',
	'/public-engagement/outreach/create': 'collector',
	'/public-engagement/service-requests/$id/edit': 'manager',
	'/public-engagement/service-requests/create': 'manager',
} as const satisfies Record<string, MinimumRole>;

/** A route path the register carries a floor for. */
export type WriteSurfacePath = keyof typeof WRITE_SURFACE_FLOORS;

const FLOORS: Readonly<Record<string, MinimumRole>> = WRITE_SURFACE_FLOORS;

/**
 * The floor for a path, or `undefined` where the path is not a write surface.
 *
 * Takes a plain string because the sidebar reads it off a navigation item's
 * typed `to`, which spans every route in the app rather than only these.
 */
export function writeSurfaceFloor(path: string): MinimumRole | undefined {
	return FLOORS[path];
}

/**
 * The `beforeLoad` half of the guard, for a route that is a write surface.
 *
 * Callers throw their own typed `redirect`, so each form sends a reader
 * somewhere useful (the list it was opened from, the record it was merging)
 * rather than to a shared dead end.
 */
export async function isBelowWriteFloor(
	context: { readonly auth: { readonly load: () => Promise<AuthMe> } },
	path: WriteSurfacePath,
): Promise<boolean> {
	return isBelowRole(context, WRITE_SURFACE_FLOORS[path]);
}

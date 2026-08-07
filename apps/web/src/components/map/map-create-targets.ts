import type { MinimumRole } from '../../lib/write-access';

/**
 * A record an operator can start from a point on the map.
 *
 * Every entry here captures its own geometry through `GeometryControl`, which
 * is what makes a coordinate prefill meaningful: the form opens with the point
 * already drawn, and the operator can still redraw it. Records whose location
 * comes from a parent — a collection sited by its trap — are deliberately
 * absent, because a coordinate handed to those forms has nowhere to land.
 *
 * `minimumRole` mirrors the floor the create route's own `beforeLoad` enforces
 * (`isWriteBlocked` is the collector floor). It is stated here so the menu can
 * omit an action rather than offer a viewer a route that bounces them straight
 * back — the same reasoning as `useHasRole`.
 */
export interface MapCreateTarget {
	/** Stable key, for React lists and for pages naming the targets they offer. */
	readonly id: string;
	/** Menu wording. "New X" rather than "Add X": the map is where the record begins. */
	readonly label: string;
	readonly to: string;
	readonly minimumRole: MinimumRole;
}

const target = (
	id: string,
	label: string,
	to: string,
	minimumRole: MinimumRole,
): MapCreateTarget => ({ id, label, to, minimumRole });

/**
 * The point-located records, keyed by the surface they belong to. A map page
 * names the ones it offers; nothing is offered everywhere by default, because a
 * menu listing every record type is a menu nobody reads.
 */
export const MAP_CREATE_TARGETS = {
	habitat: target('habitat', 'New Habitat', '/larval-surveillance/habitats/create', 'manager'),
	inspection: target(
		'inspection',
		'New Inspection',
		'/larval-surveillance/inspections/create',
		'collector',
	),
	trap: target('trap', 'New Trap', '/adult-surveillance/traps/create', 'manager'),
	collection: target(
		'collection',
		'New Collection',
		'/adult-surveillance/collections/create',
		'collector',
	),
	chemical: target(
		'chemical',
		'New Application',
		'/control-operations/chemical/create',
		'collector',
	),
	sourceReduction: target(
		'sourceReduction',
		'New Source Reduction',
		'/control-operations/source-reduction/create',
		'collector',
	),
	biocontrol: target(
		'biocontrol',
		'New Biocontrol Release',
		'/control-operations/biocontrol/create',
		'collector',
	),
	outreach: target('outreach', 'New Outreach', '/public-engagement/outreach/create', 'collector'),
	serviceRequest: target(
		'serviceRequest',
		'New Service Request',
		'/public-engagement/service-requests/create',
		'manager',
	),
	address: target('address', 'New Address', '/gis/addresses/create', 'collector'),
} as const satisfies Record<string, MapCreateTarget>;

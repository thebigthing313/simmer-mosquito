import type { RecordType } from '../../lib/record-nouns';
import type { MinimumRole } from '../../lib/write-access';
import { WRITE_SURFACE_FLOORS, type WriteSurfacePath } from '../../lib/write-surfaces';
import { createLabel } from '../app-shell/navigation';

/**
 * A record an operator can start from a point on the map.
 *
 * Every entry here captures its own geometry through `GeometryControl`, which
 * is what makes a coordinate prefill meaningful: the form opens with the point
 * already drawn, and the operator can still redraw it. Records whose location
 * comes from a parent — a collection sited by its trap — are deliberately
 * absent, because a coordinate handed to those forms has nowhere to land.
 *
 * `minimumRole` is read out of the write-surface register rather than stated
 * here, so the menu omits an action rather than offering a viewer a route that
 * bounces them straight back, and there is nothing to drift from the floor the
 * route's own guard enforces.
 */
export interface MapCreateTarget {
	/** Stable key, for React lists and for pages naming the targets they offer. */
	readonly id: string;
	/**
	 * Menu wording, read through `createLabel` so it is the sidebar entry and the
	 * explorer header's control word for word. It used to say "New X" here on the
	 * ground that the map is where the record begins, which was a fourth verb for
	 * one act; `CONTEXT.md` settled on one verb per kind of record (#949).
	 */
	readonly label: string;
	readonly to: WriteSurfacePath;
	readonly minimumRole: MinimumRole;
}

const target = (id: string, recordType: RecordType, to: WriteSurfacePath): MapCreateTarget => ({
	id,
	label: createLabel(recordType),
	to,
	minimumRole: WRITE_SURFACE_FLOORS[to],
});

/**
 * The point-located records, keyed by the surface they belong to. A map page
 * names the ones it offers; nothing is offered everywhere by default, because a
 * menu listing every record type is a menu nobody reads.
 */
export const MAP_CREATE_TARGETS = {
	habitat: target('habitat', 'habitat', '/larval-surveillance/habitats/create'),
	inspection: target('inspection', 'inspection', '/larval-surveillance/inspections/create'),
	trap: target('trap', 'trap', '/adult-surveillance/traps/create'),
	collection: target('collection', 'collection', '/adult-surveillance/collections/create'),
	chemical: target('chemical', 'application', '/control-operations/chemical/create'),
	sourceReduction: target(
		'sourceReduction',
		'sourceReduction',
		'/control-operations/source-reduction/create',
	),
	biocontrol: target('biocontrol', 'biocontrolAction', '/control-operations/biocontrol/create'),
	outreach: target('outreach', 'outreachAction', '/public-engagement/outreach/create'),
	serviceRequest: target(
		'serviceRequest',
		'serviceRequest',
		'/public-engagement/service-requests/create',
	),
	address: target('address', 'address', '/gis/addresses/create'),
} as const satisfies Record<string, MapCreateTarget>;

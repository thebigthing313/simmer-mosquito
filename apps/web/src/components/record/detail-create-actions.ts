import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { WRITE_SURFACE_FLOORS, type WriteSurfacePath } from '../../lib/write-surfaces';
import type { DetailAction } from './detail-page-header';

/**
 * The child records a detail page can start, and what each is called there.
 *
 * ## Two verbs, and the rule between them
 *
 * **Record** for dated field work: an inspection, a collection, a control
 * action. It happened, and the form writes down what happened. **Create** for a
 * record that goes on existing afterwards: a habitat, a trap, a service
 * request. The map's own menu says "New X" for all of them, and that stays as
 * it is: there the record begins at the point under the cursor, while here it
 * begins from the record already on screen.
 *
 * The trap page shows why the wording is decided once. It carries a "Record
 * Collection" button on its collections card and the same action in its menu,
 * and two names for one destination on one screen reads as two destinations.
 *
 * ## What is not in here
 *
 * A child whose create form has no field for its parent. A mission is the case:
 * a request for control is carried by a mission *stop*, and the mission form
 * has no request field, so "Create mission" from a request would open a form
 * that knows nothing about the request and leave the operator to add the stop
 * afterwards from the other side. That is a worse offer than no offer.
 */
const CREATE_TARGETS = {
	'/adult-surveillance/collections/create': {
		icon: iconRegistry.entities.collection.icon,
		label: 'Record collection',
	},
	'/adult-surveillance/traps/create': {
		icon: iconRegistry.entities.trap.icon,
		label: 'Create trap',
	},
	'/control-operations/biocontrol/create': {
		icon: iconRegistry.entities.biocontrolAction.icon,
		label: 'Record biocontrol release',
	},
	'/control-operations/chemical/create': {
		icon: iconRegistry.entities.application.icon,
		label: 'Record application',
	},
	'/control-operations/source-reduction/create': {
		icon: iconRegistry.entities.sourceReductionAction.icon,
		label: 'Record source reduction',
	},
	'/larval-surveillance/habitats/create': {
		icon: iconRegistry.entities.habitat.icon,
		label: 'Create habitat',
	},
	'/larval-surveillance/inspections/create': {
		icon: iconRegistry.entities.inspection.icon,
		label: 'Record inspection',
	},
	'/public-engagement/service-requests/create': {
		icon: iconRegistry.entities.serviceRequest.icon,
		label: 'Create service request',
	},
} as const satisfies Partial<
	Record<WriteSurfacePath, { readonly icon: RegistryIcon; readonly label: string }>
>;

/** A create form a detail page can send a reader to with its own record named. */
export type RecordCreatePath = keyof typeof CREATE_TARGETS;

/** The search key a create form reads its parent out of. */
export type RecordSeedKey = 'habitatId' | 'trapId' | 'addressId' | 'contactId';

/**
 * Menu items for the children a record can start, each opening on this record.
 *
 * `minimum` is read out of the write-surface register rather than stated here,
 * so the menu omits an item rather than offering a route that bounces the
 * reader straight back, and there is nothing to drift from the floor the
 * route's own guard enforces. That is `MAP_CREATE_TARGETS`' rule, and this is
 * the same rule applied from a record rather than from a point.
 *
 * `seedValue` of `null` hides every item rather than offering a form with an
 * empty parent: an ad-hoc inspection names no habitat, so there is nothing for
 * a control action opened from it to be filed against.
 */
export function createItems(
	seedKey: RecordSeedKey,
	seedValue: string | null,
	paths: readonly RecordCreatePath[],
): readonly DetailAction[] {
	return paths.map((path, index) => ({
		hidden: seedValue === null,
		icon: CREATE_TARGETS[path].icon,
		id: `create:${path}`,
		label: CREATE_TARGETS[path].label,
		minimum: WRITE_SURFACE_FLOORS[path],
		search: { [seedKey]: seedValue ?? '' },
		separatorBefore: index === 0,
		to: path,
	}));
}

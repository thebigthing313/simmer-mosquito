import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { RecordType } from '../../lib/record-nouns';
import { WRITE_SURFACE_FLOORS, type WriteSurfacePath } from '../../lib/write-surfaces';
import { createSentenceLabel } from '../app-shell/navigation';
import type { DetailAction } from './detail-page-header';

/**
 * The child records a detail page can start, and the record type each form
 * writes.
 *
 * ## The label is the register's
 *
 * An entry names a record type, not a label, and {@link createItems} builds
 * the label with `createSentenceLabel`: the record type's verb from
 * `CREATE_VERBS`, which is `CONTEXT.md`'s Record/Create rule, and its singular
 * from `RECORD_NOUNS`. Sentence case, because the items sit in a menu under the
 * record's own heading. The labels were literals until #1702, and two had
 * drifted from the register, `Record application` and `Record biocontrol
 * release`. A mission stop's record button reads `createLabel` over the same
 * record type, so one form carries one name wherever it is offered from, in
 * Title Case on the button and sentence case here.
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
		recordType: 'collection',
	},
	'/adult-surveillance/traps/create': {
		icon: iconRegistry.entities.trap.icon,
		recordType: 'trap',
	},
	'/control-operations/biocontrol/create': {
		icon: iconRegistry.entities.biocontrolAction.icon,
		recordType: 'biocontrolAction',
	},
	'/control-operations/chemical/create': {
		icon: iconRegistry.entities.application.icon,
		recordType: 'application',
	},
	'/control-operations/source-reduction/create': {
		icon: iconRegistry.entities.sourceReduction.icon,
		recordType: 'sourceReduction',
	},
	'/larval-surveillance/habitats/create': {
		icon: iconRegistry.entities.habitat.icon,
		recordType: 'habitat',
	},
	'/larval-surveillance/inspections/create': {
		icon: iconRegistry.entities.inspection.icon,
		recordType: 'inspection',
	},
	'/public-engagement/service-requests/create': {
		icon: iconRegistry.entities.serviceRequest.icon,
		recordType: 'serviceRequest',
	},
} as const satisfies Partial<
	Record<WriteSurfacePath, { readonly icon: RegistryIcon; readonly recordType: RecordType }>
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
		label: createSentenceLabel(CREATE_TARGETS[path].recordType),
		minimum: WRITE_SURFACE_FLOORS[path],
		search: { [seedKey]: seedValue ?? '' },
		separatorBefore: index === 0,
		to: path,
	}));
}

/**
 * The filter declarations more than one Operations index writes the same way:
 * Control type, on Missions and Requests for Control, and the name a profile
 * chip reads on all three for a profile it cannot name.
 */

import { CONTROL_TYPES, controlTypeLabel } from '../../hooks/queries/operations-view';
import { type IdSetDeclaration, suppliedSource } from '../explorer/filter-declarations';

/**
 * Control type over `types`. An id set over fixed options rather than a choice
 * set, because the codec holds any code, and so the chips keep the order the
 * types were picked in.
 */
export const CONTROL_TYPE_FILTER: IdSetDeclaration<'types'> = {
	kind: 'idSet',
	key: 'types',
	label: 'Control type',
	empty: 'No control types',
	options: suppliedSource(
		CONTROL_TYPES.map((controlType) => ({ id: controlType, label: controlTypeLabel(controlType) })),
	),
	unknown: 'Unknown control type',
};

/**
 * What an Assigned to or Requested by chip reads for a profile it cannot name.
 * The record sets' Technician filter says Unknown person, and which wording
 * the app settles on is #1538's to decide.
 */
export const PROFILE_UNKNOWN = 'Unknown profile';

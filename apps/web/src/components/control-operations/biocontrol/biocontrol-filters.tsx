/**
 * The biocontrol filters, drawn the same way on the Biocontrol Actions Map and
 * Table: the date window, the Method, Technician and Region popovers, the
 * Habitat-linked toggle, and the chips for whatever is set. It returns the
 * blocks bare, so each surface puts them in its own frame. Takes the binding
 * from `useRecordSetFilters`.
 */

import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { FilterFieldsLayout, FilterGrid } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import {
	catalogSource,
	defineFilterDeclarations,
	REGION_FILTER,
	TECHNICIAN_FILTER,
} from '../../explorer/filter-declarations';
import { type BiocontrolFilters, biocontrolRecordSet } from './biocontrol-actions-search';

/** Each biocontrol filter's control, chip and summary grouping, in chip order. */
export const biocontrolFilterDeclarations = defineFilterDeclarations(biocontrolRecordSet, [
	{ kind: 'dateRange' },
	{
		kind: 'idSet',
		key: 'methods',
		label: 'Method',
		empty: 'No biocontrol methods',
		options: catalogSource(catalogs.biocontrolMethods),
		unknown: 'Unknown method',
		summary: { grouping: 'biocontrolMethodId', title: 'Method' },
	},
	TECHNICIAN_FILTER,
	REGION_FILTER,
	{
		kind: 'flag',
		key: 'habitat',
		label: 'Habitat-linked only',
		summary: { grouping: 'habitat', title: 'Habitat', label: 'Linked to a Habitat' },
	},
]);

export function BiocontrolFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<BiocontrolFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(biocontrolFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={biocontrolFilterDeclarations} />}
			controls={fields.dates}
			popovers={
				<FilterGrid>
					{fields.methods}
					{fields.people}
					{fields.regions}
					{fields.habitat}
				</FilterGrid>
			}
			wide={wide}
		/>
	);
}

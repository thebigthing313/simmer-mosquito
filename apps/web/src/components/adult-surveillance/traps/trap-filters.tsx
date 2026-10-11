/**
 * The trap filters, drawn the same way on the Traps Map and the Traps Table:
 * the search box, Status, the Method and Region popovers, and the chips for
 * whatever is set. It returns the blocks bare, so each surface puts them in its
 * own frame. Takes the binding from `useRecordSetFilters`.
 */

import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { FilterFieldsLayout, FilterGrid } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import {
	catalogSource,
	defineFilterDeclarations,
	REGION_FILTER,
} from '../../explorer/filter-declarations';
import { TRAP_STATUS_LABELS, TRAP_STATUS_VALUES } from './legend';
import { type TrapFilters, trapRecordSet } from './traps-search';

/** Each trap filter's control, chip and summary grouping, in chip order. */
export const trapFilterDeclarations = defineFilterDeclarations(trapRecordSet, [
	{
		kind: 'choice',
		key: 'status',
		label: 'Status',
		options: TRAP_STATUS_VALUES.map((value) => ({ value, label: TRAP_STATUS_LABELS[value] })),
		summary: {
			grouping: 'isActive',
			title: 'Status',
			sides: [
				{ value: 'active', match: true },
				{ value: 'inactive', match: false },
			],
		},
	},
	{
		kind: 'text',
		key: 'search',
		label: 'Search traps by name or code',
		placeholder: 'Search name or code…',
	},
	{
		kind: 'idSet',
		key: 'methods',
		label: 'Method',
		empty: 'No collection methods',
		options: catalogSource(catalogs.collectionMethods),
		unknown: 'Unknown method',
		summary: { grouping: 'collectionMethodId', title: 'Collection Method' },
	},
	REGION_FILTER,
]);

export function TrapFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<TrapFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(trapFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={trapFilterDeclarations} />}
			controls={
				<>
					{fields.search}
					{fields.status}
				</>
			}
			popovers={
				<FilterGrid>
					{fields.methods}
					{fields.regions}
				</FilterGrid>
			}
			wide={wide}
		/>
	);
}

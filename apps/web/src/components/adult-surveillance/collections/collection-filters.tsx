/**
 * The collection filters, drawn the same way on the Collections Map and the
 * Collections Table: the date window, the Method and Region popovers, the
 * Problems only and Awaiting identification toggles, and the chips for
 * whatever is set. It returns the blocks bare, so each surface puts them in
 * its own frame. Takes the binding from `useRecordSetFilters`.
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
import { type CollectionFilters, collectionRecordSet } from './collections-search';

/** Each collection filter's control, chip and summary grouping, in chip order. */
export const collectionFilterDeclarations = defineFilterDeclarations(collectionRecordSet, [
	{ kind: 'dateRange' },
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
	{
		kind: 'flag',
		key: 'problems',
		label: 'Problems only',
		summary: { grouping: 'problem', title: 'Problems', label: 'Problem reported' },
	},
	{
		kind: 'flag',
		key: 'awaiting',
		label: 'Awaiting identification',
		summary: { grouping: 'awaiting', title: 'Identification', label: 'Awaiting identification' },
	},
]);

export function CollectionFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<CollectionFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(collectionFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={collectionFilterDeclarations} />}
			controls={fields.dates}
			popovers={
				<FilterGrid>
					{fields.methods}
					{fields.regions}
					{fields.problems}
					{fields.awaiting}
				</FilterGrid>
			}
			wide={wide}
		/>
	);
}

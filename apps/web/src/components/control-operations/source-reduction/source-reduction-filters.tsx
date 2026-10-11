/**
 * The source reduction filters, drawn the same way on the Source Reductions Map
 * and Table: the date window, the Method, Technician and Region popovers, and
 * the chips for whatever is set. It returns the blocks bare, so each surface
 * puts them in its own frame. Takes the binding from
 * `useRecordSetFilters`.
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
import { type SourceReductionFilters, sourceReductionRecordSet } from './source-reductions-search';

/** Each source reduction filter's control, chip and summary grouping, in chip order. */
export const sourceReductionFilterDeclarations = defineFilterDeclarations(
	sourceReductionRecordSet,
	[
		{ kind: 'dateRange' },
		{
			kind: 'idSet',
			key: 'methods',
			label: 'Method',
			empty: 'No source reduction methods',
			options: catalogSource(catalogs.sourceReductionMethods),
			unknown: 'Unknown method',
			summary: { grouping: 'sourceReductionMethodId', title: 'Method' },
		},
		TECHNICIAN_FILTER,
		REGION_FILTER,
	],
);

export function SourceReductionFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<SourceReductionFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(sourceReductionFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={
				<DeclaredFilterChips binding={binding} declarations={sourceReductionFilterDeclarations} />
			}
			controls={fields.dates}
			popovers={
				<FilterGrid>
					{fields.methods}
					{fields.people}
					{fields.regions}
				</FilterGrid>
			}
			wide={wide}
		/>
	);
}

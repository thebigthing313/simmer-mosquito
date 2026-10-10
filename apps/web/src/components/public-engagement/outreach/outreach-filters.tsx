/**
 * The outreach filters, drawn the same way on the Outreach Actions Map and
 * Table: the date window, the Method, Technician and Region popovers, and the
 * chips for whatever is set. It returns the blocks bare, so each surface puts
 * them in its own frame. Takes the binding from `useRecordSetFilters`.
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
import { type OutreachFilters, outreachRecordSet } from './outreach-actions-search';

/** Each outreach filter's control, chip and summary grouping, in chip order. */
export const outreachFilterDeclarations = defineFilterDeclarations(outreachRecordSet, [
	{ kind: 'dateRange' },
	{
		kind: 'idSet',
		key: 'methods',
		label: 'Method',
		empty: 'No outreach methods',
		options: catalogSource(catalogs.outreachMethods),
		unknown: 'Unknown method',
		summary: { grouping: 'outreachMethodId', title: 'Method' },
	},
	TECHNICIAN_FILTER,
	REGION_FILTER,
]);

export function OutreachFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<OutreachFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(outreachFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={outreachFilterDeclarations} />}
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

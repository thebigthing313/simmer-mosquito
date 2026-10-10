/**
 * The chemical application filters, drawn the same way on the Chemical
 * Applications Map and Table: the date window, the Insecticide, Method, Applicator
 * and Region popovers, and the chips for whatever is set. It returns the blocks
 * bare, so each surface puts them in its own frame. Takes the binding from
 * `useRecordSetFilters`.
 */

import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { FilterFieldsLayout, FilterGrid } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import {
	catalogSource,
	defineFilterDeclarations,
	INSECTICIDE_SOURCE,
	REGION_FILTER,
} from '../../explorer/filter-declarations';
import { type ApplicationFilters, applicationRecordSet } from './applications-search';

/** Each chemical application filter's control, chip and summary grouping, in chip order. */
export const applicationFilterDeclarations = defineFilterDeclarations(applicationRecordSet, [
	{ kind: 'dateRange' },
	{
		kind: 'idSet',
		key: 'insecticides',
		label: 'Insecticide',
		empty: 'No insecticides',
		options: INSECTICIDE_SOURCE,
		unknown: 'Unknown insecticide',
		summary: { grouping: 'insecticideId', title: 'Insecticide' },
	},
	{
		kind: 'idSet',
		key: 'methods',
		label: 'Method',
		empty: 'No application methods',
		options: catalogSource(catalogs.applicationMethods),
		unknown: 'Unknown method',
		summary: { grouping: 'applicationMethodId', title: 'Method' },
	},
	{
		kind: 'idSet',
		key: 'people',
		label: 'Applicator',
		empty: 'No people',
		options: catalogSource(catalogs.profiles),
		unknown: 'Unknown person',
		summary: { grouping: 'applicatorProfileId', title: 'Applicator' },
	},
	REGION_FILTER,
]);

export function ApplicationFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<ApplicationFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(applicationFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={applicationFilterDeclarations} />}
			controls={fields.dates}
			popovers={
				<FilterGrid>
					{fields.insecticides}
					{fields.methods}
					{fields.people}
					{fields.regions}
				</FilterGrid>
			}
			wide={wide}
		/>
	);
}

/**
 * The habitat filters, drawn the same way on the Habitats Map and the Habitats
 * Table: the search box, Status and Access, the four popover filters, and the
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
	TAG_SOURCE,
} from '../../explorer/filter-declarations';
import { type HabitatFilters, habitatRecordSet } from './habitats-search';

/** Each habitat filter's control, chip and summary grouping, in chip order. */
export const habitatFilterDeclarations = defineFilterDeclarations(habitatRecordSet, [
	{
		kind: 'text',
		key: 'search',
		label: 'Search habitats by name or description',
		placeholder: 'Search name or description…',
	},
	{
		kind: 'flag',
		key: 'untreated',
		label: 'Untreated',
		summary: { grouping: 'untreated', title: 'Treatment', label: 'Untreated' },
	},
	{
		kind: 'choice',
		key: 'status',
		label: 'Status',
		options: [
			{ value: 'all', label: 'All' },
			{ value: 'active', label: 'Active' },
			{ value: 'inactive', label: 'Inactive' },
		],
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
		kind: 'choice',
		key: 'access',
		label: 'Access',
		options: [
			{ value: 'all', label: 'All' },
			{ value: 'accessible', label: 'Accessible' },
			{ value: 'inaccessible', label: 'Inaccessible' },
		],
		summary: {
			grouping: 'isInaccessible',
			title: 'Access',
			sides: [
				{ value: 'accessible', match: false },
				{ value: 'inaccessible', match: true },
			],
		},
	},
	REGION_FILTER,
	{
		kind: 'idSet',
		key: 'typeIds',
		label: 'Habitat type',
		empty: 'No habitat types',
		options: catalogSource(catalogs.habitatTypes),
		unknown: 'Unknown type',
		summary: { grouping: 'habitatTypeId', title: 'Habitat Type', none: 'No type' },
	},
	{
		kind: 'idSet',
		key: 'tagIds',
		label: 'Tags',
		empty: 'No tags',
		options: TAG_SOURCE,
		unknown: 'Unknown tag',
	},
]);

export function HabitatFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: RecordSetFilterBinding<HabitatFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const fields = filterFields(habitatFilterDeclarations, binding);
	return (
		<FilterFieldsLayout
			chips={<DeclaredFilterChips binding={binding} declarations={habitatFilterDeclarations} />}
			controls={
				<>
					{fields.search}
					<div className="grid gap-2">
						{fields.status}
						{fields.access}
					</div>
				</>
			}
			// The toggle sits under the grid at its own width. In a grid cell it was
			// stretched to the column and drew as a bordered box beside the popover
			// triggers, which read as a text field.
			popovers={
				<div className="grid gap-2">
					<FilterGrid>
						{fields.typeIds}
						{fields.tagIds}
						{fields.regions}
					</FilterGrid>
					<div>{fields.untreated}</div>
				</div>
			}
			wide={wide}
		/>
	);
}

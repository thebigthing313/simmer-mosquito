/**
 * The habitat filters, drawn the same way on the Habitats Map and the Habitats
 * Table: the search box, Status and Access, the four popover filters, and the
 * chips for whatever is set. It returns the blocks bare, so each surface puts
 * them in its own frame. Takes the binding from `useHabitatFilterState`.
 */

import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { useHabitatTypeOptions } from '../../../hooks/explorer/use-habitat-type-options';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { useTagOptions } from '../../../hooks/explorer/use-tag-options';
import type { HabitatFilterBinding } from '../../../hooks/larval-surveillance/use-habitat-filter-state';
import type { Tag } from '../../../hooks/queries/tag-view';
import {
	ActiveFilterBar,
	FilterChip,
	FilterFieldsLayout,
	FilterGrid,
	MultiSelectFilter,
	SegmentedFilter,
	ToggleFilter,
	toggle,
} from '../../explorer';
import { HABITAT_FILTER_DEFAULTS } from './habitats-search';
import type { AccessFilter, StatusFilter } from './legend';

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' },
];

const ACCESS_OPTIONS: readonly { readonly value: AccessFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'accessible', label: 'Accessible' },
	{ value: 'inaccessible', label: 'Inaccessible' },
];

export function HabitatFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: HabitatFilterBinding;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, activeCount, searchInput, setSearchInput, clearSearch } = binding;
	const { options: habitatTypes, nameById: typeNameById } = useHabitatTypeOptions();
	const { options: tags, byId: tagById } = useTagOptions();
	const regions = useRegionOptions();

	const controls = (
		<>
			<SearchInput
				label="Search habitats by name or description"
				onChange={(event) => setSearchInput(event.target.value)}
				onClear={clearSearch}
				placeholder="Search name or description…"
				value={searchInput}
			/>

			<div className="grid gap-2">
				<SegmentedFilter
					label="Status"
					onChange={(status: StatusFilter) => setFilters({ status })}
					options={STATUS_OPTIONS}
					value={filters.status}
				/>
				<SegmentedFilter
					label="Access"
					onChange={(access: AccessFilter) => setFilters({ access })}
					options={ACCESS_OPTIONS}
					value={filters.access}
				/>
			</div>
		</>
	);

	const popovers = (
		<FilterGrid>
			<MultiSelectFilter
				empty="No habitat types"
				label="Habitat type"
				onChange={(typeIds) => setFilters({ typeIds })}
				options={habitatTypes}
				selected={filters.typeIds}
			/>
			<MultiSelectFilter
				empty="No tags"
				label="Tags"
				onChange={(tagIds) => setFilters({ tagIds })}
				options={tags}
				selected={filters.tagIds}
			/>
			<MultiSelectFilter
				empty="No regions"
				label="Region"
				onChange={(regionIds) => setFilters({ regions: regionIds })}
				options={regions.options}
				selected={filters.regions}
			/>
			<ToggleFilter
				label="Untreated"
				onChange={(untreated) => setFilters({ untreated })}
				value={filters.untreated}
			/>
		</FilterGrid>
	);

	const chips =
		activeCount === 0 ? null : (
			<HabitatFilterChips
				binding={binding}
				tagById={tagById}
				typeNameById={typeNameById}
				regionNameById={regions.nameById}
			/>
		);

	return <FilterFieldsLayout chips={chips} controls={controls} popovers={popovers} wide={wide} />;
}

/** One chip per filter that is set, each one clearing its own. */
function HabitatFilterChips({
	binding,
	regionNameById,
	tagById,
	typeNameById,
}: {
	readonly binding: HabitatFilterBinding;
	readonly regionNameById: ReadonlyMap<string, string>;
	readonly tagById: ReadonlyMap<string, Tag>;
	readonly typeNameById: ReadonlyMap<string, string>;
}) {
	const { filters, setFilters, clearSearch, clearAll } = binding;
	return (
		<ActiveFilterBar onClearAll={clearAll}>
			{filters.search.length > 0 ? (
				<FilterChip label={`Search: ${filters.search}`} onRemove={clearSearch} />
			) : null}
			{filters.untreated ? (
				<FilterChip label="Untreated" onRemove={() => setFilters({ untreated: false })} />
			) : null}
			<StateChips binding={binding} />
			{[...filters.regions].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={regionNameById.get(id) ?? 'Unknown region'}
					onRemove={() => setFilters({ regions: toggle(filters.regions, id) })}
				/>
			))}
			{[...filters.typeIds].map((id) => (
				<FilterChip
					key={`type-${id}`}
					label={typeNameById.get(id) ?? 'Unknown type'}
					onRemove={() => setFilters({ typeIds: toggle(filters.typeIds, id) })}
				/>
			))}
			{[...filters.tagIds].map((id) => {
				const tag = tagById.get(id);
				return (
					<FilterChip
						color={tag?.color ?? null}
						key={`tag-${id}`}
						label={tag?.name ?? 'Unknown tag'}
						onRemove={() => setFilters({ tagIds: toggle(filters.tagIds, id) })}
					/>
				);
			})}
		</ActiveFilterBar>
	);
}

/** Status and Access, each a chip only while it is off its default. */
function StateChips({ binding }: { readonly binding: HabitatFilterBinding }) {
	const { filters, setFilters } = binding;
	return (
		<>
			{filters.status === HABITAT_FILTER_DEFAULTS.status ? null : (
				<FilterChip
					label={`Status: ${filters.status === 'all' ? 'All' : 'Inactive'}`}
					onRemove={() => setFilters({ status: HABITAT_FILTER_DEFAULTS.status })}
				/>
			)}
			{filters.access === 'all' ? null : (
				<FilterChip
					label={`Access: ${filters.access === 'accessible' ? 'Accessible' : 'Inaccessible'}`}
					onRemove={() => setFilters({ access: 'all' })}
				/>
			)}
		</>
	);
}

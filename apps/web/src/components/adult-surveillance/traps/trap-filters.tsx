/**
 * The trap filters, drawn the same way on the Traps Map and the Traps Table:
 * the search box, Status, the Method and Region popovers, and the chips for
 * whatever is set. It returns the blocks bare, so each surface puts them in its
 * own frame. Takes the binding from `useTrapFilterState`.
 */

import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import type { TrapFilterBinding } from '../../../hooks/adult-surveillance/use-trap-filter-state';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { catalogs } from '../../../hooks/queries/catalog-register';
import {
	ActiveFilterBar,
	FilterChip,
	FilterFieldsLayout,
	FilterGrid,
	MultiSelectFilter,
	SegmentedFilter,
	toggle,
} from '../../explorer';
import { TRAP_STATUS_LABELS, TRAP_STATUS_VALUES, type TrapStatusFilter } from './legend';
import { TRAP_FILTER_DEFAULTS } from './traps-search';

const STATUS_OPTIONS: readonly { readonly value: TrapStatusFilter; readonly label: string }[] =
	TRAP_STATUS_VALUES.map((value) => ({ value, label: TRAP_STATUS_LABELS[value] }));

export function TrapFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: TrapFilterBinding;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, activeCount, searchInput, setSearchInput, clearSearch } = binding;
	const { options: methods } = useCatalogOptions(catalogs.collectionMethods);
	const regions = useRegionOptions();

	const controls = (
		<>
			<SearchInput
				label="Search traps by name or code"
				onChange={(event) => setSearchInput(event.target.value)}
				onClear={clearSearch}
				placeholder="Search name or code…"
				value={searchInput}
			/>
			<SegmentedFilter
				label="Status"
				onChange={(status: TrapStatusFilter) => setFilters({ status })}
				options={STATUS_OPTIONS}
				value={filters.status}
			/>
		</>
	);

	const popovers = (
		<FilterGrid>
			<MultiSelectFilter
				empty="No collection methods"
				label="Method"
				onChange={(methodIds) => setFilters({ methods: methodIds })}
				options={methods}
				selected={filters.methods}
			/>
			<MultiSelectFilter
				empty="No regions"
				label="Region"
				onChange={(regionIds) => setFilters({ regions: regionIds })}
				options={regions.options}
				selected={filters.regions}
			/>
		</FilterGrid>
	);

	const chips = activeCount === 0 ? null : <TrapFilterChips binding={binding} />;

	return <FilterFieldsLayout chips={chips} controls={controls} popovers={popovers} wide={wide} />;
}

/**
 * One chip per filter that is set, each one clearing its own. The filter card
 * draws these under its controls, and the Traps summary draws them above its
 * groupings.
 */
export function TrapFilterChips({ binding }: { readonly binding: TrapFilterBinding }) {
	const { nameById: methodNameById } = useCatalogOptions(catalogs.collectionMethods);
	const { nameById: regionNameById } = useRegionOptions();
	const { filters, setFilters, clearSearch, clearAll } = binding;
	return (
		<ActiveFilterBar onClearAll={clearAll}>
			{filters.status === TRAP_FILTER_DEFAULTS.status ? null : (
				<FilterChip
					label={`Status: ${TRAP_STATUS_LABELS[filters.status]}`}
					onRemove={() => setFilters({ status: TRAP_FILTER_DEFAULTS.status })}
				/>
			)}
			{filters.search.length > 0 ? (
				<FilterChip label={`Search: ${filters.search}`} onRemove={clearSearch} />
			) : null}
			{[...filters.methods].map((id) => (
				<FilterChip
					key={id}
					label={methodNameById.get(id) ?? 'Unknown method'}
					onRemove={() => setFilters({ methods: toggle(filters.methods, id) })}
				/>
			))}
			{[...filters.regions].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={regionNameById.get(id) ?? 'Unknown region'}
					onRemove={() => setFilters({ regions: toggle(filters.regions, id) })}
				/>
			))}
		</ActiveFilterBar>
	);
}

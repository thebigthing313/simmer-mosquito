/**
 * The address filters, drawn the same way on the Address Book Map and the
 * Addresses Table: the search box, the Region popover, and the chips for
 * whatever is set. It returns the blocks bare, so each surface puts them in
 * its own frame. Takes the binding from `useAddressFilterState`.
 */

import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import type { AddressFilterBinding } from '../../../hooks/gis/use-address-filter-state';
import {
	ActiveFilterBar,
	FilterChip,
	FilterFieldsLayout,
	MultiSelectFilter,
	toggle,
} from '../../explorer';

export function AddressFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: AddressFilterBinding;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, activeCount, searchInput, setSearchInput, clearSearch } = binding;
	const regions = useRegionOptions();

	const controls = (
		<SearchInput
			label="Search addresses"
			onChange={(event) => setSearchInput(event.target.value)}
			onClear={clearSearch}
			placeholder="Search addresses…"
			value={searchInput}
		/>
	);

	const popovers = (
		<MultiSelectFilter
			empty="No regions"
			label="Region"
			onChange={(regionIds) => setFilters({ regions: regionIds })}
			options={regions.options}
			selected={filters.regions}
		/>
	);

	const chips = activeCount === 0 ? null : <AddressFilterChips binding={binding} />;

	return <FilterFieldsLayout chips={chips} controls={controls} popovers={popovers} wide={wide} />;
}

/**
 * One chip per filter that is set, each one clearing its own. The filter card
 * draws these under its controls, and the Address Book summary draws them
 * above its figures.
 */
export function AddressFilterChips({ binding }: { readonly binding: AddressFilterBinding }) {
	const { nameById: regionNameById } = useRegionOptions();
	const { filters, setFilters, clearSearch, clearAll } = binding;
	return (
		<ActiveFilterBar onClearAll={clearAll}>
			{filters.search.trim().length > 0 ? (
				<FilterChip label={`Search: ${filters.search}`} onRemove={clearSearch} />
			) : null}
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

/**
 * The collection filters, drawn the same way on the Collections Map and the
 * Collections Table: the date window, the Method and Region popovers, the
 * Problems only and Awaiting identification toggles, and the chips for
 * whatever is set. It returns the blocks bare, so each surface puts them in
 * its own frame. Takes the binding from `useCollectionFilterState`.
 */

import type { CollectionFilterBinding } from '../../../hooks/adult-surveillance/use-collection-filter-state';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	DateRangeChip,
	FilterChip,
	FilterFieldsLayout,
	FilterGrid,
	MultiSelectFilter,
	ToggleFilter,
	toggle,
} from '../../explorer';

export function CollectionFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: CollectionFilterBinding;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, activeCount, today } = binding;
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
	const { options: methods } = useCatalogOptions(catalogs.collectionMethods);
	const regions = useRegionOptions();

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
			<ToggleFilter
				label="Problems only"
				onChange={(problems) => setFilters({ problems })}
				value={filters.problems}
			/>
			<ToggleFilter
				label="Awaiting identification"
				onChange={(awaiting) => setFilters({ awaiting })}
				value={filters.awaiting}
			/>
		</FilterGrid>
	);

	const chips = activeCount === 0 ? null : <CollectionFilterChips binding={binding} />;

	return (
		<FilterFieldsLayout
			chips={chips}
			controls={<DateRangeFilter {...dateRange} />}
			popovers={popovers}
			wide={wide}
		/>
	);
}

/**
 * One chip per filter that is set, each one clearing its own. The filter card
 * draws these under its controls, and the Collections summary draws them above
 * its groupings.
 */
export function CollectionFilterChips({ binding }: { readonly binding: CollectionFilterBinding }) {
	const { nameById: methodNameById } = useCatalogOptions(catalogs.collectionMethods);
	const { nameById: regionNameById } = useRegionOptions();
	const { filters, setFilters, reset, defaults } = binding;
	return (
		<ActiveFilterBar onClearAll={reset}>
			<DateRangeChip defaults={defaults} range={filters} setRange={setFilters} />
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
			{filters.problems ? (
				<FilterChip label="Problems only" onRemove={() => setFilters({ problems: false })} />
			) : null}
			{filters.awaiting ? (
				<FilterChip
					label="Awaiting identification"
					onRemove={() => setFilters({ awaiting: false })}
				/>
			) : null}
		</ActiveFilterBar>
	);
}

/**
 * The chemical application filters, drawn the same way on the Chemical
 * Applications Map and Table: the date window, the Insecticide, Method, Applicator
 * and Region popovers, and the chips for whatever is set. It returns the blocks
 * bare, so each surface puts them in its own frame. Takes the binding from
 * `useRecordSetFilters`.
 */

import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useInsecticideOptions } from '../../../hooks/explorer/use-insecticide-options';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { catalogs } from '../../../hooks/queries/catalog-register';
import type { FilterBinding } from '../../../lib/search-filters';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	DateRangeChip,
	FilterChip,
	FilterFieldsLayout,
	FilterGrid,
	MultiSelectFilter,
	toggle,
} from '../../explorer';
import { insecticideName } from './application-row-parts';
import type { ApplicationFilters } from './applications-search';

export function ApplicationFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: FilterBinding<ApplicationFilters>;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, activeCount, today } = binding;
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
	const { options: products } = useInsecticideOptions();
	const { options: methods } = useCatalogOptions(catalogs.applicationMethods);
	const personnel = useCatalogOptions(catalogs.profiles);
	const regions = useRegionOptions();

	const popovers = (
		<FilterGrid>
			<MultiSelectFilter
				empty="No insecticides"
				label="Insecticide"
				onChange={(insecticides) => setFilters({ insecticides })}
				options={products}
				selected={filters.insecticides}
			/>
			<MultiSelectFilter
				empty="No application methods"
				label="Method"
				onChange={(methodIds) => setFilters({ methods: methodIds })}
				options={methods}
				selected={filters.methods}
			/>
			<MultiSelectFilter
				empty="No people"
				label="Applicator"
				onChange={(people) => setFilters({ people })}
				options={personnel.options}
				selected={filters.people}
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

	const chips = activeCount === 0 ? null : <ApplicationFilterChips binding={binding} />;

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
 * draws these under its controls, and the Chemical Applications summary draws
 * them above its groupings.
 */
export function ApplicationFilterChips({
	binding,
}: {
	readonly binding: FilterBinding<ApplicationFilters>;
}) {
	const { nameById: insecticideNameById } = useInsecticideOptions();
	const { nameById: methodNameById } = useCatalogOptions(catalogs.applicationMethods);
	const { nameById: personNameById } = useCatalogOptions(catalogs.profiles);
	const { nameById: regionNameById } = useRegionOptions();
	const { filters, setFilters, reset, defaults } = binding;
	return (
		<ActiveFilterBar onClearAll={reset}>
			<DateRangeChip defaults={defaults} range={filters} setRange={setFilters} />
			{[...filters.insecticides].map((id) => (
				<FilterChip
					key={id}
					label={insecticideName(id, insecticideNameById)}
					onRemove={() => setFilters({ insecticides: toggle(filters.insecticides, id) })}
				/>
			))}
			{[...filters.methods].map((id) => (
				<FilterChip
					key={id}
					label={methodNameById.get(id) ?? 'Unknown method'}
					onRemove={() => setFilters({ methods: toggle(filters.methods, id) })}
				/>
			))}
			{[...filters.people].map((id) => (
				<FilterChip
					key={`person-${id}`}
					label={personNameById.get(id) ?? 'Unknown person'}
					onRemove={() => setFilters({ people: toggle(filters.people, id) })}
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

/**
 * The chemical application filters, drawn the same way on the Chemical
 * Applications Map and Table: the date window, the Insecticide, Method, Applicator
 * and Region popovers, and the chips for whatever is set. It returns the blocks
 * bare, so each surface puts them in its own frame. Takes the binding from
 * `useApplicationFilterState`.
 */

import type { ApplicationFilterBinding } from '../../../hooks/control-operations/use-application-filter-state';
import { useApplicationMethodOptions } from '../../../hooks/explorer/use-application-method-options';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useInsecticideOptions } from '../../../hooks/explorer/use-insecticide-options';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	FilterChip,
	FilterFieldsLayout,
	FilterGrid,
	MultiSelectFilter,
	toggle,
} from '../../explorer';
import { insecticideName } from './application-row-parts';

export function ApplicationFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: ApplicationFilterBinding;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, activeCount, today } = binding;
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
	const { options: products } = useInsecticideOptions();
	const { options: methods } = useApplicationMethodOptions();
	const personnel = usePersonnelOptions();
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
	readonly binding: ApplicationFilterBinding;
}) {
	const { nameById: insecticideNameById } = useInsecticideOptions();
	const { nameById: methodNameById } = useApplicationMethodOptions();
	const { nameById: personNameById } = usePersonnelOptions();
	const { nameById: regionNameById } = useRegionOptions();
	const { filters, setFilters, reset } = binding;
	return (
		<ActiveFilterBar onClearAll={reset}>
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

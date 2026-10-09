/**
 * The biocontrol filters, drawn the same way on the Biocontrol Actions Map and
 * Table: the date window, the Method, Technician and Region popovers, the
 * Habitat-linked toggle, and the chips for whatever is set. It returns the
 * blocks bare, so each surface puts them in its own frame. Takes the binding
 * from `useBiocontrolFilterState`.
 */

import type { BiocontrolFilterBinding } from '../../../hooks/control-operations/use-biocontrol-filter-state';
import { useBiocontrolMethodOptions } from '../../../hooks/explorer/use-biocontrol-method-options';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
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

export function BiocontrolFilterFields({
	binding,
	wide = false,
}: {
	readonly binding: BiocontrolFilterBinding;
	/** Two columns at page width, for the Table's filter bar. */
	readonly wide?: boolean;
}) {
	const { filters, setFilters, activeCount, today } = binding;
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
	const { options: methods } = useBiocontrolMethodOptions();
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();

	const popovers = (
		<FilterGrid>
			<MultiSelectFilter
				empty="No biocontrol methods"
				label="Method"
				onChange={(methodIds) => setFilters({ methods: methodIds })}
				options={methods}
				selected={filters.methods}
			/>
			<MultiSelectFilter
				empty="No people"
				label="Technician"
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
			<ToggleFilter
				label="Habitat-linked only"
				onChange={(habitat) => setFilters({ habitat })}
				value={filters.habitat}
			/>
		</FilterGrid>
	);

	const chips = activeCount === 0 ? null : <BiocontrolFilterChips binding={binding} />;

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
 * draws these under its controls, and the Biocontrol Actions summary draws
 * them above its groupings.
 */
export function BiocontrolFilterChips({ binding }: { readonly binding: BiocontrolFilterBinding }) {
	const { nameById: methodNameById } = useBiocontrolMethodOptions();
	const { nameById: personNameById } = usePersonnelOptions();
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
			{filters.habitat ? (
				<FilterChip label="Habitat-linked only" onRemove={() => setFilters({ habitat: false })} />
			) : null}
		</ActiveFilterBar>
	);
}

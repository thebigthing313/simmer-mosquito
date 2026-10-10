import { useDateRangeFilters } from '../../hooks/explorer/use-date-range-filters';
import { DateRangeFilter } from '../date-range-filter';
import { MultiSelectFilter, SegmentedFilter, ToggleFilter } from '../explorer';
import {
	DensityFilter,
	type InspectionCatalogs,
	type InspectionFilterBinding,
	InspectionFilterChips,
	WETNESS_OPTIONS,
} from './inspection-filters';

/**
 * The filters, above the rows they narrow. Each one is a param the list endpoint
 * takes, so Postgres answers the narrowed set and its count.
 *
 * The bar renders whether or not any rows came back, because a filter that
 * matched nothing is exactly when the reader needs the control that loosens it.
 */
export function InspectionsFilterBar({
	binding,
	catalogs,
}: {
	readonly binding: InspectionFilterBinding;
	readonly catalogs: InspectionCatalogs;
}) {
	const { activeCount, defaults, reset, set, setFilters, state, today } = binding;
	const dateRange = useDateRangeFilters({
		from: state.dateFrom,
		to: state.dateTo,
		today,
		setFilters,
	});
	const resetDates = () => setFilters({ from: defaults.from, to: defaults.to });

	return (
		<>
			<div className="grid gap-4 lg:grid-cols-2">
				<DateRangeFilter {...dateRange} />
				<div className="grid content-start gap-3">
					<SegmentedFilter
						label="Water"
						onChange={set.setWetness}
						options={WETNESS_OPTIONS}
						value={state.wetness}
					/>
					<DensityFilter onChange={set.setDensities} selected={state.densities} />
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<ToggleFilter
					label="Larvae found only"
					onChange={set.setPositiveOnly}
					value={state.positiveOnly}
				/>
				<MultiSelectFilter
					empty="No habitat types"
					label="Habitat type"
					onChange={set.setTypeIds}
					options={catalogs.habitatTypes}
					selected={state.typeIds}
				/>
				<MultiSelectFilter
					empty="No people"
					label="Inspector"
					onChange={set.setInspectorIds}
					options={catalogs.personnel}
					selected={state.inspectorIds}
				/>
			</div>
			{activeCount === 0 ? null : (
				<InspectionFilterChips
					catalogs={catalogs}
					defaults={defaults}
					onClearAll={reset}
					onResetDates={resetDates}
					set={set}
					state={state}
				/>
			)}
		</>
	);
}

import { LARVAL_DENSITIES } from '@simmer-mosquito/domain';
import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import { densityLabel } from '../../larval-display';
import type { InspectionFilterSetters, InspectionFilterState } from '../inspection-filters';

/**
 * The five groupings the Inspections summary draws, out of the counts
 * `/map/inspections/summary` answers, each value wired to the filter it names.
 *
 * Wet and Dry set `wetness`, a density band is added to `densities`, Larvae
 * found sets `positiveOnly`, a habitat type is added to `typeIds` and an
 * inspector to `inspectorIds`. A value the filter already holds is selected,
 * and clicking it widens back out: the value leaves its set, `wetness` goes to
 * `all`, `positiveOnly` goes off. Type and inspector names come from the
 * catalogs the chips read, since the server answers ids. A value no filter
 * selects, an inspection with no density, type or inspector, is drawn as text.
 */
export function inspectionSummaryGroupings({
	summary,
	state,
	set,
	typeNameById,
	inspectorNameById,
}: {
	readonly summary: MapSummary;
	readonly state: InspectionFilterState;
	readonly set: InspectionFilterSetters;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly inspectorNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	const counts = (grouping: string) => summary.groups[grouping] ?? [];
	const countOf = (grouping: string, value: string | boolean | null) =>
		counts(grouping).find((group) => group.value === value)?.count ?? 0;

	// Drawn in a fixed order rather than by count, so Wet sits in the same place
	// whichever side holds more.
	const water: SummaryGroup[] = (
		[
			['wet', 'Wet', true],
			['dry', 'Dry', false],
		] as const
	).map(([side, label, value]) => {
		const isSelected = state.wetness === side;
		return {
			key: side,
			label,
			count: countOf('isWet', value),
			isSelected,
			onToggle: () => set.setWetness(isSelected ? 'all' : side),
		};
	});

	// The bands in the scale's order, the way the filter and the map key list
	// them, and the inspections with no density recorded after them.
	const densities: SummaryGroup[] = [
		...LARVAL_DENSITIES.map((band) => ({
			key: band,
			label: densityLabel(band),
			count: countOf('density', band),
			isSelected: state.densities.has(band),
			onToggle: () => set.setDensities(toggle(state.densities, band)),
		})),
		{ key: 'none-recorded', label: densityLabel(null), count: countOf('density', null) },
	];

	// Only the larvae found side is drawn, since no filter selects its opposite.
	const positive = {
		key: 'positive',
		label: 'Larvae found',
		count: countOf('positive', true),
		isSelected: state.positiveOnly,
		onToggle: () => set.setPositiveOnly(!state.positiveOnly),
	};

	const byId = (
		grouping: string,
		selected: ReadonlySet<string>,
		apply: (next: ReadonlySet<string>) => void,
		nameById: ReadonlyMap<string, string>,
		labels: { readonly unknown: string; readonly none: string },
	): SummaryGroup[] =>
		counts(grouping).map(({ value, count }) =>
			typeof value === 'string'
				? {
						key: value,
						label: nameById.get(value) ?? labels.unknown,
						count,
						isSelected: selected.has(value),
						onToggle: () => apply(toggle(selected, value)),
					}
				: { key: 'none', label: labels.none, count },
		);

	const types = byId('habitatTypeId', state.typeIds, set.setTypeIds, typeNameById, {
		unknown: 'Unknown type',
		none: 'No type',
	});
	const inspectors = byId(
		'inspectedBy',
		state.inspectorIds,
		set.setInspectorIds,
		inspectorNameById,
		{
			unknown: 'Unknown inspector',
			none: 'No inspector',
		},
	);

	return [
		{ key: 'water', title: 'Water', groups: water.filter(hasRecords) },
		{ key: 'density', title: 'Density', groups: densities.filter(hasRecords) },
		{ key: 'larvae', title: 'Larvae', groups: [positive].filter(hasRecords) },
		{ key: 'type', title: 'Habitat Type', groups: types },
		{ key: 'inspector', title: 'Inspector', groups: inspectors },
	];
}

/** A value no inspection in view carries is not drawn, because clicking it would empty the panel. */
function hasRecords(group: SummaryGroup): boolean {
	return group.count > 0;
}

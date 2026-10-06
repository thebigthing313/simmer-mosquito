import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import type { SampleFilters } from '../samples-search';
import { SAMPLE_STATUS_ORDER, sampleStatusLabel } from './legend';

/**
 * The Samples summary's three groupings and its figure, out of what
 * `/map/samples/summary` answers, each value wired to the filter it names.
 *
 * A status sets `status`, replacing the one there, a species is added to
 * `species`, and Non-mosquito material sets `nonMosquito`. A value the filter
 * already holds is selected, and clicking it widens back out: `status` goes to
 * `all`, the species leaves the set, `nonMosquito` goes off. Species names
 * come from the catalog the chips read, since the server answers ids. The
 * larvae identified are drawn as text, because no filter selects a figure.
 */
export function sampleSummaryGroupings({
	summary,
	filters,
	setFilters,
	speciesNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: SampleFilters;
	readonly setFilters: (patch: Partial<SampleFilters>) => void;
	readonly speciesNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	const counts = (grouping: string) => summary.groups[grouping] ?? [];
	const countOf = (grouping: string, value: string | boolean) =>
		counts(grouping).find((group) => group.value === value)?.count ?? 0;

	// In the order the Status filter lists them rather than by count, so a
	// status sits in the same place whichever holds more.
	const statuses: SummaryGroup[] = SAMPLE_STATUS_ORDER.map((status) => {
		const isSelected = filters.status === status;
		return {
			key: status,
			label: sampleStatusLabel(status),
			count: countOf('status', status),
			isSelected,
			onToggle: () => setFilters({ status: isSelected ? 'all' : status }),
		};
	});

	const species: SummaryGroup[] = counts('species').flatMap(({ value, count }) =>
		typeof value === 'string'
			? [
					{
						key: value,
						label: speciesNameById.get(value) ?? 'Unknown species',
						count,
						isSelected: filters.species.has(value),
						onToggle: () => setFilters({ species: toggle(filters.species, value) }),
					},
				]
			: [],
	);

	// Only the non-mosquito side is drawn, since no filter selects its opposite.
	const nonMosquito = {
		key: 'non-mosquito',
		label: 'Non-mosquito material',
		count: countOf('nonMosquito', true),
		isSelected: filters.nonMosquito,
		onToggle: () => setFilters({ nonMosquito: !filters.nonMosquito }),
	};

	const larvaeTotal = summary.figures?.larvaeTotal;

	return [
		{ key: 'status', title: 'Status', groups: statuses.filter(hasRecords) },
		{ key: 'species', title: 'Species', groups: species },
		{ key: 'material', title: 'Material', groups: [nonMosquito].filter(hasRecords) },
		{
			key: 'totals',
			title: 'Totals',
			groups:
				larvaeTotal === undefined
					? []
					: [{ key: 'larvae-identified', label: 'Larvae identified', count: larvaeTotal }],
		},
	];
}

/** A value no sample in view carries is not drawn, because clicking it would empty the panel. */
function hasRecords(group: SummaryGroup): boolean {
	return group.count > 0;
}

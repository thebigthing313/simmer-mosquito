/**
 * The inspection filters, shared by the map explorer and the table: each
 * filter's control, chip and summary grouping, declared once. Both surfaces
 * hold what the reader narrowed to on the URL through the codecs in
 * `inspections-search.ts`. Layout is each surface's own.
 */

import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { catalogs } from '../../hooks/queries/catalog-register';
import { type FilterOption, toggle } from '../explorer';
import {
	catalogSource,
	defineFilterDeclarations,
	REGION_FILTER,
} from '../explorer/filter-declarations';
import { densityLabel } from '../larval-display';
import { INSPECTION_DENSITY_COLORS } from '../map';
import { inspectionRecordSet } from './inspections-search';

/** The two catalogs both surfaces label a filtered row by. */
export interface InspectionCatalogs {
	readonly habitatTypes: readonly FilterOption[];
	readonly personnel: readonly FilterOption[];
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly personnelNameById: ReadonlyMap<string, string>;
}

/** Each inspection filter's control, chip and summary grouping, in chip order. */
export const inspectionFilterDeclarations = defineFilterDeclarations(inspectionRecordSet, [
	{ kind: 'dateRange' },
	{
		kind: 'choice',
		key: 'water',
		label: 'Water',
		options: [
			{ value: 'all', label: 'All' },
			{ value: 'wet', label: 'Wet' },
			{ value: 'dry', label: 'Dry' },
		],
		summary: {
			grouping: 'isWet',
			title: 'Water',
			sides: [
				{ value: 'wet', match: true },
				{ value: 'dry', match: false },
			],
		},
	},
	{
		kind: 'choiceSet',
		key: 'density',
		label: 'Density',
		// The bands in the scale's order, the way the filter and the map key list them.
		options: LARVAL_DENSITIES.map((value) => ({
			value,
			label: densityLabel(value),
			color: INSPECTION_DENSITY_COLORS[value],
		})),
		field: DensityFilter,
		summary: { grouping: 'density', title: 'Density', none: densityLabel(null) },
	},
	{
		kind: 'flag',
		key: 'positive',
		label: 'Larvae found only',
		chip: 'Larvae found',
		summary: { grouping: 'positive', title: 'Larvae', label: 'Larvae found' },
	},
	{
		kind: 'idSet',
		key: 'types',
		label: 'Habitat type',
		empty: 'No habitat types',
		options: catalogSource(catalogs.habitatTypes),
		unknown: 'Unknown type',
		summary: { grouping: 'habitatTypeId', title: 'Habitat Type', none: 'No type' },
	},
	{
		kind: 'idSet',
		key: 'inspectors',
		label: 'Inspector',
		empty: 'No people',
		options: catalogSource(catalogs.profiles),
		unknown: 'Unknown inspector',
		summary: { grouping: 'inspectedBy', title: 'Inspector', none: 'No inspector' },
	},
	REGION_FILTER,
]);

/**
 * Larval density as a chip row, each chip carrying the heat colour it maps to
 * on the map, so the filter doubles as the map's key. The bands and their
 * order come from `LARVAL_DENSITIES`.
 */
function DensityFilter({
	selected,
	onChange,
}: {
	readonly selected: ReadonlySet<LarvalDensity>;
	readonly onChange: (next: ReadonlySet<LarvalDensity>) => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<span className="w-14 shrink-0 pt-1 font-medium text-muted-foreground text-xs">Density</span>
			<fieldset className="m-0 flex min-w-0 flex-1 flex-wrap gap-1.5 border-0 p-0">
				<legend className="sr-only">Filter by larval density</legend>
				{LARVAL_DENSITIES.map((value) => {
					const isSelected = selected.has(value);
					return (
						<button
							aria-pressed={isSelected}
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
								isSelected
									? 'border-primary/50 bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
							)}
							key={value}
							onClick={() => onChange(toggle(selected, value))}
							type="button"
						>
							<span
								aria-hidden="true"
								className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
								style={{ backgroundColor: INSPECTION_DENSITY_COLORS[value] }}
							/>
							{densityLabel(value)}
						</button>
					);
				})}
			</fieldset>
		</div>
	);
}

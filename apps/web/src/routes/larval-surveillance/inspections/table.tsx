import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { ListEmpty, ListLoading, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { DateRangeFilter } from '../../../components/date-range-filter';
import { MultiSelectFilter, SegmentedFilter, ToggleFilter } from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { DensityBadge, LifeStageStrip, WetnessBadge } from '../../../components/larval-display';
import {
	DensityFilter,
	INSPECTION_TABLE_COUNTING,
	type InspectionCatalogs,
	type InspectionFilterBinding,
	InspectionFilterChips,
	WETNESS_OPTIONS,
} from '../../../components/larval-surveillance/inspection-filters';
import {
	INSPECTIONS_PATH,
	type InspectionListing,
	inspectionQueryParams,
	inspectionTileFilters,
} from '../../../components/larval-surveillance/inspection-listing';
import { InspectionSurfaceSwitch } from '../../../components/larval-surveillance/inspection-surface-switch';
import {
	inspectionFilterCodecs,
	sharedInspectionSearch,
} from '../../../components/larval-surveillance/inspections-search';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useInspectionCatalogs } from '../../../hooks/larval-surveillance/use-inspection-catalogs';
import { useInspectionFilterState } from '../../../hooks/larval-surveillance/use-inspection-filter-state';
import { habitatLabel } from '../../../lib/coordinate-label';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

/**
 * The explorer's filter set, validated through the explorer's codecs.
 *
 * `searchValidator` keeps what its codecs name and drops the rest, so the
 * filters have to be here or a link from the map would arrive with them stripped
 * before the page read them. `regions` is among them and no control here writes
 * it: carrying the param is what lets a reader go Map to Table and back without
 * losing their region selection.
 */
export const Route = createFileRoute('/larval-surveillance/inspections/table')({
	component: InspectionsTableRoute,
	validateSearch: searchValidator(inspectionFilterCodecs),
});

const InspectionIcon = iconRegistry.entities.inspection.icon;

/**
 * Every inspection as a table, newest first, a hundred to a page.
 *
 * The map explorer beside this answers "where was work done"; this answers
 * "what has been recorded", which is a question about a run of rows rather than
 * about a place, so it spends no room on a map.
 *
 * The rows are a page of `/map/inspections`, the endpoint the Map's rail reads,
 * over the whole world rather than a viewport. Postgres filters, orders and
 * counts, and the order is fixed: newest inspection date first, the newest
 * entry first within a date. `docs/web-components.md` says why there are no
 * column sorts and no Load more.
 *
 * ## The filters are the map explorer's
 *
 * The bar above the rows reads and writes the params the explorer reads and
 * writes, through the same codecs, so a link built on one surface opens the same
 * set on the other. Six of the explorer's seven filters are here. Region is
 * carried and not applied, because no control here shows or clears it.
 */
function InspectionsTableRoute() {
	// `all-time` is where the two surfaces part: this page says it holds every
	// inspection, so an address with no dates on it opens on every inspection.
	const binding = useInspectionFilterState(INSPECTION_TABLE_COUNTING, 'all-time');
	const catalogs = useInspectionCatalogs();
	const carried = sharedInspectionSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...inspectionQueryParams(inspectionTileFilters({ ...binding.state, regionIds: new Set() })),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<InspectionListing>({
			path: INSPECTIONS_PATH,
			rowsKey: 'inspections',
			recordType: 'inspection',
			params,
		});

	// `record` is the measure the route-loading skeleton reserves, so the table
	// arrives at the width it stood in for (#1043, #1047).
	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<InspectionSurfaceSwitch current="table" search={carried} />}
				icon={InspectionIcon}
				title={recordNoun('inspection').titleMany}
			/>
			<InspectionsFilterBar binding={binding} catalogs={catalogs} />
			{isError ? <InspectionsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={binding.activeCount > 0}
					isLoading={isLoading}
					onClearFilters={binding.reset}
				/>
			) : (
				<div className="grid gap-3">
					<InspectionsTable rows={rows} typeNameById={catalogs.typeNameById} />
					<ExplorerPagination
						noun={recordNoun('inspection')}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={total}
					/>
				</div>
			)}
		</OutletSimpleLayout>
	);
}

/**
 * The filters, above the rows they narrow. Each one is a param the list endpoint
 * takes, so Postgres answers the narrowed set and its count.
 *
 * The bar renders whether or not any rows came back, because a filter that
 * matched nothing is exactly when the reader needs the control that loosens it.
 */
function InspectionsFilterBar({
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
		<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
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
		</div>
	);
}

/**
 * Waiting, failed, filtered to nothing, or genuinely empty. A failure has its
 * own strip above, so here it draws nothing rather than a second one. The last
 * two ask for different things: one wants a looser filter, the other wants a
 * first inspection.
 */
function NoRows({
	isError,
	isFiltered,
	isLoading,
	onClearFilters,
}: {
	readonly isError: boolean;
	readonly isFiltered: boolean;
	readonly isLoading: boolean;
	readonly onClearFilters: () => void;
}) {
	if (isError) {
		return null;
	}
	if (isLoading) {
		return <ListLoading rows={8} />;
	}
	if (isFiltered) {
		return (
			<ListEmpty
				action={
					<Button onClick={onClearFilters} type="button" variant="outline">
						Clear Filters
					</Button>
				}
				description="Nothing recorded matches what is set above."
				icon={InspectionIcon}
				title="No Inspections Match"
			/>
		);
	}
	return (
		<ListEmpty
			description="Inspections show here as crews record them."
			icon={InspectionIcon}
			title="No Inspections Yet"
		/>
	);
}

function InspectionsTable({
	rows,
	typeNameById,
}: {
	readonly rows: readonly InspectionListing[];
	readonly typeNameById: ReadonlyMap<string, string>;
}) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Date</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Habitat Type</TableHead>
						<TableHead>Inspector</TableHead>
						<TableHead>Water</TableHead>
						<TableHead>Density</TableHead>
						<TableHead className="text-right">Dips</TableHead>
						<TableHead>Life Stages</TableHead>
						<TableHead className="text-right">Larvae</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<InspectionRow key={row.id} row={row} typeNameById={typeNameById} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/**
 * The Habitat's type, or what to say instead. A type id the catalog has not
 * loaded is worth saying rather than showing nothing; no type at all is absent.
 */
function typeLabel(
	row: InspectionListing,
	typeNameById: ReadonlyMap<string, string>,
): string | null {
	if (row.habitatTypeId === null) {
		return null;
	}
	return typeNameById.get(row.habitatTypeId) ?? 'Unknown type';
}

function InspectionRow({
	row,
	typeNameById,
}: {
	readonly row: InspectionListing;
	readonly typeNameById: ReadonlyMap<string, string>;
}) {
	const when = formatListDate(row.inspectionDate);
	const label = habitatLabel(row, {
		addressName: row.addressDisplayName,
		fallback: 'One-off inspection',
	});
	return (
		<LinkedTableRow
			action={
				<Button
					aria-label={`View the ${when} inspection of ${label}`}
					asChild
					size="icon-sm"
					variant="ghost"
				>
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/larval-surveillance/inspections/table' }}
						to="/larval-surveillance/inspections/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="tabular-nums">{when}</TableCell>
			<TableCell className="max-w-[22rem] truncate font-medium" title={label}>
				{label}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{typeLabel(row, typeNameById) ?? <AbsentValue />}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.inspectedByName ?? <AbsentValue />}
			</TableCell>
			<TableCell>
				<WetnessBadge isWet={row.isWet} />
			</TableCell>
			<TableCell>
				<DensityBadge density={row.density} />
			</TableCell>
			<TableCell className="text-right tabular-nums">{row.dipCount ?? <AbsentValue />}</TableCell>
			<TableCell>
				<LifeStageStrip size="sm" stages={row} />
			</TableCell>
			<TableCell className="text-right tabular-nums">
				{row.larvaeCount ?? <AbsentValue />}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function InspectionsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Inspections could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

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
import { formatAmount } from '../../../components/control-operations/control-display';
import { SourceReductionFilterFields } from '../../../components/control-operations/source-reduction/source-reduction-filters';
import {
	linkedHabitatIds,
	type SourceReductionListRow,
	sourceReductionMethodName,
	sourceReductionTechnicianName,
} from '../../../components/control-operations/source-reduction/source-reduction-row-parts';
import { SourceReductionSurfaceSwitch } from '../../../components/control-operations/source-reduction/source-reduction-surface-switch';
import {
	SOURCE_REDUCTION_WINDOW_DAYS,
	sharedSourceReductionSearch,
	sourceReductionFilterCodecs,
	sourceReductionListParams,
	sourceReductionTileFilters,
} from '../../../components/control-operations/source-reduction/source-reductions-search';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import { useSourceReductionFilterState } from '../../../hooks/control-operations/use-source-reduction-filter-state';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useSourceReductionMethodOptions } from '../../../hooks/explorer/use-source-reduction-method-options';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/source-reduction/table')({
	component: SourceReductionsTableRoute,
	validateSearch: searchValidator(sourceReductionFilterCodecs),
});

const SourceReductionIcon = iconRegistry.entities.sourceReduction.icon;

/**
 * The Source Reductions in the date window as a table, newest first, narrowed
 * by the same filters as the Source Reductions Map. It sends the Map's own
 * `/map/source-reduction` request under a box around the whole world, so the
 * two surfaces list one set.
 */
function SourceReductionsTableRoute() {
	const binding = useSourceReductionFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedSourceReductionSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...sourceReductionListParams(sourceReductionTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<SourceReductionListRow>({
			path: '/map/source-reduction',
			rowsKey: 'sourceReductions',
			recordType: 'sourceReduction',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<SourceReductionSurfaceSwitch current="table" search={carried} />}
				description="Source reductions in the date window, newest first."
				icon={SourceReductionIcon}
				title={recordNoun('sourceReduction').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<SourceReductionFilterFields binding={binding} wide />
			</div>
			{isError ? <SourceReductionsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
				/>
			) : (
				<div className="grid gap-3">
					<SourceReductionsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('sourceReduction')}
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
 * Waiting, failed, filtered to nothing, or genuinely empty. A failure has its
 * own strip above, so here it draws nothing rather than a second one.
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
				description="No source reduction matches what is set above."
				icon={SourceReductionIcon}
				title="No Source Reductions Match"
			/>
		);
	}
	return (
		<ListEmpty
			description={`Source reductions made in the last ${SOURCE_REDUCTION_WINDOW_DAYS} days show here.`}
			icon={SourceReductionIcon}
			title={`No Source Reductions in the Last ${SOURCE_REDUCTION_WINDOW_DAYS} Days`}
		/>
	);
}

function SourceReductionsTable({ rows }: { readonly rows: readonly SourceReductionListRow[] }) {
	const { nameById: methodNameById } = useSourceReductionMethodOptions();
	const { nameById: personNameById } = usePersonnelOptions();
	const unitById = useUnitLabels().byId;
	// `habitats` syncs on demand, so resolve only the referenced ids.
	const habitatNameById = useHabitatNames(linkedHabitatIds(rows));
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Method</TableHead>
						<TableHead>Date</TableHead>
						<TableHead className="text-right">Sources Eliminated</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Technician</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<SourceReductionTableRow
							amount={formatAmount(
								row.sourcesEliminatedAmount,
								unitById.get(row.sourcesEliminatedUnitId),
							)}
							habitatName={
								row.habitatId === null ? null : (habitatNameById.get(row.habitatId) ?? null)
							}
							key={row.id}
							methodName={sourceReductionMethodName(row, methodNameById)}
							row={row}
							technicianName={sourceReductionTechnicianName(row, personNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SourceReductionTableRow({
	row,
	methodName,
	amount,
	habitatName,
	technicianName,
}: {
	readonly row: SourceReductionListRow;
	readonly methodName: string;
	readonly amount: string;
	readonly habitatName: string | null;
	readonly technicianName: string | null;
}) {
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${methodName}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/control-operations/source-reduction/table' }}
						to="/control-operations/source-reduction/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={methodName}>
				{methodName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.sourceReductionDate)}</TableCell>
			<TableCell className="text-right tabular-nums">{amount}</TableCell>
			<TableCell className="text-muted-foreground">
				{habitatName === null ? <AbsentValue /> : habitatName}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{technicianName === null ? <AbsentValue /> : technicianName}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function SourceReductionsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Source reductions could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

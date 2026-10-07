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
import {
	BIOCONTROL_WINDOW_DAYS,
	biocontrolFilterCodecs,
	biocontrolListParams,
	biocontrolTileFilters,
	sharedBiocontrolSearch,
} from '../../../components/control-operations/biocontrol/biocontrol-actions-search';
import { BiocontrolFilterFields } from '../../../components/control-operations/biocontrol/biocontrol-filters';
import {
	type BiocontrolListRow,
	biocontrolMethodName,
	biocontrolTechnicianName,
	linkedHabitatIds,
} from '../../../components/control-operations/biocontrol/biocontrol-row-parts';
import { BiocontrolSurfaceSwitch } from '../../../components/control-operations/biocontrol/biocontrol-surface-switch';
import { formatAmount } from '../../../components/control-operations/control-display';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import { useBiocontrolFilterState } from '../../../hooks/control-operations/use-biocontrol-filter-state';
import { useBiocontrolMethodOptions } from '../../../hooks/explorer/use-biocontrol-method-options';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/biocontrol/table')({
	component: BiocontrolActionsTableRoute,
	validateSearch: searchValidator(biocontrolFilterCodecs),
});

const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;

/**
 * The Biocontrol Actions in the date window as a table, newest first, narrowed
 * by the same filters as the Biocontrol Actions Map. It sends the Map's own
 * `/map/biocontrol` request under a box around the whole world, so the two
 * surfaces list one set.
 */
function BiocontrolActionsTableRoute() {
	const binding = useBiocontrolFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedBiocontrolSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...biocontrolListParams(biocontrolTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<BiocontrolListRow>({
			path: '/map/biocontrol',
			rowsKey: 'biocontrolActions',
			recordType: 'biocontrolAction',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<BiocontrolSurfaceSwitch current="table" search={carried} />}
				description="Biocontrol actions in the date window, newest first."
				icon={BiocontrolIcon}
				title={recordNoun('biocontrolAction').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<BiocontrolFilterFields binding={binding} wide />
			</div>
			{isError ? <BiocontrolActionsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
				/>
			) : (
				<div className="grid gap-3">
					<BiocontrolActionsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('biocontrolAction')}
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
				description="No biocontrol action matches what is set above."
				icon={BiocontrolIcon}
				title="No Biocontrol Actions Match"
			/>
		);
	}
	return (
		<ListEmpty
			description={`Biocontrol actions made in the last ${BIOCONTROL_WINDOW_DAYS} days show here.`}
			icon={BiocontrolIcon}
			title={`No Biocontrol Actions in the Last ${BIOCONTROL_WINDOW_DAYS} Days`}
		/>
	);
}

function BiocontrolActionsTable({ rows }: { readonly rows: readonly BiocontrolListRow[] }) {
	const { nameById: methodNameById } = useBiocontrolMethodOptions();
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
						<TableHead className="text-right">Amount Released</TableHead>
						<TableHead>Habitat</TableHead>
						<TableHead>Technician</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<BiocontrolTableRow
							amount={formatAmount(row.amountReleased, unitById.get(row.releaseUnitId))}
							habitatName={
								row.habitatId === null ? null : (habitatNameById.get(row.habitatId) ?? null)
							}
							key={row.id}
							methodName={biocontrolMethodName(row, methodNameById)}
							row={row}
							technicianName={biocontrolTechnicianName(row, personNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function BiocontrolTableRow({
	row,
	methodName,
	amount,
	habitatName,
	technicianName,
}: {
	readonly row: BiocontrolListRow;
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
						state={{ breadcrumbVia: '/control-operations/biocontrol/table' }}
						to="/control-operations/biocontrol/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={methodName}>
				{methodName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.biocontrolDate)}</TableCell>
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
function BiocontrolActionsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Biocontrol actions could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

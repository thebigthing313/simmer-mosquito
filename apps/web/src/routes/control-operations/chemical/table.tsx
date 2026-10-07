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
import { ApplicationFilterFields } from '../../../components/control-operations/chemical/application-filters';
import {
	type ApplicationListRow,
	applicationMethodName,
	insecticideName,
	normalizeApplication,
} from '../../../components/control-operations/chemical/application-row-parts';
import { ApplicationSurfaceSwitch } from '../../../components/control-operations/chemical/application-surface-switch';
import {
	APPLICATION_WINDOW_DAYS,
	applicationFilterCodecs,
	applicationListParams,
	applicationTileFilters,
	sharedApplicationSearch,
} from '../../../components/control-operations/chemical/applications-search';
import { formatAmount } from '../../../components/control-operations/control-display';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import { useApplicationFilterState } from '../../../hooks/control-operations/use-application-filter-state';
import { useApplicationMethodOptions } from '../../../hooks/explorer/use-application-method-options';
import { useInsecticideOptions } from '../../../hooks/explorer/use-insecticide-options';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/chemical/table')({
	component: ApplicationsTableRoute,
	validateSearch: searchValidator(applicationFilterCodecs),
});

const ApplicationIcon = iconRegistry.entities.application.icon;

/**
 * The Chemical Applications in the date window as a table, newest first,
 * narrowed by the same filters as the Chemical Applications Map. It sends the
 * Map's own `/map/chemical` request under a box around the whole world, so the
 * two surfaces list one set.
 */
function ApplicationsTableRoute() {
	const binding = useApplicationFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedApplicationSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...applicationListParams(applicationTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<ApplicationListRow>({
			path: '/map/chemical',
			rowsKey: 'applications',
			recordType: 'application',
			params,
			normalizeRow: normalizeApplication,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<ApplicationSurfaceSwitch current="table" search={carried} />}
				description="Chemical applications in the date window, newest first."
				icon={ApplicationIcon}
				title={recordNoun('application').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<ApplicationFilterFields binding={binding} wide />
			</div>
			{isError ? <ApplicationsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
				/>
			) : (
				<div className="grid gap-3">
					<ApplicationsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('application')}
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
				description="No chemical application matches what is set above."
				icon={ApplicationIcon}
				title="No Chemical Applications Match"
			/>
		);
	}
	return (
		<ListEmpty
			description={`Chemical applications made in the last ${APPLICATION_WINDOW_DAYS} days show here.`}
			icon={ApplicationIcon}
			title={`No Chemical Applications in the Last ${APPLICATION_WINDOW_DAYS} Days`}
		/>
	);
}

function ApplicationsTable({ rows }: { readonly rows: readonly ApplicationListRow[] }) {
	const { nameById: insecticideNameById } = useInsecticideOptions();
	const { nameById: methodNameById } = useApplicationMethodOptions();
	const unitById = useUnitLabels().byId;
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Insecticide</TableHead>
						<TableHead>Date</TableHead>
						<TableHead className="text-right">Amount</TableHead>
						<TableHead>Method</TableHead>
						<TableHead>Applicator</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<ApplicationTableRow
							amount={formatAmount(row.amountApplied, unitById.get(row.applicationUnitId))}
							key={row.id}
							methodName={applicationMethodName(row, methodNameById)}
							productName={insecticideName(row.insecticideId, insecticideNameById)}
							row={row}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ApplicationTableRow({
	row,
	productName,
	amount,
	methodName,
}: {
	readonly row: ApplicationListRow;
	readonly productName: string;
	readonly amount: string;
	readonly methodName: string | null;
}) {
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${productName}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/control-operations/chemical/table' }}
						to="/control-operations/chemical/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={productName}>
				{productName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.applicationDate)}</TableCell>
			<TableCell className="text-right tabular-nums">{amount}</TableCell>
			<TableCell className="text-muted-foreground">
				{methodName === null ? <AbsentValue /> : methodName}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.applicatorName === null ? <AbsentValue /> : row.applicatorName}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function ApplicationsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Chemical applications could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

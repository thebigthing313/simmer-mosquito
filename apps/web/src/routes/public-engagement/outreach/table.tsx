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
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	OUTREACH_WINDOW_DAYS,
	outreachFilterCodecs,
	outreachListParams,
	outreachTileFilters,
	sharedOutreachSearch,
} from '../../../components/public-engagement/outreach/outreach-actions-search';
import { OutreachFilterFields } from '../../../components/public-engagement/outreach/outreach-filters';
import {
	type OutreachListRow,
	outreachMethodName,
	outreachTechnicianName,
} from '../../../components/public-engagement/outreach/outreach-row-parts';
import { OutreachSurfaceSwitch } from '../../../components/public-engagement/outreach/outreach-surface-switch';
import { formatReach } from '../../../components/public-engagement/public-engagement-display';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import { useOutreachMethodOptions } from '../../../hooks/explorer/use-outreach-method-options';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useOutreachFilterState } from '../../../hooks/public-engagement/use-outreach-filter-state';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/public-engagement/outreach/table')({
	component: OutreachActionsTableRoute,
	validateSearch: searchValidator(outreachFilterCodecs),
});

const OutreachIcon = iconRegistry.entities.outreachAction.icon;

/**
 * The Outreach Actions in the date window as a table, newest first, narrowed
 * by the same filters as the Outreach Actions Map. It sends the Map's own
 * `/map/outreach` request under a box around the whole world, so the two
 * surfaces list one set.
 */
function OutreachActionsTableRoute() {
	const binding = useOutreachFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedOutreachSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...outreachListParams(outreachTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<OutreachListRow>({
			path: '/map/outreach',
			rowsKey: 'outreachActions',
			recordType: 'outreachAction',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<OutreachSurfaceSwitch current="table" search={carried} />}
				description="Outreach actions in the date window, newest first."
				icon={OutreachIcon}
				title={recordNoun('outreachAction').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<OutreachFilterFields binding={binding} wide />
			</div>
			{isError ? <OutreachActionsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
				/>
			) : (
				<div className="grid gap-3">
					<OutreachActionsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('outreachAction')}
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
				description="No outreach action matches what is set above."
				icon={OutreachIcon}
				title="No Outreach Actions Match"
			/>
		);
	}
	return (
		<ListEmpty
			description={`Outreach actions made in the last ${OUTREACH_WINDOW_DAYS} days show here.`}
			icon={OutreachIcon}
			title={`No Outreach Actions in the Last ${OUTREACH_WINDOW_DAYS} Days`}
		/>
	);
}

function OutreachActionsTable({ rows }: { readonly rows: readonly OutreachListRow[] }) {
	const { nameById: methodNameById } = useOutreachMethodOptions();
	const { nameById: personNameById } = usePersonnelOptions();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Method</TableHead>
						<TableHead>Date</TableHead>
						<TableHead className="text-right">Reach</TableHead>
						<TableHead>Technician</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<OutreachTableRow
							key={row.id}
							methodName={outreachMethodName(row, methodNameById)}
							row={row}
							technicianName={outreachTechnicianName(row, personNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function OutreachTableRow({
	row,
	methodName,
	technicianName,
}: {
	readonly row: OutreachListRow;
	readonly methodName: string;
	readonly technicianName: string | null;
}) {
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${methodName}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/public-engagement/outreach/table' }}
						to="/public-engagement/outreach/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={methodName}>
				{methodName}
			</TableCell>
			<TableCell className="tabular-nums">{formatListDate(row.outreachDate)}</TableCell>
			<TableCell className="text-right tabular-nums">{formatReach(row.reach)}</TableCell>
			<TableCell className="text-muted-foreground">
				{technicianName === null ? <AbsentValue /> : technicianName}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function OutreachActionsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Outreach actions could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

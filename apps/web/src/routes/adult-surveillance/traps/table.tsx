import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { ListEmpty, ListLoading, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	CheckCircle2Icon,
	ChevronRightIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { TRAP_STATUS_LABELS } from '../../../components/adult-surveillance/traps/legend';
import { TrapFilterFields } from '../../../components/adult-surveillance/traps/trap-filters';
import { TrapSurfaceSwitch } from '../../../components/adult-surveillance/traps/trap-surface-switch';
import {
	sharedTrapSearch,
	trapFilterCodecs,
	trapListParams,
	trapTileFilters,
} from '../../../components/adult-surveillance/traps/traps-search';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { ClampedTextCell, LinkedTableRow } from '../../../components/record/linked-table-row';
import { useTrapFilterState } from '../../../hooks/adult-surveillance/use-trap-filter-state';
import { useCollectionMethodOptions } from '../../../hooks/explorer/use-collection-method-options';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { trapDisplayName } from '../../../hooks/queries/trap-view';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/adult-surveillance/traps/table')({
	component: TrapsTableRoute,
	validateSearch: searchValidator(trapFilterCodecs),
});

const TrapIcon = iconRegistry.entities.trap.icon;

/** One Trap as `/map/traps` answers it, cut to what the table draws. */
interface TrapTableRow {
	readonly id: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly collectionMethodId: string;
	readonly description: string | null;
	readonly isActive: boolean;
}

/**
 * Every Trap as a table, by code or by name where there is none, narrowed by
 * the same filters as the Traps Map. It sends the Map's own `/map/traps`
 * request under a box around the whole world, so the two surfaces list one
 * set.
 */
function TrapsTableRoute() {
	const binding = useTrapFilterState();
	const { filters, activeCount, clearAll } = binding;
	const carried = sharedTrapSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...trapListParams(trapTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<TrapTableRow>({
			path: '/map/traps',
			rowsKey: 'traps',
			recordType: 'trap',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<TrapSurfaceSwitch current="table" search={carried} />}
				description="Traps by code, or by name where a trap has none."
				icon={TrapIcon}
				title={recordNoun('trap').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<TrapFilterFields binding={binding} wide />
			</div>
			{isError ? <TrapsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={clearAll}
				/>
			) : (
				<div className="grid gap-3">
					<TrapsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('trap')}
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
				description="No trap matches what is set above."
				icon={TrapIcon}
				title="No Traps Match"
			/>
		);
	}
	return (
		<ListEmpty
			description="Active traps show here as crews place them."
			icon={TrapIcon}
			title="No Active Traps"
		/>
	);
}

function TrapsTable({ rows }: { readonly rows: readonly TrapTableRow[] }) {
	const { nameById: methodNameById } = useCollectionMethodOptions();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Name</TableHead>
						<TableHead>Method</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Description</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TrapTableRowView
							key={row.id}
							methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
							row={row}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function TrapTableRowView({
	row,
	methodName,
}: {
	readonly row: TrapTableRow;
	readonly methodName: string;
}) {
	const name = trapDisplayName(row);
	const description = row.description?.trim() ?? '';
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/adult-surveillance/traps/table' }}
						to="/adult-surveillance/traps/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="text-muted-foreground">{methodName}</TableCell>
			<TableCell>
				{row.isActive ? (
					<Badge tone="success" variant="outline">
						<CheckCircle2Icon aria-hidden="true" />
						{TRAP_STATUS_LABELS.active}
					</Badge>
				) : (
					<Badge tone="neutral" variant="outline">
						{TRAP_STATUS_LABELS.inactive}
					</Badge>
				)}
			</TableCell>
			<ClampedTextCell empty={<AbsentValue />} text={description} />
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function TrapsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Traps could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

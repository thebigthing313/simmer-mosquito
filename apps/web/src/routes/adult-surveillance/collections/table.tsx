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
import { collectionEffectiveDate } from '../../../components/adult-surveillance/adult-display';
import { CollectionFilterFields } from '../../../components/adult-surveillance/collections/collection-filters';
import {
	type CollectionListRow,
	collectionPersonnelName,
	collectionRowLabel,
	collectionSwatch,
} from '../../../components/adult-surveillance/collections/collection-row-parts';
import { CollectionSurfaceSwitch } from '../../../components/adult-surveillance/collections/collection-surface-switch';
import {
	COLLECTION_WINDOW_DAYS,
	collectionFilterCodecs,
	collectionListParams,
	collectionTileFilters,
	sharedCollectionSearch,
} from '../../../components/adult-surveillance/collections/collections-search';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { LinkedTableRow } from '../../../components/record/linked-table-row';
import { useCollectionFilterState } from '../../../hooks/adult-surveillance/use-collection-filter-state';
import { useCollectionMethodOptions } from '../../../hooks/explorer/use-collection-method-options';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useTrapNames } from '../../../hooks/queries/use-trap-names';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/adult-surveillance/collections/table')({
	component: CollectionsTableRoute,
	validateSearch: searchValidator(collectionFilterCodecs),
});

const CollectionIcon = iconRegistry.entities.collection.icon;

/**
 * The Collections in the date window as a table, newest first, narrowed by the
 * same filters as the Collections Map. It sends the Map's own `/map/collections` request under
 * a box around the whole world, so the two surfaces list one set.
 */
function CollectionsTableRoute() {
	const binding = useCollectionFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedCollectionSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...collectionListParams(collectionTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<CollectionListRow>({
			path: '/map/collections',
			rowsKey: 'collections',
			recordType: 'collection',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<CollectionSurfaceSwitch current="table" search={carried} />}
				description="Collections in the date window, newest first."
				icon={CollectionIcon}
				title={recordNoun('collection').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<CollectionFilterFields binding={binding} wide />
			</div>
			{isError ? <CollectionsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
				/>
			) : (
				<div className="grid gap-3">
					<CollectionsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('collection')}
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
				description="No collection matches what is set above."
				icon={CollectionIcon}
				title="No Collections Match"
			/>
		);
	}
	return (
		<ListEmpty
			description={`Collections made in the last ${COLLECTION_WINDOW_DAYS} days show here.`}
			icon={CollectionIcon}
			title={`No Collections in the Last ${COLLECTION_WINDOW_DAYS} Days`}
		/>
	);
}

function CollectionsTable({ rows }: { readonly rows: readonly CollectionListRow[] }) {
	const { nameById: methodNameById } = useCollectionMethodOptions();
	const trapNameById = useTrapNames();
	const personnel = usePersonnelOptions();
	const timeZone = useOrganizationTimeZone();
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Collection</TableHead>
						<TableHead>Date</TableHead>
						<TableHead>Method</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Handled By</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<CollectionTableRow
							effectiveDate={collectionEffectiveDate(row, timeZone)}
							key={row.id}
							label={collectionRowLabel(row, trapNameById)}
							methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
							personnelName={collectionPersonnelName(row, personnel.nameById)}
							row={row}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function CollectionTableRow({
	row,
	label,
	effectiveDate,
	methodName,
	personnelName,
}: {
	readonly row: CollectionListRow;
	readonly label: string;
	readonly effectiveDate: string | null;
	readonly methodName: string;
	readonly personnelName: string | null;
}) {
	const swatch = collectionSwatch(row.status);
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${label}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/adult-surveillance/collections/table' }}
						to="/adult-surveillance/collections/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={label}>
				{label}
			</TableCell>
			<TableCell className="tabular-nums">
				{effectiveDate === null ? <AbsentValue /> : formatListDate(effectiveDate)}
			</TableCell>
			<TableCell className="text-muted-foreground">{methodName}</TableCell>
			<TableCell>
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
						style={{ backgroundColor: swatch.color }}
					/>
					{swatch.label}
				</span>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{personnelName === null ? <AbsentValue /> : personnelName}
			</TableCell>
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function CollectionsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Collections could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

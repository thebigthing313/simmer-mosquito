import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { CollectionFilterFields } from '../../../components/adult-surveillance/collections/collection-filters';
import type { CollectionListRow } from '../../../components/adult-surveillance/collections/collection-row-parts';
import { CollectionSurfaceSwitch } from '../../../components/adult-surveillance/collections/collection-surface-switch';
import {
	COLLECTION_WINDOW_DAYS,
	collectionFilterCodecs,
	collectionListParams,
	collectionTileFilters,
	sharedCollectionSearch,
} from '../../../components/adult-surveillance/collections/collections-search';
import { CollectionsTable } from '../../../components/adult-surveillance/collections/collections-table';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import { useCollectionFilterState } from '../../../hooks/adult-surveillance/use-collection-filter-state';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
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
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="collection" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription={`Collections made in the last ${COLLECTION_WINDOW_DAYS} days show here.`}
					filteredDescription="No collection matches what is set above."
					icon={CollectionIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
					recordType="collection"
					scope={{ kind: 'lastDays', days: COLLECTION_WINDOW_DAYS }}
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

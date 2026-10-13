import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { CollectionFilterFields } from '../../../components/adult-surveillance/collections/collection-filters';
import type { CollectionListRow } from '../../../components/adult-surveillance/collections/collection-row-parts';
import { collectionRecordSet } from '../../../components/adult-surveillance/collections/collections-search';
import { CollectionsTable } from '../../../components/adult-surveillance/collections/collections-table';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/adult-surveillance/collections/table')({
	component: CollectionsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(collectionRecordSet, 'table')),
});

const CollectionIcon = iconRegistry.entities.collection.icon;

/**
 * Every Collection as a table, newest first, narrowed by the same filters as
 * the Collections Map. It opens on all time where the Map opens on a window,
 * which the set's `windows` state.
 */
function CollectionsTableRoute() {
	const binding = useRecordSetFilters(collectionRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Every collection, newest first."
			empty={{
				emptyDescription: 'Collections show here as crews record them.',
				filteredDescription: 'No collection matches what is set above.',
			}}
			filters={<CollectionFilterFields binding={binding} wide />}
			icon={CollectionIcon}
			search={search}
			set={collectionRecordSet}
			table={(rows: readonly CollectionListRow[]) => <CollectionsTable rows={rows} />}
		/>
	);
}

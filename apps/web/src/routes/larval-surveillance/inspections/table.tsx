import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { inspectionFilterBinding } from '../../../components/larval-surveillance/inspection-filters';
import type { InspectionListing } from '../../../components/larval-surveillance/inspection-listing';
import { InspectionsFilterBar } from '../../../components/larval-surveillance/inspections-filter-bar';
import { inspectionRecordSet } from '../../../components/larval-surveillance/inspections-search';
import { InspectionsTable } from '../../../components/larval-surveillance/inspections-table';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { useInspectionCatalogs } from '../../../hooks/larval-surveillance/use-inspection-catalogs';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/inspections/table')({
	component: InspectionsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(inspectionRecordSet, 'table')),
});

const InspectionIcon = iconRegistry.entities.inspection.icon;

/**
 * Every inspection as a table, newest first, a hundred to a page, narrowed by
 * six of the Inspections Map's seven filters. Region is the Map's alone, and
 * the Table opens on all time where the Map opens on the last 30 days, which
 * `inspectionRecordSet` states.
 */
function InspectionsTableRoute() {
	const binding = useRecordSetFilters(inspectionRecordSet, 'table');
	const catalogs = useInspectionCatalogs();
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			empty={{
				emptyDescription: 'Inspections show here as crews record them.',
				filteredDescription: 'Nothing recorded matches what is set above.',
				scope: { kind: 'yet' },
			}}
			filters={
				<InspectionsFilterBar binding={inspectionFilterBinding(binding)} catalogs={catalogs} />
			}
			icon={InspectionIcon}
			search={search}
			set={inspectionRecordSet}
			table={(rows: readonly InspectionListing[]) => (
				<InspectionsTable rows={rows} typeNameById={catalogs.typeNameById} />
			)}
		/>
	);
}

import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationFilterFields } from '../../../components/control-operations/chemical/application-filters';
import {
	normalizeTreatment,
	type TreatmentListRow,
} from '../../../components/control-operations/chemical/application-row-parts';
import { applicationRecordSet } from '../../../components/control-operations/chemical/applications-search';
import { ApplicationsTable } from '../../../components/control-operations/chemical/applications-table';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/chemical/table')({
	component: ApplicationsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(applicationRecordSet, 'table')),
});

const ApplicationIcon = iconRegistry.entities.application.icon;

/**
 * Every Treatment as a table, newest first, one row per Treatment, narrowed by
 * the same filters as the Chemical Map. It opens on all time where the Map
 * opens on a window, which the set's `windows` state.
 */
function ApplicationsTableRoute() {
	const binding = useRecordSetFilters(applicationRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description={`Every ${recordNoun('treatment').one}, newest first.`}
			empty={{
				emptyDescription: `${recordNoun('treatment').titleMany} show here as crews record them.`,
				filteredDescription: `No ${recordNoun('treatment').one} matches what is set above.`,
			}}
			filters={<ApplicationFilterFields binding={binding} wide />}
			icon={ApplicationIcon}
			normalizeRow={normalizeTreatment}
			search={search}
			set={applicationRecordSet}
			table={(rows: readonly TreatmentListRow[]) => <ApplicationsTable rows={rows} />}
		/>
	);
}

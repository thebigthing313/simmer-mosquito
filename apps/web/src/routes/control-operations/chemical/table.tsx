import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { ApplicationFilterFields } from '../../../components/control-operations/chemical/application-filters';
import {
	type ApplicationListRow,
	normalizeApplication,
} from '../../../components/control-operations/chemical/application-row-parts';
import {
	APPLICATION_WINDOW_DAYS,
	applicationRecordSet,
} from '../../../components/control-operations/chemical/applications-search';
import { ApplicationsTable } from '../../../components/control-operations/chemical/applications-table';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/chemical/table')({
	component: ApplicationsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(applicationRecordSet, 'table')),
});

const ApplicationIcon = iconRegistry.entities.application.icon;

/**
 * The Chemical Applications in the date window as a table, newest first,
 * narrowed by the same filters as the Chemical Applications Map.
 */
function ApplicationsTableRoute() {
	const binding = useRecordSetFilters(applicationRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Chemical applications in the date window, newest first."
			empty={{
				emptyDescription: `Chemical applications made in the last ${APPLICATION_WINDOW_DAYS} days show here.`,
				filteredDescription: 'No chemical application matches what is set above.',
				scope: { kind: 'lastDays', days: APPLICATION_WINDOW_DAYS },
			}}
			filters={<ApplicationFilterFields binding={binding} wide />}
			icon={ApplicationIcon}
			normalizeRow={normalizeApplication}
			search={search}
			set={applicationRecordSet}
			table={(rows: readonly ApplicationListRow[]) => <ApplicationsTable rows={rows} />}
		/>
	);
}

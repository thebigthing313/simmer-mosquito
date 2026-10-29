import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { outreachRecordSet } from '../../../components/public-engagement/outreach/outreach-actions-search';
import { OutreachActionsTable } from '../../../components/public-engagement/outreach/outreach-actions-table';
import { OutreachFilterFields } from '../../../components/public-engagement/outreach/outreach-filters';
import type { OutreachListRow } from '../../../components/public-engagement/outreach/outreach-row-parts';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/public-engagement/outreach/table')({
	component: OutreachActionsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(outreachRecordSet, 'table')),
});

const OutreachIcon = iconRegistry.entities.outreachAction.icon;

/**
 * Every Outreach Action as a table, newest first, narrowed by the same filters
 * as the Outreach Actions Map. It opens on all time where the Map opens on a
 * window, which the set's `windows` state.
 */
function OutreachActionsTableRoute() {
	const binding = useRecordSetFilters(outreachRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Every outreach action, newest first."
			empty={{
				emptyDescription: 'Outreach actions show here as crews record them.',
				filteredDescription: 'No outreach action matches what is set above.',
			}}
			filters={<OutreachFilterFields binding={binding} wide />}
			icon={OutreachIcon}
			search={search}
			set={outreachRecordSet}
			table={(rows: readonly OutreachListRow[]) => <OutreachActionsTable rows={rows} />}
		/>
	);
}

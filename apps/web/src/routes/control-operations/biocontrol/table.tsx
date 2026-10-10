import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import {
	BIOCONTROL_WINDOW_DAYS,
	biocontrolRecordSet,
} from '../../../components/control-operations/biocontrol/biocontrol-actions-search';
import { BiocontrolActionsTable } from '../../../components/control-operations/biocontrol/biocontrol-actions-table';
import { BiocontrolFilterFields } from '../../../components/control-operations/biocontrol/biocontrol-filters';
import type { BiocontrolListRow } from '../../../components/control-operations/biocontrol/biocontrol-row-parts';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/biocontrol/table')({
	component: BiocontrolActionsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(biocontrolRecordSet, 'table')),
});

const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;

/**
 * The Biocontrol Actions in the date window as a table, newest first, narrowed
 * by the same filters as the Biocontrol Actions Map.
 */
function BiocontrolActionsTableRoute() {
	const binding = useRecordSetFilters(biocontrolRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Biocontrol actions in the date window, newest first."
			empty={{
				emptyDescription: `Biocontrol actions made in the last ${BIOCONTROL_WINDOW_DAYS} days show here.`,
				filteredDescription: 'No biocontrol action matches what is set above.',
				scope: { kind: 'lastDays', days: BIOCONTROL_WINDOW_DAYS },
			}}
			filters={<BiocontrolFilterFields binding={binding} wide />}
			icon={BiocontrolIcon}
			search={search}
			set={biocontrolRecordSet}
			table={(rows: readonly BiocontrolListRow[]) => <BiocontrolActionsTable rows={rows} />}
		/>
	);
}

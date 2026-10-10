import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { SampleFilterFields } from '../../../components/larval-surveillance/samples/sample-filters';
import type { SampleListRow } from '../../../components/larval-surveillance/samples/sample-row-parts';
import { SamplesTable } from '../../../components/larval-surveillance/samples/samples-table';
import {
	SAMPLE_WINDOW_DAYS,
	sampleRecordSet,
} from '../../../components/larval-surveillance/samples-search';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/samples/table')({
	component: SamplesTableRoute,
	validateSearch: searchValidator(surfaceCodecs(sampleRecordSet, 'table')),
});

const SampleIcon = iconRegistry.entities.sample.icon;

/**
 * Every Sample as a table, newest inspection first, narrowed by the same
 * filters as the Samples Map. `docs/web-components.md`, under "The record
 * tables", says why it reads the Map's endpoint rather than the `samples`
 * collection.
 */
function SamplesTableRoute() {
	const binding = useRecordSetFilters(sampleRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Every sample taken, newest inspection first."
			empty={{
				emptyDescription: `Samples taken in the last ${SAMPLE_WINDOW_DAYS} days show here.`,
				filteredDescription: 'No sample matches what is set above.',
				scope: { kind: 'lastDays', days: SAMPLE_WINDOW_DAYS },
			}}
			filters={<SampleFilterFields binding={binding} wide />}
			icon={SampleIcon}
			search={search}
			set={sampleRecordSet}
			table={(rows: readonly SampleListRow[]) => <SamplesTable rows={rows} />}
		/>
	);
}

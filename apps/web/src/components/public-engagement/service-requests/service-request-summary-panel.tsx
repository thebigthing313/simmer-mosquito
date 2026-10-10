/**
 * The Service Requests map's in-view summary: the active filter chips, then
 * the groupings `serviceRequestSummaryGroupings` builds out of the last
 * summary that answered. Takes the summary request's state, the Map's binding
 * from `useRecordSetFilters`, and the Tag names.
 */

import type { ExplorerSummaryState } from '../../../hooks/explorer/use-explorer-summary';
import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { DeclaredFilterChips } from '../../explorer/declared-filters';
import { ExplorerSummary } from '../../explorer/explorer-summary';
import { serviceRequestFilterDeclarations } from './service-request-filters';
import { serviceRequestSummaryGroupings } from './service-request-summary';
import type { ServiceRequestFilters } from './service-requests-search';

export function ServiceRequestSummaryPanel({
	state,
	binding,
	tagNameById,
}: {
	readonly state: ExplorerSummaryState;
	readonly binding: RecordSetFilterBinding<ServiceRequestFilters>;
	readonly tagNameById: ReadonlyMap<string, string>;
}) {
	return (
		<ExplorerSummary
			chips={
				<DeclaredFilterChips binding={binding} declarations={serviceRequestFilterDeclarations} />
			}
			groupings={
				state.data === null
					? []
					: serviceRequestSummaryGroupings({
							summary: state.data,
							filters: binding.filters,
							setFilters: binding.setFilters,
							tagNameById,
						})
			}
			recordType="serviceRequest"
			state={state}
		/>
	);
}

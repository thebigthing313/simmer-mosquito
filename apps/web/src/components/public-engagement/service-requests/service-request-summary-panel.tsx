/**
 * The Service Requests map's in-view summary: the active filter chips, then
 * the declared Status and Tags groupings and the figures
 * `serviceRequestSummaryFigures` builds, out of the last summary that
 * answered. Takes the summary request's state and the Map's binding from
 * `useRecordSetFilters`.
 */

import type { ExplorerSummaryState } from '../../../hooks/explorer/use-explorer-summary';
import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { DeclaredFilterChips } from '../../explorer/declared-filters';
import { DeclaredSummary } from '../../explorer/declared-summary';
import { serviceRequestFilterDeclarations } from './service-request-filters';
import { serviceRequestSummaryFigures } from './service-request-summary';
import type { ServiceRequestFilters } from './service-requests-search';

export function ServiceRequestSummaryPanel({
	state,
	binding,
}: {
	readonly state: ExplorerSummaryState;
	readonly binding: RecordSetFilterBinding<ServiceRequestFilters>;
}) {
	return (
		<DeclaredSummary
			binding={binding}
			chips={
				<DeclaredFilterChips binding={binding} declarations={serviceRequestFilterDeclarations} />
			}
			declarations={serviceRequestFilterDeclarations}
			figures={serviceRequestSummaryFigures}
			order={['status', 'tags']}
			recordType="serviceRequest"
			state={state}
		/>
	);
}

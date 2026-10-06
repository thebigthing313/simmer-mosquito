/**
 * The Service Requests map's in-view summary: the active filter chips, then
 * the groupings `serviceRequestSummaryGroupings` builds out of the last
 * summary that answered. Takes the summary request's state, the URL's filters
 * and their write, the Tag names, and what the chips read.
 */

import type { ExplorerSummaryState } from '../../../hooks/explorer/use-explorer-summary';
import { ExplorerSummary } from '../../explorer/explorer-summary';
import {
	type ServiceRequestFilterChipProps,
	ServiceRequestFilterChips,
} from './service-request-filters';
import { serviceRequestSummaryGroupings } from './service-request-summary';
import type { ServiceRequestFilters } from './service-requests-search';

export function ServiceRequestSummaryPanel({
	state,
	filters,
	setFilters,
	tagNameById,
	chips,
}: {
	readonly state: ExplorerSummaryState;
	readonly filters: ServiceRequestFilters;
	readonly setFilters: (patch: Partial<ServiceRequestFilters>) => void;
	readonly tagNameById: ReadonlyMap<string, string>;
	readonly chips: ServiceRequestFilterChipProps;
}) {
	return (
		<ExplorerSummary
			chips={chips.activeFilterCount === 0 ? null : <ServiceRequestFilterChips {...chips} />}
			groupings={
				state.data === null
					? []
					: serviceRequestSummaryGroupings({
							summary: state.data,
							filters,
							setFilters,
							tagNameById,
						})
			}
			recordType="serviceRequest"
			state={state}
		/>
	);
}

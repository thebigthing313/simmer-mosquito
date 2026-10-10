import {
	controlTypeLabel,
	formatRequestedAt,
	type RequestListing,
	requestDisplayName,
	requestStatus,
} from '../../../hooks/queries/operations-view';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { ExplorerRow } from '../../explorer';
import { RequestStatusBadge } from '../../request-status-badge';

/** A name from a catalog, for a column that may not point at one. */
function lookup(names: ReadonlyMap<string, string>, id: string | null): string | null {
	return id === null ? null : (names.get(id) ?? null);
}

/**
 * One request in the Requests for Control list: its subject and status, the
 * control type, recommended method and requested date, and who raised it. The
 * row selects the request on the map and its title opens it. Takes the
 * request, the method and profile names, the selected id and the select
 * callback.
 */
export function RequestRow({
	request,
	methodNameById,
	personNameById,
	selectedId,
	onSelect,
}: {
	readonly request: RequestListing;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personNameById: ReadonlyMap<string, string>;
	readonly selectedId: string | null;
	readonly onSelect: (id: string) => void;
}) {
	const isSelected = request.id === selectedId;
	const methodName = lookup(methodNameById, request.recommendedMethodId);
	const requesterName = lookup(personNameById, request.requestedByProfileId);
	const subject = requestDisplayName(request);
	const timeZone = useOrganizationTimeZone();
	const detail = [
		controlTypeLabel(request.controlType),
		methodName,
		formatRequestedAt(request.requestedAt, timeZone),
	]
		.filter((part): part is string => part !== null)
		.join(' · ');

	return (
		<ExplorerRow
			badges={<RequestStatusBadge status={requestStatus(request)} />}
			detailLabel="Open request"
			detailLink={{ to: '/operations/requests-for-control/$id', params: { id: request.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(request.id)}
			personnel={requesterName ?? 'No requester recorded'}
			selectLabel={`Show ${subject} on the map`}
			subtitle={detail}
			title={subject}
			titleLink={{ to: '/operations/requests-for-control/$id', params: { id: request.id } }}
		/>
	);
}

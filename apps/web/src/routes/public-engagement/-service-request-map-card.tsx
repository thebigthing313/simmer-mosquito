import type { ContactRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ContactIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { MapCardAddressById } from '../../components/linked-address';
import { MapCard, MapCardDetail, MapCardEyebrow, MapCardText } from '../../components/map/map-card';
import { TagBadge } from '../../components/tag-badge';
import { useMapCardTags } from '../../hooks/use-map-card-tags';
import { webCollections } from '../../sync/webCollections';
import {
	contactDisplayName,
	isServiceRequestOpen,
	serviceRequestTitle,
} from './-public-engagement-display';
import { RequestStatusBadge } from './-public-engagement-ui';

const gcTimeMs = 30_000;
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The map focus card for a service request. Self-contained: given the request
 * id it resolves the request, its contact + address, and its tags off the
 * on-demand collections (single-id lookups warm the subset), then renders the
 * shared {@link MapCard}. Drop `<ServiceRequestMapCard id onClose />` beside any
 * MapCanvas that plots service requests.
 */
export function ServiceRequestMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const requestResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.id, id))
					.findOne(),
		},
		[id],
	);
	const request = requestResult.data as ServiceRequestRow | undefined;

	const contactId = request?.contactId ?? UNMATCHABLE_ID;
	const contactResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.id, contactId))
					.findOne(),
		},
		[contactId],
	);
	const contact = contactResult.data as ContactRow | undefined;

	const tags = useMapCardTags(id);

	if (request === undefined) {
		return (
			<MapCard className="max-w-[440px]" onClose={onClose} title="Service Request">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const contactLabel = contact === undefined ? null : contactDisplayName(contact);
	const contactLoading = !contactResult.isReady;

	return (
		<MapCard
			badges={
				<>
					<RequestStatusBadge open={isServiceRequestOpen(request)} />
					{tags.map((tag) => (
						<TagBadge key={tag.id} tag={tag} />
					))}
				</>
			}
			className="max-w-[440px]"
			eyebrow={<MapCardEyebrow date={request.requestDate} type="Service request" />}
			onClose={onClose}
			title={serviceRequestTitle(request)}
			viewDetailLink={(content) => (
				<Link params={{ id: request.id }} to="/public-engagement/service-requests/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<MapCardDetail icon={ContactIcon}>
						{contactLabel ?? (
							<span className="italic">{contactLoading ? 'Loading…' : 'No contact'}</span>
						)}
					</MapCardDetail>
					<MapCardAddressById addressId={request.addressId} />
				</div>
				<MapCardText>{request.details}</MapCardText>
			</div>
		</MapCard>
	);
}

import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ContactIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { MapCardAddress } from '../../components/linked-address';
import { MapCard, MapCardDetail, MapCardEyebrow, MapCardText } from '../../components/map/map-card';
import { TagBadge } from '../../components/tag-badge';
import { resolveLinkedContact } from '../../hooks/queries/contact-view';
import { useRecordTags } from '../../hooks/queries/use-record-tags';
import { useServiceRequest } from '../../hooks/queries/use-service-request';
import {
	contactDisplayName,
	isServiceRequestOpen,
	serviceRequestTitle,
} from './-public-engagement-display';
import { RequestStatusBadge } from './-public-engagement-ui';

/**
 * The map focus card for a service request. One query brings the request up with
 * its contact and address already joined ({@link useServiceRequest}); the tags
 * come alongside it, keyed on the same id the card was opened with. Drop
 * `<ServiceRequestMapCard id onClose />` beside any MapCanvas that plots service
 * requests.
 */
export function ServiceRequestMapCard({
	id,
	onClose,
}: {
	readonly id: string;
	readonly onClose: () => void;
}) {
	const { request } = useServiceRequest(id);
	const tags = useRecordTags(id);

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

	// A request always names a contact, so an absent one is the join still in
	// flight rather than a request nobody reported.
	const contact = resolveLinkedContact(request.contact);

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
						{contact === undefined ? (
							<span className="italic">Loading…</span>
						) : (
							contactDisplayName(contact)
						)}
					</MapCardDetail>
					<MapCardAddress address={request.address} addressId={request.addressId} />
				</div>
				<MapCardText>{request.details}</MapCardText>
			</div>
		</MapCard>
	);
}

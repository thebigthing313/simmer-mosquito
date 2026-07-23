import type {
	AddressRow,
	ContactRow,
	ServiceRequestRow,
	TagItemRow,
	TagRow,
} from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ContactIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { MapCard } from '../../components/map/map-card';
import { TagBadge } from '../../components/tag-badge';
import { webCollections } from '../../sync/webCollections';
import {
	contactDisplayName,
	formatAddressLine,
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
	const addressId = request?.addressId ?? UNMATCHABLE_ID;
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
	const addressResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, addressId))
					.findOne(),
		},
		[addressId],
	);
	const address = addressResult.data as AddressRow | undefined;

	const tags = useServiceRequestTags(id);

	if (request === undefined) {
		return (
			<MapCard className="max-w-[440px]" onClose={onClose} title="Service request">
				<div className="grid gap-2">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</div>
			</MapCard>
		);
	}

	const contactLabel = contact === undefined ? null : contactDisplayName(contact);
	const addressLabel =
		address === undefined
			? null
			: formatAddressLine(address).trim() || address.displayName?.trim() || null;
	const detailsLoading = !contactResult.isReady || !addressResult.isReady;

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
			onClose={onClose}
			title={serviceRequestTitle(request)}
			viewDetailLink={(content) => (
				<Link params={{ id: request.id }} to="/public-engagement/service-requests/$id">
					{content}
				</Link>
			)}
		>
			<div className="grid gap-1 text-sm">
				<span className="flex items-start gap-1.5 text-muted-foreground">
					<ContactIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
					<span className={cn('min-w-0', contactLabel === null && 'italic')}>
						{contactLabel ?? (detailsLoading ? 'Loading…' : 'No contact')}
					</span>
				</span>
				{addressLabel === null && !detailsLoading ? null : (
					<span className="flex items-start gap-1.5 text-muted-foreground">
						<MapPinnedIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
						<span className="min-w-0">
							{addressLabel ?? <span className="italic">Loading…</span>}
						</span>
					</span>
				)}
			</div>
			<p className="m-0 mt-3 line-clamp-3 whitespace-pre-wrap border-border/50 border-t pt-2 text-foreground text-sm leading-snug">
				{request.details}
			</p>
		</MapCard>
	);
}

/** The tags assigned to a service request, resolved off the eager catalog. */
function useServiceRequestTags(id: string): readonly TagRow[] {
	const itemsResult = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query.from({ item: webCollections.tagItems }).where(({ item }) => eq(item.entityId, id)),
		},
		[id],
	);
	const catalogResult = useLiveQuery((query) => query.from({ tag: webCollections.tags }), []);

	return useMemo(() => {
		const tagById = new Map((catalogResult.data ?? []).map((tag) => [tag.id, tag as TagRow]));
		return ((itemsResult.data ?? []) as readonly TagItemRow[])
			.flatMap((item) => {
				const tag = tagById.get(item.tagId);
				return tag === undefined ? [] : [tag];
			})
			.sort((first, second) => first.tagName.localeCompare(second.tagName));
	}, [itemsResult.data, catalogResult.data]);
}

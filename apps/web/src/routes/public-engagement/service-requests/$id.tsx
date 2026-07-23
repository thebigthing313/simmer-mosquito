import type { AddressRow, ContactRow, ProfileRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import {
	contactDisplayName,
	formatRequestDate,
	intakeTypeLabel,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../-public-engagement-display';
import { RequestStatusBadge } from '../-public-engagement-ui';
import { settleWrite } from '../-public-engagement-writes';

export const Route = createFileRoute('/public-engagement/service-requests/$id')({
	component: ServiceRequestDetailRoute,
});

const RequestIcon = iconRegistry.domains.publicEngagement.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const detailGcTimeMs = 30_000;

function ServiceRequestDetailRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	const result = useLiveQuery(
		{
			gcTime: detailGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.id, id))
					.findOne(),
		},
		[id],
	);
	const request = result.data as ServiceRequestRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/public-engagement/service-requests"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to service requests
				</Link>
				{!result.isReady ? (
					<ServiceRequestDetailSkeleton />
				) : request === undefined ? (
					<ServiceRequestUnavailable />
				) : (
					<ServiceRequestDetailContent actorProfileId={actorProfileId} request={request} />
				)}
			</div>
		</div>
	);
}

function ServiceRequestDetailContent({
	request,
	actorProfileId,
}: {
	readonly request: ServiceRequestRow;
	readonly actorProfileId: string | null;
}) {
	const title = serviceRequestTitle(request);
	useBreadcrumbLabel(request.id, title);
	const open = isServiceRequestOpen(request);

	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const receivedByName =
		profiles.find((profile) => profile.id === request.receivedByProfileId)?.displayName ?? null;

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<RequestIcon aria-hidden="true" className="size-3.5" />
						Service request
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">{title}</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{intakeTypeLabel(request.intakeType)} · {formatRequestDate(request.requestDate)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<RequestStatusBadge open={open} />
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: request.id }} to="/public-engagement/service-requests/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
					<CloseReopenButton actorProfileId={actorProfileId} open={open} requestId={request.id} />
					<DeleteServiceRequestButton requestId={request.id} />
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<RequestLocationCard point={{ lat: request.lat, lng: request.lng }} />
					<Card variant="surface">
						<CardHeader className="px-4 py-4">
							<CardTitle>Details</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-4" padding="compact">
							<p className="m-0 whitespace-pre-wrap text-foreground text-sm">{request.details}</p>
							<dl className="grid gap-2.5 border-border/50 border-t pt-4">
								<DetailRow label="Intake">{intakeTypeLabel(request.intakeType)}</DetailRow>
								<DetailRow label="Date">{formatRequestDate(request.requestDate)}</DetailRow>
								<DetailRow label="Received by">
									{receivedByName ?? <span className="text-muted-foreground">Unknown</span>}
								</DetailRow>
							</dl>
						</CardContent>
					</Card>
				</div>

				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<RequestPartiesCard addressId={request.addressId} contactId={request.contactId} />
					<CommentsSection
						description="Follow-up, resolution notes, and field context for this request."
						target={{ type: 'serviceRequest', id: request.id }}
					/>
				</div>
			</div>
		</>
	);
}

function RequestLocationCard({
	point,
}: {
	readonly point: { readonly lat: number; readonly lng: number };
}) {
	const handleMapReady = useCallback(
		(map: MapboxMap) => {
			map.setCenter([point.lng, point.lat]);
			map.setZoom(15);
		},
		[point],
	);

	const geoJson = {
		type: 'Feature',
		properties: {},
		geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
	} as GeoJSON.Feature;

	return (
		<Card className="overflow-hidden" variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Location</CardTitle>
				<CardDescription>{`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}</CardDescription>
			</CardHeader>
			<CardContent padding="compact">
				<div className="h-[280px] overflow-hidden rounded-md border border-border/40">
					<MapCanvas
						controls={{ search: false, layers: false, geolocate: false }}
						geoJson={geoJson}
						onMapReady={handleMapReady}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function RequestPartiesCard({
	contactId,
	addressId,
}: {
	readonly contactId: string;
	readonly addressId: string;
}) {
	const contactResult = useLiveQuery(
		{
			gcTime: detailGcTimeMs,
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
			gcTime: detailGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, addressId))
					.findOne(),
		},
		[addressId],
	);
	const address = addressResult.data as AddressRow | undefined;

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Contact & location</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-5" padding="compact">
				<div className="grid gap-2">
					<span className="font-semibold text-muted-foreground text-xs uppercase">Contact</span>
					{contact === undefined ? (
						<span className="text-muted-foreground text-sm">
							{contactResult.isReady ? 'Not available' : 'Loading…'}
						</span>
					) : (
						<>
							<Link
								className="w-fit rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: contact.id }}
								to="/public-engagement/contacts/$id"
							>
								{contactDisplayName(contact)}
							</Link>
							<dl className="grid gap-1.5">
								<PartyRow
									label="Name"
									primary={contactDisplayName(contact)}
									value={contact.contactName}
								/>
								<PartyRow
									label="Company"
									primary={contactDisplayName(contact)}
									value={contact.company}
								/>
								<PartyRow label="Department" value={contact.department} />
								<PartyRow label="Title" value={contact.title} />
								<PartyRow
									label="Preferred"
									primary={contactDisplayName(contact)}
									value={contact.preferredPhone}
								/>
								<PartyRow label="Alternate" value={contact.alternatePhone} />
								<PartyRow
									href={mailtoHref(contact.email)}
									label="Email"
									primary={contactDisplayName(contact)}
									value={contact.email}
								/>
								<PartyRow label="Prefers" value={contactPreferences(contact)} />
							</dl>
						</>
					)}
				</div>
				<div className="grid gap-2">
					<span className="font-semibold text-muted-foreground text-xs uppercase">Address</span>
					{address === undefined ? (
						<span className="text-muted-foreground text-sm">
							{addressResult.isReady ? 'Not available' : 'Loading…'}
						</span>
					) : (
						<>
							<Link
								className="w-fit rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: address.id }}
								to="/gis/addresses/$id"
							>
								{address.displayName}
							</Link>
							<dl className="grid gap-1.5">
								<PartyRow
									label="Street"
									primary={address.displayName}
									value={address.addressLine1}
								/>
								<PartyRow label="Unit" value={address.addressLine2} />
								<PartyRow label="City" value={address.locality} />
								<PartyRow label="State" value={address.region} />
								<PartyRow label="ZIP" value={address.postalCode} />
								<PartyRow
									label="Country"
									value={address.country === 'US' ? null : address.country}
								/>
								<PartyRow label="Coords" value={formatCoords(address.lat, address.lng)} />
							</dl>
						</>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/** A definition row that renders nothing when the value is empty or just repeats the header. */
function PartyRow({
	label,
	value,
	primary,
	href,
}: {
	readonly label: string;
	readonly value: string | null;
	readonly primary?: string;
	/** When set, the value renders as a link (e.g. a mailto for an email). */
	readonly href?: string | undefined;
}) {
	if (value === null || value.trim().length === 0 || value === primary) {
		return null;
	}
	return (
		<div className="grid grid-cols-[84px_1fr] items-baseline gap-2 text-sm">
			<dt className="truncate text-muted-foreground text-xs">{label}</dt>
			<dd className="m-0 min-w-0 break-words text-foreground">
				{href === undefined ? (
					value
				) : (
					<a
						className="rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						href={href}
					>
						{value}
					</a>
				)}
			</dd>
		</div>
	);
}

/** A `mailto:` href for a non-empty email, or undefined so callers can omit the link. */
function mailtoHref(email: string | null): string | undefined {
	const trimmed = email?.trim() ?? '';
	return trimmed.length === 0 ? undefined : `mailto:${trimmed}`;
}

/** The contact's enabled notification channels, or null when none are set. */
function contactPreferences(contact: ContactRow): string | null {
	const channels = [
		contact.wantsEmail ? 'Email' : null,
		contact.wantsSms ? 'SMS' : null,
		contact.wantsPhone ? 'Phone' : null,
	].filter((channel): channel is string => channel !== null);
	return channels.length === 0 ? null : channels.join(' · ');
}

function formatCoords(
	lat: number | null | undefined,
	lng: number | null | undefined,
): string | null {
	if (typeof lat !== 'number' || typeof lng !== 'number') {
		return null;
	}
	return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function CloseReopenButton({
	requestId,
	open,
	actorProfileId,
}: {
	readonly requestId: string;
	readonly open: boolean;
	readonly actorProfileId: string | null;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleToggle = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			await settleWrite(
				webCollections.serviceRequests.update(requestId, (draft) => {
					const writable = draft as {
						-readonly [K in keyof ServiceRequestRow]: ServiceRequestRow[K];
					};
					if (open) {
						writable.closedAt = new Date().toISOString();
						writable.closedByProfileId = actorProfileId;
					} else {
						writable.closedAt = null;
						writable.closedByProfileId = null;
					}
				}),
			);
		} catch (thrown) {
			setError(thrown instanceof Error ? thrown.message : 'Unable to update the request.');
		} finally {
			setBusy(false);
		}
	}, [requestId, open, actorProfileId]);

	return (
		<div className="grid justify-items-end gap-1">
			<Button disabled={busy} onClick={handleToggle} size="sm" variant="outline">
				{open ? 'Close request' : 'Reopen request'}
			</Button>
			{error === null ? null : <span className="text-destructive text-xs">{error}</span>}
		</div>
	);
}

function DeleteServiceRequestButton({ requestId }: { readonly requestId: string }) {
	const navigate = useNavigate();
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDelete = useCallback(async () => {
		setBusy(true);
		setError(null);
		try {
			await settleWrite(webCollections.serviceRequests.delete(requestId));
			await navigate({ to: '/public-engagement/service-requests' });
		} catch (thrown) {
			setError(thrown instanceof Error ? thrown.message : 'Unable to delete the request.');
			setBusy(false);
			setConfirming(false);
		}
	}, [requestId, navigate]);

	if (!confirming) {
		return (
			<Button onClick={() => setConfirming(true)} size="sm" variant="ghost">
				<DeleteIcon aria-hidden="true" />
				Delete
			</Button>
		);
	}

	return (
		<div className="grid justify-items-end gap-1">
			<div className="flex items-center gap-2">
				<span className="text-muted-foreground text-sm">Delete this request?</span>
				<Button disabled={busy} onClick={handleDelete} size="sm" variant="destructive">
					Delete
				</Button>
				<Button disabled={busy} onClick={() => setConfirming(false)} size="sm" variant="ghost">
					Cancel
				</Button>
			</div>
			{error === null ? null : <span className="text-destructive text-xs">{error}</span>}
		</div>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[100px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function ServiceRequestDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-8 w-56" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[360px]" />
					<Skeleton className="h-40" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}

function ServiceRequestUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Service request unavailable</EmptyTitle>
				<EmptyDescription>
					This request could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

import { boundsFromGeoJson, circlePolygon } from '@simmer-mosquito/mapping';
import type { AddressRow, ContactRow, ProfileRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
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
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ArrowLeftIcon,
	ChevronRightIcon,
	iconRegistry,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { CommentsSection } from '../../../components/comments-section';
import { MapCanvas } from '../../../components/map';
import { NEARBY_FAMILY_COLORS } from '../../../components/map/use-nearby-layer';
import { WriteOnly } from '../../../components/write-only';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { HabitatMapCard } from '../../-habitat-map-card';
import { CollectionMapCard } from '../../adult-surveillance/-collection-map-card';
import { TrapMapCard } from '../../adult-surveillance/-trap-map-card';
import { ApplicationMapCard } from '../../control-operations/-application-map-card';
import { BiocontrolMapCard } from '../../control-operations/-biocontrol-map-card';
import { SourceReductionMapCard } from '../../control-operations/-source-reduction-map-card';
import { InspectionMapCard } from '../../larval-surveillance/-inspection-map-card';
import {
	contactDisplayName,
	formatAddressLine,
	formatRequestDate,
	intakeTypeLabel,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../-public-engagement-display';
import { RequestStatusBadge } from '../-public-engagement-ui';
import { settleWrite } from '../-public-engagement-writes';
import {
	buildNearbyMapData,
	describeNearbyItem,
	formatNearbyDistance,
	formatRadiusLabel,
	NEARBY_CATEGORY_LABEL,
	NEARBY_FAMILIES,
	NEARBY_FAMILY_OF,
	type NearbyFamily,
	type NearbyItem,
	type NearbyResponse,
	useNearbyNameById,
	useServiceRequestNearby,
} from './-service-request-nearby';

export const Route = createFileRoute('/public-engagement/service-requests/$id')({
	component: ServiceRequestDetailRoute,
});

const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const detailGcTimeMs = 30_000;
const ALL_FAMILIES: readonly NearbyFamily[] = ['infrastructure', 'surveillance', 'control'];

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

	if (!result.isReady) {
		return <ServiceRequestStatePage>{<ServiceRequestDetailSkeleton />}</ServiceRequestStatePage>;
	}
	if (request === undefined) {
		return <ServiceRequestStatePage>{<ServiceRequestUnavailable />}</ServiceRequestStatePage>;
	}
	return <ServiceRequestDetailContent actorProfileId={actorProfileId} request={request} />;
}

/** Full-height, back-linked frame for the loading / unavailable states. */
function ServiceRequestStatePage({ children }: { readonly children: ReactNode }) {
	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[900px] content-start gap-5 px-4 py-6 md:px-8">
				<BackLink />
				{children}
			</div>
		</div>
	);
}

function BackLink() {
	return (
		<Link
			className="inline-flex w-fit items-center gap-1.5 rounded-sm text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			to="/public-engagement/service-requests"
		>
			<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
			Service Requests
		</Link>
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

	const nearby = useServiceRequestNearby(request.id);
	const nameById = useNearbyNameById();
	const [visibleFamilies, setVisibleFamilies] = useState<ReadonlySet<NearbyFamily>>(
		() => new Set(ALL_FAMILIES),
	);
	const [selectedNearbyId, setSelectedNearbyId] = useState<string | null>(null);

	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const receivedByName =
		profiles.find((profile) => profile.id === request.receivedByProfileId)?.displayName ?? null;

	const toggleFamily = useCallback((family: NearbyFamily) => {
		setVisibleFamilies((prev) => {
			const next = new Set(prev);
			if (next.has(family)) {
				next.delete(family);
			} else {
				next.add(family);
			}
			return next;
		});
	}, []);

	return (
		<MapSplitPage
			map={
				<ContextMap
					onSelect={setSelectedNearbyId}
					request={request}
					response={nearby.data}
					selectedId={selectedNearbyId}
					visibleFamilies={visibleFamilies}
				/>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'snug', padding: 'default' })}>
					<BackLink />
					<div className="flex items-start justify-between gap-2">
						<div className="grid min-w-0 gap-1">
							<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								<RequestIcon aria-hidden="true" className="size-3.5" />
								Service request
							</span>
							<h1 className="m-0 truncate font-semibold text-foreground text-xl leading-tight">
								{title}
							</h1>
							<p className="m-0 text-muted-foreground text-sm">
								{intakeTypeLabel(request.intakeType)} · {formatRequestDate(request.requestDate)}
							</p>
						</div>
						<RequestStatusBadge open={open} />
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: request.id }} to="/public-engagement/service-requests/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
						<CloseReopenButton actorProfileId={actorProfileId} open={open} requestId={request.id} />
						<DeleteServiceRequestButton requestId={request.id} />
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto">
					<div className="grid content-start gap-5 p-4">
						<RequestDetailsCard receivedByName={receivedByName} request={request} />
						<RequestPartiesCard addressId={request.addressId} contactId={request.contactId} />
						<NearbyPanel
							isError={nearby.isError}
							isLoading={nearby.isLoading}
							nameById={nameById}
							onSelect={setSelectedNearbyId}
							onToggleFamily={toggleFamily}
							response={nearby.data}
							selectedId={selectedNearbyId}
							visibleFamilies={visibleFamilies}
						/>
						<CommentsSection
							description="Follow-up, resolution notes, and field context for this request."
							target={{ type: 'serviceRequest', id: request.id }}
						/>
					</div>
				</div>
			</div>
		</MapSplitPage>
	);
}

function RequestDetailsCard({
	request,
	receivedByName,
}: {
	readonly request: ServiceRequestRow;
	readonly receivedByName: string | null;
}) {
	return (
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
	);
}

// --- Map context surface -----------------------------------------------------

function ContextMap({
	request,
	response,
	visibleFamilies,
	selectedId,
	onSelect,
}: {
	readonly request: ServiceRequestRow;
	readonly response: NearbyResponse | undefined;
	readonly visibleFamilies: ReadonlySet<NearbyFamily>;
	readonly selectedId: string | null;
	readonly onSelect: (id: string | null) => void;
}) {
	const [map, setMap] = useState<MapboxMap | null>(null);

	const mapData = useMemo(
		() => buildNearbyMapData({ lat: request.lat, lng: request.lng }, response, visibleFamilies),
		[request.lat, request.lng, response, visibleFamilies],
	);

	const handleReady = useCallback(
		(instance: MapboxMap) => {
			setMap(instance);
			instance.setCenter([request.lng, request.lat]);
			instance.setZoom(15);
		},
		[request.lng, request.lat],
	);

	// Frame the whole proximity ring once the radius is known (and if it changes).
	const radiusMeters = response?.radius.meters ?? null;
	useEffect(() => {
		if (map === null || radiusMeters === null) {
			return;
		}
		const ring = circlePolygon({ lng: request.lng, lat: request.lat }, radiusMeters);
		const bounds = boundsFromGeoJson(ring);
		if (bounds !== null) {
			map.fitBounds(
				[
					[bounds.west, bounds.south],
					[bounds.east, bounds.north],
				],
				{ padding: 56, duration: 400, maxZoom: 17 },
			);
		}
	}, [map, radiusMeters, request.lng, request.lat]);

	// Fly to the selected nearby record.
	const selectedItem = response?.items.find((item) => item.id === selectedId) ?? null;
	useEffect(() => {
		if (map === null || selectedItem === null) {
			return;
		}
		map.flyTo({
			center: [selectedItem.lng, selectedItem.lat],
			zoom: Math.max(map.getZoom(), 15),
			duration: 500,
		});
	}, [map, selectedItem]);

	return (
		<>
			<MapCanvas
				controls={{ layers: false }}
				nearbyLayer={{ data: mapData, selectedId, onSelectFeature: onSelect }}
				onMapReady={handleReady}
			/>
			{response === undefined ? null : <MapContextCaption response={response} />}
			{selectedItem === null ? null : (
				<NearbyFocusCard item={selectedItem} onClose={() => onSelect(null)} />
			)}
		</>
	);
}

function MapContextCaption({ response }: { readonly response: NearbyResponse }) {
	return (
		<div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-border/60 bg-background/90 px-3 py-2 shadow-sm backdrop-blur-sm">
			<p className="m-0 font-medium text-foreground text-xs">
				Within {formatRadiusLabel(response.radius.amount, response.radius.unitCode)}
			</p>
			<p className="m-0 text-[0.7rem] text-muted-foreground">
				{formatRequestDate(response.dateFrom)} – {formatRequestDate(response.dateTo)}
			</p>
		</div>
	);
}

/**
 * Renders the same rich, self-fetching per-type card an explorer would for the
 * selected nearby record — dispatching on its category so a habitat near a request
 * shows the exact card the Habitats explorer shows, and so on for every family.
 * Each card takes just the record id and resolves its own content; the SR-relative
 * distance stays in the left-column nearby list.
 */
function NearbyFocusCard({
	item,
	onClose,
}: {
	readonly item: NearbyItem;
	readonly onClose: () => void;
}) {
	switch (item.category) {
		case 'habitat':
			return (
				<HabitatMapCard
					detailTo="/larval-surveillance/habitats/$id"
					id={item.id}
					onClose={onClose}
				/>
			);
		case 'trap':
			return <TrapMapCard id={item.id} onClose={onClose} />;
		case 'inspection':
			return <InspectionMapCard id={item.id} onClose={onClose} />;
		case 'collection':
			return <CollectionMapCard id={item.id} onClose={onClose} />;
		case 'application':
			return <ApplicationMapCard id={item.id} onClose={onClose} />;
		case 'sourceReduction':
			return <SourceReductionMapCard id={item.id} onClose={onClose} />;
		case 'biocontrol':
			return <BiocontrolMapCard id={item.id} onClose={onClose} />;
	}
}

// --- Nearby panel (left column) ----------------------------------------------

function NearbyPanel({
	response,
	isLoading,
	isError,
	visibleFamilies,
	onToggleFamily,
	selectedId,
	onSelect,
	nameById,
}: {
	readonly response: NearbyResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly visibleFamilies: ReadonlySet<NearbyFamily>;
	readonly onToggleFamily: (family: NearbyFamily) => void;
	readonly selectedId: string | null;
	readonly onSelect: (id: string | null) => void;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	const countsByFamily = useMemo(() => {
		const counts: Record<NearbyFamily, number> = {
			infrastructure: 0,
			surveillance: 0,
			control: 0,
		};
		for (const item of response?.items ?? []) {
			counts[NEARBY_FAMILY_OF[item.category]] += 1;
		}
		return counts;
	}, [response]);

	const visibleItems = useMemo(() => {
		const items = (response?.items ?? []).filter((item) =>
			visibleFamilies.has(NEARBY_FAMILY_OF[item.category]),
		);
		return [...items].sort((first, second) => first.distanceMeters - second.distanceMeters);
	}, [response, visibleFamilies]);

	const totalCount = response?.items.length ?? 0;
	const unitCode = response?.radius.unitCode ?? 'mile';

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle className="flex items-center gap-2">
					<MapPinnedIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					Nearby Activity
				</CardTitle>
				<CardDescription>
					{response === undefined
						? 'Records around this request, from your public-engagement settings.'
						: `${totalCount === 0 ? 'No' : totalCount} record${totalCount === 1 ? '' : 's'} within ${formatRadiusLabel(response.radius.amount, response.radius.unitCode)}, ${formatRequestDate(response.dateFrom)} – ${formatRequestDate(response.dateTo)}.`}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<div className="flex flex-wrap gap-2">
					{NEARBY_FAMILIES.map((family) => (
						<FamilyToggle
							count={countsByFamily[family.key]}
							family={family.key}
							key={family.key}
							label={family.label}
							onToggle={onToggleFamily}
							pressed={visibleFamilies.has(family.key)}
						/>
					))}
				</div>

				{isError ? (
					<NearbyMessage>Nearby records couldn't be loaded. Try again shortly.</NearbyMessage>
				) : isLoading || response === undefined ? (
					<NearbyLoading />
				) : totalCount === 0 ? (
					<NearbyMessage>
						No infrastructure, surveillance, or control activity fell within this radius and time
						window.
					</NearbyMessage>
				) : visibleItems.length === 0 ? (
					<NearbyMessage>All families are hidden. Toggle one above to see records.</NearbyMessage>
				) : (
					<ul className="grid gap-1">
						{visibleItems.map((item) => (
							<NearbyRow
								isSelected={item.id === selectedId}
								item={item}
								key={item.id}
								nameById={nameById}
								onSelect={onSelect}
								unitCode={unitCode}
							/>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function FamilyToggle({
	family,
	label,
	count,
	pressed,
	onToggle,
}: {
	readonly family: NearbyFamily;
	readonly label: string;
	readonly count: number;
	readonly pressed: boolean;
	readonly onToggle: (family: NearbyFamily) => void;
}) {
	return (
		<button
			aria-pressed={pressed}
			className={cn(
				'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				pressed
					? 'border-border bg-muted/60 text-foreground'
					: 'border-border/60 text-muted-foreground hover:bg-muted/40',
			)}
			onClick={() => onToggle(family)}
			type="button"
		>
			<FamilyDot dimmed={!pressed} family={family} />
			{label}
			<span className={cn('tabular-nums text-muted-foreground', !pressed && 'opacity-70')}>
				{count}
			</span>
		</button>
	);
}

function NearbyRow({
	item,
	isSelected,
	onSelect,
	nameById,
	unitCode,
}: {
	readonly item: NearbyItem;
	readonly isSelected: boolean;
	readonly onSelect: (id: string | null) => void;
	readonly nameById: ReadonlyMap<string, string>;
	readonly unitCode: string;
}) {
	const { title, subtitle } = describeNearbyItem(item, nameById);
	const meta = [
		NEARBY_CATEGORY_LABEL[item.category],
		subtitle,
		item.date === null ? null : formatRequestDate(item.date),
		formatNearbyDistance(item.distanceMeters, unitCode),
	]
		.filter((part): part is string => part !== null)
		.join(' · ');

	return (
		<li
			className={cn(
				'group flex items-center gap-1.5 rounded-md pr-1 pl-2',
				isSelected ? 'bg-primary/8' : 'hover:bg-muted/50',
			)}
		>
			<button
				className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={() => onSelect(isSelected ? null : item.id)}
				title="Show on the Map"
				type="button"
			>
				<FamilyDot family={NEARBY_FAMILY_OF[item.category]} />
				<span className="grid min-w-0 flex-1 gap-0.5">
					<span className="truncate font-medium text-foreground text-sm">{title}</span>
					<span className="truncate text-muted-foreground text-xs">{meta}</span>
				</span>
			</button>
			<NearbyItemLink category={item.category} className={NEARBY_ITEM_LINK_ICON_CLASS} id={item.id}>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</NearbyItemLink>
		</li>
	);
}

function FamilyDot({
	family,
	dimmed = false,
}: {
	readonly family: NearbyFamily;
	readonly dimmed?: boolean;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn('size-2.5 shrink-0 rounded-full', dimmed && 'opacity-40')}
			style={{ backgroundColor: NEARBY_FAMILY_COLORS[family] }}
		/>
	);
}

const NEARBY_ITEM_LINK_ICON_CLASS =
	'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * A typed link to a nearby record's detail page, chosen by its category. Pass no
 * `className` for a bare link (e.g. inside a `Button asChild` footer); pass one
 * for the standalone list affordance.
 */
function NearbyItemLink({
	category,
	id,
	children,
	className,
}: {
	readonly category: NearbyItem['category'];
	readonly id: string;
	readonly children: ReactNode;
	readonly className?: string;
}) {
	const params = { id };
	switch (category) {
		case 'habitat':
			return (
				<Link className={className} params={params} to="/larval-surveillance/habitats/$id">
					{children}
				</Link>
			);
		case 'trap':
			return (
				<Link className={className} params={params} to="/adult-surveillance/traps/$id">
					{children}
				</Link>
			);
		case 'inspection':
			return (
				<Link className={className} params={params} to="/larval-surveillance/inspections/$id">
					{children}
				</Link>
			);
		case 'collection':
			return (
				<Link className={className} params={params} to="/adult-surveillance/collections/$id">
					{children}
				</Link>
			);
		case 'application':
			return (
				<Link className={className} params={params} to="/control-operations/chemical/$id">
					{children}
				</Link>
			);
		case 'sourceReduction':
			return (
				<Link className={className} params={params} to="/control-operations/source-reduction/$id">
					{children}
				</Link>
			);
		case 'biocontrol':
			return (
				<Link className={className} params={params} to="/control-operations/biocontrol/$id">
					{children}
				</Link>
			);
	}
}

function NearbyLoading() {
	return (
		<div className="grid gap-1.5" aria-hidden="true">
			{['n-1', 'n-2', 'n-3', 'n-4'].map((key) => (
				<div className="flex items-center gap-2.5 px-2 py-1.5" key={key}>
					<Skeleton className="size-2.5 rounded-full" />
					<div className="grid flex-1 gap-1">
						<Skeleton className="h-3.5 w-2/5" />
						<Skeleton className="h-3 w-3/5" />
					</div>
				</div>
			))}
		</div>
	);
}

function NearbyMessage({ children }: { readonly children: ReactNode }) {
	return (
		<p className="rounded-md border border-border/40 border-dashed bg-muted/20 px-3 py-4 text-center text-muted-foreground text-sm">
			{children}
		</p>
	);
}

// --- Contact & address (unchanged behaviour) ---------------------------------

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
				<CardTitle>Contact &amp; Location</CardTitle>
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
							<p className="m-0 text-muted-foreground text-sm">
								{formatAddressLine(address) || address.displayName}
							</p>
							<dl className="grid gap-1.5">
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

function mailtoHref(email: string | null): string | undefined {
	const trimmed = email?.trim() ?? '';
	return trimmed.length === 0 ? undefined : `mailto:${trimmed}`;
}

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
				{open ? 'Close Request' : 'Reopen Request'}
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
			<Skeleton className="h-40" />
			<Skeleton className="h-56" />
		</>
	);
}

function ServiceRequestUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<RequestIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>Service Request Unavailable</EmptyTitle>
				<EmptyDescription>
					This request could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

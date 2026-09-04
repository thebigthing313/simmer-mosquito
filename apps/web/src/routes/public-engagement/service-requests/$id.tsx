import { boundsFromGeoJson, circlePolygon } from '@simmer-mosquito/mapping';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ArrowLeftIcon,
	ChevronRightIcon,
	iconRegistry,
	MapPinnedIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import {
	type ComponentType,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from 'react';
import {
	type Acknowledgements,
	useAcknowledgedWrite,
} from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { CommentsSection } from '../../../components/comments-section';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { MapCanvas } from '../../../components/map';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import { NEARBY_FAMILY_COLORS } from '../../../components/map/use-nearby-layer';
import { ReasonDialog } from '../../../components/reason-dialog';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useServiceRequestMutations } from '../../../hooks/mutations/use-service-request-mutations';
import type { Contact } from '../../../hooks/queries/contact-view';
import { useAddressRecord } from '../../../hooks/queries/use-address-record';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { useLookupNames } from '../../../hooks/queries/use-lookup-names';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import {
	type ServiceRequestRecord,
	useServiceRequestRecord,
} from '../../../hooks/queries/use-service-request-record';
import { SERVICE_REQUEST_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { HabitatMapCard } from '../../-habitat-map-card';
import { CollectionMapCard } from '../../adult-surveillance/-collection-map-card';
import { TrapMapCard } from '../../adult-surveillance/-trap-map-card';
import { ApplicationMapCard } from '../../control-operations/-application-map-card';
import { BiocontrolMapCard } from '../../control-operations/-biocontrol-map-card';
import { SourceReductionMapCard } from '../../control-operations/-source-reduction-map-card';
import { InspectionMapCard } from '../../larval-surveillance/-inspection-map-card';
import {
	contactDisplayName,
	formatAddressLines,
	formatRequestDate,
	intakeTypeLabel,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../-public-engagement-display';
import { RequestStatusBadge } from '../-public-engagement-ui';
import {
	buildNearbyMapData,
	countNearbyByFamily,
	describeNearbyItem,
	formatNearbyDistance,
	formatRadiusLabel,
	NEARBY_CATEGORY_LABEL,
	NEARBY_FAMILIES,
	NEARBY_FAMILY_OF,
	type NearbyCategory,
	type NearbyFamily,
	type NearbyItem,
	type NearbyResponse,
	useServiceRequestNearby,
	visibleNearbyItems,
} from './-service-request-nearby';

export const Route = createFileRoute('/public-engagement/service-requests/$id')({
	component: ServiceRequestDetailRoute,
});

const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const ALL_FAMILIES: readonly NearbyFamily[] = ['infrastructure', 'surveillance', 'control'];

function ServiceRequestDetailRoute() {
	const { id } = Route.useParams();
	const { request, isReady } = useServiceRequestRecord(id);
	// Held here rather than in the danger zone, and rendered here too. The delete
	// is optimistic, so the request leaves the collection the moment the button is
	// pressed and the content below unmounts before the registry's refusal comes
	// back. This component survives it: the row going is what makes it render
	// `RecordUnavailable` instead.
	const { run, dialog } = useAcknowledgedWrite({
		askable: SERVICE_REQUEST_DELETE_REFUSALS,
		ask: true,
	});

	if (!isReady) {
		return <ServiceRequestStatePage>{<ServiceRequestDetailSkeleton />}</ServiceRequestStatePage>;
	}
	if (request === undefined) {
		return (
			<>
				<ServiceRequestStatePage>
					{
						<RecordUnavailable
							noun="request"
							reason="not-found"
							title="Service Request Unavailable"
						/>
					}
				</ServiceRequestStatePage>
				{dialog}
			</>
		);
	}
	return (
		<>
			<ServiceRequestDetailContent askDelete={run} request={request} />
			{dialog}
		</>
	);
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
	askDelete,
}: {
	readonly request: ServiceRequestRecord;
	readonly askDelete: (
		write: (acknowledgements: Acknowledgements) => Promise<void>,
	) => Promise<void>;
}) {
	const title = serviceRequestTitle(request);
	useBreadcrumbLabel(request.id, title);
	const open = isServiceRequestOpen(request);

	const nearby = useServiceRequestNearby(request.id);
	const nameById = useLookupNames();
	const [visibleFamilies, setVisibleFamilies] = useState<ReadonlySet<NearbyFamily>>(
		() => new Set(ALL_FAMILIES),
	);
	const [selectedNearbyId, setSelectedNearbyId] = useState<string | null>(null);

	const mutations = useServiceRequestMutations();
	const profiles = useProfileRoster();
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
						<WriteOnly minimum="manager">
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: request.id }} to="/public-engagement/service-requests/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
						<CloseReopenButton open={open} requestId={request.id} />
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto">
					<div className="grid content-start gap-5 p-4">
						{/* The map pane is full height, so nothing sits under it: the band
						    becomes the first item in the scrolling side panel instead. Not
						    beside NearbyPanel, which would read as a subsection of
						    nearby-context. Regions are a fixed boundary the record falls
						    inside, and nearby is a live proximity query. */}
						<RecordRegionsBand
							noun="service request"
							recordId={request.id}
							recordType="service_requests"
						/>
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
						<DangerZoneCard
							ask={askDelete}
							name={title}
							noun="service request"
							onDelete={(acknowledgements) => mutations.remove(request.id, acknowledgements)}
							recordId={request.id}
							recordType="serviceRequest"
							returnTo="/public-engagement/service-requests"
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
	readonly request: ServiceRequestRecord;
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
	readonly request: ServiceRequestRecord;
	readonly response: NearbyResponse | undefined;
	readonly visibleFamilies: ReadonlySet<NearbyFamily>;
	readonly selectedId: string | null;
	readonly onSelect: (id: string | null) => void;
}) {
	const [map, setMap] = useState<MapboxMap | null>(null);

	const mapData = useMemo(
		() =>
			buildNearbyMapData(
				{ lat: request.latitude, lng: request.longitude },
				response,
				visibleFamilies,
			),
		[request.latitude, request.longitude, response, visibleFamilies],
	);

	const handleReady = useCallback(
		(instance: MapboxMap) => {
			setMap(instance);
			instance.setCenter([request.longitude, request.latitude]);
			instance.setZoom(15);
		},
		[request.longitude, request.latitude],
	);

	// Frame the whole proximity ring once the radius is known (and if it changes).
	const radiusMeters = response?.radius.meters ?? null;
	useEffect(() => {
		if (map === null || radiusMeters === null) {
			return;
		}
		const ring = circlePolygon({ lng: request.longitude, lat: request.latitude }, radiusMeters);
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
	}, [map, radiusMeters, request.longitude, request.latitude]);

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
				nearbyLayer={{
					data: mapData,
					selectedIds: selectedId === null ? [] : [selectedId],
					onSelectFeature: onSelect,
				}}
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

/** The habitat card is the one that needs a detail route told to it. */
function HabitatNearbyCard({ id, onClose }: NearbyCardProps) {
	return <HabitatMapCard detailTo="/larval-surveillance/habitats/$id" id={id} onClose={onClose} />;
}

interface NearbyCardProps {
	readonly id: string;
	readonly onClose: () => void;
}

/**
 * The same rich, self-fetching per-type card an explorer would show, keyed by
 * category — a habitat near a request shows the exact card the Habitats explorer
 * shows, and so on for every family. Each card takes just the record id and
 * resolves its own content; the SR-relative distance stays in the nearby list.
 */
const NEARBY_MAP_CARD: Readonly<Record<NearbyCategory, ComponentType<NearbyCardProps>>> = {
	habitat: HabitatNearbyCard,
	trap: TrapMapCard,
	inspection: InspectionMapCard,
	collection: CollectionMapCard,
	application: ApplicationMapCard,
	sourceReduction: SourceReductionMapCard,
	biocontrol: BiocontrolMapCard,
};

function NearbyFocusCard({
	item,
	onClose,
}: {
	readonly item: NearbyItem;
	readonly onClose: () => void;
}) {
	const MapCardForCategory = NEARBY_MAP_CARD[item.category];
	return <MapCardForCategory id={item.id} onClose={onClose} />;
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
	const countsByFamily = useMemo(() => countNearbyByFamily(response?.items ?? []), [response]);
	const visibleItems = useMemo(
		() => visibleNearbyItems(response?.items ?? [], visibleFamilies),
		[response, visibleFamilies],
	);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle className="flex items-center gap-2">
					<MapPinnedIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					Nearby Activity
				</CardTitle>
				<CardDescription>{nearbySummary(response)}</CardDescription>
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

				<NearbyList
					isError={isError}
					isLoading={isLoading}
					items={visibleItems}
					nameById={nameById}
					onSelect={onSelect}
					response={response}
					selectedId={selectedId}
				/>
			</CardContent>
		</Card>
	);
}

/** What the panel says it is showing, before and after the fetch lands. */
function nearbySummary(response: NearbyResponse | undefined): string {
	if (response === undefined) {
		return 'Records around this request, from your public-engagement settings.';
	}
	const count = response.items.length;
	const radius = formatRadiusLabel(response.radius.amount, response.radius.unitCode);
	const window = `${formatRequestDate(response.dateFrom)} – ${formatRequestDate(response.dateTo)}`;
	return `${count === 0 ? 'No' : count} record${count === 1 ? '' : 's'} within ${radius}, ${window}.`;
}

/** The list, or the one line standing in for it. `items` is already family-filtered. */
function NearbyList({
	response,
	items,
	isLoading,
	isError,
	selectedId,
	onSelect,
	nameById,
}: {
	readonly response: NearbyResponse | undefined;
	readonly items: readonly NearbyItem[];
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly selectedId: string | null;
	readonly onSelect: (id: string | null) => void;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	if (isError) {
		return <NearbyMessage>Nearby records couldn't be loaded. Try again shortly.</NearbyMessage>;
	}
	if (isLoading || response === undefined) {
		return <NearbyLoading />;
	}
	if (response.items.length === 0) {
		return (
			<NearbyMessage>
				No infrastructure, surveillance, or control activity fell within this radius and time
				window.
			</NearbyMessage>
		);
	}
	if (items.length === 0) {
		return <NearbyMessage>All families are hidden. Toggle one above to see records.</NearbyMessage>;
	}
	return (
		<ul className="grid gap-1">
			{items.map((item) => (
				<NearbyRow
					isSelected={item.id === selectedId}
					item={item}
					key={item.id}
					nameById={nameById}
					onSelect={onSelect}
					unitCode={response.radius.unitCode}
				/>
			))}
		</ul>
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
			<Link
				className={NEARBY_ITEM_LINK_ICON_CLASS}
				params={{ id: item.id }}
				to={NEARBY_DETAIL_ROUTE[item.category]}
			>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</Link>
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

/** Where each nearby category's detail page lives. Every one takes an `$id`. */
const NEARBY_DETAIL_ROUTE = {
	habitat: '/larval-surveillance/habitats/$id',
	trap: '/adult-surveillance/traps/$id',
	inspection: '/larval-surveillance/inspections/$id',
	collection: '/adult-surveillance/collections/$id',
	application: '/control-operations/chemical/$id',
	sourceReduction: '/control-operations/source-reduction/$id',
	biocontrol: '/control-operations/biocontrol/$id',
} as const satisfies Record<NearbyCategory, string>;

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
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Contact &amp; Location</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-5" padding="compact">
				<PartySection label="Contact">
					<ContactParty contactId={contactId} />
				</PartySection>
				<PartySection label="Address">
					<AddressParty addressId={addressId} />
				</PartySection>
			</CardContent>
		</Card>
	);
}

function PartySection({
	label,
	children,
}: {
	readonly label: string;
	readonly children: ReactNode;
}) {
	return (
		<div className="grid gap-2">
			<span className="font-semibold text-muted-foreground text-xs uppercase">{label}</span>
			{children}
		</div>
	);
}

/** What a party section says while its row is in flight, and when there is none. */
function PartyPlaceholder({ isReady }: { readonly isReady: boolean }) {
	return (
		<span className="text-muted-foreground text-sm">{isReady ? 'Not available' : 'Loading…'}</span>
	);
}

function ContactParty({ contactId }: { readonly contactId: string }) {
	const { contact, isReady } = useContact(contactId);
	if (contact === undefined) {
		return <PartyPlaceholder isReady={isReady} />;
	}

	// The display name already heads the section, so rows that would only repeat
	// it drop out — `primary` is what PartyRow compares against.
	const primary = contactDisplayName(contact);
	return (
		<>
			<Link
				className="w-fit rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: contact.id }}
				to="/public-engagement/contacts/$id"
			>
				{primary}
			</Link>
			<dl className="grid gap-1.5">
				<PartyRow label="Name" primary={primary} value={contact.contactName} />
				<PartyRow label="Company" primary={primary} value={contact.company} />
				<PartyRow label="Department" value={contact.department} />
				<PartyRow label="Title" value={contact.title} />
				<PartyRow label="Preferred" primary={primary} value={contact.preferredPhone} />
				<PartyRow label="Alternate" value={contact.alternatePhone} />
				<PartyRow
					href={mailtoHref(contact.email)}
					label="Email"
					primary={primary}
					value={contact.email}
				/>
				<PartyRow label="Prefers" value={contactPreferences(contact)} />
			</dl>
		</>
	);
}

function AddressParty({ addressId }: { readonly addressId: string }) {
	const addressResult = useAddressRecord(addressId);
	const address = addressResult.address;
	if (address === undefined) {
		return <PartyPlaceholder isReady={addressResult.isReady} />;
	}

	// Postal lines, as an envelope carries them: staff read this address down a
	// phone to a resident.
	const addressLines = formatAddressLines(address);
	const lines = addressLines.length === 0 ? [address.displayName] : addressLines;
	return (
		<>
			<Link
				className="w-fit rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: address.id }}
				to="/gis/addresses/$id"
			>
				{address.displayName}
			</Link>
			{lines.map((line) => (
				<p className="m-0 text-muted-foreground text-sm" key={line}>
					{line}
				</p>
			))}
			<dl className="grid gap-1.5">
				<PartyRow label="Coords" value={formatCoords(address.latitude, address.longitude)} />
			</dl>
		</>
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

function contactPreferences(contact: Contact): string | null {
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

/**
 * Everything that differs between the close dialog and the reopen dialog. The
 * two are the same component with one of these picked once, so a wording change
 * lands in exactly one place and cannot drift between the halves.
 */
interface LifecycleCopy {
	readonly action: string;
	readonly title: string;
	readonly description: string;
	readonly placeholder: string;
	/** What the comment says when nobody explained it. */
	readonly unexplained: string;
}

const CLOSE_COPY: LifecycleCopy = {
	action: 'Close Request',
	title: 'Close this request',
	description: 'What was found, and what was done about it. This goes on the request as a comment.',
	placeholder: 'No standing water found on site.',
	unexplained: 'Closed',
};

const REOPEN_COPY: LifecycleCopy = {
	action: 'Reopen Request',
	title: 'Reopen this request',
	description: 'Why this request is being picked back up. This goes on the request as a comment.',
	placeholder: 'Caller reported it again.',
	unexplained: 'Reopened',
};

/**
 * Close or reopen, with the reason that goes on the record.
 *
 * Both write a comment on the request in the same transaction, so the dialog is
 * not a confirmation step bolted on — it is where the comment's text comes from.
 * The reason is an argument to the command rather than a change to the row: it
 * is not a column here, and the optimistic row must not pretend it is.
 *
 * Neither is required. The command insists on non-empty text, so an empty box
 * falls back to the plain fact — the same bargain the mission cancel dialog
 * strikes. A close nobody explained is still a close, and refusing to record it
 * over a blank field would be the worse failure.
 */
function CloseReopenButton({
	requestId,
	open,
}: {
	readonly requestId: string;
	readonly open: boolean;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const mutations = useServiceRequestMutations();
	const copy = open ? CLOSE_COPY : REOPEN_COPY;

	const confirm = useCallback(
		async (reason: string) => {
			setDialogOpen(false);
			setBusy(true);
			setError(null);
			const trimmed = reason.trim();
			const text = trimmed.length === 0 ? copy.unexplained : trimmed;
			try {
				await (open ? mutations.close(requestId, text) : mutations.reopen(requestId, text));
			} catch (thrown) {
				setError(thrown instanceof Error ? thrown.message : 'Unable to update the request.');
			} finally {
				setBusy(false);
			}
		},
		[copy, mutations, open, requestId],
	);

	return (
		<div className="grid justify-items-end gap-1">
			<Button disabled={busy} onClick={() => setDialogOpen(true)} size="sm" variant="outline">
				{copy.action}
			</Button>
			{error === null ? null : <span className="text-destructive text-xs">{error}</span>}
			<ReasonDialog
				confirmLabel={copy.action}
				description={copy.description}
				onConfirm={(reason) => void confirm(reason)}
				onOpenChange={setDialogOpen}
				open={dialogOpen}
				placeholder={copy.placeholder}
				required={false}
				title={copy.title}
			/>
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

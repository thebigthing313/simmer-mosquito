import { boundsFromGeoJson, circlePolygon } from '@simmer-mosquito/mapping';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { type AskAcknowledged, useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { CommentsSection } from '../../../components/comments-section';
import { MapCanvas } from '../../../components/map';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import { NEARBY_FAMILY_COLORS } from '../../../components/map/use-nearby-layer';
import {
	detailBodyClass,
	type RecordDetailLayout,
	RecordDetailSkeleton,
	RecordUnavailable,
	type RecordUnavailableReason,
} from '../../../components/record';
import type { Contact } from '../../../hooks/queries/contact-view';
import { useAddressRecord } from '../../../hooks/queries/use-address-record';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import {
	type ServiceRequestRecord,
	useServiceRequestRecord,
} from '../../../hooks/queries/use-service-request-record';
import { SERVICE_REQUEST_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { type ActivityLookups, useActivityLookups } from '../../-activity-data';
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
	serviceRequestTitle,
} from '../-public-engagement-display';
import { ServiceRequestDetailHeader } from './-service-request-detail-header';
import {
	buildNearbyMapData,
	countNearbyByFamily,
	formatRadiusLabel,
	NEARBY_FAMILIES,
	type NearbyCategory,
	type NearbyFamily,
	type NearbyItem,
	type NearbyResponse,
	useServiceRequestNearby,
	visibleNearbyItems,
} from './-service-request-nearby';
import { NearbyResultList } from './-service-request-nearby-rows';

export const Route = createFileRoute('/public-engagement/service-requests/$id')({
	component: ServiceRequestDetailRoute,
});

const ALL_FAMILIES: readonly NearbyFamily[] = ['infrastructure', 'surveillance', 'control'];

/**
 * The placeholder, in the frame's shape rather than one written here.
 *
 * The rest of `RecordDetailPage` does not fit this page: what a ready service
 * request renders is a map split across the whole stage, not a column inside
 * the page measure. The skeleton and the unavailable state are the parts that
 * do, so those are shared and the fork stays.
 */
const layout: RecordDetailLayout = {
	skeleton: { main: ['h-40', 'h-56'] },
};

function ServiceRequestDetailRoute() {
	const { id } = Route.useParams();
	const { request, isError, isReady } = useServiceRequestRecord(id);
	// Held here rather than in the header's menu, and rendered here too. The
	// delete is optimistic, so the request leaves the collection the moment the
	// item is chosen and the content below unmounts before the registry's refusal
	// comes back. This component survives it: the row going is what makes it
	// render `RecordUnavailable` instead.
	const { run, dialog } = useAcknowledgedWrite({
		askable: SERVICE_REQUEST_DELETE_REFUSALS,
		ask: true,
	});

	// Ahead of readiness and ahead of presence, for the reason the frame states:
	// a read that failed is not a record that is missing, and telling the reader
	// to stop looking is the wrong answer to a transient failure.
	if (isError) {
		return <ServiceRequestUnavailable reason="error" />;
	}
	if (!isReady) {
		return <RecordDetailSkeleton layout={layout} />;
	}
	if (request === undefined) {
		return (
			<>
				<ServiceRequestUnavailable reason="not-found" />
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

/**
 * The unavailable states, in the frame's body measure.
 *
 * The same box `RecordDetailPage` puts its own in, so the message stands where
 * the record's cards would have, at the width the route-loading skeleton
 * reserved rather than in a 900px column of its own (#1043, #1046). There is no
 * back link over it: the breadcrumb and the browser's back button already say
 * where up is, and the one the page used to draw named a fixed destination.
 */
function ServiceRequestUnavailable({ reason }: { readonly reason: RecordUnavailableReason }) {
	return (
		<div className={detailBodyClass()}>
			<RecordUnavailable reason={reason} recordType="serviceRequest" />
		</div>
	);
}

function ServiceRequestDetailContent({
	request,
	askDelete,
}: {
	readonly request: ServiceRequestRecord;
	readonly askDelete: AskAcknowledged;
}) {
	useBreadcrumbLabel(request.id, serviceRequestTitle(request));

	const nearby = useServiceRequestNearby(request.id);
	const lookups = useActivityLookups();
	const [visibleFamilies, setVisibleFamilies] = useState<ReadonlySet<NearbyFamily>>(
		() => new Set(ALL_FAMILIES),
	);
	const [selectedNearbyId, setSelectedNearbyId] = useState<string | null>(null);

	const profiles = useProfileRoster();
	const receivedByName =
		profiles.find((profile) => profile.id === request.receivedByProfileId)?.displayName ?? null;

	const toggleFamily = (family: NearbyFamily) => {
		setVisibleFamilies((prev) => {
			const next = new Set(prev);
			if (next.has(family)) {
				next.delete(family);
			} else {
				next.add(family);
			}
			return next;
		});
	};

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
				<ServiceRequestDetailHeader askDelete={askDelete} request={request} />

				<div className="min-h-0 flex-1 overflow-y-auto">
					<div className="grid content-start gap-5 p-4">
						{/* The map pane is full height, so nothing sits under it: the band
						    becomes the first item in the scrolling side panel instead. Not
						    beside NearbyPanel, which would read as a subsection of
						    nearby-context. Regions are a fixed boundary the record falls
						    inside, and nearby is a live proximity query. */}
						<RecordRegionsBand recordId={request.id} recordType="service_requests" />
						<RequestDetailsCard receivedByName={receivedByName} request={request} />
						<RequestPartiesCard addressId={request.addressId} contactId={request.contactId} />
						<NearbyPanel
							isError={nearby.isError}
							isLoading={nearby.isLoading}
							lookups={lookups}
							onRetry={() => void nearby.refetch()}
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
	readonly request: ServiceRequestRecord;
	readonly receivedByName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<p className="m-0 whitespace-pre-wrap text-foreground text-sm">{request.details}</p>
				<DetailList className="border-border/50 border-t pt-4">
					<DetailRow label="Intake">{intakeTypeLabel(request.intakeType)}</DetailRow>
					<DetailRow label="Date">{formatRequestDate(request.requestDate)}</DetailRow>
					<DetailRow label="Received by">{receivedByName}</DetailRow>
				</DetailList>
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

	const mapData = buildNearbyMapData(
		{ lat: request.latitude, lng: request.longitude },
		response,
		visibleFamilies,
	);

	const handleReady = (instance: MapboxMap) => {
		setMap(instance);
		instance.setCenter([request.longitude, request.latitude]);
		instance.setZoom(15);
	};

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
	onRetry,
	visibleFamilies,
	onToggleFamily,
	selectedId,
	onSelect,
	lookups,
}: {
	readonly response: NearbyResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly onRetry: () => void;
	readonly visibleFamilies: ReadonlySet<NearbyFamily>;
	readonly onToggleFamily: (family: NearbyFamily) => void;
	readonly selectedId: string | null;
	readonly onSelect: (id: string | null) => void;
	readonly lookups: ActivityLookups;
}) {
	const countsByFamily = countNearbyByFamily(response?.items ?? []);
	const visibleItems = visibleNearbyItems(response?.items ?? [], visibleFamilies);

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle className="flex items-center gap-2">
					<MapPinnedIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					Nearby Activity
				</CardTitle>
				<CardDescription>{nearbySummary(response)}</CardDescription>
			</CardHeader>
			{/* No padding on the content, because the rows carry the rail's own and
			    a second measure around them would indent every row inside the card
			    the header sits flush with. The toggles take the header's measure. */}
			<CardContent className="grid" padding="none">
				<div className="flex flex-wrap gap-2 px-4 pb-3">
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
				{/* Clipped to the card's corner, so a selected or hovered last row's
				    fill squares nothing off at the foot. */}
				<div className="flex min-h-0 flex-col overflow-hidden rounded-b-[inherit] border-border/50 border-t">
					<NearbyResultList
						{...nearbyEmptyCopy(response, visibleItems.length)}
						isError={isError}
						isLoading={isLoading}
						items={visibleItems}
						lookups={lookups}
						onRetry={onRetry}
						onSelect={onSelect}
						response={response}
						selectedId={selectedId}
					/>
				</div>
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
	const window = `${formatRequestDate(response.dateFrom)}–${formatRequestDate(response.dateTo)}`;
	return `${count === 0 ? 'No' : count} record${count === 1 ? '' : 's'} within ${radius}, ${window}.`;
}

/**
 * Why the list is empty, in the rail's two lines.
 *
 * Two reasons and they need telling apart: nothing fell inside the radius and
 * the window, or something did and every family holding it is toggled off.
 * The second used to read as the first before the toggles said their counts.
 */
function nearbyEmptyCopy(
	response: NearbyResponse | undefined,
	visibleCount: number,
): { readonly emptyTitle: string; readonly emptyDescription: string } {
	if (response !== undefined && response.items.length > 0 && visibleCount === 0) {
		return {
			emptyTitle: 'Every family is hidden',
			emptyDescription: 'Turn one back on above to see its records.',
		};
	}
	return {
		emptyTitle: 'Nothing nearby',
		emptyDescription: 'No records fell within this radius and time window.',
	};
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
			<CardHeader padding="compact">
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
				className={cn(recordLink({ size: 'sm' }), 'w-fit')}
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
				className={cn(recordLink({ size: 'sm' }), 'w-fit')}
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
					<a className={recordLink({ tone: 'inherit', underline: 'hover' })} href={href}>
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

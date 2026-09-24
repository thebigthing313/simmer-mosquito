import { boundsFromGeoJson, circlePolygon } from '@simmer-mosquito/mapping';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { formatPhoneNumber } from '@simmer-mosquito/ui-web/lib/phone-number';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import type { ActivityLookups } from '../../../components/activity/activity-data';
import { CollectionMapCard } from '../../../components/adult-surveillance/collection-map-card';
import { TrapMapCard } from '../../../components/adult-surveillance/trap-map-card';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { CommentsSection } from '../../../components/comments-section';
import { ApplicationMapCard } from '../../../components/control-operations/application-map-card';
import { BiocontrolMapCard } from '../../../components/control-operations/biocontrol-map-card';
import { SourceReductionMapCard } from '../../../components/control-operations/source-reduction-map-card';
import { HabitatMapCard } from '../../../components/larval-surveillance/habitats/habitat-map-card';
import { InspectionMapCard } from '../../../components/larval-surveillance/inspection-map-card';
import { MapCanvas } from '../../../components/map';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	contactDisplayName,
	formatAddressLines,
	formatRequestDate,
	intakeTypeLabel,
	serviceRequestTitle,
} from '../../../components/public-engagement/public-engagement-display';
import { ServiceRequestMapCard } from '../../../components/public-engagement/service-request-map-card';
import { ServiceRequestDetailHeader } from '../../../components/public-engagement/service-requests/service-request-detail-header';
import {
	buildNearbyMapData,
	countNearbyByFamily,
	formatRadiusLabel,
	NEARBY_FAMILIES,
	type NearbyCategory,
	type NearbyFamily,
	type NearbyItem,
	type NearbyRead,
	type NearbyResponse,
	nearbyItemKey,
	nearbySummary,
	nearbyWindowLabel,
	visibleNearbyItems,
} from '../../../components/public-engagement/service-requests/service-request-nearby';
import { NearbyResultList } from '../../../components/public-engagement/service-requests/service-request-nearby-rows';
import {
	isServiceRequestTab,
	mapFamiliesForTab,
	SERVICE_REQUEST_TAB_CODECS,
	SERVICE_REQUEST_TAB_DEFAULTS,
	SERVICE_REQUEST_TAB_LABEL,
	SERVICE_REQUEST_TABS,
	tabFamily,
} from '../../../components/public-engagement/service-requests/service-request-tabs';
import {
	detailBodyClass,
	type RecordDetailLayout,
	RecordDetailSkeleton,
	RecordUnavailable,
	type RecordUnavailableReason,
} from '../../../components/record';
import { useActivityLookups } from '../../../hooks/activity/use-activity-lookups';
import { useServiceRequestNearby } from '../../../hooks/public-engagement/use-service-request-nearby';
import type { Contact } from '../../../hooks/queries/contact-view';
import { useAddressRecord } from '../../../hooks/queries/use-address-record';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import {
	type ServiceRequestRecord,
	useServiceRequestRecord,
} from '../../../hooks/queries/use-service-request-record';
import { type AskAcknowledged, useAcknowledgedWrite } from '../../../hooks/use-acknowledged-write';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { SERVICE_REQUEST_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/public-engagement/service-requests/$id')({
	component: ServiceRequestDetailRoute,
	validateSearch: searchValidator(SERVICE_REQUEST_TAB_CODECS),
});

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
	// The active tab is where the reader is, so it lives in the URL: a refresh
	// and a shared link land on the same tab, and Details stays out of the
	// search because it is the default. The count is switched off because a tab
	// narrows nothing.
	const { filters, setFilters } = useSearchFilters(
		SERVICE_REQUEST_TAB_DEFAULTS,
		SERVICE_REQUEST_TAB_CODECS,
		{ uncounted: ['tab'] },
	);
	const tab = filters.tab;
	const [selectedKey, setSelectedKey] = useState<string | null>(null);

	const profiles = useProfileRoster();
	const receivedByName =
		profiles.find((profile) => profile.id === request.receivedByProfileId)?.displayName ?? null;

	const countsByFamily = countNearbyByFamily(nearby.data?.items ?? []);

	const selectTab = (value: string) => {
		if (isServiceRequestTab(value)) {
			setFilters({ tab: value });
		}
	};

	return (
		<MapSplitPage
			map={
				<ContextMap
					families={mapFamiliesForTab(tab)}
					onSelect={setSelectedKey}
					request={request}
					response={nearby.data}
					selectedKey={selectedKey}
				/>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<ServiceRequestDetailHeader askDelete={askDelete} request={request} />

				<Tabs className="min-h-0 flex-1 gap-0" onValueChange={selectTab} value={tab}>
					<div className="shrink-0 border-border/40 border-b px-3 py-2">
						<TabStrip aria-label="Service request sections">
							{SERVICE_REQUEST_TABS.map((value) => {
								const family = tabFamily(value);
								return (
									<TabStripTab key={value} value={value}>
										{SERVICE_REQUEST_TAB_LABEL[value]}
										{family === null ? null : <TabCount count={countsByFamily[family]} />}
									</TabStripTab>
								);
							})}
						</TabStrip>
					</div>

					<TabsContent className={TAB_CONTENT_CLASS} value="details">
						<TabBody>
							<RequestDetailsCard receivedByName={receivedByName} request={request} />
							<div className="grid gap-4 @md:grid-cols-2">
								<PartyCard label="Contact">
									<ContactParty contactId={request.contactId} />
								</PartyCard>
								<PartyCard label="Address">
									<AddressParty addressId={request.addressId} />
								</PartyCard>
							</div>
							<RecordRegionsBand recordId={request.id} recordType="service_requests" />
						</TabBody>
					</TabsContent>

					{NEARBY_FAMILIES.map((family) => (
						<TabsContent className={TAB_CONTENT_CLASS} key={family.key} value={family.key}>
							<NearbyFamilyTab
								families={mapFamiliesForTab(family.key)}
								label={family.label}
								lookups={lookups}
								nearby={nearby}
								onSelect={setSelectedKey}
								selectedKey={selectedKey}
							/>
						</TabsContent>
					))}

					<TabsContent className={TAB_CONTENT_CLASS} value="comments">
						<TabBody>
							<CommentsSection
								description="Follow-up, resolution notes, and field context for this request."
								target={{ type: 'serviceRequest', id: request.id }}
							/>
						</TabBody>
					</TabsContent>
				</Tabs>
			</div>
		</MapSplitPage>
	);
}

/**
 * A tab body is a column that hands its height on, so the scroller inside it,
 * the rail's or `TabBody`'s, is what scrolls rather than the tab.
 */
const TAB_CONTENT_CLASS = 'flex min-h-0 flex-col';

/** How many records a family tab lists, beside its label; nothing for none. */
function TabCount({ count }: { readonly count: number }) {
	return count === 0 ? null : (
		<span className="text-muted-foreground text-xs tabular-nums">{count}</span>
	);
}

/**
 * The scrolling body of a tab whose content is cards rather than a rail.
 *
 * The tab owns the column's remaining height, so the body scrolls inside the
 * product's `ScrollArea` and the page never does. It is a container, so the
 * Details tab can set two cards side by side once the column is wide enough,
 * measured against the column rather than the window because the column is
 * two fifths of the stage.
 */
function TabBody({ children }: { readonly children: ReactNode }) {
	return (
		<ScrollArea className="min-h-0 flex-1" type="auto">
			<div className="@container grid content-start gap-4 p-4">{children}</div>
		</ScrollArea>
	);
}

/**
 * One family's nearby records: what the page says it is showing, then the
 * rail's rows. The families are the tab's own, read off the same function the
 * map reads, so a row is on the map exactly when it is in the list.
 */
function NearbyFamilyTab({
	families,
	label,
	nearby,
	selectedKey,
	onSelect,
	lookups,
}: {
	readonly families: ReadonlySet<NearbyFamily>;
	readonly label: string;
	readonly nearby: NearbyRead;
	readonly selectedKey: string | null;
	readonly onSelect: (key: string | null) => void;
	readonly lookups: ActivityLookups;
}) {
	return (
		<>
			<p className="m-0 shrink-0 border-border/40 border-b px-4 py-2 text-muted-foreground text-xs">
				{nearbySummary(nearby.data)}
			</p>
			<NearbyResultList
				emptyDescription={`No ${label.toLowerCase()} records fell within this radius and time window.`}
				emptyTitle="Nothing nearby"
				families={families}
				lookups={lookups}
				nearby={nearby}
				onSelect={onSelect}
				selectedKey={selectedKey}
			/>
		</>
	);
}

function RequestDetailsCard({
	request,
	receivedByName,
}: {
	readonly request: ServiceRequestRecord;
	readonly receivedByName: string | null;
}) {
	// No title: the tab it sits on is called Details, and a card saying it again
	// under the strip named the same thing twice.
	return (
		<Card variant="surface">
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
	families,
	selectedKey,
	onSelect,
}: {
	readonly request: ServiceRequestRecord;
	readonly response: NearbyResponse | undefined;
	/** The nearby families the active tab draws. */
	readonly families: ReadonlySet<NearbyFamily>;
	/** The selected record's `nearbyItemKey`, or null. */
	readonly selectedKey: string | null;
	readonly onSelect: (key: string | null) => void;
}) {
	const [map, setMap] = useState<MapboxMap | null>(null);

	const mapData = buildNearbyMapData(
		{ lat: request.latitude, lng: request.longitude },
		response,
		families,
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

	// The selection is only a selection while its family is on the map: a
	// record picked on the Control tab stays picked for when the reader comes
	// back, and is neither ringed nor flown to nor carded while the tab is
	// Details.
	const selectedItem =
		selectedKey === null
			? null
			: (visibleNearbyItems(response?.items ?? [], families).find(
					(item) => nearbyItemKey(item) === selectedKey,
				) ?? null);
	// Fly to the selected nearby record.
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
					selectedIds: selectedItem === null ? [] : [nearbyItemKey(selectedItem)],
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
			<p className="m-0 text-[0.7rem] text-muted-foreground">{nearbyWindowLabel(response)}</p>
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
 * category: a habitat near a request shows the exact card the Habitats explorer
 * shows, and so on for every family. Each card takes just the record id and
 * resolves its own content; the SR-relative distance stays in the nearby list.
 * A request near this one shows the Service Requests explorer's card, whose
 * detail link is the way from one request to the next (#1090).
 */
const NEARBY_MAP_CARD: Readonly<Record<NearbyCategory, ComponentType<NearbyCardProps>>> = {
	habitat: HabitatNearbyCard,
	trap: TrapMapCard,
	inspection: InspectionMapCard,
	collection: CollectionMapCard,
	application: ApplicationMapCard,
	sourceReduction: SourceReductionMapCard,
	biocontrol: BiocontrolMapCard,
	serviceRequest: ServiceRequestMapCard,
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

// --- Contact & address -------------------------------------------------------

/**
 * One party to the request, as its own card. Two cards rather than one with
 * two sections, so the Details tab can set them side by side where the column
 * is wide enough and stack them where it is not.
 */
function PartyCard({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>{label}</CardTitle>
			</CardHeader>
			<CardContent className="grid content-start gap-2" padding="compact">
				{children}
			</CardContent>
		</Card>
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
				<PartyRow
					label="Preferred"
					primary={primary}
					value={formatPhoneNumber(contact.preferredPhone)}
				/>
				<PartyRow label="Alternate" value={formatPhoneNumber(contact.alternatePhone)} />
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

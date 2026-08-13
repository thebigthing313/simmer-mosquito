import { boundsFromGeoJson } from '@simmer-mosquito/mapping';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Autocomplete } from '@simmer-mosquito/ui-web/components/ui/autocomplete';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ComponentType, useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../components/app-shell/outlet/map-split-page';
import { DateRangeFilter } from '../components/date-range-filter';
import {
	ExplorerHeader,
	ExplorerRow,
	useDateRangeFilters,
	usePersonnelOptions,
} from '../components/explorer';
import { DensityBadge, WetnessBadge } from '../components/larval-display';
import { MapCanvas } from '../components/map';
import { ACTIVITY_FAMILY_COLORS } from '../components/map/use-activity-layer';
import { useAuthSnapshot } from '../hooks/use-auth-snapshot';
import { todayInTimeZone } from '../lib/local-date';
import {
	dateParam,
	type FilterCodecs,
	searchValidator,
	textParam,
	useSearchFilters,
} from '../lib/search-filters';
import {
	ACTIVITY_CATEGORY_LABEL,
	ACTIVITY_FAMILIES,
	ACTIVITY_ROLE_LABEL,
	type ActivityDayGroup,
	type ActivityEntry,
	type ActivityFamily,
	ActivityRequestError,
	type ActivityStateToken,
	activityEntryKey,
	activityStatus,
	buildActivityMapData,
	countActivityByFamily,
	describeActivityEntry,
	formatActivityTime,
	groupActivityByDay,
	useActivityLookups,
	useProfileActivity,
} from './-activity-monitor-data';
import { HabitatMapCard } from './-habitat-map-card';
import { CollectionMapCard } from './adult-surveillance/-collection-map-card';
import { TrapMapCard } from './adult-surveillance/-trap-map-card';
import { ApplicationMapCard } from './control-operations/-application-map-card';
import { BiocontrolMapCard } from './control-operations/-biocontrol-map-card';
import { SourceReductionMapCard } from './control-operations/-source-reduction-map-card';
import { InspectionMapCard } from './larval-surveillance/-inspection-map-card';
import { formatListDate } from './larval-surveillance/-overview-data';
import { OutreachMapCard } from './public-engagement/-outreach-map-card';
import { ServiceRequestMapCard } from './public-engagement/-service-request-map-card';

/**
 * One Profile's field work over a date range, on one map.
 *
 * Five explorers already filter by personnel, so "what did this person do
 * today, and where" is answerable — by opening five surfaces, setting the same
 * two filters on each, and unioning the maps by eye. Two things make that union
 * wrong rather than merely tedious: the collections surface carries no personnel
 * filter at all, and no explorer filter reaches `additional_personnel`, so
 * somebody who spent a week assisting appears under their own name on nothing.
 *
 * Both gaps are read by one server endpoint here.
 */

interface ActivityFilters {
	readonly profile: string;
	readonly from: string;
	readonly to: string;
}

const ACTIVITY_FILTER_CODECS: FilterCodecs<ActivityFilters> = {
	profile: textParam,
	from: dateParam,
	to: dateParam,
};

export const Route = createFileRoute('/activity-monitor')({
	component: ActivityMonitorRoute,
	validateSearch: searchValidator(ACTIVITY_FILTER_CODECS),
});

function ActivityMonitorRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const snapshot = useAuthSnapshot();
	const ownProfileId =
		snapshot?.authenticated === true ? snapshot.localIdentity.profileId : undefined;

	// Today, and the signed-in person: the page is useful to a collector
	// reviewing their own day without configuring anything.
	const filterDefaults = useMemo<ActivityFilters>(
		() => ({ profile: ownProfileId ?? '', from: today, to: today }),
		[ownProfileId, today],
	);
	const { filters: query, setFilters } = useSearchFilters(filterDefaults, ACTIVITY_FILTER_CODECS);
	const profileId = query.profile === '' ? null : query.profile;
	const dateRange = useDateRangeFilters({ from: query.from, to: query.to, today, setFilters });

	const personnel = usePersonnelOptions();
	const lookups = useActivityLookups();
	const [selectedKey, setSelectedKey] = useState<string | null>(null);

	const activity = useProfileActivity({ profileId, dateFrom: query.from, dateTo: query.to });
	const view = useActivityView(activity.data?.items, selectedKey);

	const clearSelection = useCallback(() => setSelectedKey(null), []);
	const activityLayer = useMemo(
		() => ({ data: view.mapData, selectedKey, onSelectFeature: setSelectedKey }),
		[view.mapData, selectedKey],
	);
	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						activityLayer={activityLayer}
						controls={{ layers: false, measure: true }}
						fitToData={view.bounds}
					/>
					{view.selected === null ? null : (
						<ActivityFocusCard entry={view.selected} onClose={clearSelection} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<ExplorerHeader
					isLoading={activity.isLoading}
					noun={{ one: 'entry', many: 'entries' }}
					title="Activity Monitor"
					total={view.items.length}
				>
					<ProfilePicker
						onChange={(next) => {
							setSelectedKey(null);
							setFilters({ profile: next });
						}}
						options={personnel.options}
						value={profileId}
					/>
					<DateRangeFilter {...dateRange} />
					<FamilyCounts counts={view.counts} />
				</ExplorerHeader>

				<ActivityPanel
					days={view.days}
					error={activity.error}
					isLoading={activity.isLoading}
					lookups={lookups}
					onSelect={setSelectedKey}
					profileId={profileId}
					selectedKey={selectedKey}
					truncated={activity.data?.truncated === true}
				/>
			</div>
		</MapSplitPage>
	);
}

/**
 * Everything the page derives from one activity response: the counts, the day
 * groups, the pin cloud, the camera frame, and which entry is selected.
 */
function useActivityView(items: readonly ActivityEntry[] | undefined, selectedKey: string | null) {
	// A literal `?? []` here would be a new array every render, and every memo
	// below it would recompute on every render.
	const entries = items ?? NO_ENTRIES;
	return {
		items: entries,
		counts: useMemo(() => countActivityByFamily(entries), [entries]),
		days: useMemo(() => groupActivityByDay(entries), [entries]),
		mapData: useMemo(() => buildActivityMapData(entries), [entries]),
		// The camera frames the whole range's work as one MultiPoint, so a person
		// who covered two townships is not left half off the edge of the map.
		bounds: useMemo(
			() =>
				entries.length === 0
					? null
					: boundsFromGeoJson({
							type: 'MultiPoint',
							coordinates: entries.map((item) => [item.lng, item.lat]),
						}),
			[entries],
		),
		selected: useMemo(
			() => entries.find((item) => activityEntryKey(item) === selectedKey) ?? null,
			[entries, selectedKey],
		),
	};
}

const NO_ENTRIES: readonly ActivityEntry[] = [];

// --- filters -----------------------------------------------------------------

function ProfilePicker({
	value,
	options,
	onChange,
}: {
	readonly value: string | null;
	readonly options: readonly { readonly id: string; readonly label: string }[];
	readonly onChange: (next: string) => void;
}) {
	// Type-to-search rather than a scroll: an agency's roster runs to hundreds of
	// profiles, most of them historical, and a supervisor knows the name.
	const autocompleteOptions = useMemo(
		() => options.map((option) => ({ value: option.id, label: option.label })),
		[options],
	);

	return (
		<Autocomplete
			aria-label="Person"
			emptyValue=""
			onValueChange={(next) => onChange(next ?? '')}
			options={autocompleteOptions}
			placeholder="Search people…"
			value={value}
		/>
	);
}

/** Per-family totals for the whole range. These are also the map's legend. */
function FamilyCounts({ counts }: { readonly counts: Readonly<Record<ActivityFamily, number>> }) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			{ACTIVITY_FAMILIES.map(({ key, label }) => (
				<span
					className="flex items-center gap-1.5 text-muted-foreground text-xs"
					key={key}
					title={label}
				>
					<FamilyDot family={key} />
					<span>{label}</span>
					<span className="font-medium text-foreground tabular-nums">{counts[key]}</span>
				</span>
			))}
		</div>
	);
}

function FamilyDot({
	family,
	hollow = false,
}: {
	readonly family: ActivityFamily;
	readonly hollow?: boolean;
}) {
	return (
		<span
			aria-hidden="true"
			className="size-2.5 shrink-0 rounded-full"
			style={
				hollow
					? { boxShadow: `inset 0 0 0 2px ${ACTIVITY_FAMILY_COLORS[family]}` }
					: { backgroundColor: ACTIVITY_FAMILY_COLORS[family] }
			}
		/>
	);
}

// --- the log -----------------------------------------------------------------

/**
 * Which of the four non-log states the panel is in, if any.
 *
 * A pure resolution rather than a chain of early returns in the component,
 * because the distinction that matters here is a product one: an outage must
 * never read as an empty day. The two are indistinguishable on the page unless
 * something says which is which, and one of them is a conclusion about a
 * colleague.
 */
function activityPanelMessage(state: {
	readonly hasProfile: boolean;
	readonly isLoading: boolean;
	readonly error: Error | null;
	readonly isEmpty: boolean;
}): { readonly title: string; readonly body: string } | 'loading' | null {
	if (!state.hasProfile) {
		return { title: 'Choose a person', body: 'Pick someone to see their field work.' };
	}
	if (state.isLoading) {
		return 'loading';
	}
	// A refusal says which window was refused; anything else is an outage, and an
	// outage must never read as an empty day.
	if (state.error !== null) {
		return isRefusal(state.error)
			? { title: 'That range was not read', body: state.error.message }
			: {
					title: 'Activity could not be loaded',
					body: 'The read failed. Try again, or narrow the range.',
				};
	}
	if (state.isEmpty) {
		return {
			title: 'No activity in this range',
			body: 'Nothing is recorded against this person between these dates.',
		};
	}
	return null;
}

function ActivityPanel({
	days,
	isLoading,
	error,
	truncated,
	lookups,
	profileId,
	selectedKey,
	onSelect,
}: {
	readonly days: readonly ActivityDayGroup[];
	readonly isLoading: boolean;
	readonly error: Error | null;
	readonly truncated: boolean;
	readonly lookups: ActivityLookups;
	readonly profileId: string | null;
	readonly selectedKey: string | null;
	readonly onSelect: (key: string) => void;
}) {
	const message = activityPanelMessage({
		hasProfile: profileId !== null,
		isLoading,
		error,
		isEmpty: days.length === 0,
	});
	if (message === 'loading') {
		return <ActivityLoading />;
	}
	if (message !== null) {
		return <PanelMessage title={message.title}>{message.body}</PanelMessage>;
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			{truncated ? <TruncationNotice /> : null}
			<ol className="grid gap-4 p-3">
				{days.map((day) => (
					<ActivityDaySection
						day={day}
						key={day.date}
						lookups={lookups}
						onSelect={onSelect}
						selectedKey={selectedKey}
					/>
				))}
			</ol>
		</div>
	);
}

/** The row cap bit, said out loud: a partial log must never read as a whole one. */
function TruncationNotice() {
	return (
		<Alert className="m-3" variant="destructive">
			<AlertTitle>This log is incomplete</AlertTitle>
			<AlertDescription>
				There is more work in this range than one read can carry. Narrow the dates to see all of it.
			</AlertDescription>
		</Alert>
	);
}

/** The resolved lookup names + unit formatter every row's description needs. */
type ActivityLookups = ReturnType<typeof useActivityLookups>;

function isRefusal(error: Error): boolean {
	return error instanceof ActivityRequestError && error.refused;
}

/**
 * One day of the log, collapsible.
 *
 * A month-wide range is a page of days, and a supervisor scanning for the one
 * they care about should not have to scroll past four hundred rows to reach it.
 * Open by default — the common case is a single day, where a closed section
 * would be one click of pure ceremony.
 */
function ActivityDaySection({
	day,
	selectedKey,
	lookups,
	onSelect,
}: {
	readonly day: ActivityDayGroup;
	readonly selectedKey: string | null;
	readonly lookups: ActivityLookups;
	readonly onSelect: (key: string) => void;
}) {
	const [open, setOpen] = useState(true);

	return (
		<li>
			<Collapsible onOpenChange={setOpen} open={open}>
				<CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50">
					<ChevronRightIcon
						aria-hidden="true"
						className={cn(
							'size-4 shrink-0 text-muted-foreground transition-transform',
							open && 'rotate-90',
						)}
					/>
					<span className="flex-1 font-medium text-foreground text-sm">
						{formatListDate(day.date)}
					</span>
					<span className="text-muted-foreground text-xs tabular-nums">{day.entries.length}</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="grid gap-2 pt-1 pb-2">
						{day.families.map((group) => (
							<div className="grid gap-1" key={group.family}>
								<h3 className="px-2 font-medium text-muted-foreground text-xs">
									{ACTIVITY_FAMILIES.find((family) => family.key === group.family)?.label}
								</h3>
								<ul className="grid">
									{group.entries.map((entry) => (
										<ActivityRow
											entry={entry}
											isSelected={activityEntryKey(entry) === selectedKey}
											key={activityEntryKey(entry)}
											lookups={lookups}
											onSelect={onSelect}
										/>
									))}
								</ul>
							</div>
						))}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}

/**
 * One entry, as its own explorer would list it.
 *
 * `ExplorerRow` is the shared list item every explorer already uses, so a row
 * here reads the way the same record reads on the page it lives on — the same
 * title, the same subtitle, the same status pill. Date and personnel are the
 * two things it omits, and they are the two things this page already knows: the
 * section is the date, and the picker is the person.
 */
function ActivityRow({
	entry,
	isSelected,
	lookups,
	onSelect,
}: {
	readonly entry: ActivityEntry;
	readonly isSelected: boolean;
	readonly lookups: ActivityLookups;
	readonly onSelect: (key: string) => void;
}) {
	const key = activityEntryKey(entry);
	const { title, subtitle } = describeActivityEntry(
		entry,
		lookups.nameById,
		lookups.formatQuantity,
	);
	const noun = ACTIVITY_CATEGORY_LABEL[entry.category];
	const verb = ACTIVITY_ROLE_LABEL[entry.role] ?? entry.role;
	const link = { to: ACTIVITY_DETAIL_ROUTE[entry.category], params: { id: entry.id } };

	return (
		<ExplorerRow
			// One badge, and only where the record has a state worth a pill. The
			// panel is half a page wide, and a second one pushed the row into a
			// horizontal scroll.
			badges={<ActivityStatusBadge entry={entry} />}
			detailLabel={`View details for ${title}`}
			detailLink={link}
			isSelected={isSelected}
			onSelect={() => onSelect(key)}
			selectLabel={`Show ${title} on the map`}
			// The verb leads, because what the person did to the record is the one
			// thing this page adds over the record's own explorer — and it says
			// "Assisted" in words rather than resting on the hollow pin alone. The
			// date rail is omitted: the day heading above already carries the date,
			// so the time of day rides at the end for the three kinds that have one.
			subtitle={[verb, subtitle, formatActivityTime(entry.occurredAt)]
				.filter((part) => part !== null && part !== '')
				.join(' · ')}
			swatch={{
				color: ACTIVITY_FAMILY_COLORS[entry.family],
				label: `${noun}, ${entry.involvement === 'assisting' ? 'assisted' : 'performed'}`,
			}}
			title={title}
			titleLink={link}
		/>
	);
}

/**
 * The one status each category reads by, in the badge its explorer uses.
 *
 * The server sends a single token per category rather than a column per kind,
 * so this is where it becomes the right pill.
 */
function ActivityStatusBadge({ entry }: { readonly entry: ActivityEntry }) {
	const status = activityStatus(entry);
	if (status === null) {
		return null;
	}
	if (status.kind === 'density') {
		return <DensityBadge density={status.density} />;
	}
	if (status.kind === 'wetness') {
		return <WetnessBadge isWet={status.isWet} />;
	}

	return (
		<Badge tone={ACTIVITY_DETAIL_TONE[status.token]} variant="outline">
			{ACTIVITY_DETAIL_LABEL[status.token]}
		</Badge>
	);
}

const ACTIVITY_DETAIL_LABEL: Readonly<Record<ActivityStateToken, string>> = {
	active: 'Active',
	inactive: 'Inactive',
	inaccessible: 'Inaccessible',
	problem: 'Problem',
	zero: 'Zero Result',
	open: 'Open',
	closed: 'Closed',
};

const ACTIVITY_DETAIL_TONE: Readonly<
	Record<ActivityStateToken, 'success' | 'neutral' | 'warning' | 'info'>
> = {
	active: 'success',
	inactive: 'neutral',
	inaccessible: 'warning',
	problem: 'warning',
	zero: 'neutral',
	open: 'info',
	closed: 'neutral',
};

function PanelMessage({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="grid flex-1 place-items-center p-6 text-center">
			<div className="grid gap-1">
				<p className="font-medium text-foreground text-sm">{title}</p>
				<p className="text-muted-foreground text-sm">{children}</p>
			</div>
		</div>
	);
}

function ActivityLoading() {
	return (
		<div aria-hidden="true" className="grid gap-1.5 p-3">
			{['a-1', 'a-2', 'a-3', 'a-4', 'a-5'].map((key) => (
				<div className="flex items-center gap-2.5 px-2 py-1.5" key={key}>
					<Skeleton className="size-2.5 rounded-full" />
					<Skeleton className="h-4 flex-1" />
				</div>
			))}
		</div>
	);
}

// --- record dispatch ----------------------------------------------------------
//
// Nine self-fetching cards, all sharing the `{ id, onClose }` signature, so the
// union carries ids alone and each card resolves its own content.

interface ActivityCardProps {
	readonly id: string;
	readonly onClose: () => void;
}

const ACTIVITY_MAP_CARD: Readonly<
	Record<ActivityEntry['category'], ComponentType<ActivityCardProps>>
> = {
	habitat: HabitatMapCard,
	inspection: InspectionMapCard,
	trap: TrapMapCard,
	collection: CollectionMapCard,
	application: ApplicationMapCard,
	sourceReduction: SourceReductionMapCard,
	biocontrol: BiocontrolMapCard,
	outreach: OutreachMapCard,
	serviceRequest: ServiceRequestMapCard,
};

const ACTIVITY_DETAIL_ROUTE = {
	habitat: '/larval-surveillance/habitats/$id',
	inspection: '/larval-surveillance/inspections/$id',
	trap: '/adult-surveillance/traps/$id',
	collection: '/adult-surveillance/collections/$id',
	application: '/control-operations/chemical/$id',
	sourceReduction: '/control-operations/source-reduction/$id',
	biocontrol: '/control-operations/biocontrol/$id',
	outreach: '/public-engagement/outreach/$id',
	serviceRequest: '/public-engagement/service-requests/$id',
} as const satisfies Record<ActivityEntry['category'], string>;

function ActivityFocusCard({
	entry,
	onClose,
}: {
	readonly entry: ActivityEntry;
	readonly onClose: () => void;
}) {
	const CardForCategory = ACTIVITY_MAP_CARD[entry.category];
	return <CardForCategory id={entry.id} onClose={onClose} />;
}

import { mapFamily } from '@simmer-mosquito/design-tokens';
import type { ActivityFamily } from '@simmer-mosquito/domain';
import { boundsFromGeoJson } from '@simmer-mosquito/mapping';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Autocomplete } from '@simmer-mosquito/ui-web/components/ui/autocomplete';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ComponentType, type ReactNode, useCallback, useMemo, useState } from 'react';
import { DateRangeFilter } from '../components/date-range-filter';
import {
	ExplorerMapPage,
	ExplorerRow,
	useDateRangeFilters,
	useExplorerPanel,
	useFlyToSelection,
	usePersonnelOptions,
} from '../components/explorer';
import { DensityBadge, WetnessBadge } from '../components/larval-display';
import { MapCanvas } from '../components/map';
import type { MapInset } from '../components/map/map-inset';
import { useAuthSnapshot } from '../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../hooks/use-organization-time-zone';
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
	ACTIVITY_FAMILY_LABELS,
	ACTIVITY_ROLE_LABEL,
	type ActivityDayGroup,
	type ActivityEntry,
	type ActivityStateToken,
	activityEntryKey,
	activityPanelState,
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

// Neither the person picker nor the date window narrows this page down, so
// neither counts the way an explorer's filters do.
const ACTIVITY_FILTER_COUNTING = { uncounted: ['profile', 'from', 'to'] } as const;

export const Route = createFileRoute('/activity-monitor')({
	component: ActivityMonitorRoute,
	validateSearch: searchValidator(ACTIVITY_FILTER_CODECS),
});

function ActivityMonitorRoute() {
	const filters = useActivityFilters();
	const personnel = usePersonnelOptions();
	const lookups = useActivityLookups();

	const activity = useProfileActivity(filters.window);
	// Switching person needs no explicit reset: the selection resolves by key
	// against the entries on screen, so a key the new log does not contain is
	// already no selection.
	const selection = useActivitySelection(activity.data?.items);
	const { view } = selection;
	const reach = activityReach(activity.data, view.items.length);
	const panelState = activityPanelState({
		hasProfile: filters.window.profileId !== null,
		isLoading: activity.isLoading,
		error: activity.error,
		isEmpty: view.days.length === 0,
	});

	// The person picker and the date window are this page, not a way of cutting
	// it down, so the card they live in opens with it.
	const panel = useExplorerPanel({ filtersOpen: true });

	return (
		<ExplorerMapPage
			activeFilterCount={filters.activeCount}
			filters={
				<>
					<ProfilePicker
						onChange={filters.setProfile}
						options={personnel.options}
						value={filters.window.profileId}
					/>
					<DateRangeFilter {...filters.dateRange} />
					<FamilyCounts counts={view.counts} />
				</>
			}
			heading={{
				title: 'Activity Monitor',
				total: view.items.length,
				isLoading: activity.isLoading,
				noun: { one: 'entry', many: 'entries' },
			}}
			map={
				<>
					<MapCanvas
						activityLayer={selection.activityLayer}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData={view.bounds}
						inset={panel.inset}
						onMapReady={selection.onMapReady}
						searchWidth={panel.width}
					/>
					<ActivityFocusCard entry={view.selected} inset={panel.inset} onClose={selection.clear} />
				</>
			}
			panel={panel}
			results={{
				// A log grouped by day, not a flat list: the panel fills the rows slot
				// with its own body, including the cap notice and the messages that
				// name a reason. See {@link ExplorerResults}.
				body: (
					<ActivityPanel
						days={view.days}
						lookups={lookups}
						message={panelState.message}
						onSelect={selection.select}
						selectedKey={selection.selectedKey}
						timeZone={filters.timeZone}
						total={reach.total}
						truncated={reach.truncated}
					/>
				),
				isEmpty: panelState.isEmpty,
				emptyTitle: panelState.emptyTitle,
				emptyDescription: panelState.emptyDescription,
				// A log line is one dot and one line of text, not the 60px record card
				// the rail sizes its placeholders to by default.
				skeletonClassName: 'h-8',
			}}
		/>
	);
}

/**
 * The one selection the map and the list both answer to.
 *
 * A row and a pin are two views of the same entry, so picking either has to
 * move the other: the map flies to what the list selected, and the list
 * highlights what the map was clicked on. Keeping that in one hook is what
 * stops the two halves drifting into separate selections, which is how a card
 * ends up describing a record the map is not looking at.
 */
function useActivitySelection(items: readonly ActivityEntry[] | undefined) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const view = useActivityView(items, selectedKey);

	// Keyed on the coordinates rather than the entry, so a refetch that hands
	// back an equal-but-new object does not re-fly the camera.
	useFlyToSelection(map, view.selected);

	return {
		view,
		selectedKey,
		select: setSelectedKey,
		clear: useCallback(() => setSelectedKey(null), []),
		onMapReady: useCallback((instance: MapboxMap) => setMap(instance), []),
		activityLayer: useMemo(
			() => ({ data: view.mapData, selectedKey, onSelectFeature: setSelectedKey }),
			[view.mapData, selectedKey],
		),
	};
}

/**
 * The page's filters, held in the URL: which person, and which dates.
 *
 * Defaults to the signed-in person and today, so the page is useful to a
 * collector reviewing their own day without configuring anything — and because
 * the filters are in the address, one particular person's one particular day is
 * a link somebody can be sent.
 */
function useActivityFilters(): {
	/** Always zero here: see `ACTIVITY_FILTER_COUNTING`. */
	readonly activeCount: number;
	readonly window: {
		readonly profileId: string | null;
		readonly dateFrom: string;
		readonly dateTo: string;
	};
	readonly dateRange: ReturnType<typeof useDateRangeFilters>;
	readonly setProfile: (next: string) => void;
	/** The agency's zone, which every date and time on this page is read in. */
	readonly timeZone: string | undefined;
} {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const snapshot = useAuthSnapshot();
	const ownProfileId =
		snapshot?.authenticated === true ? (snapshot.localIdentity.profileId ?? '') : '';

	const defaults = useMemo<ActivityFilters>(
		() => ({ profile: ownProfileId, from: today, to: today }),
		[ownProfileId, today],
	);
	const { filters, setFilters, activeCount } = useSearchFilters(
		defaults,
		ACTIVITY_FILTER_CODECS,
		ACTIVITY_FILTER_COUNTING,
	);
	const setProfile = useCallback((next: string) => setFilters({ profile: next }), [setFilters]);

	return {
		activeCount,
		window: {
			profileId: filters.profile === '' ? null : filters.profile,
			dateFrom: filters.from,
			dateTo: filters.to,
		},
		dateRange: useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters }),
		setProfile,
		timeZone,
	};
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
			value={value ?? ''}
		/>
	);
}

/** Per-family totals for the whole range. These are also the map's legend. */
function FamilyCounts({ counts }: { readonly counts: Readonly<Record<ActivityFamily, number>> }) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
			{ACTIVITY_FAMILY_LABELS.map(({ key, label }) => (
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

function FamilyDot({ family }: { readonly family: ActivityFamily }) {
	return (
		<span
			aria-hidden="true"
			className="size-2.5 shrink-0 rounded-full"
			style={{ backgroundColor: mapFamily[family] }}
		/>
	);
}

// --- the log -----------------------------------------------------------------

function ActivityPanel({
	days,
	message,
	truncated,
	total,
	lookups,
	timeZone,
	selectedKey,
	onSelect,
}: {
	readonly days: readonly ActivityDayGroup[];
	/**
	 * A reason the frame's empty copy cannot carry: no Profile picked, a refusal
	 * naming the window the server declined, or an outage. Loading and an empty
	 * range are the frame's, so they never arrive here.
	 */
	readonly message: { readonly title: string; readonly body: string } | null;
	readonly truncated: boolean;
	/** What the response reports for the whole question, cap ignored. */
	readonly total: number;
	readonly lookups: ActivityLookups;
	readonly selectedKey: string | null;
	readonly timeZone: string | undefined;
	readonly onSelect: (key: string) => void;
}) {
	const shownCount = days.reduce((running, day) => running + day.entries.length, 0);
	if (message !== null) {
		return <PanelMessage title={message.title}>{message.body}</PanelMessage>;
	}

	return (
		<>
			{truncated ? <TruncationNotice shown={shownCount} total={total} /> : null}
			<ol className="grid gap-4 p-3">
				{days.map((day) => (
					<ActivityDaySection
						day={day}
						key={day.date}
						lookups={lookups}
						onSelect={onSelect}
						selectedKey={selectedKey}
						timeZone={timeZone}
					/>
				))}
			</ol>
			<WhatThisDoesNotShow />
		</>
	);
}

/**
 * What the log cannot tell you, on the page rather than in a code comment.
 *
 * Each of these is a place where an operator could otherwise draw a confident
 * wrong conclusion — that somebody was at a site they only typed up, that a
 * quiet-looking morning is ordered, that a colleague assisted on nothing. They
 * are consequences of what the records hold, so they cannot be fixed here; the
 * honest move is to say so where the conclusion would be drawn.
 */
function WhatThisDoesNotShow() {
	return (
		<details className="mx-3 mb-3 rounded-md border border-border/50 bg-muted/25 px-3 py-2">
			<summary className="cursor-pointer font-medium text-muted-foreground text-xs">
				What this log cannot show
			</summary>
			<ul className="mt-2 grid gap-1.5 text-muted-foreground text-xs">
				<li>
					Habitats and traps are listed as <span className="font-medium">Created</span>, which means
					the record was entered — not that the person stood at the site. Every other kind of entry
					here names someone who did the work.
				</li>
				<li>
					Only three kinds of entry carry a time of day. The rest are dated to the day, so the order
					within a day is partial and no route is drawn.
				</li>
				<li>
					Assisting crew can only be recorded on inspections, collections, chemical applications,
					source reduction, biocontrol, and outreach. Site records and service requests have nowhere
					to name them.
				</li>
				<li>
					A trap recorded with a date and a duration, rather than exact timestamps, has no separate
					set time — both its visits fall on the collection date.
				</li>
			</ul>
		</details>
	);
}

/** The row cap bit, said out loud: a partial log must never read as a whole one. */
function TruncationNotice({ shown, total }: { readonly shown: number; readonly total: number }) {
	return (
		<Alert className="m-3" variant="destructive">
			<AlertTitle>This log is incomplete</AlertTitle>
			<AlertDescription>
				Showing the first {shown.toLocaleString()} of {total.toLocaleString()} entries. Narrow the
				dates to see all of them.
			</AlertDescription>
		</Alert>
	);
}

/** The resolved lookup names + unit formatter every row's description needs. */
type ActivityLookups = ReturnType<typeof useActivityLookups>;

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
	timeZone,
	onSelect,
}: {
	readonly day: ActivityDayGroup;
	readonly selectedKey: string | null;
	readonly lookups: ActivityLookups;
	readonly timeZone: string | undefined;
	readonly onSelect: (key: string) => void;
}) {
	return (
		<li>
			<CollapsibleSection count={day.entries.length} level="day" title={formatListDate(day.date)}>
				<div className="grid gap-1 pt-1 pb-2">
					{day.families.map((group) => (
						<CollapsibleSection
							count={group.entries.length}
							key={group.family}
							level="family"
							title={familyLabel(group.family)}
						>
							<ul className="grid pb-1">
								{group.entries.map((entry) => (
									<ActivityRow
										entry={entry}
										isSelected={activityEntryKey(entry) === selectedKey}
										key={activityEntryKey(entry)}
										lookups={lookups}
										onSelect={onSelect}
										timeZone={timeZone}
									/>
								))}
							</ul>
						</CollapsibleSection>
					))}
				</div>
			</CollapsibleSection>
		</li>
	);
}

/**
 * How much of the whole answer this response carries.
 *
 * `total` is what the server counted for the question, which is larger than the
 * list when the row cap bit; before a response arrives it is simply what is on
 * screen, so the header never claims a total it does not have.
 */
function activityReach(
	response: { readonly total: number; readonly truncated: boolean } | undefined,
	shown: number,
): { readonly total: number; readonly truncated: boolean } {
	return response === undefined ? { total: shown, truncated: false } : response;
}

function familyLabel(family: ActivityFamily): string {
	return ACTIVITY_FAMILY_LABELS.find((entry) => entry.key === family)?.label ?? family;
}

/**
 * A day, or one family within a day, collapsed to its heading and its count.
 *
 * Both levels fold, because a range wide enough to need folding is usually wide
 * in both directions: a month of days, and a day where one family did forty
 * things and the rest did two. Open by default at both levels — the common case
 * is a single day, where anything closed is a click of pure ceremony.
 *
 * The two levels differ only in weight, so the nesting reads as nesting rather
 * than as two lists that happen to be indented.
 */
function CollapsibleSection({
	title,
	count,
	level,
	children,
}: {
	readonly title: string;
	readonly count: number;
	readonly level: 'day' | 'family';
	readonly children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	const isDay = level === 'day';

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger
				className={cn(
					'flex w-full items-center gap-2 rounded-md py-1.5 text-left hover:bg-muted/50',
					isDay ? 'px-2' : 'px-2 pl-6',
				)}
			>
				<ChevronRightIcon
					aria-hidden="true"
					className={cn(
						'shrink-0 text-muted-foreground transition-transform',
						isDay ? 'size-4' : 'size-3.5',
						open && 'rotate-90',
					)}
				/>
				<span
					className={cn(
						'flex-1',
						isDay
							? 'font-medium text-foreground text-sm'
							: 'font-medium text-muted-foreground text-xs',
					)}
				>
					{title}
				</span>
				<span className="text-muted-foreground text-xs tabular-nums">{count}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>{children}</CollapsibleContent>
		</Collapsible>
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
	timeZone,
	onSelect,
}: {
	readonly entry: ActivityEntry;
	readonly isSelected: boolean;
	readonly lookups: ActivityLookups;
	readonly timeZone: string | undefined;
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
			subtitle={[verb, subtitle, formatActivityTime(entry.occurredAt, timeZone)]
				.filter((part) => part !== null && part !== '')
				.join(' · ')}
			swatch={{
				color: mapFamily[entry.family],
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

// --- record dispatch ----------------------------------------------------------
//
// Nine self-fetching cards, all sharing the `{ id, inset, onClose }` signature,
// so the union carries ids alone and each card resolves its own content.

interface ActivityCardProps {
	readonly id: string;
	readonly inset?: MapInset | undefined;
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
	inset,
	onClose,
}: {
	readonly entry: ActivityEntry | null;
	/** What is floating over the map, so the card centres clear of it. */
	readonly inset?: MapInset | undefined;
	readonly onClose: () => void;
}) {
	if (entry === null) {
		return null;
	}
	const CardForCategory = ACTIVITY_MAP_CARD[entry.category];
	return <CardForCategory id={entry.id} inset={inset} onClose={onClose} />;
}

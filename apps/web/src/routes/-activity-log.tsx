import { mapFamily } from '@simmer-mosquito/design-tokens';
import type { ActivityFamily } from '@simmer-mosquito/domain';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ComponentType, type ReactNode, useState } from 'react';
import { ExplorerRow } from '../components/explorer';
import { DensityBadge, WetnessBadge } from '../components/larval-display';
import type { MapInset } from '../components/map/map-inset';
import {
	ACTIVITY_CATEGORY_LABEL,
	ACTIVITY_FAMILY_LABELS,
	ACTIVITY_ROLE_LABEL,
	type ActivityCopy,
	type ActivityDayGroup,
	type ActivityEntry,
	type ActivityStateToken,
	activityEntryKey,
	activityStatus,
	describeActivityEntry,
	formatActivityTime,
	type useActivityLookups,
} from './-activity-data';
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

// One Profile's field work as a log, and the card that opens on the record a row
// or a pin names. Daily Work reads it over one day; the grouping below still
// takes a window, because the endpoint behind it answers one.
// Dash-prefixed so TanStack Router ignores this file as a route.

/** The resolved lookup names + unit formatter every row's description needs. */
export type ActivityLookups = ReturnType<typeof useActivityLookups>;

export function ActivityLog({
	days,
	message,
	truncated,
	total,
	copy,
	lookups,
	timeZone,
	selectedKey,
	onSelect,
}: {
	readonly days: readonly ActivityDayGroup[];
	/**
	 * A reason the frame's empty copy cannot carry: a refusal naming the window
	 * the server declined, or an outage. Loading and an empty window are the
	 * frame's, so they never arrive here.
	 */
	readonly message: { readonly title: string; readonly body: string } | null;
	readonly truncated: boolean;
	/** What the response reports for the whole question, cap ignored. */
	readonly total: number;
	/** The wording that differs between a window of days and a single day. */
	readonly copy: ActivityCopy;
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
			{truncated ? (
				<TruncationNotice advice={copy.truncationAdvice} shown={shownCount} total={total} />
			) : null}
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
					the record was entered — not that the person stood there. Every other kind of entry here
					names someone who did the work.
				</li>
				<li>
					Only three kinds of entry carry a time of day. The rest are dated to the day, so the order
					within a day is partial and no route is drawn.
				</li>
				<li>
					Assisting crew can only be recorded on inspections, collections, chemical applications,
					source reduction, biocontrol, and outreach. Habitats, traps, and service requests have
					nowhere to name them.
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
function TruncationNotice({
	shown,
	total,
	advice,
}: {
	readonly shown: number;
	readonly total: number;
	readonly advice: string | null;
}) {
	return (
		<Alert className="m-3" variant="destructive">
			<AlertTitle>This log is incomplete</AlertTitle>
			<AlertDescription>
				Showing the first {shown.toLocaleString()} of {total.toLocaleString()} entries.
				{advice === null ? null : ` ${advice}`}
			</AlertDescription>
		</Alert>
	);
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
 * section is the date, and the page is the person.
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
		<li>
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
		</li>
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
	readonly children: ReactNode;
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

export function ActivityFocusCard({
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

import { mapFamily } from '@simmer-mosquito/design-tokens';
import type { ActivityFamily } from '@simmer-mosquito/domain';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ComponentType, type ReactNode, useState } from 'react';
import { ExplorerRow } from '../components/explorer';
import type { MapInset } from '../components/map/map-inset';
import {
	ACTIVITY_CATEGORY_LABEL,
	ACTIVITY_DETAIL_ROUTE,
	ACTIVITY_FAMILY_LABELS,
	ACTIVITY_ROLE_LABEL,
	type ActivityCopy,
	type ActivityEntry,
	type ActivityFamilyGroup,
	type ActivityLookups,
	activityBadgeFacts,
	activityEntryKey,
	activityTags,
	describeActivityEntry,
	formatActivityTime,
} from './-activity-data';
import { HabitatMapCard } from './-habitat-map-card';
import { hasDetailBadges, RecordBadges, type StatusPlacement } from './-record-badges';
import { CollectionMapCard } from './adult-surveillance/-collection-map-card';
import { TrapMapCard } from './adult-surveillance/-trap-map-card';
import { ApplicationMapCard } from './control-operations/-application-map-card';
import { BiocontrolMapCard } from './control-operations/-biocontrol-map-card';
import { SourceReductionMapCard } from './control-operations/-source-reduction-map-card';
import { InspectionMapCard } from './larval-surveillance/-inspection-map-card';
import { OutreachMapCard } from './public-engagement/-outreach-map-card';
import { ServiceRequestMapCard } from './public-engagement/-service-request-map-card';

// One day of one Profile's field work as a log, and the card that opens on the
// record a row or a pin names. The log is a list of family sections and nothing
// above them: the date is the stepper's, in the panel header, and Daily Work is
// the one caller.
// Dash-prefixed so TanStack Router ignores this file as a route.

export function ActivityLog({
	families,
	message,
	truncated,
	total,
	copy,
	lookups,
	timeZone,
	selectedKey,
	onSelect,
}: {
	/** The day's entries, split into families. Empty families are already left out. */
	readonly families: readonly ActivityFamilyGroup[];
	/**
	 * A reason the frame's empty copy cannot carry: a refusal naming the day the
	 * server declined, or an outage. Loading and an empty day are the frame's,
	 * so they never arrive here.
	 */
	readonly message: { readonly title: string; readonly body: string } | null;
	readonly truncated: boolean;
	/** What the response reports for the whole question, cap ignored. */
	readonly total: number;
	/** What the page says around the log: the refusal title and the truncation advice. */
	readonly copy: ActivityCopy;
	readonly lookups: ActivityLookups;
	readonly selectedKey: string | null;
	readonly timeZone: string | undefined;
	readonly onSelect: (key: string) => void;
}) {
	const shownCount = families.reduce((running, group) => running + group.entries.length, 0);
	if (message !== null) {
		return <PanelMessage title={message.title}>{message.body}</PanelMessage>;
	}

	return (
		<>
			{truncated ? (
				<TruncationNotice advice={copy.truncationAdvice} shown={shownCount} total={total} />
			) : null}
			<ol className="grid gap-1 p-3">
				{families.map((group) => (
					<ActivityFamilySection
						group={group}
						key={group.family}
						lookups={lookups}
						onSelect={onSelect}
						selectedKey={selectedKey}
						timeZone={timeZone}
					/>
				))}
			</ol>
		</>
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
				Showing the first {shown.toLocaleString('en-US')} of {total.toLocaleString('en-US')}{' '}
				entries.
				{advice === null ? null : ` ${advice}`}
			</AlertDescription>
		</Alert>
	);
}

/**
 * One family of the day's work, collapsible.
 *
 * The families are the top level of the log. A day heading used to sit over
 * them, carried from the surface this page replaced, which read a window of
 * days and needed a way past four hundred rows; this page reads one day and the
 * stepper already names it, so the heading repeated the header and the fold hid
 * the whole log behind one click (#1003). Do not put it back: the way to scan
 * past days here is the stepper.
 *
 * A family still folds, because a day where one family did forty things and the
 * rest did two is common, and a reader after the two should not scroll the
 * forty. Open by default, so the usual day is read without a click.
 */
function ActivityFamilySection({
	group,
	selectedKey,
	lookups,
	timeZone,
	onSelect,
}: {
	readonly group: ActivityFamilyGroup;
	readonly selectedKey: string | null;
	readonly lookups: ActivityLookups;
	readonly timeZone: string | undefined;
	readonly onSelect: (key: string) => void;
}) {
	return (
		<li>
			<CollapsibleSection count={group.entries.length} title={familyLabel(group.family)}>
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
		</li>
	);
}

function familyLabel(family: ActivityFamily): string {
	return ACTIVITY_FAMILY_LABELS.find((entry) => entry.key === family)?.label ?? family;
}

/**
 * A heading with its count, folding the rows under it.
 *
 * One weight, flush with the panel edge, because the log has one level: the
 * indent and the lighter type that once marked a family as nested under a day
 * went with the day (#1003).
 */
function CollapsibleSection({
	title,
	count,
	children,
}: {
	readonly title: string;
	readonly count: number;
	readonly children: ReactNode;
}) {
	const [open, setOpen] = useState(true);

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50">
				<ChevronRightIcon
					aria-hidden="true"
					className={cn(
						'size-4 shrink-0 text-muted-foreground transition-transform',
						open && 'rotate-90',
					)}
				/>
				<span className="flex-1 font-medium text-foreground text-sm">{title}</span>
				<span className="text-muted-foreground text-xs tabular-nums">{count}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>{children}</CollapsibleContent>
		</Collapsible>
	);
}

/**
 * One entry, as its own explorer would list it.
 *
 * `ExplorerRow` is the shared list item every explorer already uses, and the
 * badges come from the shared register beside it, so a row here reads the way
 * the same record reads on the page it lives on: the same title, the same
 * subtitle, the same life-stage strip. Date and personnel are the two things it
 * omits, and they are the two things this page already knows — the stepper is
 * the date, and the page is the person.
 *
 * The state arrives as a pill rather than as the dot, because this page paints
 * nine record kinds on one map and spends the dot on which family the work
 * belongs to. See {@link StatusPlacement}.
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
	const facts = activityBadgeFacts(entry);

	return (
		<li>
			<ExplorerRow
				badges={<RecordBadges facts={facts} status={ACTIVITY_STATUS_PLACEMENT} />}
				detailLabel={`View details for ${title}`}
				detailLink={link}
				isSelected={isSelected}
				onSelect={() => onSelect(key)}
				selectLabel={`Show ${title} on the map`}
				// A line of their own where the record draws more than its state, with
				// no date rail here to decide it. A state pill alone stays beside the
				// title and keeps the row short, which is what a 107-entry day needs.
				stackBadges={hasDetailBadges(facts)}
				// The verb leads, because what the person did to the record is the one
				// thing this page adds over the record's own explorer — and it says
				// "Assisted" in words rather than resting on the hollow pin alone. The
				// date rail is omitted: the stepper in the panel header already carries
				// the date, so the time of day rides at the end for the three kinds that
				// have one.
				subtitle={[verb, subtitle, formatActivityTime(entry.occurredAt, timeZone)]
					.filter((part) => part !== null && part !== '')
					.join(' · ')}
				swatch={{
					color: mapFamily[entry.family],
					label: `${noun}, ${entry.involvement === 'assisting' ? 'assisted' : 'performed'}`,
				}}
				tags={activityTags(entry, lookups.tagById)}
				title={title}
				titleLink={link}
			/>
		</li>
	);
}

/**
 * The dot is the family this work belongs to, so the record's own state has
 * nowhere to go but a pill. Every explorer answers the other way.
 */
const ACTIVITY_STATUS_PLACEMENT: StatusPlacement = 'badge';

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

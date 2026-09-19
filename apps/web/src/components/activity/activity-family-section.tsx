import type { ActivityFamily } from '@simmer-mosquito/domain';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ReactNode, useState } from 'react';
import {
	ACTIVITY_FAMILY_LABELS,
	type ActivityFamilyGroup,
	type ActivityLookups,
	activityEntryKey,
} from './activity-data';
import { ActivityRow } from './activity-row';

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
export function ActivityFamilySection({
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

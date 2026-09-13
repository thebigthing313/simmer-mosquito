/**
 * One person's day, collapsed to a single summary row until opened.
 *
 * A crew of six working a heavy day puts several hundred rows in the panel
 * above this, and every one of them had to be scrolled past to reach the next
 * person. Closed, the row answers the question the panel is usually asked: how
 * much each person got through, and whatever else their domain thinks a day is
 * summarised by, which arrives as `aside`.
 *
 * The larval and control-operations overviews drew this block a line apiece
 * differently and were otherwise identical (#873). The rows themselves stay
 * with their domain, because an inspection row and a control action row share
 * nothing but the `<li>`.
 */

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { UNASSIGNED_GROUP_KEY } from '../lib/row-groups';

const PersonnelIcon = iconRegistry.entities.organization.icon;

export function PersonGroupBlock({
	name,
	groupKey,
	count,
	aside,
	children,
}: {
	readonly name: string;
	/** Which group this is, so the unassigned one can say so in its styling. */
	readonly groupKey: string;
	readonly count: number;
	/** A domain's one-line summary of the group, drawn before the count. */
	readonly aside?: ReactNode;
	/** The group's rows, as `<li>` children of this block's list. */
	readonly children: ReactNode;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible asChild onOpenChange={setOpen} open={open}>
			<section>
				<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
					{open ? (
						<ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<ChevronRightIcon
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
					)}
					<PersonnelIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
					<span
						className={cn(
							'min-w-0 flex-1 truncate font-medium text-sm',
							groupKey === UNASSIGNED_GROUP_KEY && 'text-muted-foreground italic',
						)}
					>
						{name}
					</span>
					{aside}
					<span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
						{count}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<ul className="grid px-3 pb-3">{children}</ul>
				</CollapsibleContent>
			</section>
		</Collapsible>
	);
}

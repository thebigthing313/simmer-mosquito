import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { DuplicateGroup, DuplicateReason } from '../../hooks/use-merge-candidates';
import { DUPLICATE_REASON_LABELS, type DuplicatePageConfig } from './record-cleanup-config';

const FilterIcon = iconRegistry.actions.filter.icon;

export interface MatchTypeFilterProps {
	readonly config: DuplicatePageConfig;
	/** Every proposal the server returned, before the filter. */
	readonly groups: readonly DuplicateGroup[];
	/** The match types selected. Empty means all of them. */
	readonly selected: ReadonlySet<DuplicateReason>;
	readonly onChange: (selected: ReadonlySet<DuplicateReason>) => void;
}

/**
 * Narrowing the page to one kind of evidence.
 *
 * Contacts are compared three ways and a busy address book proposes on two, so
 * an agency working through duplicates is really working through one kind at a
 * time: a shared phone number is a different judgement from two rows on one
 * rooftop, and reading them interleaved means switching between the two on every
 * panel.
 *
 * The counts are on the menu items rather than beside the trigger. They are what
 * makes the menu answer a question on its own ("is there anything on email?")
 * instead of only being a way to hide things.
 *
 * Empty means all, rather than the filter starting with everything ticked. A
 * user who unticks the last one has asked for nothing rather than for
 * everything, and the page says so instead of quietly showing the lot back.
 */
export function MatchTypeFilter(props: MatchTypeFilterProps) {
	const counts = countByReason(props.groups);
	const isFiltered = props.selected.size > 0;

	function toggle(reason: DuplicateReason): void {
		const next = new Set(props.selected);
		if (!next.delete(reason)) {
			next.add(reason);
		}
		props.onChange(next);
	}

	return (
		/*
		 * Not modal. The menu stays open across several ticks, and a modal one marks
		 * everything behind it `aria-hidden`, so the page a reader is narrowing goes
		 * silent to a screen reader at the moment it changes. Non-modal also lets the
		 * list redraw in view while the menu is still up.
		 */
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant="outline">
					<FilterIcon aria-hidden="true" />
					{triggerLabel(props.selected, props.config)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>Match type</DropdownMenuLabel>
				{props.config.reasons.map((reason) => (
					<DropdownMenuCheckboxItem
						checked={props.selected.has(reason)}
						key={reason}
						onCheckedChange={() => toggle(reason)}
						// The menu stays open: picking match types is a set, and closing
						// after each one makes choosing two into two trips.
						onSelect={(event) => event.preventDefault()}
					>
						<span className="flex-1">{DUPLICATE_REASON_LABELS[reason]}</span>
						<span className="text-muted-foreground tabular-nums">{counts.get(reason) ?? 0}</span>
					</DropdownMenuCheckboxItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem disabled={!isFiltered} onSelect={() => props.onChange(new Set())}>
					Show all match types
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** How many proposals each match type accounts for. */
function countByReason(groups: readonly DuplicateGroup[]): ReadonlyMap<DuplicateReason, number> {
	const counts = new Map<DuplicateReason, number>();
	for (const group of groups) {
		counts.set(group.reason, (counts.get(group.reason) ?? 0) + 1);
	}
	return counts;
}

/**
 * What the button says.
 *
 * Names the types while they fit, because "Same email, Same phone" is the state
 * itself and "2 match types" is a number the reader has to open the menu to
 * cash in. Past two it stops being shorter than the menu and becomes a count.
 */
function triggerLabel(selected: ReadonlySet<DuplicateReason>, config: DuplicatePageConfig): string {
	if (selected.size === 0) {
		return 'All match types';
	}
	const chosen = config.reasons.filter((reason) => selected.has(reason));
	return chosen.length > 2
		? `${chosen.length} match types`
		: chosen.map((reason) => DUPLICATE_REASON_LABELS[reason]).join(', ');
}

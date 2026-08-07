import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';
import type { MoveAction } from './plan-move';

const ChevronUpIcon = iconRegistry.arrows.chevronUp.icon;
const ChevronDownIcon = iconRegistry.arrows.chevronDown.icon;
const MoreIcon = iconRegistry.arrows.moreHorizontal.icon;

/**
 * The buttons a user reorders a stop with: up, down, and an overflow menu
 * holding the jumps and whatever else the surface offers.
 *
 * Four surfaces reorder stops — habitat routes, trap routes, assignment plans
 * and mission stops — and `stop-order/` already held the parts that were
 * extracted from them (`useStopOrder`, `planMove`, `OrdinalBadge`,
 * `InlineEditField`). The controls were not, and the copies drifted in a way a
 * crew could feel: the **trap** route had no overflow menu at all, so
 * reordering a trap route meant clicking "up" once per position while the same
 * person reordering a **habitat** route could jump a stop to the top. Nothing
 * decided that — the trap copy was written before the menu existed.
 *
 * `extraActions` is the seam. Move-to-top and move-to-bottom are the same
 * everywhere and live here; "Remove from route" / "Remove from assignment" /
 * "Edit linked address…" are the surface's own and are passed in, already
 * separated, so the menu reads in the caller's vocabulary.
 */
export function StopReorderControls({
	index,
	isFirst,
	isLast,
	onMove,
	extraActions,
}: {
	readonly index: number;
	readonly isFirst: boolean;
	readonly isLast: boolean;
	readonly onMove: (index: number, action: MoveAction) => void;
	/** Menu items below the jumps, e.g. remove. Rendered after a separator. */
	readonly extraActions?: ReactNode;
}) {
	return (
		<div className="pointer-events-auto flex shrink-0 items-center gap-0.5">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						aria-label="Move up"
						className="size-7"
						disabled={isFirst}
						onClick={() => onMove(index, 'up')}
						size="icon"
						type="button"
						variant="ghost"
					>
						<ChevronUpIcon aria-hidden="true" className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Move up one stop</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						aria-label="Move down"
						className="size-7"
						disabled={isLast}
						onClick={() => onMove(index, 'down')}
						size="icon"
						type="button"
						variant="ghost"
					>
						<ChevronDownIcon aria-hidden="true" className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Move down one stop</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						aria-label="More stop actions"
						className="size-7"
						size="icon"
						type="button"
						variant="ghost"
					>
						<MoreIcon aria-hidden="true" className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem disabled={isFirst} onClick={() => onMove(index, 'top')}>
						Move to top
					</DropdownMenuItem>
					<DropdownMenuItem disabled={isLast} onClick={() => onMove(index, 'bottom')}>
						Move to bottom
					</DropdownMenuItem>
					{extraActions === undefined ? null : (
						<>
							<DropdownMenuSeparator />
							{extraActions}
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

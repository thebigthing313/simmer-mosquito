import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	FilterIcon,
	type iconRegistry,
	MoreHorizontalIcon,
	PlusIcon,
	ResetIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { MinimumRole } from '../../lib/write-access';
import { WriteOnly } from '../write-only';
import { ResultMeta } from './result-meta';

type RegistryIcon = typeof iconRegistry.entities.sample.icon;

/** The create control an explorer offers, hidden below its command's role floor. */
export interface ExplorerCreateAction {
	readonly to: NonNullable<LinkProps['to']>;
	/**
	 * What the control says. In the map frame it is a menu item rather than a
	 * button, so it has to name the record on its own: "Record" beside a panel
	 * titled Collections read fine and reads like nothing in a dropdown.
	 */
	readonly label: string;
	/** Matches the floor of the command the form sends. Defaults to `collector`. */
	readonly minimum?: MinimumRole;
}

/** The filter card's toggle, and what it has to report while the card is shut. */
export interface ExplorerFilterToggle {
	readonly isOpen: boolean;
	readonly onToggle: () => void;
	/** How many filters are off their default, so a shut card still says so. */
	readonly activeCount: number;
}

/**
 * The sticky block above an explorer's list: its title, its count, its create
 * button, and the filter controls underneath.
 *
 * The filters themselves stay with the page as `children` — every explorer
 * filters by something different, and a header that built the chip rows would
 * have to know about four families on chemical and three everywhere else. What
 * it does own is the row those controls sit under, which the nine explorers had
 * each laid out for themselves.
 */
export function ExplorerHeader({
	title,
	icon: Icon,
	total,
	isLoading,
	noun,
	create,
	collapse,
	filterToggle,
	menuItems,
	onResetFilters,
	children,
	surface = 'page',
	showTotal = false,
}: {
	readonly title: string;
	readonly icon?: RegistryIcon | undefined;
	readonly total: number;
	readonly isLoading: boolean;
	readonly noun?: { readonly one: string; readonly many: string } | undefined;
	readonly create?: ExplorerCreateAction | undefined;
	/** The control that shows and hides the filter card. Only the map frame has one. */
	readonly filterToggle?: ExplorerFilterToggle | undefined;
	/**
	 * Extra entries for the overflow menu, under the create action. For the
	 * surfaces whose work is not only "add one of these": the Regions tree files
	 * regions into folders and imports boundaries from a file.
	 */
	readonly menuItems?: ReactNode;
	/** Put every filter back to its default. Sits in the menu beside create. */
	readonly onResetFilters?: (() => void) | undefined;
	/**
	 * Put the whole panel away. Only the map frame passes one — a header above a
	 * column has nothing to collapse into.
	 */
	readonly collapse?:
		| {
				readonly onCollapse: () => void;
				readonly label: string;
				/** Points where the panel goes: aside on a side column, down on a sheet. */
				readonly icon: RegistryIcon;
		  }
		| undefined;
	/**
	 * The filter controls, stacked under the title row. Omitted where the surface
	 * gives its filters a panel of their own.
	 */
	readonly children?: ReactNode;
	/**
	 * What the header sits on. `page` is the opaque bar a scrolling page needs.
	 * `chrome` paints nothing, for the map frame's panel, which already carries
	 * the translucent surface the map's own controls wear. It also drops the
	 * count from this row: that panel ends in a footer stating the same number
	 * beside the page, and the pill it collapses into carries it too. A panel with
	 * no footer passes `showTotal` and gets it back.
	 */
	readonly surface?: 'page' | 'chrome';
	/**
	 * Draw the count in this row even on `chrome`. The map frame passes it for a
	 * panel with no pager under it, which is otherwise a panel that never says how
	 * many records it is holding.
	 */
	readonly showTotal?: boolean;
}) {
	const isChrome = surface === 'chrome';
	// In the map frame this header is one of two panels stacked in a 380px column,
	// and the other one spends 8px on its own header. At the page padding it was
	// spending 73px of the rail on a title the breadcrumb already carries.
	// Truncates rather than wraps: in a rail the create button is fixed-width, so
	// a long title is the thing that has to give.
	const heading = cn(
		'truncate font-semibold text-foreground leading-none',
		isChrome ? 'text-base' : 'text-lg',
	);

	return (
		<div
			className={stickyHeader({
				surface,
				gap: isChrome ? 'snug' : 'default',
				padding: isChrome ? 'compact' : 'default',
			})}
		>
			{/*
			 * `min-w-0` on the row and on the title. The header is a grid item and the
			 * title group is a flex item, and both default to `min-width: auto`, which
			 * is their content's width. So a long title plus a wide create button made
			 * the row wider than the panel instead of truncating, and the panel's
			 * `overflow-hidden` cut the collapse control off the right edge. It went
			 * unseen because the surfaces that named it are the long ones: Requests
			 * for Control, Service Requests, Weather Stations, Address Book.
			 */}
			<div className="flex min-w-0 items-center justify-between gap-3">
				{Icon === undefined ? (
					<h1 className={cn(heading, 'min-w-0')}>{title}</h1>
				) : (
					<div className="flex min-w-0 items-center gap-2">
						<Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
						<h1 className={cn(heading, 'min-w-0')}>{title}</h1>
					</div>
				)}
				<div className={cn('flex shrink-0 items-center', isChrome ? 'gap-0.5' : 'gap-2.5')}>
					{isChrome && !showTotal ? null : (
						<ResultMeta isLoading={isLoading} noun={noun} total={total} />
					)}
					{/*
					 * In the map frame the create action is a menu item rather than a button
					 * of its own. "Add Trap" spent 175px of the panel, more than the title
					 * beside it, to repeat a word the title had already said.
					 *
					 * A page-width header keeps the words and the fill: it has the room, and
					 * there the button is the only thing telling a reader they can add one.
					 */}
					{isChrome || create === undefined ? null : (
						<WriteOnly minimum={create.minimum ?? 'collector'}>
							<Button asChild size="sm">
								<Link to={create.to}>
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									{create.label}
								</Link>
							</Button>
						</WriteOnly>
					)}
					{filterToggle === undefined ? null : <FilterToggleButton toggle={filterToggle} />}
					{isChrome &&
					(create !== undefined || menuItems !== undefined || onResetFilters !== undefined) ? (
						<PanelMenu
							create={create}
							menuItems={menuItems}
							onResetFilters={onResetFilters}
							resetDisabled={(filterToggle?.activeCount ?? 0) === 0}
						/>
					) : null}
					{collapse === undefined ? null : <CollapseButton collapse={collapse} />}
				</div>
			</div>
			{children}
		</div>
	);
}

function CollapseButton({
	collapse,
}: {
	readonly collapse: {
		readonly onCollapse: () => void;
		readonly label: string;
		readonly icon: RegistryIcon;
	};
}) {
	const Icon = collapse.icon;
	return (
		<Button
			aria-label={collapse.label}
			onClick={collapse.onCollapse}
			size="icon-sm"
			variant="ghost"
		>
			<Icon aria-hidden="true" />
		</Button>
	);
}

/**
 * Show or hide the filter card, carrying the count while it is hidden.
 *
 * The count is the whole reason this is not a plain toggle. The card stands
 * beside the results and is shut by default, so without a number on the control
 * a reader who arrived on a filtered link cannot tell a surface with nothing in
 * range from one whose filters excluded everything.
 */
function FilterToggleButton({ toggle }: { readonly toggle: ExplorerFilterToggle }) {
	const { isOpen, onToggle, activeCount } = toggle;
	// Named "Filters" in both states, with the state on `aria-pressed`. Naming it
	// for the action instead would give it the same name as the card's own close,
	// which is two controls a screen reader cannot tell apart.
	const label = isOpen ? 'Hide filters' : 'Show filters';
	return (
		<Button
			aria-label="Filters"
			aria-pressed={isOpen}
			className="relative"
			onClick={onToggle}
			size="icon-sm"
			title={label}
			variant={isOpen ? 'secondary' : 'ghost'}
		>
			<FilterIcon aria-hidden="true" />
			{activeCount > 0 ? (
				<span
					aria-hidden="true"
					className="-top-1 -right-1 absolute flex size-4 items-center justify-center rounded-full bg-primary font-medium text-[0.625rem] text-primary-foreground tabular-nums"
				>
					{activeCount > 9 ? '9+' : activeCount}
				</span>
			) : null}
		</Button>
	);
}

/**
 * The panel's overflow menu: what this surface can add, and the way back to an
 * unfiltered list.
 *
 * All of it was controls of its own until the header ran out of room. None of
 * it is reached often enough to hold a permanent seat in a panel that already
 * has to show a title, a count, a filter toggle and a collapse.
 *
 * The separator is the one line of structure it needs: everything above it
 * writes a record, and the one below it only changes what is on screen.
 */
function PanelMenu({
	create,
	menuItems,
	onResetFilters,
	resetDisabled,
}: {
	readonly create: ExplorerCreateAction | undefined;
	readonly menuItems: ReactNode;
	readonly onResetFilters: (() => void) | undefined;
	readonly resetDisabled: boolean;
}) {
	const hasWrites = create !== undefined || menuItems !== undefined;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button aria-label="More actions" size="icon-sm" title="More actions" variant="ghost">
					<MoreHorizontalIcon aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				{create === undefined ? null : (
					<WriteOnly minimum={create.minimum ?? 'collector'}>
						<DropdownMenuItem asChild>
							<Link to={create.to}>
								<PlusIcon aria-hidden="true" />
								{create.label}
							</Link>
						</DropdownMenuItem>
					</WriteOnly>
				)}
				{menuItems}
				{hasWrites && onResetFilters !== undefined ? <DropdownMenuSeparator /> : null}
				{onResetFilters === undefined ? null : (
					/*
					 * Disabled rather than hidden while nothing is filtered. A menu whose
					 * items come and go is one a reader has to open to find out what is in
					 * it.
					 */
					<DropdownMenuItem disabled={resetDisabled} onSelect={onResetFilters}>
						<ResetIcon aria-hidden="true" />
						Reset filters
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

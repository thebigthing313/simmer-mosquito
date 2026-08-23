import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	FilterIcon,
	type iconRegistry,
	PanelLeftIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { CSSProperties, ReactNode } from 'react';
import { OutletFullPageMap } from '../app-shell/outlet/full-page-map';
import { MAP_CHROME_SURFACE } from '../map/chrome';
import { type ExplorerCreateAction, ExplorerHeader } from './explorer-header';
import { ResultList } from './result-list';
import { ResultMeta } from './result-meta';
import type { ExplorerPanel } from './use-explorer-panel';

type RegistryIcon = typeof iconRegistry.entities.sample.icon;

/**
 * The floating-panel shell both panels in the column wear. It carries the same
 * translucent surface as the map's own controls, so the column reads as chrome
 * over the map rather than a second page laid on top of it.
 */
const PANEL_SHELL = cn(
	'pointer-events-auto flex flex-col overflow-hidden rounded-xl shadow-lg',
	MAP_CHROME_SURFACE,
);

/** What the panel says it is holding, expanded or collapsed. */
export interface ExplorerHeading {
	readonly title: string;
	readonly icon?: RegistryIcon | undefined;
	readonly total: number;
	readonly isLoading: boolean;
	readonly noun?: { readonly one: string; readonly many: string } | undefined;
	/** The create control, hidden below the role floor its command needs. */
	readonly create?: ExplorerCreateAction | undefined;
}

/** The rows, and what stands in for them when there are none. */
export interface ExplorerResults<TRow> {
	/**
	 * The whole scroll area, for a panel whose records are not a flat list: the
	 * Regions folder tree, the Activity Monitor's day-grouped log. Given this, the
	 * frame draws it in place of the rows and every field below is ignored: a
	 * caller with its own body owns its own empty and loading states too.
	 */
	readonly body?: ReactNode | undefined;
	readonly rows: readonly TRow[];
	readonly renderRow: (row: TRow) => ReactNode;
	/** What is missing, e.g. `No habitats in view`. */
	readonly emptyTitle: string;
	/** What to change to find some. */
	readonly emptyDescription: string;
	/** The placeholder's height, matched to the row it stands in for. */
	readonly skeletonClassName?: string | undefined;
	/** The request failed. Replaces the empty state, which would misread as "none match". */
	readonly isError?: boolean | undefined;
	/** Runs the request again, behind the failure state's retry. */
	readonly onRetry?: (() => void) | undefined;
}

/**
 * A map-first record page: the map owns the stage, and what matched floats over
 * it in a panel that collapses out of the way.
 *
 * The split layout this replaces gave a map half a viewport and a list rail the
 * other half, which read as the record list while being filtered by the map's
 * viewport. Here the geography is plainly the page, and the rail is plainly a
 * reading of what is on screen.
 *
 * The frame owns the arrangement: where the panel sits, how wide, whether it is
 * collapsed, and the inset that keeps the map's own controls and camera clear of
 * it. An explorer supplies its filters, its rows and its create action, which is
 * the same division the catalog frame makes.
 *
 * `map` is rendered once and never re-keyed by a collapse. A GL instance costs a
 * round-trip of tiles to rebuild, and a panel toggle must not spend one.
 */
export function ExplorerMapPage<TRow>({
	panel,
	heading,
	filters,
	activeFilterCount,
	results,
	footer,
	map,
	menuItems,
	onResetFilters,
}: {
	readonly panel: ExplorerPanel;
	readonly heading: ExplorerHeading;
	/** The filter controls, stacked under the panel's title row. */
	readonly filters: ReactNode;
	/** How many filters are off their default, so a collapsed panel can say so. */
	readonly activeFilterCount: number;
	/**
	 * Extra entries for the panel's overflow menu, under the create action. For a
	 * surface whose work is not only "add one of these".
	 */
	readonly menuItems?: ReactNode;
	/**
	 * Put every filter back to its default. Sits in the panel's overflow menu, and
	 * is left out by a surface whose filters have no default to go back to.
	 */
	readonly onResetFilters?: (() => void) | undefined;
	readonly results: ExplorerResults<TRow>;
	/** The paging footer, pinned under the results. */
	readonly footer?: ReactNode;
	/** The map surface, given the same inset the panel reports. */
	readonly map: ReactNode;
}) {
	const { isCollapsed, setCollapsed, stageRef } = panel;

	return (
		<OutletFullPageMap ref={stageRef}>
			{map}

			{isCollapsed ? (
				// Top centre, not the corner it collapsed from: the corners belong to the
				// map's own controls, which have just moved back into the room the panel
				// gave up. It also keeps the inset honest — a pill up here covers nothing
				// the camera needs to steer around.
				<div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
					<CollapsedPanel
						activeFilterCount={activeFilterCount}
						heading={heading}
						onExpand={() => setCollapsed(false)}
					/>
				</div>
			) : (
				<div
					className={cn(
						'pointer-events-none absolute z-10 flex min-h-0 gap-2',
						// `top-20`, not `top-4`: the map's place search owns the corner and
						// stays there, so the column starts under it rather than pushing it
						// sideways every time the panel opens.
						//
						// A row on a wide stage: the results take the full height under the
						// search box and the filter card stands to their right. Stacked, the
						// filters cost the rail half of what it had, and an explorer's rows
						// are the thing the reader came for.
						panel.isNarrow
							? 'inset-x-3 bottom-3 flex-col-reverse'
							: 'top-20 bottom-4 left-4 flex-row items-stretch',
					)}
					style={panel.isNarrow ? { height: panel.sheetHeight } : undefined}
				>
					<div
						className="flex min-h-0 flex-1 flex-col"
						style={panel.isNarrow ? undefined : { width: panel.width }}
					>
						<ResultsPanel
							activeFilterCount={activeFilterCount}
							footer={footer}
							heading={heading}
							menuItems={menuItems}
							onCollapse={() => setCollapsed(true)}
							onResetFilters={onResetFilters}
							panel={panel}
							results={results}
						/>
					</div>

					{panel.isFiltersOpen ? (
						<FiltersCard
							activeFilterCount={activeFilterCount}
							onClose={() => panel.setFiltersOpen(false)}
							style={panel.isNarrow ? undefined : { width: panel.filtersWidth }}
						>
							{filters}
						</FiltersCard>
					) : null}
				</div>
			)}
		</OutletFullPageMap>
	);
}

/**
 * The panel open: the header, the filters under it, the rows, and the pager.
 *
 * A side column on a wide viewport and a docked sheet on a narrow one. Which of
 * the two is the only difference, so both are one component rather than a pair
 * that would drift.
 */
function ResultsPanel<TRow>({
	heading,
	results,
	footer,
	onCollapse,
	panel,
	activeFilterCount,
	menuItems,
	onResetFilters,
}: {
	readonly heading: ExplorerHeading;
	readonly results: ExplorerResults<TRow>;
	readonly footer: ReactNode;
	readonly onCollapse: () => void;
	readonly panel: ExplorerPanel;
	readonly activeFilterCount: number;
	readonly menuItems: ReactNode;
	readonly onResetFilters?: (() => void) | undefined;
}) {
	const {
		body,
		rows,
		renderRow,
		emptyTitle,
		emptyDescription,
		skeletonClassName,
		isError,
		onRetry,
	} = results;

	return (
		<div className={cn(PANEL_SHELL, 'min-h-0 flex-1')}>
			<ExplorerHeader
				collapse={{
					onCollapse,
					// The same X the filters panel above it closes with. Two panels in one
					// column, put away the same way.
					label: 'Hide results',
					icon: XIcon,
				}}
				create={heading.create}
				filterToggle={{
					isOpen: panel.isFiltersOpen,
					onToggle: () => panel.setFiltersOpen(!panel.isFiltersOpen),
					activeCount: activeFilterCount,
				}}
				icon={heading.icon}
				isLoading={heading.isLoading}
				menuItems={menuItems}
				noun={heading.noun}
				onResetFilters={onResetFilters}
				// The count lives in the pager when there is one. Without a pager the
				// header is the only place left for it, and a rail that never states its
				// size is a rail a reader has to scroll to the end of to size.
				showTotal={footer === undefined}
				surface="chrome"
				title={heading.title}
				total={heading.total}
			/>

			{body === undefined ? (
				<ResultList
					emptyDescription={emptyDescription}
					emptyTitle={emptyTitle}
					isError={isError ?? false}
					isLoading={heading.isLoading}
					onRetry={onRetry}
					rows={rows}
					{...(skeletonClassName === undefined ? {} : { skeletonClassName })}
				>
					{renderRow}
				</ResultList>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
			)}

			{footer === undefined ? null : <div className="border-border/50 border-t p-3">{footer}</div>}
		</div>
	);
}

/**
 * The filter controls, in a card beside the results.
 *
 * Beside rather than above, because the two are read at different rates:
 * filters are set once and then left alone, while the rows are scrolled every
 * time the map moves. Stacked in one column the filter block took nearly half
 * the height on the surfaces that filter by the most things, which is exactly
 * the surfaces whose rails are longest.
 *
 * It is a card rather than a popover so it can stay open while the reader works
 * the map and watches the list change under it, which is what setting a filter
 * on a map page is for.
 */
function FiltersCard({
	children,
	activeFilterCount,
	onClose,
	style,
}: {
	readonly children: ReactNode;
	readonly activeFilterCount: number;
	readonly onClose: () => void;
	readonly style: CSSProperties | undefined;
}) {
	return (
		// `self-start` and `max-h-full`: the card is as tall as the controls in it,
		// while the results beside it stretch to the bottom of the stage.
		<div className={cn(PANEL_SHELL, 'max-h-full shrink-0 self-start')} style={style}>
			<div className="flex items-center justify-between gap-3 border-border/50 border-b px-3 py-2">
				<span className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
					<FilterIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					Filters
					{activeFilterCount > 0 ? (
						<Badge tone="neutral" variant="outline">
							{activeFilterCount}
						</Badge>
					) : null}
				</span>
				<Button aria-label="Hide filters" onClick={onClose} size="icon-sm" variant="ghost">
					<XIcon aria-hidden="true" />
				</Button>
			</div>
			{/*
			 * `overflow-x-hidden`, and `min-w-0` on every control. Grid items size to
			 * their content, so one control a couple of pixels wider than the column
			 * put a horizontal scrollbar across the whole filter panel. Sideways is
			 * never where a filter column is meant to go.
			 */}
			<div className="grid gap-3 overflow-y-auto overflow-x-hidden p-3 [&>*]:min-w-0">
				{children}
			</div>
		</div>
	);
}

/**
 * The panel put away: what matched, how filtered it is, and the way back.
 *
 * The count and the filter count are the two things a collapse must not cost.
 * Without them a reader who shut the panel to look at the map cannot tell an
 * agency with no Habitats in view from one whose filters excluded them all.
 */
function CollapsedPanel({
	heading,
	activeFilterCount,
	onExpand,
}: {
	readonly heading: ExplorerHeading;
	readonly activeFilterCount: number;
	readonly onExpand: () => void;
}) {
	const Icon = heading.icon;
	return (
		<div
			className={cn(
				'pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 shadow-lg',
				MAP_CHROME_SURFACE,
			)}
		>
			{Icon === undefined ? null : (
				<Icon aria-hidden="true" className="size-4 text-muted-foreground" />
			)}
			<span className="font-medium text-foreground text-sm">{heading.title}</span>
			<ResultMeta isLoading={heading.isLoading} noun={heading.noun} total={heading.total} />
			{activeFilterCount > 0 ? (
				<Badge tone="neutral" variant="outline">
					{activeFilterCount === 1 ? '1 filter' : `${activeFilterCount} filters`}
				</Badge>
			) : null}
			<Button aria-label="Show results" onClick={onExpand} size="icon-sm" variant="ghost">
				<PanelLeftIcon aria-hidden="true" />
			</Button>
		</div>
	);
}

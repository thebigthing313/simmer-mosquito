import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { type iconRegistry, PanelLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import { OutletFullPageMap } from '../app-shell/outlet/full-page-map';
import { type ExplorerCreateAction, ExplorerHeader } from './explorer-header';
import { ResultList } from './result-list';
import { ResultMeta } from './result-meta';
import type { ExplorerPanel } from './use-explorer-panel';

type RegistryIcon = typeof iconRegistry.entities.sample.icon;

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
	readonly rows: readonly TRow[];
	readonly renderRow: (row: TRow) => ReactNode;
	/** What is missing, e.g. `No habitats in view`. */
	readonly emptyTitle: string;
	/** What to change to find some. */
	readonly emptyDescription: string;
	/** The placeholder's height, matched to the row it stands in for. */
	readonly skeletonClassName?: string | undefined;
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
}: {
	readonly panel: ExplorerPanel;
	readonly heading: ExplorerHeading;
	/** The filter controls, stacked under the panel's title row. */
	readonly filters: ReactNode;
	/** How many filters are off their default, so a collapsed panel can say so. */
	readonly activeFilterCount: number;
	readonly results: ExplorerResults<TRow>;
	/** The paging footer, pinned under the results. */
	readonly footer?: ReactNode;
	/** The map surface, given the same inset the panel reports. */
	readonly map: ReactNode;
}) {
	const { isCollapsed, setCollapsed } = panel;

	return (
		<OutletFullPageMap>
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
				<ResultsPanel
					filters={filters}
					footer={footer}
					heading={heading}
					onCollapse={() => setCollapsed(true)}
					panel={panel}
					results={results}
				/>
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
	panel,
	heading,
	filters,
	results,
	footer,
	onCollapse,
}: {
	readonly panel: ExplorerPanel;
	readonly heading: ExplorerHeading;
	readonly filters: ReactNode;
	readonly results: ExplorerResults<TRow>;
	readonly footer: ReactNode;
	readonly onCollapse: () => void;
}) {
	const { isNarrow, width, peek } = panel;
	const { rows, renderRow, emptyTitle, emptyDescription, skeletonClassName } = results;

	return (
		<div
			className={cn(
				'pointer-events-auto absolute z-10 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-lg backdrop-blur-sm',
				isNarrow ? 'inset-x-3 bottom-3' : 'top-4 bottom-4 left-4',
			)}
			style={isNarrow ? { height: peek } : { width }}
		>
			<ExplorerHeader
				collapse={{ onCollapse, label: 'Hide results' }}
				create={heading.create}
				icon={heading.icon}
				isLoading={heading.isLoading}
				noun={heading.noun}
				title={heading.title}
				total={heading.total}
			>
				{filters}
			</ExplorerHeader>

			<ResultList
				emptyDescription={emptyDescription}
				emptyTitle={emptyTitle}
				isLoading={heading.isLoading}
				rows={rows}
				{...(skeletonClassName === undefined ? {} : { skeletonClassName })}
			>
				{renderRow}
			</ResultList>

			{footer === undefined ? null : <div className="border-border/50 border-t p-3">{footer}</div>}
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
		<div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/95 py-1.5 pr-1.5 pl-3 shadow-lg backdrop-blur-sm">
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

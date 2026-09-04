import { ListEmpty, ListLoading, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { EmptyValue } from '../../../components/empty-value';
import { DensityBadge, LifeStageStrip, WetnessBadge } from '../../../components/larval-display';
import {
	type InspectionTableRow,
	inspectionSiteLabel,
} from '../../../hooks/queries/larval-activity-view';
import { useInspectionTable } from '../../../hooks/queries/use-inspection-table';
import { formatListDate } from '../-overview-data';

export const Route = createFileRoute('/larval-surveillance/inspections/table')({
	component: InspectionsTableRoute,
});

const InspectionIcon = iconRegistry.entities.inspection.icon;

/** How many rows the page opens on, and how many each Load more adds. */
const WINDOW_STEP = 50;

/**
 * Every inspection as a table, newest first.
 *
 * The map explorer beside this answers "where was work done"; this answers
 * "what has been recorded", which is a question about a run of rows rather than
 * about a place, so it spends no room on a map.
 *
 * ## Why there is no page count
 *
 * `inspections` is on-demand. A total would mean loading the whole set into the
 * browser to count it, which is the one thing the mode exists to avoid, so the
 * reader extends the window instead of stepping through numbered pages. The
 * order is Postgres's: the read sends `order_by` and `limit` with the shape
 * request, and Load more asks for a wider window rather than sorting a bigger
 * pile locally.
 */
function InspectionsTableRoute() {
	const [limit, setLimit] = useState(WINDOW_STEP);
	const { rows, isReady, isError } = useInspectionTable(limit);
	const shown = useHeldRows(rows, isReady);

	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<PageHeader
				description="Every inspection your crews have recorded, most recent first."
				icon={InspectionIcon}
				title="Inspections"
			/>
			{shown.length === 0 ? (
				<NoRows isError={isError} isReady={isReady} />
			) : (
				<LoadedRows
					isReady={isReady}
					limit={limit}
					onLoadMore={() => setLimit((current) => current + WINDOW_STEP)}
					rows={shown}
				/>
			)}
		</OutletSimpleLayout>
	);
}

/** Waiting, failed, or genuinely empty. Nothing on screen tells them apart. */
function NoRows({ isError, isReady }: { readonly isError: boolean; readonly isReady: boolean }) {
	if (isError) {
		return <InspectionsUnavailable />;
	}
	if (!isReady) {
		return <ListLoading rows={8} />;
	}
	return (
		<ListEmpty
			description="Inspections show here as crews record them."
			icon={InspectionIcon}
			title="No inspections yet"
		/>
	);
}

/**
 * The table, and the control that widens the window under it.
 *
 * A full window is the only sign there is more, since nothing here counts the
 * whole set. So the control shows while the rows fill the window, and goes when
 * a wider one comes back short.
 */
function LoadedRows({
	isReady,
	limit,
	onLoadMore,
	rows,
}: {
	readonly isReady: boolean;
	readonly limit: number;
	readonly onLoadMore: () => void;
	readonly rows: readonly InspectionTableRow[];
}) {
	const hasMore = !isReady || rows.length >= limit;
	return (
		<div className="grid gap-3">
			<InspectionsTable rows={rows} />
			{hasMore ? <LoadMore isLoading={!isReady} onLoadMore={onLoadMore} /> : null}
		</div>
	);
}

/**
 * The rows on screen, held through the first read of a wider window.
 *
 * The live query is rebuilt when the limit changes, so it starts empty and
 * reports not-ready until the collection has answered. Rendering that as it
 * comes would take the table away from under the reader at the moment they
 * asked for more of it. What is already shown stays correct: the wider window
 * is the same order with more of it on the end.
 */
function useHeldRows(
	rows: readonly InspectionTableRow[],
	isReady: boolean,
): readonly InspectionTableRow[] {
	const held = useRef<readonly InspectionTableRow[]>(rows);
	if (isReady) {
		held.current = rows;
	}
	return isReady ? rows : held.current;
}

function InspectionsTable({ rows }: { readonly rows: readonly InspectionTableRow[] }) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Date</TableHead>
						<TableHead>Site</TableHead>
						<TableHead>Habitat type</TableHead>
						<TableHead>Inspector</TableHead>
						<TableHead>Water</TableHead>
						<TableHead>Density</TableHead>
						<TableHead className="text-right">Dips</TableHead>
						<TableHead>Life stages</TableHead>
						<TableHead className="text-right">Larvae</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<InspectionRow key={row.id} row={row} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function InspectionRow({ row }: { readonly row: InspectionTableRow }) {
	const when = formatListDate(row.inspectionDate);
	const site = inspectionSiteLabel(row);
	return (
		<TableRow>
			<TableCell className="tabular-nums">{when}</TableCell>
			<TableCell className="max-w-[22rem] truncate font-medium" title={site}>
				{site}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.habitatTypeId === null ? <EmptyValue /> : (row.typeName ?? 'Unknown type')}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.inspectedByName ?? <EmptyValue />}
			</TableCell>
			<TableCell>
				<WetnessBadge isWet={row.isWet} />
			</TableCell>
			<TableCell>
				<DensityBadge density={row.density} />
			</TableCell>
			<TableCell className="text-right tabular-nums">{row.dipCount ?? <EmptyValue />}</TableCell>
			<TableCell>
				<LifeStageStrip size="sm" stages={row} />
			</TableCell>
			<TableCell className="text-right tabular-nums">{row.larvaeCount ?? <EmptyValue />}</TableCell>
			<TableCell className="text-right">
				<Button
					aria-label={`View the ${when} inspection of ${site}`}
					asChild
					size="icon-sm"
					variant="ghost"
				>
					<Link params={{ id: row.id }} to="/larval-surveillance/inspections/$id">
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			</TableCell>
		</TableRow>
	);
}

function LoadMore({
	isLoading,
	onLoadMore,
}: {
	readonly isLoading: boolean;
	readonly onLoadMore: () => void;
}) {
	return (
		<div className="flex justify-center">
			<Button disabled={isLoading} onClick={onLoadMore} type="button" variant="outline">
				{isLoading ? <Spinner /> : null}
				Load more
			</Button>
		</div>
	);
}

/** The read failed and there is nothing on screen to keep. */
function InspectionsUnavailable() {
	return (
		<p
			className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm"
			role="alert"
		>
			Inspections could not be loaded. Reload the page to try again.
		</p>
	);
}

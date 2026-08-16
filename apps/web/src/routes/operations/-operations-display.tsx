import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Progress } from '@simmer-mosquito/ui-web/components/ui/progress';
import type { RouteStopFeature } from '../../components/map';
import type { StopTone } from '../../components/stop-order';
import {
	MISSION_STATUS_LABELS,
	type MissionProgressCounts,
	type MissionStatus,
	type RequestStatus,
} from '../../hooks/queries/operations-view';
import {
	type MissionItemProgress,
	type MissionStopView,
	missionItemProgress,
} from './-operations-data';

/**
 * The badges and one-line summaries the operations surfaces share.
 *
 * Split out because a mission reads the same on its map page, its detail page,
 * and inside the card floating over the map, and a request reads the same in the
 * queue and on its own page. Nothing here fetches — every function takes what it
 * renders.
 */

const missionStatusTones = {
	scheduled: 'neutral',
	inProgress: 'info',
	completed: 'success',
	cancelled: 'danger',
} as const;

export function MissionStatusBadge({ status }: { readonly status: MissionStatus }) {
	return (
		<Badge className="shrink-0" tone={missionStatusTones[status]} variant="outline">
			{MISSION_STATUS_LABELS[status]}
		</Badge>
	);
}

/**
 * A request is open or it is not. Open takes the louder tone: the queue is read
 * to find what still needs doing.
 */
export function RequestStatusBadge({ status }: { readonly status: RequestStatus }) {
	return (
		<Badge className="shrink-0" tone={status === 'open' ? 'info' : 'success'} variant="outline">
			{status === 'open' ? 'Open' : 'Resolved'}
		</Badge>
	);
}

/**
 * A stop's progress. Pending is deliberately unbadged — most stops on a running
 * mission are pending, and a badge on every row would say nothing while burying
 * the two states that do.
 */
export function MissionItemProgressBadge({ progress }: { readonly progress: MissionItemProgress }) {
	if (progress === 'pending') {
		return null;
	}
	return (
		<Badge
			className="shrink-0"
			tone={progress === 'completed' ? 'success' : 'warning'}
			variant="outline"
		>
			{progress === 'completed' ? 'Done' : 'Skipped'}
		</Badge>
	);
}

/** Pin colour reports progress on the work, not the state of the site. */
export function missionStopTone(item: {
	readonly completedAt: string | null;
	readonly skippedAt: string | null;
}): StopTone {
	const progress = missionItemProgress(item);
	if (progress === 'skipped') {
		return 'skipped';
	}
	return progress === 'completed' ? 'done' : 'default';
}

/**
 * A mission's stops as the map draws them.
 *
 * Ordinals come off the array's order rather than each stop's own, so a caller
 * holding a pending reorder gets its numbering renumbered on the same frame the
 * list rearranges rather than a frame later.
 *
 * `geometry` rides along so a stop is drawn as what it is — a line for a ditch
 * run, an area for a block — with the numbered pin at its centroid as the
 * ordinal marker. Stops whose shape has not arrived yet, or that are plain
 * points, fall back to the pin alone.
 */
export function missionStopFeatures(
	stops: readonly MissionStopView[],
): readonly RouteStopFeature[] {
	return stops
		.map((stop, index) => ({ stop, ordinal: index + 1 }))
		.filter((entry) => entry.stop.hasLocation)
		.map((entry) => ({
			id: entry.stop.missionItemId,
			lat: entry.stop.lat,
			lng: entry.stop.lng,
			ordinal: entry.ordinal,
			tone: missionStopTone(entry.stop),
			geometry: entry.stop.geometry,
		}));
}

/**
 * How far through a worklist the crew is.
 *
 * Typed on the counts it actually reads rather than on either worklist's own
 * counts type, so the assignment and the mission share one bar. `emptyLabel` is
 * the caller's because the two say different things about having no stops: an
 * assignment cannot start without one, and neither can a mission.
 */
export function StopProgressSummary({
	counts,
	emptyLabel,
}: {
	readonly counts: {
		readonly total: number;
		readonly handled: number;
		readonly skipped: number;
	};
	readonly emptyLabel: string;
}) {
	if (counts.total === 0) {
		return <p className="m-0 text-muted-foreground text-sm">{emptyLabel}</p>;
	}
	return (
		<div className="grid gap-1.5">
			<Progress
				aria-label={`${counts.handled} of ${counts.total} stops done`}
				value={(counts.handled / counts.total) * 100}
			/>
			<p className="m-0 text-muted-foreground text-xs">
				{counts.handled} of {counts.total} done
				{counts.skipped === 0 ? '' : ` · ${counts.skipped} skipped`}
			</p>
		</div>
	);
}

/** "8 stops · 3 of 8 done" — the mission's size and how far through it is. */
export function stopSummary(counts: MissionProgressCounts | null): string {
	if (counts === null || counts.total === 0) {
		return 'No stops';
	}
	const stops = counts.total === 1 ? '1 stop' : `${counts.total} stops`;
	return counts.handled === 0 ? stops : `${stops} · ${counts.handled} of ${counts.total} done`;
}

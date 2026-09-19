import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Progress } from '@simmer-mosquito/ui-web/components/ui/progress';
import type { RouteStopFeature } from '../../hooks/map/use-route-layer';
import {
	MISSION_STATUS_LABELS,
	type MissionProgressCounts,
	type MissionStatus,
} from '../../hooks/queries/operations-view';
import type { StopTone } from '../stop-order';
import {
	type MissionItemProgress,
	type MissionStopView,
	missionItemProgress,
} from './operations-data';

/**
 * The badges and one-line summaries the operations surfaces share. Nothing
 * here fetches. A request's status badge is in
 * `components/request-status-badge.tsx`, because the habitat's History card
 * shows one too.
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
 * A stop's progress. Pending is unbadged: most stops on a running mission are
 * pending, and a badge on every row would bury the two states that matter.
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
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
}): StopTone {
	const progress = missionItemProgress(item);
	if (progress === 'skipped') {
		return 'skipped';
	}
	return progress === 'completed' ? 'done' : 'default';
}

/**
 * A mission's stops as the map draws them. Ordinals come off the array's
 * order, so a pending reorder renumbers on the same frame. `geometry` rides
 * along so a stop is drawn as a line or an area with the numbered pin at its
 * centroid; a plain point falls back to the pin alone.
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
 * How far through a worklist the crew is. Typed on the counts it reads, so the
 * assignment and the mission share one bar. `emptyLabel` is the caller's.
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

/** "8 stops · 3 of 8 done": the mission's size and how far through it is. */
export function stopSummary(counts: MissionProgressCounts | null): string {
	if (counts === null || counts.total === 0) {
		return 'No stops';
	}
	const stops = counts.total === 1 ? '1 stop' : `${counts.total} stops`;
	return counts.handled === 0 ? stops : `${stops} · ${counts.handled} of ${counts.total} done`;
}

/**
 * The add-stop screen's one-line description. The instruction stands on its
 * own and the mission follows it, because `missionDisplayName` answers a
 * phrase for a mission with no name and reads wrongly inside a sentence.
 */
export function addStopDescription(missionName: string): string {
	return `Draw where the crew has to go. This stop is for ${missionName}.`;
}

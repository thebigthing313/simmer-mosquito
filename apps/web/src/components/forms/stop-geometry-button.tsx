import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { DrawLocation } from '../../hooks/map/use-draw-location';
import type { MissionStopGeometry } from '../../hooks/operations/use-mission-stop-geometry';

const MissionIcon = iconRegistry.entities.mission.icon;

/** What the location band says when the stop's geometry could not be read, else null. */
export function stopGeometryError(missionStop: MissionStopGeometry | null): string | null {
	return missionStop?.status === 'error'
		? "The mission stop's geometry could not be loaded."
		: null;
}

/**
 * "Use stop geometry": puts the geometry of the mission stop the form was
 * opened from back on the map. Disabled while it loads or while a draw is
 * running; after a failed read it asks again instead.
 */
export function StopGeometryButton({ location }: { readonly location: DrawLocation }) {
	const { missionStop, draw } = location;
	if (missionStop === null) {
		return null;
	}
	return (
		<Button
			disabled={missionStop.status === 'loading' || draw.isDrawing || draw.isRequestingPoint}
			onClick={missionStop.status === 'error' ? missionStop.retry : location.restoreStopGeometry}
			size="sm"
			type="button"
			variant="outline"
		>
			<MissionIcon aria-hidden="true" data-icon="inline-start" />
			Use stop geometry
		</Button>
	);
}

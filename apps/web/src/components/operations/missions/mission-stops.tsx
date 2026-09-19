import type { ControlType } from '@simmer-mosquito/domain';
import { type MoveAction, StopList } from '../../stop-order';
import type { MissionItemAction, MissionStopView } from '../operations-data';
import { MissionStopRow } from './mission-stop-row';

/**
 * A mission's stop list: what the crew works, in order.
 *
 * Two sets of controls sit on each row and they answer to different roles. The
 * progress buttons are the assigned collector's — that is the mission being
 * worked. The move and remove controls are a manager's, because they change what
 * the mission *is*. Both are gated by the caller rather than here, so this
 * component only decides what a stop looks like.
 */
export function MissionStopList({
	stops,
	controlType,
	missionId,
	isLoading,
	progressEnabled,
	recordEnabled,
	planEditable,
	selectedStopId,
	highlightId,
	onAction,
	onMove,
	onRemove,
	onSelect,
	onHover,
}: {
	readonly stops: readonly MissionStopView[];
	/** Null until the mission row has streamed; the record button waits for it. */
	readonly controlType: ControlType | null;
	readonly missionId: string;
	readonly isLoading: boolean;
	/** The mission is running and no write is in flight. */
	readonly progressEnabled: boolean;
	/** Wider: recording is also allowed on a scheduled mission, which it starts. */
	readonly recordEnabled: boolean;
	/** The mission is still open to plan changes. */
	readonly planEditable: boolean;
	readonly selectedStopId: string | null;
	readonly highlightId: string | null;
	readonly onAction: (stop: MissionStopView, action: MissionItemAction) => void;
	readonly onMove: (index: number, action: MoveAction) => void;
	readonly onRemove: (stop: MissionStopView) => void;
	readonly onSelect: (id: string | null) => void;
	readonly onHover: (id: string | null) => void;
}) {
	return (
		<StopList
			className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-3"
			empty={{
				title: 'No Stops on This Mission',
				description:
					'A mission needs at least one stop before it can be started. Add them from the request queue above.',
			}}
			isEmpty={stops.length === 0}
			isLoading={isLoading}
		>
			{stops.map((stop, index) => (
				<MissionStopRow
					controlType={controlType}
					index={index}
					isFirst={index === 0}
					isHighlighted={stop.missionItemId === highlightId}
					isLast={index === stops.length - 1}
					isSelected={stop.missionItemId === selectedStopId}
					key={stop.missionItemId}
					onAction={onAction}
					onHover={onHover}
					onMove={onMove}
					onRemove={onRemove}
					missionId={missionId}
					onSelect={onSelect}
					ordinal={index + 1}
					planEditable={planEditable}
					progressEnabled={progressEnabled}
					recordEnabled={recordEnabled}
					stop={stop}
				/>
			))}
		</StopList>
	);
}

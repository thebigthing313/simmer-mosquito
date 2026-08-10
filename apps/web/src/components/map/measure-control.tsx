import { formatArea, formatDistance, type MeasurementSystem } from '@simmer-mosquito/mapping';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	CircleIcon,
	RulerIcon,
	SplineIcon,
	SquareIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { MapControlButton, MapControlGroup } from './map-control';
import {
	type MapMeasureController,
	type Measurement,
	type MeasureTool,
	useMeasureDraft,
} from './use-map-measure';

/**
 * The measurement session's controls and readout.
 *
 * Collapsed to a single ruler button until asked for, because measuring is a
 * thing an operator does occasionally and the map is what they came for. Open,
 * it is a tool picker and a running list of what has been measured — the list
 * is the point, since comparing two areas is most of why anyone measures a
 * second one.
 *
 * Nothing here is saved. The shapes and this list go together when the session
 * closes, which is why there is no name field, no save button, and no
 * confirmation on Clear.
 */
export function MeasureControl({
	controller,
	system = 'us',
	onClose,
}: {
	readonly controller: MapMeasureController;
	readonly system?: MeasurementSystem;
	readonly onClose: () => void;
}) {
	const { tool, measurements, draftPointCount } = controller;
	// Subscribed rather than read off the controller, so the number beside the
	// shape keeps up with the shape while it is being dragged out.
	const draft = useMeasureDraft(controller);
	const hasResults = measurements.length > 0 || draft !== null;

	return (
		<div className="pointer-events-auto w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border/70 bg-background/85 shadow-md ring-1 ring-black/[0.03] backdrop-blur-sm supports-[backdrop-filter]:bg-background/75">
			<div className="flex items-center justify-between gap-2 border-border/60 border-b px-2.5 py-1.5">
				<span className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
					<RulerIcon aria-hidden="true" className="size-3.5" />
					Measure
				</span>
				<Button
					aria-label="Close measurement tools"
					className="size-6 text-muted-foreground hover:text-foreground"
					onClick={onClose}
					size="icon"
					type="button"
					variant="ghost"
				>
					<XIcon aria-hidden="true" className="size-3.5" />
				</Button>
			</div>

			<fieldset aria-label="Measurement tool" className="flex gap-0.5 p-1.5">
				{TOOLS.map((entry) => (
					<button
						aria-pressed={tool === entry.id}
						className={cn(
							'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md font-medium text-xs transition-colors',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							tool === entry.id
								? 'bg-primary text-primary-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
						)}
						key={entry.id}
						onClick={() => controller.selectTool(entry.id)}
						type="button"
					>
						<entry.Icon aria-hidden="true" className="size-3.5" />
						{entry.label}
					</button>
				))}
			</fieldset>

			{tool === null ? (
				<p className="m-0 px-2.5 pb-2.5 text-muted-foreground text-xs">
					Pick a tool, then click the map.
				</p>
			) : (
				<p className="m-0 px-2.5 pb-2 text-muted-foreground text-xs">{HINTS[tool]}</p>
			)}

			{hasResults ? (
				<ul className="m-0 grid list-none gap-1 border-border/60 border-t p-1.5">
					{measurements.map((measurement, index) => (
						<MeasurementRow
							index={index + 1}
							key={measurement.id}
							measurement={measurement}
							system={system}
						/>
					))}
					{draft === null ? null : (
						<MeasurementRow
							index={measurements.length + 1}
							isDraft
							measurement={draft}
							system={system}
						/>
					)}
				</ul>
			) : null}

			<div className="flex items-center justify-between gap-2 border-border/60 border-t px-1.5 py-1.5">
				<div className="flex gap-1">
					{tool === 'distance' && draftPointCount > 0 ? (
						<>
							<Button onClick={controller.undo} size="sm" type="button" variant="ghost">
								Undo point
							</Button>
							{draftPointCount > 1 ? (
								<Button onClick={controller.finish} size="sm" type="button" variant="ghost">
									Finish
								</Button>
							) : null}
						</>
					) : null}
				</div>
				<Button
					disabled={!hasResults}
					onClick={controller.clear}
					size="sm"
					type="button"
					variant="ghost"
				>
					Clear
				</Button>
			</div>
		</div>
	);
}

/** The collapsed entry point, sitting with the other on-map control clusters. */
export function MeasureControlButton({
	active,
	onClick,
}: {
	readonly active: boolean;
	readonly onClick: () => void;
}) {
	return (
		<MapControlGroup>
			<MapControlButton active={active} label="Measure distance and area" onClick={onClick}>
				<RulerIcon aria-hidden="true" className="size-4" />
			</MapControlButton>
		</MapControlGroup>
	);
}

function MeasurementRow({
	measurement,
	index,
	system,
	isDraft = false,
}: {
	readonly measurement: Measurement;
	readonly index: number;
	readonly system: MeasurementSystem;
	readonly isDraft?: boolean;
}) {
	return (
		<li
			className={cn(
				'grid gap-0.5 rounded-md px-2 py-1.5 text-xs',
				isDraft ? 'bg-accent/40' : 'bg-muted/40',
			)}
		>
			<span className="flex items-center justify-between gap-2 text-muted-foreground">
				<span>
					{index}. {TOOL_LABELS[measurement.tool]}
				</span>
				{isDraft ? <span className="text-[0.65rem] uppercase tracking-wide">Drawing</span> : null}
			</span>
			{measurement.tool === 'distance' ? (
				<span className="font-semibold text-foreground tabular-nums">
					{formatDistance(measurement.lengthMeters, system)}
				</span>
			) : (
				<>
					<span className="font-semibold text-foreground tabular-nums">
						{formatArea(measurement.areaMeters, system)}
					</span>
					<span className="text-muted-foreground tabular-nums">
						{formatDistance(measurement.lengthMeters, system)} around
						{measurement.radiusMeters === null
							? null
							: ` · ${formatDistance(measurement.radiusMeters, system)} radius`}
					</span>
				</>
			)}
		</li>
	);
}

const TOOLS = [
	{ id: 'distance', label: 'Line', Icon: SplineIcon },
	{ id: 'rectangle', label: 'Box', Icon: SquareIcon },
	{ id: 'circle', label: 'Circle', Icon: CircleIcon },
] as const satisfies readonly {
	readonly id: MeasureTool;
	readonly label: string;
	readonly Icon: typeof RulerIcon;
}[];

const TOOL_LABELS: Record<MeasureTool, string> = {
	distance: 'Distance',
	rectangle: 'Rectangle',
	circle: 'Circle',
};

const HINTS: Record<MeasureTool, string> = {
	distance: 'Click each point. Double-click or press Enter to finish.',
	rectangle: 'Click one corner, then the opposite one.',
	circle: 'Click the centre, then the edge.',
};

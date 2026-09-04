import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { CircleIcon, MapPinnedIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import { type DrawGeometryType, type DrawPartGeometry, drawHoles } from './use-map-draw';

/**
 * How a drawn shape and its pieces are named on screen.
 *
 * "Piece" rather than "part": the register and the commands speak parts, and the
 * word the user reads for the thing they drew is the one the import preview
 * already uses.
 */
export const GEOMETRY_TYPE_LABELS: Readonly<Record<DrawGeometryType, string>> = {
	Point: 'Point',
	LineString: 'Line',
	Polygon: 'Polygon',
};

/** How many rows the list shows before it asks. */
const VISIBLE_PARTS = 8;

/** What a piece is, past its number: a position, or how many vertices it holds. */
function describeDrawPart(part: DrawPartGeometry): string {
	if (part.type === 'Point') {
		const [longitude, latitude] = part.coordinates;
		return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
	}
	if (part.type === 'LineString') {
		return `${part.coordinates.length} vertices`;
	}
	// The ring is closed (first === last), so the vertex the user placed last is
	// not counted twice. The count is the outline's: a hole is its own row, and
	// folding its vertices into the total would leave the two disagreeing.
	const ring = part.coordinates[0] ?? [];
	const holes = drawHoles(part).length;
	const vertices = `${Math.max(ring.length - 1, 0)} vertices`;
	return holes === 0 ? vertices : `${vertices}, ${holes} ${holes === 1 ? 'hole' : 'holes'}`;
}

/** How many vertices a hole ring holds, its repeated closing position aside. */
function describeHole(ring: readonly (readonly number[])[]): string {
	return `${Math.max(ring.length - 1, 0)} vertices`;
}

/**
 * The holes cut out of one piece, one row each, nested under it.
 *
 * One level deep and no deeper: a hole holds nothing of its own. Pass
 * `partNumber` where several pieces are on screen, so the labels a screen reader
 * reads out say which piece each hole belongs to.
 */
function GeometryHoleList({
	part,
	partIndex,
	partNumber,
	disabled,
	onRemove,
}: {
	readonly part: DrawPartGeometry;
	readonly partIndex: number;
	readonly partNumber?: number;
	readonly disabled: boolean;
	readonly onRemove: (partIndex: number, holeIndex: number) => void;
}) {
	const holes = drawHoles(part);
	if (holes.length === 0) {
		return null;
	}
	const of = partNumber === undefined ? '' : ` from piece ${partNumber}`;

	return (
		<ul className="m-0 grid list-none gap-0.5 border-border/40 border-l p-0 pl-3">
			{holes.map((ring, index) => (
				<li className="flex items-center gap-1" key={holeKey(ring)}>
					<span className="min-w-0 flex-1 truncate px-3 text-muted-foreground text-xs">
						Hole {index + 1} · {describeHole(ring)}
					</span>
					<Button
						aria-label={`Remove hole ${index + 1}${of}`}
						disabled={disabled}
						onClick={() => onRemove(partIndex, index)}
						size="sm"
						type="button"
						variant="ghost"
					>
						<XIcon aria-hidden="true" />
					</Button>
				</li>
			))}
		</ul>
	);
}

/**
 * The one line the control shows at a single piece, with that piece's holes
 * under it.
 *
 * The list replaces this at two pieces and only at two, which is the visible
 * face of "a one-part multi shape never exists": at one piece the control reads
 * the way it always did, and the hole rows are the only thing that is new.
 */
export function GeometryPartSummary({
	part,
	disabled,
	onRemoveHole,
}: {
	readonly part: DrawPartGeometry | undefined;
	readonly disabled: boolean;
	readonly onRemoveHole: (partIndex: number, holeIndex: number) => void;
}) {
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-background/70 px-3 py-2">
			<div className="flex items-center gap-2">
				<MapPinnedIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
				<p className="m-0 min-w-0 flex-1 truncate text-foreground text-sm">
					{part === undefined
						? 'No geometry drawn yet.'
						: `${GEOMETRY_TYPE_LABELS[part.type]} · ${describeDrawPart(part)}`}
				</p>
			</div>
			{part === undefined ? null : (
				<GeometryHoleList disabled={disabled} onRemove={onRemoveHole} part={part} partIndex={0} />
			)}
		</div>
	);
}

/**
 * The pieces of a shape, one row each, in place of the summary line.
 *
 * It renders from two pieces up, which is the visible face of "a one-part multi
 * shape never exists": at one piece the control is what it always was. Rows hover
 * to pick the piece out on the map and click to frame it, so the number in the
 * row and the shape on the map are never guessed at.
 *
 * No reorder, because a shape's piece order carries no meaning, and no redraw,
 * because Remove then Add piece is the same result with one mode fewer.
 *
 * Cut hole is a per-row action here rather than one button on the control,
 * because the piece is named before the gesture starts. Nothing is hit-tested to
 * work out which piece a hole was meant for.
 */
export function GeometryPartList({
	parts,
	disabled,
	onCutHole,
	onHighlight,
	onRemove,
	onRemoveHole,
	onZoom,
}: {
	readonly parts: readonly DrawPartGeometry[];
	readonly disabled: boolean;
	readonly onCutHole: (index: number) => void;
	readonly onHighlight: (index: number | null) => void;
	readonly onRemove: (index: number) => void;
	readonly onRemoveHole: (partIndex: number, holeIndex: number) => void;
	readonly onZoom: (index: number) => void;
}) {
	const [showAll, setShowAll] = useState(false);
	// Nothing caps the piece count: a 41-piece file the database would take must
	// not send the user back to GIS to split it.
	const rows = showAll ? parts : parts.slice(0, VISIBLE_PARTS);
	const label = GEOMETRY_TYPE_LABELS[parts[0]?.type ?? 'Polygon'];

	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-background/70 p-2">
			<p className="m-0 px-2 text-muted-foreground text-xs">
				{label} · {parts.length} pieces
			</p>
			<ul className="m-0 grid list-none gap-0.5 p-0">
				{rows.map((part, index) => (
					<li
						className="grid gap-0.5"
						key={partKey(part)}
						onBlur={() => onHighlight(null)}
						onFocus={() => onHighlight(index)}
						onMouseEnter={() => onHighlight(index)}
						onMouseLeave={() => onHighlight(null)}
					>
						<div className="flex items-center gap-1">
							<Button
								className="min-w-0 flex-1 justify-start font-normal"
								onClick={() => onZoom(index)}
								size="sm"
								type="button"
								variant="ghost"
							>
								<span className="truncate">
									Piece {index + 1} · {describeDrawPart(part)}
								</span>
							</Button>
							{/* Areas only: a point and a line have no inside to cut. */}
							{part.type === 'Polygon' ? (
								<Button
									aria-label={`Cut a hole in piece ${index + 1}`}
									disabled={disabled}
									onClick={() => onCutHole(index)}
									size="sm"
									type="button"
									variant="ghost"
								>
									<CircleIcon aria-hidden="true" />
								</Button>
							) : null}
							<Button
								aria-label={`Remove piece ${index + 1}`}
								disabled={disabled}
								onClick={() => onRemove(index)}
								size="sm"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden="true" />
							</Button>
						</div>
						<GeometryHoleList
							disabled={disabled}
							onRemove={onRemoveHole}
							part={part}
							partIndex={index}
							partNumber={index + 1}
						/>
					</li>
				))}
			</ul>
			{parts.length > VISIBLE_PARTS ? (
				<Button
					className="justify-self-start"
					onClick={() => setShowAll((previous) => !previous)}
					size="sm"
					type="button"
					variant="ghost"
				>
					{showAll ? 'Show fewer' : `Show all ${parts.length}`}
				</Button>
			) : null}
		</div>
	);
}

/**
 * A piece has no id, so its shape is what names it. Two pieces of one record
 * that agree on all of this are the same ground drawn twice, which is a geometry
 * nothing should have made.
 */
function partKey(part: DrawPartGeometry): string {
	return `${part.type}:${describeDrawPart(part)}:${JSON.stringify(firstPosition(part))}`;
}

/** Two holes in one piece that agree on all of this are the same ground twice. */
function holeKey(ring: readonly (readonly number[])[]): string {
	return `${ring.length}:${JSON.stringify(ring[0] ?? [])}`;
}

function firstPosition(part: DrawPartGeometry): readonly number[] {
	if (part.type === 'Point') {
		return part.coordinates;
	}
	if (part.type === 'LineString') {
		return part.coordinates[0] ?? [];
	}
	return part.coordinates[0]?.[0] ?? [];
}

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import type { DrawGeometryType, DrawPartGeometry } from './use-map-draw';

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
export function describeDrawPart(part: DrawPartGeometry): string {
	if (part.type === 'Point') {
		const [longitude, latitude] = part.coordinates;
		return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
	}
	if (part.type === 'LineString') {
		return `${part.coordinates.length} vertices`;
	}
	// The ring is closed (first === last), so the vertex the user placed last is
	// not counted twice.
	const ring = part.coordinates[0] ?? [];
	return `${Math.max(ring.length - 1, 0)} vertices`;
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
 */
export function GeometryPartList({
	parts,
	disabled,
	onHighlight,
	onRemove,
	onZoom,
}: {
	readonly parts: readonly DrawPartGeometry[];
	readonly disabled: boolean;
	readonly onHighlight: (index: number | null) => void;
	readonly onRemove: (index: number) => void;
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
						className="flex items-center gap-1"
						key={partKey(part)}
						onBlur={() => onHighlight(null)}
						onFocus={() => onHighlight(index)}
						onMouseEnter={() => onHighlight(index)}
						onMouseLeave={() => onHighlight(null)}
					>
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

function firstPosition(part: DrawPartGeometry): readonly number[] {
	if (part.type === 'Point') {
		return part.coordinates;
	}
	if (part.type === 'LineString') {
		return part.coordinates[0] ?? [];
	}
	return part.coordinates[0]?.[0] ?? [];
}

import {
	getOwnedGeometryBaseTypes,
	type OwnedGeometryKind,
	ownedGeometryAllowsParts,
} from '@simmer-mosquito/domain';
import { type GeoJsonGeometry, isImportGeometryKind } from '@simmer-mosquito/mapping';
import { RequiredMark } from '@simmer-mosquito/ui-web/components/form';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	ArrowLeftIcon,
	CheckIcon,
	CircleIcon,
	iconRegistry,
	Loader2Icon,
	MapPinnedIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { GeometryImportDialog } from './geometry-import-dialog';
import { GEOMETRY_TYPE_LABELS, GeometryPartList, GeometryPartSummary } from './geometry-parts';
import { RegionBoundaryPicker } from './region-boundary-picker';
import {
	type DrawGeometry,
	type DrawGeometryType,
	type DrawHoleDraft,
	drawParts,
	fitMapToGeometry,
	isDrawGeometryType,
	type MapDrawController,
} from './use-map-draw';

/**
 * The geometry-capture chrome every record that owns Point/LineString/Polygon
 * geometry shares: the type toggle, the current-shape summary, and the buttons
 * that drive `useMapDraw`.
 *
 * Which shapes a given record may store is a domain decision, not a UI one, so
 * callers name the record kind and the control reads the register:
 * `OWNED_GEOMETRY_POLICIES` in `packages/domain/src/shared.ts`. A kind allowing
 * one shape renders without its type toggle.
 *
 * Areas and lines can also be filled from a shape the agency already has — one of
 * its regions, or a KML/KMZ/GeoJSON file — instead of being traced by hand. Those
 * shortcuts commit through the same draw controller, so an adopted shape behaves
 * exactly like a drawn one and can be redrawn or cleared.
 */

const UploadIcon = iconRegistry.actions.upload.icon;
const AddIcon = iconRegistry.actions.add.icon;

export interface GeometryControlProps {
	readonly controller: MapDrawController;
	readonly geometry: DrawGeometry | null;
	readonly geometryType: DrawGeometryType;
	/** Unused when the record's policy allows one type — the toggle never renders. */
	readonly onTypeChange?: (type: DrawGeometryType) => void;
	readonly onDraw: () => void;
	readonly onClear: () => void;
	/** The record kind whose geometry this captures. Its policy sets the toggle. */
	readonly geometryKind: OwnedGeometryKind;
	readonly label?: string;
	/** Marks the label with `*` when the record cannot be saved without geometry. */
	readonly required?: boolean;
	/** Snap the geometry back to the selected address; hidden when omitted. */
	readonly onMoveToAddress?: () => void;
	/**
	 * The agency whose regions may be reused as a polygon. Pass it on any form
	 * that captures areas — without it the "fill from a region" shortcut is
	 * hidden, since there is no org to search.
	 */
	readonly organizationId?: string;
	/**
	 * Extra capture affordances for records whose geometry has a source beyond
	 * drawing — the address book's geocoder, for one. Rendered alongside the draw
	 * and clear buttons so every path to a geometry sits in one row.
	 */
	readonly extraActions?: ReactNode;
}

export function GeometryControl({
	controller,
	geometry,
	geometryType,
	onTypeChange,
	onDraw,
	onClear,
	geometryKind,
	label = 'Geometry',
	required = false,
	onMoveToAddress,
	organizationId,
	extraActions,
}: GeometryControlProps) {
	const allowedTypes = getOwnedGeometryBaseTypes(geometryKind);
	const [isImporting, setIsImporting] = useState(false);
	const hasGeometry = geometry !== null;
	const isBusy = controller.isDrawing || controller.isRequestingPoint;
	// Read off the shape this control is showing rather than off the controller,
	// because the address form drives the controller for its "place on map" path
	// alone and holds its point itself.
	const parts = drawParts(geometry);
	// Hidden rather than disabled where the record cannot store the multi shape,
	// so a Notification Registration never offers a piece it would refuse to save.
	// The first piece is the draw button's, so it needs something to add to.
	const canAddPart = hasGeometry && ownedGeometryAllowsParts(geometryKind, geometryType);
	// A hole is a ring inside a ring, so only an area has anywhere to put one. At
	// two pieces and up it moves onto the rows, where the piece it belongs to is
	// the row it sits on.
	const canCutHole = parts.length === 1 && parts[0]?.type === 'Polygon';
	// Snapping to an address produces a point, so the affordance only belongs on
	// the point tool — offering it under Line/Polygon would contradict the toggle.
	const canMoveToAddress = onMoveToAddress !== undefined && geometryType === 'Point';
	// Both shortcuts produce an area or a line, so they belong to those tools
	// only; a point is faster to place by clicking than to source from a file.
	const canUseRegion =
		geometryType === 'Polygon' && organizationId !== undefined && organizationId.length > 0;
	// The file parser is what caps this, not the record's policy: it has no Point
	// arm, and KML carries geometry only as an area or a line.
	const canImportFile = isImportGeometryKind(geometryType);

	return (
		<div className="grid gap-2 rounded-md border border-border/40 bg-background/70 p-3">
			<div className="flex items-start justify-between gap-3">
				<span className="font-medium text-foreground text-sm">
					{label}
					{required ? <RequiredMark /> : null}
				</span>
				{hasGeometry ? (
					<Badge tone="success" variant="outline">
						<CheckIcon aria-hidden="true" />
						Captured
					</Badge>
				) : (
					/*
					 * Destructive, not neutral. A record without geometry cannot be placed
					 * on any map in the product, which is where nearly all of its later
					 * value comes from — a grey chip read as a setting nobody had got to.
					 */
					<Badge tone="danger" variant="outline">
						Not set
					</Badge>
				)}
			</div>

			{allowedTypes.length > 1 ? (
				<ToggleGroup
					aria-label="Geometry type"
					className="w-full"
					disabled={isBusy}
					onValueChange={(next) => {
						if (isDrawGeometryType(next) && allowedTypes.includes(next)) {
							onTypeChange?.(next);
						}
					}}
					size="sm"
					type="single"
					value={geometryType}
					variant="outline"
				>
					{allowedTypes.map((type) => (
						<ToggleGroupItem className="flex-1 text-xs" key={type} value={type}>
							{GEOMETRY_TYPE_LABELS[type]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			) : null}

			{parts.length > 1 ? (
				<GeometryPartList
					disabled={isBusy}
					onCutHole={controller.startHole}
					onHighlight={controller.highlightPart}
					onRemove={controller.removePart}
					onRemoveHole={controller.removeHole}
					onZoom={controller.zoomToPart}
					parts={parts}
				/>
			) : (
				<GeometryPartSummary
					disabled={isBusy}
					onRemoveHole={controller.removeHole}
					part={parts[0]}
				/>
			)}

			<div className="flex flex-wrap gap-2">
				<Button
					disabled={isBusy}
					onClick={onDraw}
					size="sm"
					type="button"
					variant={hasGeometry ? 'outline' : 'default'}
				>
					{controller.isDrawing ? (
						<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
					) : (
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
					)}
					{controller.isDrawing ? 'Drawing on the Map…' : drawLabel(geometryType, hasGeometry)}
				</Button>
				{canAddPart ? (
					<Button
						disabled={isBusy}
						onClick={controller.startPart}
						size="sm"
						type="button"
						variant="outline"
					>
						<AddIcon aria-hidden="true" data-icon="inline-start" />
						Add piece
					</Button>
				) : null}
				{canCutHole ? (
					<Button
						disabled={isBusy}
						onClick={() => controller.startHole(0)}
						size="sm"
						type="button"
						variant="outline"
					>
						<CircleIcon aria-hidden="true" data-icon="inline-start" />
						Cut hole
					</Button>
				) : null}
				{canMoveToAddress ? (
					<Button
						disabled={isBusy}
						onClick={onMoveToAddress}
						size="sm"
						type="button"
						variant="ghost"
					>
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
						Move to Address
					</Button>
				) : null}
				{extraActions}
				{hasGeometry && !isBusy ? (
					<Button onClick={onClear} size="sm" type="button" variant="ghost">
						<XIcon aria-hidden="true" data-icon="inline-start" />
						Clear
					</Button>
				) : null}
			</div>

			{/* Shapes an agency already holds — a region boundary, a file from GIS
			    staff — beat re-tracing them by hand, so they sit beside the draw
			    tool rather than replacing it: whatever lands here is still editable. */}
			{canUseRegion || canImportFile ? (
				<div className="flex flex-wrap items-center gap-2 border-border/40 border-t pt-2">
					<span className="text-muted-foreground text-xs">Fill from</span>
					{canUseRegion && organizationId !== undefined ? (
						<RegionBoundaryPicker
							disabled={isBusy}
							onSelect={(polygon) => controller.commit(polygon)}
							organizationId={organizationId}
						/>
					) : null}
					{canImportFile ? (
						<Button
							aria-label="Fill this geometry from a KML, KMZ, or GeoJSON file"
							disabled={isBusy}
							onClick={() => setIsImporting(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							<UploadIcon aria-hidden="true" data-icon="inline-start" />
							File
						</Button>
					) : null}
				</div>
			) : null}

			{canImportFile ? (
				<GeometryImportDialog
					geometryType={geometryType === 'Polygon' ? 'Polygon' : 'LineString'}
					onOpenChange={setIsImporting}
					onSelect={(imported) => controller.commit(imported)}
					open={isImporting}
				/>
			) : null}
		</div>
	);
}

/**
 * The on-map counterpart to `GeometryControl`. Point draws finish on the first
 * click, so only line/polygon draws get Undo/Finish; a pending `requestPoint`
 * (the address "place on map" flow) shows its own prompt instead.
 */
export function DrawToolbar({
	controller,
	geometryType,
	pointPrompt = 'Click the map to place the point.',
}: {
	readonly controller: MapDrawController;
	readonly geometryType: DrawGeometryType;
	readonly pointPrompt?: string;
}) {
	if (controller.isRequestingPoint) {
		return (
			<MapPrompt>
				<MapPinnedIcon aria-hidden="true" className="size-4 text-primary" />
				{pointPrompt} Press Esc to cancel.
			</MapPrompt>
		);
	}

	if (!controller.isDrawing) {
		return null;
	}

	const isPoint = geometryType === 'Point';

	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<div className="pointer-events-auto flex max-w-full flex-col gap-2 rounded-lg border border-border/60 bg-card/95 p-2 shadow-lg backdrop-blur-sm">
				<p className="m-0 px-1 text-muted-foreground text-xs">
					{controller.holeDraft === null
						? drawInstruction(geometryType, controller.vertexCount, controller.isAddingPart)
						: holeInstruction(controller.vertexCount, controller.holeDraft)}
				</p>
				<div className="flex items-center gap-1.5">
					{isPoint ? null : (
						<Button
							disabled={controller.vertexCount === 0}
							onClick={controller.undo}
							size="sm"
							type="button"
							variant="ghost"
						>
							<ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
							Undo
						</Button>
					)}
					<Button onClick={controller.cancel} size="sm" type="button" variant="ghost">
						<XIcon aria-hidden="true" data-icon="inline-start" />
						Cancel
					</Button>
					{isPoint ? null : (
						<Button
							disabled={!controller.canFinish}
							onClick={controller.finish}
							size="sm"
							type="button"
						>
							<CheckIcon aria-hidden="true" data-icon="inline-start" />
							Finish
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

function MapPrompt({ children }: { readonly children: React.ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in">
			<p className="m-0 inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-foreground text-sm shadow-lg backdrop-blur-sm">
				{children}
			</p>
		</div>
	);
}

/** Ease the map to frame `geometry` when it changes, but never mid-draw. */
export function useFitToGeometry(
	map: MapboxMap | null,
	geometry: GeoJsonGeometry | null,
	isDrawing = false,
): void {
	const lastFitRef = useRef<string | null>(null);
	useEffect(() => {
		if (map === null || geometry === null || isDrawing) {
			return;
		}
		// Only refit when the geometry itself changes, not on every render, so the
		// user's manual pans aren't yanked back.
		const signature = JSON.stringify(geometry);
		if (lastFitRef.current === signature) {
			return;
		}
		lastFitRef.current = signature;
		fitMapToGeometry(map, geometry);
	}, [map, geometry, isDrawing]);
}

// --- helpers ----------------------------------------------------------------

function drawLabel(type: DrawGeometryType, hasGeometry: boolean): string {
	const verb = hasGeometry ? 'Redraw' : 'Draw';
	if (type === 'Point') {
		return hasGeometry ? 'Refine Point' : 'Drop Point';
	}
	return `${verb} ${type === 'LineString' ? 'Line' : 'Polygon'}`;
}

function drawInstruction(
	type: DrawGeometryType,
	vertexCount: number,
	isAddingPart: boolean,
): string {
	if (type === 'Point') {
		return isAddingPart
			? 'Click the map to place another point.'
			: 'Click the map to place the point.';
	}
	const noun = isAddingPart ? 'piece' : type === 'LineString' ? 'line' : 'area';
	return progress(
		vertexCount,
		type === 'LineString' ? 2 : 3,
		`Click the map to start the ${noun}.`,
	);
}

/**
 * What the toolbar says while a hole is being cut, which names the piece the
 * moment the hole leaves it.
 *
 * The name is what makes the refusal actionable at several pieces: the map shows
 * a red ring, and the number is what says which of the shapes on screen it was
 * supposed to sit inside.
 */
function holeInstruction(vertexCount: number, draft: DrawHoleDraft): string {
	// At one piece there is no row list, so the number is a term the user has not
	// seen. It earns its place the moment there are several shapes on screen.
	const named = draft.partCount > 1 ? `piece ${draft.partNumber}` : 'the area';
	if (draft.problem === 'escapes') {
		return `The hole must stay inside ${named}.`;
	}
	if (draft.problem === 'swallows') {
		return `The hole leaves nothing of ${named}.`;
	}
	const start =
		draft.partCount > 1
			? `Click the map to start the hole in piece ${draft.partNumber}.`
			: 'Click the map to start the hole.';
	return progress(vertexCount, 3, start);
}

/** How far along a ring or a line is, once it has a vertex on the map. */
function progress(vertexCount: number, minimum: number, start: string): string {
	if (vertexCount === 0) {
		return start;
	}
	const count = `${vertexCount} ${vertexCount === 1 ? 'vertex' : 'vertices'}`;
	if (vertexCount < minimum) {
		return `${count} · add ${minimum - vertexCount} more to finish.`;
	}
	return `${count} · double-click or Finish to complete.`;
}

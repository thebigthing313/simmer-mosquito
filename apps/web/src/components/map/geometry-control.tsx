import {
	getBaseGeometryType,
	getOwnedGeometryBaseTypes,
	getOwnedGeometryPolicy,
	type OwnedGeometryKind,
	ownedGeometryAllowsParts,
} from '@simmer-mosquito/domain';
import {
	type GeoJsonGeometry,
	type ImportGeometryKind,
	isImportGeometryKind,
} from '@simmer-mosquito/mapping';
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
	SplineIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { GeometryImportDialog } from './geometry-import-dialog';
import { GEOMETRY_TYPE_LABELS, GeometryPartList, GeometryPartSummary } from './geometry-parts';
import { RegionBoundaryPicker } from './region-boundary-picker';
import {
	type DrawContinueDraft,
	type DrawEditDraft,
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
 * A geometry can also be filled from a shape the agency already has instead of
 * being traced by hand: a KML, KMZ or GeoJSON file on any record, and one of the
 * agency's own regions where the record stores an area. Those shortcuts commit
 * through the same draw controller, so an adopted shape behaves exactly like a
 * drawn one and can be redrawn or cleared.
 */

const UploadIcon = iconRegistry.actions.upload.icon;
const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

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
	const hasGeometry = geometry !== null;
	const isBusy = controller.isDrawing || controller.isRequestingPoint;
	// Read off the shape this control is showing rather than off the controller,
	// because the address form drives the controller for its "place on map" path
	// alone and holds its point itself.
	const parts = drawParts(geometry);
	// One piece is what puts Continue and Cut hole on the control at all. At two
	// they move onto the rows, where the piece each belongs to is the row it sits
	// on.
	const only = parts.length === 1 ? parts[0] : undefined;
	// Hidden rather than disabled where the record cannot store the multi shape,
	// so a Notification Registration never offers a piece it would refuse to save.
	// The first piece is the draw button's, so it needs something to add to.
	const canAddPart = hasGeometry && ownedGeometryAllowsParts(geometryKind, geometryType);
	// Snapping to an address produces a point, so the affordance only belongs on
	// the point tool. Offering it under Line/Polygon would contradict the toggle.
	const canMoveToAddress = onMoveToAddress !== undefined && geometryType === 'Point';

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
					onContinue={controller.continuePart}
					onCutHole={controller.startHole}
					onEditVertices={controller.editPart}
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
				{/* A point is one position, so there is no end to carry on from. */}
				{only !== undefined && only.type !== 'Point' ? (
					<Button
						disabled={isBusy}
						onClick={() => controller.continuePart(0)}
						size="sm"
						type="button"
						variant="outline"
					>
						<EditIcon aria-hidden="true" data-icon="inline-start" />
						Continue
					</Button>
				) : null}
				{only !== undefined ? (
					<Button
						disabled={isBusy}
						onClick={() => controller.editPart(0)}
						size="sm"
						type="button"
						variant="outline"
					>
						<SplineIcon aria-hidden="true" data-icon="inline-start" />
						Edit vertices
					</Button>
				) : null}
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
				{/* A hole is a ring inside a ring, so only an area has anywhere to put one. */}
				{only?.type === 'Polygon' ? (
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

			<GeometrySources
				controller={controller}
				geometryKind={geometryKind}
				geometryType={geometryType}
				isBusy={isBusy}
				onTypeChange={onTypeChange}
				organizationId={organizationId}
			/>
		</div>
	);
}

/**
 * The shapes an agency already holds: one of its regions, or a KML, KMZ or
 * GeoJSON file from GIS staff.
 *
 * Both beat re-tracing a boundary by hand, so they sit beside the draw tool
 * rather than replacing it. Both commit through the same draw controller, so
 * what lands here can still be redrawn or cleared.
 */
function GeometrySources({
	controller,
	geometryKind,
	geometryType,
	isBusy,
	onTypeChange,
	organizationId,
}: {
	readonly controller: MapDrawController;
	readonly geometryKind: OwnedGeometryKind;
	readonly geometryType: DrawGeometryType;
	readonly isBusy: boolean;
	readonly onTypeChange: ((type: DrawGeometryType) => void) | undefined;
	readonly organizationId: string | undefined;
}) {
	const [isImporting, setIsImporting] = useState(false);
	// A region boundary is an area, so the shortcut belongs to that tool only, and
	// there has to be an agency to search.
	const regionOrganizationId =
		geometryType === 'Polygon' && organizationId !== undefined && organizationId.length > 0
			? organizationId
			: null;
	// What the record stores, filtered to what the file parser can produce. The
	// parser reads all six shapes, so the filter drops nothing today and every
	// record offers the file import. It stays because the register and the parser
	// are two packages with two unions, and a shape one of them gains ahead of the
	// other has to fall out here rather than be offered and then refused.
	const importableTypes: readonly ImportGeometryKind[] =
		getOwnedGeometryPolicy(geometryKind).allowedTypes.filter(isImportGeometryKind);
	const canImportFile = importableTypes.length > 0;

	if (regionOrganizationId === null && !canImportFile) {
		return null;
	}

	return (
		<>
			<div className="flex flex-wrap items-center gap-2 border-border/40 border-t pt-2">
				<span className="text-muted-foreground text-xs">Fill from</span>
				{regionOrganizationId === null ? null : (
					<RegionBoundaryPicker
						allowsParts={ownedGeometryAllowsParts(geometryKind, 'Polygon')}
						disabled={isBusy}
						onSelect={(boundary) => controller.commit(boundary)}
						organizationId={regionOrganizationId}
					/>
				)}
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

			{canImportFile ? (
				<GeometryImportDialog
					allowedTypes={importableTypes}
					onOpenChange={setIsImporting}
					onSelect={(imported) => {
						// The dialog offers everything the record stores, so an adopted
						// shape can be a kind the toggle is not on. Moving the toggle
						// first lets its own clear land before the shape does.
						const base = getBaseGeometryType(imported.type);
						if (base !== geometryType) {
							onTypeChange?.(base);
						}
						controller.commit(imported);
					}}
					open={isImporting}
				/>
			) : null}
		</>
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

	// An edit of a point is a corner to drag, so the toolbar it needs is the full
	// one. Only a point being *placed* finishes on its first click with nothing to
	// undo or complete.
	const editedPart = controller.editedPart;
	const isPoint = geometryType === 'Point' && editedPart === null;
	const selected = editedPart?.selected ?? null;

	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<div className="pointer-events-auto flex max-w-full flex-col gap-2 rounded-lg border border-border/60 bg-card/95 p-2 shadow-lg backdrop-blur-sm">
				<p className="m-0 px-1 text-muted-foreground text-xs">
					{toolbarInstruction(controller, geometryType)}
				</p>
				<div className="flex items-center gap-1.5">
					{isPoint ? null : (
						<Button
							disabled={!controller.canUndo}
							onClick={controller.undo}
							size="sm"
							type="button"
							variant="ghost"
						>
							<ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
							Undo
						</Button>
					)}
					{editedPart === null ? null : (
						<Button
							disabled={selected === null}
							onClick={() => {
								if (selected !== null) {
									controller.deleteVertex(selected);
								}
							}}
							size="sm"
							type="button"
							variant="ghost"
						>
							<DeleteIcon aria-hidden="true" data-icon="inline-start" />
							Delete vertex
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

/** What the toolbar says the current draw is, which is one of three things. */
function toolbarInstruction(controller: MapDrawController, type: DrawGeometryType): string {
	if (controller.holeDraft !== null) {
		return holeInstruction(controller.vertexCount, controller.holeDraft);
	}
	if (controller.continuedPart !== null) {
		return continueInstruction(controller.vertexCount, controller.continuedPart);
	}
	if (controller.editedPart !== null) {
		return editInstruction(controller.editedPart);
	}
	return drawInstruction(type, controller.vertexCount, controller.isAddingPart);
}

/**
 * What the toolbar says while a finished piece is being edited.
 *
 * Drag and click are named because the map is the only place either happens.
 * Delete is not: it has a button of its own beside Finish. The piece is named
 * once there are several, the way a hole names the one it is cut into.
 */
function editInstruction(draft: DrawEditDraft): string {
	const named = draft.partCount > 1 ? `piece ${draft.partNumber}` : 'the shape';
	if (draft.problem === 'holesEscape') {
		return `The holes must stay inside ${named}.`;
	}
	if (draft.problem === 'tooFewVertices') {
		return 'Add a vertex back to finish.';
	}
	return `Editing ${named} · drag a vertex, or click an edge to add one.`;
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

/**
 * What the toolbar says while a finished piece is being added to.
 *
 * It opens with the piece's vertices already on the map, so there is no "start
 * here" line to write. The piece is named once there are several, the way a hole
 * names the one it is cut into.
 */
function continueInstruction(vertexCount: number, draft: DrawContinueDraft): string {
	const named = draft.partCount > 1 ? `piece ${draft.partNumber}` : 'the shape';
	if (draft.problem === 'holesEscape') {
		return `The holes must stay inside ${named}.`;
	}
	const count = `${vertexCount} ${vertexCount === 1 ? 'vertex' : 'vertices'}`;
	return `Continuing ${named} · ${count} · double-click or Finish to complete.`;
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

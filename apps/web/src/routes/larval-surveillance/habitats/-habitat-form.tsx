import {
	boundsFromGeoJson,
	centroidFromGeoJson,
	type GeoJsonGeometry,
} from '@simmer-mosquito/mapping';
import type { HabitatTypeRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	ArrowLeftIcon,
	CheckIcon,
	Loader2Icon,
	MapPinnedIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import {
	type DrawGeometry,
	type DrawGeometryType,
	type MapDrawController,
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import type { MetadataValue } from '../../../forms/field-components/metadata-field';
import { AddressIdInput } from '../../-habitat-location-fields';

export const noHabitatTypeValue = 'none';

export interface HabitatFormValues {
	readonly habitatName: string;
	readonly addressId: string | null;
	readonly habitatTypeId: string;
	readonly description: string;
	readonly metadata: MetadataValue;
}

export interface HabitatFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/larval-surveillance/habitats' | '/larval-surveillance/habitats/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface HabitatFormPageProps {
	readonly mode: 'create' | 'edit';
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly defaultValues: HabitatFormValues;
	readonly initialGeometry: DrawGeometry | null;
	readonly header: HabitatFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: HabitatFormValues;
		readonly geometry: DrawGeometry;
	}) => Promise<void>;
}

export function defaultHabitatFormValues(): HabitatFormValues {
	return {
		habitatName: '',
		addressId: null,
		habitatTypeId: noHabitatTypeValue,
		description: '',
		metadata: null,
	};
}

export function HabitatFormPage({
	mode,
	organizationId,
	actorProfileId,
	canSubmit,
	habitatTypes,
	defaultValues,
	initialGeometry,
	header,
	submitLabel,
	onSave,
}: HabitatFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry?.type ?? 'Point',
	);
	const [geometryError, setGeometryError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		if (next !== null) {
			setGeometryError(null);
		}
	}, []);

	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start, requestPoint } = draw;

	// One frame the geometry lands, ease the map to frame it (edit pre-fill, or a
	// freshly finished draw) so the result is centered without a manual pan.
	useFitToGeometry(map, geometry, draw.isDrawing);

	// Reuse the address subform's manual "place on map" affordance against the same
	// draw controller; it captures one click and resolves a point.
	const requestMapPoint = useCallback(
		(options?: { readonly prompt?: string }) => requestPoint(options?.prompt),
		[requestPoint],
	);

	const activeHabitatTypes = useMemo(
		() => habitatTypes.filter((type) => type.isActive),
		[habitatTypes],
	);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			if (geometry === null) {
				setGeometryError('Draw the habitat geometry on the map before saving.');
				return;
			}
			try {
				await onSave({ values: value, geometry });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save habitat.');
			}
		},
	});

	const handleTypeChange = useCallback(
		(next: DrawGeometryType) => {
			setGeometryType(next);
			// A new shape replaces the old one; clear so a stale point/line/polygon
			// isn't silently saved under the wrong type.
			setGeometry(null);
			if (draw.isDrawing) {
				start(next);
			}
		},
		[draw.isDrawing, start],
	);

	const startDraw = useCallback(() => {
		setGeometryError(null);
		start(geometryType);
	}, [geometryType, start]);

	// On edit, open the map already framed on the saved geometry; create starts on
	// the org's default view and lets the user pan to the site.
	const editCamera = mode === 'edit' ? cameraForGeometry(initialGeometry) : undefined;

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						habitatLayer={{ serverUrl: getServerUrl(), filters: { isActive: true } }}
						onMapReady={handleMapReady}
						{...(editCamera === undefined ? {} : { camera: editCamera })}
					/>
					<DrawToolbar controller={draw} geometryType={geometryType} />
					<MapLegend mode={mode} />
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className="sticky top-0 z-10 grid gap-2 border-border/50 border-b bg-background/95 px-5 py-4 backdrop-blur-sm">
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						params={header.backParams ?? {}}
						to={header.backTo}
					>
						<ArrowLeftIcon aria-hidden="true" />
						{header.backLabel}
					</Link>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
							{header.title}
						</h1>
						<p className="m-0 text-muted-foreground text-sm">{header.description}</p>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<form.AppForm>
						<form
							className="grid gap-5"
							onSubmit={(event) => {
								event.preventDefault();
								void form.handleSubmit();
							}}
						>
							<form.FormErrorAlert title="Unable to save habitat" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to save habitat</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<div className="grid gap-5 sm:grid-cols-2">
								<form.AppField name="habitatName">
									{(field) => (
										<field.TextField
											label="Habitat name"
											placeholder="e.g. North basin catchment"
										/>
									)}
								</form.AppField>
								<form.AppField name="habitatTypeId">
									{(field) => (
										<field.SelectField
											label="Habitat type"
											options={habitatTypeOptions(activeHabitatTypes)}
											placeholder="Select a type"
										/>
									)}
								</form.AppField>
							</div>

							<GeometrySection
								controller={draw}
								geometry={geometry}
								geometryType={geometryType}
								error={geometryError}
								onTypeChange={handleTypeChange}
								onDraw={startDraw}
								onClear={() => setGeometry(null)}
							/>

							<form.AppField name="addressId">
								{(field) => (
									<AddressIdInput
										actorProfileId={actorProfileId}
										organizationId={organizationId}
										requestMapPoint={requestMapPoint}
										value={field.state.value}
										onValueChange={field.handleChange}
									/>
								)}
							</form.AppField>

							<form.AppField
								name="description"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Description is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextareaField
										label="Description"
										placeholder="Describe access notes, habitat condition, and useful field context."
										rows={4}
									/>
								)}
							</form.AppField>

							<form.AppField name="metadata">
								{(field) => (
									<field.MetadataField
										label="Metadata"
										description="Optional structured notes for agency-specific habitat details."
										mode={{ kind: 'manual' }}
									/>
								)}
							</form.AppField>

							<div className="border-border/50 border-t pt-5">
								<form.FormActions>
									<form.ResetButton />
									<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
								</form.FormActions>
							</div>
						</form>
					</form.AppForm>
				</div>
			</div>
		</MapSplitPage>
	);
}

// --- geometry form section --------------------------------------------------

const GEOMETRY_TYPE_OPTIONS: readonly {
	readonly value: DrawGeometryType;
	readonly label: string;
}[] = [
	{ value: 'Point', label: 'Point' },
	{ value: 'LineString', label: 'Line' },
	{ value: 'Polygon', label: 'Polygon' },
];

function GeometrySection({
	controller,
	geometry,
	geometryType,
	error,
	onTypeChange,
	onDraw,
	onClear,
}: {
	readonly controller: MapDrawController;
	readonly geometry: DrawGeometry | null;
	readonly geometryType: DrawGeometryType;
	readonly error: string | null;
	readonly onTypeChange: (type: DrawGeometryType) => void;
	readonly onDraw: () => void;
	readonly onClear: () => void;
}) {
	const hasGeometry = geometry !== null;

	return (
		<section
			aria-labelledby="habitat-geometry-label"
			className={cn(
				'grid gap-3 rounded-md border bg-muted/30 p-4',
				error === null ? 'border-border/50' : 'border-destructive/60',
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="grid gap-0.5">
					<span
						className="font-semibold text-foreground text-sm leading-none"
						id="habitat-geometry-label"
					>
						Location geometry
					</span>
					<span className="text-muted-foreground text-xs">
						Draw on the map; existing habitats stay visible for reference.
					</span>
				</div>
				{hasGeometry ? (
					<Badge tone="success" variant="outline">
						<CheckIcon aria-hidden="true" />
						Captured
					</Badge>
				) : (
					<Badge tone="neutral" variant="outline">
						Not set
					</Badge>
				)}
			</div>

			<ToggleGroup
				aria-label="Geometry type"
				className="w-full"
				disabled={controller.isDrawing}
				onValueChange={(next) => {
					if (next === 'Point' || next === 'LineString' || next === 'Polygon') {
						onTypeChange(next);
					}
				}}
				size="sm"
				type="single"
				value={geometryType}
				variant="outline"
			>
				{GEOMETRY_TYPE_OPTIONS.map((option) => (
					<ToggleGroupItem className="flex-1 text-xs" key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>

			<div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/70 px-3 py-2">
				<MapPinnedIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
				<p className="m-0 min-w-0 flex-1 truncate text-foreground text-sm">
					{geometrySummary(geometry)}
				</p>
			</div>

			<div className="flex flex-wrap gap-2">
				<Button
					disabled={controller.isDrawing}
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
					{controller.isDrawing
						? 'Drawing on the map…'
						: hasGeometry
							? 'Redraw geometry'
							: 'Draw geometry'}
				</Button>
				{hasGeometry && !controller.isDrawing ? (
					<Button onClick={onClear} size="sm" type="button" variant="ghost">
						<XIcon aria-hidden="true" data-icon="inline-start" />
						Clear
					</Button>
				) : null}
			</div>

			{error === null ? null : <p className="m-0 text-destructive text-sm">{error}</p>}
		</section>
	);
}

// --- on-map chrome ----------------------------------------------------------

function DrawToolbar({
	controller,
	geometryType,
}: {
	readonly controller: MapDrawController;
	readonly geometryType: DrawGeometryType;
}) {
	if (controller.isRequestingPoint) {
		return (
			<MapPrompt>
				<MapPinnedIcon aria-hidden="true" className="size-4 text-primary" />
				Click the map to place the address point. Press Esc to cancel.
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
					{drawInstruction(geometryType, controller.vertexCount)}
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

function MapLegend({ mode }: { readonly mode: 'create' | 'edit' }) {
	return (
		<div className="pointer-events-none absolute bottom-10 left-4 z-10 flex flex-col gap-1.5 rounded-md border border-border/50 bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
			<span className="flex items-center gap-2 text-foreground">
				<span aria-hidden="true" className="size-2.5 rounded-full bg-[#f59e0b]" />
				{mode === 'edit' ? 'This habitat' : 'New habitat'}
			</span>
			<span className="flex items-center gap-2 text-muted-foreground">
				<span aria-hidden="true" className="size-2.5 rounded-full bg-[#16b364]" />
				Existing habitats
			</span>
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

// --- helpers ----------------------------------------------------------------

function useFitToGeometry(
	map: MapboxMap | null,
	geometry: DrawGeometry | null,
	isDrawing: boolean,
): void {
	const lastFitRef = useRef<string | null>(null);
	useEffect(() => {
		if (map === null || geometry === null || isDrawing) {
			return;
		}
		// Only refit when the geometry itself changes, not on every render, so the
		// user's manual pans during editing aren't yanked back.
		const signature = JSON.stringify(geometry);
		if (lastFitRef.current === signature) {
			return;
		}
		lastFitRef.current = signature;

		const bounds = boundsFromGeoJson(geometry as unknown as GeoJsonGeometry);
		if (bounds === null) {
			return;
		}
		const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
		if (hasArea) {
			map.fitBounds(
				[
					[bounds.west, bounds.south],
					[bounds.east, bounds.north],
				],
				{ padding: 80, maxZoom: 17, duration: 600 },
			);
		} else {
			map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
		}
	}, [map, geometry, isDrawing]);
}

function cameraForGeometry(geometry: DrawGeometry | null) {
	if (geometry === null) {
		return undefined;
	}
	const centroid = centroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
	if (centroid === null) {
		return undefined;
	}
	return { center: [centroid.lng, centroid.lat] as [number, number], zoom: 15 };
}

function habitatTypeOptions(habitatTypes: readonly HabitatTypeRow[]) {
	return [
		{ label: 'Unassigned type', value: noHabitatTypeValue },
		...habitatTypes.map((type) => ({ label: type.name, value: type.id })),
	];
}

function drawInstruction(type: DrawGeometryType, vertexCount: number): string {
	if (type === 'Point') {
		return 'Click the map to place the point.';
	}
	const noun = type === 'LineString' ? 'line' : 'area';
	const minimum = type === 'LineString' ? 2 : 3;
	if (vertexCount === 0) {
		return `Click the map to start the ${noun}.`;
	}
	const count = `${vertexCount} ${vertexCount === 1 ? 'vertex' : 'vertices'}`;
	if (vertexCount < minimum) {
		const remaining = minimum - vertexCount;
		return `${count} · add ${remaining} more to finish.`;
	}
	return `${count} · double-click or Finish to complete.`;
}

function geometrySummary(geometry: DrawGeometry | null): string {
	if (geometry === null) {
		return 'No geometry drawn yet.';
	}
	if (geometry.type === 'Point') {
		const coordinates = geometry.coordinates;
		if (!Array.isArray(coordinates) || coordinates.length < 2) {
			return 'Point';
		}
		return `Point · ${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
	}
	if (geometry.type === 'LineString') {
		const count = Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
		return `Line · ${count} vertices`;
	}
	const ring = geometry.coordinates?.[0] ?? [];
	return `Polygon · ${Math.max(ring.length - 1, 0)} vertices`;
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';

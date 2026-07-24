import { boundsFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { RegionFolderRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
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
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import {
	type DrawGeometry,
	type MapDrawController,
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import type { MetadataValue } from '../../../forms/field-components/metadata-field';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noRegionFolderValue = 'none';

export interface RegionFormValues {
	readonly name: string;
	readonly regionFolderId: string;
	readonly description: string;
	readonly metadata: MetadataValue;
}

export interface RegionFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/gis/regions' | '/gis/regions/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface RegionFormPageProps {
	readonly mode: 'create' | 'edit';
	readonly canSubmit: boolean;
	readonly regionFolders: readonly RegionFolderRow[];
	readonly defaultValues: RegionFormValues;
	/** The region's boundary to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	readonly header: RegionFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: RegionFormValues;
		/** The boundary. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew or redrew the boundary this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultRegionFormValues(): RegionFormValues {
	return {
		name: '',
		regionFolderId: noRegionFolderValue,
		description: '',
		metadata: null,
	};
}

export function RegionFormPage({
	mode,
	canSubmit,
	regionFolders,
	defaultValues,
	initialGeometry = null,
	header,
	submitLabel,
	onSave,
}: RegionFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [geometryError, setGeometryError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
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
	const { start } = draw;

	useFitToGeometry(map, geometry, draw.isDrawing);

	const activeFolders = useMemo(
		() => [...regionFolders].sort((a, b) => a.name.localeCompare(b.name)),
		[regionFolders],
	);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			if (geometry === null) {
				setGeometryError('Draw the region boundary on the map before saving.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save region.');
			}
		},
	});

	const startDraw = useCallback(() => {
		setGeometryError(null);
		start('Polygon');
	}, [start]);

	const clearGeometry = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas controls={{ layers: false }} onMapReady={handleMapReady} />
					<DrawToolbar controller={draw} />
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
							<form.FormErrorAlert title="Unable to Save Region" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to Save Region</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<div className="grid gap-5 sm:grid-cols-2">
								<form.AppField
									name="name"
									validators={{
										onSubmit: ({ value }) =>
											value.trim().length === 0 ? 'Name is required.' : undefined,
									}}
								>
									{(field) => <field.TextField label="Name" placeholder="e.g. North district" />}
								</form.AppField>
								<form.AppField name="regionFolderId">
									{(field) => (
										<field.SelectField
											label="Folder"
											options={folderOptions(activeFolders)}
											placeholder="Unfiled"
										/>
									)}
								</form.AppField>
							</div>

							<GeometrySection
								controller={draw}
								error={geometryError}
								geometry={geometry}
								onClear={clearGeometry}
								onDraw={startDraw}
							/>

							<form.AppField name="description">
								{(field) => (
									<field.TextareaField
										description="Optional context — what this region covers and how it's used."
										label="Description (optional)"
										placeholder="Describe the region…"
										rows={3}
									/>
								)}
							</form.AppField>

							<form.AppField name="metadata">
								{(field) => (
									<field.MetadataField
										description="Optional structured notes for agency-specific region details."
										label="Metadata"
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

function GeometrySection({
	controller,
	geometry,
	error,
	onDraw,
	onClear,
}: {
	readonly controller: MapDrawController;
	readonly geometry: DrawGeometry | null;
	readonly error: string | null;
	readonly onDraw: () => void;
	readonly onClear: () => void;
}) {
	const hasGeometry = geometry !== null;

	return (
		<section
			aria-labelledby="region-geometry-label"
			className={cn(
				'grid gap-3 rounded-md border bg-muted/30 p-4',
				error === null ? 'border-border/50' : 'border-destructive/60',
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="grid gap-0.5">
					<span
						className="font-semibold text-foreground text-sm leading-none"
						id="region-geometry-label"
					>
						Boundary (required)
					</span>
					<span className="text-muted-foreground text-xs">Draw the region's area on the map.</span>
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
						? 'Drawing on the Map…'
						: hasGeometry
							? 'Redraw Boundary'
							: 'Draw Boundary'}
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

function DrawToolbar({ controller }: { readonly controller: MapDrawController }) {
	if (!controller.isDrawing) {
		return null;
	}

	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<div className="pointer-events-auto flex max-w-full flex-col gap-2 rounded-lg border border-border/60 bg-card/95 p-2 shadow-lg backdrop-blur-sm">
				<p className="m-0 px-1 text-muted-foreground text-xs">
					{drawInstruction(controller.vertexCount)}
				</p>
				<div className="flex items-center gap-1.5">
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
					<Button onClick={controller.cancel} size="sm" type="button" variant="ghost">
						<XIcon aria-hidden="true" data-icon="inline-start" />
						Cancel
					</Button>
					<Button
						disabled={!controller.canFinish}
						onClick={controller.finish}
						size="sm"
						type="button"
					>
						<CheckIcon aria-hidden="true" data-icon="inline-start" />
						Finish
					</Button>
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
				{mode === 'edit' ? 'This region' : 'New region'}
			</span>
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
			map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 13) });
		}
	}, [map, geometry, isDrawing]);
}

function folderOptions(folders: readonly RegionFolderRow[]) {
	return [
		{ label: 'Unfiled', value: noRegionFolderValue },
		...folders.map((folder) => ({ label: folder.name, value: folder.id })),
	];
}

function drawInstruction(vertexCount: number): string {
	if (vertexCount === 0) {
		return 'Click the map to start the boundary.';
	}
	const count = `${vertexCount} ${vertexCount === 1 ? 'vertex' : 'vertices'}`;
	if (vertexCount < 3) {
		const remaining = 3 - vertexCount;
		return `${count} · add ${remaining} more to finish.`;
	}
	return `${count} · double-click or Finish to complete.`;
}

function geometrySummary(geometry: DrawGeometry | null): string {
	if (geometry === null) {
		return 'No boundary drawn yet.';
	}
	if (geometry.type !== 'Polygon') {
		return 'Boundary captured';
	}
	const ring = geometry.coordinates?.[0] ?? [];
	return `Polygon · ${Math.max(ring.length - 1, 0)} vertices`;
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';

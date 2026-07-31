import { mapInteraction } from '@simmer-mosquito/design-tokens';
import type { RegionFolderRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	POLYGON_DRAW_TYPES,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import type { MetadataValue } from '../../../forms/field-components';

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
					<DrawToolbar controller={draw} geometryType="Polygon" />
					<MapLegend mode={mode} />
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className={stickyHeader({ gap: 'tight', padding: 'roomy' })}>
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
									{(field) => (
										<field.TextField label="Name" required placeholder="e.g. North district" />
									)}
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

							<section
								aria-labelledby="region-geometry-label"
								className={cn(
									'grid gap-3 rounded-md border bg-muted/30 p-4',
									geometryError === null ? 'border-border/50' : 'border-destructive/60',
								)}
							>
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="region-geometry-label"
									>
										Region boundary
									</span>
									<span className="text-muted-foreground text-xs">
										Draw the region's area on the map.
									</span>
								</div>

								<GeometryControl
									allowedTypes={POLYGON_DRAW_TYPES}
									controller={draw}
									geometry={geometry}
									geometryType="Polygon"
									label="Boundary"
									onClear={clearGeometry}
									onDraw={startDraw}
									required
								/>

								{geometryError === null ? null : (
									<p className="m-0 text-destructive text-sm">{geometryError}</p>
								)}
							</section>

							<form.AppField name="description">
								{(field) => (
									<field.TextareaField
										description="Optional context — what this region covers and how it's used."
										label="Description"
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

function MapLegend({ mode }: { readonly mode: 'create' | 'edit' }) {
	return (
		<div className="pointer-events-none absolute bottom-10 left-4 z-10 flex flex-col gap-1.5 rounded-md border border-border/50 bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
			<span className="flex items-center gap-2 text-foreground">
				{/* Same constant the draw layer paints with, so they cannot drift. */}
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full"
					style={{ backgroundColor: mapInteraction.selected }}
				/>
				{mode === 'edit' ? 'This region' : 'New region'}
			</span>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

function folderOptions(folders: readonly RegionFolderRow[]) {
	return [
		{ label: 'Unfiled', value: noRegionFolderValue },
		...folders.map((folder) => ({ label: folder.name, value: folder.id })),
	];
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';

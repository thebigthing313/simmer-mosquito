import { mapInteraction, mapLifecycle } from '@simmer-mosquito/design-tokens';
import { createHabitatCommand } from '@simmer-mosquito/domain';
import { centroidFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { HabitatTypeRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawPoint, useAddressPoint } from '../../../components/map/use-address-point';
import {
	type DrawGeometry,
	type DrawGeometryType,
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { AddressPicker } from '../../../components/pickers/address-picker';
import { useAppForm } from '../../../forms';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import {
	customFieldCount,
	customSchemaFor,
	type MetadataValue,
	validateSchemaMetadata,
} from '../../../forms/field-components';
import { lifecycleOptions } from '../../../lib/lifecycle-options';

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

/**
 * Domain issue path → the form field that holds it. Geometry is captured on the
 * map rather than in a field, so its issues land on the form's alert.
 */
const HABITAT_FIELD_PATHS: Readonly<Record<string, string>> = {
	description: 'description',
	habitatTypeId: 'habitatTypeId',
	addressId: 'addressId',
	metadata: 'metadata',
};

export function HabitatFormPage({
	mode,
	organizationId,
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
	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	// Reuse the address subform's manual "place on map" affordance against the same
	// draw controller; it captures one click and resolves a point.
	const requestMapPoint = useCallback(
		(options?: { readonly prompt?: string }) => requestPoint(options?.prompt),
		[requestPoint],
	);

	// Seeding from an address (or moving onto one) replaces the shape with a point,
	// so the tool selector follows it. Same rule as every other located record:
	// linking an address fills an empty location and never overwrites a drawn one.
	const placeAddressPoint = useCallback((point: DrawPoint) => {
		setGeometry(point);
		setGeometryType('Point');
		setGeometryError(null);
	}, []);
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});

	const form = useAppForm({
		defaultValues,
		validators: {
			/*
			 * The domain builder is the validation contract — the server runs this
			 * same function and rejects with these same issues. Running it here turns
			 * a round-trip and a generic "Unable to save" into a message on the field.
			 */
			onSubmit: domainValidator(
				({ value }: { readonly value: HabitatFormValues }) =>
					createHabitatCommand({
						...FORM_VALIDATION_CONTEXT,
						habitatId: FORM_VALIDATION_CONTEXT.organizationId,
						locationSource: {
							kind: 'geometry',
							geometry: (geometry ?? null) as never,
						},
						addressId: value.addressId,
						habitatTypeId: value.habitatTypeId === noHabitatTypeValue ? null : value.habitatTypeId,
						description: value.description,
						metadata: value.metadata,
					}),
				HABITAT_FIELD_PATHS,
			),
		},
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
					<DrawToolbar
						controller={draw}
						geometryType={geometryType}
						pointPrompt="Click the map to place the address point."
					/>
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
							<form.FormErrorAlert title="Unable to Save Habitat" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to Save Habitat</AlertTitle>
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
											options={habitatTypeOptions(habitatTypes)}
											placeholder="Select a type"
										/>
									)}
								</form.AppField>
							</div>

							{/* Address above geometry, in one section — the same Location block
							    every other located record's form uses. */}
							<section
								aria-labelledby="habitat-location-label"
								className={cn(
									'grid gap-4 rounded-md border bg-muted/30 p-4',
									geometryError === null ? 'border-border/50' : 'border-destructive/60',
								)}
							>
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="habitat-location-label"
									>
										Location
									</span>
									<span className="text-muted-foreground text-xs">
										The geometry is the habitat itself — a point for a single site, a line or area
										for a stretch of one. An address is optional reference.
									</span>
								</div>

								<form.AppField name="addressId">
									{(field) => (
										<AddressPicker
											create={{ requestMapPoint }}
											onSelect={(address) => {
												field.handleChange(address?.id ?? null);
												selectAddress(address);
											}}
											organizationId={organizationId}
											value={field.state.value}
										/>
									)}
								</form.AppField>

								<GeometryControl
									controller={draw}
									geometry={geometry}
									geometryType={geometryType}
									label="Geometry"
									required
									onClear={() => setGeometry(null)}
									onDraw={startDraw}
									onTypeChange={handleTypeChange}
									organizationId={organizationId}
									{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
								/>

								{geometryError === null ? null : (
									<p className="m-0 text-destructive text-sm">{geometryError}</p>
								)}
							</section>

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
										required
										placeholder="Describe access notes, habitat condition, and useful field context."
										rows={4}
									/>
								)}
							</form.AppField>

							{/* Habitat metadata is guided by the type's custom schema (see
							    docs/larval-surveillance-domain.md), but stays open to ad-hoc keys
							    so a habitat can carry notes its type never declared. */}
							<form.Subscribe selector={(state) => state.values.habitatTypeId}>
								{(habitatTypeId) => {
									const schema = customSchemaFor(habitatTypes, habitatTypeId);
									const hasTypeFields = customFieldCount(schema) > 0;
									return (
										<form.AppField
											name="metadata"
											validators={{ onSubmit: validateSchemaMetadata(schema) }}
										>
											{(field) => (
												<field.MetadataField
													label="Metadata"
													description={
														hasTypeFields
															? 'Fields this habitat type collects, plus any agency-specific notes.'
															: 'Optional structured notes for agency-specific habitat details.'
													}
													mode={{ kind: 'schema', schema, allowExtra: true }}
												/>
											)}
										</form.AppField>
									);
								}}
							</form.Subscribe>

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

// --- on-map chrome ----------------------------------------------------------

function MapLegend({ mode }: { readonly mode: 'create' | 'edit' }) {
	return (
		<div className="pointer-events-none absolute bottom-10 left-4 z-10 flex flex-col gap-1.5 rounded-md border border-border/50 bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
			{/*
			 * Swatches read from the same constants the map paints with. They used
			 * to be literal hexes and had drifted: "Existing habitats" showed the
			 * old selection green while the tile layer actually draws active
			 * habitats in `mapLifecycle.active`, so the legend was describing a
			 * colour that was not on the map.
			 */}
			<span className="flex items-center gap-2 text-foreground">
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full"
					style={{ backgroundColor: mapInteraction.selected }}
				/>
				{mode === 'edit' ? 'This habitat' : 'New habitat'}
			</span>
			<span className="flex items-center gap-2 text-muted-foreground">
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full"
					style={{ backgroundColor: mapLifecycle.active }}
				/>
				Existing habitats
			</span>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

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
		...lifecycleOptions(
			habitatTypes,
			(type) => type.isActive,
			(type) => type.name,
		),
	];
}

function _drawInstruction(type: DrawGeometryType, vertexCount: number): string {
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

function _geometrySummary(geometry: DrawGeometry | null): string {
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

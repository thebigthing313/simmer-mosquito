import { isBiocontrolUnitType, recordBiocontrolActionCommand } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { HabitatRow } from '@simmer-mosquito/sync';
import {
	customFieldCount,
	customSchemaFor,
	type MetadataValue,
	RecordFormPage,
	useAppForm,
	validateSchemaMetadata,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { additionalPersonnelOptions } from '../../../components/additional-personnel';
import { DateControl } from '../../../components/date-control';
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
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	validationLocationSource,
} from '../../../forms/domain-validation';
import type { SchemaCatalogListing } from '../../../hooks/queries/use-catalog-rosters';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { todayInTimeZone } from '../../../lib/local-date';
import { unitOptions } from '../../../lib/unit-options';
import { FormSection } from '../-control-form-parts';
import { AddressPicker, HabitatPicker } from '../-control-pickers';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noTechnicianValue = 'none';

/** Domain issue path → the form field holding it. */
const BIOCONTROL_FIELD_PATHS: Readonly<Record<string, string>> = {
	biocontrolMethodId: 'biocontrolMethodId',
	amountReleased: 'amountReleased',
	releaseUnitId: 'releaseUnitId',
	biocontrolDate: 'biocontrolDate',
	technicianProfileId: 'technicianProfileId',
	addressId: 'addressId',
	metadata: 'metadata',
};

export interface BiocontrolFormValues {
	/**
	 * Optional address the release happened at — reference data only. The action's
	 * own point (its geometry) is the authoritative location.
	 */
	readonly addressId: string | null;
	/** Optional larval context: the habitat the agents were released into. */
	readonly habitatId: string | null;
	/** A biocontrol method id, or '' when unset (placeholder shown). */
	readonly biocontrolMethodId: string;
	/** `noTechnicianValue` or a profile id. */
	readonly technicianProfileId: string;
	/** Profile ids of everyone else who worked this release. */
	readonly additionalPersonnelIds: readonly string[];
	/** `YYYY-MM-DD` — the date the agents were released. */
	readonly biocontrolDate: string;
	readonly amountReleased: number | null;
	/** A unit id, or '' when unset (placeholder shown). */
	readonly releaseUnitId: string;
	/** Values for the custom fields the chosen method declares. */
	readonly metadata: MetadataValue;
}

export interface BiocontrolFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/control-operations/biocontrol' | '/control-operations/biocontrol/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface BiocontrolFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly biocontrolMethods: readonly SchemaCatalogListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly defaultValues: BiocontrolFormValues;
	/** The action's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so an action keeps its existing shape unless the user redraws.
	 */
	readonly requireLocation?: boolean;
	readonly header: BiocontrolFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: BiocontrolFormValues;
		/** The action's geometry. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew, moved, or cleared the geometry this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultBiocontrolFormValues(timeZone: string): BiocontrolFormValues {
	return {
		addressId: null,
		habitatId: null,
		biocontrolMethodId: '',
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		biocontrolDate: todayInTimeZone(timeZone),
		amountReleased: null,
		releaseUnitId: '',
		metadata: null,
	};
}

export function BiocontrolFormPage({
	organizationId,
	canSubmit,
	biocontrolMethods,
	units,
	profiles,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	header,
	submitLabel,
	onSave,
}: BiocontrolFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry?.type ?? 'Point',
	);
	const [geometryChanged, setGeometryChanged] = useState(false);
	// A habitat's shape, shown alongside the action's own geometry for context —
	// never the action's geometry itself, which the draw layer renders.
	const [referenceGeometry, setReferenceGeometry] = useState<GeoJsonGeometry | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);
	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start, requestPoint } = draw;
	// The inline "create address" subform places its point against this form's own
	// map, so a new address can be sited without leaving the record being filled in.
	const requestMapPoint = useCallback(
		(options?: { readonly prompt?: string }) => requestPoint(options?.prompt),
		[requestPoint],
	);

	// The action's own geometry is framed last so it wins when a habitat pick and
	// a geometry change land on the same render.
	useFitToGeometry(map, referenceGeometry, draw.isDrawing);
	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const methodOptions = useMemo(
		() =>
			lifecycleOptions(
				biocontrolMethods,
				(method) => method.isActive,
				(method) => method.name,
			),
		[biocontrolMethods],
	);
	// Biocontrol releases are counted, measured by volume, or weighed — the domain
	// rejects any other unit type.
	const releaseUnitOptions = useMemo(() => unitOptions(units, isBiocontrolUnitType), [units]);
	const technicianOptions = useMemo(
		() => [
			{ label: 'Unassigned', value: noTechnicianValue },
			...lifecycleOptions(
				profiles,
				(profile) => profile.isActive,
				(profile) => profile.displayName,
			),
		],
		[profiles],
	);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidator(
				({ value }: { readonly value: BiocontrolFormValues }) =>
					recordBiocontrolActionCommand({
						...FORM_VALIDATION_CONTEXT,
						biocontrolActionId: FORM_VALIDATION_CONTEXT.organizationId,
						locationSource: validationLocationSource(geometry, requireLocation),
						biocontrolMethodId: value.biocontrolMethodId,
						amountReleased: value.amountReleased as number,
						releaseUnitId: value.releaseUnitId,
						biocontrolDate: value.biocontrolDate,
						technicianProfileId:
							value.technicianProfileId === noTechnicianValue ? null : value.technicianProfileId,
						addressId: value.addressId,
						metadata: value.metadata,
					}),
				BIOCONTROL_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			if (value.biocontrolMethodId === '') {
				setSaveError('Select the biocontrol method that was used.');
				return;
			}
			if (value.amountReleased === null || !(value.amountReleased > 0)) {
				setSaveError('Enter how much was released.');
				return;
			}
			if (value.releaseUnitId === '') {
				setSaveError('Select the unit the release was measured in.');
				return;
			}
			if (value.biocontrolDate === '') {
				setSaveError('Enter the date the agents were released.');
				return;
			}
			if (requireLocation && geometry === null) {
				setLocationError('Map where the agents were released.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save biocontrol action.');
			}
		},
	});

	// Seeding from an address (or moving onto one) replaces the drawn shape with a
	// point, so the tool selector follows it.
	const placeAddressPoint = useCallback((point: DrawPoint) => {
		setGeometry(point);
		setGeometryType('Point');
		setGeometryChanged(true);
	}, []);
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});

	// Picking a habitat frames the map on the larval site the release targets, and
	// seeds the geometry there when nothing has been drawn yet.
	const handleHabitatSelected = useCallback(
		(habitat: HabitatRow | null) => {
			if (habitat === null) {
				setReferenceGeometry(null);
				return;
			}
			const point: DrawGeometry = { type: 'Point', coordinates: [habitat.lng, habitat.lat] };
			if (geometry === null) {
				// Seeded as the action's own geometry, so it needs no reference copy.
				setGeometry(point);
				setGeometryType('Point');
				setGeometryChanged(true);
				setReferenceGeometry(null);
				return;
			}
			setReferenceGeometry(point as unknown as GeoJsonGeometry);
		},
		[geometry],
	);

	// Switching tools replaces the shape, so the old one is cleared rather than
	// silently saved under the wrong type.
	const handleTypeChange = useCallback(
		(next: DrawGeometryType) => {
			setGeometryType(next);
			setGeometry(null);
			setGeometryChanged(true);
			if (draw.isDrawing) {
				start(next);
			}
		},
		[draw.isDrawing, start],
	);

	const startDraw = useCallback(() => {
		setLocationError(null);
		start(geometryType);
	}, [geometryType, start]);

	const clearGeometry = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
					</>
				}
				header={header}
				aside={
					<>
						<MapCanvas
							controls={{ layers: false }}
							geoJson={referenceGeometry as unknown as GeoJSON.GeoJSON | null}
							onMapReady={handleMapReady}
						/>
						<DrawToolbar controller={draw} geometryType={geometryType} />
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Biocontrol Action" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Biocontrol Action</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<section
					aria-labelledby="biocontrol-location-label"
					className={cn(
						'grid gap-4 rounded-md border bg-muted/30 p-4',
						locationError === null ? 'border-border/50' : 'border-destructive/60',
					)}
				>
					<div className="grid gap-0.5">
						<span
							className="font-semibold text-foreground text-sm leading-none"
							id="biocontrol-location-label"
						>
							Location
						</span>
						<span className="text-muted-foreground text-xs">
							The geometry is where the agents were released — a point for a single release, a line
							or area for a distributed one. An address is optional reference.
						</span>
					</div>

					<form.AppField name="addressId">
						{(field) => (
							<AddressPicker
								create={{ requestMapPoint }}
								label="Address"
								onSelect={(address) => {
									field.handleChange(address?.id ?? null);
									setLocationError(null);
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
						required={requireLocation}
						onClear={clearGeometry}
						onDraw={startDraw}
						onTypeChange={handleTypeChange}
						organizationId={organizationId}
						{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
					/>

					{locationError === null ? null : (
						<p className="m-0 text-destructive text-sm">{locationError}</p>
					)}
				</section>

				<FormSection title="Release">
					<form.AppField name="biocontrolMethodId">
						{(field) => (
							<field.SelectField
								label="Biocontrol method"
								required
								options={methodOptions}
								placeholder="Select method"
							/>
						)}
					</form.AppField>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="amountReleased">
							{(field) => (
								<field.NumberField
									label="Amount released"
									required
									min={0}
									placeholder="e.g. 250"
								/>
							)}
						</form.AppField>
						<form.AppField name="releaseUnitId">
							{(field) => (
								<field.SelectField
									label="Unit"
									required
									options={releaseUnitOptions}
									placeholder="Select unit"
								/>
							)}
						</form.AppField>
					</div>
				</FormSection>

				{/* Agencies attach their own fields to a method; render whichever the
							    selected one declares, and nothing when it declares none. */}
				<form.Subscribe selector={(state) => state.values.biocontrolMethodId}>
					{(methodId) => {
						const schema = customSchemaFor(biocontrolMethods, methodId);
						if (customFieldCount(schema) === 0) {
							return null;
						}
						return (
							<FormSection title="Custom Fields">
								<form.AppField
									name="metadata"
									validators={{ onSubmit: validateSchemaMetadata(schema) }}
								>
									{(field) => (
										<field.MetadataField
											description="Extra details your agency collects for this method."
											mode={{ kind: 'schema', schema }}
										/>
									)}
								</form.AppField>
							</FormSection>
						);
					}}
				</form.Subscribe>

				<FormSection title="Work">
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="biocontrolDate">
							{(field) => (
								<DateControl
									label="Release date"
									required
									onChange={(next) => field.handleChange(next)}
									value={field.state.value}
								/>
							)}
						</form.AppField>
						<form.AppField name="technicianProfileId">
							{(field) => (
								<field.SelectField
									label="Technician"
									options={technicianOptions}
									placeholder="Unassigned"
								/>
							)}
						</form.AppField>
					</div>
					<form.Subscribe selector={(state) => state.values.technicianProfileId}>
						{(technicianProfileId) => (
							<form.AppField name="additionalPersonnelIds">
								{(field) => (
									<field.MultiSelectField
										emptyMessage="No profiles"
										label="Additional personnel"
										options={additionalPersonnelOptions(profiles, field.state.value, {
											excludeProfileId:
												technicianProfileId === noTechnicianValue ? null : technicianProfileId,
										})}
										placeholder="Search profiles"
									/>
								)}
							</form.AppField>
						)}
					</form.Subscribe>
					<div className="grid gap-1.5">
						<form.AppField name="habitatId">
							{(field) => (
								<HabitatPicker
									label="Habitat"
									organizationId={organizationId}
									onSelect={(habitat) => {
										field.handleChange(habitat?.id ?? null);
										handleHabitatSelected(habitat);
									}}
									value={field.state.value}
								/>
							)}
						</form.AppField>
						<span className="text-muted-foreground text-xs">
							Link the release to the larval site it was performed against.
						</span>
					</div>
				</FormSection>
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- controls ---------------------------------------------------------------

// --- helpers ----------------------------------------------------------------

export type { DrawGeometry } from '../../../components/map/use-map-draw';

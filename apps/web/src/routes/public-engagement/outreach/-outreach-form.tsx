import { recordOutreachActionCommand } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { ControlMethodRow, ProfileRow } from '@simmer-mosquito/sync';
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
	FORM_VALIDATION_GEOMETRY,
} from '../../../forms/domain-validation';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { todayDateValue } from '../../control-operations/-control-display';
import { FormSection } from '../../control-operations/-control-form-parts';
import { AddressPicker } from '../../control-operations/-control-pickers';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noTechnicianValue = 'none';

/** Domain issue path → the form field holding it. */
const OUTREACH_FIELD_PATHS: Readonly<Record<string, string>> = {
	outreachMethodId: 'outreachMethodId',
	reach: 'reach',
	reachDescription: 'reachDescription',
	outreachDate: 'outreachDate',
	technicianProfileId: 'technicianProfileId',
	addressId: 'addressId',
	metadata: 'metadata',
};

export interface OutreachFormValues {
	/**
	 * Optional address the outreach happened at — reference data only. The action's
	 * own geometry is the authoritative location.
	 */
	readonly addressId: string | null;
	/** An outreach method id, or '' when unset (placeholder shown). */
	readonly outreachMethodId: string;
	/** `noTechnicianValue` or a profile id. */
	readonly technicianProfileId: string;
	/** Profile ids of everyone else who worked this action. */
	readonly additionalPersonnelIds: readonly string[];
	/** `YYYY-MM-DD` — the date the outreach happened. */
	readonly outreachDate: string;
	/** How many people or households were reached. */
	readonly reach: number | null;
	/** Who was reached, in the crew's own words. */
	readonly reachDescription: string;
	/** Values for the custom fields the chosen method declares. */
	readonly metadata: MetadataValue;
}

export interface OutreachFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/public-engagement/outreach' | '/public-engagement/outreach/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface OutreachFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly outreachMethods: readonly ControlMethodRow[];
	readonly profiles: readonly ProfileRow[];
	readonly defaultValues: OutreachFormValues;
	/** The action's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so an action keeps its existing shape unless the user redraws.
	 */
	readonly requireLocation?: boolean;
	readonly header: OutreachFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: OutreachFormValues;
		/** The action's geometry. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew, moved, or cleared the geometry this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultOutreachFormValues(): OutreachFormValues {
	return {
		addressId: null,
		outreachMethodId: '',
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		outreachDate: todayDateValue(),
		reach: null,
		reachDescription: '',
		metadata: null,
	};
}

export function OutreachFormPage({
	organizationId,
	canSubmit,
	outreachMethods,
	profiles,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	header,
	submitLabel,
	onSave,
}: OutreachFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry?.type ?? 'Point',
	);
	const [geometryChanged, setGeometryChanged] = useState(false);
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

	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const methodOptions = useMemo(
		() =>
			lifecycleOptions(
				outreachMethods,
				(method) => method.isActive,
				(method) => method.name,
			),
		[outreachMethods],
	);
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
				({ value }: { readonly value: OutreachFormValues }) =>
					recordOutreachActionCommand({
						...FORM_VALIDATION_CONTEXT,
						outreachActionId: FORM_VALIDATION_CONTEXT.organizationId,
						locationSource: {
							kind: 'geometry',
							// Not required means a mission stop supplies it; see
							// FORM_VALIDATION_GEOMETRY.
							geometry: (geometry ?? (requireLocation ? null : FORM_VALIDATION_GEOMETRY)) as never,
						},
						outreachMethodId: value.outreachMethodId,
						reach: value.reach as number,
						reachDescription: value.reachDescription.trim() === '' ? null : value.reachDescription,
						outreachDate: value.outreachDate,
						technicianProfileId:
							value.technicianProfileId === noTechnicianValue ? null : value.technicianProfileId,
						addressId: value.addressId,
						metadata: value.metadata,
					}),
				OUTREACH_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			if (value.outreachMethodId === '') {
				setSaveError('Select the outreach method that was used.');
				return;
			}
			if (value.reach === null || !(value.reach > 0)) {
				setSaveError('Enter how many people were reached.');
				return;
			}
			if (value.outreachDate === '') {
				setSaveError('Enter the date the outreach happened.');
				return;
			}
			if (requireLocation && geometry === null) {
				setLocationError('Map where the outreach happened.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save outreach action.');
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
						<MapCanvas controls={{ layers: false }} onMapReady={handleMapReady} />
						<DrawToolbar controller={draw} geometryType={geometryType} />
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Outreach Action" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Outreach Action</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<section
					aria-labelledby="outreach-location-label"
					className={cn(
						'grid gap-4 rounded-md border bg-muted/30 p-4',
						locationError === null ? 'border-border/50' : 'border-destructive/60',
					)}
				>
					<div className="grid gap-0.5">
						<span
							className="font-semibold text-foreground text-sm leading-none"
							id="outreach-location-label"
						>
							Location
						</span>
						<span className="text-muted-foreground text-xs">
							The geometry is where the outreach happened — a point for a single stop, a line or
							area for a canvassed block. An address is optional reference.
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
						onClear={clearGeometry}
						onDraw={startDraw}
						onTypeChange={handleTypeChange}
						organizationId={organizationId}
						required={requireLocation}
						{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
					/>

					{locationError === null ? null : (
						<p className="m-0 text-destructive text-sm">{locationError}</p>
					)}
				</section>

				<FormSection title="Outreach">
					<form.AppField name="outreachMethodId">
						{(field) => (
							<field.SelectField
								label="Outreach method"
								options={methodOptions}
								placeholder="Select method"
								required
							/>
						)}
					</form.AppField>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="reach">
							{(field) => (
								<field.NumberField
									label="People reached"
									min={1}
									placeholder="e.g. 24"
									required
									step={1}
								/>
							)}
						</form.AppField>
					</div>
					<form.AppField name="reachDescription">
						{(field) => (
							<field.TextareaField
								label="Who was reached"
								placeholder="e.g. Households on Willow Ct — 12 doors, 3 asked for a follow-up inspection"
								rows={4}
							/>
						)}
					</form.AppField>
				</FormSection>

				{/* Agencies attach their own fields to a method; render whichever the
							    selected one declares, and nothing when it declares none. */}
				<form.Subscribe selector={(state) => state.values.outreachMethodId}>
					{(methodId) => {
						const schema = customSchemaFor(outreachMethods, methodId);
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
						<form.AppField name="outreachDate">
							{(field) => (
								<DateControl
									label="Outreach date"
									onChange={(next) => field.handleChange(next)}
									required
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
				</FormSection>
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- controls ---------------------------------------------------------------

// --- helpers ----------------------------------------------------------------

export type { DrawGeometry } from '../../../components/map/use-map-draw';

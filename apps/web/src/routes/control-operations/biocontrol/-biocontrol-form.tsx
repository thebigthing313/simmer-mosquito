import { isBiocontrolUnitType, recordBiocontrolActionCommand } from '@simmer-mosquito/domain';
import {
	customFieldCount,
	customSchemaFor,
	FormSection,
	LocationSection,
	type MetadataValue,
	RecordFormPage,
	useAppForm,
	validateSchemaMetadata,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { useMemo, useState } from 'react';
import { additionalPersonnelOptions } from '../../../components/additional-personnel';
import { DateControl } from '../../../components/date-control';
import { MapCanvas } from '../../../components/map';
import { DrawToolbar, GeometryControl } from '../../../components/map/geometry-control';
import { useDrawLocation } from '../../../components/map/use-draw-location';
import type { DrawGeometry } from '../../../components/map/use-map-draw';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	validationLocationSource,
} from '../../../forms/domain-validation';
import { FirstCommentSection } from '../../../forms/first-comment-section';
import type { SchemaCatalogListing } from '../../../hooks/queries/use-catalog-rosters';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { todayInTimeZone } from '../../../lib/local-date';
import { unitOptions } from '../../../lib/unit-options';
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
	/** Create only: saved as the action's first comment. Ignored on edit. */
	readonly comment: string;
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
	/** Create shows the first-comment box; edit does not (the thread owns it). */
	readonly mode: 'create' | 'edit';
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
		comment: '',
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
	mode,
	header,
	submitLabel,
	onSave,
}: BiocontrolFormPageProps) {
	const [saveError, setSaveError] = useState<string | null>(null);
	// `referenceGeometry` is a habitat's shape, shown alongside the action's own
	// geometry for context — never the action's geometry itself, which the draw
	// layer renders.
	const location = useDrawLocation({
		initialGeometry,
		missingMessage: 'Map where the agents were released.',
		required: requireLocation,
	});
	const { addressCoord, draw, geometry, geometryType, referenceGeometry } = location;

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
			location.clearError();
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
			if (!location.requireGeometry()) {
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged: location.geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save biocontrol action.');
			}
		},
	});

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
							onMapReady={location.onMapReady}
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

				<FormSection title="Personnel">
					<form.AppField name="technicianProfileId">
						{(field) => (
							<field.SelectField
								label="Technician"
								options={technicianOptions}
								placeholder="Unassigned"
							/>
						)}
					</form.AppField>
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

				<LocationSection
					description="The geometry is where the agents were released — a point for a single release, a line or area for a distributed one. An address is optional reference, and a habitat links the release to the larval site it was performed against."
					error={location.locationError}
				>
					<form.AppField name="addressId">
						{(field) => (
							<AddressPicker
								create={{ requestMapPoint: location.requestMapPoint }}
								label="Address"
								onSelect={(address) => {
									field.handleChange(address?.id ?? null);
									location.clearError();
									location.selectAddress(address);
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
						geometryKind="controlAction"
						label="Geometry"
						required={requireLocation}
						onClear={location.clear}
						onDraw={location.startDraw}
						onTypeChange={location.changeType}
						organizationId={organizationId}
						{...(addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
					/>

					<form.AppField name="habitatId">
						{(field) => (
							<HabitatPicker
								label="Habitat"
								organizationId={organizationId}
								onSelect={(habitat) => {
									field.handleChange(habitat?.id ?? null);
									// The habitat is larval context, not the action's location, but
									// framing the map on it (and seeding unplaced geometry) saves the
									// crew a pan across the county.
									location.selectReference(
										habitat === null ? null : { lat: habitat.latitude, lng: habitat.longitude },
									);
								}}
								value={field.state.value}
							/>
						)}
					</form.AppField>
				</LocationSection>

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

				<FirstCommentSection form={form} mode={mode} />
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- controls ---------------------------------------------------------------

// --- helpers ----------------------------------------------------------------

/**
 * What the form holds, as the write seam takes it.
 *
 * The sentinel stops here: Radix forbids an empty Select value, so "Unassigned"
 * is a string the domain has never heard of. Create and edit both map the same
 * way, so they map through here.
 */
export function biocontrolFieldsFrom(values: BiocontrolFormValues) {
	return {
		methodId: values.biocontrolMethodId,
		technicianProfileId:
			values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
		actionDate: values.biocontrolDate,
		addressId: values.addressId,
		habitatId: values.habitatId,
		amountReleased: values.amountReleased ?? 0,
		unitId: values.releaseUnitId,
		metadata: values.metadata,
	};
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';

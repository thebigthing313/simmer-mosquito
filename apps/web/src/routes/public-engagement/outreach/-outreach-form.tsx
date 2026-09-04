import { recordOutreachActionCommand } from '@simmer-mosquito/domain';
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
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { todayInTimeZone } from '../../../lib/local-date';
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
	/** Create only: saved as the action's first comment. Ignored on edit. */
	readonly comment: string;
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
	readonly outreachMethods: readonly SchemaCatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly defaultValues: OutreachFormValues;
	/** The action's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so an action keeps its existing shape unless the user redraws.
	 */
	readonly requireLocation?: boolean;
	/** Create shows the first-comment box; edit does not (the thread owns it). */
	readonly mode: 'create' | 'edit';
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

export function defaultOutreachFormValues(timeZone: string): OutreachFormValues {
	return {
		addressId: null,
		outreachMethodId: '',
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		outreachDate: todayInTimeZone(timeZone),
		reach: null,
		reachDescription: '',
		metadata: null,
		comment: '',
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
	mode,
	header,
	submitLabel,
	onSave,
}: OutreachFormPageProps) {
	const [saveError, setSaveError] = useState<string | null>(null);
	const location = useDrawLocation({
		initialGeometry,
		missingMessage: 'Map where the outreach happened.',
		required: requireLocation,
	});
	const { addressCoord, draw, geometry, geometryType } = location;

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
						locationSource: validationLocationSource(geometry, requireLocation),
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
			location.clearError();
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
			if (!location.requireGeometry()) {
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged: location.geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save outreach action.');
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
						<MapCanvas controls={{ layers: false }} onMapReady={location.onMapReady} />
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
					description="The geometry is where the outreach happened — a point for a single stop, a line or area for a canvassed block. An address is optional reference."
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
						label="Geometry"
						onClear={location.clear}
						onDraw={location.startDraw}
						onTypeChange={location.changeType}
						organizationId={organizationId}
						required={requireLocation}
						{...(addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
					/>
				</LocationSection>

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

				<FirstCommentSection form={form} mode={mode} />
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- controls ---------------------------------------------------------------

// --- helpers ----------------------------------------------------------------

export type { DrawGeometry } from '../../../components/map/use-map-draw';

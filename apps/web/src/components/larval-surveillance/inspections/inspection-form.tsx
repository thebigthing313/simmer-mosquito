import {
	type LarvalDensity,
	type ResolvedLarvalInspectionEntryPolicy,
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import {
	errorMessagesFrom,
	FormSection,
	LocationSection,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { SchemaCatalogListing } from '../../../hooks/queries/catalog-roster-view';
import type { HabitatMatch } from '../../../hooks/queries/habitat-view';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../lib/domain-validation';
import { formatLocalDate, parseLocalDate, todayInTimeZone } from '../../../lib/local-date';
import { additionalPersonnelOptions } from '../../additional-personnel';
import { FirstCommentSection } from '../../forms/first-comment-section';
import { LocationAddressField } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { checkOwnedGeometry } from '../../map/geojson-adapter';
import { DrawToolbar, GeometryControl } from '../../map/geometry-control';
import {
	ConditionsField,
	DryNote,
	LabeledControl,
	LifeStageSelector,
} from './inspection-form-controls';
import {
	densityOptions,
	emptyLifeStages,
	findingsRequirement,
	habitatTypeOptions,
	hasLarvalData,
	INSPECTION_FIELD_PATHS,
	type InspectionFormValues,
	type InspectionSampleDraft,
	noHabitatTypeValue,
	profileOptions,
	resultColumnsForMode,
	unsetDensityValue,
	withConditionsChosen,
} from './inspection-form-values';
import { HabitatPicker, SelectedHabitat } from './inspection-habitat-picker';
import { SamplesSection } from './inspection-samples-section';

export interface InspectionFormHeader {
	readonly title: string;
	readonly description?: string | undefined;
	readonly backTo: '/larval-surveillance/inspections' | '/larval-surveillance/inspections/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface InspectionFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	/** The organization's larval entry policy, decides which abundance fields exist. */
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
	readonly profiles: readonly ProfileListing[];
	readonly habitatTypes: readonly SchemaCatalogListing[];
	readonly defaultValues: InspectionFormValues;
	/** Ad-hoc geometry to pre-fill on edit; create starts with none. */
	readonly initialAdhocGeometry?: DrawGeometry | null;
	/** Geometry to frame the map on immediately (edit pre-fill). */
	readonly initialPreviewGeometry?: GeoJsonGeometry | null;
	/**
	 * Create records a new inspection; edit revises one in place. Editing locks
	 * where the inspection happened: habitat and ad-hoc are distinct commands, and
	 * the update command cannot move an inspection to a different habitat.
	 */
	readonly mode: 'create' | 'edit';
	readonly header: InspectionFormHeader;
	readonly onSave: (input: {
		readonly values: InspectionFormValues;
		readonly adhocGeometry: DrawGeometry | null;
		/**
		 * The selected habitat's own shape, as the map is showing it, for the
		 * optimistic row's centroid. `null` in ad-hoc mode and when the geometry fetch
		 * failed.
		 */
		readonly habitatGeometry: GeoJsonGeometry | null;
	}) => Promise<void>;
}

export function InspectionFormPage({
	organizationId,
	canSubmit,
	policy,
	profiles,
	habitatTypes,
	defaultValues,
	initialAdhocGeometry = null,
	initialPreviewGeometry = null,
	mode,
	header,
	onSave,
}: InspectionFormPageProps) {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const isEditing = mode === 'edit';
	const entryMode = policy.mode;
	const columns = resultColumnsForMode(entryMode);

	// Habitat mode reports against the same band as the drawn location, but it is
	// a missing pick rather than a missing shape, so the hook does not own it.
	const [habitatError, setHabitatError] = useState<string | null>(null);
	// Switching to dry throws away whatever abundance was keyed in, because the command
	// rejects a dry inspection that carries any, so the crew is asked first.
	const [pendingDry, setPendingDry] = useState(false);
	// `referenceGeometry` is the selected habitat's shape, shown for reference in
	// habitat mode. Ad-hoc geometry is rendered by the draw layer instead.
	const location = useDrawLocation({
		geometryKind: 'inspection',
		initialGeometry: initialAdhocGeometry,
		initialReferenceGeometry: initialPreviewGeometry,
		missingMessage: 'Map the area this one-off inspection covers.',
	});
	const {
		addressCoord,
		draw,
		geometry: adhocGeometry,
		geometryType: adhocGeometryType,
		referenceGeometry: previewGeometry,
		setReferenceGeometry,
		startDraw,
	} = location;

	// Habitat and ad-hoc inspections are distinct commands with distinct rules,
	// so the validator picks the same one the save will. Conditions not chosen
	// reads as dry here, which asks nothing of the findings, and the field's own
	// rule below reports the missing choice.
	const validateCommand = domainValidator(({ value }: { readonly value: InspectionFormValues }) => {
		const result = {
			...FORM_VALIDATION_CONTEXT,
			inspectionId: FORM_VALIDATION_CONTEXT.organizationId,
			inspectionDate: value.inspectionDate,
			inspectedByProfileId: value.inspectedByProfileId,
			// The organization's own policy, so the form enforces the same
			// abundance rules the server will rather than the built-in default.
			policy,
			isWet: value.isWet === true,
			dipCount: value.dipCount,
			density: value.density === unsetDensityValue ? null : (value.density as LarvalDensity),
			larvaeCount: value.larvaeCount,
			...value.lifeStages,
		};
		return value.locationMode === 'habitat'
			? recordHabitatInspectionCommand({
					...result,
					habitatId: value.habitatId ?? '',
				})
			: recordAdHocInspectionCommand({
					...result,
					locationSource: {
						kind: 'geometry',
						geometry: (adhocGeometry ?? null) as never,
					},
					addressId: value.addressId,
					habitatTypeId: value.habitatTypeId === noHabitatTypeValue ? null : value.habitatTypeId,
				});
	}, INSPECTION_FIELD_PATHS);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: (input: { readonly value: InspectionFormValues }) =>
				withConditionsChosen(input.value, validateCommand(input)),
		},
		onSubmit: async ({ value }) => {
			location.clearError();
			setHabitatError(null);
			if (value.locationMode === 'habitat' && value.habitatId === null) {
				setHabitatError('Select the habitat this inspection covers.');
				return;
			}
			if (value.locationMode === 'adhoc' && !location.requireGeometry()) {
				return;
			}
			await onSave({
				values: value,
				adhocGeometry: value.locationMode === 'adhoc' ? adhocGeometry : null,
				habitatGeometry: value.locationMode === 'habitat' ? previewGeometry : null,
			});
		},
	});

	const { clearError } = location;
	const handleHabitatSelected = (habitat: HabitatMatch | null) => {
		clearError();
		setHabitatError(null);
		if (habitat === null) {
			setReferenceGeometry(null);
			return;
		}
		// Habitat geometry is not part of the Electric shape (ADR 0009); fetch it
		// so the map can frame the selected habitat.
		void fetchHabitatGeometry(habitat.id).then((geometry) => setReferenceGeometry(geometry));
	};

	const startAdhocDraw = () => {
		// Ad-hoc geometry is the inspection's own; drop any habitat reference shape
		// still framing the map from a previous mode.
		setReferenceGeometry(null);
		startDraw();
	};

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit} />
					</>
				}
				header={header}
				aside={
					<>
						<MapCanvas
							geoJson={previewGeometry}
							layers={[
								{ kind: 'habitats', serverUrl: getServerUrl(), filters: { isActive: true } },
							]}
							onMapReady={location.onMapReady}
						/>
						<DrawToolbar
							geometryKind="inspection"
							controller={draw}
							geometryType={adhocGeometryType}
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Inspection" />

				<form.AppField name="inspectionDate">
					{(field) => (
						<LabeledControl label="Inspection date" required>
							<DatePicker
								ariaLabel="Inspection date"
								className="w-full"
								max={parseLocalDate(today)}
								onChange={(date) =>
									field.handleChange(date === undefined ? '' : formatLocalDate(date))
								}
								placeholder="Select date"
								value={parseLocalDate(field.state.value)}
							/>
						</LabeledControl>
					)}
				</form.AppField>

				<FormSection title="Personnel">
					<form.AppField name="inspectedByProfileId">
						{(field) => (
							<field.AutocompleteField
								label="Inspector"
								options={profileOptions(profiles)}
								placeholder="Search people"
								required
							/>
						)}
					</form.AppField>
					<form.Subscribe selector={(state) => state.values.inspectedByProfileId}>
						{(inspectedByProfileId) => (
							<form.AppField name="additionalPersonnelIds">
								{(field) => (
									<field.MultiSelectField
										emptyMessage="No profiles"
										label="Additional personnel"
										options={additionalPersonnelOptions(profiles, field.state.value, {
											excludeProfileId: inspectedByProfileId,
										})}
										placeholder="Search profiles"
									/>
								)}
							</form.AppField>
						)}
					</form.Subscribe>
				</FormSection>

				<LocationSection
					description={
						isEditing
							? 'The habitat or one-off choice is fixed. Record a new inspection to cover a different habitat.'
							: 'Tie the inspection to a mapped habitat, or draw the one-off location it covers. An address is optional reference.'
					}
					error={habitatError ?? location.locationError}
				>
					<form.AppField name="locationMode">
						{(field) => (
							<ToggleGroup
								aria-label="Location mode"
								className="w-full"
								disabled={isEditing}
								onValueChange={(next) => {
									if (next === 'habitat' || next === 'adhoc') {
										field.handleChange(next);
									}
								}}
								size="sm"
								type="single"
								value={field.state.value}
								variant="outline"
							>
								<ToggleGroupItem className="flex-1 text-xs" value="habitat">
									Existing habitat
								</ToggleGroupItem>
								<ToggleGroupItem className="flex-1 text-xs" value="adhoc">
									One-off location
								</ToggleGroupItem>
							</ToggleGroup>
						)}
					</form.AppField>

					<form.Subscribe selector={(state) => state.values.locationMode}>
						{(locationMode) =>
							locationMode === 'habitat' ? (
								<form.AppField name="habitatId">
									{(field) =>
										isEditing ? (
											<SelectedHabitat habitatId={field.state.value} />
										) : (
											<HabitatPicker
												onSelect={(habitat) => {
													field.handleChange(habitat?.id ?? null);
													handleHabitatSelected(habitat);
												}}
												organizationId={organizationId}
												value={field.state.value}
											/>
										)
									}
								</form.AppField>
							) : (
								<div className="grid gap-4">
									{/* Address before geometry, as on every other located record:
									    it is what an empty point is seeded from and what a drawn
									    one is refined off. */}
									<form.AppField name="addressId">
										{(field) => (
											<LocationAddressField
												location={location}
												onChange={field.handleChange}
												value={field.state.value}
											/>
										)}
									</form.AppField>

									<GeometryControl
										controller={draw}
										geometry={adhocGeometry}
										geometryType={adhocGeometryType}
										geometryKind="inspection"
										label="Inspected location"
										onClear={location.clear}
										onDraw={startAdhocDraw}
										onTypeChange={location.changeType}
										organizationId={organizationId}
										required
										{...(addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
									/>
									<form.AppField name="habitatTypeId">
										{(field) => (
											<field.AutocompleteField
												// The sentinel, not `null`: `habitatTypeId` is a plain
												// string here and the submit mapping reads it back.
												emptyValue={noHabitatTypeValue}
												label="Habitat type"
												options={habitatTypeOptions(habitatTypes)}
												placeholder="Search habitat types"
											/>
										)}
									</form.AppField>
								</div>
							)
						}
					</form.Subscribe>
				</LocationSection>

				<FormSection title="Findings" note={findingsRequirement(entryMode)}>
					<form.AppField name="isWet">
						{(field) => (
							<ConditionsField
								error={errorMessagesFrom(field.state.meta.errors)[0]?.message}
								onChange={(next) => {
									if (next || !hasLarvalData(form.state.values)) {
										field.handleChange(next);
										return;
									}
									setPendingDry(true);
								}}
								value={field.state.value}
							/>
						)}
					</form.AppField>

					<form.Subscribe selector={(state) => state.values.isWet}>
						{(isWet) =>
							isWet ? (
								<div className="grid gap-5">
									<div className="grid gap-5 @md/fields:grid-cols-2">
										{columns.density.show ? (
											<form.AppField name="density">
												{(field) => (
													<field.SelectField
														label="Density"
														options={densityOptions()}
														placeholder="Select density"
														required={columns.density.required}
													/>
												)}
											</form.AppField>
										) : null}
										{columns.dips.show ? (
											<form.AppField name="dipCount">
												{(field) => (
													<field.NumberField
														label={entryMode === 'count_and_dips_required' ? 'Dips taken' : 'Dips'}
														min={1}
														placeholder="e.g. 10"
														required={columns.dips.required}
													/>
												)}
											</form.AppField>
										) : null}
										{columns.larvae.show ? (
											<form.AppField name="larvaeCount">
												{(field) => (
													<field.NumberField
														label="Larvae counted"
														min={0}
														placeholder="e.g. 24"
														required={columns.larvae.required}
													/>
												)}
											</form.AppField>
										) : null}
									</div>

									<form.AppField name="lifeStages">
										{(field) => (
											<LabeledControl
												description="Required when larvae were found."
												label="Life stages"
											>
												<LifeStageSelector
													onChange={field.handleChange}
													value={field.state.value}
												/>
											</LabeledControl>
										)}
									</form.AppField>
								</div>
							) : (
								<DryNote isWet={isWet} />
							)
						}
					</form.Subscribe>
				</FormSection>

				<form.Subscribe selector={(state) => state.values.isWet}>
					{(isWet) =>
						isWet ? (
							<form.Subscribe
								selector={(state) =>
									[state.values.inspectedByProfileId, state.values.inspectionDate] as const
								}
							>
								{([inspectedByProfileId, inspectionDate]) => (
									<form.AppField name="samples">
										{(field) => (
											<SamplesSection
												inspectionDate={inspectionDate}
												inspectorName={
													profiles.find((profile) => profile.id === inspectedByProfileId)
														?.displayName ?? null
												}
												isEditing={isEditing}
												onChange={field.handleChange}
												value={field.state.value as readonly InspectionSampleDraft[]}
											/>
										)}
									</form.AppField>
								)}
							</form.Subscribe>
						) : null
					}
				</form.Subscribe>

				<FirstCommentSection form={form} mode={isEditing ? 'edit' : 'create'} />
			</RecordFormPage>

			<AlertDialog onOpenChange={setPendingDry} open={pendingDry}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Clear the larval findings?</AlertDialogTitle>
						<AlertDialogDescription>
							A dry inspection records no abundance or life-stage detail, so the density, counts,
							and stages entered here will be cleared.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep wet</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								form.setFieldValue('isWet', false);
								form.setFieldValue('density', unsetDensityValue);
								form.setFieldValue('dipCount', null);
								form.setFieldValue('larvaeCount', null);
								form.setFieldValue('lifeStages', emptyLifeStages());
								form.setFieldValue('samples', []);
								setPendingDry(false);
							}}
						>
							Mark dry
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</form.AppForm>
	);
}

async function fetchHabitatGeometry(habitatId: string): Promise<GeoJsonGeometry | null> {
	try {
		const response = await sessionFetch(new URL(`/map/habitats/${habitatId}`, getServerUrl()));
		if (!response.ok) {
			return null;
		}
		const body = (await response.json()) as {
			readonly habitat?: { readonly geojson?: unknown };
		};
		return checkOwnedGeometry('habitat', body.habitat?.geojson).geometry;
	} catch {
		return null;
	}
}

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';

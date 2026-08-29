import type { ResolvedLarvalInspectionEntryPolicy } from '@simmer-mosquito/domain';
import {
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { LarvalDensity } from '@simmer-mosquito/sync';
import { sessionFetch } from '@simmer-mosquito/sync';
import {
	FormSection,
	LocationSection,
	RecordFormPage,
	RequiredMark,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
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
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { additionalPersonnelOptions } from '../../../components/additional-personnel';
import { densityLabel, type LifeStageFlags } from '../../../components/larval-display';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import {
	type DrawGeometry,
	type DrawGeometryType,
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import {
	firstCommentDescription,
	firstCommentLabel,
	firstCommentPlaceholder,
	firstCommentTitle,
} from '../../../forms/first-comment';
import type { InspectionResult } from '../../../hooks/mutations/use-inspection-mutations';
import type { HabitatMatch } from '../../../hooks/queries/habitat-view';
import type { SchemaCatalogListing } from '../../../hooks/queries/use-catalog-rosters';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useHabitatSearch } from '../../../hooks/queries/use-habitat-search';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { formatLocalDate, parseLocalDate } from '../../../lib/local-date';
import { todayInTimeZone } from '../-overview-data';

export type InspectionLocationMode = 'habitat' | 'adhoc';

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
export const unsetDensityValue = 'unset';
export const noHabitatTypeValue = 'none';

// Ordered low -> high so the density select reads as an escalating scale.
const DENSITY_OPTIONS: readonly LarvalDensity[] = [
	'none',
	'light',
	'medium',
	'heavy',
	'very_heavy',
];

const LIFE_STAGE_SEGMENTS: readonly {
	readonly key: keyof LifeStageFlags;
	readonly symbol: string;
	readonly label: string;
}[] = [
	{ key: 'hasEggs', symbol: 'E', label: 'Eggs' },
	{ key: 'hasFirstInstar', symbol: '1', label: '1st instar' },
	{ key: 'hasSecondInstar', symbol: '2', label: '2nd instar' },
	{ key: 'hasThirdInstar', symbol: '3', label: '3rd instar' },
	{ key: 'hasFourthInstar', symbol: '4', label: '4th instar' },
	{ key: 'hasPupae', symbol: 'P', label: 'Pupae' },
];

export interface InspectionFormValues {
	/** Whether the inspection is tied to an existing habitat or an ad-hoc location. */
	readonly locationMode: InspectionLocationMode;
	/** The target habitat when `locationMode === 'habitat'`. */
	readonly habitatId: string | null;
	/** Optional habitat type for an ad-hoc inspection (`noHabitatTypeValue` = none). */
	readonly habitatTypeId: string;
	/** Optional linked address for an ad-hoc inspection. */
	readonly addressId: string | null;
	/** `YYYY-MM-DD` calendar day the inspection was performed. */
	readonly inspectionDate: string;
	/** Attribution; left null defaults to the acting profile server-side. */
	readonly inspectedByProfileId: string | null;
	/** Profile ids of everyone else who worked this inspection. */
	readonly additionalPersonnelIds: readonly string[];
	readonly isWet: boolean;
	/** `unsetDensityValue` or a `LarvalDensity`. */
	readonly density: string;
	readonly dipCount: number | null;
	readonly larvaeCount: number | null;
	readonly lifeStages: LifeStageFlags;
	/** Specimens collected during this inspection, written once it lands. */
	readonly samples: readonly InspectionSampleDraft[];
	/** Optional comment to attach to the inspection on save (blank = none). */
	readonly comment: string;
}

/**
 * A specimen the crew is recording alongside the inspection.
 *
 * The id is minted here rather than at save time so a row keeps its identity
 * while the form is open — React keys off it, and the save writes it straight
 * through.
 */
export interface InspectionSampleDraft {
	readonly id: string;
	/** Blank records an unlabeled sample; the domain has a command for each. */
	readonly label: string;
}

/** Domain issue path → the form field holding it. */
const INSPECTION_FIELD_PATHS: Readonly<Record<string, string>> = {
	habitatId: 'habitatId',
	habitatTypeId: 'habitatTypeId',
	addressId: 'addressId',
	inspectionDate: 'inspectionDate',
	inspectedByProfileId: 'inspectedByProfileId',
	dipCount: 'dipCount',
	density: 'density',
	larvaeCount: 'larvaeCount',
};

export interface InspectionFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/larval-surveillance/inspections' | '/larval-surveillance/inspections/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface InspectionFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	/** The agency's larval entry policy — decides which abundance fields exist. */
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
	readonly profiles: readonly ProfileListing[];
	readonly habitatTypes: readonly SchemaCatalogListing[];
	readonly defaultValues: InspectionFormValues;
	/** Ad-hoc geometry to pre-fill on edit; create starts with none. */
	readonly initialAdhocGeometry?: DrawGeometry | null;
	/** Geometry to frame the map on immediately (edit pre-fill). */
	readonly initialPreviewGeometry?: GeoJsonGeometry | null;
	/**
	 * Create records a new inspection; edit revises one in place.
	 *
	 * Editing locks where the inspection happened. Habitat and ad-hoc are distinct
	 * commands, and the update command cannot move an inspection to a different
	 * habitat either — its type, address, and geometry were snapshotted from the
	 * one it was recorded against. Offering either as an editable field would be
	 * offering a change the server silently drops.
	 */
	readonly mode: 'create' | 'edit';
	readonly header: InspectionFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: InspectionFormValues;
		readonly adhocGeometry: DrawGeometry | null;
		/**
		 * The selected habitat's own shape, as the map is showing it.
		 *
		 * Passed out because the caller needs a centroid for the optimistic row and
		 * this is where that shape already lives — the server snapshots the same one
		 * at commit. `null` in ad-hoc mode, and on the rare habitat save whose
		 * geometry fetch failed.
		 */
		readonly habitatGeometry: GeoJsonGeometry | null;
	}) => Promise<void>;
}

/**
 * `inspectedByProfileId` is seeded with the acting profile rather than left null
 * for the server to fill in. The field then names the person the inspection will
 * be attributed to, which is what the operator needs to check before saving —
 * "Default to me" said only that a default existed.
 */
export function defaultInspectionFormValues(
	today: string,
	inspectedByProfileId: string | null,
): InspectionFormValues {
	return {
		locationMode: 'habitat',
		habitatId: null,
		habitatTypeId: noHabitatTypeValue,
		addressId: null,
		inspectionDate: today,
		inspectedByProfileId,
		additionalPersonnelIds: [],
		isWet: true,
		density: unsetDensityValue,
		dipCount: null,
		larvaeCount: null,
		lifeStages: emptyLifeStages(),
		samples: [],
		comment: '',
	};
}

interface ResultColumn {
	readonly show: boolean;
	readonly required: boolean;
}

interface ResultColumns {
	readonly density: ResultColumn;
	readonly dips: ResultColumn;
	readonly larvae: ResultColumn;
}

/**
 * Which abundance inputs the agency's entry policy makes meaningful, and which
 * of them it insists on. Mirrors `normalizeLarvalInspectionResult` so the form
 * asks for exactly what the command will accept — under density-only entry a
 * larvae count is rejected outright, and under count-and-dips both counts are
 * required, so neither should be presented the same way as an optional field.
 *
 * Hybrid requires density *or* the count pair, which no single field can be
 * marked for; the section's own note carries that rule instead.
 */
function resultColumnsForMode(mode: ResolvedLarvalInspectionEntryPolicy['mode']): ResultColumns {
	switch (mode) {
		case 'density_only':
			return {
				density: { show: true, required: true },
				dips: { show: true, required: false },
				larvae: { show: false, required: false },
			};
		case 'count_and_dips_required':
			return {
				density: { show: false, required: false },
				dips: { show: true, required: true },
				larvae: { show: true, required: true },
			};
		default:
			return {
				density: { show: true, required: false },
				dips: { show: true, required: false },
				larvae: { show: true, required: false },
			};
	}
}

/** What the section says it needs, when no one field can carry the rule. */
function findingsRequirement(mode: ResolvedLarvalInspectionEntryPolicy['mode']): string | null {
	return mode === 'hybrid'
		? 'Record a density, or a larvae count with the dips it came from.'
		: null;
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
	submitLabel,
	onSave,
}: InspectionFormPageProps) {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const isEditing = mode === 'edit';
	const entryMode = policy.mode;
	const columns = resultColumnsForMode(entryMode);

	const [map, setMap] = useState<MapboxMap | null>(null);
	const [adhocGeometry, setAdhocGeometry] = useState<DrawGeometry | null>(initialAdhocGeometry);
	const [adhocGeometryType, setAdhocGeometryType] = useState<DrawGeometryType>(
		initialAdhocGeometry?.type ?? 'Point',
	);
	// The selected habitat's shape, shown for reference in habitat mode. Ad-hoc
	// geometry is rendered by the draw layer instead.
	const [previewGeometry, setPreviewGeometry] = useState<GeoJsonGeometry | null>(
		initialPreviewGeometry,
	);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	// Switching to dry throws away whatever abundance was keyed in — the command
	// rejects a dry inspection that carries any — so the crew is asked first.
	const [pendingDry, setPendingDry] = useState(false);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleAdhocGeometryChange = useCallback((next: DrawGeometry | null) => {
		setAdhocGeometry(next);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);
	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: adhocGeometry,
		onChange: handleAdhocGeometryChange,
	});
	const { start } = draw;

	// Ease the map to frame whatever location is currently chosen (a selected
	// habitat's geometry or freshly drawn ad-hoc geometry) without a manual pan.
	useFitToGeometry(map, previewGeometry, draw.isDrawing);
	useFitToGeometry(map, adhocGeometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const form = useAppForm({
		defaultValues,
		validators: {
			// Habitat and ad-hoc inspections are distinct commands with distinct
			// rules, so the validator picks the same one the save will.
			onSubmit: domainValidator(({ value }: { readonly value: InspectionFormValues }) => {
				const result = {
					...FORM_VALIDATION_CONTEXT,
					inspectionId: FORM_VALIDATION_CONTEXT.organizationId,
					inspectionDate: value.inspectionDate,
					inspectedByProfileId: value.inspectedByProfileId,
					// The agency's own policy, so the form enforces the same abundance
					// rules the server will rather than the built-in default.
					policy,
					isWet: value.isWet,
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
							habitatTypeId:
								value.habitatTypeId === noHabitatTypeValue ? null : value.habitatTypeId,
						});
			}, INSPECTION_FIELD_PATHS),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			if (value.locationMode === 'habitat' && value.habitatId === null) {
				setLocationError('Select the habitat this inspection covers.');
				return;
			}
			if (value.locationMode === 'adhoc' && adhocGeometry === null) {
				setLocationError('Map the area this ad-hoc inspection covers.');
				return;
			}
			try {
				await onSave({
					values: value,
					adhocGeometry: value.locationMode === 'adhoc' ? adhocGeometry : null,
					habitatGeometry: value.locationMode === 'habitat' ? previewGeometry : null,
				});
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save inspection.');
			}
		},
	});

	const handleHabitatSelected = useCallback((habitat: HabitatMatch | null) => {
		setLocationError(null);
		if (habitat === null) {
			setPreviewGeometry(null);
			return;
		}
		// Habitat geometry is not part of the Electric shape (ADR 0009); fetch it so
		// the map can frame the selected habitat.
		void fetchHabitatGeometry(habitat.id).then((geometry) => setPreviewGeometry(geometry));
	}, []);

	// Switching tools replaces the shape, so the old one is cleared rather than
	// silently saved under the wrong type.
	const handleAdhocTypeChange = useCallback(
		(next: DrawGeometryType) => {
			setAdhocGeometryType(next);
			setAdhocGeometry(null);
			if (draw.isDrawing) {
				start(next);
			}
		},
		[draw.isDrawing, start],
	);

	const startAdhocDraw = useCallback(() => {
		setLocationError(null);
		// Ad-hoc geometry is the inspection's own; drop any habitat reference shape
		// still framing the map from a previous mode.
		setPreviewGeometry(null);
		start(adhocGeometryType);
	}, [adhocGeometryType, start]);

	const clearAdhoc = useCallback(() => {
		setAdhocGeometry(null);
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
							geoJson={previewGeometry as unknown as GeoJSON.GeoJSON | null}
							habitatLayer={{ serverUrl: getServerUrl(), filters: { isActive: true } }}
							onMapReady={handleMapReady}
						/>
						<DrawToolbar controller={draw} geometryType={adhocGeometryType} />
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Inspection" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Inspection</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

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
							? 'Where the inspection happened is fixed. Record a new inspection to cover a different site.'
							: 'Tie the inspection to a mapped habitat, or draw the ad-hoc location it covers.'
					}
					error={locationError}
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
									Ad-hoc location
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
									<GeometryControl
										controller={draw}
										geometry={adhocGeometry}
										geometryType={adhocGeometryType}
										label="Inspected location"
										onClear={clearAdhoc}
										onDraw={startAdhocDraw}
										onTypeChange={handleAdhocTypeChange}
										organizationId={organizationId}
										required
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
							<LabeledControl
								description="Larvae can only be present when standing water was found."
								label="Conditions"
								required
							>
								<WaterToggle
									onChange={(next) => {
										if (next || !hasLarvalData(form.state.values)) {
											field.handleChange(next);
											return;
										}
										setPendingDry(true);
									}}
									value={field.state.value}
								/>
							</LabeledControl>
						)}
					</form.AppField>

					<form.Subscribe selector={(state) => state.values.isWet}>
						{(isWet) =>
							isWet ? (
								<div className="grid gap-5">
									<div className="grid gap-5 sm:grid-cols-2">
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
												description="Mark every immature stage present. Required when larvae were found."
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
								<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-3 text-muted-foreground text-sm">
									Dry inspections record no abundance or life-stage detail.
								</p>
							)
						}
					</form.Subscribe>
				</FormSection>

				<form.Subscribe selector={(state) => state.values.isWet}>
					{(isWet) =>
						isWet ? (
							<form.AppField name="samples">
								{(field) => (
									<SamplesSection
										isEditing={isEditing}
										onChange={field.handleChange}
										value={field.state.value as readonly InspectionSampleDraft[]}
									/>
								)}
							</form.AppField>
						) : null
					}
				</form.Subscribe>

				{isEditing ? null : (
					<FormSection title={firstCommentTitle}>
						<form.AppField name="comment">
							{(field) => (
								<field.TextareaField
									description={firstCommentDescription}
									label={firstCommentLabel}
									placeholder={firstCommentPlaceholder}
									rows={3}
								/>
							)}
						</form.AppField>
					</FormSection>
				)}
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

/** Whether anything the dry branch would discard has been entered. */
function hasLarvalData(values: InspectionFormValues): boolean {
	return (
		values.density !== unsetDensityValue ||
		values.dipCount !== null ||
		values.larvaeCount !== null ||
		Object.values(values.lifeStages).some(Boolean) ||
		values.samples.length > 0
	);
}

// --- samples ----------------------------------------------------------------

/**
 * The specimens collected on this inspection.
 *
 * They are drafted here and written once the inspection lands, so a crew keys a
 * habitat and everything they took from it in one pass rather than saving, then
 * hunting the record down to add each sample. A blank label records an unlabeled
 * sample, which the domain has its own command for.
 */
function SamplesSection({
	value,
	isEditing,
	onChange,
}: {
	readonly value: readonly InspectionSampleDraft[];
	readonly isEditing: boolean;
	readonly onChange: (next: readonly InspectionSampleDraft[]) => void;
}) {
	return (
		<FormSection
			note={
				isEditing
					? 'Samples already on this inspection are managed from its record; these are added to them.'
					: null
			}
			title={isEditing ? 'Add Samples' : 'Samples'}
		>
			<div className="grid gap-3">
				{value.length === 0 ? (
					<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-3 text-muted-foreground text-sm">
						{isEditing
							? 'No samples to add.'
							: 'No specimens collected. Add one for each sample taken during this inspection.'}
					</p>
				) : (
					<ul className="grid gap-2">
						{value.map((sample, index) => (
							<li className="flex items-center gap-2" key={sample.id}>
								<Input
									aria-label={`Sample ${index + 1} label`}
									onChange={(event) =>
										onChange(
											value.map((row) =>
												row.id === sample.id ? { ...row, label: event.target.value } : row,
											),
										)
									}
									placeholder={`Sample ${index + 1} — label optional`}
									value={sample.label}
								/>
								<Button
									aria-label={`Remove sample ${index + 1}`}
									onClick={() => onChange(value.filter((row) => row.id !== sample.id))}
									size="icon"
									type="button"
									variant="ghost"
								>
									<XIcon aria-hidden="true" />
								</Button>
							</li>
						))}
					</ul>
				)}
				<Button
					className="w-fit"
					onClick={() => onChange([...value, { id: crypto.randomUUID(), label: '' }])}
					size="sm"
					type="button"
					variant="outline"
				>
					<PlusIcon aria-hidden="true" data-icon="inline-start" />
					Add sample
				</Button>
			</div>
		</FormSection>
	);
}

/**
 * The habitat an inspection is already recorded against, as a read-only line.
 *
 * A picker here would offer a change the update command drops: an inspection's
 * habitat, and the type/address/geometry snapshotted from it, are fixed once
 * recorded.
 */
function SelectedHabitat({ habitatId }: { readonly habitatId: string | null }) {
	const name = useHabitatLabel(habitatId);

	return (
		<LabeledControl label="Habitat">
			<div className="flex min-h-9 w-full items-center rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-foreground text-sm">
				{name === '' ? <span className="text-muted-foreground">Loading habitat…</span> : name}
			</div>
		</LabeledControl>
	);
}

// --- habitat picker ---------------------------------------------------------

/**
 * The display label for a habitat known only by id, or '' while it resolves.
 *
 * One id through the shared lookup rather than its own `findOne`: the naming rule
 * — a Habitat with no name reads out its coordinates — lives in one place, and a
 * form that already has the site in view pays nothing to ask again.
 */
function useHabitatLabel(habitatId: string | null): string {
	const names = useHabitatNames(habitatId === null ? [] : [habitatId]);
	return habitatId === null ? '' : (names.get(habitatId) ?? '');
}

function HabitatPicker({
	organizationId,
	value,
	onSelect,
}: {
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (habitat: HabitatMatch | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [pickedLabel, setPickedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);
	// A value can arrive without a pick — a stop's "Record inspection" seeds the
	// habitat it was sent to — and then there is no label to show. Resolving it
	// from the id covers both routes in; the picked label still wins so typing
	// never flickers against a query.
	const seededLabel = useHabitatLabel(pickedLabel === '' ? value : null);
	const selectedLabel = pickedLabel === '' ? seededLabel : pickedLabel;

	return (
		<LabeledControl label="Habitat" required>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverAnchor asChild>
					<div className="relative" ref={anchorRef}>
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							className="pr-10 pl-9"
							onChange={(event) => {
								setSearch(event.target.value);
								setOpen(true);
							}}
							onFocus={() => setOpen(true)}
							placeholder="Search habitats"
							value={open ? search : selectedLabel}
						/>
						{value === null ? null : (
							<Button
								aria-label="Clear habitat"
								className="-translate-y-1/2 absolute top-1/2 right-1.5"
								onClick={() => {
									setPickedLabel('');
									setSearch('');
									onSelect(null);
								}}
								size="icon-xs"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden="true" />
							</Button>
						)}
					</div>
				</PopoverAnchor>
				<PopoverContent
					align="start"
					className="grid w-(--radix-popover-trigger-width) min-w-80 gap-2 p-2"
					onInteractOutside={(event) => {
						const target = event.detail.originalEvent.target as Node | null;
						if (target !== null && anchorRef.current?.contains(target)) {
							event.preventDefault();
						}
					}}
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<HabitatSearchResults
						onSelect={(habitat) => {
							setPickedLabel(habitat.name);
							setSearch(habitat.name);
							onSelect(habitat);
							setOpen(false);
						}}
						organizationId={organizationId}
						search={deferredSearch}
						selectedValue={value}
					/>
				</PopoverContent>
			</Popover>
		</LabeledControl>
	);
}

function HabitatSearchResults({
	organizationId,
	search,
	selectedValue,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly selectedValue: string | null;
	readonly onSelect: (habitat: HabitatMatch) => void;
}) {
	// `includeRetired`, because this picker always has: an inspection is also how
	// a site the agency retired gets looked at again. The control pickers exclude.
	const {
		matches: habitats,
		isReady,
		isError,
	} = useHabitatSearch(organizationId, search, { includeRetired: true });

	if (isError) {
		return <SearchFallback label="Habitats unavailable" />;
	}
	if (!isReady && habitats.length === 0) {
		return <SearchFallback label="Searching habitats" />;
	}
	if (habitats.length === 0) {
		return <SearchFallback label="No habitat matches" />;
	}

	return (
		<div className="grid gap-1">
			{habitats.map((habitat) => (
				<button
					className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
					key={habitat.id}
					onClick={() => onSelect(habitat)}
					type="button"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium">{habitat.name}</span>
						{habitat.description.trim().length === 0 ? null : (
							<span className="block truncate text-muted-foreground text-xs">
								{habitat.description}
							</span>
						)}
					</span>
					{habitat.id === selectedValue ? <CheckIcon aria-hidden="true" /> : null}
				</button>
			))}
		</div>
	);
}

function SearchFallback({ label }: { readonly label: string }) {
	return (
		<div className="flex min-h-16 items-center justify-center gap-2 rounded-md bg-muted/50 text-muted-foreground text-sm">
			<SearchIcon aria-hidden="true" />
			{label}
		</div>
	);
}

// --- reusable form controls -------------------------------------------------

function LabeledControl({
	label,
	description,
	required = false,
	children,
}: {
	readonly label: string;
	readonly description?: string;
	readonly required?: boolean;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">
				{label}
				{required ? <RequiredMark /> : null}
			</span>
			{children}
			{description === undefined ? null : (
				<span className="text-muted-foreground text-xs">{description}</span>
			)}
		</div>
	);
}

function WaterToggle({
	value,
	onChange,
}: {
	readonly value: boolean;
	readonly onChange: (value: boolean) => void;
}) {
	return (
		<ToggleGroup
			aria-label="Water state"
			className="w-full sm:w-auto"
			onValueChange={(next) => {
				if (next === 'wet' || next === 'dry') {
					onChange(next === 'wet');
				}
			}}
			size="sm"
			type="single"
			value={value ? 'wet' : 'dry'}
			variant="outline"
		>
			<ToggleGroupItem className="px-6" value="wet">
				Wet
			</ToggleGroupItem>
			<ToggleGroupItem className="px-6" value="dry">
				Dry
			</ToggleGroupItem>
		</ToggleGroup>
	);
}

function LifeStageSelector({
	value,
	onChange,
}: {
	readonly value: LifeStageFlags;
	readonly onChange: (value: LifeStageFlags) => void;
}) {
	return (
		<div className="flex w-fit overflow-hidden rounded-md border border-border">
			{LIFE_STAGE_SEGMENTS.map((segment, index) => {
				const isOn = value[segment.key];
				return (
					<button
						aria-label={segment.label}
						aria-pressed={isOn}
						className={cn(
							'flex size-9 items-center justify-center font-semibold text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
							index > 0 && 'border-border border-l',
							isOn
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted/60',
						)}
						key={segment.key}
						onClick={() => onChange({ ...value, [segment.key]: !isOn })}
						title={segment.label}
						type="button"
					>
						{segment.symbol}
					</button>
				);
			})}
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

function emptyLifeStages(): LifeStageFlags {
	return {
		hasEggs: false,
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
	};
}

function densityOptions() {
	return [
		{ label: 'Not recorded', value: unsetDensityValue },
		...DENSITY_OPTIONS.map((density) => ({ label: densityLabel(density), value: density })),
	];
}

function habitatTypeOptions(habitatTypes: readonly SchemaCatalogListing[]) {
	return [
		{ label: 'Unassigned type', value: noHabitatTypeValue },
		...lifecycleOptions(
			habitatTypes,
			(type) => type.isActive,
			(type) => type.name,
		),
	];
}

function profileOptions(profiles: readonly ProfileListing[]) {
	return lifecycleOptions(
		profiles,
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);
}

async function fetchHabitatGeometry(habitatId: string): Promise<GeoJsonGeometry | null> {
	try {
		const response = await sessionFetch(new URL(`/map/habitats/${habitatId}`, getServerUrl()), {
			credentials: 'include',
		});
		if (!response.ok) {
			return null;
		}
		const body = (await response.json()) as {
			readonly habitat?: { readonly geojson?: unknown };
		};
		return (body.habitat?.geojson ?? null) as GeoJsonGeometry | null;
	} catch {
		return null;
	}
}

/**
 * What the inspector found, in the vocabulary the write hook takes.
 *
 * Here rather than in either route because both of them need it and it is a
 * statement about this form's values. The wet/dry rule lives here too: a dry
 * inspection carries no abundance and no life stages, and the command refuses
 * one that does — so the values are reduced to a consistent result before they
 * leave the form that collected them.
 */
export function inspectionResultOf(values: InspectionFormValues): InspectionResult {
	const wet = values.isWet;
	return {
		inspectionDate: values.inspectionDate,
		inspectedByProfileId: values.inspectedByProfileId,
		isWet: wet,
		dipCount: wet ? values.dipCount : null,
		density: wet && values.density !== unsetDensityValue ? (values.density as LarvalDensity) : null,
		larvaeCount: wet ? values.larvaeCount : null,
		hasEggs: wet && values.lifeStages.hasEggs,
		hasFirstInstar: wet && values.lifeStages.hasFirstInstar,
		hasSecondInstar: wet && values.lifeStages.hasSecondInstar,
		hasThirdInstar: wet && values.lifeStages.hasThirdInstar,
		hasFourthInstar: wet && values.lifeStages.hasFourthInstar,
		hasPupae: wet && values.lifeStages.hasPupae,
	};
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';

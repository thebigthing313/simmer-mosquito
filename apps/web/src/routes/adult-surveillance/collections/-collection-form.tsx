import {
	isCollectionDurationUnitType,
	recordCollectedAdHocCollectionCommand,
	recordCollectedTrapCollectionCommand,
	setAdHocCollectionCommand,
	setTrapCollectionCommand,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { CollectionTimingMode } from '@simmer-mosquito/sync';
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
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { useMemo, useState } from 'react';
import { additionalPersonnelOptions } from '../../../components/additional-personnel';
import { DateControl } from '../../../components/date-control';
import { MapCanvas } from '../../../components/map';
import { DrawToolbar, GeometryControl } from '../../../components/map/geometry-control';
import { useDrawLocation } from '../../../components/map/use-draw-location';
import type { DrawGeometry } from '../../../components/map/use-map-draw';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import { FirstCommentSection } from '../../../forms/first-comment-section';
import type { CollectionFields } from '../../../hooks/mutations/use-collection-mutations';
import type {
	CatalogListing,
	SchemaCatalogListing,
} from '../../../hooks/queries/use-catalog-rosters';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import type { TrapOption } from '../../../hooks/queries/use-trap-options';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { unitOptions } from '../../../lib/unit-options';
import { isPendingCollection as isPendingCollectionRow } from '../-adult-display';
import { AddressPicker, TrapPicker } from '../-adult-pickers';
import { collectionTimingStamps } from './-collection-timing';

export type CollectionSourceMode = 'trap' | 'adhoc';

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
export const noLureValue = 'none';
export const noUnitValue = 'none';

/**
 * Domain issue path → the form field holding it. Timing issues nest under the
 * `timing` object the builder validates, so they map onto whichever date field
 * the current timing mode shows.
 */
const COLLECTION_FIELD_PATHS: Readonly<Record<string, string>> = {
	trapId: 'trapId',
	collectionMethodId: 'collectionMethodId',
	collectionLureId: 'collectionLureId',
	addressId: 'addressId',
	setByProfileId: 'setByProfileId',
	collectedByProfileId: 'collectedByProfileId',
	'timing.collectedAt': 'collectedAt',
	'timing.startedAt': 'startedAt',
	'timing.collectionDate': 'collectionDate',
	'timing.durationAmount': 'durationAmount',
	'timing.durationUnitId': 'durationUnitId',
};

/**
 * Whether the trap has been emptied yet, asked of the form's own values.
 *
 * The rule itself lives with the badge that reports it, so the form and the
 * record it produces cannot come to disagree about what "still out" means; only
 * the two field names differ.
 */
function isPendingCollection(value: CollectionFormValues): boolean {
	return isPendingCollectionRow({
		collectedAt: value.collectedAt,
		collectionTimingMode: value.timingMode,
	});
}

/**
 * A collection has six command shapes — trap or ad-hoc, crossed with exact
 * timestamps, date-plus-duration, or not yet emptied — and the validator picks
 * the same one the save will, so the rules an operator is held to match what
 * actually runs.
 */
function validateCollection(value: CollectionFormValues, geometry: DrawGeometry | null) {
	const pending = isPendingCollection(value);
	const timing =
		value.timingMode === 'exact_timestamps'
			? ({
					mode: 'exact_timestamps',
					startedAt: parseDateValue(value.startedAt),
					collectedAt: parseDateValue(value.collectedAt),
				} as never)
			: ({
					mode: 'collection_date_duration',
					collectionDate: value.collectionDate ?? '',
					durationAmount: value.durationAmount as number,
					durationUnitId: value.durationUnitId === noUnitValue ? '' : value.durationUnitId,
				} as never);
	const base = {
		...FORM_VALIDATION_CONTEXT,
		collectionId: FORM_VALIDATION_CONTEXT.organizationId,
		timing,
		setByProfileId: value.setByProfileId,
		collectedByProfileId: value.collectedByProfileId,
	};
	const adHoc = {
		collectionMethodId: value.collectionMethodId,
		locationSource: { kind: 'geometry' as const, geometry: (geometry ?? null) as never },
		collectionLureId: value.collectionLureId === noLureValue ? null : value.collectionLureId,
		addressId: value.addressId,
	};

	return domainValidator(() => {
		if (pending) {
			// The set commands take `startedAt` directly rather than a timing, and
			// carry no collected half at all.
			const startedAt = parseDateValue(value.startedAt);
			return value.sourceMode === 'trap'
				? setTrapCollectionCommand({ ...base, trapId: value.trapId ?? '', startedAt })
				: setAdHocCollectionCommand({ ...base, ...adHoc, startedAt });
		}
		return value.sourceMode === 'trap'
			? recordCollectedTrapCollectionCommand({ ...base, trapId: value.trapId ?? '' })
			: recordCollectedAdHocCollectionCommand({ ...base, ...adHoc });
	}, COLLECTION_FIELD_PATHS)({ value });
}

/** `YYYY-MM-DD` to a Date the builder can range-check; invalid stays invalid. */
function parseDateValue(value: string | null): Date {
	return new Date(value ?? '');
}

/** Where the chosen trap stands, as the context outline the map draws behind the form. */
function trapPoint(trap: TrapOption | null): GeoJsonGeometry | null {
	if (trap === null) {
		return null;
	}
	return { type: 'Point', coordinates: [trap.longitude, trap.latitude] } as GeoJsonGeometry;
}

export interface CollectionFormValues {
	readonly sourceMode: CollectionSourceMode;
	/** Target trap when `sourceMode === 'trap'`. */
	readonly trapId: string | null;
	/** Ad-hoc address when `sourceMode === 'adhoc'`. */
	readonly addressId: string | null;
	/** Method id, or '' when unset. Derived from the trap in trap mode. */
	readonly collectionMethodId: string;
	/** `noLureValue` or a lure id. */
	readonly collectionLureId: string;
	readonly timingMode: CollectionTimingMode;
	/** `YYYY-MM-DD` the trap was set (exact mode, optional). */
	readonly startedAt: string | null;
	/** `YYYY-MM-DD` specimens were retrieved (exact mode, required). */
	readonly collectedAt: string | null;
	/** `YYYY-MM-DD` collection date (date + duration mode). */
	readonly collectionDate: string | null;
	readonly durationAmount: number | null;
	/** `noUnitValue` until picked; required in date + duration mode. */
	readonly durationUnitId: string;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
	/** Profile ids of everyone else who worked this collection. */
	readonly additionalPersonnelIds: readonly string[];
	readonly hasProblem: boolean;
	/** Values for the custom fields the collection method declares. */
	readonly metadata: MetadataValue;
	/** Create only: saved as the collection's first comment. Ignored on edit. */
	readonly comment: string;
}

/** The resolved location + method a submit yields, once source mode is applied. */
export interface CollectionSaveInput {
	readonly values: CollectionFormValues;
	/** The trap chosen in trap mode (for deriving method/location), else null. */
	readonly trap: TrapOption | null;
	/**
	 * Ad-hoc collection's own point (its geometry). Set in ad-hoc mode; null in
	 * trap mode, where the collection inherits the trap's location.
	 */
	readonly geometry: DrawGeometry | null;
	/** True when the user placed, moved, or cleared the point this session. */
	readonly geometryChanged: boolean;
}

export interface CollectionFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/adult-surveillance/collections' | '/adult-surveillance/collections/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface CollectionFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly traps: readonly TrapOption[];
	readonly collectionMethods: readonly SchemaCatalogListing[];
	readonly collectionLures: readonly CatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly units: readonly UnitLabel[];
	readonly defaultValues: CollectionFormValues;
	/** Edit locks the trap/ad-hoc choice — the two are distinct command paths. */
	readonly lockSourceMode?: boolean;
	/** The ad-hoc collection's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/** Create shows the first-comment box; edit does not (the thread owns it). */
	readonly mode: 'create' | 'edit';
	readonly header: CollectionFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: CollectionSaveInput) => Promise<void>;
}

export function defaultCollectionFormValues(
	today: string,
	trapId: string | null,
	/** The agency's default timing mode, from organization settings. */
	timingMode: CollectionTimingMode,
): CollectionFormValues {
	return {
		sourceMode: 'trap',
		trapId,
		addressId: null,
		collectionMethodId: '',
		collectionLureId: noLureValue,
		timingMode,
		startedAt: null,
		collectedAt: timingMode === 'exact_timestamps' ? today : null,
		collectionDate: timingMode === 'collection_date_duration' ? today : null,
		durationAmount: null,
		durationUnitId: noUnitValue,
		setByProfileId: null,
		collectedByProfileId: null,
		additionalPersonnelIds: [],
		hasProblem: false,
		metadata: null,
		comment: '',
	};
}

export function CollectionFormPage({
	organizationId,
	canSubmit,
	traps,
	collectionMethods,
	collectionLures,
	profiles,
	units,
	defaultValues,
	lockSourceMode = false,
	initialGeometry = null,
	mode,
	header,
	submitLabel,
	onSave,
}: CollectionFormPageProps) {
	const [selectedTrap, setSelectedTrap] = useState<TrapOption | null>(
		() => traps.find((trap) => trap.id === defaultValues.trapId) ?? null,
	);
	const [saveError, setSaveError] = useState<string | null>(null);
	// In trap mode the collection inherits the trap's point; in ad-hoc mode it
	// carries its own drawn point (the address, if any, is reference only). Only
	// the first value is read, so the trap the form opens on frames the map from
	// the first paint and later picks come through `setReferenceGeometry`.
	const location = useDrawLocation({
		initialGeometry,
		initialReferenceGeometry: trapPoint(selectedTrap),
		missingMessage: 'Place the collection point on the map.',
	});
	const { addressCoord, draw, geometry, referenceGeometry } = location;

	const methodOptions = useMemo(
		() =>
			lifecycleOptions(
				collectionMethods,
				(method) => method.isActive,
				(method) => method.name,
			),
		[collectionMethods],
	);

	const methodNameById = useMemo(
		() => new Map(collectionMethods.map((method) => [method.id, method.name])),
		[collectionMethods],
	);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: CollectionFormValues }) =>
				validateCollection(value, geometry),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			location.clearError();
			const error = validate(value);
			if (error !== null) {
				setSaveError(error);
				return;
			}
			if (value.sourceMode === 'adhoc' && !location.requireGeometry()) {
				return;
			}
			try {
				await onSave({
					values: value,
					trap: value.sourceMode === 'trap' ? selectedTrap : null,
					geometry: value.sourceMode === 'adhoc' ? geometry : null,
					geometryChanged: location.geometryChanged,
				});
			} catch (thrown) {
				setSaveError(thrown instanceof Error ? thrown.message : 'Unable to save collection.');
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
						{/* The draw layer renders and edits the collection's own point; the
						    trap's point is separate reference geometry, so only it needs a map
						    feature of its own. */}
						<MapCanvas
							controls={{ layers: false }}
							geoJson={referenceGeometry as unknown as GeoJSON.GeoJSON | null}
							onMapReady={location.onMapReady}
						/>
						<DrawToolbar
							controller={draw}
							geometryType="Point"
							pointPrompt="Click the map to place the collection point."
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Collection" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Collection</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<TimingSection form={form} units={units} />

				<FormSection title="Personnel">
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="setByProfileId">
							{(field) => (
								<field.SelectField
									label="Set by"
									options={profileOptions(profiles)}
									placeholder="Unassigned"
								/>
							)}
						</form.AppField>
						{/* Nobody has emptied a trap that is still out; the field appears on
						    the visit that does. */}
						<form.Subscribe selector={(state) => isPendingCollection(state.values)}>
							{(pending) =>
								pending ? null : (
									<form.AppField name="collectedByProfileId">
										{(field) => (
											<field.SelectField
												label="Collected by"
												options={profileOptions(profiles)}
												placeholder="Unassigned"
											/>
										)}
									</form.AppField>
								)
							}
						</form.Subscribe>
					</div>
					<form.Subscribe selector={(state) => state.values.collectedByProfileId}>
						{(collectedByProfileId) => (
							<form.AppField name="additionalPersonnelIds">
								{(field) => (
									<field.MultiSelectField
										emptyMessage="No profiles"
										label="Additional personnel"
										options={additionalPersonnelOptions(profiles, field.state.value, {
											excludeProfileId: collectedByProfileId,
										})}
										placeholder="Search profiles"
									/>
								)}
							</form.AppField>
						)}
					</form.Subscribe>
				</FormSection>

				<LocationSection
					description="A trap collection sits where the trap sits. A one-off carries its own point; an address is optional reference, and the point can be refined off it."
					error={location.locationError}
					title="Source and location"
				>
					<form.AppField name="sourceMode">
						{(field) => (
							<ToggleGroup
								aria-label="Collection source"
								className="w-full"
								disabled={lockSourceMode}
								onValueChange={(next) => {
									if (next === 'trap' || next === 'adhoc') {
										field.handleChange(next);
									}
								}}
								size="sm"
								type="single"
								value={field.state.value}
								variant="outline"
							>
								<ToggleGroupItem className="flex-1 text-xs" value="trap">
									Existing trap
								</ToggleGroupItem>
								<ToggleGroupItem className="flex-1 text-xs" value="adhoc">
									One-off collection
								</ToggleGroupItem>
							</ToggleGroup>
						)}
					</form.AppField>

					<form.Subscribe selector={(state) => state.values.sourceMode}>
						{(sourceMode) =>
							sourceMode === 'trap' ? (
								<form.AppField name="trapId">
									{(field) => (
										<div className="grid gap-2">
											<TrapPicker
												onSelect={(trap) => {
													field.handleChange(trap?.id ?? null);
													setSelectedTrap(trap);
													location.setReferenceGeometry(trapPoint(trap));
													// Derive method + lure from the trap.
													form.setFieldValue('collectionMethodId', trap?.collectionMethodId ?? '');
													form.setFieldValue(
														'collectionLureId',
														trap?.collectionLureId ?? noLureValue,
													);
												}}
												traps={traps}
												value={field.state.value}
											/>
											{selectedTrap === null ? null : (
												<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
													Method:{' '}
													<span className="font-medium text-foreground">
														{methodNameById.get(selectedTrap.collectionMethodId) ??
															'Unknown method'}
													</span>{' '}
													· inherited from the trap.
												</p>
											)}
										</div>
									)}
								</form.AppField>
							) : (
								<>
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
										geometryType="Point"
										geometryKind="collection"
										label="Point"
										required
										onClear={location.clear}
										onDraw={location.startDraw}
										{...(addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
									/>
								</>
							)
						}
					</form.Subscribe>
				</LocationSection>

				<FormSection title="Collection">
					{/* Only the one-off picks a method; a trap collection inherits the
					    trap's, and the picker above says which. */}
					<form.Subscribe selector={(state) => state.values.sourceMode}>
						{(sourceMode) =>
							sourceMode === 'adhoc' ? (
								<form.AppField name="collectionMethodId">
									{(field) => (
										<field.SelectField
											label="Collection method"
											required
											options={methodOptions}
											placeholder="Select method"
										/>
									)}
								</form.AppField>
							) : null
						}
					</form.Subscribe>

					<form.AppField name="collectionLureId">
						{(field) => (
							<field.SelectField
								label="Lure"
								options={lureOptions(collectionLures)}
								placeholder="No lure"
							/>
						)}
					</form.AppField>

					<form.AppField name="hasProblem">
						{(field) => (
							<field.SwitchField
								description="Flag if the trap failed, was tampered with, or the sample is compromised."
								label="Problem with this collection"
							/>
						)}
					</form.AppField>
				</FormSection>

				{/* Agencies attach their own fields to a collection method; render
							    whichever the method on this collection declares — whether it was
							    picked directly or inherited from the trap. */}
				<form.Subscribe selector={(state) => state.values.collectionMethodId}>
					{(methodId) => {
						const schema = customSchemaFor(collectionMethods, methodId);
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

				<FormSection title="Results">
					<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-2.5 text-muted-foreground text-sm">
						Record the species identified — and mark a zero result or bycatch — on the collection’s
						detail page after saving.
					</p>
				</FormSection>

				<FirstCommentSection form={form} mode={mode} />
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- timing section ---------------------------------------------------------

function TimingSection({
	form,
	units,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly units: readonly UnitLabel[];
}) {
	// A date-plus-duration collection is saying how long the trap ran, so the only
	// units that carry meaning are times.
	const durationUnitOptions = useMemo(
		() => unitOptions(units, isCollectionDurationUnitType),
		[units],
	);

	return (
		<FormSection title="Timing">
			<form.AppField name="timingMode">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<ToggleGroup
						aria-label="Timing mode"
						className="w-full"
						onValueChange={(next: string) => {
							if (next === 'exact_timestamps' || next === 'collection_date_duration') {
								field.handleChange(next);
							}
						}}
						size="sm"
						type="single"
						value={field.state.value}
						variant="outline"
					>
						<ToggleGroupItem className="flex-1 text-xs" value="exact_timestamps">
							Set &amp; collected dates
						</ToggleGroupItem>
						<ToggleGroupItem className="flex-1 text-xs" value="collection_date_duration">
							Date &amp; duration
						</ToggleGroupItem>
					</ToggleGroup>
				)}
			</form.AppField>

			<form.Subscribe
				selector={(state: { values: CollectionFormValues }) => ({
					timingMode: state.values.timingMode,
					// Which of the two dates is the required one swaps with this, so the
					// section has to re-render when it changes and not only on the mode.
					pending: isPendingCollection(state.values),
				})}
			>
				{({ timingMode, pending }: { timingMode: CollectionTimingMode; pending: boolean }) =>
					timingMode === 'exact_timestamps' ? (
						<div className="grid gap-5 sm:grid-cols-2">
							<form.AppField name="startedAt">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										label="Set date"
										onChange={(next: string) => field.handleChange(next === '' ? null : next)}
										required={pending}
										value={field.state.value}
									/>
								)}
							</form.AppField>
							<form.AppField name="collectedAt">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										// Left empty, the trap is still out and the collection is
										// saved pending, to be emptied on a later visit.
										label="Collected date"
										onChange={(next: string) => field.handleChange(next === '' ? null : next)}
										value={field.state.value}
									/>
								)}
							</form.AppField>
						</div>
					) : (
						<div className="grid gap-5 sm:grid-cols-3">
							<form.AppField name="collectionDate">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										label="Collection date"
										required
										onChange={(next: string) => field.handleChange(next === '' ? null : next)}
										value={field.state.value}
									/>
								)}
							</form.AppField>
							<form.AppField name="durationAmount">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<field.NumberField label="Duration" min={0} placeholder="e.g. 1" />
								)}
							</form.AppField>
							<form.AppField name="durationUnitId">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<field.SelectField
										label="Unit"
										options={durationUnitOptions}
										placeholder="Select a unit"
										required
									/>
								)}
							</form.AppField>
						</div>
					)
				}
			</form.Subscribe>
		</FormSection>
	);
}

// --- controls ---------------------------------------------------------------

// --- validation + helpers ---------------------------------------------------

function validate(values: CollectionFormValues): string | null {
	if (values.sourceMode === 'trap' && values.trapId === null) {
		return 'Select the trap this collection came from.';
	}
	if (values.collectionMethodId === '') {
		return 'A collection method is required.';
	}
	// No collected date means the trap is still out, which is a state the record
	// can legally be in — but only if it says when it was set.
	if (isPendingCollection(values) && values.startedAt === null) {
		return 'Enter the date this trap was set.';
	}
	if (values.timingMode === 'collection_date_duration' && values.collectionDate === null) {
		return 'Enter the collection date.';
	}
	return null;
}

/**
 * What the form holds, as the write seam takes it.
 *
 * Two conversions the form made for its own reasons: Radix forbids an empty
 * Select value, so "no lure" and "no unit" are sentinels. Both spellings stop
 * here. The typed days become the two instants they are stored at in the same
 * step, off one clock — see `collectionTimingStamps` for why that matters.
 */
export function collectionFieldsFrom(
	values: CollectionFormValues,
	timeZone: string,
): CollectionFields {
	const exact = values.timingMode === 'exact_timestamps';
	const stamps = collectionTimingStamps(values, timeZone);
	return {
		collectionMethodId: values.collectionMethodId,
		collectionLureId: values.collectionLureId === noLureValue ? null : values.collectionLureId,
		addressId: values.addressId,
		timing: {
			timingMode: values.timingMode,
			startedAt: stamps.startedAt,
			collectedAt: stamps.collectedAt,
			collectionDate: exact ? null : values.collectionDate,
			durationAmount: exact ? null : values.durationAmount,
			durationUnitId: exact || values.durationUnitId === noUnitValue ? null : values.durationUnitId,
		},
		setByProfileId: values.setByProfileId,
		collectedByProfileId: values.collectedByProfileId,
		hasProblem: values.hasProblem,
		metadata: values.metadata,
	};
}

function lureOptions(lures: readonly CatalogListing[]) {
	return [
		{ label: 'No lure', value: noLureValue },
		...lifecycleOptions(
			lures,
			(lure) => lure.isActive,
			(lure) => lure.name,
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

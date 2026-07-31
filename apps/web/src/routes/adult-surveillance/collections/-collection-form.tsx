import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	CollectionLureRow,
	CollectionMethodRow,
	CollectionTimingMode,
	ProfileRow,
	TrapRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { additionalPersonnelOptions } from '../../../components/additional-personnel';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	POINT_DRAW_TYPES,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawPoint, useAddressPoint } from '../../../components/map/use-address-point';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { RequiredMark } from '../../../components/required-mark';
import { useAppForm } from '../../../forms';
import {
	customFieldCount,
	customSchemaFor,
	type MetadataValue,
	validateSchemaMetadata,
} from '../../../forms/field-components';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { AddressPicker, TrapPicker } from '../-adult-pickers';

export type CollectionSourceMode = 'trap' | 'adhoc';

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
export const noLureValue = 'none';
export const noUnitValue = 'none';

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
	/** `noUnitValue` or a unit id (date + duration mode). */
	readonly durationUnitId: string;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
	/** Profile ids of everyone else who worked this collection. */
	readonly additionalPersonnelIds: readonly string[];
	readonly hasProblem: boolean;
	/** Values for the custom fields the collection method declares. */
	readonly metadata: MetadataValue;
}

/** The resolved location + method a submit yields, once source mode is applied. */
export interface CollectionSaveInput {
	readonly values: CollectionFormValues;
	/** The trap chosen in trap mode (for deriving method/location), else null. */
	readonly trap: TrapRow | null;
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
	readonly traps: readonly TrapRow[];
	readonly collectionMethods: readonly CollectionMethodRow[];
	readonly collectionLures: readonly CollectionLureRow[];
	readonly profiles: readonly ProfileRow[];
	readonly units: readonly UnitRow[];
	readonly defaultValues: CollectionFormValues;
	/** Edit locks the trap/ad-hoc choice — the two are distinct command paths. */
	readonly lockSourceMode?: boolean;
	/** The ad-hoc collection's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
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
	header,
	submitLabel,
	onSave,
}: CollectionFormPageProps) {
	const [selectedTrap, setSelectedTrap] = useState<TrapRow | null>(
		() => traps.find((trap) => trap.id === defaultValues.trapId) ?? null,
	);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);

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

	const [map, setMap] = useState<MapboxMap | null>(null);
	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);
	// The draw layer renders and edits the collection's own point; the trap's point
	// is separate reference geometry, so only it needs a map feature of its own.
	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start } = draw;

	// In trap mode the collection inherits the trap's point; in ad-hoc mode it
	// carries its own drawn point (the address, if any, is reference only).
	const trapPoint = useMemo<GeoJsonGeometry | null>(
		() =>
			selectedTrap === null
				? null
				: ({ type: 'Point', coordinates: [selectedTrap.lng, selectedTrap.lat] } as GeoJsonGeometry),
		[selectedTrap],
	);
	// The collection's own point is framed last so it wins when a trap pick and a
	// draw land on the same render.
	useFitToGeometry(map, trapPoint, draw.isDrawing);
	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const placeAddressPoint = useCallback((point: DrawPoint) => {
		setGeometry(point);
		setGeometryChanged(true);
	}, []);
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});

	const startDraw = useCallback(() => {
		setLocationError(null);
		start('Point');
	}, [start]);

	const clearPoint = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			const error = validate(value);
			if (error !== null) {
				setSaveError(error);
				return;
			}
			if (value.sourceMode === 'adhoc' && geometry === null) {
				setLocationError('Place the collection point on the map.');
				return;
			}
			try {
				await onSave({
					values: value,
					trap: value.sourceMode === 'trap' ? selectedTrap : null,
					geometry: value.sourceMode === 'adhoc' ? geometry : null,
					geometryChanged,
				});
			} catch (thrown) {
				setSaveError(thrown instanceof Error ? thrown.message : 'Unable to save collection.');
			}
		},
	});

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={trapPoint as unknown as GeoJSON.GeoJSON | null}
						onMapReady={handleMapReady}
					/>
					<DrawToolbar
						controller={draw}
						geometryType="Point"
						pointPrompt="Click the map to place the collection point."
					/>
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
							className="grid gap-6"
							onSubmit={(event) => {
								event.preventDefault();
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

							<FormSection title="Source">
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
																// Derive method + lure from the trap.
																form.setFieldValue(
																	'collectionMethodId',
																	trap?.collectionMethodId ?? '',
																);
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
											<div className="grid gap-5">
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
												<section
													aria-label="Collection location"
													className={cn(
														'grid gap-4 rounded-md border bg-muted/30 p-4',
														locationError === null ? 'border-border/50' : 'border-destructive/60',
													)}
												>
													<p className="m-0 text-muted-foreground text-xs">
														The point is this collection’s exact location. An address is optional
														reference — refine the point off it to the precise spot.
													</p>
													<form.AppField name="addressId">
														{(field) => (
															<AddressPicker
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
														allowedTypes={POINT_DRAW_TYPES}
														controller={draw}
														geometry={geometry}
														geometryType="Point"
														label="Point"
														required
														onClear={clearPoint}
														onDraw={startDraw}
														{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
													/>
													{locationError === null ? null : (
														<p className="m-0 text-destructive text-sm">{locationError}</p>
													)}
												</section>
											</div>
										)
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
									<form.AppField name="collectedByProfileId">
										{(field) => (
											<field.SelectField
												label="Collected by"
												options={profileOptions(profiles)}
												placeholder="Unassigned"
											/>
										)}
									</form.AppField>
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

							<FormSection title="Results">
								<form.AppField name="hasProblem">
									{(field) => (
										<field.SwitchField
											description="Flag if the trap failed, was tampered with, or the sample is compromised."
											label="Problem with this collection"
										/>
									)}
								</form.AppField>
								<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-2.5 text-muted-foreground text-sm">
									Record the species identified — and mark a zero result or bycatch — on the
									collection’s detail page after saving.
								</p>
							</FormSection>

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

// --- timing section ---------------------------------------------------------

function TimingSection({
	form,
	units,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly units: readonly UnitRow[];
}) {
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
				selector={(state: { values: CollectionFormValues }) => state.values.timingMode}
			>
				{(timingMode: CollectionTimingMode) =>
					timingMode === 'exact_timestamps' ? (
						<div className="grid gap-5 sm:grid-cols-2">
							<form.AppField name="startedAt">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										label="Set date"
										onChange={field.handleChange}
										value={field.state.value}
									/>
								)}
							</form.AppField>
							<form.AppField name="collectedAt">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<DateControl
										label="Collected date"
										required
										onChange={field.handleChange}
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
										onChange={field.handleChange}
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
									<field.SelectField label="Unit" options={unitOptions(units)} placeholder="Unit" />
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

function DateControl({
	label,
	value,
	required = false,
	onChange,
}: {
	readonly label: string;
	readonly value: string | null;
	readonly required?: boolean;
	readonly onChange: (value: string | null) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">
				{label}
				{required ? <RequiredMark /> : null}
			</span>
			<DatePicker
				ariaLabel={label}
				className="w-full"
				onChange={(date) => onChange(date === undefined ? null : formatLocalDate(date))}
				placeholder="Select date"
				value={parseLocalDate(value)}
			/>
		</div>
	);
}

function FormSection({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
			{children}
		</section>
	);
}

// --- validation + helpers ---------------------------------------------------

function validate(values: CollectionFormValues): string | null {
	if (values.sourceMode === 'trap' && values.trapId === null) {
		return 'Select the trap this collection came from.';
	}
	if (values.collectionMethodId === '') {
		return 'A collection method is required.';
	}
	if (values.timingMode === 'exact_timestamps' && values.collectedAt === null) {
		return 'Enter the date this collection was retrieved.';
	}
	if (values.timingMode === 'collection_date_duration' && values.collectionDate === null) {
		return 'Enter the collection date.';
	}
	return null;
}

function lureOptions(lures: readonly CollectionLureRow[]) {
	return [
		{ label: 'No lure', value: noLureValue },
		...lifecycleOptions(
			lures,
			(lure) => lure.isActive,
			(lure) => lure.name,
		),
	];
}

function unitOptions(units: readonly UnitRow[]) {
	return [
		{ label: 'No unit', value: noUnitValue },
		...units.map((unit) => ({ label: unit.unitName, value: unit.id })),
	];
}

function profileOptions(profiles: readonly ProfileRow[]) {
	return lifecycleOptions(
		profiles,
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);
}

/** Parse a `YYYY-MM-DD` string to a local Date, or undefined when empty/invalid. */
function parseLocalDate(value: string | null): Date | undefined {
	if (value === null || value === '') {
		return undefined;
	}
	const [year, month, day] = value.slice(0, 10).split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return undefined;
	}
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Format a local Date back to a `YYYY-MM-DD` string. */
function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

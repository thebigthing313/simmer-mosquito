import {
	FormSection,
	LocationSection,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { useState } from 'react';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type {
	CatalogListing,
	SchemaCatalogListing,
} from '../../../hooks/queries/catalog-roster-view';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import type { TrapOption } from '../../../hooks/queries/use-trap-options';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { additionalPersonnelOptions } from '../../additional-personnel';
import { CustomFieldsSection } from '../../forms/custom-fields-section';
import { FirstCommentSection } from '../../forms/first-comment-section';
import { LocationAddressField } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { DrawToolbar, GeometryControl } from '../../map/geometry-control';
import { TrapPicker } from '../adult-pickers';
import {
	type CollectionFormValues,
	isPendingCollectionDraft,
	lureOptions,
	noLureValue,
	profileOptions,
	trapPoint,
	validateCollection,
} from './collection-form-values';
import { TimingSection } from './collection-timing-section';

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
	readonly description?: string | undefined;
	readonly backTo: '/adult-surveillance/collections' | '/adult-surveillance/collections/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface CollectionFormPageProps {
	readonly canSubmit: boolean;
	readonly traps: readonly TrapOption[];
	readonly collectionMethods: readonly SchemaCatalogListing[];
	readonly collectionLures: readonly CatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly units: readonly UnitLabel[];
	readonly defaultValues: CollectionFormValues;
	/** Edit locks the trap/ad-hoc choice, the two are distinct command paths. */
	readonly lockSourceMode?: boolean;
	/** The ad-hoc collection's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/** Create shows the first-comment box; edit does not (the thread owns it). */
	readonly mode: 'create' | 'edit';
	readonly header: CollectionFormHeader;
	readonly onSave: (input: CollectionSaveInput) => Promise<void>;
}

export function CollectionFormPage({
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
	onSave,
}: CollectionFormPageProps) {
	const [selectedTrap, setSelectedTrap] = useState<TrapOption | null>(
		() => traps.find((trap) => trap.id === defaultValues.trapId) ?? null,
	);
	// In trap mode the collection inherits the trap's point; in ad-hoc mode it
	// carries its own drawn point. Only the first value is read, so the trap the
	// form opens on frames the map from the first paint and later picks come
	// through `setReferenceGeometry`.
	const location = useDrawLocation({
		geometryKind: 'collection',
		initialGeometry,
		initialReferenceGeometry: trapPoint(selectedTrap),
		missingMessage: 'Place the collection point on the map.',
	});
	const { addressCoord, draw, geometry, geometryType, referenceGeometry } = location;

	const methodOptions = lifecycleOptions(
		collectionMethods,
		(method) => method.isActive,
		(method) => method.name,
	);

	const methodNameById = new Map(collectionMethods.map((method) => [method.id, method.name]));

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: CollectionFormValues }) =>
				validateCollection(value, geometry),
		},
		onSubmit: async ({ value }) => {
			location.clearError();
			if (value.sourceMode === 'adhoc' && !location.requireGeometry()) {
				return;
			}
			await onSave({
				values: value,
				trap: value.sourceMode === 'trap' ? selectedTrap : null,
				geometry: value.sourceMode === 'adhoc' ? geometry : null,
				geometryChanged: location.geometryChanged,
			});
		},
	});

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
						{/* The draw layer renders and edits the collection's own point; the
						    trap's point is separate reference geometry, so only it needs a map
						    feature of its own. */}
						<MapCanvas geoJson={referenceGeometry} onMapReady={location.onMapReady} />
						<DrawToolbar
							geometryKind="collection"
							controller={draw}
							geometryType={geometryType}
							pointPrompt="Click the map to place the collection point."
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Collection" />

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
						<form.Subscribe selector={(state) => isPendingCollectionDraft(state.values)}>
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

				<LocationSection error={location.locationError} title="Source and location">
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
											<LocationAddressField
												location={location}
												onChange={field.handleChange}
												value={field.state.value}
											/>
										)}
									</form.AppField>
									<GeometryControl
										controller={draw}
										geometry={geometry}
										geometryType={geometryType}
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
						{(field) => <field.SwitchField label="Problem with this collection" />}
					</form.AppField>
				</FormSection>

				{/* The method here may have been picked directly or inherited from the trap. */}
				<CustomFieldsSection
					catalog={collectionMethods}
					form={form}
					schemaField="collectionMethodId"
				/>

				<FormSection title="Results">
					<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-2.5 text-muted-foreground text-sm">
						Record the species identified on the collection’s detail page after saving. Mark a zero
						result or bycatch there too.
					</p>
				</FormSection>

				<FirstCommentSection form={form} mode={mode} />
			</RecordFormPage>
		</form.AppForm>
	);
}

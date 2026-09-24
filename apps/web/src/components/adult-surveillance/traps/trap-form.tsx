import { createTrapCommand } from '@simmer-mosquito/domain';
import { FormSection, RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { TrapFields } from '../../../hooks/mutations/use-trap-mutations';
import type {
	CatalogListing,
	SchemaCatalogListing,
} from '../../../hooks/queries/catalog-roster-view';
import type { TrapRecord } from '../../../hooks/queries/use-trap-record';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	validationLocationSource,
} from '../../../lib/domain-validation';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { LocationAddressField, LocationBand } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
const noLureValue = 'none';

/** Domain issue path → the form field holding it. */
const TRAP_FIELD_PATHS: Readonly<Record<string, string>> = {
	collectionMethodId: 'collectionMethodId',
	collectionLureId: 'collectionLureId',
	addressId: 'addressId',
	trapName: 'trapName',
	trapCode: 'trapCode',
	description: 'description',
};

/**
 * The form's rules, straight from the domain builder, which requires the
 * collection method and holds the name-or-code rule. An unplaced point reaches
 * the builder as a stand-in rather than a null: on create the location band
 * reports it, and an untouched trap on edit keeps its point.
 */
export function validateTrap(value: TrapFormValues, geometry: DrawGeometry | null) {
	return domainValidator(
		() =>
			createTrapCommand({
				...FORM_VALIDATION_CONTEXT,
				trapId: FORM_VALIDATION_CONTEXT.organizationId,
				locationSource: validationLocationSource(geometry),
				collectionMethodId: value.collectionMethodId,
				addressId: value.addressId,
				collectionLureId: value.collectionLureId === noLureValue ? null : value.collectionLureId,
				trapName: value.trapName,
				trapCode: value.trapCode,
				description: value.description,
			}),
		TRAP_FIELD_PATHS,
	)({ value });
}

export interface TrapFormValues {
	/**
	 * Optional address the trap is at, reference data only. The trap's own point
	 * is the authoritative location.
	 */
	readonly addressId: string | null;
	/** A collection method id, or '' when unset (placeholder shown). */
	readonly collectionMethodId: string;
	/** `noLureValue` or a collection lure id. */
	readonly collectionLureId: string;
	readonly trapName: string;
	readonly trapCode: string;
	readonly description: string;
	readonly isActive: boolean;
}

export interface TrapFormHeader {
	readonly title: string;
	readonly description?: string | undefined;
	readonly backTo: '/adult-surveillance/traps' | '/adult-surveillance/traps/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface TrapFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly collectionMethods: readonly SchemaCatalogListing[];
	readonly collectionLures: readonly CatalogListing[];
	readonly defaultValues: TrapFormValues;
	/** The trap's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether a point must be set to submit. Create requires one; edit leaves it
	 * optional so a trap keeps its existing point unless the user refines it.
	 */
	readonly requireLocation?: boolean;
	readonly header: TrapFormHeader;
	readonly onSave: (input: {
		readonly values: TrapFormValues;
		/** The trap's point. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user placed, moved, or cleared the point this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultTrapFormValues(): TrapFormValues {
	return {
		addressId: null,
		collectionMethodId: '',
		collectionLureId: noLureValue,
		trapName: '',
		trapCode: '',
		description: '',
		isActive: true,
	};
}

export function TrapFormPage({
	organizationId,
	canSubmit,
	collectionMethods,
	collectionLures,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	header,
	onSave,
}: TrapFormPageProps) {
	// The draw layer both renders the trap's point and edits it, so the map needs no
	// separate preview feature.
	const location = useDrawLocation({
		geometryKind: 'trap',
		initialGeometry,
		missingMessage: 'Place the trap point on the map.',
		required: requireLocation,
	});
	const { draw, geometry, geometryType } = location;

	const methodOptions = lifecycleOptions(
		collectionMethods,
		(method) => method.isActive,
		(method) => method.name,
	);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: TrapFormValues }) => validateTrap(value, geometry),
		},
		// A save refused over the fields says the missing location in the same
		// pass, rather than only once the fields are fixed.
		onSubmitInvalid: () => {
			location.requireGeometry();
		},
		onSubmit: async ({ value }) => {
			location.clearError();
			if (!location.requireGeometry()) {
				return;
			}
			await onSave({ values: value, geometry, geometryChanged: location.geometryChanged });
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
						<MapCanvas onMapReady={location.onMapReady} />
						<DrawToolbar
							geometryKind="trap"
							controller={draw}
							geometryType={geometryType}
							pointPrompt="Click the map to place the trap point."
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Trap" />

				<LocationBand
					geometryKind="trap"
					label="Point"
					location={location}
					organizationId={organizationId}
					required={requireLocation}
				>
					<form.AppField name="addressId">
						{(field) => (
							<LocationAddressField
								location={location}
								onChange={field.handleChange}
								value={field.state.value}
							/>
						)}
					</form.AppField>
				</LocationBand>

				<FormSection title="Configuration">
					<div className="grid gap-5 sm:grid-cols-2">
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
						<form.AppField name="collectionLureId">
							{(field) => (
								<field.SelectField
									label="Lure"
									options={lureOptions(collectionLures)}
									placeholder="No lure"
								/>
							)}
						</form.AppField>
					</div>
				</FormSection>

				<FormSection title="Identity">
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="trapName">
							{(field) => <field.TextField label="Trap name" placeholder="e.g. North Basin CDC" />}
						</form.AppField>
						<form.AppField name="trapCode">
							{(field) => <field.TextField label="Trap code" placeholder="e.g. NB-01" />}
						</form.AppField>
					</div>
					<form.AppField name="description">
						{(field) => (
							<field.TextareaField
								label="Description"
								placeholder="Add a description for this trap…"
								rows={3}
							/>
						)}
					</form.AppField>
					<form.AppField name="isActive">
						{(field) => <field.SwitchField label="Active" />}
					</form.AppField>
				</FormSection>
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- reusable form controls -------------------------------------------------

/**
 * What the form holds, as the write seam takes it. An emptied text field is a
 * blank string and "no lure" is a sentinel; both spellings stop here.
 */
export function trapFieldsFrom(values: TrapFormValues): TrapFields {
	return {
		trapName: nullableText(values.trapName),
		trapCode: nullableText(values.trapCode),
		description: nullableText(values.description),
		collectionMethodId: values.collectionMethodId,
		collectionLureId: values.collectionLureId === noLureValue ? null : values.collectionLureId,
		addressId: values.addressId,
		isActive: values.isActive,
	};
}

/** The form's values as this trap already stands, for the comparison a save makes. */
export function trapFormValuesFrom(trap: TrapRecord): TrapFormValues {
	return {
		addressId: trap.addressId,
		collectionMethodId: trap.collectionMethodId,
		collectionLureId: trap.collectionLureId ?? noLureValue,
		trapName: trap.trapName ?? '',
		trapCode: trap.trapCode ?? '',
		description: trap.description ?? '',
		isActive: trap.isActive,
	};
}

// --- helpers ----------------------------------------------------------------

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
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

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';

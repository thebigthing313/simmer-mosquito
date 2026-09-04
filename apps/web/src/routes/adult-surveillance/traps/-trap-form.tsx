import { createTrapCommand } from '@simmer-mosquito/domain';
import {
	FormSection,
	LocationSection,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { useMemo, useState } from 'react';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	POINT_DRAW_TYPES,
} from '../../../components/map/geometry-control';
import { useDrawLocation } from '../../../components/map/use-draw-location';
import type { DrawGeometry } from '../../../components/map/use-map-draw';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import type { TrapFields } from '../../../hooks/mutations/use-trap-mutations';
import type {
	CatalogListing,
	SchemaCatalogListing,
} from '../../../hooks/queries/use-catalog-rosters';
import type { TrapRecord } from '../../../hooks/queries/use-trap-record';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { AddressPicker } from '../-adult-pickers';

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

export interface TrapFormValues {
	/**
	 * Optional address the trap is at — reference data only. The trap's own point
	 * (its geometry) is the authoritative location and can be refined off the
	 * address (to a backyard, treeline, etc.).
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
	readonly description: string;
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
	readonly submitLabel: string;
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
	submitLabel,
	onSave,
}: TrapFormPageProps) {
	const [saveError, setSaveError] = useState<string | null>(null);
	// The draw layer both renders the trap's point and edits it, so the map needs no
	// separate preview feature.
	const location = useDrawLocation({
		initialGeometry,
		missingMessage: 'Place the trap point on the map.',
		required: requireLocation,
	});
	const { addressCoord, draw, geometry } = location;

	const methodOptions = useMemo(
		() =>
			lifecycleOptions(
				collectionMethods,
				(method) => method.isActive,
				(method) => method.name,
			),
		[collectionMethods],
	);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidator(
				({ value }: { readonly value: TrapFormValues }) =>
					createTrapCommand({
						...FORM_VALIDATION_CONTEXT,
						trapId: FORM_VALIDATION_CONTEXT.organizationId,
						locationSource: { kind: 'geometry', geometry: (geometry ?? null) as never },
						collectionMethodId: value.collectionMethodId,
						addressId: value.addressId,
						collectionLureId:
							value.collectionLureId === noLureValue ? null : value.collectionLureId,
						trapName: value.trapName,
						trapCode: value.trapCode,
						description: value.description,
					}),
				TRAP_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			location.clearError();
			if (value.collectionMethodId === '') {
				setSaveError('Select the collection method for this trap.');
				return;
			}
			if (!location.requireGeometry()) {
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged: location.geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save trap.');
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
						<DrawToolbar
							controller={draw}
							geometryType="Point"
							pointPrompt="Click the map to place the trap point."
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Trap" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Trap</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<LocationSection
					description="The point is the trap’s exact location. An address is optional reference — refine the point off it to the precise spot."
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
						allowedTypes={POINT_DRAW_TYPES}
						controller={draw}
						geometry={geometry}
						geometryType="Point"
						label="Point"
						required={requireLocation}
						onClear={location.clear}
						onDraw={location.startDraw}
						{...(addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
					/>
				</LocationSection>

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
								description="Access notes, mounting details, or anything crews should know."
								label="Description"
								placeholder="Add a description for this trap…"
								rows={3}
							/>
						)}
					</form.AppField>
					<form.AppField name="isActive">
						{(field) => (
							<field.SwitchField
								description="Inactive traps stay on record but drop out of active surveillance."
								label="Active"
							/>
						)}
					</form.AppField>
				</FormSection>
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- reusable form controls -------------------------------------------------

/**
 * What the form holds, as the write seam takes it.
 *
 * Three conversions, and each of them is a decision the form made for its own
 * reasons rather than the domain's: a text field cannot hold `null`, so an
 * emptied one is a blank string; and Radix forbids an empty Select value, so
 * "no lure" is a sentinel. Both spellings stop here.
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

export type { DrawGeometry } from '../../../components/map/use-map-draw';

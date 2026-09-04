import { requestControlActionCommand } from '@simmer-mosquito/domain';
import type { ControlType } from '@simmer-mosquito/sync';
import {
	FormSection,
	type RecordFormHeader,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { useMemo, useState } from 'react';
import { MapCanvas } from '../../../components/map';
import { DrawToolbar } from '../../../components/map/geometry-control';
import { useDrawLocation } from '../../../components/map/use-draw-location';
import type { DrawGeometry } from '../../../components/map/use-map-draw';
import { AddressPicker } from '../../../components/pickers/address-picker';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { HabitatPicker } from '../../control-operations/-control-pickers';
import { ControlTypeToggle } from '../-control-type-toggle';
import { LocationSection } from '../-location-section';
import { useMethodsForControlType } from '../-operations-data';

/**
 * The request-for-control form, shared by raising one and editing one.
 *
 * Both surfaces capture exactly the same thing — a shape, a kind of work, and
 * the records it hangs off — so they share the fields, the map, and the
 * client-side validation. What differs is where the values come from and what
 * the save does with them, and both of those are the caller's.
 */

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const NO_METHOD = 'none';

/** Domain issue path → the form field holding it. */
const REQUEST_FIELD_PATHS: Readonly<Record<string, string>> = {
	controlType: 'controlType',
	recommendedMethodId: 'recommendedMethodId',
	summary: 'summary',
	addressId: 'addressId',
};

export interface RequestFormValues {
	readonly controlType: ControlType;
	/** `NO_METHOD` or a method id from the catalog for the chosen control type. */
	readonly recommendedMethodId: string;
	readonly summary: string;
	readonly addressId: string | null;
	readonly habitatId: string | null;
}

export interface RequestSaveInput {
	readonly values: RequestFormValues;
	readonly geometry: DrawGeometry | null;
	/** The shape was redrawn. Edits only send a location source when it was. */
	readonly geometryChanged: boolean;
}

export function defaultRequestFormValues(): RequestFormValues {
	return {
		controlType: 'application',
		recommendedMethodId: NO_METHOD,
		summary: '',
		addressId: null,
		habitatId: null,
	};
}

/** `summary` and `recommendedMethodId` as the command wants them: prose or null. */
export function readRequestFields(values: RequestFormValues): {
	readonly summary: string | null;
	readonly recommendedMethodId: string | null;
} {
	const summary = values.summary.trim();
	return {
		summary: summary === '' ? null : summary,
		recommendedMethodId:
			values.recommendedMethodId === NO_METHOD ? null : values.recommendedMethodId,
	};
}

export function RequestFormPage({
	header,
	defaultValues,
	initialGeometry = null,
	organizationId,
	canSubmit,
	submitLabel,
	errorTitle,
	onSave,
}: {
	readonly header: RecordFormHeader;
	readonly defaultValues: RequestFormValues;
	/** The shape the request already holds. Edit seeds it; raising one does not. */
	readonly initialGeometry?: DrawGeometry | null;
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly submitLabel: string;
	readonly errorTitle: string;
	readonly onSave: (input: RequestSaveInput) => Promise<void>;
}) {
	const [saveError, setSaveError] = useState<string | null>(null);
	const location = useDrawLocation({
		geometryKind: 'requestedControlAction',
		initialGeometry,
		missingMessage: 'Map where the control work is needed.',
	});
	const { geometry } = location;

	const [controlType, setControlType] = useState<ControlType>(defaultValues.controlType);
	const { methods } = useMethodsForControlType(controlType);
	const methodOptions = useMemo(
		() => [
			{ label: 'No specific method', value: NO_METHOD },
			...lifecycleOptions(
				methods,
				(method) => method.isActive,
				(method) => method.name,
			),
		],
		[methods],
	);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidator(
				({ value }: { readonly value: RequestFormValues }) =>
					requestControlActionCommand({
						...FORM_VALIDATION_CONTEXT,
						requestedControlActionId: FORM_VALIDATION_CONTEXT.organizationId,
						controlType: value.controlType,
						locationSource: { kind: 'geometry', geometry: (geometry ?? null) as never },
						...readRequestFields(value),
						addressId: value.addressId,
						context:
							value.habitatId === null
								? { kind: 'none' }
								: { kind: 'larval', habitatId: value.habitatId },
					}),
				REQUEST_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			if (!location.requireGeometry()) {
				return;
			}
			try {
				await onSave({
					values: value,
					geometry,
					geometryChanged: location.geometryChanged,
				});
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save the request.');
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
				aside={
					<>
						<MapCanvas
							controls={{ layers: false }}
							geoJson={location.referenceGeometry as unknown as GeoJSON.GeoJSON | null}
							onMapReady={location.onMapReady}
						/>
						<DrawToolbar controller={location.draw} geometryType={location.geometryType} />
					</>
				}
				header={header}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title={errorTitle} />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>{errorTitle}</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<LocationSection
					geometryKind="requestedControlAction"
					description="A point for a single site, a line or area for a stretch. An address is optional reference."
					location={location}
					organizationId={organizationId}
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
				</LocationSection>

				<FormSection title="What Is Being Requested">
					<form.AppField name="controlType">
						{(field) => (
							<ControlTypeToggle
								description="Which kind of control work the site needs."
								onChange={(next) => {
									field.handleChange(next);
									// The recommended method is polymorphic by control type, so
									// one chosen for the old type points at the wrong catalog.
									setControlType(next);
									form.setFieldValue('recommendedMethodId', NO_METHOD);
								}}
								value={field.state.value}
							/>
						)}
					</form.AppField>

					<form.AppField name="recommendedMethodId">
						{(field) => (
							<field.SelectField
								description="Optional. Leave unset to recommend the control type without naming a method."
								label="Recommended method"
								options={methodOptions}
								placeholder="No specific method"
							/>
						)}
					</form.AppField>

					<form.AppField name="summary">
						{(field) => (
							<field.TextareaField
								label="Summary"
								placeholder="What was seen, and what needs doing"
								rows={3}
							/>
						)}
					</form.AppField>
				</FormSection>

				<FormSection title="Context">
					<div className="grid gap-1.5">
						<form.AppField name="habitatId">
							{(field) => (
								<HabitatPicker
									label="Habitat"
									onSelect={(habitat) => {
										field.handleChange(habitat?.id ?? null);
										location.selectReference(
											habitat === null ||
												typeof habitat.latitude !== 'number' ||
												typeof habitat.longitude !== 'number'
												? null
												: { lat: habitat.latitude, lng: habitat.longitude },
										);
									}}
									organizationId={organizationId}
									value={field.state.value}
								/>
							)}
						</form.AppField>
						<p className="m-0 text-muted-foreground text-xs">
							Link the request to a known larval site so it shows on that habitat’s history.
						</p>
					</div>
				</FormSection>
			</RecordFormPage>
		</form.AppForm>
	);
}

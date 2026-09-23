import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useState } from 'react';
import { PointInput } from '../geometry-input';
import {
	type CreateFoundation,
	FoundationFormShell,
	requiredName,
	type SubmitFoundation,
} from './foundation-form-shell';

export function AddressForm({
	create,
	onSubmit,
}: {
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const [point, setPoint] = useState<GeoJsonPoint | null>(null);
	const form = useAppForm({
		defaultValues: {
			displayName: '',
			addressLine1: '',
			locality: '',
			region: '',
			postalCode: '',
			country: 'US',
		},
		validators: {
			onSubmit: () => (point === null ? 'Add a location before saving.' : undefined),
		},
		onSubmit: async ({ value }) => {
			if (point === null) {
				return;
			}
			await onSubmit('Address', () =>
				create.address.mutateAsync({
					displayName: value.displayName.trim(),
					country: value.country,
					addressLine1: value.addressLine1,
					addressLine2: '',
					locality: value.locality,
					region: value.region,
					postalCode: value.postalCode,
					geojson: point,
				}),
			);
		},
	});

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title="Unable to add the address" />
				<form.AppField name="displayName" validators={{ onSubmit: requiredName('Display name') }}>
					{(field) => (
						<field.TextField label="Display name" placeholder="e.g. District yard" required />
					)}
				</form.AppField>
				<form.AppField name="addressLine1">
					{(field) => <field.TextField label="Address line 1" />}
				</form.AppField>
				<div className="grid gap-4 sm:grid-cols-2">
					<form.AppField name="locality">
						{(field) => <field.TextField label="City" />}
					</form.AppField>
					<form.AppField name="region">
						{(field) => <field.TextField label="State or region" />}
					</form.AppField>
					<form.AppField name="postalCode">
						{(field) => <field.TextField label="Postal code" />}
					</form.AppField>
					<form.AppField
						name="country"
						validators={{
							onSubmit: ({ value }: { readonly value: string }) =>
								value.trim().length === 2 ? undefined : 'Country is a two-letter code.',
						}}
					>
						{(field) => <field.TextField label="Country" maxLength={2} placeholder="US" required />}
					</form.AppField>
				</div>
				<PointInput
					description="Where this address sits. Two decimal degrees, WGS84."
					label="Location"
					onChange={setPoint}
					value={point}
				/>
				<form.FormActions>
					<form.SubmitButton>Add</form.SubmitButton>
				</form.FormActions>
			</FoundationFormShell>
		</form.AppForm>
	);
}

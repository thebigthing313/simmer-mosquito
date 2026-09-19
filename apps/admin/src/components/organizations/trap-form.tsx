import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useState } from 'react';
import type { OrganizationFoundations } from '../../api';
import { PointInput } from '../geometry-input';
import {
	type CreateFoundation,
	FoundationFormShell,
	NONE,
	type SubmitFoundation,
} from './foundation-form-shell';

export function TrapForm({
	foundations,
	create,
	onSubmit,
}: {
	readonly foundations: OrganizationFoundations;
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const [point, setPoint] = useState<GeoJsonPoint | null>(null);
	const form = useAppForm({
		defaultValues: { trapName: '', trapCode: '', methodId: '', lureId: NONE, addressId: NONE },
		validators: {
			onSubmit: () => (point === null ? 'Add a location before saving.' : undefined),
		},
		onSubmit: async ({ value }) => {
			if (point === null) {
				return;
			}
			await onSubmit('Trap', () =>
				create.trap.mutateAsync({
					collectionMethodId: value.methodId,
					addressId: value.addressId === NONE ? null : value.addressId,
					collectionLureId: value.lureId === NONE ? null : value.lureId,
					trapName: value.trapName,
					trapCode: value.trapCode,
					description: '',
					geojson: point,
				}),
			);
		},
	});

	const methodOptions = foundations.lookups.collectionMethods.map((method) => ({
		value: method.id,
		label: method.name,
	}));
	const lureOptions = [
		{ value: NONE, label: 'None' },
		...foundations.lookups.collectionLures.map((lure) => ({ value: lure.id, label: lure.name })),
	];
	const addressOptions = [
		{ value: NONE, label: 'None' },
		...foundations.addresses.map((address) => ({
			value: address.id,
			label: address.displayName,
		})),
	];

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title="Unable to add the trap" />
				<form.AppField name="trapName">
					{(field) => <field.TextField label="Trap name" />}
				</form.AppField>
				<form.AppField name="trapCode">
					{(field) => <field.TextField label="Trap code" />}
				</form.AppField>
				<form.AppField
					name="methodId"
					validators={{
						onSubmit: ({ value }: { readonly value: string }) =>
							value === '' ? 'Choose a collection method.' : undefined,
					}}
				>
					{(field) => (
						<field.SelectField
							label="Collection method"
							options={methodOptions}
							placeholder="Choose a method"
							required
						/>
					)}
				</form.AppField>
				<div className="grid gap-4 sm:grid-cols-2">
					<form.AppField name="lureId">
						{(field) => <field.SelectField label="Lure" options={lureOptions} />}
					</form.AppField>
					<form.AppField name="addressId">
						{(field) => <field.SelectField label="Address" options={addressOptions} />}
					</form.AppField>
				</div>
				<PointInput
					description="Where the trap is set. Two decimal degrees, WGS84."
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

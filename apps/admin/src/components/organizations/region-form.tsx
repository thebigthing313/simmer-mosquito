import { getOwnedGeometryPolicy } from '@simmer-mosquito/domain';
import {
	type GeoJsonGeometry,
	type ImportGeometryKind,
	isImportGeometryKind,
} from '@simmer-mosquito/mapping';
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useState } from 'react';
import type { OrganizationFoundations } from '../../api';
import { GeometryFileInput } from '../geometry-input';
import {
	type CreateFoundation,
	FoundationFormShell,
	requiredName,
	type SubmitFoundation,
	UNFILED,
} from './foundation-form-shell';

/** What a Region may store, filtered to what the file parser can produce. */
const REGION_IMPORT_KINDS: readonly ImportGeometryKind[] =
	getOwnedGeometryPolicy('region').allowedTypes.filter(isImportGeometryKind);

export function RegionForm({
	create,
	folders,
	onSubmit,
}: {
	readonly create: CreateFoundation;
	readonly folders: OrganizationFoundations['regionFolders'];
	readonly onSubmit: SubmitFoundation;
}) {
	const [geometry, setGeometry] = useState<GeoJsonGeometry | null>(null);
	const form = useAppForm({
		defaultValues: { name: '', description: '', folderId: UNFILED },
		validators: {
			onSubmit: () => (geometry === null ? 'Add a boundary before saving.' : undefined),
		},
		onSubmit: async ({ value }) => {
			if (geometry === null) {
				return;
			}
			await onSubmit('Region', () =>
				create.region.mutateAsync({
					name: value.name.trim(),
					regionFolderId: value.folderId === UNFILED ? null : value.folderId,
					description: value.description,
					geojson: geometry,
				}),
			);
		},
	});

	const folderOptions = [
		{ value: UNFILED, label: 'Unfiled' },
		...folders.map((folder) => ({ value: folder.id, label: folder.name })),
	];

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title="Unable to add the region" />
				<form.AppField name="name" validators={{ onSubmit: requiredName('Region name') }}>
					{(field) => <field.TextField label="Region name" placeholder="e.g. Zone 4" required />}
				</form.AppField>
				<form.AppField name="folderId">
					{(field) => <field.SelectField label="Folder" options={folderOptions} />}
				</form.AppField>
				<form.AppField name="description">
					{(field) => <field.TextareaField label="Description" rows={2} />}
				</form.AppField>
				<GeometryFileInput
					description="The district boundary, from the customer's KML, KMZ, or GeoJSON."
					kinds={REGION_IMPORT_KINDS}
					label="Boundary"
					onChange={setGeometry}
					value={geometry}
				/>
				<form.FormActions>
					<form.SubmitButton>Add</form.SubmitButton>
				</form.FormActions>
			</FoundationFormShell>
		</form.AppForm>
	);
}

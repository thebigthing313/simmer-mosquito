import { mapInteraction } from '@simmer-mosquito/design-tokens';
import { createRegionCommand } from '@simmer-mosquito/domain';
import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { RegionFields } from '../../../hooks/mutations/use-region-mutations';
import type { RegionFolderListing } from '../../../hooks/queries/use-region-folders';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../lib/domain-validation';
import { compareNames } from '../../../lib/natural-order';
import { CustomFieldsSection } from '../../forms/custom-fields-section';
import { LocationBand } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';

/**
 * Domain issue path to the form field holding it. Geometry is drawn on the
 * map, so its issues land on the form alert.
 */
const REGION_FIELD_PATHS: Readonly<Record<string, string>> = {
	name: 'name',
	description: 'description',
	regionFolderId: 'regionFolderId',
	metadata: 'metadata',
};

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noRegionFolderValue = 'none';

export interface RegionFormValues {
	readonly name: string;
	readonly regionFolderId: string;
	readonly description: string;
	readonly metadata: MetadataValue;
}

export interface RegionFormHeader {
	readonly title: string;
	readonly description?: string | undefined;
	readonly backTo: '/gis/regions' | '/gis/regions/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface RegionFormPageProps {
	readonly mode: 'create' | 'edit';
	readonly canSubmit: boolean;
	readonly regionFolders: readonly RegionFolderListing[];
	readonly defaultValues: RegionFormValues;
	/** The region's boundary to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	readonly header: RegionFormHeader;
	readonly onSave: (input: {
		readonly values: RegionFormValues;
		/** The boundary. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew or redrew the boundary this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

/**
 * The form's values, as the write seam takes them. The select's `'none'`
 * sentinel becomes `null` here.
 */
export function regionFieldsFrom(values: RegionFormValues): RegionFields {
	const description = values.description.trim();
	return {
		name: values.name.trim(),
		description: description.length === 0 ? null : description,
		folderId: values.regionFolderId === noRegionFolderValue ? null : values.regionFolderId,
		metadata: values.metadata ?? null,
	};
}

export function defaultRegionFormValues(): RegionFormValues {
	return {
		name: '',
		regionFolderId: noRegionFolderValue,
		description: '',
		metadata: null,
	};
}

export function RegionFormPage({
	mode,
	canSubmit,
	regionFolders,
	defaultValues,
	initialGeometry = null,
	header,
	onSave,
}: RegionFormPageProps) {
	const location = useDrawLocation({
		geometryKind: 'region',
		initialGeometry,
		missingMessage: 'Draw the region boundary on the map before saving.',
	});
	const { draw, geometry, geometryType } = location;

	const activeFolders = [...regionFolders].sort((a, b) => compareNames(a.name, b.name));

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: domainValidator(
				({ value }: { readonly value: RegionFormValues }) =>
					createRegionCommand({
						...FORM_VALIDATION_CONTEXT,
						regionId: FORM_VALIDATION_CONTEXT.organizationId,
						regionFolderId:
							value.regionFolderId === noRegionFolderValue ? null : value.regionFolderId,
						name: value.name,
						description: value.description,
						metadata: value.metadata,
						geometry: geometry ?? null,
					}),
				REGION_FIELD_PATHS,
			),
		},
		onSubmit: async ({ value }) => {
			if (!location.requireGeometry() || geometry === null) {
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
						<DrawToolbar geometryKind="region" controller={draw} geometryType={geometryType} />
						<MapLegend mode={mode} />
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Region" />

				<div className="grid gap-5 sm:grid-cols-2">
					<form.AppField
						name="name"
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? 'Name is required.' : undefined,
						}}
					>
						{(field) => <field.TextField label="Name" required placeholder="e.g. North district" />}
					</form.AppField>
					<form.AppField name="regionFolderId">
						{(field) => (
							<field.SelectField
								label="Folder"
								options={folderOptions(activeFolders)}
								placeholder="Unfiled"
							/>
						)}
					</form.AppField>
				</div>

				<LocationBand
					description="Draw the region's area on the map."
					geometryKind="region"
					label="Boundary"
					location={location}
					title="Region boundary"
				/>

				<form.AppField name="description">
					{(field) => (
						<field.TextareaField label="Description" placeholder="Describe the region…" rows={3} />
					)}
				</form.AppField>

				<CustomFieldsSection form={form} framed={false} />
			</RecordFormPage>
		</form.AppForm>
	);
}

function MapLegend({ mode }: { readonly mode: 'create' | 'edit' }) {
	return (
		<div className="pointer-events-none absolute bottom-10 left-4 z-10 flex flex-col gap-1.5 rounded-md border border-border/50 bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
			<span className="flex items-center gap-2 text-foreground">
				{/* Same constant the draw layer paints with, so they cannot drift. */}
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full"
					style={{ backgroundColor: mapInteraction.selected }}
				/>
				{mode === 'edit' ? 'This region' : 'New region'}
			</span>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

function folderOptions(folders: readonly RegionFolderListing[]) {
	return [
		{ label: 'Unfiled', value: noRegionFolderValue },
		...folders.map((folder) => ({ label: folder.name, value: folder.id })),
	];
}

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';

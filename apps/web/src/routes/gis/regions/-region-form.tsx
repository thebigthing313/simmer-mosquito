import { mapInteraction } from '@simmer-mosquito/design-tokens';
import { createRegionCommand } from '@simmer-mosquito/domain';
import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import {
	LocationSection,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	POLYGON_DRAW_TYPES,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import type { RegionFields } from '../../../hooks/mutations/use-region-mutations';
import type { RegionFolderListing } from '../../../hooks/queries/use-region-folders';

/**
 * Domain issue path → the form field holding it. Geometry is drawn on the map,
 * so its issues land on the form alert rather than a field.
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
	readonly description: string;
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
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: RegionFormValues;
		/** The boundary. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew or redrew the boundary this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

/**
 * The form's values, as the write seam takes them.
 *
 * Where the select's non-empty sentinel stops being a thing the routes have to
 * remember: `'none'` exists because Radix forbids an empty item value, and the
 * column it becomes is `null`.
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
	submitLabel,
	onSave,
}: RegionFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [geometryError, setGeometryError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setGeometryError(null);
		}
	}, []);

	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start } = draw;

	useFitToGeometry(map, geometry, draw.isDrawing);

	const activeFolders = useMemo(
		() => [...regionFolders].sort((a, b) => a.name.localeCompare(b.name)),
		[regionFolders],
	);

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
			setSaveError(null);
			if (geometry === null) {
				setGeometryError('Draw the region boundary on the map before saving.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save region.');
			}
		},
	});

	const startDraw = useCallback(() => {
		setGeometryError(null);
		start('Polygon');
	}, [start]);

	const clearGeometry = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
					</>
				}
				gap="tight"
				header={header}
				aside={
					<>
						<MapCanvas controls={{ layers: false }} onMapReady={handleMapReady} />
						<DrawToolbar controller={draw} geometryType="Polygon" />
						<MapLegend mode={mode} />
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Region" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Region</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

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

				<LocationSection
					description="Draw the region's area on the map."
					error={geometryError}
					gap="tight"
					title="Region boundary"
				>
					<GeometryControl
						allowedTypes={POLYGON_DRAW_TYPES}
						controller={draw}
						geometry={geometry}
						geometryType="Polygon"
						label="Boundary"
						onClear={clearGeometry}
						onDraw={startDraw}
						required
					/>
				</LocationSection>

				<form.AppField name="description">
					{(field) => (
						<field.TextareaField
							description="Optional context — what this region covers and how it's used."
							label="Description"
							placeholder="Describe the region…"
							rows={3}
						/>
					)}
				</form.AppField>

				<form.AppField name="metadata">
					{(field) => (
						<field.MetadataField
							description="Optional structured notes for agency-specific region details."
							label="Metadata"
							mode={{ kind: 'manual' }}
						/>
					)}
				</form.AppField>
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

export type { DrawGeometry } from '../../../components/map/use-map-draw';

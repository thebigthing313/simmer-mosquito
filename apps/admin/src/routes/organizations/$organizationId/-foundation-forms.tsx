import { getOwnedGeometryPolicy } from '@simmer-mosquito/domain';
import {
	type GeoJsonGeometry,
	type GeoJsonPoint,
	type ImportGeometryKind,
	isImportGeometryKind,
} from '@simmer-mosquito/mapping';
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useState } from 'react';
import type { OrganizationFoundations } from '../../../api';
import { GeometryFileInput, PointInput } from '../../../components/geometry-input';
import type { LookupKind, useCreateFoundation } from './-foundations-data';

/**
 * The six create forms the foundations page opens, one per foundation kind.
 *
 * They were six sets of per-field `useState` around a hand-rolled submit row,
 * twenty-three pieces of state between them, and their own `TextRow` and
 * `TextAreaRow` wrappers over the raw input primitives. Those wrappers derived
 * a field's DOM id from its label text, so the three forms with a Description
 * field all produced `foundation-description`. Every field here is a
 * `useAppForm` field now, and the kit's frame mints its own id with `useId`.
 *
 * What a field must have is a validator naming it rather than an expression
 * greying Save out, so an operator who presses Add on an incomplete form is
 * told which part is missing.
 *
 * Geometry is the exception and stays as component state: `PointInput` and
 * `GeometryFileInput` wrap `@simmer-mosquito/mapping` and have no field-kit
 * equivalent. Their rule is a form-level validator instead, which is what the
 * alert above the fields renders.
 */

/**
 * What a Region may store, filtered to what the file parser can produce.
 *
 * Read from the geometry register rather than named here. Module scope keeps it
 * a stable reference; a literal in the render would be a new array every pass.
 */
const REGION_IMPORT_KINDS: readonly ImportGeometryKind[] =
	getOwnedGeometryPolicy('region').allowedTypes.filter(isImportGeometryKind);

/** The three lookup families, as the dialog title and the toast name them. */
export const LOOKUP_LABELS: Readonly<Record<LookupKind, string>> = {
	collection_methods: 'Collection Method',
	collection_lures: 'Collection Lure',
	habitat_types: 'Habitat Type',
};

export type DialogKind =
	| { readonly kind: 'region-folder' }
	| { readonly kind: 'region' }
	| { readonly kind: 'address' }
	| { readonly kind: 'species' }
	| { readonly kind: 'trap' }
	| { readonly kind: 'lookup'; readonly lookupKind: LookupKind };

type CreateFoundation = ReturnType<typeof useCreateFoundation>;

/** Runs the write, says whether it landed, and closes the dialog when it did. */
type SubmitFoundation = (label: string, action: () => Promise<unknown>) => Promise<void>;

/**
 * One form per foundation kind.
 *
 * These were a single component with a six-way switch in its body and another in
 * its submit, over fifteen `useState` hooks. It read as one form that could not
 * decide what it was, and the complexity gate agreed. Each kind owns only its
 * own fields and its own submit, and this picks between them.
 */
export function FoundationForm({
	dialog,
	foundations,
	availableSpecies,
	create,
	onSubmit,
}: {
	readonly dialog: DialogKind;
	readonly foundations: OrganizationFoundations;
	readonly availableSpecies: OrganizationFoundations['species'];
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	switch (dialog.kind) {
		case 'region-folder':
			return <RegionFolderForm create={create} onSubmit={onSubmit} />;
		case 'region':
			return <RegionForm create={create} folders={foundations.regionFolders} onSubmit={onSubmit} />;
		case 'address':
			return <AddressForm create={create} onSubmit={onSubmit} />;
		case 'species':
			return <SpeciesForm available={availableSpecies} create={create} onSubmit={onSubmit} />;
		case 'lookup':
			return <LookupForm create={create} kind={dialog.lookupKind} onSubmit={onSubmit} />;
		case 'trap':
			return <TrapForm create={create} foundations={foundations} onSubmit={onSubmit} />;
	}
}

/** A name every kind requires, worded for the thing being added. */
function requiredName(noun: string) {
	return ({ value }: { readonly value: string }) =>
		value.trim() === '' ? `${noun} is required.` : undefined;
}

function RegionFolderForm({
	create,
	onSubmit,
}: {
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const form = useAppForm({
		defaultValues: { name: '', description: '' },
		onSubmit: async ({ value }) => {
			await onSubmit('Folder', () =>
				create.regionFolder.mutateAsync({
					name: value.name.trim(),
					description: value.description,
				}),
			);
		},
	});

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title="Unable to add the folder" />
				<form.AppField name="name" validators={{ onSubmit: requiredName('Folder name') }}>
					{(field) => (
						<field.TextField label="Folder name" placeholder="e.g. North district" required />
					)}
				</form.AppField>
				<form.AppField name="description">
					{(field) => <field.TextareaField label="Description" rows={2} />}
				</form.AppField>
				<form.FormActions>
					<form.SubmitButton>Add</form.SubmitButton>
				</form.FormActions>
			</FoundationFormShell>
		</form.AppForm>
	);
}

function RegionForm({
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

function AddressForm({
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

function SpeciesForm({
	available,
	create,
	onSubmit,
}: {
	readonly available: OrganizationFoundations['species'];
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const form = useAppForm({
		defaultValues: { speciesId: '' },
		onSubmit: async ({ value }) => {
			await onSubmit('Species', () => create.species.mutateAsync(value.speciesId));
		},
	});

	const options = available.map((species) => ({
		value: species.id,
		label:
			species.commonName === null
				? species.displayName
				: `${species.displayName}, ${species.commonName}`,
	}));

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title="Unable to enable the species" />
				<form.AppField
					name="speciesId"
					validators={{
						onSubmit: ({ value }: { readonly value: string }) =>
							value === '' ? 'Choose a species.' : undefined,
					}}
				>
					{(field) => (
						<field.SelectField
							label="Species"
							options={options}
							placeholder="Choose a species"
							required
						/>
					)}
				</form.AppField>
				<form.FormActions>
					<form.SubmitButton>Add</form.SubmitButton>
				</form.FormActions>
			</FoundationFormShell>
		</form.AppForm>
	);
}

function LookupForm({
	kind,
	create,
	onSubmit,
}: {
	readonly kind: LookupKind;
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const form = useAppForm({
		defaultValues: {
			name: '',
			description: '',
			actionThreshold: null as number | null,
		},
		onSubmit: async ({ value }) => {
			// Truncated rather than rounded, because the column counts whole things
			// and the field this replaced read its value through `parseInt`.
			const threshold = value.actionThreshold === null ? null : Math.trunc(value.actionThreshold);
			await onSubmit(LOOKUP_LABELS[kind], () =>
				create.lookup.mutateAsync({
					kind,
					input: {
						name: value.name.trim(),
						description: value.description,
						actionThreshold: threshold !== null && threshold >= 0 ? threshold : null,
					},
				}),
			);
		},
	});

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title={`Unable to add the ${LOOKUP_LABELS[kind].toLowerCase()}`} />
				<form.AppField name="name" validators={{ onSubmit: requiredName('Name') }}>
					{(field) => <field.TextField label="Name" required />}
				</form.AppField>
				<form.AppField name="description">
					{(field) => <field.TextareaField label="Description" rows={2} />}
				</form.AppField>
				{/* No "Active" toggle: a catalog entry is created live and retired later,
			    which is an update the organization makes in its own workspace. */}
				<form.AppField name="actionThreshold">
					{(field) => (
						<field.NumberField
							emptyValue={null}
							label="Action threshold"
							min={0}
							placeholder="Optional"
							step={1}
						/>
					)}
				</form.AppField>
				<form.FormActions>
					<form.SubmitButton>Add</form.SubmitButton>
				</form.FormActions>
			</FoundationFormShell>
		</form.AppForm>
	);
}

function TrapForm({
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

/**
 * Non-empty sentinels. An optional select cannot carry an empty option value:
 * `SelectField` reads one as Radix resetting itself and drops it.
 */
const UNFILED = 'unfiled';
const NONE = 'none';

/** The `<form>` every foundation kind submits through. */
function FoundationFormShell({
	onSubmit,
	children,
}: {
	readonly onSubmit: () => void;
	readonly children: React.ReactNode;
}) {
	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			{children}
		</form>
	);
}

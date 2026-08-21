/**
 * The add/edit surface for a product, and the delete inside it.
 *
 * Split out of the route with the batch modules beside it (#169): insecticides
 * and batches are two record types with two sets of commands, and one file held
 * both.
 */

import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { useAppForm, validateMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
	CatalogDeleteDialog,
	CatalogDrawerCancel,
	CatalogRecordDrawer,
	commitCatalogSave,
} from '../../../components/catalog';
import type {
	InsecticideFields,
	InsecticideMutations,
} from '../../../hooks/mutations/use-insecticide-mutations';
import type { InsecticideRecord } from '../../../hooks/queries/use-insecticide-records';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';

const DeleteIcon = iconRegistry.actions.delete.icon;

const insecticideTypeOptions = [
	{ label: 'Larvicide', value: 'larvicide' },
	{ label: 'Adulticide', value: 'adulticide' },
	{ label: 'Pupicide', value: 'pupicide' },
	{ label: 'Other', value: 'other' },
] as const;

export function InsecticideDrawer({
	canManage,
	insecticide,
	mutations,
	tooltip,
	trigger,
	units,
}: {
	readonly canManage: boolean;
	readonly insecticide?: InsecticideRecord | undefined;
	readonly mutations: InsecticideMutations;
	/** When set, the trigger gets a hover/focus tooltip with this label. */
	readonly tooltip?: string | undefined;
	readonly trigger: React.ReactNode;
	readonly units: readonly UnitLabel[];
}) {
	const [open, setOpen] = useState(false);
	const defaultValues = insecticideFormValues(insecticide, units[0]?.id ?? '');
	const unitChoices = useMemo(() => units.map(unitOption), [units]);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					insecticide === undefined
						? 'Unable to create insecticide.'
						: `Unable to save ${insecticide.tradeName}.`,
				onWritten: () => setOpen(false),
				save: () =>
					insecticide === undefined
						? mutations.create(insecticideFields(value)).then(() => undefined)
						: mutations.save(
								insecticide.id,
								insecticideFields(value),
								insecticideFields(insecticideFormValues(insecticide, insecticide.defaultUnitId)),
							),
			});
		},
	});

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<form.AppForm>
			<CatalogRecordDrawer
				actions={
					<form.FormActions>
						<form.SubmitButton
							disabled={!canManage || !mutations.canWrite || unitChoices.length === 0}
						/>
						<CatalogDrawerCancel />
					</form.FormActions>
				}
				description="Manage product identity, label references, lifecycle state, and optional metadata."
				destructiveAction={
					insecticide === undefined ? undefined : (
						<DeleteInsecticideDialog insecticide={insecticide} mutations={mutations} />
					)
				}
				onOpenChange={updateOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={insecticide === undefined ? 'Add Insecticide' : `Edit ${insecticide.tradeName}`}
				tooltip={tooltip}
				trigger={trigger}
				width="xl"
			>
				<form.FormErrorAlert />
				<form.AppField name="isActive">
					{(field) => <field.SwitchField disabled={!canManage} label="Active" />}
				</form.AppField>
				<form.AppField name="tradeName" validators={{ onSubmit: requiredText('Trade name') }}>
					{(field) => (
						<field.TextField
							disabled={!canManage}
							label="Trade name"
							placeholder="e.g. VectoBac 12AS"
						/>
					)}
				</form.AppField>
				<form.AppField name="shorthand">
					{(field) => (
						<field.TextField disabled={!canManage} label="Shorthand" placeholder="e.g. VectoBac" />
					)}
				</form.AppField>
				<form.AppField
					name="activeIngredient"
					validators={{ onSubmit: requiredText('Active ingredient') }}
				>
					{(field) => (
						<field.TextField
							disabled={!canManage}
							label="Active ingredient"
							placeholder="e.g. Bacillus thuringiensis israelensis"
						/>
					)}
				</form.AppField>
				<form.AppField name="type">
					{(field) => (
						<field.SelectField
							disabled={!canManage}
							label="Type"
							options={insecticideTypeOptions}
						/>
					)}
				</form.AppField>
				<form.AppField
					name="registrationNumber"
					validators={{ onSubmit: requiredText('Registration number') }}
				>
					{(field) => (
						<field.TextField
							disabled={!canManage}
							label="Registration"
							placeholder="e.g. EPA Reg. No. 73049-38"
						/>
					)}
				</form.AppField>
				<form.AppField
					name="defaultUnitId"
					validators={{ onSubmit: requiredText('Default usage unit') }}
				>
					{(field) => (
						<field.SelectField
							description="Pre-fills the unit on every application of this product."
							disabled={!canManage || unitChoices.length === 0}
							label="Default usage unit"
							options={unitChoices}
						/>
					)}
				</form.AppField>
				<form.AppField name="labelUrl">
					{(field) => (
						<field.UrlField disabled={!canManage} label="Label URL" placeholder="https://..." />
					)}
				</form.AppField>
				<form.AppField name="msdsUrl">
					{(field) => (
						<field.UrlField disabled={!canManage} label="SDS URL" placeholder="https://..." />
					)}
				</form.AppField>
				<form.AppField name="metadata" validators={{ onSubmit: validateMetadataValue }}>
					{(field) => (
						<field.MetadataField
							description="Add product-specific details such as signal word, storage notes, or restricted-use flags."
							disabled={!canManage}
							label="Metadata"
							mode={{ kind: 'manual' }}
						/>
					)}
				</form.AppField>
			</CatalogRecordDrawer>
		</form.AppForm>
	);
}

/** The one validator six of these fields share: present after trimming. */
function requiredText(label: string) {
	return ({ value }: { readonly value: string }) =>
		value.trim().length === 0 ? `${label} is required.` : undefined;
}

/**
 * Deletion is a rare, destructive action, so it lives inside the edit drawer
 * rather than as a per-row control. Reversible lifecycle changes belong to the
 * row's own `CatalogLifecycleButton` instead.
 */
function DeleteInsecticideDialog({
	insecticide,
	mutations,
}: {
	readonly insecticide: InsecticideRecord;
	readonly mutations: InsecticideMutations;
}) {
	return (
		<CatalogDeleteDialog
			confirmLabel="Delete"
			description={
				<>
					This removes {insecticide.tradeName} from the product list. If a server rule blocks the
					delete, because an application already used it, the record will stay in place.
				</>
			}
			onConfirm={() =>
				commitCatalogSave({
					failureMessage: `Unable to delete ${insecticide.tradeName}.`,
					save: () => mutations.remove(insecticide.id),
				})
			}
			title="Delete Insecticide?"
			trigger={
				<Button type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" data-icon="inline-start" />
					Delete Insecticide
				</Button>
			}
		/>
	);
}

function unitOption(unit: UnitLabel) {
	return {
		label:
			unit.abbreviation.length === 0 ? unit.unitName : `${unit.unitName} (${unit.abbreviation})`,
		value: unit.id,
	};
}

/** A product that does not exist yet, as the drawer opens on it. */
const emptyInsecticideValues = {
	tradeName: '',
	activeIngredient: '',
	type: 'adulticide' as InsecticideRecord['type'],
	registrationNumber: '',
	defaultUnitId: '',
	labelUrl: '',
	msdsUrl: '',
	shorthand: '',
	metadata: null as MetadataValue | null,
	isActive: true,
};

/**
 * Open the product drawer on a record, or on a blank one.
 *
 * `defaultUnitId` is the first offered unit when there is no record, because a
 * product without one cannot be applied and the field would otherwise open
 * empty on a list of one.
 *
 * The two cases are written apart rather than as eleven `??` defaults over an
 * optional record. Every field of a saved product is already the value the form
 * wants, apart from the three nullable columns, and defaulting each one against
 * `undefined` said so eleven times.
 */
function insecticideFormValues(insecticide: InsecticideRecord | undefined, defaultUnitId: string) {
	if (insecticide === undefined) {
		return { ...emptyInsecticideValues, defaultUnitId };
	}

	return {
		tradeName: insecticide.tradeName,
		activeIngredient: insecticide.activeIngredient,
		type: insecticide.type,
		registrationNumber: insecticide.registrationNumber,
		defaultUnitId: insecticide.defaultUnitId,
		labelUrl: insecticide.labelUrl ?? '',
		msdsUrl: insecticide.msdsUrl ?? '',
		shorthand: insecticide.shorthand ?? '',
		metadata: metadataObject(insecticide.metadata),
		isActive: insecticide.isActive,
	};
}

/** `metadata` is an unknown JSON column; the field takes an object or nothing. */
function metadataObject(metadata: unknown): MetadataValue | null {
	return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
		? (metadata as MetadataValue)
		: null;
}

/** The drawer's values as the write hook takes them: trimmed, empty means absent. */
function insecticideFields(values: ReturnType<typeof insecticideFormValues>): InsecticideFields {
	return {
		tradeName: values.tradeName.trim(),
		activeIngredient: values.activeIngredient.trim(),
		type: values.type,
		registrationNumber: values.registrationNumber.trim(),
		defaultUnitId: values.defaultUnitId,
		labelUrl: emptyToNull(values.labelUrl),
		msdsUrl: emptyToNull(values.msdsUrl),
		shorthand: emptyToNull(values.shorthand),
		metadata: values.metadata,
		isActive: values.isActive,
	};
}

function emptyToNull(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}

/**
 * The add/edit surface for a lot or batch of a product, and the delete beside
 * each row. A batch is its own record with its own commands, so it has its own
 * drawer rather than a section of the product's.
 */

import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
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
	InsecticideBatchFields,
	InsecticideBatchMutations,
} from '../../../hooks/mutations/use-insecticide-mutations';
import type {
	InsecticideBatchRecord,
	InsecticideRecord,
} from '../../../hooks/queries/use-insecticide-records';
import { insecticideDisplayName } from '../-control-display';

const DeleteIcon = iconRegistry.actions.delete.icon;

export function InsecticideBatchDrawer({
	batch,
	canManage,
	defaultInsecticideId,
	insecticides,
	lockInsecticide = false,
	mutations,
	trigger,
}: {
	readonly batch?: InsecticideBatchRecord | undefined;
	readonly canManage: boolean;
	readonly defaultInsecticideId?: string | undefined;
	readonly insecticides: readonly InsecticideRecord[];
	readonly lockInsecticide?: boolean;
	readonly mutations: InsecticideBatchMutations;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const activeInsecticides = insecticides.filter(
		(item) => item.isActive || item.id === batch?.insecticideId,
	);
	const fallbackInsecticideId = defaultInsecticideId ?? activeInsecticides[0]?.id ?? '';
	const defaultValues = insecticideBatchFormValues(batch, fallbackInsecticideId);
	const insecticideChoices = useMemo(
		() => activeInsecticides.map(insecticideOption),
		[activeInsecticides],
	);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					batch === undefined ? 'Unable to create batch.' : `Unable to save ${batch.batchName}.`,
				onWritten: () => setOpen(false),
				save: () =>
					batch === undefined
						? mutations.create(batchFields(value)).then(() => undefined)
						: mutations.save(
								batch.id,
								batchFields(value),
								batchFields(insecticideBatchFormValues(batch, batch.insecticideId)),
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
							disabled={!canManage || !mutations.canWrite || insecticideChoices.length === 0}
						/>
						<CatalogDrawerCancel />
					</form.FormActions>
				}
				description="Manage lot or batch labels for an active insecticide product."
				onOpenChange={updateOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={batch === undefined ? 'Add Batch' : `Edit ${batch.batchName}`}
				trigger={trigger}
				width="md"
			>
				<form.FormErrorAlert />
				<form.AppField name="isActive">
					{(field) => <field.SwitchField disabled={!canManage} label="Active" />}
				</form.AppField>
				<form.AppField
					name="insecticideId"
					validators={{
						onSubmit: ({ value }) =>
							value.trim().length === 0 ? 'Insecticide is required.' : undefined,
					}}
				>
					{(field) => (
						<field.SelectField
							disabled={
								!canManage ||
								batch !== undefined ||
								lockInsecticide ||
								insecticideChoices.length === 0
							}
							label="Insecticide"
							options={insecticideChoices}
						/>
					)}
				</form.AppField>
				<form.AppField
					name="batchName"
					validators={{
						onSubmit: ({ value }) =>
							value.trim().length === 0 ? 'Batch name is required.' : undefined,
					}}
				>
					{(field) => (
						<field.TextField
							disabled={!canManage}
							label="Batch name"
							placeholder="e.g. Lot 24-018"
						/>
					)}
				</form.AppField>
			</CatalogRecordDrawer>
		</form.AppForm>
	);
}

export function DeleteInsecticideBatchDialog({
	batch,
	mutations,
}: {
	readonly batch: InsecticideBatchRecord;
	readonly mutations: InsecticideBatchMutations;
}) {
	return (
		<CatalogDeleteDialog
			confirmLabel="Delete"
			description={
				<>
					This removes {batch.batchName} from batch choices. If a server rule blocks the delete, the
					record will stay in place.
				</>
			}
			onConfirm={() =>
				commitCatalogSave({
					failureMessage: `Unable to delete ${batch.batchName}.`,
					save: () => mutations.remove(batch.id),
				})
			}
			title="Delete Batch?"
			trigger={
				<Button size="icon" type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" />
					<span className="sr-only">Delete {batch.batchName}</span>
				</Button>
			}
		/>
	);
}

function insecticideOption(insecticide: InsecticideRecord) {
	return {
		label: insecticideDisplayName(insecticide),
		value: insecticide.id,
	};
}

/**
 * Open the batch drawer on a record, or on a blank one under a product.
 *
 * Written as two cases rather than three `??` defaults over an optional record,
 * the same way the product drawer's values are. A saved batch has all three.
 */
function insecticideBatchFormValues(
	batch: InsecticideBatchRecord | undefined,
	defaultInsecticideId: string,
) {
	if (batch === undefined) {
		return { insecticideId: defaultInsecticideId, batchName: '', isActive: true };
	}

	return {
		insecticideId: batch.insecticideId,
		batchName: batch.batchName,
		isActive: batch.isActive,
	};
}

function batchFields(
	values: ReturnType<typeof insecticideBatchFormValues>,
): InsecticideBatchFields {
	return {
		insecticideId: values.insecticideId,
		batchName: values.batchName.trim(),
		isActive: values.isActive,
	};
}

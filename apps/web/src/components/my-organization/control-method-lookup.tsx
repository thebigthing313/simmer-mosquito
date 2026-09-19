import { useAppForm, validateJsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from '@simmer-mosquito/ui-web/components/ui/drawer';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { useState } from 'react';
import type { CatalogMutations } from '../../hooks/mutations/catalog-fields';
import type { CatalogRecords, ControlMethodRecord } from '../../hooks/queries/catalog-record-view';
import { useAcknowledgedWrite } from '../../hooks/use-acknowledged-write';
import { catalogFields, catalogFormValues, commitCatalogSave } from '../catalog';
import { CustomFieldsCell } from '../custom-fields-cell';
import { AddIcon, CloseIcon, controlMethodListConfigs, EditIcon } from './constants';
import { LookupListFrame } from './layout/lookup-list-frame';
import type { ControlMethodCollectionKey } from './types';

export function ControlMethodLookupList({
	canManage,
	canEditMethods,
	collectionKey,
	mutations,
	records,
}: {
	/** Owner/admin: adding a method, and flipping one active or inactive. */
	readonly canManage: boolean;
	/**
	 * Manager-and-above: renaming a method and editing its custom fields. The
	 * server splits these two floors (`update*Method` is `MANAGER`, everything
	 * else about a method is `ADMIN`), so this list needs both.
	 */
	readonly canEditMethods: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly mutations: CatalogMutations;
	readonly records: CatalogRecords<ControlMethodRecord>;
}) {
	const config = controlMethodListConfigs[collectionKey];
	const activeMethods = records.activeRecords;
	const inactiveMethods = records.inactiveRecords;

	return (
		<LookupListFrame
			activeCount={activeMethods.length}
			inactiveCount={inactiveMethods.length}
			detail={config.detail}
			title={config.title}
			action={
				// Hidden rather than disabled, per `components/write-only.tsx`: a
				// greyed-out Add asks the reader to work out why on every visit.
				canManage ? (
					<ControlMethodDrawer
						canEdit={canEditMethods}
						canManage={canManage}
						collectionKey={collectionKey}
						mutations={mutations}
						trigger={
							<Button type="button" variant="outline" size="sm">
								<AddIcon aria-hidden="true" />
								{config.addLabel}
							</Button>
						}
					/>
				) : null
			}
		>
			<ControlMethodTable
				canEditMethods={canEditMethods}
				canManage={canManage}
				collectionKey={collectionKey}
				methods={activeMethods}
				mutations={mutations}
			/>
			{inactiveMethods.length > 0 ? (
				<ControlMethodTable
					canEditMethods={canEditMethods}
					canManage={canManage}
					collectionKey={collectionKey}
					methods={inactiveMethods}
					mutations={mutations}
				/>
			) : null}
		</LookupListFrame>
	);
}

function ControlMethodTable({
	canEditMethods,
	canManage,
	collectionKey,
	methods,
	mutations,
}: {
	readonly canEditMethods: boolean;
	readonly canManage: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly methods: readonly ControlMethodRecord[];
	readonly mutations: CatalogMutations;
}) {
	const config = controlMethodListConfigs[collectionKey];
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{config.fieldLabel}</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-[30%]">Custom Fields</TableHead>
						{canEditMethods ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{methods.map((method) => (
						<TableRow key={method.id}>
							<TableCell className="font-medium">{method.name}</TableCell>
							<TableCell>{method.isActive ? 'Active' : 'Inactive'}</TableCell>
							<TableCell>
								<CustomFieldsCell schema={method.customSchema} />
							</TableCell>
							{canEditMethods ? (
								<TableCell className="text-right">
									<ControlMethodDrawer
										canEdit={canEditMethods}
										canManage={canManage}
										collectionKey={collectionKey}
										method={method}
										mutations={mutations}
										trigger={
											<Button type="button" variant="outline" size="icon">
												<EditIcon aria-hidden="true" />
												<span className="sr-only">Edit {method.name}</span>
											</Button>
										}
									/>
								</TableCell>
							) : null}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ControlMethodDrawer({
	canEdit,
	canManage,
	collectionKey,
	method,
	mutations,
	trigger,
}: {
	/** Manager-and-above: the name and the custom fields. */
	readonly canEdit: boolean;
	/** Owner/admin: creating a method, and the Active switch. */
	readonly canManage: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly method?: ControlMethodRecord | undefined;
	readonly mutations: CatalogMutations;
	readonly trigger: React.ReactNode;
}) {
	// Creating is admin-only; editing an existing method is open to managers.
	const canSubmit = method === undefined ? canManage : canEdit;
	const [open, setOpen] = useState(false);
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });
	const config = controlMethodListConfigs[collectionKey];
	const defaultValues = catalogFormValues(method);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					method === undefined
						? `Unable to create ${config.singularLabel}.`
						: `Unable to save ${method.name}.`,
				// Closing is inside `run` rather than `onWritten`: `run` resolves on a
				// refusal too, so dismissing on the way past would take the form away
				// before the question could be asked.
				save: () =>
					run(async (acknowledgements) => {
						if (method === undefined) {
							await mutations.create(catalogFields(value));
						} else {
							await mutations.save(
								method.id,
								catalogFields(value),
								catalogFields(catalogFormValues(method)),
								acknowledgements,
							);
						}
						setOpen(false);
					}),
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
		<>
			<Drawer direction="right" open={open} onOpenChange={updateOpen}>
				<DrawerTrigger asChild>{trigger}</DrawerTrigger>
				<DrawerContent className="w-[min(680px,100%)] sm:max-w-[680px]">
					<DrawerHeader>
						<DrawerTitle>
							{method === undefined ? `Add ${config.singularLabel}` : `Edit ${method.name}`}
						</DrawerTitle>
						<DrawerDescription>
							Manage the label, lifecycle state, and optional custom fields.
						</DrawerDescription>
					</DrawerHeader>
					<form.AppForm>
						<form
							className="grid min-h-0 gap-3.5 overflow-y-auto px-4"
							onSubmit={(event) => {
								event.preventDefault();
								void form.handleSubmit();
							}}
						>
							<form.FormErrorAlert />
							<form.AppField
								name="name"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? `${config.fieldLabel} is required.` : undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label={config.fieldLabel}
										disabled={!canSubmit}
										placeholder={config.placeholder}
									/>
								)}
							</form.AppField>
							{/* The lifecycle switch stays at the admin floor even inside an edit a
							    manager may make: flipping it emits `deactivate*Method` /
							    `reactivate*Method`, which the server holds at `ADMIN`. */}
							<form.AppField name="isActive">
								{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
							</form.AppField>
							<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
								{(field) => <field.JsonSchemaField label="Custom Fields" disabled={!canSubmit} />}
							</form.AppField>
							<DrawerFooter className="px-0">
								<form.FormActions>
									<form.SubmitButton disabled={!canSubmit || !mutations.canWrite} />
									<DrawerClose asChild>
										<Button type="button" variant="outline">
											<CloseIcon data-icon="inline-start" aria-hidden="true" />
											Cancel
										</Button>
									</DrawerClose>
								</form.FormActions>
							</DrawerFooter>
						</form>
					</form.AppForm>
				</DrawerContent>
			</Drawer>
			{dialog}
		</>
	);
}

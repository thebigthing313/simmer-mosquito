import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
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
import { useHabitatTypeMutations } from '../../hooks/mutations/use-habitat-type-mutations';
import type { SchemaCatalogRecord } from '../../hooks/queries/catalog-record-view';
import { useHabitatTypeRecords } from '../../hooks/queries/use-habitat-type-records';
import { useAcknowledgedWrite } from '../../hooks/use-acknowledged-write';
import { catalogFields, catalogFormValues, commitCatalogSave } from '../catalog';
import { CustomFieldsCell } from '../custom-fields-cell';
import { AddIcon, CloseIcon, EditIcon } from './constants';
import { LookupListFrame } from './layout/lookup-list-frame';

export function HabitatTypeLookupList({ canManage }: { readonly canManage: boolean }) {
	const { activeRecords: activeHabitatTypes, inactiveRecords: inactiveHabitatTypes } =
		useHabitatTypeRecords();
	const mutations = useHabitatTypeMutations();

	return (
		<LookupListFrame
			activeCount={activeHabitatTypes.length}
			inactiveCount={inactiveHabitatTypes.length}
			detail="Habitat types define larval habitat labels and optional custom fields."
			title="Habitat Types"
			action={
				<HabitatTypeDrawer
					canManage={canManage}
					mutations={mutations}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							Add Habitat Type
						</Button>
					}
				/>
			}
		>
			<HabitatTypeTable
				canManage={canManage}
				emptyLabel="No active habitat types."
				habitatTypes={activeHabitatTypes}
				mutations={mutations}
				title="Active Habitat Types"
			/>
			<HabitatTypeTable
				canManage={canManage}
				emptyLabel="No inactive habitat types."
				habitatTypes={inactiveHabitatTypes}
				mutations={mutations}
				title="Inactive Habitat Types"
			/>
		</LookupListFrame>
	);
}

function HabitatTypeTable({
	canManage,
	emptyLabel,
	habitatTypes,
	mutations,
	title,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly habitatTypes: readonly SchemaCatalogRecord[];
	readonly mutations: CatalogMutations;
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
				<span className="text-xs font-medium text-muted-foreground">{title}</span>
				<span className="text-xs font-medium text-muted-foreground">{habitatTypes.length}</span>
			</div>
			{habitatTypes.length === 0 ? (
				<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 bg-background/70 [--habitat-actions-column:76px] [--habitat-fields-column:112px] [--habitat-name-column:28%]">
					<Table className="w-full table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--habitat-name-column)">Habitat Type</TableHead>
								<TableHead>Description</TableHead>
								<TableHead className="w-(--habitat-fields-column)">Custom Fields</TableHead>
								{canManage ? (
									<TableHead className="w-(--habitat-actions-column) text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{habitatTypes.map((habitatType) => (
								<TableRow key={habitatType.id}>
									<TableCell className="w-(--habitat-name-column) font-medium">
										<span className="wrap-anywhere">{habitatType.name}</span>
									</TableCell>
									<TableCell className="whitespace-normal text-muted-foreground wrap-anywhere">
										{habitatType.description ?? <AbsentValue />}
									</TableCell>
									<TableCell className="w-(--habitat-fields-column)">
										<CustomFieldsCell schema={habitatType.customSchema} />
									</TableCell>
									{canManage ? (
										<TableCell className="w-(--habitat-actions-column) text-right">
											<HabitatTypeDrawer
												canManage={canManage}
												habitatType={habitatType}
												mutations={mutations}
												trigger={
													<Button type="button" variant="outline" size="icon">
														<EditIcon aria-hidden="true" />
														<span className="sr-only">Edit {habitatType.name}</span>
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
			)}
		</div>
	);
}

function HabitatTypeDrawer({
	canManage,
	habitatType,
	mutations,
	trigger,
}: {
	readonly canManage: boolean;
	readonly habitatType?: SchemaCatalogRecord | undefined;
	readonly mutations: CatalogMutations;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });
	const defaultValues = catalogFormValues(habitatType);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					habitatType === undefined
						? 'Unable to create habitat type.'
						: `Unable to save ${habitatType.name}.`,
				// Closing is inside `run` rather than `onWritten`: `run` resolves on a
				// refusal too, and the form has to stay for the question.
				save: () =>
					run(async (acknowledgements) => {
						if (habitatType === undefined) {
							await mutations.create(catalogFields(value));
						} else {
							await mutations.save(
								habitatType.id,
								catalogFields(value),
								catalogFields(catalogFormValues(habitatType)),
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
							{habitatType === undefined ? 'Add habitat type' : `Edit ${habitatType.name}`}
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
										value.trim().length === 0 ? 'Habitat type name is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField
										label="Habitat type name"
										disabled={!canManage}
										placeholder="e.g. Catch basin"
									/>
								)}
							</form.AppField>
							<form.AppField name="description">
								{(field) => (
									<field.TextareaField
										label="Description"
										disabled={!canManage}
										className="min-h-24"
									/>
								)}
							</form.AppField>
							<form.AppField name="isActive">
								{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
							</form.AppField>
							<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
								{(field) => <field.JsonSchemaField label="Custom Fields" disabled={!canManage} />}
							</form.AppField>
							<DrawerFooter className="px-0">
								<form.FormActions>
									<form.SubmitButton disabled={!canManage || !mutations.canWrite} />
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

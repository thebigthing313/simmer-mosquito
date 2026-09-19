import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
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
import { useCollectionLureMutations } from '../../hooks/mutations/use-collection-lure-mutations';
import type { DescribedCatalogRecord } from '../../hooks/queries/catalog-record-view';
import { useCollectionLureRecords } from '../../hooks/queries/use-collection-lure-records';
import { useAcknowledgedWrite } from '../../hooks/use-acknowledged-write';
import { catalogFields, catalogFormValues, commitCatalogSave } from '../catalog';
import { AddIcon, CloseIcon, EditIcon } from './constants';
import { LookupListFrame } from './layout/lookup-list-frame';

export function CollectionLureLookupList({ canManage }: { readonly canManage: boolean }) {
	const { activeRecords: activeLures, inactiveRecords: inactiveLures } = useCollectionLureRecords();
	const mutations = useCollectionLureMutations();

	return (
		<LookupListFrame
			activeCount={activeLures.length}
			inactiveCount={inactiveLures.length}
			detail="Lures stay as lightweight labels with lifecycle state."
			title="Collection Lures"
			action={
				<CollectionLureDrawer
					canManage={canManage}
					mutations={mutations}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							Add Lure
						</Button>
					}
				/>
			}
		>
			<CollectionLureTable
				canManage={canManage}
				emptyLabel="No active collection lures."
				lures={activeLures}
				mutations={mutations}
				title="Active Lures"
			/>
			<CollectionLureTable
				canManage={canManage}
				emptyLabel="No inactive collection lures."
				lures={inactiveLures}
				mutations={mutations}
				title="Inactive Lures"
			/>
		</LookupListFrame>
	);
}

function CollectionLureTable({
	canManage,
	emptyLabel,
	lures,
	mutations,
	title,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly lures: readonly DescribedCatalogRecord[];
	readonly mutations: CatalogMutations;
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
				<span className="text-xs font-medium text-muted-foreground">{title}</span>
				<span className="text-xs font-medium text-muted-foreground">{lures.length}</span>
			</div>
			{lures.length === 0 ? (
				<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 bg-background/70 [--lure-actions-column:76px] [--lure-name-column:32%]">
					<Table className="w-full table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--lure-name-column)">Lure</TableHead>
								<TableHead>Description</TableHead>
								{canManage ? (
									<TableHead className="w-(--lure-actions-column) text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{lures.map((lure) => (
								<TableRow key={lure.id}>
									<TableCell className="w-(--lure-name-column) font-medium">
										<span className="wrap-anywhere">{lure.name}</span>
									</TableCell>
									<TableCell className="whitespace-normal text-muted-foreground wrap-anywhere">
										{lure.description ?? <AbsentValue />}
									</TableCell>
									{canManage ? (
										<TableCell className="w-(--lure-actions-column) text-right">
											<CollectionLureDrawer
												canManage={canManage}
												lure={lure}
												mutations={mutations}
												trigger={
													<Button type="button" variant="outline" size="icon">
														<EditIcon aria-hidden="true" />
														<span className="sr-only">Edit {lure.name}</span>
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

function CollectionLureDrawer({
	canManage,
	lure,
	mutations,
	trigger,
}: {
	readonly canManage: boolean;
	readonly lure?: DescribedCatalogRecord | undefined;
	readonly mutations: CatalogMutations;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });
	const defaultValues = catalogFormValues(lure);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					lure === undefined ? 'Unable to create collection lure.' : `Unable to save ${lure.name}.`,
				// Closing is inside `run` rather than `onWritten`: `run` resolves on a
				// refusal too, so dismissing on the way past would take the form away
				// before the question could be asked.
				save: () =>
					run(async (acknowledgements) => {
						if (lure === undefined) {
							await mutations.create(catalogFields(value));
						} else {
							await mutations.save(
								lure.id,
								catalogFields(value),
								catalogFields(catalogFormValues(lure)),
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
				<DrawerContent className="w-[min(520px,100%)] sm:max-w-[520px]">
					<DrawerHeader>
						<DrawerTitle>
							{lure === undefined ? 'Add Collection Lure' : `Edit ${lure.name}`}
						</DrawerTitle>
						<DrawerDescription>
							Manage the label, description, and lifecycle state.
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
										value.trim().length === 0 ? 'Lure name is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField label="Lure name" disabled={!canManage} placeholder="e.g. CO2" />
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

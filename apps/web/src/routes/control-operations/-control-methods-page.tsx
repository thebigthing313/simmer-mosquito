import { useAppForm, validateJsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import { useAcknowledgedWrite } from '../../components/acknowledged-write';
import {
	CatalogActionsHead,
	CatalogDialogCancel,
	CatalogFilteredList,
	CatalogNameCell,
	CatalogPage,
	CatalogRecordDialog,
	CatalogRowActions,
	CatalogSection,
	catalogFields,
	catalogFormValues,
	commitCatalogSave,
	toggleCatalogActive,
	useCatalogDialogOpen,
	useCatalogSearch,
	useResetOnOpen,
} from '../../components/catalog';
import { CustomFieldsCell } from '../../components/custom-fields-cell';
import type { CatalogMutations } from '../../hooks/mutations/use-catalog-mutations';
import type { CatalogRecords, ControlMethodRecord } from '../../hooks/queries/use-catalog-records';

// Chemical, source reduction, biocontrol and outreach each manage their own method
// catalog. The catalogs are the same shape (name + lifecycle + optional custom
// fields), so the four routes render this page with their own copy — and with the
// read and the write hooks for their own table, because a hook cannot be chosen
// from a prop.

const AddIcon = iconRegistry.actions.add.icon;

function matchesMethod(row: ControlMethodRecord, query: string): boolean {
	return row.name.toLowerCase().includes(query);
}

export interface ControlMethodsPageProps {
	/** The catalog's two halves — see `hooks/queries/use-catalog-records.ts`. */
	readonly records: CatalogRecords<ControlMethodRecord>;
	/** The catalog's five commands — see `hooks/mutations/use-catalog-mutations.ts`. */
	readonly mutations: CatalogMutations;
	/** Owner/admin: adding a method, and deactivating or reactivating one. */
	readonly canManage: boolean;
	/**
	 * Manager-and-above: renaming a method and editing its custom fields.
	 *
	 * The server splits the catalog across two floors —
	 * `controlOperations.update*Method` is `MANAGER` while `create*`,
	 * `deactivate*`, `reactivate*` and `delete*` are `ADMIN` — so this page
	 * needs both. Gating all of it at `canManage` was #65: a manager who may
	 * rename a method saw no Edit control at all.
	 */
	readonly canEditMethods: boolean;
	/** e.g. "Application methods" */
	readonly title: string;
	readonly description: string;
	/** e.g. "application method" — used in buttons, dialogs, and empty states. */
	readonly singularLabel: string;
	readonly namePlaceholder: string;
	readonly customFieldsDescription: string;
	readonly emptyDescription: string;
	readonly icon: RegistryIcon;
}

export function ControlMethodsPage({
	records,
	mutations,
	canManage,
	canEditMethods,
	title,
	description,
	singularLabel,
	namePlaceholder,
	customFieldsDescription,
	emptyDescription,
	icon: MethodIcon,
}: ControlMethodsPageProps) {
	const search = useCatalogSearch(records.activeRecords, records.inactiveRecords, matchesMethod);

	const dialogProps = {
		mutations,
		singularLabel,
		namePlaceholder,
		customFieldsDescription,
	};

	// The header and the empty state offer the same way in, so they mount the
	// same dialog rather than each spelling out its own trigger.
	const addMethodDialog = (
		<ControlMethodDialog
			{...dialogProps}
			trigger={
				<Button type="button">
					<AddIcon aria-hidden="true" />
					Add Method
				</Button>
			}
		/>
	);

	return (
		<CatalogPage
			action={canManage ? addMethodDialog : undefined}
			canEdit={canEditMethods}
			description={description}
			emptyDescription={
				<>
					{emptyDescription}
					{canManage
						? ' Add your first method to get started.'
						: ' An owner or admin can add methods for you.'}
				</>
			}
			emptyTitle={`No ${singularLabel}s yet`}
			icon={MethodIcon}
			isEmpty={search.total === 0}
			title={title}
		>
			<CatalogFilteredList
				noun="methods"
				search={search}
				searchLabel={`Search ${title.toLowerCase()} by name`}
				searchPlaceholder="Search methods…"
			>
				<ControlMethodSection
					{...dialogProps}
					canEditMethods={canEditMethods}
					canManage={canManage}
					emptyLabel={
						search.query.length > 0
							? `No active ${singularLabel}s match your search.`
							: `No active ${singularLabel}s. Add one to start recording work.`
					}
					rows={search.filteredActive}
					title="Active"
					tone="active"
				/>
				{search.inactiveCount > 0 ? (
					<ControlMethodSection
						{...dialogProps}
						canEditMethods={canEditMethods}
						canManage={canManage}
						emptyLabel={`No inactive ${singularLabel}s match your search.`}
						rows={search.filteredInactive}
						title="Inactive"
						tone="inactive"
					/>
				) : null}
			</CatalogFilteredList>
		</CatalogPage>
	);
}

interface MethodDialogContext {
	readonly mutations: CatalogMutations;
	readonly singularLabel: string;
	readonly namePlaceholder: string;
	readonly customFieldsDescription: string;
}

function ControlMethodSection({
	canEditMethods,
	canManage,
	emptyLabel,
	rows,
	title,
	tone,
	...dialogContext
}: MethodDialogContext & {
	readonly canEditMethods: boolean;
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly rows: readonly ControlMethodRecord[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
}) {
	return (
		<CatalogSection
			columns={
				<TableRow className="bg-muted/40 hover:bg-muted/40">
					<TableHead>Method</TableHead>
					<TableHead className="w-[22%]">Custom Fields</TableHead>
					{canEditMethods ? <CatalogActionsHead /> : null}
				</TableRow>
			}
			count={rows.length}
			emptyLabel={emptyLabel}
			title={title}
		>
			{rows.map((method) => (
				<TableRow key={method.id}>
					<CatalogNameCell isInactive={tone === 'inactive'} name={method.name} />
					<TableCell className="align-top">
						<CustomFieldsCell schema={method.customSchema} />
					</TableCell>
					{canEditMethods ? (
						<TableCell className="align-top text-right">
							<ControlMethodRowActions {...dialogContext} canManage={canManage} method={method} />
						</TableCell>
					) : null}
				</TableRow>
			))}
		</CatalogSection>
	);
}

function ControlMethodRowActions({
	canManage,
	method,
	...dialogContext
}: MethodDialogContext & { readonly canManage: boolean; readonly method: ControlMethodRecord }) {
	const [editOpen, setEditOpen] = useState(false);
	const { mutations } = dialogContext;
	// The retire here issues `deactivate` on its own, so it carries the catalog's
	// own questions rather than the dialog's.
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });

	return (
		<>
			{/*
			 * Deactivate and reactivate are `ADMIN`; the Edit above them is `MANAGER`.
			 * A manager sees the menu with only Edit in it.
			 *
			 * The toggle is never pre-emptively disabled here, unlike collection
			 * methods: control actions sync on demand, so a local "still in use"
			 * count would undercount. The server rejects a deactivation it disallows
			 * and that error is what surfaces.
			 */}
			<CatalogRowActions
				isActive={method.isActive}
				name={method.name}
				onEdit={() => setEditOpen(true)}
				onToggle={
					canManage
						? () =>
								toggleCatalogActive({
									apply: (isActive) =>
										run((acknowledgements) =>
											mutations.setActive(method.id, isActive, acknowledgements),
										),
									isActive: method.isActive,
									name: method.name,
								})
						: undefined
				}
			/>
			<ControlMethodDialog
				{...dialogContext}
				method={method}
				onOpenChange={setEditOpen}
				open={editOpen}
			/>
			{dialog}
		</>
	);
}

function ControlMethodDialog({
	customFieldsDescription,
	method,
	mutations,
	namePlaceholder,
	onOpenChange,
	open: controlledOpen,
	singularLabel,
	trigger,
}: MethodDialogContext & {
	readonly method?: ControlMethodRecord | undefined;
	/** Controlled open handler — pair with `open` when there is no `trigger`. */
	readonly onOpenChange?: ((open: boolean) => void) | undefined;
	readonly open?: boolean | undefined;
	/** Uncontrolled mode: the element that opens the dialog (Add button, empty-state CTA). */
	readonly trigger?: React.ReactNode;
}) {
	const [open, setOpen] = useCatalogDialogOpen(controlledOpen, onOpenChange);
	const isEditing = method !== undefined;
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });

	const form = useAppForm({
		defaultValues: catalogFormValues(method),
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage: isEditing
					? `Unable to save ${method.name}.`
					: `Unable to create ${singularLabel}.`,
				// Closing is inside `run` rather than `onWritten`: `run` resolves on a
				// refusal too, so dismissing on the way past would take the form away
				// before the question could be asked.
				save: () =>
					run(async (acknowledgements) => {
						if (isEditing) {
							await mutations.save(
								method.id,
								catalogFields(value),
								catalogFormRecord(method),
								acknowledgements,
							);
						} else {
							await mutations.create(catalogFields(value));
						}
						setOpen(false);
					}),
			});
		},
	});

	useResetOnOpen(open, method, () => form.reset(catalogFormValues(method)));

	return (
		<>
			<form.AppForm>
				<CatalogRecordDialog
					actions={
						<form.FormActions>
							<form.SubmitButton disabled={!mutations.canWrite} />
							<CatalogDialogCancel />
						</form.FormActions>
					}
					description="Manage the label, lifecycle state, and optional custom fields."
					onOpenChange={setOpen}
					onSubmit={() => void form.handleSubmit()}
					open={open}
					title={isEditing ? `Edit ${method.name}` : `Add ${singularLabel}`}
					trigger={trigger}
				>
					<form.FormErrorAlert />
					<form.AppField
						name="name"
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? 'Method name is required.' : undefined,
						}}
					>
						{(field) => <field.TextField label="Method name" placeholder={namePlaceholder} />}
					</form.AppField>
					<form.AppField name="isActive">
						{(field) => <field.SwitchField label="Active" />}
					</form.AppField>
					<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
						{(field) => (
							<field.JsonSchemaField description={customFieldsDescription} label="Custom fields" />
						)}
					</form.AppField>
				</CatalogRecordDialog>
			</form.AppForm>
			{dialog}
		</>
	);
}

/**
 * The record as the save compares against.
 *
 * `save` decides which commands it means from what moved, so it needs the record
 * in the same vocabulary the form produces — which is what `catalogFields` of the
 * record's own values is.
 */
function catalogFormRecord(method: ControlMethodRecord) {
	return catalogFields(catalogFormValues(method));
}

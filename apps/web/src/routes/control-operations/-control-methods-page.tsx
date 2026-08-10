import type { ControlMethodRow, OrganizationRow } from '@simmer-mosquito/sync';
import { useAppForm, validateJsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Collection } from '@tanstack/react-db';
import { useState } from 'react';
import {
	CatalogActionsHead,
	CatalogDialogCancel,
	CatalogFilteredList,
	CatalogNameCell,
	CatalogPage,
	CatalogRecordDialog,
	CatalogRowActions,
	CatalogSection,
	commitCatalogWrite,
	toggleCatalogLifecycle,
	useCatalogDialogOpen,
	useCatalogSearch,
	useResetOnOpen,
} from '../../components/catalog';
import { CustomFieldsCell } from '../../components/custom-fields-cell';
import { useActiveNamedCollectionRows } from '../../hooks/use-active-named-collection-rows';
import {
	controlMethodFormValues,
	createControlMethodFromValues,
	updateControlMethodFromValues,
} from '../my-organization/-components/helpers';
import type { ControlMethodCollectionKey } from '../my-organization/-components/types';

// Chemical, source reduction, and biocontrol each manage their own method catalog.
// The catalogs are the same shape (name + lifecycle + optional custom fields), so
// the three routes render this page with their own copy and collection key.

const AddIcon = iconRegistry.actions.add.icon;

function matchesMethod(row: ControlMethodRow, query: string): boolean {
	return row.name.toLowerCase().includes(query);
}

export interface ControlMethodsPageProps {
	readonly collectionKey: ControlMethodCollectionKey;
	readonly collection: Collection<ControlMethodRow, string | number>;
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
	readonly organization: OrganizationRow | null;
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
	collectionKey,
	collection,
	canManage,
	canEditMethods,
	organization,
	title,
	description,
	singularLabel,
	namePlaceholder,
	customFieldsDescription,
	emptyDescription,
	icon: MethodIcon,
}: ControlMethodsPageProps) {
	const { activeRows, inactiveRows } = useActiveNamedCollectionRows<ControlMethodRow>(collection);
	const search = useCatalogSearch(activeRows, inactiveRows, matchesMethod);

	const dialogProps = {
		collectionKey,
		organization,
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
						: ' An owner or admin can add methods for your agency.'}
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
	readonly collectionKey: ControlMethodCollectionKey;
	readonly organization: OrganizationRow | null;
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
	readonly rows: readonly ControlMethodRow[];
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
}: MethodDialogContext & { readonly canManage: boolean; readonly method: ControlMethodRow }) {
	const [editOpen, setEditOpen] = useState(false);

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
					canManage ? () => toggleMethodActive(dialogContext.collectionKey, method) : undefined
				}
			/>
			<ControlMethodDialog
				{...dialogContext}
				method={method}
				onOpenChange={setEditOpen}
				open={editOpen}
			/>
		</>
	);
}

function toggleMethodActive(
	collectionKey: ControlMethodCollectionKey,
	method: ControlMethodRow,
): void {
	toggleCatalogLifecycle({
		apply: (isActive) =>
			updateControlMethodFromValues(collectionKey, method, {
				...controlMethodFormValues(method),
				isActive,
			}),
		isActive: method.isActive,
		name: method.name,
	});
}

function ControlMethodDialog({
	collectionKey,
	customFieldsDescription,
	method,
	namePlaceholder,
	onOpenChange,
	open: controlledOpen,
	organization,
	singularLabel,
	trigger,
}: MethodDialogContext & {
	readonly method?: ControlMethodRow | undefined;
	/** Controlled open handler — pair with `open` when there is no `trigger`. */
	readonly onOpenChange?: ((open: boolean) => void) | undefined;
	readonly open?: boolean | undefined;
	/** Uncontrolled mode: the element that opens the dialog (Add button, empty-state CTA). */
	readonly trigger?: React.ReactNode;
}) {
	const [open, setOpen] = useCatalogDialogOpen(controlledOpen, onOpenChange);
	const isEditing = method !== undefined;

	const form = useAppForm({
		defaultValues: controlMethodFormValues(method),
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			commitCatalogWrite({
				failureMessage: isEditing
					? `Unable to save ${method.name}.`
					: `Unable to create ${singularLabel}.`,
				onWritten: () => setOpen(false),
				write: () =>
					isEditing
						? updateControlMethodFromValues(collectionKey, method, value)
						: createControlMethodFromValues(collectionKey, organization, value),
			});
		},
	});

	useResetOnOpen(open, method, () => form.reset(controlMethodFormValues(method)));

	return (
		<form.AppForm>
			<CatalogRecordDialog
				actions={
					<form.FormActions>
						<form.SubmitButton disabled={organization === null} />
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
	);
}

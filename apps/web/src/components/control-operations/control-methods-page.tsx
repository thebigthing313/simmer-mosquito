import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useCatalogSearch } from '../../hooks/catalog/use-catalog-search';
import type { CatalogMutations } from '../../hooks/mutations/catalog-fields';
import type { CatalogRecords, ControlMethodRecord } from '../../hooks/queries/catalog-record-view';
import { CatalogFilteredList, CatalogPage } from '../catalog';
import { ControlMethodDialog } from './control-method-dialog';
import { ControlMethodSection } from './control-method-section';

const AddIcon = iconRegistry.actions.add.icon;

function matchesMethod(row: ControlMethodRecord, query: string): boolean {
	return row.name.toLowerCase().includes(query);
}

export interface ControlMethodsPageProps {
	/** The catalog's two halves; see `hooks/queries/catalog-record-view.ts`. */
	readonly records: CatalogRecords<ControlMethodRecord>;
	/** The catalog's five commands, see `hooks/mutations/use-catalog-mutations.ts`. */
	readonly mutations: CatalogMutations;
	/** Owner/admin: adding a method, and deactivating or reactivating one. */
	readonly canManage: boolean;
	/**
	 * Manager-and-above: renaming a method and editing its custom fields.
	 * `controlOperations.update*Method` is `MANAGER` while `create*`,
	 * `deactivate*`, `reactivate*` and `delete*` are `ADMIN`, so this page needs
	 * both floors.
	 */
	readonly canEditMethods: boolean;
	/** e.g. "Application methods" */
	readonly title: string;
	readonly description?: string | undefined;
	/** e.g. "application method", used in buttons, dialogs, and empty states. */
	readonly singularLabel: string;
	readonly namePlaceholder: string;
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
	emptyDescription,
	icon: MethodIcon,
}: ControlMethodsPageProps) {
	const search = useCatalogSearch(records.activeRecords, records.inactiveRecords, matchesMethod);

	const dialogProps = {
		mutations,
		singularLabel,
		namePlaceholder,
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

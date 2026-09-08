import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { AdminPage } from '../../components/admin-page';
import {
	CatalogBody,
	CatalogDialog,
	type CatalogDialogState,
	CatalogList,
	CatalogRow,
	DeleteRecordButton,
	EditRecordButton,
} from '../../components/catalog';
import { type GenusListing, useGenusRoster } from '../../hooks/queries/use-genus-roster';
import { createGenus, deleteGenus, updateGenus } from '../../lib/collections/writes';
import { EMPTY_GENUS, GenusForm, type GenusFormValues } from './-genus-form';

const GenusIcon = iconRegistry.generic.component.icon;
const AddIcon = iconRegistry.actions.add.icon;

export const Route = createFileRoute('/taxonomy/genera')({
	component: GeneraRoute,
});

async function addGenus(values: GenusFormValues) {
	await createGenus({ name: values.name.trim(), abbreviation: values.abbreviation.trim() });
	toast.success(`${values.name.trim()} added.`);
}

async function saveGenus(genusId: string, values: GenusFormValues) {
	await updateGenus(genusId, {
		name: values.name.trim(),
		abbreviation: values.abbreviation.trim(),
	});
	toast.success(`${values.name.trim()} updated.`);
}

async function removeGenus(genus: GenusListing) {
	try {
		await deleteGenus(genus.id);
		toast.success(`${genus.name} deleted.`);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : 'Unable to delete the genus.');
	}
}

/** `'new'` opens the create dialog; a row opens the same dialog to edit it. */
type GenusDialog = CatalogDialogState<GenusListing>;

/** The fields the filter reads. The query arrives trimmed and lowercased. */
function matchesGenus(genus: GenusListing, query: string): boolean {
	return (
		genus.name.toLowerCase().includes(query) || genus.abbreviation.toLowerCase().includes(query)
	);
}

/**
 * The global genus list.
 *
 * Reads come from `useGenusRoster`, which is where the columns are: it sorts,
 * counts the species per genus in the query pipeline, and hands back rows named
 * for the domain. Writes are optimistic mutations settled through `settleWrite`,
 * so the row is on screen before the round trip and a txid confirmation that
 * arrives late is treated as pending rather than as failure.
 *
 * What is left here is the dialog — the one thing that is genuinely this
 * component's state. The filter belongs to `CatalogBody`, which is handed the
 * rows and the one function naming the fields it reads.
 */
function GeneraRoute() {
	const { genera: all, speciesCountById, isReady } = useGenusRoster();
	const [dialog, setDialog] = useState<GenusDialog>(null);

	return (
		<AdminPage
			actions={
				<Button onClick={() => setDialog('new')} type="button">
					<AddIcon aria-hidden="true" />
					Add Genus
				</Button>
			}
			description="Mosquito genera, shared by everyone. Species are recorded against one, so a genus in use cannot be removed."
			icon={GenusIcon}
			title="Genera"
		>
			<CatalogBody
				empty={
					<ListEmpty
						action={
							<Button onClick={() => setDialog('new')} type="button">
								<AddIcon aria-hidden="true" />
								Add Genus
							</Button>
						}
						description="Species are recorded against a genus, so this list comes first."
						icon={GenusIcon}
						title="No genera yet"
					/>
				}
				isReady={isReady}
				matches={matchesGenus}
				noun="genera"
				rows={all}
			>
				{(genera) => (
					<CatalogList>
						{genera.map((genus) => (
							<GenusListRow
								genus={genus}
								key={genus.id}
								onDelete={() => void removeGenus(genus)}
								onEdit={() => setDialog(genus)}
								speciesCount={speciesCountById.get(genus.id) ?? 0}
							/>
						))}
					</CatalogList>
				)}
			</CatalogBody>

			<CatalogDialog
				createDescription="Added to the global list everyone identifies against."
				createTitle="Add Genus"
				editDescription="Changes apply to everyone using this genus."
				editTitle={(genus) => `Edit ${genus.name}`}
				onClose={() => setDialog(null)}
				state={dialog}
			>
				{({ row, submitLabel }) => (
					<GenusForm
						key={row?.id ?? 'new'}
						onCancel={() => setDialog(null)}
						onSubmit={async (values) => {
							await (row === null ? addGenus(values) : saveGenus(row.id, values));
							setDialog(null);
						}}
						submitLabel={submitLabel}
						values={row === null ? EMPTY_GENUS : { abbreviation: row.abbreviation, name: row.name }}
					/>
				)}
			</CatalogDialog>
		</AdminPage>
	);
}

/** One genus. Split out so the route component stays query, writes, and dialog. */
function GenusListRow({
	genus,
	speciesCount,
	onEdit,
	onDelete,
}: {
	readonly genus: GenusListing;
	readonly speciesCount: number;
	readonly onEdit: () => void;
	readonly onDelete: () => void;
}) {
	return (
		<CatalogRow
			actions={
				<>
					<EditRecordButton label={`Edit ${genus.name}`} onClick={onEdit} />
					<DeleteRecordButton
						consequence={
							speciesCount === 0
								? `${genus.name} is not used by any species and will be removed for everyone.`
								: `${genus.name} has ${speciesCount} ${speciesCount === 1 ? 'species' : 'species entries'} recorded against it. The server will refuse this while they exist.`
						}
						onDelete={onDelete}
						recordLabel={genus.name}
					/>
				</>
			}
			badges={
				<Badge tone={speciesCount === 0 ? 'neutral' : 'info'} variant="outline">
					{speciesCount} species
				</Badge>
			}
			subtitle={genus.abbreviation}
			title={genus.name}
		/>
	);
}

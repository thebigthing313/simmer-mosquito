import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AdminPage } from '../../components/admin-page';
import {
	CatalogBody,
	CatalogDialog,
	type CatalogDialogState,
	CatalogForm,
	CatalogList,
	CatalogRow,
	DeleteRecordButton,
	EditRecordButton,
	useCatalogForm,
} from '../../components/catalog';
import { type GenusListing, useGenusRoster } from '../../hooks/queries/use-genus-roster';
import { createGenus, deleteGenus, updateGenus } from '../../lib/collections/writes';

const GenusIcon = iconRegistry.generic.component.icon;
const AddIcon = iconRegistry.actions.add.icon;

export const Route = createFileRoute('/taxonomy/genera')({
	component: GeneraRoute,
});

interface GenusFormValues {
	readonly abbreviation: string;
	readonly name: string;
}

const EMPTY_GENUS: GenusFormValues = { abbreviation: '', name: '' };

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

/**
 * The global genus list.
 *
 * Reads come from `useGenusRoster`, which is where the columns are: it sorts,
 * counts the species per genus in the query pipeline, and hands back rows named
 * for the domain. Writes are optimistic mutations settled through `settleWrite`,
 * so the row is on screen before the round trip and a txid confirmation that
 * arrives late is treated as pending rather than as failure.
 *
 * What is left here is search and the dialog — the two things that are genuinely
 * this component's state.
 */
function GeneraRoute() {
	const { genera: all, speciesCountById, isReady } = useGenusRoster();
	const [search, setSearch] = useState('');
	const [dialog, setDialog] = useState<GenusDialog>(null);

	const genera = useMemo(() => {
		const query = search.trim().toLowerCase();
		return query === ''
			? all
			: all.filter(
					(genus) =>
						genus.name.toLowerCase().includes(query) ||
						genus.abbreviation.toLowerCase().includes(query),
				);
	}, [all, search]);

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
				noun="genera"
				onSearchChange={setSearch}
				search={search}
				shown={genera.length}
				total={all.length}
			>
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

function GenusForm({
	values,
	submitLabel,
	onCancel,
	onSubmit,
}: {
	readonly values: GenusFormValues;
	readonly submitLabel: string;
	readonly onCancel: () => void;
	readonly onSubmit: (values: GenusFormValues) => Promise<void>;
}) {
	const form = useCatalogForm({ initial: values, onSubmit });
	const { values: draft, setValues } = form;

	return (
		<CatalogForm
			disabled={draft.name.trim() === '' || draft.abbreviation.trim() === ''}
			error={form.error}
			onCancel={onCancel}
			onSubmit={form.submit}
			pending={form.pending}
			submitLabel={submitLabel}
		>
			<Field>
				<FieldLabel htmlFor="genus-name">Name</FieldLabel>
				<Input
					id="genus-name"
					maxLength={120}
					onChange={(event) => setValues({ ...draft, name: event.target.value })}
					placeholder="e.g. Aedes"
					required
					value={draft.name}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="genus-abbreviation">Abbreviation</FieldLabel>
				<Input
					id="genus-abbreviation"
					maxLength={16}
					onChange={(event) => setValues({ ...draft, abbreviation: event.target.value })}
					placeholder="e.g. Ae."
					required
					value={draft.abbreviation}
				/>
			</Field>
		</CatalogForm>
	);
}

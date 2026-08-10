import type { GenusRow, SpeciesRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useLiveQuery } from '@tanstack/react-db';
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
import { adminCollections } from '../../sync/adminCollections';

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

async function createGenus(values: GenusFormValues) {
	const now = new Date().toISOString();
	await settleWrite(
		adminCollections.genera.insert({
			id: crypto.randomUUID(),
			abbreviation: values.abbreviation.trim(),
			name: values.name.trim(),
			createdAt: now,
			updatedAt: now,
		} as GenusRow),
	);
	toast.success(`${values.name.trim()} added.`);
}

async function saveGenus(genusId: string, values: GenusFormValues) {
	await settleWrite(
		adminCollections.genera.update(genusId, (draft) => {
			const writable = draft as { -readonly [K in keyof GenusRow]: GenusRow[K] };
			writable.abbreviation = values.abbreviation.trim();
			writable.name = values.name.trim();
		}),
	);
	toast.success(`${values.name.trim()} updated.`);
}

async function removeGenus(genus: GenusRow) {
	try {
		await settleWrite(adminCollections.genera.delete(genus.id));
		toast.success(`${genus.name} deleted.`);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : 'Unable to delete the genus.');
	}
}

/** `'new'` opens the create dialog; a row opens the same dialog to edit it. */
type GenusDialog = CatalogDialogState<GenusRow>;

/**
 * The global genus list.
 *
 * Reads are live: `useLiveQuery` over the Electric-backed collection, so a
 * change made in another operator's tab lands here without a refresh. Writes are
 * optimistic mutations on the same collection, settled through `settleWrite` —
 * the row is on screen before the round trip, and a txid confirmation that
 * arrives late is treated as pending rather than as failure.
 */
function GeneraRoute() {
	const generaResult = useLiveQuery((query) => query.from({ row: adminCollections.genera }), []);
	const speciesResult = useLiveQuery((query) => query.from({ row: adminCollections.species }), []);
	const [search, setSearch] = useState('');
	const [dialog, setDialog] = useState<GenusDialog>(null);

	/*
	 * How many species hang off each genus. This is the one fact that changes what
	 * an operator can do with a row — a genus in use cannot be deleted — so it
	 * belongs on the row rather than being discovered by trying.
	 */
	const speciesCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const species of (speciesResult.data ?? []) as readonly SpeciesRow[]) {
			if (species.genusId !== null) {
				counts.set(species.genusId, (counts.get(species.genusId) ?? 0) + 1);
			}
		}
		return counts;
	}, [speciesResult.data]);

	const all = useMemo(
		() =>
			[...((generaResult.data ?? []) as readonly GenusRow[])].sort((a, b) =>
				a.name.localeCompare(b.name),
			),
		[generaResult.data],
	);

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
			description="Mosquito genera, shared by every agency. Species are recorded against one, so a genus in use cannot be removed."
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
				isReady={generaResult.isReady}
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
							speciesCount={speciesCounts.get(genus.id) ?? 0}
						/>
					))}
				</CatalogList>
			</CatalogBody>

			<CatalogDialog
				createDescription="Added to the global list every agency identifies against."
				createTitle="Add Genus"
				editDescription="Changes apply to every agency using this genus."
				editTitle={(genus) => `Edit ${genus.name}`}
				onClose={() => setDialog(null)}
				state={dialog}
			>
				{({ row, submitLabel }) => (
					<GenusForm
						key={row?.id ?? 'new'}
						onCancel={() => setDialog(null)}
						onSubmit={async (values) => {
							await (row === null ? createGenus(values) : saveGenus(row.id, values));
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
	readonly genus: GenusRow;
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
								? `${genus.name} is not used by any species and will be removed for every agency.`
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

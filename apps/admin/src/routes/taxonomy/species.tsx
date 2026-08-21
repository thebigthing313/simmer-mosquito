import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
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
import { type SpeciesListing, useSpeciesRoster } from '../../hooks/queries/use-species-roster';
import { createSpecies, deleteSpecies, updateSpecies } from '../../lib/collections/writes';

const SpeciesIcon = iconRegistry.simmer.mosquito.icon;
const AddIcon = iconRegistry.actions.add.icon;

export const Route = createFileRoute('/taxonomy/species')({
	component: SpeciesRoute,
});

/** Non-empty sentinel: a native select cannot carry a null option value. */
const NO_GENUS = 'none';

interface SpeciesFormValues {
	readonly genusId: string;
	readonly epithet: string;
	readonly commonName: string;
	readonly displayName: string;
}

const EMPTY_SPECIES: SpeciesFormValues = {
	genusId: NO_GENUS,
	epithet: '',
	commonName: '',
	displayName: '',
};

/**
 * The binomial the server stores when display name is left blank. Filling it
 * from genus + epithet is what keeps the list readable — "aegypti" alone is
 * ambiguous across genera.
 */
function suggestedDisplayName(
	values: SpeciesFormValues,
	genusById: ReadonlyMap<string, GenusListing>,
): string {
	const epithet = values.epithet.trim();
	if (epithet === '') {
		return '';
	}
	const genus = values.genusId === NO_GENUS ? undefined : genusById.get(values.genusId);
	return genus === undefined ? epithet : `${genus.name} ${epithet}`;
}

/** The form's values as the write seam takes them, with the sentinel resolved. */
function toSpeciesValues(values: SpeciesFormValues, genusById: ReadonlyMap<string, GenusListing>) {
	const commonName = values.commonName.trim();
	return {
		genusId: values.genusId === NO_GENUS ? null : values.genusId,
		epithet: values.epithet.trim(),
		commonName: commonName === '' ? null : commonName,
		displayName: values.displayName.trim() || suggestedDisplayName(values, genusById),
	};
}

async function addSpecies(values: SpeciesFormValues, genusById: ReadonlyMap<string, GenusListing>) {
	const written = toSpeciesValues(values, genusById);
	await createSpecies(written);
	toast.success(`${written.displayName} added.`);
}

async function saveSpecies(
	speciesId: string,
	values: SpeciesFormValues,
	genusById: ReadonlyMap<string, GenusListing>,
) {
	const written = toSpeciesValues(values, genusById);
	await updateSpecies(speciesId, written);
	toast.success(`${written.displayName} updated.`);
}

async function removeSpecies(row: SpeciesListing) {
	try {
		await deleteSpecies(row.id);
		toast.success(`${row.displayName} deleted.`);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : 'Unable to delete the species.');
	}
}

type SpeciesDialog = CatalogDialogState<SpeciesListing>;

function SpeciesRoute() {
	const { genera } = useGenusRoster();
	const { species: all, isReady } = useSpeciesRoster();
	const [search, setSearch] = useState('');
	const [dialog, setDialog] = useState<SpeciesDialog>(null);

	// The one `useMemo` the read seam does not remove: a query returns rows and
	// cannot return a lookup of them. The form needs one to name a genus while the
	// operator is still choosing.
	const genusById = useMemo(() => new Map(genera.map((genus) => [genus.id, genus])), [genera]);

	const species = useMemo(() => {
		const query = search.trim().toLowerCase();
		return query === ''
			? all
			: all.filter(
					(row) =>
						row.displayName.toLowerCase().includes(query) ||
						row.epithet.toLowerCase().includes(query) ||
						(row.commonName ?? '').toLowerCase().includes(query),
				);
	}, [all, search]);

	const canAdd = genera.length > 0;

	return (
		<AdminPage
			actions={
				<Button
					disabled={!canAdd}
					onClick={() => setDialog('new')}
					title={canAdd ? undefined : 'Add a genus first — species are recorded against one.'}
					type="button"
				>
					<AddIcon aria-hidden="true" />
					Add Species
				</Button>
			}
			description="The global species list agencies identify collections and samples against."
			icon={SpeciesIcon}
			title="Species"
		>
			<CatalogBody
				empty={
					/*
					 * Two different empties. With no genera the operator cannot act here at
					 * all, and "add a species" would open a form whose first field has
					 * nothing in it — so that case sends them to the list that comes first.
					 */
					<ListEmpty
						action={
							canAdd ? (
								<Button onClick={() => setDialog('new')} type="button">
									<AddIcon aria-hidden="true" />
									Add Species
								</Button>
							) : (
								<Button asChild variant="outline">
									<Link to="/taxonomy/genera">Go to Genera</Link>
								</Button>
							)
						}
						description={
							canAdd
								? 'Each species belongs to a genus and carries the binomial agencies read.'
								: 'Species are recorded against a genus, and there are none yet.'
						}
						icon={SpeciesIcon}
						title={canAdd ? 'No species yet' : 'Add a genus first'}
					/>
				}
				isReady={isReady}
				noun="species"
				onSearchChange={setSearch}
				search={search}
				shown={species.length}
				total={all.length}
			>
				<CatalogList>
					{species.map((row) => (
						<SpeciesListRow
							genusName={row.genusName ?? ''}
							key={row.id}
							onDelete={() => void removeSpecies(row)}
							onEdit={() => setDialog(row)}
							row={row}
						/>
					))}
				</CatalogList>
			</CatalogBody>

			<CatalogDialog
				createDescription="Added to the global list every agency identifies against."
				createTitle="Add Species"
				editDescription="Changes apply to every agency using this species."
				editTitle={(row) => `Edit ${row.displayName}`}
				onClose={() => setDialog(null)}
				state={dialog}
			>
				{({ row, submitLabel }) => (
					<SpeciesForm
						genera={genera}
						key={row?.id ?? 'new'}
						onCancel={() => setDialog(null)}
						onSubmit={async (values) => {
							await (row === null
								? addSpecies(values, genusById)
								: saveSpecies(row.id, values, genusById));
							setDialog(null);
						}}
						submitLabel={submitLabel}
						suggestDisplayName={(values) => suggestedDisplayName(values, genusById)}
						values={
							row === null
								? EMPTY_SPECIES
								: {
										genusId: row.genusId ?? NO_GENUS,
										epithet: row.epithet,
										commonName: row.commonName ?? '',
										displayName: row.displayName,
									}
						}
					/>
				)}
			</CatalogDialog>
		</AdminPage>
	);
}

/** One species. Split out so the route component stays query, writes, and dialog. */
function SpeciesListRow({
	row,
	genusName,
	onEdit,
	onDelete,
}: {
	readonly row: SpeciesListing;
	readonly genusName: string;
	readonly onEdit: () => void;
	readonly onDelete: () => void;
}) {
	return (
		<CatalogRow
			actions={
				<>
					<EditRecordButton label={`Edit ${row.displayName}`} onClick={onEdit} />
					<DeleteRecordButton
						consequence={`${row.displayName} will be removed for every agency. The server will refuse this while collections or samples reference it.`}
						onDelete={onDelete}
						recordLabel={row.displayName}
					/>
				</>
			}
			badges={
				/*
				 * A species with no genus sorts and reads oddly everywhere downstream,
				 * so it is marked here rather than noticed in an identification screen.
				 */
				row.genusId === null ? (
					<Badge tone="warning" variant="outline">
						No genus
					</Badge>
				) : undefined
			}
			subtitle={[row.commonName, genusName]
				.filter((part) => part !== null && part !== '')
				.join(' · ')}
			title={row.displayName}
		/>
	);
}

function SpeciesForm({
	values,
	genera,
	submitLabel,
	suggestDisplayName,
	onCancel,
	onSubmit,
}: {
	readonly values: SpeciesFormValues;
	readonly genera: readonly GenusListing[];
	readonly submitLabel: string;
	readonly suggestDisplayName: (values: SpeciesFormValues) => string;
	readonly onCancel: () => void;
	readonly onSubmit: (values: SpeciesFormValues) => Promise<void>;
}) {
	const form = useCatalogForm({ initial: values, onSubmit });
	const { values: draft, setValues } = form;
	const suggestion = suggestDisplayName(draft);

	return (
		<CatalogForm
			disabled={draft.epithet.trim() === ''}
			error={form.error}
			onCancel={onCancel}
			onSubmit={form.submit}
			pending={form.pending}
			submitLabel={submitLabel}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="species-genus">Genus</FieldLabel>
					<NativeSelect
						id="species-genus"
						onChange={(event) => setValues({ ...draft, genusId: event.target.value })}
						value={draft.genusId}
					>
						<option value={NO_GENUS}>No genus</option>
						{genera.map((genus) => (
							<option key={genus.id} value={genus.id}>
								{genus.name}
							</option>
						))}
					</NativeSelect>
				</Field>
				<Field>
					<FieldLabel htmlFor="species-epithet">Epithet</FieldLabel>
					<Input
						id="species-epithet"
						maxLength={120}
						onChange={(event) => setValues({ ...draft, epithet: event.target.value })}
						placeholder="e.g. aegypti"
						required
						value={draft.epithet}
					/>
				</Field>
			</div>
			<Field>
				<FieldLabel htmlFor="species-common">Common name</FieldLabel>
				<Input
					id="species-common"
					maxLength={160}
					onChange={(event) => setValues({ ...draft, commonName: event.target.value })}
					placeholder="e.g. Yellow fever mosquito"
					value={draft.commonName}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="species-display">Display name</FieldLabel>
				<Input
					id="species-display"
					maxLength={200}
					onChange={(event) => setValues({ ...draft, displayName: event.target.value })}
					placeholder={suggestion === '' ? 'Genus epithet' : suggestion}
					value={draft.displayName}
				/>
				{/*
				 * Names the binomial that gets stored if this is left blank, so the
				 * default is visible in the form rather than a surprise after saving.
				 */}
				<p className="m-0 text-muted-foreground text-xs">
					{suggestion === ''
						? 'Defaults to the genus and epithet.'
						: `Leave blank to store “${suggestion}”.`}
				</p>
			</Field>
		</CatalogForm>
	);
}

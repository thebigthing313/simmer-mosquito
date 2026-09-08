import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
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
import { type SpeciesListing, useSpeciesRoster } from '../../hooks/queries/use-species-roster';
import { createSpecies, deleteSpecies, updateSpecies } from '../../lib/collections/writes';
import { EMPTY_SPECIES, NO_GENUS, SpeciesForm, type SpeciesFormValues } from './-species-form';

const SpeciesIcon = iconRegistry.simmer.mosquito.icon;
const AddIcon = iconRegistry.actions.add.icon;

export const Route = createFileRoute('/taxonomy/species')({
	component: SpeciesRoute,
});

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

/** The fields the filter reads. The query arrives trimmed and lowercased. */
function matchesSpecies(row: SpeciesListing, query: string): boolean {
	return (
		row.displayName.toLowerCase().includes(query) ||
		row.epithet.toLowerCase().includes(query) ||
		(row.commonName ?? '').toLowerCase().includes(query)
	);
}

function SpeciesRoute() {
	const { genera } = useGenusRoster();
	const { species: all, isReady } = useSpeciesRoster();
	const [dialog, setDialog] = useState<SpeciesDialog>(null);

	// The one `useMemo` the read seam does not remove: a query returns rows and
	// cannot return a lookup of them. The form needs one to name a genus while the
	// operator is still choosing.
	const genusById = useMemo(() => new Map(genera.map((genus) => [genus.id, genus])), [genera]);

	const canAdd = genera.length > 0;

	return (
		<AdminPage
			actions={
				<Button
					disabled={!canAdd}
					onClick={() => setDialog('new')}
					title={canAdd ? undefined : 'Add a genus first. Species are recorded against one.'}
					type="button"
				>
					<AddIcon aria-hidden="true" />
					Add Species
				</Button>
			}
			description="The global species list everyone identifies collections and samples against."
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
								? 'Each species belongs to a genus and carries the binomial crews read.'
								: 'Species are recorded against a genus, and there are none yet.'
						}
						icon={SpeciesIcon}
						title={canAdd ? 'No species yet' : 'Add a genus first'}
					/>
				}
				isReady={isReady}
				matches={matchesSpecies}
				noun="species"
				rows={all}
			>
				{(species) => (
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
				)}
			</CatalogBody>

			<CatalogDialog
				createDescription="Added to the global list everyone identifies against."
				createTitle="Add Species"
				editDescription="Changes apply to everyone using this species."
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
						consequence={`${row.displayName} will be removed for everyone. The server will refuse this while collections or samples reference it.`}
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

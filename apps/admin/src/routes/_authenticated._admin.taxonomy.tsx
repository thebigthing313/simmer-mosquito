import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Collapsible, CollapsibleTrigger } from '@simmer-mosquito/ui-web/components/ui/collapsible';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { InputGroup, InputGroupInput } from '@simmer-mosquito/ui-web/components/ui/input-group';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useMemo, useState } from 'react';
import type {
	AdminGenus,
	AdminSpecies,
	CreateAdminGenusInput,
	CreateAdminSpeciesInput,
	UpdateAdminGenusInput,
	UpdateAdminSpeciesInput,
} from '../api';
import {
	DeleteConfirmDialog,
	EditDialogButton,
	FormActions,
	PageHeading,
	PageShell,
	RecordActions,
	RecordRow,
	StatusMessage,
} from '../components/AdminPrimitives';
import { Panel, ToneBadge } from '../components/Panel';
import { adminCollections } from '../sync/adminCollections';
import { useCollectionRows } from '../sync/useCollectionRows';

export const Route = createFileRoute('/_authenticated/_admin/taxonomy')({
	component: TaxonomyRoute,
});

const SPECIES_PREVIEW_LIMIT = 8;
const UNASSIGNED_GROUP_ID = 'unassigned';

function TaxonomyRoute() {
	const { rows: genera } = useCollectionRows(adminCollections.genera);
	const { rows: species } = useCollectionRows(adminCollections.species);
	const [taxonomyQuery, setTaxonomyQuery] = useState('');
	const [expandedGroupIds, setExpandedGroupIds] = useState<ReadonlySet<string>>(() => new Set());
	const sortedGenera = useMemo(
		() => [...genera].sort((a, b) => a.name.localeCompare(b.name)),
		[genera],
	);
	const sortedSpecies = useMemo(
		() => [...species].sort((a, b) => a.displayName.localeCompare(b.displayName)),
		[species],
	);
	const genusById = useMemo(
		() => new Map(sortedGenera.map((genus) => [genus.id, genus])),
		[sortedGenera],
	);
	const speciesByGenusId = useMemo(() => groupSpeciesByGenus(sortedSpecies), [sortedSpecies]);
	const unassignedSpecies = speciesByGenusId.get(null) ?? [];
	const normalizedTaxonomyQuery = normalizeSearch(taxonomyQuery);
	const taxonomyGroups = useMemo(
		() =>
			buildTaxonomyGroups({
				genera: sortedGenera,
				query: normalizedTaxonomyQuery,
				speciesByGenusId,
				unassignedSpecies,
			}),
		[normalizedTaxonomyQuery, sortedGenera, speciesByGenusId, unassignedSpecies],
	);
	const [genusForm, setGenusForm] = useState<CreateAdminGenusInput>({
		abbreviation: '',
		name: '',
	});
	const [speciesForm, setSpeciesForm] = useState<CreateAdminSpeciesInput>({
		genusId: null,
		epithet: '',
		commonName: '',
		displayName: '',
	});
	const [status, setStatus] = useState('');

	async function submitGenus(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus('Creating genus...');
		try {
			const transaction = adminCollections.genera.insert(toOptimisticGenus(genusForm));
			await transaction.isPersisted.promise;
			setGenusForm({ abbreviation: '', name: '' });
			setStatus('Genus created.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to create genus.');
		}
	}

	async function submitSpecies(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const displayName =
			speciesForm.displayName.trim() || suggestedSpeciesDisplayName(speciesForm, genusById);
		setStatus('Creating species...');
		try {
			const transaction = adminCollections.species.insert(
				toOptimisticSpecies({ ...speciesForm, displayName }),
			);
			await transaction.isPersisted.promise;
			setSpeciesForm({ genusId: null, epithet: '', commonName: '', displayName: '' });
			setStatus('Species created.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to create species.');
		}
	}

	async function updateGenus(genusId: string, changes: UpdateAdminGenusInput) {
		setStatus('Updating genus...');
		try {
			const transaction = adminCollections.genera.update(genusId, (draft) => {
				draft.abbreviation = changes.abbreviation.trim();
				draft.name = changes.name.trim();
			});
			await transaction.isPersisted.promise;
			setStatus('Genus updated.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to update genus.');
			throw error;
		}
	}

	async function deleteGenus(genusId: string) {
		setStatus('Deleting genus...');
		try {
			const transaction = adminCollections.genera.delete(genusId);
			await transaction.isPersisted.promise;
			setStatus('Genus deleted.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to delete genus.');
		}
	}

	async function updateSpecies(speciesId: string, changes: UpdateAdminSpeciesInput) {
		setStatus('Updating species...');
		try {
			const displayName =
				changes.displayName.trim() || suggestedSpeciesDisplayName(changes, genusById);
			const transaction = adminCollections.species.update(speciesId, (draft) => {
				draft.genusId = changes.genusId;
				draft.epithet = changes.epithet.trim();
				draft.commonName = changes.commonName.trim() || null;
				draft.displayName = displayName;
			});
			await transaction.isPersisted.promise;
			setStatus('Species updated.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to update species.');
			throw error;
		}
	}

	async function deleteSpecies(speciesId: string) {
		setStatus('Deleting species...');
		try {
			const transaction = adminCollections.species.delete(speciesId);
			await transaction.isPersisted.promise;
			setStatus('Species deleted.');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : 'Unable to delete species.');
		}
	}

	function toggleTaxonGroup(groupId: string) {
		setExpandedGroupIds((current) => {
			const next = new Set(current);
			if (next.has(groupId)) {
				next.delete(groupId);
			} else {
				next.add(groupId);
			}
			return next;
		});
	}

	return (
		<PageShell className="gap-[18px]">
			<PageHeading
				description="Curate the genus and species hierarchy available across SIMMER."
				eyebrow="Global catalog"
				title="Mosquito taxonomy"
			/>

			<StatusMessage>{status}</StatusMessage>

			<div className="taxonomy-layout">
				<Panel title="Taxonomy hierarchy">
					<div className="taxonomy-hierarchy">
						<div className="taxonomy-browser">
							<div className="taxonomy-summary">
								<div>
									<strong>{sortedGenera.length}</strong>
									<span>genera</span>
								</div>
								<div>
									<strong>{sortedSpecies.length}</strong>
									<span>species</span>
								</div>
								<div>
									<strong>{unassignedSpecies.length}</strong>
									<span>unassigned</span>
								</div>
							</div>
							<div className="taxonomy-discovery">
								<Field className="taxonomy-search">
									<FieldLabel>Find genus or species</FieldLabel>
									<InputGroup>
										<InputGroupInput
											placeholder="Search by genus, epithet, common name, or display name"
											type="search"
											value={taxonomyQuery}
											onChange={(event) => setTaxonomyQuery(event.target.value)}
										/>
									</InputGroup>
								</Field>
								{taxonomyGroups.length === 0 ? null : (
									<ScrollArea className="taxonomy-index-scroll">
										<nav className="taxonomy-index" aria-label="Genus index">
											{taxonomyGroups.map((group) => (
												<Button asChild key={group.id} size="xs" variant="outline">
													<a href={`#${taxonGroupDomId(group.id)}`}>
														<span>{group.shortLabel}</span>
														<strong>{group.filteredSpecies.length}</strong>
													</a>
												</Button>
											))}
										</nav>
									</ScrollArea>
								)}
							</div>
						</div>
						<Separator />
						<ScrollArea className="taxonomy-tree-scroll">
							<div className="taxonomy-tree">
								{taxonomyGroups.length === 0 ? (
									<TaxonEmpty
										description="Try a genus, abbreviation, epithet, common name, or display name."
										title="No matching taxonomy"
									/>
								) : (
									taxonomyGroups.map((group) => (
										<TaxonGroup
											genera={sortedGenera}
											group={group}
											isExpanded={expandedGroupIds.has(group.id)}
											key={group.id}
											onDeleteGenus={deleteGenus}
											onDeleteSpecies={deleteSpecies}
											onToggle={() => toggleTaxonGroup(group.id)}
											onUpdateGenus={updateGenus}
											onUpdateSpecies={updateSpecies}
										/>
									))
								)}
							</div>
						</ScrollArea>
					</div>
				</Panel>

				<div className="taxonomy-tools">
					<Panel title="Add genus">
						<form className="grid gap-4 border-t pt-4" onSubmit={submitGenus}>
							<FieldGroup>
								<Field>
									<FieldLabel>Genus name</FieldLabel>
									<Input
										required
										value={genusForm.name}
										onChange={(event) => setGenusForm({ ...genusForm, name: event.target.value })}
									/>
								</Field>
								<Field>
									<FieldLabel>Abbreviation</FieldLabel>
									<Input
										required
										value={genusForm.abbreviation}
										onChange={(event) =>
											setGenusForm({ ...genusForm, abbreviation: event.target.value })
										}
									/>
								</Field>
							</FieldGroup>
							<FormActions>
								<Button type="submit">Add genus</Button>
							</FormActions>
						</form>
					</Panel>

					<Panel title="Add species">
						<form className="grid gap-4 border-t pt-4" onSubmit={submitSpecies}>
							<FieldGroup>
								<Field>
									<FieldLabel>Genus</FieldLabel>
									<NativeSelect
										value={speciesForm.genusId ?? ''}
										onChange={(event) =>
											setSpeciesForm({
												...speciesForm,
												genusId: event.target.value === '' ? null : event.target.value,
											})
										}
									>
										<option value="">Special or unassigned</option>
										{sortedGenera.map((genus) => (
											<option key={genus.id} value={genus.id}>
												{genus.name}
											</option>
										))}
									</NativeSelect>
								</Field>
								<Field>
									<FieldLabel>Epithet</FieldLabel>
									<Input
										required
										value={speciesForm.epithet}
										onChange={(event) =>
											setSpeciesForm({ ...speciesForm, epithet: event.target.value })
										}
									/>
								</Field>
								<Field>
									<FieldLabel>Common name</FieldLabel>
									<Input
										value={speciesForm.commonName}
										onChange={(event) =>
											setSpeciesForm({ ...speciesForm, commonName: event.target.value })
										}
									/>
								</Field>
								<Field>
									<FieldLabel>Display name</FieldLabel>
									<Input
										placeholder={suggestedSpeciesDisplayName(speciesForm, genusById)}
										value={speciesForm.displayName}
										onChange={(event) =>
											setSpeciesForm({ ...speciesForm, displayName: event.target.value })
										}
									/>
								</Field>
							</FieldGroup>
							<FormActions>
								<Button type="submit">Add species</Button>
							</FormActions>
						</form>
					</Panel>
				</div>
			</div>
		</PageShell>
	);
}

function TaxonGroup({
	genera,
	group,
	isExpanded,
	onDeleteGenus,
	onDeleteSpecies,
	onToggle,
	onUpdateGenus,
	onUpdateSpecies,
}: {
	readonly genera: readonly AdminGenus[];
	readonly group: TaxonomyGroup;
	readonly isExpanded: boolean;
	readonly onDeleteGenus: (genusId: string) => Promise<void>;
	readonly onDeleteSpecies: (speciesId: string) => Promise<void>;
	readonly onToggle: () => void;
	readonly onUpdateGenus: (genusId: string, changes: UpdateAdminGenusInput) => Promise<void>;
	readonly onUpdateSpecies: (speciesId: string, changes: UpdateAdminSpeciesInput) => Promise<void>;
}) {
	const hasOverflow = group.filteredSpecies.length > SPECIES_PREVIEW_LIMIT;
	const genus = group.genus;
	const visibleSpecies = isExpanded
		? group.filteredSpecies
		: group.filteredSpecies.slice(0, SPECIES_PREVIEW_LIMIT);
	const hiddenCount = group.filteredSpecies.length - visibleSpecies.length;

	return (
		<Collapsible asChild id={taxonGroupDomId(group.id)} onOpenChange={onToggle} open={isExpanded}>
			<article className="taxon-group">
				<header className="taxon-group-header">
					<div>
						<h2>{group.title}</h2>
						<p className={group.genus === null ? undefined : 'code-text'}>{group.subtitle}</p>
					</div>
					<RecordActions>
						<ToneBadge tone={group.tone}>{group.totalSpecies} species</ToneBadge>
						{genus === null ? null : (
							<>
								<EditGenusDialog
									genus={genus}
									onSubmit={(changes) => onUpdateGenus(genus.id, changes)}
								/>
								<DeleteGenusDialog genus={genus} onDelete={() => onDeleteGenus(genus.id)} />
							</>
						)}
					</RecordActions>
				</header>
				<SpeciesList
					genera={genera}
					onDeleteSpecies={onDeleteSpecies}
					onUpdateSpecies={onUpdateSpecies}
					species={visibleSpecies}
				/>
				{hasOverflow ? (
					<CollapsibleTrigger asChild>
						<Button className="justify-self-start" size="sm" type="button" variant="outline">
							{isExpanded ? 'Show fewer species' : `Show ${hiddenCount} more species`}
						</Button>
					</CollapsibleTrigger>
				) : null}
			</article>
		</Collapsible>
	);
}

function SpeciesList({
	genera,
	onDeleteSpecies,
	onUpdateSpecies,
	species,
}: {
	readonly genera: readonly AdminGenus[];
	readonly onDeleteSpecies: (speciesId: string) => Promise<void>;
	readonly onUpdateSpecies: (speciesId: string, changes: UpdateAdminSpeciesInput) => Promise<void>;
	readonly species: readonly AdminSpecies[];
}) {
	if (species.length === 0) {
		return <TaxonEmpty title="No species assigned yet" />;
	}

	return (
		<div className="taxon-species-list">
			{species.map((row) => (
				<RecordRow
					className="border-[color-mix(in_oklch,var(--catalog)_12%,var(--border))] bg-[color-mix(in_oklch,var(--catalog)_4%,var(--surface-muted))]"
					key={row.id}
				>
					<div>
						<h3>{row.displayName}</h3>
						<p>{row.commonName ?? 'No common name'}</p>
					</div>
					<RecordActions>
						<span className="code-text rounded-full bg-card px-2 py-0.5 font-bold text-[var(--catalog)]">
							{row.epithet}
						</span>
						<EditSpeciesDialog
							genera={genera}
							onSubmit={(changes) => onUpdateSpecies(row.id, changes)}
							species={row}
						/>
						<DeleteSpeciesDialog onDelete={() => onDeleteSpecies(row.id)} species={row} />
					</RecordActions>
				</RecordRow>
			))}
		</div>
	);
}

function TaxonEmpty({
	description,
	title,
}: {
	readonly description?: string;
	readonly title: string;
}) {
	return (
		<Empty className="taxon-empty">
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				{description === undefined ? null : <EmptyDescription>{description}</EmptyDescription>}
			</EmptyHeader>
		</Empty>
	);
}

function GenusFields({
	form,
	onChange,
}: {
	readonly form: CreateAdminGenusInput;
	readonly onChange: (form: CreateAdminGenusInput) => void;
}) {
	return (
		<FieldGroup>
			<Field>
				<FieldLabel>Genus name</FieldLabel>
				<Input
					required
					value={form.name}
					onChange={(event) => onChange({ ...form, name: event.target.value })}
				/>
			</Field>
			<Field>
				<FieldLabel>Abbreviation</FieldLabel>
				<Input
					required
					value={form.abbreviation}
					onChange={(event) => onChange({ ...form, abbreviation: event.target.value })}
				/>
			</Field>
		</FieldGroup>
	);
}

function SpeciesFields({
	form,
	genera,
	genusById,
	onChange,
}: {
	readonly form: CreateAdminSpeciesInput;
	readonly genera: readonly AdminGenus[];
	readonly genusById: ReadonlyMap<string, AdminGenus>;
	readonly onChange: (form: CreateAdminSpeciesInput) => void;
}) {
	return (
		<FieldGroup>
			<Field>
				<FieldLabel>Genus</FieldLabel>
				<NativeSelect
					value={form.genusId ?? ''}
					onChange={(event) =>
						onChange({
							...form,
							genusId: event.target.value === '' ? null : event.target.value,
						})
					}
				>
					<option value="">Special or unassigned</option>
					{genera.map((genus) => (
						<option key={genus.id} value={genus.id}>
							{genus.name}
						</option>
					))}
				</NativeSelect>
			</Field>
			<Field>
				<FieldLabel>Epithet</FieldLabel>
				<Input
					required
					value={form.epithet}
					onChange={(event) => onChange({ ...form, epithet: event.target.value })}
				/>
			</Field>
			<Field>
				<FieldLabel>Common name</FieldLabel>
				<Input
					value={form.commonName}
					onChange={(event) => onChange({ ...form, commonName: event.target.value })}
				/>
			</Field>
			<Field>
				<FieldLabel>Display name</FieldLabel>
				<Input
					placeholder={suggestedSpeciesDisplayName(form, genusById)}
					value={form.displayName}
					onChange={(event) => onChange({ ...form, displayName: event.target.value })}
				/>
			</Field>
		</FieldGroup>
	);
}

function EditGenusDialog({
	genus,
	onSubmit,
}: {
	readonly genus: AdminGenus;
	readonly onSubmit: (changes: UpdateAdminGenusInput) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState<UpdateAdminGenusInput>(() => genusToForm(genus));

	async function submitEdit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await onSubmit(form);
		setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<EditDialogButton onClick={() => setForm(genusToForm(genus))} />
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit genus</DialogTitle>
					<DialogDescription>Update the global genus label and abbreviation.</DialogDescription>
				</DialogHeader>
				<form className="dialog-form" onSubmit={submitEdit}>
					<GenusFields form={form} onChange={setForm} />
					<DialogFooter>
						<Button type="submit">Save genus</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteGenusDialog({
	genus,
	onDelete,
}: {
	readonly genus: AdminGenus;
	readonly onDelete: () => Promise<void>;
}) {
	return (
		<DeleteConfirmDialog
			actionLabel="Delete genus"
			description="This removes the genus from the global taxonomy. The server will block deletion if any species still reference it."
			onDelete={onDelete}
			title={`Delete ${genus.name}?`}
		/>
	);
}

function EditSpeciesDialog({
	genera,
	onSubmit,
	species,
}: {
	readonly genera: readonly AdminGenus[];
	readonly onSubmit: (changes: UpdateAdminSpeciesInput) => Promise<void>;
	readonly species: AdminSpecies;
}) {
	const [open, setOpen] = useState(false);
	const [form, setForm] = useState<UpdateAdminSpeciesInput>(() => speciesToForm(species));
	const genusById = useMemo(() => new Map(genera.map((genus) => [genus.id, genus])), [genera]);

	async function submitEdit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await onSubmit(form);
		setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<EditDialogButton onClick={() => setForm(speciesToForm(species))} />
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit species</DialogTitle>
					<DialogDescription>Update the global species catalog entry.</DialogDescription>
				</DialogHeader>
				<form className="dialog-form" onSubmit={submitEdit}>
					<SpeciesFields form={form} genera={genera} genusById={genusById} onChange={setForm} />
					<DialogFooter>
						<Button type="submit">Save species</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteSpeciesDialog({
	onDelete,
	species,
}: {
	readonly onDelete: () => Promise<void>;
	readonly species: AdminSpecies;
}) {
	return (
		<DeleteConfirmDialog
			actionLabel="Delete species"
			description="This removes the species from the global taxonomy. The server will block deletion if surveillance or organization records still reference it."
			onDelete={onDelete}
			title={`Delete ${species.displayName}?`}
		/>
	);
}

function genusToForm(genus: AdminGenus): UpdateAdminGenusInput {
	return {
		abbreviation: genus.abbreviation,
		name: genus.name,
	};
}

function speciesToForm(species: AdminSpecies): UpdateAdminSpeciesInput {
	return {
		genusId: species.genusId,
		epithet: species.epithet,
		commonName: species.commonName ?? '',
		displayName: species.displayName,
	};
}

function groupSpeciesByGenus(
	species: readonly AdminSpecies[],
): ReadonlyMap<AdminSpecies['genusId'], readonly AdminSpecies[]> {
	const groups = new Map<AdminSpecies['genusId'], AdminSpecies[]>();
	for (const row of species) {
		const group = groups.get(row.genusId) ?? [];
		group.push(row);
		groups.set(row.genusId, group);
	}
	return groups;
}

interface TaxonomyGroup {
	readonly id: string;
	readonly genus: AdminGenus | null;
	readonly title: string;
	readonly subtitle: string;
	readonly shortLabel: string;
	readonly tone: 'catalog' | 'warning';
	readonly totalSpecies: number;
	readonly filteredSpecies: readonly AdminSpecies[];
}

function buildTaxonomyGroups({
	genera,
	query,
	speciesByGenusId,
	unassignedSpecies,
}: {
	readonly genera: readonly AdminGenus[];
	readonly query: string;
	readonly speciesByGenusId: ReadonlyMap<AdminSpecies['genusId'], readonly AdminSpecies[]>;
	readonly unassignedSpecies: readonly AdminSpecies[];
}): readonly TaxonomyGroup[] {
	const groups: TaxonomyGroup[] = [];

	for (const genus of genera) {
		const genusSpecies = speciesByGenusId.get(genus.id) ?? [];
		const genusMatches = matchesGenus(genus, query);
		const filteredSpecies =
			query === '' || genusMatches
				? genusSpecies
				: genusSpecies.filter((row) => matchesSpecies(row, query));
		if (filteredSpecies.length === 0 && !genusMatches) {
			continue;
		}

		groups.push({
			id: genus.id,
			genus,
			title: genus.name,
			subtitle: genus.abbreviation,
			shortLabel: genus.abbreviation,
			tone: 'catalog',
			totalSpecies: genusSpecies.length,
			filteredSpecies,
		});
	}

	const filteredUnassignedSpecies =
		query === ''
			? unassignedSpecies
			: unassignedSpecies.filter((row) => matchesSpecies(row, query));
	if (filteredUnassignedSpecies.length > 0) {
		groups.push({
			id: UNASSIGNED_GROUP_ID,
			genus: null,
			title: 'Unassigned species',
			subtitle: 'Species without a genus relationship.',
			shortLabel: 'Unassigned',
			tone: 'warning',
			totalSpecies: unassignedSpecies.length,
			filteredSpecies: filteredUnassignedSpecies,
		});
	}

	return groups;
}

function matchesGenus(genus: AdminGenus, query: string): boolean {
	if (query === '') {
		return false;
	}
	return normalizeSearch(`${genus.name} ${genus.abbreviation}`).includes(query);
}

function matchesSpecies(species: AdminSpecies, query: string): boolean {
	if (query === '') {
		return true;
	}
	return normalizeSearch(
		`${species.displayName} ${species.epithet} ${species.commonName ?? ''}`,
	).includes(query);
}

function normalizeSearch(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function taxonGroupDomId(groupId: string): string {
	return `taxon-${groupId}`;
}

function suggestedSpeciesDisplayName(
	form: CreateAdminSpeciesInput,
	genusById: ReadonlyMap<string, { readonly name: string }>,
): string {
	const epithet = form.epithet.trim();
	if (epithet === '') {
		return '';
	}
	const genus = form.genusId === null ? null : genusById.get(form.genusId);
	return genus === undefined || genus === null ? epithet : `${genus.name} ${epithet}`;
}

function toOptimisticGenus(form: CreateAdminGenusInput) {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		abbreviation: form.abbreviation.trim(),
		name: form.name.trim(),
		createdAt: now,
		updatedAt: now,
	};
}

function toOptimisticSpecies(form: CreateAdminSpeciesInput) {
	const now = new Date().toISOString();
	const commonName = form.commonName.trim();
	return {
		id: crypto.randomUUID(),
		genusId: form.genusId,
		epithet: form.epithet.trim(),
		commonName: commonName === '' ? null : commonName,
		displayName: form.displayName.trim(),
		createdAt: now,
		updatedAt: now,
	};
}

import { createRoute } from '@tanstack/react-router';
import { type FormEvent, useMemo, useState } from 'react';
import type { AdminSpecies, CreateAdminGenusInput, CreateAdminSpeciesInput } from '../../api';
import { Panel } from '../../components/Panel';
import { adminCollections } from '../../sync/adminCollections';
import { useCollectionRows } from '../../sync/useCollectionRows';
import { adminLayoutRoute } from './_admin';

export const taxonomyRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/taxonomy',
	component: TaxonomyRoute,
});

function TaxonomyRoute() {
	const { rows: genera } = useCollectionRows(adminCollections.genera);
	const { rows: species } = useCollectionRows(adminCollections.species);
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

	return (
		<section className="shell wide management-page">
			<header className="page-heading">
				<div>
					<p className="eyebrow">Global catalog</p>
					<h1>Mosquito taxonomy</h1>
					<p>Curate the genus and species hierarchy available across SIMMER.</p>
				</div>
			</header>

			{status === '' ? null : <p className="status">{status}</p>}

			<div className="taxonomy-layout">
				<Panel title="Taxonomy hierarchy">
					<div className="taxonomy-tree">
						{sortedGenera.map((genus) => (
							<article className="taxon-group" key={genus.id}>
								<header className="taxon-group-header">
									<div>
										<h2>{genus.name}</h2>
										<p className="code-text">{genus.abbreviation}</p>
									</div>
									<span className="badge catalog">
										{speciesByGenusId.get(genus.id)?.length ?? 0} species
									</span>
								</header>
								<SpeciesList species={speciesByGenusId.get(genus.id) ?? []} />
							</article>
						))}

						{unassignedSpecies.length === 0 ? null : (
							<article className="taxon-group">
								<header className="taxon-group-header">
									<div>
										<h2>Unassigned species</h2>
										<p>Species without a genus relationship.</p>
									</div>
									<span className="badge warning">{unassignedSpecies.length} species</span>
								</header>
								<SpeciesList species={unassignedSpecies} />
							</article>
						)}
					</div>
				</Panel>

				<div className="taxonomy-tools">
					<Panel title="Add genus">
						<form className="form-grid compact" onSubmit={submitGenus}>
							<label>
								Genus name
								<input
									required
									value={genusForm.name}
									onChange={(event) => setGenusForm({ ...genusForm, name: event.target.value })}
								/>
							</label>
							<label>
								Abbreviation
								<input
									required
									value={genusForm.abbreviation}
									onChange={(event) =>
										setGenusForm({ ...genusForm, abbreviation: event.target.value })
									}
								/>
							</label>
							<div className="form-actions full">
								<button className="button" type="submit">
									Add genus
								</button>
							</div>
						</form>
					</Panel>

					<Panel title="Add species">
						<form className="form-grid compact" onSubmit={submitSpecies}>
							<label>
								Genus
								<select
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
								</select>
							</label>
							<label>
								Epithet
								<input
									required
									value={speciesForm.epithet}
									onChange={(event) =>
										setSpeciesForm({ ...speciesForm, epithet: event.target.value })
									}
								/>
							</label>
							<label>
								Common name
								<input
									value={speciesForm.commonName}
									onChange={(event) =>
										setSpeciesForm({ ...speciesForm, commonName: event.target.value })
									}
								/>
							</label>
							<label>
								Display name
								<input
									placeholder={suggestedSpeciesDisplayName(speciesForm, genusById)}
									value={speciesForm.displayName}
									onChange={(event) =>
										setSpeciesForm({ ...speciesForm, displayName: event.target.value })
									}
								/>
							</label>
							<div className="form-actions full">
								<button className="button" type="submit">
									Add species
								</button>
							</div>
						</form>
					</Panel>
				</div>
			</div>
		</section>
	);
}

function SpeciesList({ species }: { readonly species: readonly AdminSpecies[] }) {
	if (species.length === 0) {
		return <p className="taxon-empty">No species assigned yet.</p>;
	}

	return (
		<div className="taxon-species-list">
			{species.map((row) => (
				<article className="taxon-species" key={row.id}>
					<div>
						<h3>{row.displayName}</h3>
						<p>{row.commonName ?? 'No common name'}</p>
					</div>
					<span className="code-text">{row.epithet}</span>
				</article>
			))}
		</div>
	);
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

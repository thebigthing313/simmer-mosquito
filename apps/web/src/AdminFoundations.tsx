import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
	type AdminFoundations,
	type AdminLookup,
	type AdminLookupKind,
	type AdminTrap,
	createAddressForOrganization,
	createAdminGenus,
	createAdminSpecies,
	createLookupForOrganization,
	createRegionFolderForOrganization,
	createRegionForOrganization,
	createTrapForOrganization,
	enableSpeciesForOrganization,
	loadAdminFoundations,
} from './auth';

const defaultPoint = '{ "type": "Point", "coordinates": [-90.0, 35.0] }';
const defaultPolygon =
	'{ "type": "Polygon", "coordinates": [[[-90.0, 35.0], [-89.9, 35.0], [-89.9, 35.1], [-90.0, 35.1], [-90.0, 35.0]]] }';

export function AdminFoundationsPanel({
	organizationId,
	serverUrl,
}: {
	readonly organizationId: string;
	readonly serverUrl: string;
}) {
	const [data, setData] = useState<AdminFoundations | null>(null);
	const [status, setStatus] = useState('Loading foundations...');
	const [addressForm, setAddressForm] = useState({
		displayName: '',
		country: 'US',
		addressLine1: '',
		addressLine2: '',
		locality: '',
		region: '',
		postalCode: '',
		geojsonText: defaultPoint,
	});
	const [folderForm, setFolderForm] = useState({
		name: '',
		description: '',
	});
	const [regionForm, setRegionForm] = useState({
		name: '',
		regionFolderId: '',
		description: '',
		metadataText: '{}',
		geojsonText: defaultPolygon,
	});
	const [genusForm, setGenusForm] = useState({ abbreviation: '', name: '' });
	const [speciesForm, setSpeciesForm] = useState({
		genusId: '',
		epithet: '',
		commonName: '',
		displayName: '',
	});
	const [orgSpeciesForm, setOrgSpeciesForm] = useState({
		speciesId: '',
	});
	const [lookupForm, setLookupForm] = useState({
		kind: 'collection_methods' as AdminLookupKind,
		name: '',
		description: '',
		customSchemaText: '{}',
		actionThresholdText: '',
		isActive: true,
	});
	const [trapForm, setTrapForm] = useState({
		collectionMethodId: '',
		addressId: '',
		collectionLureId: '',
		trapName: '',
		trapCode: '',
		description: '',
		isActive: true,
		geojsonText: defaultPoint,
	});

	useEffect(() => {
		let cancelled = false;

		loadAdminFoundations(organizationId, serverUrl)
			.then((result) => {
				if (!cancelled) {
					setData(result);
					setStatus('');
				}
			})
			.catch((loadError: unknown) => {
				if (!cancelled) {
					setStatus(loadError instanceof Error ? loadError.message : 'Unable to load foundations.');
				}
			});

		return () => {
			cancelled = true;
		};
	}, [organizationId, serverUrl]);

	const speciesById = useMemo(() => {
		const map = new Map<string, string>();
		for (const item of data?.species ?? []) {
			map.set(item.id, item.displayName);
		}
		return map;
	}, [data?.species]);

	const collectionMethodById = useMemo(
		() => lookupMap(data?.lookups.collectionMethods),
		[data?.lookups.collectionMethods],
	);
	const collectionLureById = useMemo(
		() => lookupMap(data?.lookups.collectionLures),
		[data?.lookups.collectionLures],
	);
	const addressById = useMemo(() => {
		const map = new Map<string, string>();
		for (const item of data?.addresses ?? []) {
			map.set(item.id, item.displayName);
		}
		return map;
	}, [data?.addresses]);

	async function submitAddress(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Creating address...', async () => {
			const geojson = parseJson(addressForm.geojsonText);
			const address = await createAddressForOrganization(
				organizationId,
				{
					...addressForm,
					geojson,
				},
				serverUrl,
			);
			setData((current) =>
				current === null ? current : { ...current, addresses: [address, ...current.addresses] },
			);
			setAddressForm({ ...addressForm, displayName: '', addressLine1: '' });
		});
	}

	async function submitFolder(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Creating folder...', async () => {
			const folder = await createRegionFolderForOrganization(organizationId, folderForm, serverUrl);
			setData((current) =>
				current === null
					? current
					: { ...current, regionFolders: [...current.regionFolders, folder] },
			);
			setFolderForm({ name: '', description: '' });
		});
	}

	async function submitRegion(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Creating region...', async () => {
			const region = await createRegionForOrganization(
				organizationId,
				{
					name: regionForm.name,
					regionFolderId: regionForm.regionFolderId,
					description: regionForm.description,
					metadata: parseJson(regionForm.metadataText),
					geojson: parseJson(regionForm.geojsonText),
				},
				serverUrl,
			);
			setData((current) =>
				current === null ? current : { ...current, regions: [...current.regions, region] },
			);
			setRegionForm({ ...regionForm, name: '', description: '', metadataText: '{}' });
		});
	}

	async function submitGenus(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Creating genus...', async () => {
			const genus = await createAdminGenus(genusForm, serverUrl);
			setData((current) =>
				current === null ? current : { ...current, genera: [...current.genera, genus] },
			);
			setGenusForm({ abbreviation: '', name: '' });
		});
	}

	async function submitSpecies(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Creating species...', async () => {
			const species = await createAdminSpecies(speciesForm, serverUrl);
			setData((current) =>
				current === null ? current : { ...current, species: [...current.species, species] },
			);
			setSpeciesForm({
				genusId: '',
				epithet: '',
				commonName: '',
				displayName: '',
			});
		});
	}

	async function submitOrgSpecies(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Enabling species...', async () => {
			const row = await enableSpeciesForOrganization(organizationId, orgSpeciesForm, serverUrl);
			setData((current) =>
				current === null
					? current
					: {
							...current,
							organizationSpecies: [
								row,
								...current.organizationSpecies.filter((item) => item.id !== row.id),
							],
						},
			);
			setOrgSpeciesForm({
				speciesId: '',
			});
		});
	}

	async function submitLookup(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Creating lookup...', async () => {
			const lookup = await createLookupForOrganization(
				organizationId,
				lookupForm.kind,
				{
					...lookupForm,
					customSchema: parseJson(lookupForm.customSchemaText),
					actionThreshold:
						lookupForm.kind === 'collection_methods'
							? parseOptionalNonnegativeInteger(lookupForm.actionThresholdText)
							: null,
				},
				serverUrl,
			);
			setData((current) => addLookup(current, lookupForm.kind, lookup));
			setLookupForm({
				kind: lookupForm.kind,
				name: '',
				description: '',
				customSchemaText: '{}',
				actionThresholdText: '',
				isActive: true,
			});
		});
	}

	async function submitTrap(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await runCreate('Creating trap...', async () => {
			const trap = await createTrapForOrganization(
				organizationId,
				{
					...trapForm,
					geojson: parseJson(trapForm.geojsonText),
				},
				serverUrl,
			);
			setData((current) =>
				current === null ? current : { ...current, traps: [trap, ...current.traps] },
			);
			setTrapForm({
				...trapForm,
				trapName: '',
				trapCode: '',
				description: '',
			});
		});
	}

	async function runCreate(message: string, create: () => Promise<void>) {
		setStatus(message);
		try {
			await create();
			setStatus('Saved.');
		} catch (createError) {
			setStatus(createError instanceof Error ? createError.message : 'Unable to save.');
		}
	}

	return (
		<section className="foundation-surface">
			<div className="section-heading">
				<h3>Foundation verification</h3>
				{status === '' ? null : <p>{status}</p>}
			</div>

			<div className="foundation-grid">
				<form className="admin-form foundation-form" onSubmit={submitAddress}>
					<h4>Addresses</h4>
					<label>
						Display name
						<input
							required
							value={addressForm.displayName}
							onChange={(event) =>
								setAddressForm({ ...addressForm, displayName: event.target.value })
							}
						/>
					</label>
					<label>
						Country
						<input
							required
							maxLength={2}
							value={addressForm.country}
							onChange={(event) => setAddressForm({ ...addressForm, country: event.target.value })}
						/>
					</label>
					<label>
						Line 1
						<input
							value={addressForm.addressLine1}
							onChange={(event) =>
								setAddressForm({ ...addressForm, addressLine1: event.target.value })
							}
						/>
					</label>
					<label>
						Locality
						<input
							value={addressForm.locality}
							onChange={(event) => setAddressForm({ ...addressForm, locality: event.target.value })}
						/>
					</label>
					<label>
						Region
						<input
							value={addressForm.region}
							onChange={(event) => setAddressForm({ ...addressForm, region: event.target.value })}
						/>
					</label>
					<label>
						Postal
						<input
							value={addressForm.postalCode}
							onChange={(event) =>
								setAddressForm({ ...addressForm, postalCode: event.target.value })
							}
						/>
					</label>
					<label className="full">
						GeoJSON
						<textarea
							required
							rows={4}
							value={addressForm.geojsonText}
							onChange={(event) =>
								setAddressForm({ ...addressForm, geojsonText: event.target.value })
							}
						/>
					</label>
					<button className="button" type="submit">
						Create address
					</button>
					<CompactList
						items={data?.addresses.map((item) => `${item.displayName} · ${item.country}`)}
					/>
				</form>

				<form className="admin-form foundation-form" onSubmit={submitFolder}>
					<h4>Region folders</h4>
					<label>
						Name
						<input
							required
							value={folderForm.name}
							onChange={(event) => setFolderForm({ ...folderForm, name: event.target.value })}
						/>
					</label>
					<label className="full">
						Description
						<textarea
							rows={3}
							value={folderForm.description}
							onChange={(event) =>
								setFolderForm({ ...folderForm, description: event.target.value })
							}
						/>
					</label>
					<button className="button" type="submit">
						Create folder
					</button>
					<CompactList items={data?.regionFolders.map((item) => item.name)} />
				</form>

				<form className="admin-form foundation-form" onSubmit={submitRegion}>
					<h4>Regions</h4>
					<label>
						Name
						<input
							required
							value={regionForm.name}
							onChange={(event) => setRegionForm({ ...regionForm, name: event.target.value })}
						/>
					</label>
					<label>
						Folder
						<select
							value={regionForm.regionFolderId}
							onChange={(event) =>
								setRegionForm({ ...regionForm, regionFolderId: event.target.value })
							}
						>
							<option value="">none</option>
							{data?.regionFolders.map((folder) => (
								<option key={folder.id} value={folder.id}>
									{folder.name}
								</option>
							))}
						</select>
					</label>
					<label className="full">
						Description
						<textarea
							rows={2}
							value={regionForm.description}
							onChange={(event) =>
								setRegionForm({ ...regionForm, description: event.target.value })
							}
						/>
					</label>
					<label className="full">
						Metadata
						<textarea
							rows={3}
							value={regionForm.metadataText}
							onChange={(event) =>
								setRegionForm({ ...regionForm, metadataText: event.target.value })
							}
						/>
					</label>
					<label className="full">
						GeoJSON
						<textarea
							required
							rows={5}
							value={regionForm.geojsonText}
							onChange={(event) =>
								setRegionForm({ ...regionForm, geojsonText: event.target.value })
							}
						/>
					</label>
					<button className="button" type="submit">
						Create region
					</button>
					<CompactList items={data?.regions.map((item) => item.name)} />
				</form>

				<form className="admin-form foundation-form" onSubmit={submitGenus}>
					<h4>Genera</h4>
					<label>
						Abbreviation
						<input
							required
							value={genusForm.abbreviation}
							onChange={(event) => setGenusForm({ ...genusForm, abbreviation: event.target.value })}
						/>
					</label>
					<label>
						Name
						<input
							required
							value={genusForm.name}
							onChange={(event) => setGenusForm({ ...genusForm, name: event.target.value })}
						/>
					</label>
					<button className="button" type="submit">
						Create genus
					</button>
					<CompactList items={data?.genera.map((item) => `${item.abbreviation} · ${item.name}`)} />
				</form>

				<form className="admin-form foundation-form" onSubmit={submitSpecies}>
					<h4>Species</h4>
					<label>
						Genus
						<select
							value={speciesForm.genusId}
							onChange={(event) => setSpeciesForm({ ...speciesForm, genusId: event.target.value })}
						>
							<option value="">none</option>
							{data?.genera.map((genus) => (
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
							onChange={(event) => setSpeciesForm({ ...speciesForm, epithet: event.target.value })}
						/>
					</label>
					<label>
						Display
						<input
							required
							value={speciesForm.displayName}
							onChange={(event) =>
								setSpeciesForm({ ...speciesForm, displayName: event.target.value })
							}
						/>
					</label>
					<label>
						Common
						<input
							value={speciesForm.commonName}
							onChange={(event) =>
								setSpeciesForm({ ...speciesForm, commonName: event.target.value })
							}
						/>
					</label>
					<button className="button" type="submit">
						Create species
					</button>
					<CompactList items={data?.species.map((item) => item.displayName)} />
				</form>

				<form className="admin-form foundation-form" onSubmit={submitOrgSpecies}>
					<h4>Org species</h4>
					<label>
						Species
						<select
							required
							value={orgSpeciesForm.speciesId}
							onChange={(event) =>
								setOrgSpeciesForm({ ...orgSpeciesForm, speciesId: event.target.value })
							}
						>
							<option value="">pick species</option>
							{data?.species.map((species) => (
								<option key={species.id} value={species.id}>
									{species.displayName}
								</option>
							))}
						</select>
					</label>
					<button className="button" type="submit">
						Enable species
					</button>
					<CompactList
						items={data?.organizationSpecies.map(
							(item) => speciesById.get(item.speciesId) ?? item.speciesId,
						)}
					/>
				</form>

				<form className="admin-form foundation-form" onSubmit={submitLookup}>
					<h4>Lookups</h4>
					<label>
						Kind
						<select
							value={lookupForm.kind}
							onChange={(event) =>
								setLookupForm({ ...lookupForm, kind: event.target.value as AdminLookupKind })
							}
						>
							<option value="collection_methods">collection methods</option>
							<option value="collection_lures">collection lures</option>
							<option value="habitat_types">habitat types</option>
						</select>
					</label>
					<label className="full">
						Name
						<input
							required
							value={lookupForm.name}
							onChange={(event) => setLookupForm({ ...lookupForm, name: event.target.value })}
						/>
					</label>
					<label className="full">
						Description
						<textarea
							rows={2}
							value={lookupForm.description}
							onChange={(event) =>
								setLookupForm({ ...lookupForm, description: event.target.value })
							}
						/>
					</label>
					<label className="full">
						Custom schema
						<textarea
							rows={4}
							value={lookupForm.customSchemaText}
							onChange={(event) =>
								setLookupForm({ ...lookupForm, customSchemaText: event.target.value })
							}
						/>
					</label>
					{lookupForm.kind === 'collection_methods' ? (
						<label>
							Action threshold
							<input
								type="number"
								min="0"
								step="1"
								value={lookupForm.actionThresholdText}
								onChange={(event) =>
									setLookupForm({ ...lookupForm, actionThresholdText: event.target.value })
								}
							/>
						</label>
					) : null}
					<label className="checkbox full">
						<input
							type="checkbox"
							checked={lookupForm.isActive}
							onChange={(event) => setLookupForm({ ...lookupForm, isActive: event.target.checked })}
						/>
						Active
					</label>
					<button className="button" type="submit">
						Create lookup
					</button>
					<CompactList items={lookupNames(data, lookupForm.kind)} />
				</form>

				<form className="admin-form foundation-form" onSubmit={submitTrap}>
					<h4>Traps</h4>
					<label>
						Method
						<select
							required
							value={trapForm.collectionMethodId}
							onChange={(event) =>
								setTrapForm({ ...trapForm, collectionMethodId: event.target.value })
							}
						>
							<option value="">pick method</option>
							{data?.lookups.collectionMethods.map((method) => (
								<option key={method.id} value={method.id}>
									{method.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Address
						<select
							value={trapForm.addressId}
							onChange={(event) => setTrapForm({ ...trapForm, addressId: event.target.value })}
						>
							<option value="">none</option>
							{data?.addresses.map((address) => (
								<option key={address.id} value={address.id}>
									{address.displayName}
								</option>
							))}
						</select>
					</label>
					<label>
						Default lure
						<select
							value={trapForm.collectionLureId}
							onChange={(event) =>
								setTrapForm({ ...trapForm, collectionLureId: event.target.value })
							}
						>
							<option value="">none</option>
							{data?.lookups.collectionLures.map((lure) => (
								<option key={lure.id} value={lure.id}>
									{lure.name}
								</option>
							))}
						</select>
					</label>
					<label>
						Name
						<input
							value={trapForm.trapName}
							onChange={(event) => setTrapForm({ ...trapForm, trapName: event.target.value })}
						/>
					</label>
					<label>
						Code
						<input
							value={trapForm.trapCode}
							onChange={(event) => setTrapForm({ ...trapForm, trapCode: event.target.value })}
						/>
					</label>
					<label className="full">
						Description
						<textarea
							rows={2}
							value={trapForm.description}
							onChange={(event) => setTrapForm({ ...trapForm, description: event.target.value })}
						/>
					</label>
					<label className="full">
						GeoJSON
						<textarea
							required
							rows={4}
							value={trapForm.geojsonText}
							onChange={(event) => setTrapForm({ ...trapForm, geojsonText: event.target.value })}
						/>
					</label>
					<label className="checkbox full">
						<input
							type="checkbox"
							checked={trapForm.isActive}
							onChange={(event) => setTrapForm({ ...trapForm, isActive: event.target.checked })}
						/>
						Active
					</label>
					<button className="button" type="submit">
						Create trap
					</button>
					<CompactList
						items={data?.traps.map((trap) =>
							trapLabel(trap, collectionMethodById, collectionLureById, addressById),
						)}
					/>
				</form>
			</div>
		</section>
	);
}

function CompactList({ items }: { readonly items: readonly string[] | undefined }) {
	if (items === undefined || items.length === 0) {
		return <p className="empty-list">No rows yet.</p>;
	}

	return (
		<ul className="compact-list">
			{items.slice(0, 8).map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	);
}

function addLookup(
	current: AdminFoundations | null,
	kind: AdminLookupKind,
	lookup: AdminLookup,
): AdminFoundations | null {
	if (current === null) {
		return current;
	}

	if (kind === 'collection_methods') {
		return {
			...current,
			lookups: {
				...current.lookups,
				collectionMethods: [...current.lookups.collectionMethods, lookup],
			},
		};
	}
	if (kind === 'collection_lures') {
		return {
			...current,
			lookups: {
				...current.lookups,
				collectionLures: [...current.lookups.collectionLures, lookup],
			},
		};
	}

	return {
		...current,
		lookups: {
			...current.lookups,
			habitatTypes: [...current.lookups.habitatTypes, lookup],
		},
	};
}

function lookupNames(data: AdminFoundations | null, kind: AdminLookupKind): readonly string[] {
	if (data === null) {
		return [];
	}
	if (kind === 'collection_methods') {
		return data.lookups.collectionMethods.map((item) =>
			item.actionThreshold === null
				? item.name
				: `${item.name} (threshold ${item.actionThreshold})`,
		);
	}
	if (kind === 'collection_lures') {
		return data.lookups.collectionLures.map((item) => item.name);
	}

	return data.lookups.habitatTypes.map((item) => item.name);
}

function lookupMap(items: readonly AdminLookup[] | undefined): Map<string, string> {
	const map = new Map<string, string>();
	for (const item of items ?? []) {
		map.set(item.id, item.name);
	}
	return map;
}

function trapLabel(
	trap: AdminTrap,
	collectionMethodById: ReadonlyMap<string, string>,
	collectionLureById: ReadonlyMap<string, string>,
	addressById: ReadonlyMap<string, string>,
): string {
	const name = trap.trapName ?? trap.trapCode ?? trap.id;
	const method = collectionMethodById.get(trap.collectionMethodId) ?? trap.collectionMethodId;
	const lure =
		trap.collectionLureId === null ? null : collectionLureById.get(trap.collectionLureId);
	const address = trap.addressId === null ? null : addressById.get(trap.addressId);
	return [name, method, lure, address]
		.filter((item) => item !== null && item !== undefined)
		.join(' · ');
}

function parseJson(value: string): unknown {
	const trimmed = value.trim();
	return trimmed === '' ? null : JSON.parse(trimmed);
}

function parseOptionalNonnegativeInteger(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}

	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error('Action threshold must be a nonnegative integer.');
	}

	return parsed;
}

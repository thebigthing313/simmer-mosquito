import {
	electricShapeCollectionOptions,
	type GenusRow,
	generaSyncDescriptor,
	type SpeciesRow,
	speciesSyncDescriptor,
	type UnitRow,
	unitsSyncDescriptor,
} from '@simmer-mosquito/sync';
import { type Collection, createCollection } from '@tanstack/db';
import {
	createAdminGenus,
	createAdminSpecies,
	createAdminUnit,
	deleteAdminGenus,
	deleteAdminSpecies,
	deleteAdminUnit,
	updateAdminGenus,
	updateAdminSpecies,
	updateAdminUnit,
} from '../api';

const adminShapePaths = {
	genera: '/admin/sync/shapes/genera',
	species: '/admin/sync/shapes/species',
	units: '/admin/sync/shapes/units',
};

export interface AdminCollections {
	readonly genera: Collection<GenusRow, string | number>;
	readonly species: Collection<SpeciesRow, string | number>;
	readonly units: Collection<UnitRow, string | number>;
}

export function createAdminCollections(options: { readonly serverUrl: string }): AdminCollections {
	const units = createCollection(
		electricShapeCollectionOptions<UnitRow>({
			descriptor: unitsSyncDescriptor,
			url: `${options.serverUrl}${adminShapePaths.units}`,
			onInsert: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						createAdminUnit(
							{
								id: mutation.modified.id,
								code: mutation.modified.code,
								unitName: mutation.modified.unitName,
								abbreviation: mutation.modified.abbreviation,
								unitType: mutation.modified.unitType,
								unitSystem: mutation.modified.unitSystem,
							},
							options.serverUrl,
						),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
			onUpdate: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						updateAdminUnit(
							mutation.key,
							{
								code: mutation.modified.code,
								unitName: mutation.modified.unitName,
								abbreviation: mutation.modified.abbreviation,
								unitType: mutation.modified.unitType,
								unitSystem: mutation.modified.unitSystem,
							},
							options.serverUrl,
						),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
			onDelete: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) => deleteAdminUnit(mutation.key, options.serverUrl)),
				);
				return { txid: results.map((result) => result.txid) };
			},
		}),
	);
	const genera = createCollection(
		electricShapeCollectionOptions<GenusRow>({
			descriptor: generaSyncDescriptor,
			url: `${options.serverUrl}${adminShapePaths.genera}`,
			onInsert: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						createAdminGenus(
							{
								id: mutation.modified.id,
								abbreviation: mutation.modified.abbreviation,
								name: mutation.modified.name,
							},
							options.serverUrl,
						),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
			onUpdate: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						updateAdminGenus(
							mutation.key,
							{
								abbreviation: mutation.modified.abbreviation,
								name: mutation.modified.name,
							},
							options.serverUrl,
						),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
			onDelete: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						deleteAdminGenus(mutation.key, options.serverUrl),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
		}),
	);
	const species = createCollection(
		electricShapeCollectionOptions<SpeciesRow>({
			descriptor: speciesSyncDescriptor,
			url: `${options.serverUrl}${adminShapePaths.species}`,
			onInsert: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						createAdminSpecies(
							{
								id: mutation.modified.id,
								genusId: mutation.modified.genusId,
								epithet: mutation.modified.epithet,
								commonName: mutation.modified.commonName ?? '',
								displayName: mutation.modified.displayName,
							},
							options.serverUrl,
						),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
			onUpdate: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						updateAdminSpecies(
							mutation.key,
							{
								genusId: mutation.modified.genusId,
								epithet: mutation.modified.epithet,
								commonName: mutation.modified.commonName ?? '',
								displayName: mutation.modified.displayName,
							},
							options.serverUrl,
						),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
			onDelete: async ({ transaction }) => {
				const results = await Promise.all(
					transaction.mutations.map((mutation) =>
						deleteAdminSpecies(mutation.key, options.serverUrl),
					),
				);
				return { txid: results.map((result) => result.txid) };
			},
		}),
	);

	return {
		genera,
		species,
		units,
	};
}

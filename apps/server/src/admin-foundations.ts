import {
	getOperatorOrganization,
	listAddresses,
	listGenera,
	listOrganizationSpecies,
	listOrgLookups,
	listRegionFolders,
	listRegions,
	listSpecies,
	listTraps,
	type SafeAddress,
	type SafeGenus,
	type SafeOrganizationSpecies,
	type SafeOrgLookup,
	type SafeRegion,
	type SafeRegionFolder,
	type SafeSpecies,
	type SafeTrap,
} from '@simmer-mosquito/db';
import type { Context, Hono } from 'hono';
import type { AuthVariables, createOperatorAuthContextMiddleware } from './auth-middleware.js';

type AdminFoundationDb = Parameters<typeof getOperatorOrganization>[0];

// --- what the operator control plane still owns ------------------------------
//
// **Reads, and nothing else.** Two of them: one agency's foundations, so an
// operator can see whether it is ready to work without joining it, and its traps.
// Reading is not the problem #120 found; writing behind a second set of rules
// was.
//
// Every write this module had is gone, in three passes.
//
// Six agency tables went first — addresses, region folders, regions, the
// organization lookups, organization species, traps. They were created here
// without a domain builder in sight, so a region created by an operator and a
// region created by an agency were validated differently and only one of them
// could say who made it. An operator who is going to write those rows now joins
// the agency and posts to `/foundation/*` and `/adult-surveillance/*` like
// anyone else.
//
// Then the three global catalogs: genera, species, units. These *are*
// operator-owned by nature — no `organization_id`, no agency membership relevant
// to them — so the question was never who may write them but through what.
// `createGenusWithTxid` and its siblings were called straight from a route, so a
// row written here was validated by a hand-rolled payload reader, attributed to
// nobody, and checked against no permission map, while `/commands/genera` wrote
// the same row through a domain command behind the operator floor. Two doors
// with different checks is the thing that surface exists to remove.
//
// `/commands/{table}` serves all three now (`table-commands/taxonomy.ts` and
// `table-commands/units.ts`). The `*WithTxid` helpers went with the routes,
// along with nine payload interfaces, thirteen payload readers, and
// `deleteOrExplain` — whose 409 is `refusableWrite` in `table-commands/shared.ts`.

export function registerAdminFoundationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdminFoundationDb;
		readonly operatorAuthContextMiddleware: ReturnType<typeof createOperatorAuthContextMiddleware>;
	},
): void {
	app.get(
		'/admin/organizations/:organizationId/foundations',
		options.operatorAuthContextMiddleware,
		async (context) => {
			const organizationId = context.req.param('organizationId');
			const organization = await getOperatorOrganization(options.db, organizationId);
			if (organization === null) {
				return context.json({ error: 'organization_not_found' }, 404);
			}

			const [
				addresses,
				regionFolders,
				regions,
				genera,
				species,
				organizationSpecies,
				collectionMethods,
				collectionLures,
				habitatTypes,
				traps,
			] = await Promise.all([
				listAddresses(options.db, organizationId),
				listRegionFolders(options.db, organizationId),
				listRegions(options.db, organizationId),
				listGenera(options.db),
				listSpecies(options.db),
				listOrganizationSpecies(options.db, organizationId),
				listOrgLookups(options.db, 'collection_methods', organizationId),
				listOrgLookups(options.db, 'collection_lures', organizationId),
				listOrgLookups(options.db, 'habitat_types', organizationId),
				listTraps(options.db, organizationId),
			]);

			return context.json({
				addresses: addresses.map(toAddressResponse),
				regionFolders: regionFolders.map(toRegionFolderResponse),
				regions: regions.map(toRegionResponse),
				genera: genera.map(toGenusResponse),
				species: species.map(toSpeciesResponse),
				organizationSpecies: organizationSpecies.map(toOrganizationSpeciesResponse),
				lookups: {
					collectionMethods: collectionMethods.map(toOrgLookupResponse),
					collectionLures: collectionLures.map(toOrgLookupResponse),
					habitatTypes: habitatTypes.map(toOrgLookupResponse),
				},
				traps: traps.map(toTrapResponse),
			});
		},
	);

	app.get(
		'/admin/organizations/:organizationId/traps',
		options.operatorAuthContextMiddleware,
		async (context) => {
			const guard = await assertOperatorOrganization(context, options);
			if (!guard.ok) {
				return context.json({ error: guard.error }, guard.status);
			}

			const traps = await listTraps(options.db, guard.organizationId);
			return context.json({ traps: traps.map(toTrapResponse) });
		},
	);
}

async function assertOperatorOrganization(
	context: Context<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdminFoundationDb;
	},
): Promise<
	| { readonly ok: true; readonly organizationId: string }
	| { readonly ok: false; readonly status: 403 | 404; readonly error: string }
> {
	const organizationId = context.req.param('organizationId');
	if (organizationId === undefined) {
		return { ok: false, status: 404, error: 'organization_not_found' };
	}
	const organization = await getOperatorOrganization(options.db, organizationId);
	if (organization === null) {
		return { ok: false, status: 404, error: 'organization_not_found' };
	}

	return { ok: true, organizationId };
}

function toAddressResponse(address: SafeAddress) {
	return {
		id: address.id,
		organizationId: address.organizationId,
		geometry: address.geometry,
		displayName: address.displayName,
		country: address.country,
		addressLine1: address.addressLine1,
		addressLine2: address.addressLine2,
		locality: address.locality,
		region: address.region,
		postalCode: address.postalCode,
		createdAt: address.createdAt,
		updatedAt: address.updatedAt,
	};
}

function toRegionFolderResponse(folder: SafeRegionFolder) {
	return {
		id: folder.id,
		organizationId: folder.organizationId,
		name: folder.name,
		description: folder.description,
		createdAt: folder.createdAt,
		updatedAt: folder.updatedAt,
	};
}

function toRegionResponse(region: SafeRegion) {
	return {
		id: region.id,
		organizationId: region.organizationId,
		regionFolderId: region.regionFolderId,
		geometry: region.geometry,
		name: region.name,
		description: region.description,
		metadata: region.metadata,
		createdAt: region.createdAt,
		updatedAt: region.updatedAt,
	};
}

function toGenusResponse(genus: SafeGenus) {
	return {
		id: genus.id,
		abbreviation: genus.abbreviation,
		name: genus.name,
		createdAt: genus.createdAt,
		updatedAt: genus.updatedAt,
	};
}

function toSpeciesResponse(species: SafeSpecies) {
	return {
		id: species.id,
		genusId: species.genusId,
		epithet: species.epithet,
		commonName: species.commonName,
		displayName: species.displayName,
		createdAt: species.createdAt,
		updatedAt: species.updatedAt,
	};
}

function toOrganizationSpeciesResponse(row: SafeOrganizationSpecies) {
	return {
		id: row.id,
		organizationId: row.organizationId,
		speciesId: row.speciesId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toOrgLookupResponse(row: SafeOrgLookup) {
	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		description: row.description,
		customSchema: row.customSchema,
		actionThreshold: row.actionThreshold,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toTrapResponse(trap: SafeTrap) {
	return {
		id: trap.id,
		organizationId: trap.organizationId,
		geometry: trap.geometry,
		collectionMethodId: trap.collectionMethodId,
		addressId: trap.addressId,
		collectionLureId: trap.collectionLureId,
		trapName: trap.trapName,
		trapCode: trap.trapCode,
		description: trap.description,
		isActive: trap.isActive,
		createdAt: trap.createdAt,
		updatedAt: trap.updatedAt,
	};
}

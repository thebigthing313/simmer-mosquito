import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getServerUrl } from '../../../api';

/**
 * The agency-bootstrap endpoints — the seven `/admin/organizations/:id/*` routes
 * the console has never called.
 *
 * They exist to stand a new agency up: give it its regions and addresses, the
 * method/lure/habitat lookups its forms read from, the species it actually sees
 * locally, and its first traps. Every one of them is **create-only** — there is
 * no PATCH or DELETE on the server for any of these — so this is a page for
 * seeding an agency, not for maintaining it. Once the agency has people, they
 * maintain their own catalogs in the web app, where update and delete exist.
 *
 * One `GET .../foundations` returns all of it at once, which is why this is a
 * single query rather than eight.
 */

export interface FoundationAddress {
	readonly id: string;
	readonly displayName: string;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly country: string;
}

export interface FoundationRegionFolder {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
}

export interface FoundationRegion {
	readonly id: string;
	readonly regionFolderId: string | null;
	readonly name: string;
	readonly description: string | null;
}

export interface FoundationGenus {
	readonly id: string;
	readonly name: string;
	readonly abbreviation: string;
}

export interface FoundationSpecies {
	readonly id: string;
	readonly genusId: string | null;
	readonly displayName: string;
	readonly commonName: string | null;
}

export interface FoundationOrganizationSpecies {
	readonly id: string;
	readonly speciesId: string;
}

export interface FoundationLookup {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly actionThreshold: number | null;
	readonly isActive: boolean;
}

export interface FoundationTrap {
	readonly id: string;
	readonly collectionMethodId: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly isActive: boolean;
}

export interface AgencyFoundations {
	readonly addresses: readonly FoundationAddress[];
	readonly regionFolders: readonly FoundationRegionFolder[];
	readonly regions: readonly FoundationRegion[];
	readonly genera: readonly FoundationGenus[];
	readonly species: readonly FoundationSpecies[];
	readonly organizationSpecies: readonly FoundationOrganizationSpecies[];
	readonly lookups: {
		readonly collectionMethods: readonly FoundationLookup[];
		readonly collectionLures: readonly FoundationLookup[];
		readonly habitatTypes: readonly FoundationLookup[];
	};
	readonly traps: readonly FoundationTrap[];
}

/** The three lookup families the server accepts; `readLookupKind` rejects anything else. */
export type LookupKind = 'collection_methods' | 'collection_lures' | 'habitat_types';

const foundationKeys = {
	all: ['admin', 'foundations'] as const,
	agency: (organizationId: string) => [...foundationKeys.all, organizationId] as const,
};

export function useAgencyFoundations(organizationId: string) {
	return useQuery<AgencyFoundations>({
		queryKey: foundationKeys.agency(organizationId),
		queryFn: () => getJson<AgencyFoundations>(foundationsPath(organizationId)),
	});
}

interface RegionFolderInput {
	readonly name: string;
	readonly description: string;
}

interface RegionInput {
	readonly name: string;
	readonly regionFolderId: string | null;
	readonly description: string;
	readonly geojson: GeoJsonGeometry;
}

interface AddressInput {
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string;
	readonly addressLine2: string;
	readonly locality: string;
	readonly region: string;
	readonly postalCode: string;
	readonly geojson: GeoJsonGeometry;
}

interface LookupInput {
	readonly name: string;
	readonly description: string;
	readonly actionThreshold: number | null;
	readonly isActive: boolean;
}

interface TrapInput {
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string;
	readonly trapCode: string;
	readonly description: string;
	readonly isActive: boolean;
	readonly geojson: GeoJsonGeometry;
}

/**
 * One mutation hook per foundation kind, each invalidating the single aggregate
 * read so the panel it came from reflects the new row without a page reload.
 */
export function useCreateFoundation(organizationId: string) {
	const queryClient = useQueryClient();
	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: foundationKeys.agency(organizationId) });
	};

	const regionFolder = useMutation({
		mutationFn: (input: RegionFolderInput) =>
			postJson(`${foundationsBase(organizationId)}/region-folders`, {
				name: input.name,
				description: nullable(input.description),
			}),
		onSuccess: invalidate,
	});

	const region = useMutation({
		mutationFn: (input: RegionInput) =>
			postJson(`${foundationsBase(organizationId)}/regions`, {
				name: input.name,
				regionFolderId: input.regionFolderId,
				description: nullable(input.description),
				geojson: input.geojson,
			}),
		onSuccess: invalidate,
	});

	const address = useMutation({
		mutationFn: (input: AddressInput) =>
			postJson(`${foundationsBase(organizationId)}/addresses`, {
				displayName: input.displayName,
				country: input.country.toUpperCase(),
				addressLine1: nullable(input.addressLine1),
				addressLine2: nullable(input.addressLine2),
				locality: nullable(input.locality),
				region: nullable(input.region),
				postalCode: nullable(input.postalCode),
				geojson: input.geojson,
			}),
		onSuccess: invalidate,
	});

	const species = useMutation({
		mutationFn: (speciesId: string) =>
			postJson(`${foundationsBase(organizationId)}/species`, { speciesId }),
		onSuccess: invalidate,
	});

	const lookup = useMutation({
		mutationFn: ({ kind, input }: { readonly kind: LookupKind; readonly input: LookupInput }) =>
			postJson(`${foundationsBase(organizationId)}/lookups/${kind}`, {
				name: input.name,
				description: nullable(input.description),
				actionThreshold: input.actionThreshold,
				isActive: input.isActive,
			}),
		onSuccess: invalidate,
	});

	const trap = useMutation({
		mutationFn: (input: TrapInput) =>
			postJson(`${foundationsBase(organizationId)}/traps`, {
				collectionMethodId: input.collectionMethodId,
				addressId: input.addressId,
				collectionLureId: input.collectionLureId,
				trapName: nullable(input.trapName),
				trapCode: nullable(input.trapCode),
				description: nullable(input.description),
				isActive: input.isActive,
				geojson: input.geojson,
			}),
		onSuccess: invalidate,
	});

	return { address, lookup, region, regionFolder, species, trap };
}

/** Empty strings are how a form says "not given"; the server wants null. */
function nullable(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

function foundationsBase(organizationId: string): string {
	return `${getServerUrl()}/admin/organizations/${organizationId}`;
}

function foundationsPath(organizationId: string): string {
	return `${foundationsBase(organizationId)}/foundations`;
}

async function getJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		credentials: 'include',
		headers: { accept: 'application/json' },
	});
	return readJson<T>(response);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
	const response = await fetch(url, {
		method: 'POST',
		credentials: 'include',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	return readJson<T>(response);
}

async function readJson<T>(response: Response): Promise<T> {
	const text = await response.text();
	const body: unknown = text.trim() === '' ? {} : JSON.parse(text);
	if (!response.ok) {
		throw new Error(errorMessage(body));
	}
	return body as T;
}

function errorMessage(body: unknown): string {
	if (typeof body === 'object' && body !== null) {
		const record = body as Record<string, unknown>;
		if (typeof record.reason === 'string' && record.reason.trim() !== '') {
			return record.reason;
		}
		if (typeof record.error === 'string' && record.error.trim() !== '') {
			return record.error.replace(/_/g, ' ');
		}
	}
	return 'Request failed.';
}

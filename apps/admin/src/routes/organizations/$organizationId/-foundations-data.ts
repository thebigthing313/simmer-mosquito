import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	getOrganizationFoundations,
	type OrganizationFoundations,
	postOrganizationCommand,
} from '../../../api';

/**
 * Standing a new organization up: its regions and addresses, the
 * method/lure/habitat lookups its forms read from, the species it sees locally,
 * and its first traps.
 *
 * The **read** is an operator read. One `GET
 * /admin/organizations/:id/foundations` returns all of it at once, which is why
 * this is a single query rather than eight, and it answers for an organization
 * the operator is merely looking at. It lives in `api.ts` with every other
 * `/admin/*` call, so a refusal arrives carrying the server's code.
 *
 * The **writes are organization writes** (ADR 0011). They go to
 * `/foundation/*` and `/adult-surveillance/traps` as a member of the
 * organization, through the same domain command builders and the same writers
 * `apps/web` reaches on `/commands/{table}`, so a region created here and a
 * region created there are validated by one set of rules and attributed to a
 * real person. They require the session to be inside the organization;
 * `OrganizationSessionGate` is what puts it there.
 *
 * These six creates are the whole of the older per-domain write surface now.
 * `apps/server/src/organization-seed-routes.ts` is the module that answers
 * them, and it holds nothing else (#634). A seventh write from this console
 * goes on `/commands/{table}` like every other write in the product.
 *
 * Commands carry client-generated ids, so every create mints one here rather
 * than reading one back.
 */

/** The three lookup families the server accepts; `readLookupKind` rejects anything else. */
export type LookupKind = 'collection_methods' | 'collection_lures' | 'habitat_types';

const foundationKeys = {
	all: ['admin', 'foundations'] as const,
	organization: (organizationId: string) => [...foundationKeys.all, organizationId] as const,
};

export function useOrganizationFoundations(organizationId: string) {
	return useQuery<OrganizationFoundations>({
		queryKey: foundationKeys.organization(organizationId),
		queryFn: () => getOrganizationFoundations(organizationId),
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
}

interface TrapInput {
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string;
	readonly trapCode: string;
	readonly description: string;
	readonly geojson: GeoJsonGeometry;
}

/**
 * One mutation hook per foundation kind, each invalidating the single aggregate
 * read so the panel it came from reflects the new row without a page reload.
 *
 * No path here names the organization. An organization endpoint takes it from
 * the session, which is the whole point of entering the organization first.
 */
export function useCreateFoundation(organizationId: string) {
	const queryClient = useQueryClient();
	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: foundationKeys.organization(organizationId) });
	};

	const regionFolder = useMutation({
		mutationFn: (input: RegionFolderInput) =>
			postOrganizationCommand('/foundation/region-folders', {
				id: newId(),
				name: input.name,
				description: nullable(input.description),
			}),
		onSuccess: invalidate,
	});

	const region = useMutation({
		mutationFn: (input: RegionInput) =>
			postOrganizationCommand('/foundation/regions', {
				id: newId(),
				name: input.name,
				regionFolderId: input.regionFolderId,
				description: nullable(input.description),
				geometry: input.geojson,
			}),
		onSuccess: invalidate,
	});

	const address = useMutation({
		mutationFn: (input: AddressInput) =>
			postOrganizationCommand('/foundation/addresses', {
				id: newId(),
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
			postOrganizationCommand('/foundation/organization-species', { id: newId(), speciesId }),
		onSuccess: invalidate,
	});

	const lookup = useMutation({
		mutationFn: ({ kind, input }: { readonly kind: LookupKind; readonly input: LookupInput }) =>
			// The organization create takes no `isActive`: a catalog entry is created
			// live and retired later, which is an update. The form's toggle is
			// honoured by simply not offering the create path a way to be born
			// inactive.
			postOrganizationCommand(`/foundation/${lookupPaths[kind]}`, {
				id: newId(),
				name: input.name,
				description: nullable(input.description),
				actionThreshold: input.actionThreshold,
			}),
		onSuccess: invalidate,
	});

	const trap = useMutation({
		mutationFn: (input: TrapInput) =>
			postOrganizationCommand('/adult-surveillance/traps', {
				id: newId(),
				// A trap carries a domain location source, never a raw geometry
				// column: the server snapshots the point inside its own transaction.
				locationSource: { kind: 'geometry', geometry: input.geojson },
				collectionMethodId: input.collectionMethodId,
				addressId: input.addressId,
				collectionLureId: input.collectionLureId,
				trapName: nullable(input.trapName),
				trapCode: nullable(input.trapCode),
				description: nullable(input.description),
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

/** The path segment each lookup catalog is registered under organization-side. */
const lookupPaths: Record<LookupKind, string> = {
	collection_methods: 'collection-methods',
	collection_lures: 'collection-lures',
	habitat_types: 'habitat-types',
};

/** Commands carry client-generated ids so they are replay- and audit-safe. */
function newId(): string {
	return crypto.randomUUID();
}

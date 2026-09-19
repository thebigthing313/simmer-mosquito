import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postOrganizationCommand } from '../../api';
import { foundationKeys, type LookupKind } from '../queries/use-organization-foundations';

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
 * One mutation per foundation kind, each posting an organization command with
 * a client-generated id and invalidating the foundations read afterwards. No
 * path names the organization; the session's organization is the target.
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

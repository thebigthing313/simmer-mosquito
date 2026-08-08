import { geojsonToGeom, softDelete, updateRow } from '@simmer-mosquito/db';
import type { FoundationCommand } from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import { type CommandDb, type CommandTransaction, runCommands } from '../command-write.js';

export type FoundationDb = CommandDb;
export type FoundationTransaction = CommandTransaction;
export {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	invalidUpdate,
	runCommands,
	softDelete,
	updateRow,
};

// ===========================================================================
// Response shaping
// ===========================================================================

export const regionFolderReturnColumns = [
	'id',
	'organization_id',
	'name',
	'description',
	'created_at',
	'updated_at',
] as const;

export interface SafeRegionFolder {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRegionFolder(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly name: string;
	readonly description: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegionFolder {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		description: row.description,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const regionReturnColumns = [
	'id',
	'organization_id',
	'region_folder_id',
	'name',
	'description',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export interface SafeRegion {
	readonly id: string;
	readonly organizationId: string;
	readonly regionFolderId: string | null;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRegion(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly region_folder_id: string | null;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegion {
	return {
		id: row.id,
		organizationId: row.organization_id,
		regionFolderId: row.region_folder_id,
		name: row.name,
		description: row.description,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const organizationSpeciesReturnColumns = [
	'id',
	'organization_id',
	'species_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeOrganizationSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeOrganizationSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly species_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOrganizationSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		speciesId: row.species_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

export interface RouteOptions {
	readonly db: FoundationDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export type CommandsResult = SharedCommandsResult<FoundationCommand>;

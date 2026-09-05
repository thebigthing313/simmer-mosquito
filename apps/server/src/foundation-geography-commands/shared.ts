import { geojsonToGeom, type SelectedRow, softDelete, updateRow } from '@simmer-mosquito/db';
import type { FoundationCommand } from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	type CommandContext,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	organizationCommandContext,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import { type CommandDb, type CommandTransaction, runCommands } from '../command-write.js';

export type FoundationDb = CommandDb;
export type FoundationTransaction = CommandTransaction;
export {
	type CommandContext,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	invalidUpdate,
	organizationCommandContext,
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

export type RegionFolderRow = SelectedRow<'region_folders', typeof regionFolderReturnColumns>;

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

export type RegionRow = SelectedRow<'regions', typeof regionReturnColumns>;

export const organizationSpeciesReturnColumns = [
	'id',
	'organization_id',
	'species_id',
	'created_at',
	'updated_at',
] as const;

export type OrganizationSpeciesRow = SelectedRow<
	'organization_species',
	typeof organizationSpeciesReturnColumns
>;

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

export interface RouteOptions {
	readonly db: FoundationDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export type CommandsResult = SharedCommandsResult<FoundationCommand>;

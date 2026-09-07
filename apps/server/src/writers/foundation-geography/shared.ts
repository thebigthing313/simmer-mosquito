import { geojsonToGeom, type SelectedRow, softDelete, updateRow } from '@simmer-mosquito/db';
import type { CommandTransaction } from '../../command-write.js';

export type FoundationTransaction = CommandTransaction;
export { geojsonToGeom, softDelete, updateRow };

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

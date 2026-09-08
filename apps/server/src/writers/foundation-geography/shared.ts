import { geojsonToGeom, softDelete, updateRow } from '@simmer-mosquito/db';
import type { CommandTransaction } from '../../command-write.js';
import type { CommandRow } from '../../return-columns.js';

export type FoundationTransaction = CommandTransaction;
export { geojsonToGeom, softDelete, updateRow };

// ===========================================================================
// Response shaping
// ===========================================================================

export type RegionFolderRow = CommandRow<'region_folders'>;

export type RegionRow = CommandRow<'regions'>;

export type OrganizationSpeciesRow = CommandRow<'organization_species'>;

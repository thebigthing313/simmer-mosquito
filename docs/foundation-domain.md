# Foundation And Reference Data Domain

This captures the foundation/reference-data command decisions from the domain
interview. These commands harden organization-owned address/region/reference
data and SIMMER-controlled taxonomy. Server endpoints are still deferred.

## Command Shape

Foundation agency commands use the `foundation.*` namespace and carry command
context for optimistic UI, offline logs, and command replay:

- `organizationId`
- `actorProfileId`

Server `AuthContext` remains authoritative and must verify both IDs. SIMMER
operator taxonomy commands are separate operator workflows and carry
`operatorUserId` instead of agency context.

Commands carry domain intent, not DB-shaped patches. Foundation address and
region catalog commands carry explicit GeoJSON `geometry` because they define
the catalog feature itself; command clients do not submit `featureId`. The
server maps geometry to `spatial_features.id` inside the transaction. Other
operational domains use named `locationSource` flows when a command should
snapshot an existing allowed source record without exposing raw `feature_id`.
Those flows are domain-specific; not every locatable record is a valid source
for every command.

Supported v1 command geometry types:

- address geometry: `Point`
- region geometry: `Polygon`
- locatable operational geometry: `Point`, `LineString`, `Polygon`

Multi-geometries, geometry collections, and GeoJSON Feature wrappers are
deferred. Polygon holes are allowed as Polygon interior rings. Points always use
the `snap_5_decimal` precision policy. LineStrings and Polygons preserve
submitted coordinates.

## Addresses

Commands:

- `createAddress`
- `updateAddressDetails`
- `updateAddressLocation`
- `deleteAddress`
- `mergeAddresses`

`createAddress` is collector-and-above so mobile collectors can create ad hoc
address book entries while entering field records. Update, delete, and merge are
manager-and-above.

Address commands require a client-generated `addressId` for creation. The
command requires `displayName`; UI may default it from a formatted geocoder
address, but the command does not derive it. V1 addresses are US-only:

- stored country is `US`
- region is a two-letter state code
- postal code is ZIP or ZIP+4

`geocoderResponse` is optional JSON object-or-null and is preserved as support
metadata.

`address.feature_id` is not canonical location for operational records. It is a
UX convenience: choosing an address may prefill the operational geometry. Later
address location changes do not cascade to traps, habitats, inspections,
applications, or other operational records.

Address deletion is soft delete and idempotent when already deleted. It is
blocked by any non-deleted row that directly references `address_id`, including
adult surveillance, larval surveillance, control operations, field-work route
or assignment items, service requests, notification registrations, and mission
items. Contacts and organizations do not block address deletion. Direct address
comments and tags are soft-deleted with the address.

`mergeAddresses` re-points non-deleted direct `address_id` references from one
or more sources to a target, preserves each operational row's existing
`feature_id`, moves comments, moves/deduplicates tags, and soft-deletes source
addresses. It requires explicit acknowledgement that history is being
consolidated.

Duplicate address display names or identical address features are warnings only.
The app should warn within useful UI scope; the database should not prevent
duplicates.

## Region Folders

Commands:

- `createRegionFolder`
- `updateRegionFolder`
- `deleteRegionFolder`

Region folders are manager-and-above. Folder names are unique per organization
after trimming/case folding, excluding soft-deleted folders. Folders are not
commentable or taggable in v1.

Deleting a folder soft-deletes the folder. If it contains non-deleted regions,
the command requires acknowledgement and detaches those regions by setting
`region_folder_id = null`. Folder create/update/delete invalidates region
intersection cache for the affected folder.

## Regions

Commands:

- `createRegion`
- `updateRegionDetails`
- `moveRegionToFolder`
- `updateRegionGeometry`
- `deleteRegion`

Regions are manager-and-above and Polygon-only in v1. Uncategorized regions are
allowed with `regionFolderId = null`. Regions do not have active/inactive
lifecycle state.

Region names and geometries may duplicate. SIMMER does not own agency GIS data
integrity in v1. The app may warn on duplicate normalized names or same
`feature_id` within the same folder, including the uncategorized bucket, but
does not block. Topology validation is limited to PostGIS geometry validity.

`updateRegionGeometry` requires acknowledgement that region boundaries may
change future reporting/cache results. It creates or reuses the server-side
spatial feature from command geometry and invalidates affected cache rows.

`deleteRegion` requires acknowledgement, soft-deletes the region, soft-deletes
direct region comments/tags, and invalidates affected cache rows. Region delete
is not blocked by cached intersections. There is no v1 region merge command.

## Region Intersection Cache

`spatial_feature_regions` has no public commands. It is derived cache for
feature/folder intersections. Region and folder mutations should delete or
invalidate affected folder cache rows. Uncategorized regions are not cached.

## Global Taxonomy

Commands:

- `createGenus`
- `updateGenus`
- `deleteGenus`
- `createSpecies`
- `updateSpecies`
- `deleteSpecies`

Global taxonomy is SIMMER-operator-only. Commands require client-generated
`genusId` or `speciesId`.

Genera and species do not use active/inactive or soft-delete lifecycle in v1.
Delete is hard delete, allowed only when unreferenced. Species delete is blocked
by any `collection_species`, `sample_species`, or `organization_species` row,
including soft-deleted organization species rows. Genus delete is blocked by any
species row.

Genus abbreviation and name are unique globally after trimming/case folding.
Species `(genus_id, epithet)` is unique after trimming/case folding; null-genus
special categories use globally unique normalized epithet. `displayName` is
explicit and required. Duplicate display names are warnings only.

Renaming referenced taxonomy requires explicit acknowledgement in server command
handling so operators do not accidentally relabel historical results.

## Organization Species

Commands:

- `selectOrganizationSpecies`
- `unselectOrganizationSpecies`

These are owner/admin agency workflows. Selecting a species requires
`organizationSpeciesId` and `speciesId`. If the organization previously
unselected the same species, selection restores the existing row and preserves
its ID. Unselecting soft-deletes the row and is idempotent.

There is no `is_active` flag. A deleted organization species row and a disabled
row mean the same thing: that species can no longer be selected for new data
entry. Historical adult and larval rows store global `species_id` and remain
valid.

Organization species selection limits record creation only. If an organization
has zero non-deleted organization species rows, all global species may be used
for new entry. If it has one or more, only selected non-deleted species may be
used for new entry.

## Organization Lookups

Commands:

- `createCollectionMethod`
- `updateCollectionMethod`
- `deactivateCollectionMethod`
- `reactivateCollectionMethod`
- `deleteCollectionMethod`
- `createCollectionLure`
- `updateCollectionLure`
- `deactivateCollectionLure`
- `reactivateCollectionLure`
- `deleteCollectionLure`
- `createHabitatType`
- `updateHabitatType`
- `deactivateHabitatType`
- `reactivateHabitatType`
- `deleteHabitatType`

Lookup management is owner/admin only. Names are unique per organization/table
after trimming/case folding, excluding soft-deleted rows. Create always creates
an active lookup.

Collection methods carry optional description, optional JSON object
`customSchema`, and optional nonnegative integer `actionThreshold`. Collection
lures carry name and optional description only. Habitat types carry optional
description and optional JSON object `customSchema`; that schema guides
permanent habitat metadata, not ad hoc inspection metadata.

Name changes require historical-label acknowledgement when referenced. Schema
changes do not require acknowledgement because they guide future UI and warning
behavior; they should not make historical records invalid.

Deactivation is idempotent. It is blocked by active traps for collection
methods/lures and active habitats for habitat types. Historical transaction
rows do not block deactivation.

Deletion is idempotent soft delete and is allowed only when there are no
non-deleted references:

- methods: traps or collections
- lures: traps or collections
- habitat types: habitats or inspections

There is no v1 lookup merge or restore command.

## Comments And Tags

Addresses and regions are valid comment and tag targets. Region folders,
taxonomy rows, organization species rows, and lookup rows are not commentable or
taggable in v1.

Address/region delete commands soft-delete direct comments and tag assignments.
Address merge moves comments to the target address and moves/deduplicates tag
assignments.

## Imports

V1 user-facing imports are web-only, manager-and-above workflows for addresses
and regions. They are online request/response workflows, not offline bulk
commands. Import handlers should call the same per-row domain validation and
write ordinary rows; they do not need a public bulk command vocabulary.

Address imports support lat/lng columns only. Region imports may accept GeoJSON,
KML, or Shapefile at the import layer, but the foundation command/domain layer
sees normalized Polygon geometry. Region import rejects MultiPolygon,
GeometryCollection, Point, and LineString. Imports create new rows only;
duplicate handling is warnings, not matching/upsert.

Collection methods, lures, and habitat types are small lists and can be entered
one by one in v1. Trap and habitat imports need richer validation and are
deferred to separate SIMMER onboarding tooling or later product work.

## Sync And Offline

Offline queues store domain commands. Mobile/offline frontends may sync scoped
working sets of address, region, taxonomy, and lookup data. The web app should
not automatically download large address books; it can page, search, or load
on demand.

Sync behavior will differ by frontend and needs a dedicated follow-up session.
Regardless of frontend, server command replay revalidates permissions,
organization ownership, active/non-deleted references, geometry, lifecycle
state, acknowledgement flags, and duplicate-warning acknowledgements.

## Schema Changes Surfaced

The schema should align with these domain decisions:

- remove the unique region name constraint
- add normalized unique indexes for region folder names and lookup names
- add normalized unique indexes for global genus/species taxonomy
- add `organization_species.deleted_at` and `deleted_by_profile_id`
- treat non-deleted `organization_species` rows as selected species
- remove `collection_lures.custom_schema`
- keep address and region duplicate handling as warnings, not constraints

These changes are captured in the follow-up foundation migration and DB type
updates.

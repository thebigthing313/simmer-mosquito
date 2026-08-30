# Foundation and reference data domain

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records foundation
and reference-data vocabulary and exceptions.

This captures the foundation/reference-data command decisions from the domain
interview. These commands harden organization-owned address/region/reference
data and SIMMER-controlled taxonomy. The endpoints exist: 39 `foundation.*`
commands carry floors in `apps/server/src/command-permissions.ts`, and their
routes live in `apps/server/src/table-commands/`.

## Command shape

Foundation agency commands use the `foundation.*` namespace and carry command
context for optimistic UI, offline logs, and command replay:

- `organizationId`
- `actorProfileId`

Server `AuthContext` remains authoritative and must verify both IDs. SIMMER
operator taxonomy commands are separate operator workflows and carry
`operatorUserId` instead of agency context.

Commands carry domain intent, not DB-shaped patches. Foundation address and
region catalog commands carry explicit GeoJSON `geometry` because they define
the catalog geometry itself. The server stores geometry directly on the owned
address or region row. Other operational domains use named `locationSource`
flows when a command should snapshot an existing allowed source record's
geometry without exposing database geometry columns. Those flows are
domain-specific; not every locatable record is a valid source for every
command.

Supported v1 command geometry types:

- address geometry: `Point`
- region geometry: `Polygon`
- locatable operational geometry: `Point`, `LineString`, `Polygon`

Multi-geometries, geometry collections, and GeoJSON Feature wrappers are
deferred. Polygon holes are allowed as Polygon interior rings. SIMMER preserves
submitted coordinates for Points, LineStrings, and Polygons.

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

Address geometry is not canonical location for operational records. It is a UX
convenience: choosing an address may prefill the operational geometry. Later
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
geometry snapshot, moves comments, moves/deduplicates tags, and soft-deletes source
addresses. It requires explicit acknowledgement that history is being
consolidated.

Duplicate address display names or identical address features are warnings only.
The app should warn within useful UI scope; the database should not prevent
duplicates.

## Region folders

Commands:

- `createRegionFolder`
- `updateRegionFolder`
- `deleteRegionFolder`

Region folders are manager-and-above. Folder names are unique per organization
after trimming/case folding, excluding soft-deleted folders. Folders are not
commentable or taggable in v1.

Deleting a folder soft-deletes the folder. If it contains non-deleted regions,
the command requires acknowledgement and detaches those regions by setting
`region_folder_id = null`.

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
geometry within the same folder, including the uncategorized bucket, but
does not block. Topology validation is limited to PostGIS geometry validity.

`updateRegionGeometry` requires acknowledgement that region boundaries may
change future reporting. It stores the command geometry directly on the region.

`deleteRegion` requires acknowledgement, soft-deletes the region, and
soft-deletes direct region comments/tags. There is no v1 region merge command.

`deleteRegionFolder` unfiles the regions in the folder rather than deleting
them: a folder is filing, and the regions are the agency's map. It requires
`acknowledgedRegionDetach` when the folder still holds any, and refuses with
`409 acknowledgement_required` naming how many. An unfiled region is
present with `regionFolderId = null`.

## Region membership

Which regions contain a record is computed on read and never stored, so there is
nothing for a region or folder mutation to invalidate. A redrawn boundary
changes every answer the moment it is committed. Unfiled regions are answered
like any other, in their own group. See ADR 0015 and
`docs/region-membership-spec.md`.

This replaces the region intersection cache this document used to describe.

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

## Global units

Commands:

- `createUnit`
- `updateUnit`
- `deleteUnit`

Units of measure are SIMMER-operator-only, like the taxonomy, and for the same
reason: there is no `organization_id`, and every agency records amounts against
them. Commands require a client-generated `unitId`.

`code`, `unitName` and `abbreviation` are each unique globally. Uniqueness is
checked by the server inside the write transaction, not by the builders, because
it is a fact about the other rows rather than about the command.

Delete is hard delete, allowed only when unreferenced. A unit is blocked by any
record measured in it, and by an organization's unit defaults.

**`code` is a join key, not a label.** The `units` table carries no conversion
factor and no base-unit column; the arithmetic lives in
`organization-settings/unit-conversion.ts`, keyed by `code`. Changing a unit's
code therefore detaches it from every total that crosses units, and it does not
fail. An unknown code makes a total *unavailable*, so callers fall back to
reporting each unit separately. `updateUnit` requires
`acknowledgedUnitCodeChange` when, and only when, `code` is among the changes.
Adding a unit to the database means adding it to the conversion table too.

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

## Comments and tags

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
KML, KMZ, or Shapefile at the import layer, but the foundation command/domain
layer sees normalized Polygon geometry. Region import rejects MultiPolygon,
GeometryCollection, Point, and LineString. Imports create new rows only;
duplicate handling is warnings, not matching/upsert.

Collection methods, lures, and habitat types are small lists and can be entered
one by one in v1. Trap and habitat imports need richer validation and are
deferred to separate SIMMER onboarding tooling or later product work.

## Sync and offline

Foundation commands follow `docs/domain-command-contract.md`. Mobile/offline
frontends may sync scoped working sets of address, region, taxonomy, and lookup
data. The web app should not automatically download large address books; it can
page, search, or load on demand.

Sync behavior will differ by frontend and needs a dedicated follow-up session.
Foundation-specific replay must also revalidate duplicate-warning
acknowledgements.

## Schema this domain drove

Every one of these is in the database, read back on 2026-08-19:

- the unique region name constraint is gone; `regions_organization_name_idx` is
  an ordinary index
- `region_folders_organization_normalized_name_unique` and the lookup-name
  equivalents are normalized and soft-delete-aware
- `genera_normalized_name_unique`, `genera_normalized_abbreviation_unique`,
  `species_genus_normalized_epithet_unique`, and
  `species_special_normalized_epithet_unique` cover global taxonomy
- `organization_species` carries `deleted_at` and `deleted_by_profile_id`, and a
  non-deleted row is what "selected species" means
- `collection_lures.custom_schema` is gone

Address and region duplicate handling stays a warning rather than a constraint,
which is a decision rather than pending work.

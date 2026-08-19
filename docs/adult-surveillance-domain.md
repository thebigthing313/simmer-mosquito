# Adult surveillance domain decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records adult
surveillance vocabulary and exceptions.

This captures the adult surveillance command and schema decisions from the
domain interview. It is intentionally implementation-facing; broader
architecture decisions remain in `docs/adr/`.

## Command groups

Trap catalog commands are manager-and-above workflows:

- `adultSurveillance.createTrap`
- `adultSurveillance.updateTrapDetails`
- `adultSurveillance.updateTrapConfiguration`
- `adultSurveillance.retireTrap`
- `adultSurveillance.reactivateTrap`
- `adultSurveillance.deleteTrap`

Collection workflow commands are collector-and-above workflows:

- `adultSurveillance.setTrapCollection`
- `adultSurveillance.setAdHocCollection`
- `adultSurveillance.recordCollectedTrapCollection`
- `adultSurveillance.recordCollectedAdHocCollection`
- `adultSurveillance.collectCollection`
- `adultSurveillance.cancelPendingCollection`
- `adultSurveillance.updateCollectionFieldDetails`
- `adultSurveillance.updateAdHocCollectionConfiguration`
- `adultSurveillance.deleteCollection`

Analysis workflow commands are collector-and-above workflows:

- `adultSurveillance.addCollectionSpeciesCount`
- `adultSurveillance.updateCollectionSpeciesCount`
- `adultSurveillance.deleteCollectionSpeciesCount`
- `adultSurveillance.markCollectionZeroResult`
- `adultSurveillance.clearCollectionZeroResult`
- `adultSurveillance.setCollectionBycatch`

Adjacent shared domains own:

- Trap and collection comments.
- Organization species enablement.
- Collection method and lure lookup management.

## Important semantics

`traps` are recurring adult surveillance configurations: collection method,
point location, optional lure, optional address, and agency display identity.
They are not physical equipment.

Trap management is manager-and-above. Collection method, lure, and organization
species management is owner/admin only.

Collections are field collection attempts or collected records. Species counts
are separate analysis transactions. Collection creation commands must not embed
species count mutations.

Pending collections exist only for exact timestamp workflows. Agencies that
record adult surveillance only after lab arrival can create collected records
directly with collection date and duration.

Deleted records are soft-deleted and excluded from normal Electric/TanStack DB
replicas. Retired traps remain replicated for historical context.

## Schema migration backlog

These schema updates surfaced during the domain interview and landed in
`202605080001_adult_surveillance_domain_updates.sql`.

### Collections timing

Add explicit collection timing intent:

- `collection_timing_mode`
  - `exact_timestamps`
  - `collection_date_duration`
- `collection_date date`
- `duration_amount double precision`
- `duration_unit_id uuid references units(id)`

Rules:

- `exact_timestamps` pending records require `started_at` and no
  `collected_at`.
- `exact_timestamps` collected records require both `started_at` and
  `collected_at`, with `collected_at >= started_at`.
- `collection_date_duration` records require `collection_date`,
  `duration_amount > 0`, and `duration_unit_id`.
- `duration_unit_id` must reference a duration unit.
- Species/result commands are allowed only for collected records.

### Bycatch naming

Rename the domain meaning of `collections.is_non_mosquito` to bycatch:

- Preferred schema field: `has_bycatch boolean not null default false`
- Meaning: non-mosquito bycatch was present.
- Mosquito species rows may exist while `has_bycatch = true`.
- `is_zero_result = true` remains mutually exclusive with active
  `collection_species` rows.

### Units

Add stable unit codes:

- `units.code text not null unique`

Duration conversion is handled in app/domain code using stable unit codes. The
initial reporting base is hours; days convert to 24 hours. Do not teach the
database unit conversion logic for the first pass.

### Comments

Adult surveillance comments attach only to:

- `trap`
- `collection`

They do not attach to `collection_species`.

Deleting a trap or collection should cascade soft-delete related adult
surveillance comments.

### Metadata

`collections.metadata` stores method-specific values guided by
`collection_methods.custom_schema`.

Custom schema validation is warning-only for adult surveillance entry. Hard
rules are limited to metadata being a JSON object or null.

Metadata updates replace the whole object, last-write-wins.

### Geometry

Adult surveillance trap and ad hoc collection features should be point
geometries.

Server command handlers should validate explicit geometry sources:

- trap create/location commands carry Point geometry.
- adult ad hoc collection create/location commands carry Point geometry.

Adult trap and ad hoc collection create/location commands carry
`locationSource`, not database geometry columns. The source flow is
intentionally narrow:

- trap geometry may come from explicit point geometry or address geometry.
- adult ad hoc collection geometry may come from explicit point geometry,
  address geometry, or trap geometry.

The server stores explicit geometry directly on the target row or copies the
source record's owned geometry onto the target row.

### Trap display and lifecycle

Trap create/reactivate/update must preserve:

- At least one of `trap_name` or `trap_code`.
- Duplicate active `trap_code` values are allowed only with acknowledgement.
- Duplicate code checks are scoped to active, non-deleted traps in the same org,
  trim whitespace, and compare case-insensitively.

Trap code changes with child collections require acknowledgement that historical
child records report under the new code.

Trap configuration changes:

- Method changes require strong semantic-change acknowledgement.
- Location changes require strong semantic-change acknowledgement.
- Lure changes are UI-note only.

Retiring a trap blocks when pending collections exist. Deleting a trap can
cascade soft-delete pending and collected child collections with
acknowledgement.

Reactivating a trap requires active method and active lure when present.

### Lookup lifecycle

Collection method/lure deactivation is blocked when active, non-deleted traps
reference the lookup.

Lookup deletion is allowed only when unreferenced; otherwise use deactivate.

Inactive non-deleted lookups should sync for historical display. New selections
must use active lookups only.

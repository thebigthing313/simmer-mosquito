# Larval Surveillance Domain Decisions

This captures the larval surveillance command and schema decisions from the
domain interview. It is intentionally implementation-facing; broader
architecture decisions remain in `docs/adr/`.

## Command Groups

Habitat catalog commands are mostly manager-and-above workflows:

- `larvalSurveillance.createHabitat`
- `larvalSurveillance.createHabitatFromInspection`
- `larvalSurveillance.updateHabitatDetails`
- `larvalSurveillance.updateHabitatLocation`
- `larvalSurveillance.updateHabitatConfiguration`
- `larvalSurveillance.markHabitatInaccessible`
- `larvalSurveillance.clearHabitatInaccessible`
- `larvalSurveillance.retireHabitat`
- `larvalSurveillance.reactivateHabitat`
- `larvalSurveillance.deleteHabitat`
- `larvalSurveillance.mergeHabitats`

Collectors may update low-risk habitat details and accessibility:

- `larvalSurveillance.updateHabitatDetails`
- `larvalSurveillance.markHabitatInaccessible`
- `larvalSurveillance.clearHabitatInaccessible`

Inspection workflow commands are collector-and-above workflows:

- `larvalSurveillance.recordHabitatInspection`
- `larvalSurveillance.recordAdHocInspection`
- `larvalSurveillance.updateInspectionFieldDetails`
- `larvalSurveillance.updateAdHocInspectionLocation`
- `larvalSurveillance.deleteInspection`

Sample workflow commands are collector-and-above workflows, except unlabeled
sample creation:

- `larvalSurveillance.addInspectionSample`
- `larvalSurveillance.addUnlabeledInspectionSample`
- `larvalSurveillance.updateInspectionSample`
- `larvalSurveillance.deleteInspectionSample`
- `larvalSurveillance.markSampleZeroLarvae`
- `larvalSurveillance.clearSampleZeroLarvae`
- `larvalSurveillance.setSampleNonMosquitoPresence`
- `larvalSurveillance.setSampleUnidentifiableReason`

Sample species analysis commands are collector-and-above workflows:

- `larvalSurveillance.addSampleSpeciesCount`
- `larvalSurveillance.updateSampleSpeciesCount`
- `larvalSurveillance.deleteSampleSpeciesCount`

Adjacent shared domains own:

- Habitat type lookup management.
- Organization settings, including larval inspection entry policy and timezone.
- Organization species curation.
- Habitat, inspection, and sample comments.
- Tags and additional personnel.
- Routes and assignments.

## Important Semantics

`habitats` are stable, reusable larval surveillance sources or locations that an
agency may return to: catch basins, ditch segments, tire piles, ponds,
wetlands, containers, stormwater structures, and similar sources. Habitats are
catalog records, not inspections.

`inspections` are field visit or observation transactions. They may reference a
cataloged habitat, or they may be ad hoc records with `habitat_id = null`.
Ad hoc inspections carry their own `feature_id`, optional `address_id`, and
optional `habitat_type_id`.

`recordHabitatInspection` and `recordAdHocInspection` are separate commands.
Habitat inspection creation copies the habitat's current `feature_id`,
`address_id`, and `habitat_type_id` into the inspection row. It does not allow
creation-time overrides. Later habitat edits affect future inspections only;
historical inspection snapshot fields remain unchanged.

Inspections can stand alone. Not every inspection creates a sample. Samples and
sample species counts are separate downstream transactions.

Deleted records are soft-deleted and excluded from normal Electric/TanStack DB
replicas. Retired habitats remain replicated for historical context.

## Habitat Lifecycle

Habitat lifecycle fields have distinct meanings:

- `is_active = false` means retired from routine surveillance.
- `is_inaccessible = true` is only a current operational guidance flag.
- `deleted_at is not null` means the habitat catalog record should not appear
  in normal operational views.

Inaccessible state lives only on the habitat. It is not snapshotted onto
inspections. Inaccessible habitats may still receive inspections; the flag
warns or guides users, but does not block inspection creation.

Retiring a habitat:

- sets `is_active = false`;
- blocks new habitat inspections until reactivated;
- soft-deletes active route items targeting the habitat;
- leaves assignment items unchanged because assignments are snapshots;
- leaves inspections and cross-domain operational records unchanged;
- requires acknowledgement when route items will be removed.

Reactivating a habitat:

- is idempotent when already active;
- validates active references, including active habitat type when present;
- does not restore route items removed during retirement.

Marking or clearing inaccessible is idempotent.

## Habitat Details And Configuration

`updateHabitatDetails` is collector-and-above and may update:

- `habitat_name`
- `description`
- `metadata`

`description` is required and must not be blank. `habitat_name` is optional and
non-unique. Duplicate names may warn in UI, but do not block commands.

`metadata` is guided by `habitat_types.custom_schema`. Hard validation only
checks that metadata is a JSON object or null. Custom schema mismatch is a
warning, not a hard rejection. Metadata updates replace the whole object.

Manager-and-above commands own higher-risk changes:

- `updateHabitatLocation` changes `feature_id`.
- `updateHabitatConfiguration` changes `address_id` and `habitat_type_id`.

If a habitat already has inspections or cross-domain references, location or
configuration changes require acknowledgement. Existing inspection snapshots
and cross-domain record fields are not rewritten.

## Habitat Delete

`deleteHabitat` is manager-and-above and is for erroneous catalog records, not
normal lifecycle. Retire should be encouraged when the source was legitimately
inspectable.

If active inspections reference the habitat, deletion is blocked unless the
manager explicitly acknowledges detaching those inspections. With acknowledgement:

- the habitat is soft-deleted;
- referencing inspections are preserved with `habitat_id = null`;
- inspection snapshot `feature_id`, `address_id`, and `habitat_type_id` remain
  unchanged;
- samples, sample species rows, and inspection/sample comments remain intact;
- direct habitat comments, tags, and additional personnel are soft-deleted;
- route and assignment items targeting the habitat are soft-deleted;
- cross-domain `habitat_id` references are nulled where the schema allows while
  preserving the operational records.

Separate acknowledgement flags should distinguish deleting the habitat catalog
record, detaching inspections, and detaching cross-domain records.

## Habitat Promotion

`createHabitatFromInspection` is manager-and-above.

The source inspection must be:

- same organization;
- non-deleted;
- ad hoc, with `habitat_id = null`.

The command creates a new habitat using the inspection snapshot:

- `feature_id`
- `address_id`
- `habitat_type_id`

No overrides are allowed for location, address, or type. The command requires a
new non-empty habitat `description`, and accepts optional `habitatName` and
metadata. If the inspection has no habitat type, the habitat is created without
a type.

After creating the habitat, the command attaches the source inspection by
setting `inspection.habitat_id` to the new habitat. Existing inspection
comments, tags, additional personnel, samples, sample species rows, and
cross-domain inspection references remain unchanged. They are not copied to the
new habitat.

There is no age limit for promotion.

## Habitat Merge

`mergeHabitats` is manager-and-above and is part of v1.

The command input should include:

- `targetHabitatId`
- one or more `sourceHabitatIds`
- explicit acknowledgement that merge consolidates history

Server validation enforces:

- all habitats are in the same organization;
- target is active and non-deleted;
- sources are non-deleted and not the target;
- sources may be active or inactive;
- geometry, address, and habitat type differences are allowed with strong
  acknowledgement.

Merge preserves the target habitat as authoritative. It does not blend source
fields into the target:

- `habitat_name`
- `description`
- `metadata`
- `feature_id`
- `address_id`
- `habitat_type_id`
- `is_inaccessible`
- `is_active`

Merge re-points source references to the target:

- `inspections.habitat_id`
- cross-domain `habitat_id` references, such as applications and biocontrol
  actions
- direct habitat comments
- direct habitat tags
- direct habitat additional personnel
- route items targeting source habitats
- assignment items targeting source habitats

Inspection snapshot fields do not change. Cross-domain records' own
feature/address/date fields do not change.

Route and assignment items are deduped when the target already appears in the
same route or assignment. Keep the existing target item, preserve its position,
and soft-delete the duplicate source item. When there is no duplicate, preserve
the re-pointed source item position and directions.

Moved comments, tags, and additional personnel keep original author and created
audit fields. The merge updates only the target reference and technical update
fields. Duplicate tags/personnel are deduped by keeping one active association.

Source habitats are soft-deleted after merge. There is no v1 undo merge command.

## Inspection Result Policy

Larval inspection result validation depends on resolved organization settings.
Missing org settings must resolve to defaults instead of blocking entry.

Default larval inspection entry policy:

- mode: `hybrid`
- no density ranges

Supported modes:

- `density_only`
- `count_and_dips_required`
- `hybrid`

`is_wet = false` means a dry source. Dry inspections must not carry abundance
or life-stage data: no density, no larvae count, no dip count, no life-stage
flags, and no samples.

`is_wet = true` requires the result fields demanded by the resolved policy:

- `density_only`: requires `density`; allows optional positive `dip_count`;
  forbids `larvae_count`.
- `count_and_dips_required`: requires `larvae_count` and positive `dip_count`.
- `hybrid`: requires either `density` or `larvae_count` plus positive
  `dip_count`; optional positive `dip_count` may accompany density entries.

`dip_count > 0` with `density = 'none'` is valid and means dipped/inspected with
no larvae found. `dip_count` alone does not indicate breeding.

`larvae_count` must be nonnegative when present. When `larvae_count` is present,
`dip_count` is required.

Contradictions are invalid:

- `density = 'none'` with `larvae_count > 0`
- `density != 'none'` with `larvae_count = 0`

Breeding is indicated by `density != 'none'` or `larvae_count > 0`. If breeding
is indicated, at least one life-stage flag is required.

Wet-zero inspections are represented by wet/dry plus abundance fields. Do not
add `inspections.is_zero_result`.

## Density Inference

Organization settings may define density ranges for larvae per dip:
`larvae_count / dip_count`.

Ranges apply to:

- `light`
- `medium`
- `heavy`
- `very_heavy`

`none` is inferred only from `larvae_count = 0`.

Organization settings commands must validate density range configuration before
saving. Larval commands can assume saved ranges are valid. Valid ranges should
be positive, finite where bounded, non-overlapping, and cover positive values
when inference is enabled. The final bucket may be open-ended.

When valid ranges exist and count/dip data is provided:

- the command infers and stores `density`;
- an explicitly provided density must match the inferred density;
- conflicting density is rejected.

When ranges are absent, count/dip data is accepted without inference.

## Inspection Updates And Deletes

`updateInspectionFieldDetails` replaces the full interdependent result state:

- `inspectionDate`
- `inspectedByProfileId`
- `isWet`
- `dipCount`
- `density`
- `larvaeCount`
- life-stage flags

The command re-runs full policy validation against the final state.

If active samples exist, inspection updates cannot produce a final state that
contradicts sample existence:

- `is_wet = false`;
- no breeding evidence;
- no life-stage flags while breeding evidence remains.

If sample species rows exist, changing `inspection_date` is allowed only when
every active `sample_species.identified_at >= newInspectionDate`.

`updateAdHocInspectionLocation` is separate and applies only to ad hoc
inspections. It may update:

- `feature_id`
- `address_id`
- `habitat_type_id`

Collector corrections for inspections are limited to their own records within
30 days of the current stored `inspection_date`. Managers can correct older
records and records for other profiles.

Collectors may delete their own standalone inspections within 30 days only when
the inspection has no associated active records. Inspections with associated
records require manager-and-above.

Deleting an inspection:

- soft-deletes larval-owned child samples and sample species rows;
- soft-deletes comments, tags, and additional personnel targeting the inspection
  or its samples;
- preserves cross-domain operational records by nulling `inspection_id` where
  the schema allows;
- requires acknowledgement when associated records exist.

## Samples

A sample means larvae or suspected larvae were collected from a breeding-positive
wet inspection. Sample creation requires the parent inspection to be wet and to
indicate breeding through non-`none` density or positive larvae count.

If an inspection has active samples, inspection edits cannot produce a final
state that contradicts the existence of those samples. Samples must be deleted
first.

`addInspectionSample` is the normal field workflow:

- collector-and-above;
- requires a non-empty `displayName`;
- collectors may add samples only to their own inspections within 30 days of
  `inspection_date`;
- managers may add labeled samples to any valid inspection.

`addUnlabeledInspectionSample` is a manager-and-above exception:

- permits `display_name = null`;
- supports after-the-fact office entry where the sample was collected and
  analyzed immediately;
- should encourage, but not require, a sample comment.

Active non-null sample display names must be unique within the inspection after
trimming and case folding. Null display names are allowed only through the
unlabeled manager command.

`updateInspectionSample` uses patch semantics for `displayName`:

- labeled samples can be renamed to another non-empty unique label;
- labeled samples cannot be converted to unlabeled;
- manager-and-above can add a label to an unlabeled sample later;
- collectors cannot modify unlabeled samples.

Deleting a sample does not change parent inspection result fields. If deleting
the last sample, the inspection may remain breeding-positive with no samples.

Collectors may delete their own standalone labeled samples within 30 days of the
parent inspection date only when no associated records exist. Deleting a sample
with species rows, comments, tags, or additional personnel requires
manager-and-above plus acknowledgement. Delete soft-deletes sample species rows
and sample-targeted comments/tags/personnel.

## Sample Result Semantics

`samples.is_zero_larvae` means the sample had no mosquito larvae at analysis,
even though the parent inspection indicated breeding. It covers bad samples,
detritus mistaken for larvae, degraded samples, or samples that hatched before
analysis.

The sample non-mosquito flag should be named `hasNonMosquito` in domain/API
language. It means non-mosquito organisms or material were present. It does not
mean the sample is exclusively non-mosquito.

Rules:

- `markSampleZeroLarvae` rejects while active sample species rows exist.
- Species rows must be deleted and `clearSampleZeroLarvae` called before adding
  species counts after a zero-larvae result.
- `is_zero_larvae = true` may coexist with `hasNonMosquito`.
- `is_zero_larvae = true` may coexist with `unidentifiableReason`.
- `hasNonMosquito` may coexist with species rows.
- `unidentifiableReason` may coexist with species rows.

`unidentifiable_reason` remains free text for v1. It accepts non-empty trimmed
text or clears to null. It is structured enough for reporting but does not
replace comments.

Sample result flags and unidentifiable reason follow lab-analysis permissions.
Collectors may set them on any sample in their organization, subject to the
30-day window anchored to the parent inspection date. Managers may correct older
samples. V1 does not add sample-level analysis attribution/date fields; command
audit can cover that later.

## Sample Species Analysis

Species identification happens at the larval stage. `sample_species.larvae_count`
is enough for v1; do not add per-species pupae or egg counts yet. Parent
inspection life-stage flags capture life stages present.

Rules:

- one active species row per sample/species;
- `larvae_count > 0`;
- `identified_at` is required, date-only, not future, and must be on or after
  the parent `inspection_date`;
- `identified_by_profile_id` defaults to the acting profile;
- collectors can add species counts as themselves for any sample in their
  organization;
- managers can backfill or correct on behalf of another identifier;
- collectors can update/delete only their own analysis rows within 30 days of
  the current stored `identified_at`.

Organization species curation uses an "allow all until curated" rule:

- if the organization has zero `organization_species` rows, all global species
  are allowed;
- once the organization has at least one `organization_species` row, new species
  counts must use species in that organization list;
- organization species curation is owner/admin;
- keep the current join-table behavior for v1.

## Dates And Timezones

Inspection and identification dates are date-only.

Rules:

- reject future inspection dates;
- reject future identification dates;
- require `identified_at >= inspection_date`;
- changing `inspection_date` must not make existing species identification dates
  earlier than the inspection date.

The 30-day collector correction window is date-based and inclusive through the
30th day. Use the current stored record date to determine edit eligibility so a
user cannot move an old record to today to reopen editing.

Date rules should resolve "today" in the organization's configured timezone
when available. Timezone belongs in shared organization settings, not larval
settings. Missing timezone should resolve to a default.

## Permissions

Habitat catalog:

- manager-and-above can create habitats, promote inspections to habitats,
  update location/configuration, retire/reactivate/delete, and merge habitats;
- collectors can update habitat details and mark/clear inaccessible;
- habitat type lookup management is owner/admin.

Inspection workflow:

- collector-and-above can record inspections;
- collectors act only as themselves;
- manager-and-above can backfill on behalf of another active profile;
- collectors can correct their own inspection field details and ad hoc
  location/configuration within 30 days;
- manager-and-above can correct older or other-profile inspections.

Sample workflow:

- collectors can add labeled samples only to their own inspections within 30
  days;
- unlabeled sample creation is manager-and-above;
- collectors can delete standalone own labeled samples within 30 days;
- sample deletes with associated records are manager-and-above.

Analysis workflow:

- collector-and-above can add species counts and set sample result flags for
  samples in their organization;
- collectors act as themselves for species count identification;
- manager-and-above can backfill/correct on behalf of another profile;
- collectors can update/delete only their own species rows within 30 days.

## Lookup Lifecycle

Habitat type lookup lifecycle follows shared org lookup rules:

- owner/admin manages habitat types;
- new habitats and ad hoc inspections may select only active, non-deleted
  habitat types;
- inactive habitat types remain valid for historical display;
- deactivating a habitat type is blocked while active, non-deleted habitats
  reference it;
- deleting a habitat type is allowed only when unreferenced; otherwise use
  deactivate;
- reactivating a habitat with `habitat_type_id` requires the habitat type to be
  active.

## Comments, Tags, And Personnel

Commentable larval entities:

- `habitat`
- `inspection`
- `sample`

`sample_species` is not commentable.

Tags and additional personnel are shared field-work/support concepts. Larval
commands do not create them inline, but delete and merge commands must handle
their polymorphic associations.

## Geometry

Larval habitats and ad hoc inspections allow these geometry types for v1:

- `Point`
- `LineString`
- `Polygon`

Multi-geometries and geometry collections are deferred:

- `MultiPoint`
- `MultiLineString`
- `MultiPolygon`
- `GeometryCollection`

Habitat inspections copy the habitat's feature regardless of allowed type.
Server command handlers validate spatial feature existence and allowed geometry
for habitat creation, habitat location updates, and ad hoc inspection creation
or correction.

## Mobile And Offline

Larval commands should accept client-generated UUIDs where possible:

- `habitatId`
- `inspectionId`
- `sampleId`
- `sampleSpeciesId`

Offline queues should store domain commands, not DB-shaped patches. Server
handlers revalidate permissions, organization settings, active references,
dates, density inference, geometry, and same-organization consistency when
commands replay.

Offline collectors can create ad hoc inspections, cataloged habitat inspections,
and labeled samples. Offline unlabeled sample creation requires a cached
manager-and-above role and is still server-revalidated.

Conflicts should produce command failure visible to the client, not silent patch
merging.

## Schema Migration Backlog

These schema updates surfaced during the domain interview and should be batched
into a future migration after the domain commands are hardened.

### Inspection Checks

Add low-risk, policy-independent checks:

- `inspections.dip_count > 0` when present
- `inspections.larvae_count >= 0` when present

Do not DB-enforce wet/dry combinations, density policy, breeding life-stage
requirements, sample requires breeding, org species curation, or date ordering.
Those depend on command context, organization settings, soft deletes, or joins.

### Sample Species Uniqueness

Replace hard uniqueness on `sample_species (sample_id, species_id)` with a
soft-delete-aware partial unique index:

```sql
create unique index sample_species_active_sample_species_unique
  on sample_species (sample_id, species_id)
  where deleted_at is null;
```

This keeps one active species row per sample/species while allowing re-add after
soft delete.

### Sample Naming

Keep `samples.display_name` nullable. The command layer distinguishes normal
labeled sample creation from manager-only unlabeled creation.

Consider a partial unique index for active non-null display names per inspection
if command-level uniqueness proves insufficient.

### Non-Mosquito Naming

Rename the DB column from `samples.is_non_mosquito` to `has_non_mosquito`.
Prefer domain/API field name `hasNonMosquito`.

### Settings Types

Typed organization settings are defined in `docs/organization-settings-domain.md`
and `packages/domain/src/organization-settings.ts` for:

- `larvalSurveillance.inspectionEntryPolicy`
- shared organization timezone

Settings commands must validate saved larval density ranges and timezone names.
Larval commands consume resolved settings and default missing settings.

### Deferred Schema

Do not add for v1 unless a concrete workflow demands it:

- `inspections.is_zero_result`
- inspection metadata
- sample metadata
- sample-level analysis attribution/date fields
- habitat lifecycle timestamps
- merge audit or undo columns
- per-species pupae or egg counts
- multi-geometry support

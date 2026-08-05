# Control Operations Domain Decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records control
operations vocabulary and exceptions.

This captures the control operations command and schema decisions from the
domain interview. It is intentionally implementation-facing; broader
architecture decisions remain in `docs/adr/`.

## Command Groups

Control operations commands live behind a framework-agnostic public domain
seam:

- `packages/domain/src/control-operations.ts`

The public seam re-exports implementation modules under
`packages/domain/src/control-operations/`:

- `methods.ts`: application, source reduction, outreach, and biocontrol method
  catalog commands
- `assets.ts`: vehicle and equipment commands
- `products.ts`: insecticides, batches, formulations, formulation components,
  and formulation expansion helpers
- `actions.ts`: performed chemical application, source reduction, outreach,
  and biocontrol action commands
- `requests.ts`: requested control action commands
- `core.ts`: command context, common helper types, and shared control-operation
  validation utilities

Every command payload includes:

- `organizationId`
- `actorProfileId`

Server `AuthContext` remains authoritative. Command context exists for command
metadata, optimistic UI, offline replay, and client-side command logs, and must
match the server-resolved context.

Use the command namespace `controlOperations.*`. Use domain language
`chemicalApplication` for the DB table currently named `applications`.

### Method Catalog Commands

Application method commands:

- `controlOperations.createApplicationMethod`
- `controlOperations.updateApplicationMethod`
- `controlOperations.deactivateApplicationMethod`
- `controlOperations.reactivateApplicationMethod`
- `controlOperations.deleteApplicationMethod`

Source reduction method commands:

- `controlOperations.createSourceReductionMethod`
- `controlOperations.updateSourceReductionMethod`
- `controlOperations.deactivateSourceReductionMethod`
- `controlOperations.reactivateSourceReductionMethod`
- `controlOperations.deleteSourceReductionMethod`

Outreach method commands:

- `controlOperations.createOutreachMethod`
- `controlOperations.updateOutreachMethod`
- `controlOperations.deactivateOutreachMethod`
- `controlOperations.reactivateOutreachMethod`
- `controlOperations.deleteOutreachMethod`

Biocontrol method commands:

- `controlOperations.createBiocontrolMethod`
- `controlOperations.updateBiocontrolMethod`
- `controlOperations.deactivateBiocontrolMethod`
- `controlOperations.reactivateBiocontrolMethod`
- `controlOperations.deleteBiocontrolMethod`

Owners/admins may create, deactivate, reactivate, and delete methods. Managers
may update method details:

- `name`
- `customSchema`

### Vehicle And Equipment Commands

Vehicle commands:

- `controlOperations.createVehicle`
- `controlOperations.updateVehicle`
- `controlOperations.deactivateVehicle`
- `controlOperations.reactivateVehicle`
- `controlOperations.deleteVehicle`

Equipment commands:

- `controlOperations.createEquipment`
- `controlOperations.updateEquipment`
- `controlOperations.deactivateEquipment`
- `controlOperations.reactivateEquipment`
- `controlOperations.deleteEquipment`

Manager-and-above manages vehicles and equipment.

### Insecticide And Batch Commands

Insecticide commands:

- `controlOperations.createInsecticide`
- `controlOperations.updateInsecticide`
- `controlOperations.deactivateInsecticide`
- `controlOperations.reactivateInsecticide`
- `controlOperations.deleteInsecticide`

Insecticide batch commands:

- `controlOperations.createInsecticideBatch`
- `controlOperations.updateInsecticideBatch`
- `controlOperations.deactivateInsecticideBatch`
- `controlOperations.reactivateInsecticideBatch`
- `controlOperations.deleteInsecticideBatch`

Owners/admins manage insecticide product catalog rows. Manager-and-above manages
insecticide batches because batches are operational inventory/lifecycle data.

### Formulation Commands

Formulation commands:

- `controlOperations.createFormulation`
- `controlOperations.updateFormulationDetails`
- `controlOperations.activateFormulation`
- `controlOperations.deactivateFormulation`
- `controlOperations.deleteFormulation`
- `controlOperations.addFormulationInsecticide`
- `controlOperations.updateFormulationInsecticide`
- `controlOperations.removeFormulationInsecticide`

Owners/admins manage formulations and formulation components.

### Chemical Application Commands

Chemical application commands:

- `controlOperations.recordChemicalApplication`
- `controlOperations.updateChemicalApplicationFieldDetails`
- `controlOperations.updateChemicalApplicationLocationAndContext`
- `controlOperations.deleteChemicalApplication`
- `controlOperations.addChemicalApplicationBatch`
- `controlOperations.removeChemicalApplicationBatch`

Chemical applications are single-insecticide persisted records. A formulation
may help calculate and generate several chemical application commands, but
formulation use is not stored on the application row.

### Non-Chemical Action Commands

Source reduction commands:

- `controlOperations.recordSourceReduction`
- `controlOperations.updateSourceReductionFieldDetails`
- `controlOperations.updateSourceReductionLocationAndContext`
- `controlOperations.deleteSourceReduction`

Outreach action commands:

- `controlOperations.recordOutreachAction`
- `controlOperations.updateOutreachActionFieldDetails`
- `controlOperations.updateOutreachActionLocationAndContext`
- `controlOperations.deleteOutreachAction`

Biocontrol action commands:

- `controlOperations.recordBiocontrolAction`
- `controlOperations.updateBiocontrolActionFieldDetails`
- `controlOperations.updateBiocontrolActionLocationAndContext`
- `controlOperations.deleteBiocontrolAction`

### Requested Control Action Commands

Requested control action commands:

- `controlOperations.requestControlAction`
- `controlOperations.updateRequestedControlActionDetails`
- `controlOperations.updateRequestedControlActionLocationAndContext`
- `controlOperations.resolveRequestedControlAction`
- `controlOperations.reopenRequestedControlAction`
- `controlOperations.deleteRequestedControlAction`

Requested control actions are included in the control operations domain because
actual control action records link to them. Missions and mission items belong
to the mission dispatch domain.

## Important Semantics

Control operations have three broad categories:

- Operational catalogs: methods, vehicles, equipment, batches.
- Compliance/product catalogs: insecticides and formulations.
- Performed or requested work: chemical applications, source reductions,
  outreach actions, biocontrol actions, and requested control actions.

Actual control action tables represent performed work, not planned work. Future
planned work belongs in missions or assignments.

Transaction rows do not have retired/inactive lifecycle states. They are either
valid history or soft-deleted correction records. Requested control actions also
have the workflow state `resolvedAt`/`resolvedByProfileId`.

## Units And Defaults

Operational quantity commands must carry explicit unit IDs. Defaults are UI and
helper behavior only.

Commands require explicit units for:

- chemical application `applicationUnitId`
- source reduction `sourcesEliminatedUnitId`
- biocontrol `releaseUnitId`
- insecticide `defaultUnitId`

Offline queued commands store the resolved unit ID. Server replay must not
reinterpret a queued command against a newer organization default.

Organization settings remain useful for UI defaults:

- `unitDefaults` stores unit codes.
- `controlOperations.trackInsecticideBatches` controls batch UI visibility.

`trackInsecticideBatches = true` means the app renders optional batch recording
UI. It must not prompt or require batch entry. `false` means official app UI
turns off batch-related controls. Server commands still accept and persist valid
batch data regardless of the setting.

Server handlers validate unit existence and unit type. Pure command builders
validate only context-free numeric and UUID shape rules.

Unit type rules:

- chemical application unit type must match the selected insecticide default
  unit type
- source reduction units allow `count`, `distance`, `area`, and `volume`
- biocontrol units allow `count`, `volume`, and `weight`
- outreach `reach` is a positive integer and does not use a unit row

## Method Catalog Lifecycle

Method catalogs are organization-scoped lookup/custom-form rows:

- application methods
- source reduction methods
- outreach methods
- biocontrol methods

Method names are required and unique within an organization after trimming and
case folding. Display casing is preserved.

`customSchema` is a JSON object or null:

- `undefined` in update means no change
- `null` clears the schema
- object replaces the whole schema
- arrays and scalar values are invalid

Custom schemas guide UI and may produce warnings. They are not hard-blocking
validation for action entry in v1. Schema mismatch must not cause offline replay
of otherwise valid core commands to fail.

New action records may select only active, non-deleted methods. Inactive methods
remain synced and valid for historical display. Updates that leave an existing
inactive method unchanged are allowed. Updates that select a different method
must select an active, non-deleted method.

Changing a method name requires `acknowledgedHistoricalLabelChange` if
non-deleted historical actions, requested actions, or missions reference that
method. Changing `customSchema` does not require acknowledgement because
historical metadata is not reinterpreted.

Deactivating a method is blocked or requires acknowledgement when unresolved
requested control actions or active/scheduled missions reference it. Deletion is
allowed only when no non-deleted records reference the method.

## Vehicles And Equipment

Vehicles and equipment are operational catalogs.

Vehicles:

- `vehicleName` is required
- `metadata` is JSON object or null
- names are not unique

Equipment:

- `equipmentName` is required
- `serialNumber` is optional
- `metadata` is JSON object or null
- names are not unique
- non-null serial numbers are unique per organization after trim/case folding
  among non-deleted equipment

Vehicles and equipment should gain `is_active` lifecycle fields in a follow-up
schema migration. New chemical applications may select only active, non-deleted
vehicles/equipment. Existing inactive references remain valid for historical
display and unchanged corrections.

Vehicle/equipment identity edits require acknowledgement when referenced by
non-deleted applications:

- vehicle `vehicleName`
- equipment `equipmentName`
- equipment `serialNumber`

Metadata changes do not require historical acknowledgement. Deactivation does
not require acknowledgement. Deletion is allowed only when unreferenced by
non-deleted applications; referenced vehicle/equipment rows must remain as
historical context.

## Insecticides

`insecticides` are the agency product catalog.

Create requires:

- `insecticideId`
- `tradeName`
- `activeIngredient`
- `type`
- `registrationNumber`
- `defaultUnitId`

Create and update may include:

- `labelUrl`
- `msdsUrl`
- `shorthand`
- `metadata`

V1 command payloads intentionally omit:

- `inventoryUnitId`
- `conversionFactor`

Those fields are future inventory feature plumbing. V1 creates should store
them as null. Existing non-null imported values may remain in the database, but
V1 domain commands do not edit them.

`type` matches the current DB enum:

- `larvicide`
- `adulticide`
- `pupicide`
- `other`

`tradeName + registrationNumber` is unique per organization after trimming and
case folding among non-deleted insecticides. Duplicate trade names alone may
warn in UI but do not block.

`registrationNumber` and `activeIngredient` are required non-empty text. If an
agency has a product without a formal registration number, it may intentionally
use an explicit value such as `N/A` according to local policy; blank values are
not stored.

`labelUrl` and `msdsUrl` use lightweight validation:

- trim whitespace
- empty string becomes null
- require parseable `http://` or `https://` URL
- do not fetch or verify reachability

`shorthand` is optional display/search convenience, not identity. It is not
unique.

New chemical applications may use only active, non-deleted insecticides.
Historical applications keep displaying inactive insecticides.

Changing historically meaningful product fields requires
`acknowledgedHistoricalProductChange` once non-deleted applications reference
the insecticide:

- `tradeName`
- `activeIngredient`
- `registrationNumber`
- `type`
- `defaultUnitId`

Label/MSDS URLs, shorthand, and metadata do not require that acknowledgement.

`defaultUnitId` is editable by owner/admin:

- if applications exist, the new default unit must have the same unit type as
  the old default
- if no applications exist, changing to another unit type is allowed
- existing applications keep their explicit amount and unit
- if formulations reference the insecticide, unit type changes require
  acknowledgement because future formulation helper math may change meaning

Insecticide deactivation may cascade dependent deactivation with acknowledgement:

- active batches should be deactivated
- active formulations using the insecticide should be deactivated, or otherwise
  become unavailable because active formulations require active components

Insecticide deletion is allowed only when no non-deleted dependent rows
reference it, including batches, formulation components, applications, requested
actions, or mission-related references. Inactive but non-deleted dependents
still block deletion. Soft-deleted dependent rows are not operational blockers.

## Insecticide Batches

Insecticide batches are operational inventory/lifecycle rows under an
insecticide.

Batch commands are manager-and-above.

`batchName` is required and unique per insecticide after trimming and case
folding among non-deleted batches.

New application batch links require active, non-deleted batches that belong to
the selected application insecticide. Existing inactive batch links remain valid
for historical display. Removing a batch link is allowed even if the batch is
now inactive.

Batch deactivation is allowed even when the batch is referenced by applications.
Inactive means unavailable for new selection, not historically invalid.

Batch name changes require `acknowledgedHistoricalBatchLabelChange` when
non-deleted application batch links reference the batch. Deactivation does not
require acknowledgement. Reactivating a batch requires the parent insecticide to
be active. Deleting a used batch is blocked.

Application batches track provenance only in v1. They record which batches were
used, not how much of the application amount came from each batch.

## Formulations

Formulations are convenience calculators/templates only. They are not persisted
on chemical applications.

If a user applies a formulation with multiple insecticides, the UI/domain helper
expands the formulation into separate `recordChemicalApplication` commands, one
per component insecticide. Each persisted application row stores only its real
insecticide, amount, unit, and optional batches.

Do not add `applications.formulation_id` for v1. If users need historical
formulation usage later, consider it in a future release.

A formulation is a recipe stated the way a product label states it: one batch
makes a given amount of finished mix and takes a given amount of each product.
"0.5 lb of material into 26 gallons of water" is `batchSize` 26 gallons with one
component of `amount` 0.5 pounds.

Formulation fields:

- `formulationName` required and unique per organization after trim/case fold
- `description` optional
- `batchSize > 0` with a required `batchUnitId`
- component `amount > 0` with a required `unitId`

Every amount carries its own unit and none of them are relative parts. A
component's unit is independent of the batch unit, which is what lets a weight of
product come out of a mix measured by volume. Do not reintroduce dimensionless
ratios: they cannot express a label rate, and they silently assume the product
and the diluent are measured the same way.

Formulations may be created as drafts with zero components. Activation requires
at least one active, non-deleted insecticide component. Active formulations must
remain valid:

- adding an inactive insecticide to an active formulation is rejected
- removing the last active component from an active formulation is rejected
  unless `acknowledgedDeactivateEmptyFormulation` is true, in which case the
  formulation is deactivated
- activation fails when any component insecticide is inactive or deleted

Deactivating a formulation is always allowed. Deleting a formulation soft-deletes
its component rows. Deleting with active component rows requires
`acknowledgedComponentDeletion`.

Formulation edits are prospective template edits and do not require historical
acknowledgement because no historical application stores formulation usage.

## Formulation Helpers

The control operations public seam exports pure formulation helpers:

- `calculateFormulationComponentAmounts`
- `expandFormulationApplicationCommands`

Helpers must not depend on DB access or persisted formulation usage.

`calculateFormulationComponentAmounts` accepts the amount of mix that went out,
the formulation's `batchSize`, and its components. Applying `totalAmount` of a
mix is `totalAmount / batchSize` batches, so each component scales by that factor
and is returned in its own `unitId` — 0.5 lb per 26 gal, applied over 78 gal, is
1.5 lb. No unit conversion is performed or required.

`expandFormulationApplicationCommands` should:

- accept shared application context
- accept caller-provided application IDs
- record each generated application in its component's own `unitId`
- accept optional per-component batch mappings
- require caller-provided `applicationBatchId` values
- return ordinary single-insecticide `RecordChemicalApplicationCommand` values
- omit `formulationId` from command payloads

Generated applications from one formulation expansion are not linked together in
v1. Do not add `formulationRunId`, grouping IDs, or formulation snapshots.

If unit conversion becomes necessary, helpers should accept an injected unit
conversion map rather than hard-coding database behavior.

## Control Action Context

Command payloads should use a shared nested context object instead of exposing
invalid flat combinations directly:

```ts
export type ControlActionContext =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'larval';
      readonly habitatId?: DomainId;
      readonly inspectionId?: DomainId;
    }
  | { readonly kind: 'adult'; readonly collectionId: DomainId };
```

`{ kind: 'larval' }` requires at least one of `habitatId` or `inspectionId`.
If both are present, the server validates that the inspection belongs to that
habitat when the inspection still references a habitat.

Adult control context uses `collectionId` only. Do not add direct `trapId`
context in v1.

`locationSource` and optional `addressId` remain top-level location fields, not
part of context:

- `locationSource` is required for create commands
- `addressId` is optional

`requestedControlActionId` also remains a separate optional linkage field. It
answers "which request/recommendation is this associated with?", while context
answers "what source record triggered or contextualizes this action?"

`locationSource` answers "where should this action/request snapshot its
geometry from?" Source flows are command-specific:

- actual control actions may be created ad hoc from explicit geometry, address
  geometry, service request geometry, or habitat geometry.
- actual control actions may inherit geometry from an inspection, requested
  control action, or mission item workflow.
- requested control actions may source geometry from explicit geometry, address
  geometry, habitat geometry, trap geometry, collection geometry, inspection
  geometry, or service request geometry.

The location source is independent from context: an action can be contextually
related to a habitat while using a different treatment boundary, or can snapshot
a known feature without becoming linked to that record.

Allowed context by command:

- chemical application: `none`, `larval`, or `adult`
- source reduction: `none` or `larval`
- biocontrol: `none` or `larval`
- outreach: `none` or larval `inspectionId`; no habitat-only outreach context
- requested control action with `controlType = 'application'`: `none`,
  `larval`, or `adult`
- requested control action with `controlType = 'source_reduction'`: `none` or
  `larval`
- requested control action with `controlType = 'biocontrol'`: `none` or
  `larval`
- requested control action with `controlType = 'outreach'`: `none` or larval
  `inspectionId`

Invalid combinations:

- adult `collectionId` with larval `habitatId` or `inspectionId`
- `collectionId` on source reduction or biocontrol
- direct `habitatId` or `collectionId` on outreach

Context and actual geometry are related but independent. Action/request
geometry may differ from linked habitat, inspection, collection, or requested
action geometry because treatment boundaries may be more precise or different.

## Owned Geometry And Addresses

Control commands carry `locationSource`, not database geometry columns. The
server stores explicit geometry directly on the target row or snapshots the
known source record's owned geometry onto the target row. Address selection can
prefill or contextualize geometry, but the control record owns its final
geometry snapshot.

Allowed geometry types for v1:

- `Point`
- `LineString`
- `Polygon`

Multi-geometries and geometry collections remain deferred globally:

- `MultiPoint`
- `MultiLineString`
- `MultiPolygon`
- `GeometryCollection`

When multi-geometry support is added, it should be added as a shared GIS/domain
capability and then adopted by control.

Addresses are org-scoped. If `addressId` is provided, the server must validate
same organization and non-deleted state. Address does not have to match feature
geometry exactly. Map-only actions may use null address.

Deleting an address is blocked while non-deleted control records or requested
actions reference it, consistent with shared field-work support lifecycle rules.

## Chemical Applications

`recordChemicalApplication` persists exactly one insecticide application.

Minimum required facts:

- `applicationId`
- `insecticideId`
- `amountApplied > 0`
- `applicationUnitId`
- `applicationDate`
- `applicatorProfileId` defaulting to actor
- `locationSource`
- `context`

Optional fields:

- `applicationMethodId`
- `addressId`
- `vehicleId`
- `equipmentId`
- `requestedControlActionId`
- initial `applicationBatches`
- `metadata`

`applicationMethodId` is optional. Product, amount/unit, date, performer, and
location are the core chemical application facts.

`amountApplied` is a positive finite number and may be fractional. It is not
converted automatically when insecticide or unit fields change.

Initial application batches use explicit child ID mappings:

```ts
applicationBatches?: readonly {
  readonly applicationBatchId: DomainId;
  readonly insecticideBatchId: DomainId;
}[];
```

The domain builder rejects duplicate `applicationBatchId` values and duplicate
`insecticideBatchId` values in the same create payload. Server validation
ensures each batch belongs to the selected insecticide.

`updateChemicalApplicationFieldDetails` owns ordinary editable facts:

- `applicationDate`
- `applicatorProfileId`
- `applicationMethodId`
- `insecticideId`
- `amountApplied`
- `applicationUnitId`
- `vehicleId`
- `equipmentId`
- `metadata`

Changing `insecticideId` is a guarded correction:

- collector may change it only on their own application within 30 days
- manager-and-above may correct older or other-profile applications
- new insecticide must be active, non-deleted, and same organization
- incompatible existing application batches cause rejection unless
  `acknowledgedBatchClearance` is true
- with acknowledgement, incompatible batch links are soft-deleted
- amount and unit are not automatically changed

`updateChemicalApplicationLocationAndContext` owns:

- `locationSource`
- `addressId`
- `context`
- `requestedControlActionId`

Location/context changes use normal correction permissions and reject
inconsistent requested action links. Requested action links may be cleared or
changed. Clearing or changing the link does not alter requested action
resolution state.

`addChemicalApplicationBatch` requires:

- `applicationBatchId`
- `applicationId`
- `insecticideBatchId`

`removeChemicalApplicationBatch` operates by `applicationBatchId`.

Collectors can add/remove batch links only for their own applications within 30
days of `applicationDate`. Managers can correct later or other-profile
applications. Adding requires an active, non-deleted batch for the parent
insecticide. Removing old links is allowed even if the batch is now inactive.

`deleteChemicalApplication` soft-deletes the application. It also soft-deletes
direct comments, direct additional personnel, and application batch links.
Deletion requires:

- `acknowledgedSupportRecordDeletion` when active comments or additional
  personnel exist
- `acknowledgedBatchDeletion` when active batch links exist

Collectors can delete their own standalone unlinked applications within 30 days
only when no support rows or batch links exist. If linked to a requested control
action, deletion requires manager-and-above.

## Source Reductions

Source reductions are performed larval-source intervention records. They mean
actual reduction happened; do not use them for attempted work that eliminated
zero sources.

`recordSourceReduction` requires:

- `sourceReductionId`
- `sourceReductionMethodId`
- `technicianProfileId` defaulting to actor
- `sourceReductionDate`
- `locationSource`
- `context` of `none` or `larval`
- `sourcesEliminatedAmount > 0`
- `sourcesEliminatedUnitId`

Optional fields:

- `addressId`
- `requestedControlActionId`
- `metadata`

`sourcesEliminatedAmount` is a positive finite number and may be fractional.
Allowed unit types are `count`, `distance`, `area`, and `volume`.

Add `source_reductions.habitat_id` in a follow-up schema migration so source
reductions can directly link to larval habitats without requiring an inspection.

`updateSourceReductionFieldDetails` owns:

- `sourceReductionDate`
- `technicianProfileId`
- `sourceReductionMethodId`
- `sourcesEliminatedAmount`
- `sourcesEliminatedUnitId`
- `metadata`

`updateSourceReductionLocationAndContext` owns:

- `locationSource`
- `addressId`
- `context`
- `requestedControlActionId`

`deleteSourceReduction` soft-deletes the source reduction and direct comments
and additional personnel. Linked requested actions, habitats, and inspections
are preserved.

## Outreach Actions

Outreach actions represent successful outreach, not attempted contact with no
reach.

`recordOutreachAction` requires:

- `outreachActionId`
- `outreachMethodId`
- `technicianProfileId` defaulting to actor
- `outreachDate`
- `locationSource`
- `context` of `none` or larval `inspectionId`
- `reach > 0`

Optional fields:

- `addressId`
- `requestedControlActionId`
- `reachDescription`
- `metadata`

`reach` is a positive integer. `reachDescription` is optional text. Unknown
reach should not be stored as zero; if at least one person/household was
reached, a conservative count of `1` may be used with a description.

Do not add direct `habitatId` or `collectionId` to outreach actions for v1.

`updateOutreachActionFieldDetails` owns:

- `outreachDate`
- `technicianProfileId`
- `outreachMethodId`
- `reach`
- `reachDescription`
- `metadata`

`updateOutreachActionLocationAndContext` owns:

- `locationSource`
- `addressId`
- `context`
- `requestedControlActionId`

`deleteOutreachAction` soft-deletes the outreach action and direct comments and
additional personnel. Linked requested actions and inspections are preserved.

## Biocontrol Actions

Biocontrol actions are performed larval-side intervention records.

`recordBiocontrolAction` requires:

- `biocontrolActionId`
- `biocontrolMethodId`
- `technicianProfileId` defaulting to actor
- `biocontrolDate`
- `locationSource`
- `context` of `none` or `larval`
- `amountReleased > 0`
- `releaseUnitId`

Optional fields:

- `addressId`
- `requestedControlActionId`
- `metadata`

`amountReleased` is a positive finite number and may be fractional. Allowed unit
types are `count`, `volume`, and `weight`.

`updateBiocontrolActionFieldDetails` owns:

- `biocontrolDate`
- `technicianProfileId`
- `biocontrolMethodId`
- `amountReleased`
- `releaseUnitId`
- `metadata`

`updateBiocontrolActionLocationAndContext` owns:

- `locationSource`
- `addressId`
- `context`
- `requestedControlActionId`

`deleteBiocontrolAction` soft-deletes the biocontrol action and direct comments
and additional personnel. Linked requested actions, habitats, and inspections
are preserved.

## Requested Control Actions

Requested control actions are lightweight recommendations or requests for
control follow-up. They are not missions and do not carry scheduling, due date,
or priority in v1.

`requestControlAction` requires:

- `requestedControlActionId`
- `controlType`
- `locationSource`
- `context`

Optional fields:

- `addressId`
- `recommendedMethodId`
- `summary`
- `requestedByProfileId`
- `requestedAt`

`requestedByProfileId` defaults to actor. Collectors cannot create on behalf of
others. Managers can backfill on behalf of another active profile.

`requestedAt` is an instant because it represents when the request was made. It
defaults to server receipt time when omitted. It cannot be future beyond a small
clock-skew allowance. Actual performed action dates remain date-only.

`summary` is optional, trimmed, and empty becomes null. Richer explanation
belongs in normal comments.

`recommendedMethodId` is polymorphic by `controlType` and validated in the
command/server layer:

- `application` -> `application_methods`
- `source_reduction` -> `source_reduction_methods`
- `biocontrol` -> `biocontrol_methods`
- `outreach` -> `outreach_methods`

Null means "recommend this control type, no specific method." Creating or
updating to a recommended method requires an active, non-deleted method. If the
method later becomes inactive, the request remains historically valid.

Valid context shapes:

- no source link, just feature/address
- larval habitat
- larval inspection
- larval habitat plus inspection when consistent
- adult collection

Do not allow both inspection and collection on the same requested action. Do not
allow collection with habitat.

Add `requested_control_actions.habitat_id` in a follow-up schema migration so
known habitat control can be requested without fabricating an inspection.

`updateRequestedControlActionDetails` owns:

- `controlType`
- `recommendedMethodId`
- `summary`
- `requestedByProfileId`
- `requestedAt`

Control type changes are manager-and-above only and allowed only while the
request is unresolved and unreferenced by actual actions or mission items. If
`controlType` changes, `recommendedMethodId` must be cleared or replaced with a
valid method for the new type. Context must remain valid for the new type.

Collectors may update `summary` and `recommendedMethodId` on their own
unresolved, unreferenced requests within 30 days. Collectors may not change
`controlType`, `requestedByProfileId`, or `requestedAt`.

Managers may correct `requestedByProfileId` and `requestedAt`. Permission
checks should use the stored/current timestamp before applying timestamp
changes.

`updateRequestedControlActionLocationAndContext` owns:

- `locationSource`
- `addressId`
- `context`

Collectors may fix their own unresolved and unreferenced request location or
context within 30 days. Manager-and-above handles resolved, referenced, older,
or other-profile requests.

`resolveRequestedControlAction` is manager-and-above. It sets:

- `resolvedAt`, defaulting server-side when omitted
- `resolvedByProfileId`

Resolving is allowed even when no actual action is linked. Resolution can mean
handled outside SIMMER, duplicate, no action needed, or not feasible. Use
comments for explanation in v1.

`reopenRequestedControlAction` is manager-and-above. It clears resolution fields
and leaves linked actual actions intact.

`deleteRequestedControlAction`:

- soft-deletes the requested action
- soft-deletes direct comments
- does not delete actual control actions

If actual actions reference it, deletion requires manager-and-above plus
`acknowledgedActionDetach`, then server nulls their
`requested_control_action_id`. If mission items reference it, deletion requires
`acknowledgedMissionDetach`, then server nulls
`mission_items.requested_control_action_id` according to mission-domain
detach rules.

Collectors cannot delete requested actions once referenced.

## Requested Action Link Consistency

Actual control actions may link to non-deleted requested control actions.
Resolution state does not affect link validity; both unresolved and resolved
requested actions may be linked for backfill/correction.

Type matching is required:

- chemical application -> `controlType = 'application'`
- source reduction -> `controlType = 'source_reduction'`
- biocontrol -> `controlType = 'biocontrol'`
- outreach -> `controlType = 'outreach'`

Method mismatch is allowed only with acknowledgement. If the request has
`recommendedMethodId` and the actual action has a different method, require an
explicit method mismatch acknowledgement. Chemical applications may also omit
`applicationMethodId`; if linked to a request with a recommended application
method, omission requires acknowledgement.

Context consistency is required where both sides specify context:

- request and action habitat IDs must match when both present
- request and action inspection IDs must match when both present
- request and action collection IDs must match when both present
- larval request context cannot link to an adult-context actual action
- adult request context cannot link to larval-context actual actions
- feature geometry does not have to match exactly

Link changes do not alter requested action resolution state.

## Dates And Timezones

Actual performed control action dates are date-only:

- `applicationDate`
- `sourceReductionDate`
- `outreachDate`
- `biocontrolDate`

Requested action timestamps are instants:

- `requestedAt`
- `resolvedAt`

Actual action dates cannot be future dates in the organization timezone.
Requested/resolved timestamps cannot be future beyond a small clock-skew
allowance.

Pure domain builders validate date shape and real calendar dates. Server
handlers resolve organization settings timezone, defaulting to
`America/New_York`, for authoritative future-date and 30-day window checks.

Collector correction windows are date-based and inclusive through the 30th day,
anchored to the stored action date or requested timestamp in the organization
timezone. Use the current stored record date/timestamp to determine edit
eligibility so users cannot move old records to today to reopen editing.

Do not add `recordedAt`, `clientObservedAt`, start/end timestamps, or duration
fields to control action commands for v1. Server audit timestamps and action
dates cover the current need.

## Permissions

Actual action recording:

- collector-and-above can record chemical applications, source reductions,
  outreach actions, and biocontrol actions
- collectors act only as themselves
- managers can backfill or correct on behalf of another active profile
- collectors can update/delete their own action records within 30 days of the
  stored action date when no supervisory/associated-record rules require
  manager escalation
- managers can update/delete older records and records for other performers

### What the server enforces today

The role floors and the performer correction window are enforced in
`apps/server/src/command-permissions.ts` and
`apps/server/src/command-ownership.ts`. A collector reaching an `update*` command
on one of these records must be the stored performer — `applicator_profile_id`
for applications, `technician_profile_id` for the rest,
`requested_by_profile_id` for requests — and the action date must be within 30
days, measured from the action date rather than from when the row was written.

**Deletion is stricter in code than in this section.** `deleteChemicalApplication`,
`deleteSourceReduction`, `deleteOutreachAction`, `deleteBiocontrolAction`, and
`deleteRequestedControlAction` are manager-and-above outright. The rule above
grants a collector their own recent record "when no supervisory/associated-record
rules require manager escalation" — support rows, batch links, and a linked
requested control action all escalate — and those preconditions are not
implemented. Refusing a collector who should have been allowed is the recoverable
direction to be wrong in; the reverse is not. See the follow-up issue linked from
#50.

Linked requested action deletion/escalation:

- actual action deletion requires manager-and-above when linked to a requested
  control action
- requested action resolution and reopen are manager-and-above

Catalog permissions:

- methods: owners/admins create, deactivate, reactivate, delete; managers update
  name/schema
- vehicles/equipment: manager-and-above manages create, update, deactivate,
  reactivate, delete
- insecticides: owner/admin for all create/update/deactivate/reactivate/delete
- insecticide batches: manager-and-above
- formulations/components: owner/admin

Organization settings remain owner/admin only.

## Mobile And Offline

Control commands follow `docs/domain-command-contract.md`. Domain-specific
created-row IDs are:

- `applicationMethodId`
- `sourceReductionMethodId`
- `outreachMethodId`
- `biocontrolMethodId`
- `vehicleId`
- `equipmentId`
- `insecticideId`
- `insecticideBatchId`
- `formulationId`
- `formulationInsecticideId`
- `applicationId`
- `applicationBatchId`
- `sourceReductionId`
- `outreachActionId`
- `biocontrolActionId`
- `requestedControlActionId`

Control-specific replay must also revalidate correction windows, unit type
compatibility, requested-action type/context/method compatibility, batch
compatibility, and lifecycle state.

Catalog rows needed to build forms and render historical records should be
baseline synced, including inactive non-deleted rows:

- methods
- vehicles/equipment
- insecticides
- insecticide batches
- formulations/components

Batch sync is not gated by `trackInsecticideBatches`. The setting controls
rendering/entry affordances only.

Unresolved requested control actions should sync to web/mobile because they
drive field follow-up. Resolved historical requested actions may later sync by
date window or load on demand.

Comments and additional personnel remain target-scoped/on-demand as defined in
the field-work support domain.

## Comments And Additional Personnel

Control commands do not create comments or additional personnel inline.

Shared field-work comment targets already include:

- `application`
- `sourceReduction`
- `outreachAction`
- `biocontrolAction`
- `requestedControlAction`

Shared additional personnel targets already include:

- `application`
- `sourceReduction`
- `outreachAction`
- `biocontrolAction`

Deleting an actual control action soft-deletes its direct comments and direct
additional personnel. Deleting a requested control action soft-deletes its
direct comments.

If an action's primary performer changes to a profile currently listed as
additional personnel, the server soft-deletes the now-duplicate additional
personnel row.

Control actions are not taggable in v1.

## Cross-Domain Lifecycle

Control records preserve their own feature, address, date, method/product, and
performer fields when source/context records are deleted or detached.

Habitat deletion should preserve control history and null habitat links where
schema allows, with acknowledgement:

- `applications.habitat_id`
- `source_reductions.habitat_id`
- `biocontrol_actions.habitat_id`
- `requested_control_actions.habitat_id`

Habitat merge re-points those habitat links to the target habitat.

Inspection deletion preserves control history and nulls:

- `applications.inspection_id`
- `source_reductions.inspection_id`
- `outreach_actions.inspection_id`
- `biocontrol_actions.inspection_id`
- `requested_control_actions.inspection_id`

Collection deletion preserves control/request history and nulls:

- `applications.collection_id`
- `requested_control_actions.collection_id`

Surveillance deletes never cascade-delete control history. They require
`acknowledgedCrossDomainDetach` when linked control/request records will be
detached.

Requested control action deletion preserves actual control actions and detaches
their requested-action links with manager acknowledgement, as described above.

## Text And JSON Validation

Text fields are DB `text`, but command builders should enforce practical domain
maximums:

- method names, vehicle names, equipment names, formulation names, batch names,
  trade names, shorthand: 200 characters
- active ingredient, registration number, serial number: 500 characters
- descriptions, reach description, requested action summary: 2,000 characters
- URLs: 2,000 characters

JSON fields use whole-object replacement:

- method `customSchema`
- vehicle/equipment metadata
- insecticide metadata
- action metadata

No partial JSON patch commands are part of v1.

`metadata` hard validation is only JSON object or null. Do not add metadata byte
size limits in the domain layer for v1.

## Domain Validation Boundary

Use the shared validation boundary in `docs/domain-command-contract.md`.
Control-specific builder checks include URL syntax for label/MSDS links,
nested control context shape, positive quantities, outreach reach, formulation
batch and component amount rules, and JSON object/null metadata or custom schema.

Control-specific server checks include unit compatibility, correction windows
in organization timezone, requested-action compatibility, batch compatibility,
historical acknowledgement, and cross-domain detach behavior.

Structured issue paths should match command payload names, for example:

- `applicationDate`
- `context.habitatId`
- `applicationBatches.0.insecticideBatchId`

## Domain Module Shape

`packages/domain/src/control-operations.ts` exports:

- `ControlOperationsCommandType`
- `ControlOperationsCommand`
- command payload/input types
- command builder functions
- `ControlActionContext`
- `ControlType`
- `InsecticideType`
- `ApplicationBatchInput`
- formulation helper types
- `calculateFormulationComponentAmounts`
- `expandFormulationApplicationCommands`

Keep implementation style consistent with `docs/domain-command-contract.md`.
Control-specific conventions are `LocalDateString` for dates, `Date` objects
for timestamps, patch semantics for updates, and whole-object replacement for
JSON fields.

Server mappers flatten nested context into DB columns.

## Schema Migration Backlog

The concrete schema changes surfaced during the domain interview are covered by
`202605120002_control_operations_domain_updates.sql`. This section remains as
the implementation-facing record of what that migration catches up.

### Vehicle And Equipment Lifecycle

Add active lifecycle to vehicles and equipment:

```sql
alter table vehicles
  add column is_active boolean not null default true;

alter table equipment
  add column is_active boolean not null default true;

create index vehicles_organization_active_name_idx
  on vehicles (organization_id, is_active, vehicle_name)
  where deleted_at is null;

create index equipment_organization_active_name_idx
  on equipment (organization_id, is_active, equipment_name)
  where deleted_at is null;
```

### Habitat Links

Add direct habitat links for habitat-targeted control without requiring an
inspection:

```sql
alter table source_reductions
  add column habitat_id uuid references habitats(id) on delete set null;

create index source_reductions_organization_habitat_idx
  on source_reductions (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;

alter table requested_control_actions
  add column habitat_id uuid references habitats(id) on delete set null;

create index requested_control_actions_organization_habitat_idx
  on requested_control_actions (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;
```

Do not add direct `habitat_id` to outreach actions for v1.

### Normalized Uniqueness

Add or replace normalized unique indexes:

```sql
create unique index application_methods_organization_normalized_name_unique
  on application_methods (organization_id, lower(trim(name)))
  where deleted_at is null;

create unique index source_reduction_methods_organization_normalized_name_unique
  on source_reduction_methods (organization_id, lower(trim(name)))
  where deleted_at is null;

create unique index outreach_methods_organization_normalized_name_unique
  on outreach_methods (organization_id, lower(trim(name)))
  where deleted_at is null;

create unique index biocontrol_methods_organization_normalized_name_unique
  on biocontrol_methods (organization_id, lower(trim(name)))
  where deleted_at is null;

create unique index insecticides_organization_normalized_identity_unique
  on insecticides (
    organization_id,
    lower(trim(trade_name)),
    lower(trim(registration_number))
  )
  where deleted_at is null;

create unique index insecticide_batches_insecticide_normalized_name_unique
  on insecticide_batches (insecticide_id, lower(trim(batch_name)))
  where deleted_at is null;

create unique index formulations_organization_normalized_name_unique
  on formulations (organization_id, lower(trim(formulation_name)))
  where deleted_at is null;

create unique index equipment_organization_normalized_serial_unique
  on equipment (organization_id, lower(trim(serial_number)))
  where deleted_at is null and serial_number is not null;
```

Do not add unique indexes for vehicle names or equipment names.

### Association Uniqueness

Enforce one active application/batch link:

```sql
create unique index application_batches_active_application_batch_unique
  on application_batches (application_id, insecticide_batch_id)
  where deleted_at is null;
```

Enforce one active formulation component per formulation/insecticide:

```sql
create unique index formulation_insecticides_active_formulation_insecticide_unique
  on formulation_insecticides (formulation_id, insecticide_id)
  where deleted_at is null;
```

### Formulation Numeric Checks

Add lightweight, context-free checks:

```sql
alter table formulations
  add constraint formulations_batch_size_positive
  check (batch_size > 0);

alter table formulation_insecticides
  add constraint formulation_insecticides_amount_positive
  check (amount > 0);
```

`formulations.batch_unit_id` and `formulation_insecticides.unit_id` are required
FKs to `units`, added with the recipe columns in
`202608030001_formulation_batch_units.sql`.

### Deferred Schema

Do not add for v1 unless a concrete workflow demands it:

- `applications.formulation_id`
- direct service request links from control actions or requested actions
- source reduction/outreach zero-attempt outcome fields
- application batch amount allocation fields
- control action exact start/end timestamps or durations
- requested action due date or priority
- stored grouping for formulation-expanded applications
- direct `trap_id` control context
- outreach `habitat_id` or `collection_id`
- multi-geometry support
- inventory command fields for `inventory_unit_id` and `conversion_factor`
- structured requested action resolution reason

## Testing Expectations

When implemented, add focused unit tests for the domain builders and helpers:

- UUID/context validation
- text normalization and maximum lengths
- URL validation
- context shape validation
- date and timestamp shape validation
- positive/fractional quantity rules
- outreach reach integer rules
- batch mapping duplicate checks
- requested-action update split behavior
- acknowledgement flags carried in payloads
- formulation amount calculation
- formulation expansion into ordinary chemical application commands

Server-only rules such as same-organization checks, permissions, active
references, unit compatibility, and lifecycle detach behavior should be covered
later by server command-handler integration tests.

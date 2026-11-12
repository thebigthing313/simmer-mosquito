# Readers and writers of `applications`

Inventory for [Inventory every reader and writer of applications](https://github.com/thebigthing313/simmer-mosquito/issues/1737), part of the map [Treatment above Chemical Application](https://github.com/thebigthing313/simmer-mosquito/issues/1733). Read from code at `develop` (fe5a6560), 2026-11-12. Nothing was run.

Every column is tagged against the field split settled in [Which fields live on the Treatment and which on each Chemical Application?](https://github.com/thebigthing313/simmer-mosquito/issues/1734):

- **T** (Treatment): application_date, applicator_profile_id, application_method_id, vehicle_id, equipment_id, address_id, habitat_id, inspection_id, collection_id, requested_control_action_id, mission_item_id, geom, lat, lng, geojson, geom_type, metadata, and the support records (comments, additional personnel).
- **L** (line): insecticide_id, amount_applied, application_unit_id, and `application_batches`.
- **B** (both or undecided): id, organization_id, audit columns.

## Summary

1. **Schema.** The only database object on `applications` besides its indexes is the `applications_centroid` trigger. The only foreign key into it is `application_batches.application_id` (cascade). Comments and additional personnel point at it by `entity_type = 'application'` with no foreign key. Applications are not a tag target today, so tags on a Treatment are new, and the `tags.relevant_entity_types` CHECK changes. Applications are not in the search corpus. The `control_type` enum value `'application'` names the kind of work on missions and requested control actions, not the table.
2. **Writers that straddle the split.** `recordChemicalApplication`, its mission twin, and `updateChemicalApplicationFieldDetails` write T and L columns into one row, on the server (`writers/control-operations/chemical-applications.ts`), in the domain builders, and in the web mutation hook (`hooks/mutations/use-application-mutations.ts`). `updateChemicalApplicationLocationAndContext` is T only. The batch commands are L only. `expandFormulationApplicationCommands` (`packages/domain/src/control-operations/products.ts:667`) already turns one visit into N per-insecticide creates and repeats every T field, comment and personnel row on each; it maps onto one Treatment with N lines.
3. **Authorization.** `COMMAND_PERMISSIONS` performer rules read `applicator_profile_id` and `application_date` off `applications`. They move to `treatments`. `OWN_APPLICATION_VIA_BATCH` becomes two hops (batch, line, Treatment), and the `through` helper supports one hop today.
4. **T-only readers that name the table.** The untreated-habitat predicate, region membership (`REGION_MEMBERSHIP_RECORD_TYPES`, `regionMembershipClauses`), `assertMissionGeometryCovered`, the `anyActualActionOn*` mission unions, both merge re-points (address, habitat) and every detach or block rule on a T column in the record-deletion registry. Each repoints to `treatments`.
5. **Readers whose counts change meaning.** One row per line would double-count a two-product visit in: overview daily counts (`/overview/:grain`, `OVERVIEW_RECORD_TYPES`), the `/map/chemical` list, rail, table and heading total, tile clusters and summary groupings, nearby records, address-linked records, profile activity, the daily control actions panel ("N applications" per person), habitat history and its count, the inspection detail's linked-actions badge, day activity, people-today, daily work, and the dashboard activity strip. Per-line amount sums stay correct: insecticide usage and the per-unit amount breakdown. Deciding which of these count Treatments is [What does each count mean once applications group under a Treatment?](https://github.com/thebigthing313/simmer-mosquito/issues/1739).
6. **Web read seam.** Most web reads go through `apps/web/src/lib/collections/applications.ts` and `PERFORMED_ACTIONS.applications` in `apps/web/src/hooks/queries/performed-action-reads.ts:62`, whose `measured()` returns T and L columns as one object. That helper is the main seam to split. `apps/admin` reads and writes neither table.
7. **Registers keyed by `'application'`** that need a `treatment` entry or a swap: `OWNED_GEOMETRY_POLICIES` (one `controlAction` row over four tables; `check:geometry-policies` holds `EXPECTED_TABLES = 15`), `MAP_SURFACES` and tile bindings, `DeletableRecordType` and the deletion registry, `CommentTargetType` and personnel targets, `RECORD_NOUNS`, activity categories, search comment destinations, the mission stop's "closed by" wording, `MultiRowCommandType` for the three-table create. `docs/sync.md` needs a `treatments` row; both tables are on-demand.

The three sections below are the full tables, by layer.


## Database and server

Scope: `packages/db/src` (domains, seeds, test-support, top-level), `packages/db/schema.sql`, `apps/server/src`. Read from code at `develop` (fe5a6560). `packages/db/src/tables.ts` is generated and omitted from the tables (it holds the `Applications` and `ApplicationBatches` row interfaces).

Key: T = Treatment-bound, L = Line-bound, B = both/undecided (id, organization_id, audit columns). R/W: R read, W write, D soft delete.

---

### DB: schema objects (`packages/db/schema.sql`)

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| schema.sql:48-53 | enum `control_type` ('application', 'source_reduction', 'biocontrol', 'outreach'); used by `missions.control_type` and `requested_control_actions.control_type` | n/a | n/a | n/a (names the kind of control work, not the table) |
| schema.sql:952-963 | table `application_batches` (id, application_id, insecticide_batch_id, organization_id, audit cols) | n/a | all | L (+B) |
| schema.sql:989-1020 | table `applications`; CHECKs `applications_amount_applied_positive` (amount_applied > 0) and `applications_geom_type_check` (six geometry types); `geom NOT NULL`; `geojson` GENERATED from geom | n/a | all | T+L+B |
| schema.sql:1963,1979 | PKs `application_batches_pkey`, `applications_pkey` | n/a | id | B |
| schema.sql:2517 | unique `application_batches_active_application_batch_unique (application_id, insecticide_batch_id) where deleted_at is null` | n/a | application_id, insecticide_batch_id | L |
| schema.sql:2524 | `application_batches_application_idx (application_id)` partial | n/a | application_id | L |
| schema.sql:2531 | `application_batches_insecticide_batch_idx (insecticide_batch_id)` partial | n/a | insecticide_batch_id | L |
| schema.sql:2538 | `application_batches_organization_application_idx (organization_id, application_id)` partial | n/a | organization_id, application_id | L+B |
| schema.sql:2559 | `applications_geom_gist_idx` gist(geom) partial | n/a | geom | T |
| schema.sql:2566 | `applications_mission_item_idx (mission_item_id)` partial | n/a | mission_item_id | T |
| schema.sql:2573 | `applications_organization_address_idx (organization_id, address_id)` | n/a | address_id | T |
| schema.sql:2580 | `applications_organization_collection_idx (organization_id, collection_id)` | n/a | collection_id | T |
| schema.sql:2587 | `applications_organization_date_idx (organization_id, application_date desc, created_at desc)` (overview scans rely on it) | n/a | application_date, created_at | T+B |
| schema.sql:2594 | `applications_organization_habitat_idx (organization_id, habitat_id)` (untreated predicate seeks on it) | n/a | habitat_id | T |
| schema.sql:2601 | `applications_organization_insecticide_idx (organization_id, insecticide_id)` | n/a | insecticide_id | L |
| schema.sql:2608 | `applications_organization_inspection_idx (organization_id, inspection_id)` | n/a | inspection_id | T |
| schema.sql:2615 | `applications_organization_method_idx (organization_id, application_method_id)` | n/a | application_method_id | T |
| schema.sql:2622 | `applications_requested_control_action_idx (requested_control_action_id)` | n/a | requested_control_action_id | T |
| schema.sql:3959 | trigger `applications_centroid` BEFORE INSERT OR UPDATE OF geom, runs `set_owned_centroid()` (schema.sql:891), fills lat/lng/geom_type | W | geom -> lat, lng, geom_type | T |
| schema.sql:4298 | FK `application_batches.application_id -> applications(id) ON DELETE CASCADE` | n/a | application_id | L |
| schema.sql:4322 | FK `application_batches.insecticide_batch_id -> insecticide_batches ON DELETE CASCADE` | n/a | insecticide_batch_id | L |
| schema.sql:4330 | FK `application_batches.organization_id -> organizations RESTRICT` (+ 3 profile FKs SET NULL at 4306/4314/4338) | n/a | organization_id, *_by_profile_id | B |
| schema.sql:4378 | FK `applications.address_id -> addresses RESTRICT` | n/a | address_id | T |
| schema.sql:4386 | FK `applications.application_method_id -> application_methods SET NULL` | n/a | application_method_id | T |
| schema.sql:4394 | FK `applications.application_unit_id -> units RESTRICT` | n/a | application_unit_id | L |
| schema.sql:4402 | FK `applications.applicator_profile_id -> profiles SET NULL` | n/a | applicator_profile_id | T |
| schema.sql:4410 | FK `applications.collection_id -> collections SET NULL` | n/a | collection_id | T |
| schema.sql:4434 | FK `applications.equipment_id -> equipment SET NULL` | n/a | equipment_id | T |
| schema.sql:4442 | FK `applications.habitat_id -> habitats SET NULL` | n/a | habitat_id | T |
| schema.sql:4450 | FK `applications.insecticide_id -> insecticides RESTRICT` | n/a | insecticide_id | L |
| schema.sql:4458 | FK `applications.inspection_id -> inspections SET NULL` | n/a | inspection_id | T |
| schema.sql:4466 | FK `applications.mission_item_id -> mission_items SET NULL` | n/a | mission_item_id | T |
| schema.sql:4474 | FK `applications.organization_id -> organizations RESTRICT` (+ 3 profile FKs SET NULL at 4418/4426/4490) | n/a | organization_id, *_by_profile_id | B |
| schema.sql:4482 | FK `applications.requested_control_action_id -> requested_control_actions SET NULL` | n/a | requested_control_action_id | T |
| schema.sql:4498 | FK `applications.vehicle_id -> vehicles SET NULL` | n/a | vehicle_id | T |

Notes:
- No search trigger on `applications` (no `search_document_from_applications`, not in the search corpus). Comments on an application are indexed by `search_document_from_comments` (schema.sql:410) with `entity_type = 'application'` in the display JSON.
- No FK other than `application_batches.application_id` points at `applications`. Polymorphic children (`comments`, `additional_personnel`) store `entity_type = 'application'` with no FK. `tags.relevant_entity_types` CHECK (schema.sql:1835) does not include 'application', so applications are not taggable today.
- The only DB-level function touching applications is `set_owned_centroid()` via the trigger; no other function, view or trigger names the table.
- `application_batches` FK cascade: a hard delete of an application row cascades its batches. Under the split this FK stays on the line, which is correct; nothing cascades from a Treatment unless added.
- `geom NOT NULL` and the geom-type CHECK, plus the centroid trigger and gist index, are all T and move to `treatments`.

---

### Server: table command (`apps/server/src/table-commands/applications.ts`)

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| applications.ts:80-83 | `ApplicationArgument` / `ApplicationPayload`: non-column body keys `locationSource`, `geometry`, `context`, `application_batches` | W | locationSource (T), geometry (T), context (T), application_batches (L) | T+L |
| applications.ts:102-122 | `applicationBatches()`: reads create-time child rows `application_batches[].id`, `.insecticide_batch_id` | W | application_batches.id, insecticide_batch_id | L |
| applications.ts:133-136 | `missionGeometry()`: `geometry` or `drawnGeometry(locationSource)` | W | geom | T |
| applications.ts:139-150 | `applicationFields()`: "product and dose half" shared by both creates | W | insecticide_id, amount_applied, application_unit_id (L); application_date, applicator_profile_id, application_method_id, vehicle_id, equipment_id (T) | T+L |
| applications.ts:152-262 | `applicationTableCommands`: table `applications`, response key `application`, notFound `application_not_found` | W | all | T+L |
| applications.ts:164-175 | intent `controlOperations.recordChemicalApplication` | W | applicationFields + application_batches + locationSource, address_id, context, requested_control_action_id, metadata | T+L |
| applications.ts:177-193 | intent `missionDispatch.recordChemicalApplicationForMissionItem` (+ mission execution flags) | W | as above + mission_item_id, geometry | T+L |
| applications.ts:195-228 | intent `controlOperations.updateChemicalApplicationFieldDetails`; carries `acknowledgedBatchClearance` | W | application_date, applicator_profile_id, application_method_id, vehicle_id, equipment_id, metadata (T); insecticide_id, amount_applied, application_unit_id (L) | T+L |
| applications.ts:230-248 | intent `controlOperations.updateChemicalApplicationLocationAndContext` | W | locationSource->geom, address_id, context (habitat_id/inspection_id/collection_id), requested_control_action_id | T only |
| applications.ts:250-259 | intent `controlOperations.deleteChemicalApplication`; acks `acknowledgedSupportRecordDeletion`, `acknowledgedBatchDeletion` | D | id | B (support records T, batches L) |
| applications.ts:264-291 | `applicationBatchTableCommands`: table `application_batches`, key `applicationBatch`; intents `addChemicalApplicationBatch` (application_id, insecticide_batch_id), `removeChemicalApplicationBatch` (id only) | W/D | id, application_id, insecticide_batch_id | L |
| table-commands/index.ts:31,125-126 | registers both table-command surfaces on `/commands/applications` and `/commands/application_batches` | n/a | n/a | n/a |

Notes:
- `updateChemicalApplicationFieldDetails` is the straddling intent: it mixes T fields (date, applicator, method, vehicle, equipment, metadata) with L fields (insecticide, amount, unit) in one PATCH. It has to split across two tables or two intents.
- Both creates take one product per call. A multi-product Treatment needs a create that carries N lines (each with its own batches); the current `application_batches` child-row pattern is the template.
- Comments in assignments.ts:24,90, control-products.ts:11, missions.ts:88, notifications.ts:255, tag-items.ts:6, performed-actions.ts:7, mission-items.ts:10-11 cite `application_batches` / Chemical Application as an analogy only; no code dependency.

### Server: writers

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| writers/control-operations/chemical-applications.ts:49-89 | `applicationCatalogReferences`: catalog gate for method, insecticide, vehicle, equipment | R | application_method_id, vehicle_id, equipment_id (T); insecticide_id (L) | T+L |
| chemical-applications.ts:91-145 | `writeMissionApplication`: `beginMissionExecution(..., 'chemicalApplication')`, `insertInto('applications')`, batch inserts, `assertMissionGeometryCovered(..., 'applications')`, `finishMissionExecution` | W | id, organization_id, application_method_id (defaults to mission planned method), insecticide_id, applicator_profile_id, application_date, geom (mission item geom by default), address_id, vehicle_id, equipment_id, amount_applied, application_unit_id, habitat_id, collection_id, inspection_id, requested_control_action_id (from stop), mission_item_id, metadata, created_by/updated_by | T+L+B |
| chemical-applications.ts:152-200 | `recordChemicalApplication`: `insertInto('applications')` + `insertApplicationBatch` per batch | W | same as above minus mission_item_id; geom from `resolveGeom(locationSource)` | T+L+B |
| chemical-applications.ts:203-239 | `updateChemicalApplicationFieldDetails`: `clearIncompatibleBatches` when insecticide moves, `assertWriteReferences` (kind update, table `applications`), `updateApplication` | W | application_date, applicator_profile_id, application_method_id, vehicle_id, equipment_id, metadata (T); insecticide_id, amount_applied, application_unit_id (L); updated_by_profile_id | T+L |
| chemical-applications.ts:240-251 | `updateChemicalApplicationLocationAndContext` via `locationContextColumns(..., {collection: true})` | W | geom, address_id, requested_control_action_id, habitat_id, inspection_id, collection_id | T only |
| chemical-applications.ts:252-270 | `deleteChemicalApplication`: `applyRecordDeletion({recordType: 'application'})` then `softDelete('applications')` | D | deleted_at, deleted_by_profile_id + registry cascades | B (cascades L batches + T support rows) |
| chemical-applications.ts:289-330 | `clearIncompatibleBatches`: counts then soft-deletes `application_batches` whose batch belongs to a different insecticide; ack `acknowledgedBatchClearance` | R/W | application_batches.application_id, organization_id, deleted_at, insecticide_batch_id; insecticide_batches.insecticide_id | L only |
| chemical-applications.ts:332-347 | `updateApplication`: `updateTable('applications')` where id/org/not deleted | W | any of `ApplicationUpdateColumns` | T+L |
| writers/control-operations/shared.ts:23-61 | `insertApplicationBatch`: catalog gate on `insecticide_batch_id`, `insertInto('application_batches')` | W | id, organization_id, application_id, insecticide_batch_id, created_by/updated_by | L |
| shared.ts:91-127 | `locationContextColumns` (shared with performed actions and requests) | W | geom, address_id, requested_control_action_id, habitat_id, inspection_id, collection_id | T only |
| shared.ts:137-139 | `ApplicationRow`, `ApplicationBatchRow` = `CommandRow<'applications'>` / `<'application_batches'>` (columns from sync row schema) | n/a | full row schema | T+L+B |
| shared.ts:162-179 | `ApplicationUpdateColumns` type | W | geom, application_method_id, insecticide_id, applicator_profile_id, application_date, address_id, vehicle_id, equipment_id, amount_applied, application_unit_id, habitat_id, collection_id, inspection_id, requested_control_action_id, metadata | T+L |
| writers/control-operations/chemical-application-batches.ts:14-38 | `writeApplicationBatchCommand`: add via `insertApplicationBatch`, remove via `softDelete('application_batches')` | W/D | id, application_id, insecticide_batch_id | L |
| writers/mission-dispatch/mission-execution.ts:28-33 | `CONTROL_TYPE_FOR_KIND`: `chemicalApplication -> 'application'` (mission `control_type` must match) | R | missions.control_type | n/a (kind) |
| mission-execution.ts:170-175 | `defaultMissionMethodId`: application-only nullable method default | n/a | application_method_id | T |
| mission-execution.ts:185-194 | `missionItemGeom`: default geom subselect from mission_items | W | geom | T |
| mission-execution.ts:207-234 | `assertMissionGeometryCovered(actionTable: 'applications' \| ...)`: `st_covers((select geom from applications where id = ...), mission_items.geom)` | R | geom | T only |
| writers/mission-dispatch/mission-acknowledgements.ts:114-137 | `anyActualActionOnMission`: `exists (select 1 from applications where mission_item_id = item.id and deleted_at is null)` (mission cancellation guards, called at 230/245/294) | R | mission_item_id, deleted_at | T+B |
| mission-acknowledgements.ts:642-659 | `anyActualActionOnStop`: union over `applications` (mission_item_id, deleted_at) (stop context-change and removal guards, called at 398/420) | R | mission_item_id, deleted_at | T+B |
| writers/field-work/comments.ts:22, additional-personnel.ts:23 | generic polymorphic writers; write `entity_type = toDbEntityType(target.type)`, which is `'application'` for an application target (domain `ADDITIONAL_PERSONNEL_TARGET_TYPES` and comment targets include 'application'); no existence check on the target | W | comments/additional_personnel entity_type, entity_id | T (support records move to Treatment) |
| writers/control-assets.ts:47-58,~94 | vehicle/equipment rename asks `assertCitedHistoryAcknowledged` (rows citing it come from record-deletion `vehicleApplications`/`equipmentApplications`) | R (indirect) | vehicle_id, equipment_id | T |
| writers/control-products.ts:134-141, 191-200 | insecticide and insecticide-batch relabel acks; citing rows from record-deletion `insecticideApplications` (applications.insecticide_id) and `insecticideBatchApplications` (application_batches.insecticide_batch_id) | R (indirect) | insecticide_id, insecticide_batch_id | L |
| writers/control-methods.ts:107 | application method delete/relabel via record-deletion `applicationMethodApplications` | R (indirect) | application_method_id | T |
| writers/foundation/addresses.ts:29-33 | `mergeAddresses` re-points applications through record-merge `addressApplications` | W (indirect) | address_id | T |

Notes:
- Every create writes T and L columns into one row. Under the split each create becomes: insert Treatment (T), insert N lines (L), insert batches per line.
- `clearIncompatibleBatches` is per line (insecticide vs batch insecticide). It keys on `application_id`, which stays on the line, so it survives as-is if "application" keeps meaning the line.
- `assertMissionGeometryCovered` and both mission-acknowledgement unions read `geom` / `mission_item_id`, which move to `treatments`: `actionTable` must become `'treatments'`, and the unions must read `treatments` (reading lines would lose those columns).
- `insertApplicationBatch` does not check the batch's insecticide matches the line's insecticide (only the catalog gate). Unchanged by the split but worth knowing.

### Server: authorization (command-permissions, command-ownership)

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| command-permissions.ts:74-92 | `PerformedRecordRef.table` union includes `'applications'`; `through` only allows `'application_batches'` | n/a | n/a | n/a |
| command-permissions.ts:110-119 | `DeletionEscalation.entityType` includes `'application'`; `hasBatchLinks` | n/a | n/a | T (entity) / L (batches) |
| command-permissions.ts:182-187 | `OWN_APPLICATION`: performer = `applicator_profile_id`, window from `application_date` | R | applicator_profile_id, application_date | T only |
| command-permissions.ts:188-197 | `OWN_APPLICATION_VIA_BATCH`: reach application through `application_batches.application_id` | R | application_batches.application_id; applications.applicator_profile_id, application_date | L link -> T cols |
| command-permissions.ts:234-238 | `DELETE_OWN_APPLICATION`: escalation entityType 'application', hasBatchLinks true | R | see ownership | T+L |
| command-permissions.ts:362 | `missionDispatch.recordChemicalApplicationForMissionItem: OWN_MISSION_ITEM` | n/a | n/a | n/a |
| command-permissions.ts:592-597 | floors: record = COLLECTOR; update field details / location and context / add batch = OWN_APPLICATION; delete = DELETE_OWN_APPLICATION; remove batch = OWN_APPLICATION_VIA_BATCH | n/a | n/a | n/a |
| command-ownership.ts:246 | escalation copy `batch_links` ("This application has insecticide batches linked to it") | n/a | n/a | L |
| command-ownership.ts:266-288 | `readDeletionEscalation`: support rows by entity_type, then `hasActiveRows('application_batches', 'application_id', ...)`, then requested-action link | R | comments/additional_personnel (entity_type 'application'); application_batches.application_id; applications.requested_control_action_id | T+L |
| command-ownership.ts:296-302 | `readRequestedActionEscalation`: loops `ACTION_TABLES` (includes 'applications') on `requested_control_action_id` | R | requested_control_action_id, organization_id, deleted_at | T only |
| command-ownership.ts:328-333 | `ACTION_TABLES` = applications, source_reductions, outreach_actions, biocontrol_actions | n/a | n/a | n/a |
| command-ownership.ts:336-341 | `ACTION_TABLE_BY_ENTITY_TYPE.application = 'applications'` | n/a | n/a | n/a |
| command-ownership.ts:343-378 | `hasSupportRows` (comments, additional_personnel by entity_type) and `hasRequestedActionLink` (selects `requested_control_action_id` from the action table) | R | entity_type/entity_id; requested_control_action_id | T only |
| command-ownership.ts:383-399 | `hasActiveRows` table union includes `'application_batches'` | R | parameterised | L/T |
| command-ownership.ts:401-415 | `readLinkedParentId`: `through.parentColumn` lookup on application_batches | R | application_id | L |
| command-ownership.ts:439-466 | `readPerformerOwnership`: selects performerColumn/performedOnColumn from `performed.table` | R | applicator_profile_id, application_date | T only |
| acknowledgements.ts:139-140,201 | `acknowledgedBatchClearance` (clearanceCheck), `acknowledgedBatchDeletion` (deleteRegistry), `acknowledgedSupportRecordDeletion` (deleteRegistry) | n/a | n/a | L / L / T |

Notes:
- Performer and correction window read `applicator_profile_id` + `application_date`, both T. If lines are edited through their own commands, line edits must resolve their Treatment's performer (a `through` like the batch one, but `lines.treatment_id -> treatments`). `OWN_APPLICATION_VIA_BATCH` becomes two hops (batch -> line -> treatment), which `through` does not express today (single hop).
- Delete escalation mixes T (support rows, requested-action link) and L (batch links). A Treatment delete must check batches across all its lines.

### Server: map tiles (`apps/server/src/map-tiles.ts`)

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| map-tiles.ts:127-132 | readers bound to `MAP_SURFACES.chemical` (tile, extent, list, summary, by-id, export) | R | see DB control-operations-map | T+L |
| map-tiles.ts:443-449 | `GET /map/chemical` paged list, response key `applications` | R | display row | T+L |
| map-tiles.ts:453-458 | `GET /map/chemical/summary` (groupings + amount breakdown) | R | insecticide_id, application_method_id, applicator_profile_id, amount_applied, application_unit_id | T+L |
| map-tiles.ts:460-464 | `GET /map/chemical/export` | R | export columns | T+L |
| map-tiles.ts:466-471 | `GET /map/chemical/:id`, key `application`, noun `Application` | R | display row | T+L |
| map-tiles.ts:1039-1044 | tileset `chemical` (clusters on) | R | geom, id | T |
| map-tiles.ts:1366-1369 | `parseApplicationMapFilters` (`CHEMICAL_MAP_FILTERS`): insecticideIds, applicationMethodIds, applicatorProfileIds, regionIds, dateFrom/dateTo | R | see filters | T+L |

### Server: sync / shape authorization

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| shape-scopes.ts:178-179 | `applications: 'organization'`, `application_batches: 'organization'` scope | R | organization_id | B |
| return-columns.ts (whole) / sync-shapes.ts | column list forced on shape and command responses comes from `@simmer-mosquito/sync/contract` `tableSchemas` (generated); no hand list here | R | all synced columns | T+L |

Notes: a new `treatments` table needs a shape-scope entry, a row schema (packages/sync), and the region-membership coverage test (apps/server/src/tests/unit/region-membership-coverage.test.ts) will demand it in `REGION_MEMBERSHIP_RECORD_TYPES` because it has `geom`; `applications` must leave that list once it loses `geom`.

### Server: other surfaces

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| region-membership.ts:38-52 | `GET /records/:recordType/:recordId/regions`, recordType from `REGION_MEMBERSHIP_RECORD_TYPES` (includes `applications`) | R | geom, geom_type, organization_id, deleted_at | T only |
| record-deletion.ts:108-120 | `GET /records/:recordType/:recordId/delete-impact`, recordType `application` via registry | R | registry | T+L |
| record-history.ts:43-70 | `assertCitedHistoryAcknowledged` over `citingRules` (applications cite vehicle, equipment, method, insecticide; application_batches cite insecticide batch) | R | vehicle_id, equipment_id, application_method_id (T); insecticide_id, insecticide_batch_id (L) | T+L |
| search.ts:284-300 | comment search result maps `display.entity_type` ('application') to targetType | R | comments.entity_type | T |
| (none) | overview-reads.ts, dashboard-reads.ts, search corpus, location-source.ts: no application reference (applications are not a location source) | | | |

---

### DB: domain reads and registries (`packages/db/src/domains`)

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| control-operations-map.ts:47-58 | `ApplicationMapFilters` | R | insecticide_id (L); application_method_id, applicator_profile_id, application_date, geom via regions (T) | T+L |
| control-operations-map.ts:65-84 | `SafeApplicationDisplayRow` | R | id, organizationId, lat, lng, geojson, geomType, applicationMethodId, applicationDate, habitatId, applicatorProfileId, applicatorName (T); insecticideId, amountApplied, applicationUnitId, batchNames (L); createdAt, updatedAt (B) | T+L |
| control-operations-map.ts:89-99 | `applicationDisplayJoins`: profiles on applicator_profile_id; lateral `json_agg(batch_name)` from application_batches where `abx.application_id = a.id` | R | applicator_profile_id (T); application_batches.application_id, insecticide_batch_id (L) | T+L |
| control-operations-map.ts:101-119 | `applicationDisplayColumns` | R | a.id, a.organization_id, a.lat, a.lng, a.geojson, a.geom_type, a.insecticide_id, a.application_method_id, a.application_date, a.amount_applied, a.application_unit_id, a.habitat_id, a.applicator_profile_id, a.created_at, a.updated_at | T+L |
| control-operations-map.ts:126-156 | `applicationExport` (CSV): joins insecticides, application_methods, units, habitats, addresses, batch list; columns Application date, Insecticide, Active ingredient, EPA registration, Method, Amount, Unit, Batches, Applicator, Habitat, Address, Latitude, Longitude, Recorded, Updated | R | insecticide_id, amount_applied, application_unit_id, batches (L); application_date, application_method_id, habitat_id, address_id, applicator_profile_id, lat, lng (T); created_at, updated_at (B) | T+L |
| control-operations-map.ts:162-195 | `applicationSurface`: `from applications a`, geom `a.geom`, tile props `a.id`, groupings (insecticide_id, application_method_id, applicator_profile_id), breakdown `sum(a.amount_applied)` by (insecticide_id, application_unit_id), order `application_date desc, created_at desc, id` | R | as listed | T+L |
| control-operations-map.ts:197-227 | `applicationFilterWhere`: insecticide_id, application_method_id, applicator_profile_id, application_date range, `regionMembershipClauses(a.geom, a.geom_type, a.organization_id)` | R | insecticide_id (L); rest T | T+L |
| map-surface-register.ts:3,83 | `MAP_SURFACES.chemical = applicationSurface` | R | n/a | T+L |
| map-layers.ts:34 | `MapTilesetLayer` includes `'chemical'` | n/a | n/a | n/a |
| habitats.ts:48-131 (107-113) | `untreatedHabitatSql`: `not exists (select 1 from applications a where org, not deleted, a.application_date >= latest.inspection_date and (a.habitat_id = ... or a.inspection_id = ...))` | R | organization_id, deleted_at, application_date, habitat_id, inspection_id | T only |
| overview.ts:145-151 | overview daily counts, `case 'applications'`: `from applications a`, date `a.application_date`, live = org + not deleted; `count(*)` per day (overview.ts:227) and `min(date)` | R | organization_id, deleted_at, application_date | T only (but counts rows) |
| profile-activity.ts:211,284-297 | `recordShapes().application`: category 'application', family 'control', table `applications`, `SITE_JOINS` (habitats on habitat_id, addresses on address_id), date `r.application_date`, refId `r.insecticide_id`, methodRefId `r.application_method_id`, amount `r.amount_applied`, unitId `r.application_unit_id`; `recordColumns` also reads `r.id, r.lat, r.lng` | R | application_date, habitat_id, address_id, application_method_id, lat, lng (T); insecticide_id, amount_applied, application_unit_id (L) | T+L |
| address-linked-records.ts:110-138 | `CLOSING_RECORD_JOIN`: newest action on a mission stop; branch `'application'` from `applications a where a.mission_item_id = r.id`, ref_id `a.insecticide_id`, order by created_at | R | mission_item_id, organization_id, deleted_at (T/B); insecticide_id (L); created_at (B) | T+L |
| address-linked-records.ts:178, 300-322 | `reuse('application')` linked shape; `where r.address_id = $addressId` | R | address_id + profile-activity shape columns | T+L |
| service-request-nearby.ts:110-170 | `listNearbyRecords` over `recordShapes` (application included when family 'control'): `st_dwithin(r.geom::geography, ...)`, date window on `r.application_date`, `st_distance` | R | geom, application_date + shape columns | T+L |
| region-membership.ts:36-52 | `REGION_MEMBERSHIP_RECORD_TYPES` includes `'applications'`; reader selects from `sql.table(recordType)` on `rec.geom`, `rec.geom_type` | R | id, organization_id, deleted_at, geom, geom_type | T only |
| record-deletion.ts:28 | `DeletableRecordType` includes `'application'` | n/a | n/a | n/a |
| record-deletion.ts:1023-1052 | `application` delete config: cascades `application_batches.application_id` (ack `acknowledgedBatchDeletion`), cascadesSupport comments and additional_personnel with entity_type 'application' (ack `acknowledgedSupportRecordDeletion`) | W | application_batches.application_id (L); comments/additional_personnel entity_type/entity_id (T) | T+L |
| record-deletion.ts:612-618 | address delete blocks on `applications.address_id` (`addressApplications`) | R | address_id | T |
| record-deletion.ts:741-748 | trap delete detaches `applications.collection_id` under the trap's collections (`trapCollectionApplications`, `acknowledgedCascadeDelete`) | W | collection_id | T |
| record-deletion.ts:816-822 | collection delete detaches `applications.collection_id` (`collectionApplications`) | W | collection_id | T |
| record-deletion.ts:876-882 | habitat delete detaches `applications.habitat_id` (`habitatApplications`, `acknowledgedCrossDomainDetach`) | W | habitat_id | T |
| record-deletion.ts:957-963 | inspection delete detaches `applications.inspection_id` (`inspectionApplications`) | W | inspection_id | T |
| record-deletion.ts:1204-1210 | requested control action delete detaches `applications.requested_control_action_id` (`controlRequestApplications`, `acknowledgedActionDetach`) | W | requested_control_action_id | T |
| record-deletion.ts:1251-1258 | mission delete detaches `applications.mission_item_id` under the mission's items (`missionItemApplications`, `acknowledgedActualActionDetach`) | W | mission_item_id | T |
| record-deletion.ts:1377-1388 | application method delete blocks on `applications.application_method_id` | R | application_method_id | T |
| record-deletion.ts:1433-1458 | vehicle / equipment delete blocks on `applications.vehicle_id` / `equipment_id` | R | vehicle_id, equipment_id | T |
| record-deletion.ts:1473-1479 | insecticide delete blocks on `applications.insecticide_id` | R | insecticide_id | L |
| record-deletion.ts:1483-1494 | insecticide batch delete blocks on `application_batches.insecticide_batch_id` | R | insecticide_batch_id | L |
| record-deletion.ts:1643-1661 | `citingRules`: the direct rules above double as relabel citations (record-history) | R | as above | T+L |
| record-merge.ts:179-185 | address merge re-points `applications.address_id` | W | address_id | T |
| record-merge.ts:259-265 | habitat merge re-points `applications.habitat_id` | W | habitat_id | T |
| write-references.ts:80-98 | `REFERENCED_RECORD_TABLES` includes `'applications'` | R | id, organization_id, deleted_at | B |
| write-references.ts:128 | `RECORD_REFERENCE_COLUMNS.application_id -> applications` ('chemical application'); used when `application_batches` insert names `application_id` | R | application_id | L |
| write-references.ts:129 | `applicator_profile_id -> profiles` | R | applicator_profile_id | T |
| org-owned-writes.ts:35-37 | `GeomTable` derived type includes `applications` (has `geojson`) | n/a | n/a | T |

Notes:
- **Row counts change meaning.** `overview.ts` counts `applications` rows per day; under the split a two-product Treatment counts 2. Same for the map list `count` (paged list "full count"), the tile clusters (one point per line, stacked at the same spot), the summary groupings, `listNearbyRecords`, address linked records (one row per line), and profile-activity shapes. Each must decide Treatment vs line; most want Treatment.
- **Map surface straddles.** `applicationSurface` reads geom/date/method/applicator (T) and insecticide/amount/unit/batches (L) from one alias. Under the split it needs `treatments t join applications a`; filtering by insecticide becomes an `exists` over lines, and the display row's single `insecticideId`/`amountApplied` becomes a list. The amount breakdown (`sum(a.amount_applied)` by insecticide and unit) is correctly per line.
- **Untreated predicate** (`habitats.ts`) reads only T columns; it should read `treatments` (any treatment answers the inspection). Reading lines would still work if lines kept a join, but the columns leave the line.
- **Region membership**: `REGION_MEMBERSHIP_RECORD_TYPES` and `regionMembershipClauses(a.geom...)` need `treatments` in place of `applications`; `GET /records/applications/:id/regions` stops working once `applications.geom` goes.
- **Delete cascades**: the `application` delete config cascades batches (L) and support rows (T). Splitting needs a `treatment` config (cascade lines, their batches, comments, personnel) and a line config (cascade batches). Every `detaches`/`blocks` rule over T columns (address, collection, trap, habitat, inspection, request, mission item, method, vehicle, equipment) must retarget `treatments`; insecticide and batch blocks stay on lines.
- **Merge**: both re-point rules target T columns, so they retarget `treatments`.
- **Closing record (ADR 0012)**: reads `mission_item_id` (T) and `insecticide_id` (L) in one branch; with several lines the closer has several products. The category key `'application'` is also the polymorphic key used by the client.
- **Polymorphic key `'application'`**: appears as entity_type (comments, additional_personnel, delete config, escalation), activity/linked category, recordType in delete registry, and map surface name. Each needs a decision whether it now means Treatment.
- **`control_type = 'application'`** (enum value, missions and requested actions, `CONTROL_TYPE_FOR_KIND.chemicalApplication`) names the kind of control work; it reads correctly for Treatments and probably stays.

### DB: seeds and fixtures

| file:line | what it is | R/W | columns touched | T/L/B mix |
| --- | --- | --- | --- | --- |
| seeds/map-surfaces.ts:76-99 | `MapSurfaceName` / `surfaceNames` include `'application'` | n/a | n/a | n/a |
| seeds/map-surfaces.ts:261 | `organizationRefs.applicationMethodId` seed id | n/a | n/a | T |
| seeds/map-surfaces.ts:524-541 | `insertInto('applications')` per surface row | W | id, organization_id, geom, deleted_at, application_method_id, applicator_profile_id, application_date (T/B); insecticide_id, amount_applied: 2, application_unit_id (L) | T+L |
| seeds/map-surfaces.ts:615-627 | `requested_control_actions` seeded with `control_type: 'application'` | W | control_type | n/a (enum) |
| seeds/role-ladder.ts | seeds source reductions only; no applications | n/a | n/a | n/a |
| test-support/row-fixtures.ts:582-593 | `createRequestedControlAction` default `control_type: 'application'` | W | control_type | n/a |
| row-fixtures.ts:595-605 | `createMission` default `control_type: 'application'` | W | control_type | n/a |
| row-fixtures.ts:658-676 | `createApplication`: `insertRow('applications', {organization_id, insecticide_id, application_date '2026-08-01', geom fixturePoint, amount_applied 2, application_unit_id})` | W | application_date, geom (T); insecticide_id, amount_applied, application_unit_id (L); organization_id (B) | T+L |

Notes: `createApplication` and the map-surface seed both write one row with T and L columns; each becomes a Treatment insert plus a line insert. Every integration suite calling `createApplication` (overview, untreated world, record-deletion, address-linked-records) inherits the change.

---

### Tests

#### apps/server
- `apps/server/src/tests/unit/table-commands/control-records.test.ts`: applications and application_batches intents, payload readers, acks (20 hits).
- `apps/server/src/tests/unit/table-commands/mission-dispatch.test.ts`: `recordChemicalApplicationForMissionItem`.
- `apps/server/src/tests/unit/table-commands/control-catalogs.test.ts`: application method catalog (name only).
- `apps/server/src/tests/unit/table-commands/control-products.test.ts`, `insecticide-batch-refusals.test.ts`: insecticide/batch refusals citing applications and batches.
- `apps/server/src/tests/unit/command-permissions.test.ts`: OWN_APPLICATION, via-batch, delete escalation floors.
- `apps/server/src/tests/unit/command-ownership.test.ts`: performer verdict and escalation over applications/batches.
- `apps/server/src/tests/unit/map-tiles.test.ts`, `map-filter-specs.test.ts`: `/map/chemical` routes and filter parsing.
- `apps/server/src/tests/unit/record-deletion.test.ts`: delete-impact route over the application type.
- `apps/server/src/tests/unit/sync-shapes.test.ts`: `/sync/shapes/applications`.
- `apps/server/src/tests/unit/region-membership-coverage.test.ts`: holds `REGION_MEMBERSHIP_RECORD_TYPES` to every geom table (will force treatments in, applications out).

#### packages/db
- `packages/db/src/tests/integration/domains/record-deletion.integration.test.ts`: application delete cascades and cross-domain detaches (11 hits).
- `packages/db/src/tests/integration/domains/map-surface.integration.test.ts`, `map-tile.integration.test.ts`: chemical surface list/tile/export against Postgres.
- `packages/db/src/tests/integration/domains/untreated-world.ts`: untreated habitat fixtures writing applications.
- `packages/db/src/tests/integration/overview.integration.test.ts`: overview application counts via `createApplication`.
- `packages/db/src/tests/integration/address-linked-records.integration.test.ts`: linked applications and closing record.
- `packages/db/src/tests/unit/domains/map-surface-sql.test.ts` + `__snapshots__/map-surface-sql.snap.sql`, `__snapshots__/map-surface-export-sql.snap.sql`: SQL snapshots of the chemical surface and export.
- `packages/db/src/tests/unit/domains/map-region-filter.test.ts`: region clause over the chemical surface.
- `packages/db/src/tests/unit/domains/record-deletion.test.ts`: registry shape including `application`.
- `packages/db/src/tests/unit/domains/org-owned-writes.test.ts`: `GeomTable`/`OrgOwnedTable` membership includes `applications`.

## Sync, domain, registers and rot gates

Legend: T = Treatment-bound, L = Line-bound, B = both/undecided. Paths relative to `F:\simmer-mosquito`. Read at `develop` fe5a6560.

### Sync

| file:line | what it is | R/W | columns/fields | T/L/B mix |
| --- | --- | --- | --- | --- |
| packages/sync/src/collections/tables/applications.ts:15-40 | `applicationSchema` row schema (hand-owned field lines, generator adds/removes lines) | R | id, organization_id, application_method_id, insecticide_id, applicator_profile_id, application_date, lat, lng, geom_type, address_id, vehicle_id, equipment_id, amount_applied, application_unit_id, habitat_id, collection_id, inspection_id, requested_control_action_id, mission_item_id (`z.string()`, not uuid), metadata, 4 audit cols | mixed: 15 T, 3 L (insecticide_id, amount_applied, application_unit_id), B (id, org, audit) |
| packages/sync/src/collections/tables/application_batches.ts:15-24 | `applicationBatchSchema` | R | id, organization_id, application_id, insecticide_batch_id, audit | L (FK stays on the line, `application_id`) |
| packages/sync/src/collections/applications.ts:24 | `createApplicationsCollection` (generated whole) | R/W | table 'applications' | n/a |
| packages/sync/src/collections/application_batches.ts:29 | `createApplicationBatchesCollection` (generated whole) | R/W | table 'application_batches' | n/a |
| packages/sync/src/collections/index.ts:28,30 | generated barrel exports | - | - | - |
| packages/sync/src/collections/tables/index.ts:17,19,75,77 | generated schema map `application_batches`, `applications` | - | - | - |
| packages/sync/src/collections/tables/missions.ts:19, requested_control_actions.ts:18 | `control_type` enum includes `'application'` | R | control_type | enum value, not the table |
| packages/sync/src/collections/functions/command-request.ts:168-179 | `serverOwnedColumns` strip list (generic) | W | organization_id, lat, lng, geom_type, audit | generic; lat/lng/geom_type stripped on any table |
| packages/sync/src/collections/functions/command-request.ts:236-306 | `commandRequestFor`: insert -> POST `/commands/{table}`, update -> PATCH, delete -> DELETE; body = row/changes minus server-owned + locationSource + context + arguments + acknowledgements + `intents` from mutation metadata | W | generic | generic; nothing names applications |
| packages/sync/src/collections/functions/command-request.ts:194-215 | `commandBodyFromRow` (transaction path body) | W | generic | - |
| packages/sync/src/collections/functions/command-transaction.ts | `commandTransaction`, bound to `MultiRowCommandType`; one request per transaction | W | generic | - |
| packages/sync/src/collections/functions/routes.ts:18,28 | `shapePathFor` / `commandPathFor(table)` derived from table name | - | `/sync/shapes/{table}`, `/commands/{table}` | a new `treatments` table gets `/commands/treatments` and `/sync/shapes/treatments` automatically |
| apps/web/src/lib/collections/applications.ts:19-24 | sync descriptor: `syncMode: 'on-demand'`, `mutations: true` ("One row per treatment") | - | - | descriptor lives in the app, not packages/sync |
| apps/web/src/lib/collections/application_batches.ts:18-23 | sync descriptor: `on-demand`, `mutations: true` | - | - | - |
| docs/sync.md:45 | web matrix row, Control operations: `applications`, `application_batches` in the on-demand column | doc | - | needs `treatments` added |
| docs/sync.md:284 | mobile policy: "Application batches: persisted with loaded applications"; "Performed control actions: three-year persisted history" | doc | - | window is by operational date (application_date, T) |

How a mutation becomes commands (from apps/web, for context): `use-application-mutations.ts:213-241` creates via `commandTransaction` inserting one `applications` row plus N `application_batches` rows, intent `controlOperations.recordChemicalApplication` or `missionDispatch.recordChemicalApplicationForMissionItem`; body key `application_batches` carries child rows. Edit at :278-280 sends `fieldsIntent: updateChemicalApplicationFieldDetails` and `placementIntent: updateChemicalApplicationLocationAndContext` on one PATCH; batches at :333/:352 are single-row mutations on `application_batches`; delete at :384. Server side: `apps/server/src/table-commands/applications.ts:152` (`applicationTableCommands`, table 'applications') and `:264` (`applicationBatchTableCommands`, table 'application_batches').

Notes: row schema is the T+L mix in one row; a `treatments` row schema, generated collection factory, barrel entries and drift test lines come from `pnpm generate:schemas`; `applications` schema loses the 15 T columns (and lat/lng/geom_type, since geometry goes to T) and gains `treatment_id`. The generic write path needs no change, but a create becomes a multi-table `commandTransaction` (treatments + applications + application_batches) and the `MultiRowCommandType` member list (packages/domain/src/command-vocabulary.ts:146-171) must name the new create. Web needs a `treatments` descriptor (likely `on-demand`). `WITHHELD` does not name either table.

### Domain commands

Payload builders in `packages/domain/src/control-operations/actions.ts`; names in `core.ts:73-78`; union in `index.ts:150-155`; validators in `packages/domain/src/performed-control-actions.ts`. Server column mapping from `apps/server/src/writers/control-operations/chemical-applications.ts` and `chemical-application-batches.ts`.

| file:line | what it is | R/W | columns/fields | T/L/B mix |
| --- | --- | --- | --- | --- |
| actions.ts:53-91, 427-469 | `recordChemicalApplicationCommand` | W | all T and L fields + batches | T+L+batches in one payload |
| actions.ts:93-117, 471-489 | `updateChemicalApplicationFieldDetailsCommand`, `CHEMICAL_APPLICATION_UPDATE_FIELDS` | W | date, applicator, method, insecticide, amount, unit, vehicle, equipment, metadata; `acknowledgedBatchClearance` | T+L in one field set |
| actions.ts:119-139, 491-507 | `updateChemicalApplicationLocationAndContextCommand` | W | locationSource, addressId, context, requestedControlActionId | all T |
| actions.ts:141-154, 509-523 | `deleteChemicalApplicationCommand` | W | applicationId + 2 acks | deletes the line; cascades batches (L) and support rows (T under split) |
| actions.ts:156-165, 525-543 | `addChemicalApplicationBatchCommand` | W | applicationBatchId, applicationId, insecticideBatchId | L |
| actions.ts:167-175, 545-549 | `removeChemicalApplicationBatchCommand` (`idCommand`) | W | applicationBatchId | L |
| performed-control-actions.ts:34-44, 72-101 | `NormalizedChemicalApplicationFields`, `normalizeChemicalApplicationFields` | - | insecticide, amount, unit, date, applicator (defaults to actor), method, vehicle, equipment, batches | T+L in one normalizer |
| performed-control-actions.ts:103-132 | `normalizeMissionChemicalApplicationFields` (verbatim copy of the above) | - | same | T+L |
| performed-control-actions.ts:20-27 | `ControlActionContext` (none / larval habitatId+inspectionId / adult collectionId) | - | -> habitat_id, inspection_id, collection_id | T |
| performed-control-actions.ts:283-337 | `validateControlActionContext`; adult context allowed only for `chemicalApplication`, `requestedAction`, `application` | - | context | T; Treatment needs to be an allowed kind |
| performed-control-actions.ts:339-380 | `normalizeApplicationBatches` (unique applicationBatchId and insecticideBatchId) | - | batches | L |
| products.ts:667-723 | `expandFormulationApplicationCommands`: one Formulation mix -> N `RecordChemicalApplicationCommand`, one per insecticide, all repeating the same T fields | W | per-component applicationId, insecticideId, amount, unit, batches; shared T fields | the clearest case for the split: N lines under one Treatment |
| mission-dispatch/mission-items.ts:235-266, 595-628 | `recordChemicalApplicationForMissionItemCommand` (`missionDispatch.*`) | W | missionItemId, applicationId, L fields, date/applicator/method/vehicle/equipment, plus mission execution payload (geometry, addressId, requestedControlActionId, context, metadata, completeMissionItem, autoStartMission, 3 acks) | T+L; mission_item_id is T |
| mission-dispatch/shared.ts:60, 370-420 | `validateMissionExecutionBase`, `missionExecutionPayload` (`allowedFor: 'chemicalApplication' | ...`) | - | geometry via `validateLocatableGeometry('controlAction')` | T |
| command-vocabulary.ts:152-153 | `MultiRowCommandType` names both creates | - | - | - |

#### recordChemicalApplication

| payload field | column | T/L |
| --- | --- | --- |
| applicationId | applications.id | B |
| organizationId | organization_id | B |
| actorProfileId | created_by_profile_id, updated_by_profile_id | B |
| applicationDate | application_date | T |
| applicatorProfileId (defaults to actor) | applicator_profile_id | T |
| applicationMethodId | application_method_id | T |
| vehicleId | vehicle_id | T |
| equipmentId | equipment_id | T |
| locationSource | geom (server resolves; lat/lng/geom_type/geojson trigger-maintained) | T |
| addressId | address_id | T |
| context | habitat_id, inspection_id, collection_id | T |
| requestedControlActionId | requested_control_action_id | T |
| metadata | metadata | T |
| insecticideId | insecticide_id | L |
| amountApplied | amount_applied | L |
| applicationUnitId | application_unit_id | L |
| applicationBatches[] {applicationBatchId, insecticideBatchId} | application_batches rows (id, insecticide_batch_id, application_id) | L |

#### updateChemicalApplicationFieldDetails

| payload field | column | T/L |
| --- | --- | --- |
| applicationId | WHERE id | B |
| changes.applicationDate | application_date | T |
| changes.applicatorProfileId | applicator_profile_id | T |
| changes.applicationMethodId | application_method_id | T |
| changes.vehicleId | vehicle_id | T |
| changes.equipmentId | equipment_id | T |
| changes.metadata | metadata | T |
| changes.insecticideId | insecticide_id (+ soft-deletes incompatible application_batches) | L |
| changes.amountApplied | amount_applied | L |
| changes.applicationUnitId | application_unit_id | L |
| acknowledgedBatchClearance | gate for the batch clear on insecticide change | L |

#### updateChemicalApplicationLocationAndContext

| payload field | column | T/L |
| --- | --- | --- |
| applicationId | WHERE id | B |
| changes.locationSource | geom (+ trigger cols) | T |
| changes.addressId | address_id | T |
| changes.context | habitat_id, inspection_id, collection_id (collection allowed) | T |
| changes.requestedControlActionId | requested_control_action_id | T |

#### deleteChemicalApplication

| payload field | column | T/L |
| --- | --- | --- |
| applicationId | applications.deleted_at, deleted_by_profile_id (soft delete) | B |
| acknowledgedBatchDeletion | cascades application_batches | L |
| acknowledgedSupportRecordDeletion | cascades comments, additional_personnel (entity_type 'application') | T under split |

#### addChemicalApplicationBatch

| payload field | column | T/L |
| --- | --- | --- |
| applicationBatchId | application_batches.id | L |
| applicationId | application_batches.application_id | L |
| insecticideBatchId | application_batches.insecticide_batch_id | L |

#### removeChemicalApplicationBatch

| payload field | column | T/L |
| --- | --- | --- |
| applicationBatchId | application_batches.deleted_at (soft delete) | L |

Notes: `updateChemicalApplicationFieldDetails` and `recordChemicalApplication` (and the mission twin) edit T and L together; under the split each needs either a T half on a Treatment command and an L half on a line command, or one multi-table command. `updateChemicalApplicationLocationAndContext` is all T and moves wholesale to the Treatment. Delete splits into a Treatment delete (cascading lines, support rows) and a line delete (cascading batches). Batch commands stay line-level, but their permission is checked against the performer, which becomes a T column reached through two hops. `expandFormulationApplicationCommands` becomes one Treatment + N lines. The two normalizers are duplicates and both mix T and L.

### Domain other

| file:line | what it is | R/W | columns/fields | T/L/B mix |
| --- | --- | --- | --- | --- |
| packages/domain/src/shared.ts:200-205 | `OWNED_GEOMETRY_POLICIES` kind `controlAction`, tables `['applications','source_reductions','outreach_actions','biocontrol_actions']`, `EVERY_SHAPE` | - | geom | T (geometry moves to treatments) |
| packages/domain/src/location-intent.ts:151-162 | `controlAction` location-source flow (geometry, address, serviceRequest, habitat, inspection, requestedControlAction, missionItem), `geometryKind: 'controlAction'` | - | locationSource | T |
| packages/domain/src/address-linked-records.ts:21-32, 59 | `LINKED_RECORD_CATEGORIES` `'application'` -> family `controlActions` | R | address_id | T (would read treatments) |
| packages/domain/src/profile-activity.ts:21-31 | `ACTIVITY_CATEGORIES` `'application'` (performer + additional_personnel) | R | applicator_profile_id, date, geom | T |
| packages/domain/src/overview/overview.ts:18-27 | `OVERVIEW_RECORD_TYPES` `'applications'` | R | count by application_date | open question: count Treatments or lines |
| packages/domain/src/field-work/shared.ts:11-28, 138-156 | `CommentTargetType` / `COMMENT_TARGET_TYPES` include `'application'` | - | comments.entity_type | T (moves to treatment) |
| packages/domain/src/field-work/shared.ts:38-44, 228-235 | `AdditionalPersonnelTargetType` / `ADDITIONAL_PERSONNEL_TARGET_TYPES` include `'application'` | - | additional_personnel.entity_type | T |
| packages/domain/src/field-work/shared.ts:30-36, 158-165 | `TAG_TARGET_TYPES` does NOT include application | - | tag_items.entity_type | tags on a Treatment would be new, not a move (also `tags.relevant_entity_types` CHECK) |
| packages/domain/src/field-work/shared.ts:246, 263 | `toDbEntityType` / `fromDbEntityType` (camel <-> snake) | - | - | `treatment` needs no bridge |
| packages/domain/src/column-vocabularies.ts:57, 168 | `CONTROL_TYPES` `'application'` for `control_type` | - | missions/requested_control_actions.control_type | enum value names the kind of work, not the table; probably unchanged |
| packages/domain/src/acknowledgements.ts:33-34, 90 | vocabulary: `acknowledgedBatchClearance`, `acknowledgedBatchDeletion`, `acknowledgedSupportRecordDeletion` | - | - | L, L, T |
| packages/domain/src/performed-control-actions.ts:14-18 | `PerformedControlActionKind` `'chemicalApplication'` | - | - | a Treatment kind or rename |
| packages/domain/src/mission-dispatch/shared.ts:374-406 | `allowedFor` unions name `'chemicalApplication'` | - | - | same |

Notes: every record-type key (`application`) used for comments, personnel, linked records, activity and record nouns is the single `CommentTargetType` union, so adding `treatment` there ripples to `RecordType` in apps/web and `RECORD_NOUNS`.

### Registers

| register | file:line | names | needs a `treatments` entry? |
| --- | --- | --- | --- |
| `OWNED_GEOMETRY_POLICIES` | packages/domain/src/shared.ts:202-205 | `controlAction` tables include `applications` | Yes: swap `applications` for `treatments` in the `controlAction` row (one policy, still table-keyed list). `check:geometry-policies` `EXPECTED_TABLES = 15` stays 15 if swapped, 16 if both kept |
| `COMMAND_PERMISSIONS` | apps/server/src/command-permissions.ts:592-597 (+ rule consts 182-197, 234-238; `PerformedRecordRef.table` union 75-91; `DeletionEscalation.entityType` 113-118, `hasBatchLinks`) | six ChemicalApplication commands; `OWN_APPLICATION` keys performer on `applications.applicator_profile_id` / `application_date`; `OWN_APPLICATION_VIA_BATCH` goes through `application_batches.application_id` | Yes: performer and date move to treatments, so `OWN_APPLICATION` needs a `through` hop applications -> treatments, and via-batch needs two hops; new Treatment commands need entries; `PerformedRecordRef.table` union and `through.table` literal widen |
| `ACKNOWLEDGEMENT_MECHANISMS` | apps/server/src/acknowledgements.ts:139-140, 201 | `acknowledgedBatchClearance: clearanceCheck`, `acknowledgedBatchDeletion: deleteRegistry`, `acknowledgedSupportRecordDeletion: deleteRegistry` | Keyed by flag, not table; no new key unless a Treatment delete needs a new flag (e.g. cascading lines) |
| Record deletion registry (feeds `deleteRegistry`) | packages/db/src/domains/record-deletion.ts:28, 1023-1052 | `application`: cascades application_batches, comments(entity 'application'), additional_personnel | Yes: `treatment` entry (cascade lines, comments, personnel); `application` keeps only batches |
| `WRITE_SURFACE_FLOORS` | apps/web/src/lib/write-surfaces.ts:35-36 | `/control-operations/chemical/$id/edit`, `/control-operations/chemical/create` (collector) | Only if routes change; keyed by route |
| `SEARCH_CORPUS` | packages/db/src/domains/search.ts:49 | does not name applications | No (unless Treatments become searchable) |
| `MAP_SURFACES` | packages/db/src/domains/map-surface-register.ts:83 | `chemical: applicationSurface` | Keyed by tileset; `applicationSurface` reader must join treatments for geom; key `chemical` can stay |
| `MapTilesetLayer` | packages/db/src/domains/map-layers.ts:34 | `'chemical'` | No new key unless a Treatment layer is added |
| `TILE_LAYER_BINDINGS` | apps/web/src/components/map/tile-layers.ts:241 | `chemical` | same as above |
| `/map/chemical*` routes | apps/server/src/map-tiles.ts:443-471 | key `applications` / `application` | readers change, keys optional |
| `RECORD_NOUNS` | apps/web/src/lib/record-nouns.ts:77-81 | `application`: chemical application(s) | Yes if `treatment` joins `CommentTargetType` (Record<RecordType,...> is exhaustive) |
| `COLUMN_VOCABULARIES` | packages/domain/src/column-vocabularies.ts:168 | `control_type: CONTROL_TYPES` ('application') | No |
| `SERVER_OWNED` / `TRIGGER_MAINTAINED` | scripts/generate-table-types.mjs:78, 134-144 | generic column names | No entry; but the `set_owned_centroid()` trigger (and so lat/lng/geom_type) must be on treatments, which changes `ServerOwnedColumns` emitted in tables.ts |
| client `serverOwnedColumns` | packages/sync/src/collections/functions/command-request.ts:168 | generic | No |
| `WITHHELD` | scripts/withheld-columns.mjs:42 | memberships, organizations only | No |
| `OMIT` | scripts/generate-table-schemas.mjs:205 | geom, geojson, deleted_at, deleted_by_profile_id | No |
| `MultiRowCommandType` | packages/domain/src/command-vocabulary.ts:146-171 | both chemical creates | Yes, any new multi-table Treatment create |
| `OVERVIEW_RECORD_TYPES` | packages/domain/src/overview/overview.ts:22 | `applications` | Decide: rename/retarget |
| `LINKED_RECORD_CATEGORIES`, `ACTIVITY_CATEGORIES`, `COMMENT_TARGET_TYPES`, `ADDITIONAL_PERSONNEL_TARGET_TYPES` | see Domain other | `application` | Yes, retarget or add `treatment` |
| UI acknowledgement copy | apps/web/src/lib/acknowledgement-copy.ts:433-442 | `APPLICATION_DELETE_REFUSALS`, `APPLICATION_SAVE_REFUSALS` | read by `check:acknowledgements`; a Treatment delete needs its own |

Notes: `OWNED_GEOMETRY_POLICIES` is keyed by kind with one `controlAction` policy over four tables, so moving geometry is a table-list swap inside one row. `COMMAND_PERMISSIONS` is the heaviest: every application performer rule reads T columns off `applications` today.

### Rot gates

| gate | script | names applications? | effect of the split |
| --- | --- | --- | --- |
| `check:geometry-policies` | scripts/check-geometry-policies.mjs:97-98 | indirectly (`EXPECTED_KINDS = 12`, `EXPECTED_TABLES = 15`) | adjust `EXPECTED_TABLES` if a table is added rather than swapped; `owned-geometry.integration.test.ts` reads the CHECK on each table |
| `check:table-types` | scripts/generate-table-types.mjs | via schema.sql | new `treatments` table type, `ServerOwnedColumns` |
| `check:schemas` | scripts/generate-table-schemas.mjs | via tables.ts | regenerate collections/barrels/drift; hand edit field lines for `treatments` and trimmed `applications` |
| `check:server-owned-columns` | scripts/check-server-owned-columns.mjs | generic | no change expected |
| `check:write-surfaces` | scripts/check-write-surfaces.mjs | route-keyed | only if routes change |
| `check:write-references` | scripts/check-write-references.mjs:9 (comment) | comment only | any Treatment writer naming habitat/inspection/etc ids must go through `assertWriteReferences` |
| `check:acknowledgements` | scripts/check-acknowledgements.mjs | via flags and copy | new flag (if any) needs vocabulary + mechanism + copy |
| `check:tileset-keys` | scripts/check-tileset-keys.mjs | via `chemical` key | only if a tileset is added/renamed |
| `check:search-corpus` | scripts/check-search-corpus.mjs | no | none unless searchable |
| `check:record-nouns` | scripts/check-record-nouns.mjs:10-11, 94, 147-160, 530 (comments/probe) | probe literal "this application" | a `treatment` noun needs a register row; copy must go through `recordNoun` |
| `check:nav-labels` | scripts/check-nav-labels.mjs:22 (comment) | comment | new create label for a Treatment page goes through the register |
| `check:vocabulary` | scripts/check-vocabulary.mjs:380 | "Application" is a qualify-not-refuse word in CONTEXT.md:166 | `Treatment` is not yet in CONTEXT.md (Control operations row at :63); add it there |
| `check:column-vocabularies` | scripts/check-column-vocabularies.mjs | `control_type` | none |
| `check:mutation-coverage` | - | `use*` hooks | any new Treatment mutation hook must be named in a mutation suite |
| `check:dead-code` (fallow) | - | - | removed builders/exports must have no leftovers |

### Mapping/ui-web

| file:line | what it is | R/W | columns/fields | T/L/B mix |
| --- | --- | --- | --- | --- |
| packages/ui-web/src/icons/registry.ts:169 | icon `application` ('Application', SprayCan) | - | - | a `treatment` icon may be wanted |
| packages/mapping/src/geometry-check.ts:14 | comment pointing at `OWNED_GEOMETRY_POLICIES` | - | - | none |
| packages/mapping | no reference to applications (only `application/*` MIME types in geometry-import.ts) | - | - | none |

Notes: nothing in mapping changes; ui-web only has the icon.

### Tests

- packages/sync/src/tests/unit/collections/tables/drift.test.ts (generated)
- packages/sync/src/tests/unit/collections/functions/command-transaction.test.ts
- packages/domain/src/tests/unit/control-operations.test.ts
- packages/domain/src/tests/unit/mission-dispatch.test.ts
- packages/domain/src/tests/unit/command-vocabulary.test.ts
- packages/domain/src/tests/unit/overview/aggregate.test.ts
- packages/domain/src/tests/unit/shared.test.ts
- packages/domain/src/tests/unit/update-command-fields.test.ts
- owned-geometry.integration.test.ts (packages/db, reads CHECKs against `OWNED_GEOMETRY_POLICIES`)
- scripts/src/tests/unit (check-record-nouns probe at scripts/check-record-nouns.mjs:530 is in-script)

## Web and admin

Scope: `apps/web/src`, `apps/admin/src`, non-generated, non-test. Columns are read from the code.
Legend: T = Treatment-bound, L = Line-bound, B = both/undecided (id, organization_id, audit).
"R/W": R = reads synced rows (TanStack DB), R(REST) = reads a server endpoint, W = writes, V = vocabulary/label/link only.

Headline: **apps/admin has no reader or writer** (one copy string, see Admin). In apps/web, every synced reader goes through `lib/collections/applications.ts`, and most join through `PERFORMED_ACTIONS.applications` in `hooks/queries/performed-action-reads.ts`. That helper bundles `insecticide_id`, `amount_applied`, `application_unit_id` (L) with `application_method_id`, `applicator_profile_id` (T) in one `measured()` call, so it is the main seam to split.

---

### Collection wiring and shared read helpers

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/lib/collections/applications.ts:19 | `applications` collection, on-demand, mutations on ("one row per treatment") | R/W | whole row | T+L+B | no |
| apps/web/src/lib/collections/application_batches.ts:18 | `application_batches` collection, on-demand, mutations on | R/W | whole row | L+B | no |
| apps/web/src/hooks/queries/activity-dates.ts:55 | `ACTIVITY_DATES.applications.column`, the date every windowed read filters on | R | application_date | T only | no |
| apps/web/src/hooks/queries/performed-action-reads.ts:62 | `PERFORMED_ACTIONS.applications`: joinProduct, joinMethod, joinUnit, joinPerformer, measured() | R | insecticide_id, application_method_id, application_unit_id, applicator_profile_id, amount_applied, application_date | T+L | no |
| apps/web/src/hooks/queries/performed-action-reads.ts:228 | `controlActionBaseSelect`, shared placement + audit projection | R | address_id, inspection_id, requested_control_action_id, mission_item_id, lat, lng, geom_type, metadata, created_at, updated_at, created_by_profile_id, updated_by_profile_id | T+B | no |
| apps/web/src/hooks/queries/control-action-view.ts:51 | `ChemicalApplication` view type (one product per record) | type | insecticideId, productName, methodId, applicatorProfileId, amountApplied, unitId, vehicleId, equipmentId, habitatId, collectionId + base | T+L+B | no |

Notes: `measured()` returns product, amount, unit (L) alongside method and performer (T). Every consumer below takes it as one object, so after the split each consumer needs the line join plus the treatment join. `ChemicalApplication` is a flat T+L shape; one Treatment with several products does not fit it.

### Chemical form + create + edit (writes)

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/hooks/mutations/use-application-mutations.ts:150 | `record`: one `applications` row + its `application_batches` links in one command (`controlOperations.recordChemicalApplication` or `missionDispatch.recordChemicalApplicationForMissionItem`), POST `/commands/applications` with nested `application_batches` | W | id, organization_id, application_method_id, insecticide_id, applicator_profile_id, application_date, lat, lng, geom_type, address_id, vehicle_id, equipment_id, amount_applied, application_unit_id, habitat_id, collection_id(null), inspection_id(null), requested_control_action_id(null), mission_item_id, metadata, audit; batches: id, application_id, insecticide_batch_id, audit; body also carries locationSource, context, acknowledgements | T+L+B | no |
| apps/web/src/hooks/mutations/use-application-mutations.ts:248 | `update`: diff-driven, picks `updateChemicalApplicationFieldDetails` and/or `updateChemicalApplicationLocationAndContext`; `acknowledgedBatchClearance` when product moves | W | fields group: insecticide_id, amount_applied, application_unit_id, application_date, application_method_id, applicator_profile_id, vehicle_id, equipment_id, metadata; placement group: address_id, habitat_id, lat, lng, geom_type (+ locationSource, context with inspection_id); updated_by_profile_id, updated_at | T+L+B (one "fields" intent mixes T and L) | no |
| apps/web/src/hooks/mutations/use-application-mutations.ts:324 | `addBatch` (`addChemicalApplicationBatch`) | W | application_batches: id, organization_id, application_id, insecticide_batch_id, audit | L | no |
| apps/web/src/hooks/mutations/use-application-mutations.ts:348 | `removeBatch` (`removeChemicalApplicationBatch`) | W | application_batches key | L | no |
| apps/web/src/hooks/mutations/use-application-mutations.ts:358 | `setBatches`: reconciles links by add/remove | W | application_batches (via the two above) | L | no |
| apps/web/src/hooks/mutations/use-application-mutations.ts:378 | `remove` (`deleteChemicalApplication`) with acknowledgements | W | applications key | B (deletes the whole visit today) | no |
| apps/web/src/routes/control-operations/chemical/create.tsx:81 | create route: mints id, splits a formulation into one `record` per component product, sequential, "Recorded N of M" partial-failure copy; then `recordExtras.attach` (personnel + comment) per saved product | W | all `record` columns; per-product: insecticideId, amountApplied, applicationUnitId, insecticideBatchIds; shared: date, method, applicator, vehicle, equipment, address, habitat, metadata, location, missionItemId | T+L | yes: `recordCount('application', products.length)` and `saved.length` in toasts |
| apps/web/src/routes/control-operations/chemical/create.tsx:244 | `formulationProducts`: mix -> N application rows, first reuses minted id | W (prep) | insecticide_id, amount_applied, application_unit_id, batch ids | L | no |
| apps/web/src/routes/control-operations/chemical/$id_.edit.tsx:67 | edit route: `useApplication`, `useOwnedGeometry(CHEMICAL_GEOMETRY_SOURCE)`, `useAdditionalPersonnel({type:'application'})`, `useApplicationBatches`; save = `update` then `setPersonnel` + `setBatches` | R/W | everything in `update`, personnel by entity_type application, batches | T+L | no |
| apps/web/src/routes/control-operations/chemical/$id_.edit.tsx:281 | `defaultsFromApplication`: edit is always single-product (`productMode: 'insecticide'`) | R | insecticideId, amountApplied, unitId, actionDate, methodId, applicatorProfileId, vehicleId, equipmentId, addressId, habitatId, metadata, batch ids, personnel ids | T+L | no |
| apps/web/src/components/control-operations/chemical/application-form.tsx:198 | `ApplicationFormPage`: one form for date, applicator, additional personnel, habitat, address, product mode, formulation, insecticide, amount, unit, batches, method, vehicle, equipment, metadata, comment, geometry | W (form) | applicationDate, applicatorProfileId, additionalPersonnelIds, habitatId, addressId, productMode, formulationId, insecticideId, amountApplied, applicationUnitId, insecticideBatchIds, componentBatchIds, applicationMethodId, vehicleId, equipmentId, metadata, comment | T+L | no |
| apps/web/src/components/control-operations/chemical/application-form-values.ts:102 | `validateApplication`: domain builders `recordChemicalApplicationCommand` / `expandFormulationApplicationCommands`; form value shape and field-path map | V (validation) | same field set as the form | T+L | no |
| apps/web/src/components/control-operations/chemical/formulation-breakdown.tsx:64 | mix preview "Saves as N chemical applications" | V | component insecticide/amount/unit (formulation tables) | L | yes: component count as application count |
| apps/web/src/components/control-operations/chemical/formulation-section.tsx:153 | comment only ("nothing to expand into applications") | V | none | n/a | no |
| apps/web/src/components/control-operations/chemical/insecticide-batch-options.tsx:24 | batch picker options for the chosen product (reads `insecticide_batches`, not `application_batches`) | R | insecticide_batches.insecticide_id | L (feeds application_batches) | no |
| apps/web/src/lib/acknowledgement-copy.ts:434 | `APPLICATION_DELETE_REFUSALS` (batch + support record deletion), `APPLICATION_SAVE_REFUSALS` (batch clearance) | V | none | B / L | no |
| apps/web/src/lib/write-surfaces.ts:35 | role floors for `/chemical/$id/edit` and `/chemical/create` (collector) | V | none | n/a | no |
| apps/web/src/hooks/forms/use-record-extras.ts:33 | personnel + first comment attached to `{type:'application', id}` after create | W | additional_personnel / comments with entity_type application | T (support records) | no |

Notes: the form edits location, placement, crew, rig and product together on one record; the formulation path already writes one visit as N full rows that each duplicate date, method, applicator, rig, address, habitat, geometry, metadata, personnel and comment (create.tsx:181 attaches personnel and the note to *each* product row). That is the exact duplication the Treatment removes. Edit is single-product only, so editing a mix today means editing N records. `update`'s "field details" intent mixes T (date, method, applicator, rig, metadata) with L (product, amount, unit), and the product-change batch clearance is L. Delete removes the whole visit-row; after the split, "delete a product line" and "delete the treatment" are different commands.

### Chemical detail page

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/hooks/queries/use-application.ts:35 | `useApplication`: one row by id joined to insecticide, method, unit, applicator, address, vehicle, equipment | R | id, insecticide_id, application_method_id, applicator_profile_id, amount_applied, application_unit_id, application_date, address_id, vehicle_id, equipment_id, habitat_id, collection_id + base (inspection_id, requested_control_action_id, mission_item_id, lat, lng, geom_type, metadata, audit) | T+L+B | no |
| apps/web/src/hooks/queries/use-application-batches.ts:25 | links for one application, deduped batch ids | R | application_batches: id, application_id, insecticide_batch_id, created_at | L | no |
| apps/web/src/routes/control-operations/chemical/$id.tsx:100 | detail route: `RecordDetailPage recordType="application"`, delete refusals, breadcrumb = product name, header title = product, subtitle = amount + date | R/W(delete) | productName, amountApplied, unitAbbreviation, actionDate, methodId (custom-field schema), metadata | T+L | no |
| apps/web/src/routes/control-operations/chemical/$id.tsx:146 | `CommentsSection target={{type:'application'}}` | R/W | comments by entity_type application | T (support) | no |
| apps/web/src/routes/control-operations/chemical/$id.tsx:187 | `RecordRegionsBand recordType="applications"` (REST membership) | R(REST) | geom (server) | T | no |
| apps/web/src/routes/control-operations/chemical/$id.tsx:208 | `ApplicationLocationCard`: full geometry via `CHEMICAL_GEOMETRY_SOURCE`, habitat underlay | R(REST) | geojson/geom_type, habitat_id, updated_at | T | no |
| apps/web/src/routes/control-operations/chemical/$id.tsx:244 | `ApplicationBatchesCard`: list, add, remove links; picker scoped by `application.insecticideId` | R/W | application_batches; insecticide_batches.insecticide_id | L | yes: "N batches" badge |
| apps/web/src/routes/control-operations/chemical/$id.tsx:447 | `ApplicationDetailsCard`: Product, Amount, Date, Method, Applicator, Vehicle, Equipment, Habitat link, Address, `AdditionalPersonnelList type 'application'` | R | insecticide/amount/unit + date, method, applicator, vehicle, equipment, habitat_id, address_id, personnel | T+L | no |
| apps/web/src/hooks/use-owned-geometry.ts:29 | `CHEMICAL_GEOMETRY_SOURCE` (segment `chemical`, bodyKey `application`, kind `controlAction`) | R(REST) | geom/geojson | T | no |
| apps/web/src/hooks/use-delete-impact.ts:21 | `DeletableRecordType` includes `application` (REST delete impact) | R(REST) | server-side | B | yes (server lists dependants) |
| apps/web/src/components/record-delete-dialog.tsx:54 | delete floor `application: 'manager'` | V | none | n/a | no |
| apps/web/src/components/record/record-badges.tsx:171 | `application: NO_BADGES` | V | none | n/a | no |

Notes: the page is titled by the one product and lays product, amount and batches beside the visit facts. With several products the title, breadcrumb, subtitle, Details card and Batches card all need a per-line section; the Batches card's picker scope (`insecticideId`) only works per line. Comments, personnel, regions and geometry belong to the Treatment page.

### Explorer (map + table), map card, filters, summary

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/components/control-operations/chemical/applications-search.ts:72 | `applicationRecordSet`: endpoint `/map/chemical` (rowsKey `applications`, rowKey `application`), tileset `chemical`, filters, 90-day map window, export | R(REST) | filters: application_date (from/to), insecticide_id, applicator_profile_id, application_method_id, region (geom) | T+L | yes: `total` and DATE_RANGE_COUNTING filter count |
| apps/web/src/components/control-operations/chemical/applications-search.ts:57 | `applicationTileFilters`: insecticideIds, applicationMethodIds, applicatorProfileIds, regionIds, dateFrom, dateTo | R(REST tiles) | same | T+L | no |
| apps/web/src/components/control-operations/chemical/application-row-parts.ts:8 | `ApplicationListRow` (one row of `/map/chemical`) + `normalizeApplication` | R(REST) | id, lat, lng, insecticideId, applicationMethodId, applicationDate, amountApplied, applicationUnitId, habitatId, applicatorProfileId, applicatorName, batchNames | T+L | no |
| apps/web/src/routes/control-operations/chemical/index.tsx:48 | Chemical Applications map explorer: rail row titled by product, subtitle amount + method, personnel = applicator + batches; heading total | R(REST) | as ApplicationListRow | T+L | yes: heading `total` (rows) |
| apps/web/src/components/control-operations/chemical/application-summary.ts:11 | summary "Amount Applied" figures from `/map/chemical/summary` breakdown `amountApplied` by insecticideId+unitId | R(REST) | insecticide_id, application_unit_id, amount_applied (sum), count | L | yes: count + sum(amount_applied) per insecticide and unit |
| apps/web/src/components/control-operations/chemical/application-filters.tsx:30 | filter declarations; summary groupings `insecticideId`, `applicationMethodId`, `applicatorProfileId` | R(REST) | insecticide_id, application_method_id, applicator_profile_id | T+L | yes: server group counts per insecticide, method, applicator |
| apps/web/src/routes/control-operations/chemical/table.tsx:27 | Chemical Applications table route (all time) | R(REST) | as ApplicationListRow | T+L | yes: page total |
| apps/web/src/components/control-operations/chemical/applications-table.tsx:30 | table: Insecticide, Date, Amount, Method, Applicator; one row per application | R(REST) | insecticideId, applicationDate, amountApplied, applicationUnitId, applicationMethodId, applicatorName | T+L | no |
| apps/web/src/components/control-operations/application-map-card.tsx:30 | map card: `useApplication` + `useApplicationBatchNames`; title product, amount, method, applicator, batches, address, location | R | as useApplication + batch names | T+L | no |
| apps/web/src/hooks/queries/use-application-batch-names.ts:57 | batch names for one application (links joined to insecticide_batches) | R | application_batches.application_id, insecticide_batch_id; insecticide_batches.batch_name | L | no |
| apps/web/src/components/map/chemical-tiles.ts:18 | `chemical` tile source/layers ("select a chemical application") | R(REST tiles) | geom, id (server) | T | no |
| apps/web/src/components/map/tile-layers.ts:241 | `chemical` tile layer binding with `CHEMICAL_MAP_FILTERS` | R(REST tiles) | filter columns above | T+L | no |
| apps/web/src/components/map/map-create-targets.ts:51 | right-click create target `chemical` -> `/control-operations/chemical/create` | V | none | n/a | no |
| apps/web/src/components/map/geometry-tiles.ts:5 / map-card.tsx:242 | comments naming chemical applications | V | none | n/a | no |

Notes: the map, table and rail draw one row per product and the selected id opens one product. With a multi-product Treatment the map would stack N coincident features (one geometry, N rows), the rail and table would list the visit N times, and `total` would count lines not visits. The insecticide filter is L while date/method/applicator/region are T, so the endpoint has to join lines to treatments. The summary's amount breakdown is a true per-line sum and stays per line; the insecticide grouping counts lines, method/applicator groupings would double-count visits unless counted on the Treatment.

### Control Operations overview (`/control-operations`)

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/hooks/queries/use-control-actions-for-day.ts:70 | `useControlActionsForDay`: one day's applications joined to product, method, unit, performer | R | id, application_date, applicator_profile_id, insecticide_id, application_method_id, amount_applied, application_unit_id, created_at | T+L | no (list) |
| apps/web/src/routes/control-operations/index.tsx:180 | Daily Control Actions panel: count of actions, grouped by crew member, row = product + "Application · method" + amount | R | as above | T+L | yes: `actions.length` panel count, per-person `group.rows.length` |
| apps/web/src/routes/control-operations/index.tsx:293 | `kindBreakdown`: "4 applications · 2 source reductions" | R | kind | T+L | yes: counts application rows per person |
| apps/web/src/hooks/queries/use-insecticide-usage.ts:32 | `useInsecticideUsage`: window by application_date, sums amount per insecticide per unit, counts applications per insecticide | R | application_date, insecticide_id, amount_applied, application_unit_id | T (date) + L | yes: sum(amount_applied) per insecticide+unit; `applicationCount` per insecticide |
| apps/web/src/routes/control-operations/index.tsx:346 | Insecticide Usage panel: "N applications" per product, total in default unit | R | as above | T+L | yes: product rows, `applicationCount` |

Notes: the daily panel draws one row and counts one action per product, so one visit with three products reads as three applications for that person. `applicationCount` per insecticide stays correct per line (it counts lines naming that product), but its copy says "applications", which would mean visits after the split. The usage sum is L and is unaffected except that the date filter moves to the Treatment.

### Habitat history

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/hooks/queries/use-habitat-history.ts:258 | applications where habitat_id = habitat, joined to applicator, insecticide, method, unit, ordered by date desc | R | id, habitat_id, application_date, applicator_profile_id, insecticide_id, application_method_id, amount_applied, application_unit_id | T+L | no |
| apps/web/src/components/larval-surveillance/habitats/habitat-history-card.tsx:72 | tab "Applications (N)" | R | rows | T+L | yes: `applications.length` |
| apps/web/src/components/larval-surveillance/habitats/habitat-history-tabs.tsx:168 | `ApplicationHistory` table: Date (link to chemical detail), Applicator, Insecticide, Method, Amount | R | as above | T+L | no |

Notes: one row per product, and the tab count would count lines. A visit with two products shows two rows with the same date, applicator and method.

### Inspection detail

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/hooks/queries/use-linked-control-actions.ts:110 | applications where inspection_id = inspection, joined to insecticide, unit, actor | R | id, inspection_id, application_date, applicator_profile_id, insecticide_id, amount_applied, application_unit_id | T+L | no |
| apps/web/src/routes/larval-surveillance/inspections/$id.tsx:496 | Linked Control Actions card: badge count, row "Treated with {insecticide} · {amount}" | R | as above | T+L | yes: `actions.length` badge (all five kinds) |
| apps/web/src/routes/larval-surveillance/inspections/$id.tsx:708 | `case 'application'` on a requested action's `control_type` (vocabulary, not this table) | V | none | n/a | no |

Notes: one row per product; the badge counts lines.

### Activity Monitor, Daily Work, Dashboard

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/hooks/activity/use-day-activity.ts:189 | one day's applications joined to habitat + address, with assisting personnel (entity_type `application`) | R | id, lat, lng, application_date, insecticide_id, application_method_id, amount_applied, application_unit_id, applicator_profile_id, created_at, habitat_id (join), address_id (join); additional_personnel by entity_type application | T+L+B | no |
| apps/web/src/hooks/activity/use-day-activity.ts:67 | `ENTITY.application = 'application'` for personnel/tag joins | V | entity_type | T (support) | no |
| apps/web/src/components/activity/activity-entries.ts:501 | `applicationEntries`: one activity entry per application, refId = insecticide, methodRefId, amount, unit, primary person = applicator, plus assisting | R | as above | T+L | no |
| apps/web/src/components/activity/activity-data.ts:96 / :128 / :146 / :358 / :587 | category label, record type, detail route, badges, and row text (title = product, subtitle = amount · method · place) | V | refId/amount/method | T+L | no |
| apps/web/src/components/activity/activity-focus-card.tsx:27 | `application: ApplicationMapCard` on focus | R | via useApplication | T+L | no |
| apps/web/src/hooks/dashboard/use-people-today.ts:19 | "In the field today": `peopleByRecords(day.entries)` | R | entries | T+L | yes: records per person, counts each application entry |
| apps/web/src/routes/daily-work/$profileId.tsx:91 | per-person daily log via `useDayActivity` | R | entries | T+L | yes (entries per family) |
| apps/web/src/hooks/dashboard/use-activity-strip.ts:96 | dashboard strip: applications since date, weight 1 each | R | id, application_date | T only | yes: count of application rows per window vs prior window |
| apps/web/src/components/dashboard/activity-strip.tsx:20 | strip noun for the applications cell | V | none | n/a | yes (draws the count) |

Notes: activity, people-today and daily work make one entry per product, so a three-product visit is three "Applied" entries and three records for that person and the applicator plus assistants are each counted three times. The dashboard strip counts rows: it reads only T columns and would double-count once `applications` holds lines; it should count `treatments`.

### Overview + Period-in-review (`/today`, `/monthly`, `/annual`)

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/hooks/overview/use-overview.ts:65 | `GET /overview/:grain` (counts computed server-side) | R(REST) | server | T+L | yes: `applications` count per period (server) |
| apps/web/src/components/overview/overview-data.ts:122 / :151 | `OVERVIEW_LABELS.applications`, explorer link to `/control-operations/chemical` with from/to | V | none | n/a | yes (labels the count) |

Notes: the count is server-side; whether it counts lines or visits is decided there. The link opens the explorer, whose total must agree with the overview number.

### Mission stops, requests for control, operations

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/components/operations/missions/mission-stop-row.tsx:41 | stop "Record" button for control type `application` -> chemical create with stop | V (link) | mission_item_id (via create) | T | no |
| apps/web/src/hooks/mutations/use-application-mutations.ts:218 | `missionDispatch.recordChemicalApplicationForMissionItem` when missionItemId set | W | mission_item_id + all record columns | T+L | no |
| apps/web/src/components/operations/missions/mission-form.tsx:92 | default mission controlType `application` (vocabulary) | V | none | n/a | no |
| apps/web/src/components/operations/requests-for-control/request-form.tsx:49 | default request controlType `application` (vocabulary) | V | none | n/a | no |
| apps/web/src/components/operations/operations-data.ts:260 | `methodsForControlType('application')` -> application methods | V | none | n/a | no |
| apps/web/src/hooks/queries/operations-view.ts:36 | `CONTROL_TYPE_LABELS.application` | V | none | n/a | no |
| apps/web/src/components/gis/addresses/address-linked-records.ts:238 | "Closed by chemical application {insecticide}" for a done mission stop (REST linked rows, `closedByRefId` = insecticide) | R(REST) | closed-by category/id/refId (server) | T+L | no |

Notes: a mission stop is closed by one application record today. With a multi-product create, `create.tsx` calls `record` once per product, and each call with a missionItemId is `recordChemicalApplicationForMissionItem`; the stop provenance (ADR 0012) should point at the Treatment. "Closed by chemical application {product}" names one product.

### Address linked records, Service Request nearby

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/components/gis/addresses/address-linked-records.ts:30 | Address Linked Records (records whose address_id names the address), REST, family pages with totals; applications under `controlActions` | R(REST) | address_id, activity row fields (refId, amount, unit) | T+L | yes: family `total` and "Newest N of M" caption |
| apps/web/src/components/public-engagement/service-requests/service-request-nearby.ts:95 | nearby records, `application` in the control family (REST, ST_DWithin) | R(REST) | geom, activity row fields | T+L | yes: `truncated`/limit |

Notes: both are server-shaped activity rows, one per product today; totals count lines.

### Search

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/components/search/search-destinations.ts:66 | comment-hit destination `application` -> `/control-operations/chemical/$id` | V | comment entity_type | T (support) | no |
| apps/web/src/components/search/search-destinations.ts:184 / :214 / :238 | `applications` icon key and `chemical-create` action icon | V | none | n/a | no |
| apps/web/src/routes/search.tsx:194 | copy: applications are reached through their comments | V | none | n/a | no |
| apps/web/src/components/search/search-seeds.ts:10 | comment: an Application's seed is undecided | V | none | n/a | no |

Notes: applications are not in the search corpus; they are found via comments, which move to the Treatment, so the destination becomes the Treatment page.

### Record vocabulary, nav, regions, landing, misc

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/web/src/lib/record-nouns.ts:77 | `RECORD_NOUNS.application` (chemical application / Chemical Applications), keyed off domain `CommentTargetType` | V | none | n/a | used by every `recordCount('application', n)` |
| apps/web/src/components/app-shell/navigation.ts:516 / :532 / :541 | sidebar Chemical group: `listLabel('application')`, Map, Table, `createLabel('application')`, Application Methods | V | none | n/a | no |
| apps/web/src/components/app-shell/navigation.ts:123 | create verb `application: 'Record'` | V | none | n/a | no |
| apps/web/src/components/record/detail-create-actions.ts:50 | detail-page create action to `/control-operations/chemical/create` (seeded, e.g. from a habitat) | V | habitat_id seed | T | no |
| apps/web/src/components/map/record-regions-band.tsx:27 / apps/web/src/hooks/use-record-regions.ts:26 | region membership for `applications` table (REST `/records/applications/:id/regions`) | R(REST) | geom | T | no |
| apps/web/src/components/app-shell/upcoming-page.tsx:116 / :240 | Upcoming page link to chemical explorer; planned "Chemical Application Statistics" ("Applications per region") | V | none | n/a | planned counts |
| apps/web/src/components/landing/landing-stage.tsx:36 | landing copy ("insecticide applications recorded with product, rate, and treated area") | V | none | n/a | no |
| apps/web/src/components/my-organization/insecticides.tsx:52 / :74 | copy pointing at Control Operations "alongside the applications" | V | none | n/a | no (counts insecticides) |
| apps/web/src/components/my-organization/settings-sections.tsx:51 | batch tracking setting ("whether chemical applications record the insecticide batch") | V | none | L | no |
| apps/web/src/components/control-operations/control-methods-page.tsx:30 / routes/control-operations/chemical/methods.tsx:17 | Application Methods catalog (not this table; method moves to T) | V | none | T | no |
| apps/web/src/lib/write-access.ts:8 | comment naming "Record Application" | V | none | n/a | no |
| apps/web/src/hooks/queries/use-additional-personnel.ts:53 / hooks/queries/use-comments.ts:66 | generic polymorphic readers; `application` is a personnel and comment target (domain `ADDITIONAL_PERSONNEL_TARGET_TYPES`); applications are **not** a tag target (`TAG_TARGET_TYPES` has no `application`) | R/W | entity_type application, entity_id | T (support) | no |

Notes: the `'application'` record-type key threads through record nouns, comment targets, personnel targets, delete types, region membership, activity categories and search destinations. A `treatment` key needs adding beside it in each register.

### Admin

| file:line | what it is | R/W | columns touched | T/L/B mix | counts? |
| --- | --- | --- | --- | --- | --- |
| apps/admin/src/routes/units/index.tsx:133 | copy: "Formulations, applications, and samples all record against a unit." | V | none (application_unit_id is L) | L | no |

Notes: apps/admin neither reads nor writes `applications` or `application_batches`.

### Not readers (checked, excluded)

- `hooks/mutations/use-insecticide-batch-mutations.ts`, `hooks/queries/use-insecticide-batches.ts`, `use-formulation-*`: `insecticide_id` on `insecticide_batches` / `formulation_components`, not on `applications`.
- `hooks/mutations/use-application-method-mutations.ts`: the Application Methods catalog.

---

### Tests (apps/web/src/tests/unit)

- components/activity/activity-data.test.ts: activity row text and badges, includes application entries
- components/control-operations/application-map-card.test.tsx: map card fields incl. batch names
- components/control-operations/chemical/application-form-values.test.ts: validation, formulation expansion
- components/control-operations/chemical/application-summary.test.tsx: amount-applied summary figures
- components/control-operations/chemical/applications-search.test.ts: record set codecs, tile filters
- components/control-operations/chemical/expanding-catalog-rows.test.tsx: chemical catalog rows
- components/create-labels.test.tsx: `createLabel('application')`
- components/explorer/record-set.test.ts, result-meta.test.tsx: record set incl. chemical
- components/gis/addresses/address-linked-records.test.ts: closed-by phrase, linked rows
- components/my-organization/insecticides.test.tsx: insecticide pointer card
- components/operations/missions/mission-form.test.ts, operations-display.test.ts, operations-filter-chips.test.tsx: control type `application`
- components/overview/overview-data.test.ts, overview-fixtures.ts: overview labels and links
- components/public-engagement/service-requests/service-request-nearby.test.ts: nearby families
- components/record/record-badges.test.ts, record-table-states.test.tsx
- hooks/activity/use-day-activity.test.tsx: day activity incl. applications
- hooks/explorer/use-explorer-resource.test.tsx: explorer resource on chemical set
- hooks/mutations/control-operations.test.ts: application record/update/batch/delete commands (mutation suite)
- hooks/mutations/mission-dispatch.test.ts: `recordChemicalApplicationForMissionItem`
- hooks/mutations/performed-action-writes.test.ts, catalog.test.ts
- hooks/queries/operations-view.test.ts, performed-action-reads.test.tsx, unresolved-performed-actions.ts
- hooks/queries/use-application-batch-names.test.tsx, use-control-actions-for-day.test.tsx, use-habitat-history.test.tsx, use-linked-control-actions.test.tsx
- lib/attach-links.test.ts, domain-validation.test.ts, record-nouns.test.ts
- link-destinations.test.tsx: chemical detail links
- routes/control-operations/chemical/application-detail.test.tsx, chemical-summary.test.tsx
- routes/daily-work/daily-work-log.test.tsx
- routes/edit-link-failures.test.tsx, edit-loaders.test.tsx, edit-record-fixtures.ts: chemical edit route
- routes/operations/missions/mission-run-refusal.test.tsx, requests-for-control/request-detail-refusal.test.tsx, worklist-date-chip.test.tsx, worklist-index-header.test.tsx
- routes/public-engagement/service-requests/service-request-detail.test.tsx

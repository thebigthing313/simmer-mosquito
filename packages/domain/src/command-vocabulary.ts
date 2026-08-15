/**
 * Every command SIMMER accepts, as one union of names.
 *
 * Each domain already declares its own — `LarvalSurveillanceCommandType`,
 * `WeatherCommandType`, and seven more — and each is the constraint its command
 * builders are written against: `LarvalDomainCommand<TType extends
 * LarvalSurveillanceCommandType, TPayload>` means a builder cannot return a
 * `type` the vocabulary does not contain. What was missing is a name for all of
 * them at once, so a caller outside a single domain can say "a command" without
 * saying which domain's.
 *
 * ## What this is for
 *
 * A write through a sync collection carries the command it means, and until now
 * that name was a bare `string`. It could not be anything else: `packages/sync`
 * has no dependency on this package and must not acquire one, because a
 * transport that knew the domain vocabulary would be a second place the domain
 * is described. Nothing checked the name before the request left the browser.
 *
 * The frontends do depend on both, so they are where the two meet. A mutation
 * helper generic over its intent type, handed this union by the app, gets a
 * misspelled or invented command as a compile error rather than a 400.
 *
 * This is not authorization and not validation. The server still re-derives the
 * command from the name and refuses one that is wrong, absent, or not permitted
 * for the caller — a union only rules out names that do not exist at all.
 */

import type { AdultSurveillanceCommandType } from './adult-surveillance/shared.js';
import type { ControlOperationsCommandType } from './control-operations/core.js';
import type { FieldWorkCommandType } from './field-work/shared.js';
import type { FoundationCommandType } from './foundation/shared.js';
import type { LarvalSurveillanceCommandType } from './larval-surveillance/shared.js';
import type { MissionDispatchCommandType } from './mission-dispatch/shared.js';
import type { OrganizationSettingsCommandType } from './organization-settings/types-and-defaults.js';
import type { PublicEngagementCommandType } from './public-engagement/core.js';
import type { WeatherCommandType } from './weather/shared.js';

/**
 * The name of any command in the vocabulary.
 *
 * Type-only, and assembled from the nine domain unions rather than restated — a
 * hand-written copy would be a tenth list to keep in step, and the one most
 * likely to be forgotten, since nothing fails when a command is missing from it.
 */
export type DomainCommandType =
	| AdultSurveillanceCommandType
	| ControlOperationsCommandType
	| FieldWorkCommandType
	| FoundationCommandType
	| LarvalSurveillanceCommandType
	| MissionDispatchCommandType
	| OrganizationSettingsCommandType
	| PublicEngagementCommandType
	| WeatherCommandType;

/**
 * The commands that write more than one table.
 *
 * Read off the server handlers rather than reasoned about: every `case` in a
 * command writer was checked for how many tables it writes, and every delete was
 * resolved through `DELETABLE_RECORDS` in `packages/db` to see whether its rules
 * cascade, detach, or merely block. A rule that only blocks writes nothing but
 * its own row; `cascades`, `cascadesSupport` and `detaches` all write elsewhere.
 *
 * ## Why it is worth naming
 *
 * A client applies a command as an optimistic mutation on one collection. When
 * the command writes one table that is the whole truth, and the optimistic row
 * is replaced by the synced one. When it writes several, the collection knows
 * about one of them: deleting a habitat also soft-deletes its comments, tags,
 * route stops and assignment stops and detaches its inspections, and none of
 * that is represented by removing one row from the habitats collection. The
 * write succeeds and the client is left describing it wrongly until every other
 * affected collection happens to re-sync.
 *
 * So these are excluded from the single-collection mutation helper. They need a
 * transaction spanning the collections they touch — the server already commits
 * the batch atomically and returns one txid, so what is missing is only on this
 * side.
 *
 * ## What this does not yet cover
 *
 * The sweep read the 242 commands handled by a `switch` in `apps/server`. Of the
 * 271 names in the vocabulary, 29 are handled another way or not at all:
 * `foundation.deleteAddress` was chased down separately and is included; the
 * global taxonomy writes (`createGenus`, `updateSpecies`, and their siblings)
 * run through `admin-foundations.ts` and were not analysed; and the ten `weather.*`
 * writes appear only in `command-permissions.ts`, so they have no handler to
 * read. Absence from this union is therefore not proof a command writes one
 * table — for those 28 it means nobody has looked.
 */
export type MultiTableCommandType =
	// Writes two tables outright.
	| 'controlOperations.deleteEquipment'
	| 'controlOperations.deleteInsecticideBatch'
	| 'fieldWork.moveAssignmentItems'
	| 'larvalSurveillance.createHabitatFromInspection'
	// Deletes whose record configuration cascades or detaches.
	| 'adultSurveillance.deleteTrap'
	| 'adultSurveillance.setCollectionBycatch'
	| 'controlOperations.deleteBiocontrolAction'
	| 'controlOperations.deleteChemicalApplication'
	| 'controlOperations.deleteOutreachAction'
	| 'controlOperations.deleteRequestedControlAction'
	| 'controlOperations.deleteSourceReduction'
	| 'fieldWork.deleteAssignment'
	| 'fieldWork.deleteRoute'
	| 'foundation.deleteAddress'
	| 'foundation.deleteRegion'
	| 'larvalSurveillance.deleteHabitat'
	| 'larvalSurveillance.deleteInspection'
	| 'larvalSurveillance.deleteInspectionSample'
	| 'missionDispatch.deleteMission'
	| 'publicEngagement.deleteContact'
	| 'publicEngagement.deleteServiceRequest'
	// No handler exists yet, so these two are listed on what the command means
	// rather than on what it does. A merge reassigns the losing records' children
	// before retiring them, which cannot be one table by construction.
	| 'foundation.mergeAddresses'
	| 'larvalSurveillance.mergeHabitats';

/** A command a single-collection mutation can carry safely. */
export type SingleTableCommandType = Exclude<DomainCommandType, MultiTableCommandType>;

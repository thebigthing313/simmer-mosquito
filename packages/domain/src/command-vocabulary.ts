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

// Each domain's barrel rather than the file inside it that declares the union.
// This module is re-exported from the package root, so importing `shared.ts` or
// `core.ts` directly puts those files into the public re-export graph — where the
// helper names they have in common (`basePayload`, `validateBase`, and four more)
// become ambiguous barrel re-exports, and `pnpm fallow dead-code` says so.
import type { AdultSurveillanceCommandType } from './adult-surveillance/index.js';
import type { ControlOperationsCommandType } from './control-operations/index.js';
import type { FieldWorkCommandType } from './field-work/index.js';
import type { FoundationCommandType } from './foundation/index.js';
import type { IdentityCommandType } from './identity/index.js';
import type { LarvalSurveillanceCommandType } from './larval-surveillance/index.js';
import type { MissionDispatchCommandType } from './mission-dispatch/index.js';
import type { OrganizationSettingsCommandType } from './organization-settings/index.js';
import type { PublicEngagementCommandType } from './public-engagement/index.js';
import type { WeatherCommandType } from './weather/index.js';

/**
 * The name of any command in the vocabulary.
 *
 * Type-only, and assembled from the ten domain unions rather than restated. A
 * hand-written copy would be a tenth list to keep in step, and the one most
 * likely to be forgotten, since nothing fails when a command is missing from it.
 */
export type DomainCommandType =
	| AdultSurveillanceCommandType
	| ControlOperationsCommandType
	| FieldWorkCommandType
	| FoundationCommandType
	| IdentityCommandType
	| LarvalSurveillanceCommandType
	| MissionDispatchCommandType
	| OrganizationSettingsCommandType
	| PublicEngagementCommandType
	| WeatherCommandType;

/**
 * The commands a client cannot apply as one row.
 *
 * ## The question this answers, and the one it used to
 *
 * This list was first drawn as "commands that write more than one table", read
 * off the server handlers. That is a true fact about the server and the wrong
 * question for the client, and it made the list three times too long.
 *
 * A client does not mirror the server's writes. It writes what the user must see
 * change at once, and everything else arrives over sync a moment later. Deleting
 * a Habitat is the case that makes the difference plain: the server also
 * soft-deletes the Habitat's Comments and Tags and detaches its Habitat
 * Inspections, so it writes four tables — but the client removes one row from one
 * collection, which is exactly and completely what the user asked for. The
 * Comments were never loaded. The detached Inspection updates when Electric says
 * so. There is nothing for a transaction to hold.
 *
 * So the test is not how many tables the server writes. It is whether the
 * optimistic view is *wrong* without a second row being written here. That is
 * true in three shapes:
 *
 * 1. **Many rows the command names.** A move takes an id list and restacks a
 *    whole list; a merge takes a list of losing rows and retires all of them.
 *    Either way the caller named N rows and expects N to change, and they are
 *    separate keys, so nothing merges them and every one needs writing.
 * 2. **A parent and the children created with it.** Creating a Mission with its
 *    Mission Items, a Chemical Application with its batches, a Notification
 *    Registration with its types — one command, one payload, a parent row and N
 *    child rows that reference it.
 *
 *    These belong here whether or not a given screen lists the children while
 *    they are being created, and the reason is order rather than display: a
 *    child names its parent, so the parent has to land first. Applied as one
 *    transaction the whole group either appears or does not, which is what the
 *    server does with it too. Applied as separate writes it is a parent that
 *    exists briefly with no children, and children that reference a row the
 *    server may yet refuse.
 *
 *    Snapshotting a Route into an Assignment is the same shape read backwards.
 *    The two from-route creates state the children as ids paired with the Route
 *    Items they copy, and the server reads each stop's target out of the Route —
 *    so the payload names N Assignment Items without describing them. The client
 *    can still draw them, because it is looking at the Route it chose, and it has
 *    to: the page these are called from navigates straight to the new worklist,
 *    which is a list of exactly those children.
 *
 *    That is why recording a Chemical Application off a mission stop is here and
 *    the other three mission-stop creates are not. It is the same command shape
 *    as the ordinary create — the batches ride in the payload — and the rule
 *    above does not care that a stop is also being closed. A Source Reduction,
 *    Biocontrol Action or Outreach Action recorded off a stop is one row, and the
 *    stop's completion arrives over sync like any other server-side effect.
 * 3. **A record and the thing that produced it.** The four
 *    `*ForAssignmentItem` commands write the Collection or Habitat Inspection
 *    *and* close the Assignment Item that produced it, and may start the
 *    Assignment (ADR 0012). On a run page the user is looking at both.
 *    `createHabitatFromInspection` is the same shape: it inserts the Habitat and
 *    points the Habitat Inspection at it.
 *
 * A merge is worth being precise about, because it is easy to put here for the
 * wrong reason. It also repoints every record that named a losing row — each
 * Habitat holding a merged Address moves to the surviving `address_id`, and so
 * on through every table with a reference. That half needs no optimism at all:
 * it streams back exactly like the support rows of a cascading delete. What puts
 * a merge in this union is the N rows the caller named, not the fan-out behind
 * them.
 *
 * Everything else — every cascading delete, every `block`, every `detach` — is
 * one row here and a sync round trip for the rest.
 *
 * ## What this does not cover
 *
 * Two sets have no handler to read, so neither was analysed. Absence from this
 * union does not mean either was found to write one row.
 *
 * The ten `weather.*` names appear nowhere in `apps/server` at all — no route,
 * no writer, nothing. They are vocabulary waiting for an endpoint.
 *
 * The global taxonomy names (`createGenus`, `updateSpecies` and their siblings)
 * appear only in `command-permissions.ts`. Their routes under `/admin` call
 * `createGenusWithTxid` and the like directly, with hand-written payload
 * readers, so no route ever builds one of these commands. They are also operator
 * writes rather than agency ones, which is why nothing has needed them yet.
 */
export type MultiRowCommandType =
	// Many rows the command names: a move restacks an id list, a merge retires one.
	| 'fieldWork.moveAssignmentItems'
	| 'fieldWork.moveRouteItems'
	| 'missionDispatch.moveMissionItems'
	// A parent, and the children created with it in one payload.
	| 'controlOperations.recordChemicalApplication'
	| 'missionDispatch.recordChemicalApplicationForMissionItem'
	| 'missionDispatch.createMission'
	| 'publicEngagement.createNotificationRegistration'
	| 'fieldWork.createAssignmentFromRoute'
	| 'fieldWork.selfAssignRoute'
	// A record, and the Assignment Item its work closed.
	| 'fieldWork.collectTrapCollectionForAssignmentItem'
	| 'fieldWork.recordCollectedTrapCollectionForAssignmentItem'
	| 'fieldWork.recordHabitatInspectionForAssignmentItem'
	| 'fieldWork.setTrapCollectionForAssignmentItem'
	// A Habitat, and the Habitat Inspection promoted into it.
	| 'larvalSurveillance.createHabitatFromInspection'
	// `mergeContacts` has a handler; the other two do not, and are listed on what a
	// merge means rather than on what one does.
	| 'foundation.mergeAddresses'
	| 'larvalSurveillance.mergeHabitats'
	| 'publicEngagement.mergeContacts';

/** A command a single-row mutation can carry safely. */
export type SingleRowCommandType = Exclude<DomainCommandType, MultiRowCommandType>;

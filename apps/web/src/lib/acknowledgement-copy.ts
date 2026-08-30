/**
 * What each acknowledgement asks, in the words the user reads.
 *
 * The server refuses a withheld confirmation with
 * `409 acknowledgement_required` and a body of `{ error, message, flag,
 * consequences }`. `flag` is the payload key that answers it and `consequences`
 * are the counts it turns on. This file is the one place that turns a `flag`
 * into a question, and `useAcknowledgedWrite` renders it.
 *
 * ## Keyed by the flag on the wire
 *
 * Not by surface, not by command. A refusal arrives naming its flag and nothing
 * else, so keying on that name makes a missing entry a grep for the name in the
 * response body. It also means two forms that can be refused over the same thing
 * ask the same question, which is right: the fact is the server's, not the
 * page's.
 *
 * ## What is not here
 *
 * The server's `message`. It is written for a developer reading a response body
 * and it names tables. `consequences` carries the numbers, and the sentence
 * around them is written here.
 *
 * Of the 73 flags in `ACKNOWLEDGEMENTS`, 36 can ever reach this file: the ones
 * the server refuses with a count it can put in `consequences`. The 22
 * `stateGuard` flags refuse with an empty list and repeat a condition the form
 * already shows, the 10 `domainBuilder` flags refuse with a 400 naming a field
 * path, and 5 are unread. `apps/server/src/acknowledgements.ts` is the map.
 *
 * ## Adding the fourth surface
 *
 * 1. Find the flags the surface's commands can be refused over, from the
 *    payload type in `packages/domain` and `ACKNOWLEDGEMENT_MECHANISMS`.
 * 2. Add an `ASKABLE` map for the surface below, flag to flag. It is the list of
 *    questions *that page* is allowed to answer, so a refusal naming anything
 *    else is rethrown rather than dressed up as a question the page cannot pose.
 * 3. Add a {@link ACKNOWLEDGEMENT_COPY} entry per flag it does not already have.
 *    The title asks, the body says what agreeing to it does, the button repeats
 *    the verb. Never explain the domain back.
 * 4. Call `useAcknowledgedWrite({ askable, ask: true })` and thread the answers
 *    into the write. `ask: true` is the whole opt-in: without it the flags never
 *    reach the wire and the guard passes silently, which is the trap #319 was
 *    filed about.
 * 5. Write the test that asserts the first attempt sends the flags as `false`.
 *    A surface with no such test proves nothing.
 */

import type { DeleteImpactEntry } from '../hooks/use-delete-impact';
import { impactCountLabel } from '../hooks/use-delete-impact';

/** One question, as it appears on screen. */
export interface AcknowledgementCopy {
	/** The heading, which asks. */
	readonly title: string;
	/** What saying yes does. One sentence. */
	readonly body: string;
	/** The button that says yes, repeating the verb in the title. */
	readonly confirm: string;
}

/**
 * Every flag this app can be refused over, and the question it puts.
 *
 * Alphabetical, so a diff against `ACKNOWLEDGEMENTS` reads straight down. Not
 * exported: {@link acknowledgementCopyFor} is the only way in, because a flag
 * with no entry here has to fall back rather than read `undefined`.
 */
const ACKNOWLEDGEMENT_COPY: Readonly<Record<string, AcknowledgementCopy>> = {
	acknowledgedCompletedItemAdditionalAction: {
		title: 'Record against a closed stop?',
		body: 'This mission stop is already closed. The action is filed against it and the stop stays closed.',
		confirm: 'Record it',
	},
	acknowledgedCompletedItemAdditionalRecord: {
		title: 'Record against a closed stop?',
		body: 'This assignment stop is already closed. The record is filed against it and the stop stays closed.',
		confirm: 'Record it',
	},
	acknowledgedCrossDomainDetach: {
		title: 'Unlink the control work?',
		body: 'The control work recorded here is kept, with its link to this habitat cleared.',
		confirm: 'Delete it',
	},
	acknowledgedHistoricalLocationChange: {
		title: 'Move the station?',
		body: 'Summaries do not store where the station stood, so every reading taken here moves with it.',
		confirm: 'Move it',
	},
	acknowledgedHistoricalStationIdentityChange: {
		title: 'Rename the station?',
		body: 'Summaries do not store what the station was called, so every reading taken here is relabelled.',
		confirm: 'Rename it',
	},
	acknowledgedInspectionDetach: {
		title: 'Unlink the inspections?',
		body: 'The inspections recorded here are kept, with their link to this habitat cleared.',
		confirm: 'Delete it',
	},
	acknowledgedMissionGeometryNotCovered: {
		title: 'Record outside the stop?',
		body: 'The treated area falls outside the ground this stop names.',
		confirm: 'Record it',
	},
	acknowledgedPartialImport: {
		title: 'Import the rest?',
		body: 'Some rows cannot be written. The rest are imported and those are left out.',
		confirm: 'Import',
	},
	acknowledgedRequestedActionMismatch: {
		title: 'Record against a different request?',
		body: 'The action cites a different control request from the one this stop names.',
		confirm: 'Record it',
	},
	acknowledgedSummaryDeletion: {
		title: 'Delete the readings too?',
		body: 'Deleting the station deletes every reading recorded against it.',
		confirm: 'Delete them',
	},
	acknowledgedTargetMismatch: {
		title: 'Record against a different target?',
		body: 'The record names a different target from the one this stop names.',
		confirm: 'Record it',
	},
	acknowledgedUpdates: {
		title: 'Overwrite the readings?',
		body: 'Rows in the file match readings already recorded. Importing replaces them.',
		confirm: 'Import',
	},
};

/**
 * The question for a flag, or one built from the counts when nothing is written.
 *
 * A refusal with no copy is not a dead end. The counts are the server's and they
 * are true whether or not anybody wrote a sentence around them, so the generic
 * question states them and the save goes through on confirm. The gap is logged
 * rather than shown.
 */
export function acknowledgementCopyFor(
	flag: string,
	consequences: readonly DeleteImpactEntry[],
): AcknowledgementCopy {
	const written = ACKNOWLEDGEMENT_COPY[flag];
	if (written !== undefined) {
		return written;
	}
	console.warn(`No acknowledgement copy for ${flag}. Add one in lib/acknowledgement-copy.ts.`);
	return {
		title: 'Save anyway?',
		body:
			consequences.length === 0
				? 'This changes records beyond the one on screen.'
				: `This affects ${consequenceSentence(consequences)}.`,
		confirm: 'Save',
	};
}

/** `4 inspections`, `4 inspections and 2 samples`, `4 inspections, 2 samples and 1 route stop`. */
function consequenceSentence(consequences: readonly DeleteImpactEntry[]): string {
	const labels = consequences.map(impactCountLabel);
	if (labels.length <= 1) {
		return labels[0] ?? '';
	}
	return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

// ===========================================================================
// Which questions each surface may be asked
// ===========================================================================

/**
 * The refusals a technician recording work against a stop is allowed to answer.
 *
 * Recording work has preconditions that are questions rather than rules: the
 * stop is already closed, the record names a different target of the same kind,
 * the action cites a different control request, the action does not cover the
 * ground the stop names. Each is usually a mistake and occasionally the truth,
 * so the server refuses once and accepts the same write again with the matching
 * flag set.
 *
 * "Already closed" appears twice because the two sides take different flags: the
 * same question about an assignment stop and a mission stop, since a place
 * treated twice in a day is as ordinary as a habitat inspected twice.
 *
 * A wrong *type* of record, or a mission whose control type does not match, is
 * absent on purpose: those are always bugs and the server never takes a flag for
 * them (`docs/field-work-support-domain.md`, `docs/mission-dispatch-domain.md`).
 *
 * The two assignment refusals now arrive as `acknowledgement_required` naming
 * their own flag (#336), so their codes are no longer what identifies them. They
 * stay because the map is also the list of questions this surface may be asked.
 * The mission three are #316's, and the codes go once they follow.
 */
export const STOP_ACKNOWLEDGEABLE_REFUSALS = {
	assignment_item_already_completed: 'acknowledgedCompletedItemAdditionalRecord',
	assignment_item_target_mismatch: 'acknowledgedTargetMismatch',
	mission_item_already_completed: 'acknowledgedCompletedItemAdditionalAction',
	mission_item_requested_action_mismatch: 'acknowledgedRequestedActionMismatch',
	mission_geometry_not_covered: 'acknowledgedMissionGeometryNotCovered',
} as const satisfies Readonly<Record<string, string>>;

/**
 * The two a weather station's edit page may be asked.
 *
 * Both turn on the same fact, the station already has summaries, which the
 * client cannot know without loading them and the server has in front of it
 * anyway. So neither is a checkbox on the form: the write goes out with both
 * withheld, and a station with no readings never raises a question at all.
 *
 * Key and value are the same word because both arrive on the settled
 * `acknowledgement_required` body, which names the flag itself rather than a
 * refusal code of its own (#315, #317).
 */
export const STATION_REFUSALS = {
	acknowledgedHistoricalStationIdentityChange: 'acknowledgedHistoricalStationIdentityChange',
	acknowledgedHistoricalLocationChange: 'acknowledgedHistoricalLocationChange',
} as const satisfies Readonly<Record<string, string>>;

/**
 * The delete's own refusal, kept apart from the edit's two.
 *
 * One map for all three would offer the answer that destroys a station's
 * readings on a page that is only renaming it.
 */
export const STATION_DELETE_REFUSALS = {
	acknowledgedSummaryDeletion: 'acknowledgedSummaryDeletion',
} as const satisfies Readonly<Record<string, string>>;

/**
 * The refusals the weather import can answer, which are about a file rather
 * than a station.
 *
 * Kept apart from the station maps so a dialog about overwriting spreadsheet
 * rows cannot offer to delete a station's summaries.
 */
export const IMPORT_REFUSALS = {
	weather_import_updates_unacknowledged: 'acknowledgedUpdates',
	weather_import_partial_unacknowledged: 'acknowledgedPartialImport',
} as const satisfies Readonly<Record<string, string>>;

/**
 * The two a habitat delete may be asked, from the delete registry.
 *
 * A habitat's comments, tags, route stops and assignment stops go with it and
 * take no flag. Its inspections and the control work recorded against it are
 * kept and unlinked, and those are the two the registry asks about.
 */
export const HABITAT_DELETE_REFUSALS = {
	acknowledgedInspectionDetach: 'acknowledgedInspectionDetach',
	acknowledgedCrossDomainDetach: 'acknowledgedCrossDomainDetach',
} as const satisfies Readonly<Record<string, string>>;

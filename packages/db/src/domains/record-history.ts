/**
 * The confirmations that ride on rows that already read under the old value.
 *
 * Twenty-one flags in the command vocabulary say some version of "records
 * already read under this label". None of the schema snapshots a label onto the
 * rows that use it — a collection stores `collection_method_id`, not the name
 * the method had that morning — so renaming a catalog row, repointing a service
 * request's contact, or moving a weather station rewrites how every row that
 * cites it reads, retroactively. That is the question these flags ask, and
 * until this module nothing asked it.
 *
 * ## Why this is not the clearance check
 *
 * `assertClearanceAcknowledged` counts rows a write is about to remove. These
 * rows are not going anywhere; they will read differently. The counting and the
 * entry shape are the same, and the refusal reaches the client as the same
 * `acknowledgement_required` body, but the sentence is the opposite one, so
 * sharing the clearance's error class would tell an organization its history
 * was being deleted when it was being relabelled.
 *
 * ## Where the citing tables come from
 *
 * `citingRules` in `record-deletion.ts`, which reads them out of the delete
 * registry. A rename and a delete ask about the same tables, and the registry
 * already names them, so this module holds no table map of its own. The two
 * subjects the registry cannot reach — weather stations, which are deliberately
 * not a `DeletableRecordType`, and the global taxonomy, which has no
 * `organization_id` — pass their own `CitingRule`, which is why the rule
 * carries a whole `where` clause rather than a scope this module assembles.
 *
 * ## No time bound
 *
 * Any citing row at all. A bound would be a second policy with a number in it
 * that nobody can defend, and it would have to be explained on every screen
 * that hits it. The false alarm it avoids is cheap — the refusal says "1
 * collection was recorded under this name" and the reader confirms — and the
 * failure in the other direction is a rename with four hundred inspections
 * behind it going through unasked because the interval was set wrong.
 */

import type { DbExecutor } from '../index.js';
import {
	type CitingRule,
	countPhrase,
	countRuleMatches,
	type DeleteImpactEntry,
} from './record-deletion.js';

/**
 * The acknowledgements that turn on rows already citing the record.
 *
 * Every name is a flag the matching command already declares, so the check and
 * the command vocabulary use one spelling.
 */
export type HistoryAcknowledgement =
	| 'acknowledgedActiveSubscriptionImpact'
	| 'acknowledgedFutureOnlyChange'
	| 'acknowledgedHistoricalBatchLabelChange'
	| 'acknowledgedHistoricalContactChange'
	| 'acknowledgedHistoricalEquipmentLabelChange'
	| 'acknowledgedHistoricalLabelChange'
	| 'acknowledgedHistoricalLocationChange'
	| 'acknowledgedHistoricalProductChange'
	| 'acknowledgedHistoricalStationIdentityChange'
	| 'acknowledgedHistoricalVehicleLabelChange'
	| 'acknowledgedTaxonomyLabelChange'
	| 'acknowledgedTaxonomyMeaningChange';

/**
 * Thrown by `assertHistoryAcknowledged` when rows cite the record and the
 * confirmation was withheld.
 *
 * Carries the same `consequences` entries a delete or a clearance refusal does,
 * so the client renders one list whatever refused it. Nothing has been written
 * when this is thrown.
 */
export class HistoryAcknowledgementRequiredError extends Error {
	readonly acknowledgement: HistoryAcknowledgement;
	readonly consequences: readonly DeleteImpactEntry[];

	constructor(
		acknowledgement: HistoryAcknowledgement,
		consequences: readonly DeleteImpactEntry[],
		message: string,
	) {
		super(message);
		this.name = 'HistoryAcknowledgementRequiredError';
		this.acknowledgement = acknowledgement;
		this.consequences = consequences;
	}
}

/**
 * Thrown by `assertNoColliding` when the write would produce a second record
 * carrying a value the organization already uses, and the confirmation was
 * withheld.
 *
 * A collision is not a citation: the rows it counts do not read under the value
 * being written, they compete with it. Same body on the wire, separate class,
 * because a caller that reached for the wrong one would tell the organization
 * its history was being rewritten by a duplicate trap code.
 */
export class CollisionAcknowledgementRequiredError extends Error {
	readonly acknowledgement: 'acknowledgedDuplicateTrapCode';
	readonly consequences: readonly DeleteImpactEntry[];

	constructor(consequences: readonly DeleteImpactEntry[], message: string) {
		super(message);
		this.name = 'CollisionAcknowledgementRequiredError';
		this.acknowledgement = 'acknowledgedDuplicateTrapCode';
		this.consequences = consequences;
	}
}

/**
 * Refuse a write that rewrites how existing rows read, when its confirmation
 * was withheld.
 *
 * Call it before the write, inside the same transaction. **No citing rows means
 * no question**, whatever the flag says: a collection method renamed the
 * afternoon it was created, with nothing recorded against it, is a rename
 * nobody can misread, and asking there would ask about nothing.
 *
 * `subject` completes "already read under this ___" and is the domain noun for
 * the record being changed, not the table. `message` replaces the sentence
 * outright, for the taxonomy, whose rows belong to every organization and need
 * to say so.
 *
 * @throws HistoryAcknowledgementRequiredError when rows cited the record and
 * `acknowledged` was not true.
 */
export async function assertHistoryAcknowledged(
	db: DbExecutor,
	input: {
		readonly acknowledgement: HistoryAcknowledgement;
		readonly rules: readonly CitingRule[];
		/** What the command carried. Anything but `true` is withheld. */
		readonly acknowledged: boolean;
		/** Completes "already read under this ___". */
		readonly subject: string;
		/** The whole sentence, when the default one reads wrong. */
		readonly message?: string;
	},
): Promise<void> {
	if (input.acknowledged === true) {
		return;
	}

	const consequences = await countRuleMatches(db, input.rules);
	if (consequences.length === 0) {
		return;
	}

	throw new HistoryAcknowledgementRequiredError(
		input.acknowledgement,
		consequences,
		input.message ?? `${countPhrase(consequences)} already read under this ${input.subject}.`,
	);
}

/**
 * Refuse a write whose value already belongs to another of the organization's
 * records, when its confirmation was withheld.
 *
 * Only `acknowledgedDuplicateTrapCode` uses it. Trap codes are indexed but not
 * unique — two traps may legitimately share one, which is why the vocabulary
 * has a confirmation here rather than a rule — so the collision is a question
 * and the count is what makes it answerable.
 *
 * Unlike the history check, this one refuses unless the flag is `true`. The
 * domain builder defaults it to `false` and every door already reads it that
 * way, so a collision cannot arrive pre-answered by an absent key.
 *
 * @throws CollisionAcknowledgementRequiredError
 */
export async function assertNoColliding(
	db: DbExecutor,
	input: {
		readonly rule: CitingRule;
		/** What the command carried. Only `true` confirms. */
		readonly acknowledged: boolean;
		/** The whole sentence. The count travels in `consequences`. */
		readonly message: string;
	},
): Promise<void> {
	if (input.acknowledged === true) {
		return;
	}

	const consequences = await countRuleMatches(db, [input.rule]);
	if (consequences.length === 0) {
		return;
	}

	throw new CollisionAcknowledgementRequiredError(consequences, input.message);
}

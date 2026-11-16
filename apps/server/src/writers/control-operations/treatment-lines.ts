/**
 * A Treatment's line set, written as a diff (ADR 0020).
 *
 * Create and `reviseTreatmentLines` both carry the full list of Chemical
 * Applications the Treatment should have, each with its batch links, and this
 * module makes the stored rows match it: an id not yet stored inserts a line, a
 * stored id whose product, amount, unit or batches changed updates it, and a
 * stored live line left out of the list is soft-deleted with its batch links.
 * Create is the same diff against an empty set.
 *
 * Everything that can refuse runs before the first write, so a refused revise
 * has changed nothing. `docs/treatment-spec.md`, "Lines are a set", is the
 * rule this follows.
 */

import {
	assertWriteReferences,
	type CatalogReference,
	checkedValues,
	sql,
} from '@simmer-mosquito/db';
import {
	DomainValidationError,
	type DomainValidationIssue,
	type TreatmentApplicationRow,
} from '@simmer-mosquito/domain';
import type { ControlOperationsTransaction } from './shared.js';

export interface TreatmentLineSetInput {
	readonly treatmentId: string;
	readonly organizationId: string;
	readonly actorProfileId: string;
	/** Every line the Treatment should have afterwards, in the order the client sent. */
	readonly lines: readonly TreatmentApplicationRow[];
}

interface StoredLine {
	readonly id: string;
	readonly treatment_id: string;
	readonly organization_id: string;
	readonly insecticide_id: string;
	readonly amount_applied: number;
	readonly application_unit_id: string;
	readonly deleted_at: Date | null;
}

interface StoredLink {
	readonly id: string;
	readonly application_id: string;
	readonly organization_id: string;
	readonly insecticide_batch_id: string;
	readonly deleted_at: Date | null;
}

/** A batch link the write adds, or keeps on a line whose Insecticide changed. */
interface CheckedLink {
	readonly path: string;
	readonly lineInsecticideId: string;
	readonly insecticideBatchId: string;
}

const LINE_SET_INVALID = "The treatment's chemical applications are invalid.";

/**
 * Make the stored lines of one Treatment match `lines`.
 *
 * Returns whether the write changed what the recipe check compares: the set of
 * live lines, or a live line's Insecticide, amount or unit. A revise that only
 * adds or removes batch links answers false, which is what lets a batch-only
 * edit through on a Treatment whose Formulation was edited after it was saved.
 *
 * @throws DomainValidationError naming the line, as `applications.N.…`, when a
 * line or link id belongs elsewhere or was removed, when the final set breaks
 * the one-line-per-Insecticide rule, or when a batch does not match its line.
 * @throws ReferenceRefusedError when a new or changed reference names an
 * inactive or missing catalog row.
 */
export async function writeTreatmentLines(
	trx: ControlOperationsTransaction,
	input: TreatmentLineSetInput,
): Promise<boolean> {
	const { treatmentId, organizationId, lines } = input;
	const issues: DomainValidationIssue[] = [];

	assertFinalSet(lines, issues);
	throwIfAny(issues);

	const storedLines = await readStoredLines(trx, input);
	const live = storedLines.filter(
		(line) =>
			line.treatment_id === treatmentId &&
			line.organization_id === organizationId &&
			line.deleted_at === null,
	);
	const liveById = new Map(live.map((line) => [line.id, line]));
	const storedById = new Map(storedLines.map((line) => [line.id, line]));

	lines.forEach((line, index) => {
		const stored = storedById.get(line.id);
		if (stored === undefined || liveById.has(line.id)) {
			return;
		}
		issues.push({
			path: `applications.${index}.id`,
			message:
				stored.treatment_id === treatmentId && stored.organization_id === organizationId
					? 'This chemical application was removed from the treatment and cannot be restored. Add the product as a new line.'
					: 'This chemical application belongs to another treatment.',
		});
	});
	throwIfAny(issues);

	const kept = lines.filter((line) => liveById.has(line.id));
	const added = lines.filter((line) => !liveById.has(line.id));
	const keptIds = new Set(kept.map((line) => line.id));
	const removed = live.filter((line) => !keptIds.has(line.id));
	const changed = kept.filter((line) => {
		const stored = liveById.get(line.id);
		return (
			stored !== undefined &&
			(stored.insecticide_id !== line.insecticide_id ||
				stored.amount_applied !== line.amount_applied ||
				stored.application_unit_id !== line.application_unit_id)
		);
	});
	const insecticideMoved = new Set(
		changed
			.filter((line) => liveById.get(line.id)?.insecticide_id !== line.insecticide_id)
			.map((line) => line.id),
	);

	// Links: which to keep, which to add, and which the write leaves behind.
	const storedLinks = await readStoredLinks(trx, input, live);
	const storedLinkById = new Map(storedLinks.map((link) => [link.id, link]));
	const keptLinkIds = new Set<string>();
	const addedLinks: { readonly lineId: string; readonly id: string; readonly batchId: string }[] =
		[];
	const checkedLinks: CheckedLink[] = [];

	lines.forEach((line, index) => {
		line.application_batches.forEach((link, linkIndex) => {
			const path = `applications.${index}.application_batches.${linkIndex}`;
			const stored = storedLinkById.get(link.id);
			if (stored === undefined) {
				addedLinks.push({ lineId: line.id, id: link.id, batchId: link.insecticide_batch_id });
				checkedLinks.push({
					path,
					lineInsecticideId: line.insecticide_id,
					insecticideBatchId: link.insecticide_batch_id,
				});
				return;
			}
			const refusal = storedLinkRefusal(stored, line.id, link.insecticide_batch_id, organizationId);
			if (refusal !== null) {
				issues.push({ path: `${path}.id`, message: refusal });
				return;
			}
			keptLinkIds.add(link.id);
			if (insecticideMoved.has(line.id)) {
				checkedLinks.push({
					path,
					lineInsecticideId: line.insecticide_id,
					insecticideBatchId: link.insecticide_batch_id,
				});
			}
		});
	});
	throwIfAny(issues);

	// Catalog lifecycle (#123): only a reference the write changes is gated, so a
	// kept line whose Insecticide has since been retired still saves.
	await assertWriteReferences(trx, {
		organizationId,
		write: { kind: 'create' },
		references: [
			...[...added, ...changed]
				.filter((line) => !keptIds.has(line.id) || insecticideMoved.has(line.id))
				.map(
					(line): CatalogReference => ({
						column: 'insecticide_id',
						catalog: 'insecticide',
						id: line.insecticide_id,
						label: 'insecticide',
					}),
				),
			...addedLinks.map(
				(link): CatalogReference => ({
					column: 'insecticide_batch_id',
					catalog: 'insecticideBatch',
					id: link.batchId,
					label: 'batch',
				}),
			),
		],
	});
	await assertBatchesMatchLines(trx, organizationId, checkedLinks);

	const droppedLinkIds = storedLinks
		.filter(
			(link) =>
				link.deleted_at === null &&
				link.organization_id === organizationId &&
				liveById.has(link.application_id) &&
				!keptLinkIds.has(link.id),
		)
		.map((link) => link.id);

	await softDeleteRows(trx, 'application_batches', droppedLinkIds, input);
	await softDeleteRows(
		trx,
		'applications',
		removed.map((line) => line.id),
		input,
	);
	for (const line of changed) {
		await trx
			.updateTable('applications')
			.set({
				insecticide_id: line.insecticide_id,
				amount_applied: line.amount_applied,
				application_unit_id: line.application_unit_id,
				updated_by_profile_id: input.actorProfileId,
				updated_at: sql`now()`,
			})
			.where('id', '=', line.id)
			.where('organization_id', '=', organizationId)
			.where('deleted_at', 'is', null)
			.execute();
	}
	for (const line of added) {
		await trx
			.insertInto('applications')
			.values(
				await checkedValues(trx, organizationId, {
					id: line.id,
					organization_id: organizationId,
					treatment_id: treatmentId,
					insecticide_id: line.insecticide_id,
					amount_applied: line.amount_applied,
					application_unit_id: line.application_unit_id,
					created_by_profile_id: input.actorProfileId,
					updated_by_profile_id: input.actorProfileId,
				}),
			)
			.execute();
	}
	for (const link of addedLinks) {
		await trx
			.insertInto('application_batches')
			.values(
				await checkedValues(trx, organizationId, {
					id: link.id,
					organization_id: organizationId,
					application_id: link.lineId,
					insecticide_batch_id: link.batchId,
					created_by_profile_id: input.actorProfileId,
					updated_by_profile_id: input.actorProfileId,
				}),
			)
			.execute();
	}

	return added.length > 0 || removed.length > 0 || changed.length > 0;
}

/**
 * The rules that hold of the final set alone.
 *
 * The domain builder refuses both before a command exists; they are checked
 * again here because the rule is the server's to hold, and the partial unique
 * index behind the second one turns a race into a constraint error rather than
 * a refusal a person can read.
 */
function assertFinalSet(
	lines: readonly TreatmentApplicationRow[],
	issues: DomainValidationIssue[],
): void {
	if (lines.length === 0) {
		issues.push({
			path: 'applications',
			message: 'A treatment needs at least one chemical application.',
		});
		return;
	}
	const lineByInsecticide = new Map<string, number>();
	lines.forEach((line, index) => {
		const first = lineByInsecticide.get(line.insecticide_id);
		if (first === undefined) {
			lineByInsecticide.set(line.insecticide_id, index);
			return;
		}
		issues.push({
			path: `applications.${index}.insecticide_id`,
			message: `This insecticide is already on line ${first + 1}. A treatment holds one chemical application per insecticide, so put these batches on that line.`,
		});
	});
}

function storedLinkRefusal(
	stored: StoredLink,
	lineId: string,
	insecticideBatchId: string,
	organizationId: string,
): string | null {
	if (stored.application_id !== lineId || stored.organization_id !== organizationId) {
		return 'This batch link belongs to another chemical application.';
	}
	if (stored.deleted_at !== null) {
		return 'This batch link was removed and cannot be restored. Link the batch again under a new id.';
	}
	if (stored.insecticide_batch_id !== insecticideBatchId) {
		return "A batch link's batch cannot change. Remove the link and add the batch again.";
	}
	return null;
}

/**
 * The payload's line ids wherever they are stored, and this Treatment's live
 * lines.
 *
 * The payload's ids are read without the organization filter, so an id held by
 * another Treatment is refused by name rather than failing on the primary key.
 * The refusal reads the same whether that Treatment is this organization's or
 * another's.
 */
async function readStoredLines(
	trx: ControlOperationsTransaction,
	input: TreatmentLineSetInput,
): Promise<readonly StoredLine[]> {
	const ids = input.lines.map((line) => line.id);
	return trx
		.selectFrom('applications')
		.select([
			'id',
			'treatment_id',
			'organization_id',
			'insecticide_id',
			'amount_applied',
			'application_unit_id',
			'deleted_at',
		])
		.where((eb) =>
			eb.or([
				eb('id', 'in', ids),
				eb.and([
					eb('treatment_id', '=', input.treatmentId),
					eb('organization_id', '=', input.organizationId),
					eb('deleted_at', 'is', null),
				]),
			]),
		)
		.execute();
}

/** The payload's link ids wherever they are stored, and the live links of the live lines. */
async function readStoredLinks(
	trx: ControlOperationsTransaction,
	input: TreatmentLineSetInput,
	live: readonly StoredLine[],
): Promise<readonly StoredLink[]> {
	const linkIds = input.lines.flatMap((line) => line.application_batches.map((link) => link.id));
	const liveIds = live.map((line) => line.id);
	if (linkIds.length === 0 && liveIds.length === 0) {
		return [];
	}
	return trx
		.selectFrom('application_batches')
		.select(['id', 'application_id', 'organization_id', 'insecticide_batch_id', 'deleted_at'])
		.where((eb) => {
			const arms = [];
			if (linkIds.length > 0) {
				arms.push(eb('id', 'in', linkIds));
			}
			if (liveIds.length > 0) {
				arms.push(
					eb.and([
						eb('application_id', 'in', liveIds),
						eb('organization_id', '=', input.organizationId),
						eb('deleted_at', 'is', null),
					]),
				);
			}
			return eb.or(arms);
		})
		.execute();
}

/**
 * Refuse a batch that is not a batch of its line's Insecticide.
 *
 * New on the server with Treatments: the old batch insert ran only the catalog
 * gate, so a link to a batch of some other product went through. Read after the
 * gate, which has already refused a missing or retired batch the write adds.
 */
async function assertBatchesMatchLines(
	trx: ControlOperationsTransaction,
	organizationId: string,
	links: readonly CheckedLink[],
): Promise<void> {
	if (links.length === 0) {
		return;
	}
	const batches = await trx
		.selectFrom('insecticide_batches')
		.select(['id', 'insecticide_id'])
		.where(
			'id',
			'in',
			links.map((link) => link.insecticideBatchId),
		)
		.where('organization_id', '=', organizationId)
		.execute();
	const insecticideByBatch = new Map(batches.map((batch) => [batch.id, batch.insecticide_id]));
	const issues: DomainValidationIssue[] = links
		.filter((link) => {
			const insecticideId = insecticideByBatch.get(link.insecticideBatchId);
			return insecticideId !== undefined && insecticideId !== link.lineInsecticideId;
		})
		.map((link) => ({
			path: `${link.path}.insecticide_batch_id`,
			message: "This batch is not a batch of the line's insecticide.",
		}));
	throwIfAny(issues);
}

async function softDeleteRows(
	trx: ControlOperationsTransaction,
	table: 'applications' | 'application_batches',
	ids: readonly string[],
	input: TreatmentLineSetInput,
): Promise<void> {
	if (ids.length === 0) {
		return;
	}
	await trx
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', 'in', ids)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.execute();
}

function throwIfAny(issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(LINE_SET_INVALID, issues);
	}
}

import type { SingleRowCommandType } from '@simmer-mosquito/domain';
import type { MergeFieldUpdates } from '../../hooks/mutations/use-record-merge';
import type { DuplicateRecord, MergeableRecordType } from '../../hooks/use-merge-candidates';

/**
 * The record a merge leaves behind, built out of the records going into it.
 *
 * A merge re-points every reference onto the survivor and retires the rest, and
 * it does not touch the survivor's own columns. So a phone number only the
 * retired row holds is gone: no error, no warning, the number simply not in the
 * agency's records any more. Two rows for one person is usually two halves of
 * one person, which is why they were entered twice in the first place.
 *
 * This module decides nothing on its own. It gathers what every record in the
 * set says, proposes a starting value for each field, and turns whatever the
 * user settles on into columns to send. The merge itself is unchanged.
 *
 * ## The proposal never overwrites and never drops
 *
 * The starting value for a field is the survivor's own, and where the survivor
 * has none it is the first retired record that has one. As one rule: a merge
 * proposes nothing that would replace an answer the survivor already gives, and
 * nothing that would lose an answer only a retired record gives.
 *
 * That is a default rather than a decision. Every field is editable and every
 * value any of the records holds is offered beside it, because the rule is a
 * guess about which row is more current and the person merging usually knows.
 *
 * ## Values move between fields, not only between records
 *
 * Two rows for one person routinely hold two real phone numbers, and the merge
 * that keeps both is the one that puts the second in `alternate_phone`. So a
 * field's suggestions come from a *pool* rather than from its own column: every
 * phone column offers every phone number in the set.
 *
 * A pooled value is never proposed on its own. Deciding that a retired record's
 * preferred number is this person's alternate is a claim about the person, and
 * nothing in the data supports it. The starting value only ever comes from the
 * field's own column.
 *
 * ## The values ride with the merge
 *
 * One request, so they commit in one transaction. A merge that succeeded while
 * the values it was meant to carry failed separately would leave the survivor
 * without the number the user had just chosen to keep, the source already
 * retired, and nothing to recover it from.
 *
 * The write surface is one command per kind of change rather than one per table,
 * so which command carries a column is part of the mapping. On a contact a name
 * and a job title are `updateContactDetails` while an email and a phone number
 * are `updateContactCommunication`, because the second carries consent.
 */
export interface MergeField {
	/** The Postgres column, which is what the command endpoint reads. */
	readonly column: string;
	readonly label: string;
	/** The command that writes this column on this record's table. */
	readonly intent: SingleRowCommandType;
	/**
	 * A column the record cannot be without, so it cannot be saved empty.
	 *
	 * The domain builder rejects an empty one, so the dialog holds the merge
	 * rather than sending a write the server has to refuse.
	 */
	readonly required?: boolean;
	/**
	 * The column the record is named by, which a row shows as its own title.
	 *
	 * Marked here rather than worked out from the label, because the column is a
	 * different one on each record type and nothing else about it says so. A
	 * summary that opened by repeating the name would spend its first line saying
	 * what the line above it says.
	 */
	readonly isRecordName?: boolean;
	/**
	 * Fields whose values are interchangeable, so each offers the others'.
	 *
	 * Named on the field rather than inferred, because interchangeable is a domain
	 * claim: two phone numbers can swap places and a locality and a region cannot,
	 * however alike the columns look.
	 */
	readonly pool?: string;
}

/**
 * The columns each merge can carry, in the order they are shown.
 *
 * Every column here is one `readDuplicateCandidates` returns and one an intent
 * on the same table accepts. Consent columns are absent on purpose: false is an
 * answer rather than a blank, so "fill in the empty one" would raise a flag
 * nobody gave.
 */
const MERGE_FIELDS: Record<MergeableRecordType, readonly MergeField[]> = {
	address: [
		{
			column: 'display_name',
			label: 'Name',
			intent: 'foundation.updateAddressDetails',
			required: true,
			isRecordName: true,
		},
		{
			column: 'address_line_1',
			label: 'Address line 1',
			intent: 'foundation.updateAddressDetails',
			pool: 'street',
		},
		{
			column: 'address_line_2',
			label: 'Address line 2',
			intent: 'foundation.updateAddressDetails',
			pool: 'street',
		},
		{ column: 'locality', label: 'Locality', intent: 'foundation.updateAddressDetails' },
		{ column: 'region', label: 'Region', intent: 'foundation.updateAddressDetails' },
		{ column: 'postal_code', label: 'Postal code', intent: 'foundation.updateAddressDetails' },
	],
	habitat: [
		{
			column: 'habitat_name',
			label: 'Name',
			intent: 'larvalSurveillance.updateHabitatDetails',
			isRecordName: true,
		},
		{
			column: 'description',
			label: 'Description',
			intent: 'larvalSurveillance.updateHabitatDetails',
			required: true,
		},
	],
	contact: [
		{
			column: 'contact_name',
			label: 'Name',
			intent: 'publicEngagement.updateContactDetails',
			isRecordName: true,
		},
		{ column: 'company', label: 'Company', intent: 'publicEngagement.updateContactDetails' },
		{ column: 'department', label: 'Department', intent: 'publicEngagement.updateContactDetails' },
		{ column: 'title', label: 'Title', intent: 'publicEngagement.updateContactDetails' },
		{ column: 'email', label: 'Email', intent: 'publicEngagement.updateContactCommunication' },
		{
			column: 'preferred_phone',
			label: 'Preferred phone',
			intent: 'publicEngagement.updateContactCommunication',
			pool: 'phone',
		},
		{
			column: 'alternate_phone',
			label: 'Alternate phone',
			intent: 'publicEngagement.updateContactCommunication',
			pool: 'phone',
		},
	],
};

/** One column of one record, ready to read: the register's label and the value. */
export interface MergeFieldValue {
	readonly column: string;
	readonly label: string;
	readonly value: string;
}

/**
 * What one record says, in the columns a merge can carry.
 *
 * A cleanup row reads this so its columns, their order and their labels are the
 * register's rather than a second list beside it. Add a column to a merge and it
 * appears on the row the merge is judged from, with no second edit.
 *
 * The row is where the judgement happens. A row that showed a name and a joined
 * line made "are these the same person" a question you answered by opening both
 * records in new tabs, which is the page you were reading, gone.
 *
 * Two things are left out. The name, because it is the row's title, and a fact
 * list that opened by repeating it would push the columns that decide the answer
 * down a line. And a column the record leaves empty, because a blank is not an
 * answer and a labelled blank reads like one.
 */
export function mergeFieldSummary(
	recordType: MergeableRecordType,
	record: DuplicateRecord,
): readonly MergeFieldValue[] {
	return MERGE_FIELDS[recordType].flatMap((field) => {
		const value = fieldValue(record, field.column);
		return field.isRecordName === true || value === null
			? []
			: [{ column: field.column, label: field.label, value }];
	});
}

/** One value a field offers, and where in the set it comes from. */
export interface MergeSuggestion {
	readonly value: string;
	/** Every record that holds it, so the chip can name where it comes from. */
	readonly recordIds: readonly string[];
	/**
	 * The column it sits in today.
	 *
	 * Differs from the field's own column only for a pooled suggestion, which is
	 * the case worth labelling: a number offered to `alternate_phone` that is
	 * somebody's preferred number is a different proposition from one that is
	 * already an alternate.
	 */
	readonly fromColumn: string;
}

/** One field of the surviving record, with everything the set can fill it from. */
export interface MergeFieldRow {
	readonly field: MergeField;
	readonly suggestions: readonly MergeSuggestion[];
	/** The survivor's own value, so the UI can mark which suggestion that is. */
	readonly targetValue: string | null;
	/** What the field starts at. Always from the field's own column. */
	readonly defaultValue: string | null;
	/**
	 * Whether this field is one the merge would otherwise decide silently.
	 *
	 * True when the records disagree in this column, or when a retired record
	 * fills it and the survivor does not. Those are the fields shown up front; the
	 * rest are there to edit but are not asking anything.
	 */
	readonly needsDecision: boolean;
}

/** Every field of the surviving record, in the order they are shown. */
export function mergeFieldRows(
	recordType: MergeableRecordType,
	target: DuplicateRecord,
	sources: readonly DuplicateRecord[],
): readonly MergeFieldRow[] {
	const records = [target, ...sources];
	return MERGE_FIELDS[recordType].map((field) => {
		const own = valuesIn(records, [field.column]);
		const targetValue = fieldValue(target, field.column);
		return {
			field,
			suggestions: valuesIn(records, pooledColumns(recordType, field)),
			targetValue,
			// Own column only. A retired record's preferred number is not evidence
			// that it is this person's alternate, so a pooled value is offered and
			// never proposed.
			defaultValue: targetValue ?? own[0]?.value ?? null,
			needsDecision: own.length > 1 || (targetValue === null && own.length === 1),
		};
	});
}

/** Which columns feed a field's suggestions: its own, then the rest of its pool. */
function pooledColumns(recordType: MergeableRecordType, field: MergeField): readonly string[] {
	if (field.pool === undefined) {
		return [field.column];
	}
	const rest = MERGE_FIELDS[recordType]
		.filter((other) => other.pool === field.pool && other.column !== field.column)
		.map((other) => other.column);
	// Its own column first, so its own values lead the suggestions.
	return [field.column, ...rest];
}

/**
 * Every distinct value these records hold across these columns, survivor first.
 *
 * The order is the rule rather than a presentation detail: the first value is
 * what gets proposed, so reversing the records would quietly make every merge
 * offer a retired record's answer over the survivor's own.
 *
 * Records saying the same thing collapse into one entry carrying both ids,
 * because "three records say 555-0100 and one says 555-0199" is one decision
 * with two sides rather than four rows to read.
 */
function valuesIn(
	records: readonly DuplicateRecord[],
	columns: readonly string[],
): readonly MergeSuggestion[] {
	const byValue = new Map<string, { recordIds: string[]; fromColumn: string }>();
	for (const column of columns) {
		for (const record of records) {
			const value = fieldValue(record, column);
			if (value === null) {
				continue;
			}
			const existing = byValue.get(value);
			if (existing === undefined) {
				byValue.set(value, { recordIds: [record.id], fromColumn: column });
			} else if (!existing.recordIds.includes(record.id)) {
				existing.recordIds.push(record.id);
			}
		}
	}
	return [...byValue].map(([value, entry]) => ({ value, ...entry }));
}

/** A record's value for a column, with a missing key read the same as a blank. */
function fieldValue(record: DuplicateRecord, column: string): string | null {
	return normalize(record.fields[column]);
}

/** Blank in every spelling is null: absent, null, empty, or only spaces. */
function normalize(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? '';
	return trimmed === '' ? null : trimmed;
}

/**
 * What the chosen values mean as a write, which is often nothing.
 *
 * Only columns whose chosen value differs from what the survivor already holds
 * are sent. A field left alone usually still holds the survivor's own value, and
 * the domain builder refuses a command with nothing to change, so sending the
 * whole set would turn every merge the user did not edit into a 400.
 */
export function mergeFieldUpdates(
	recordType: MergeableRecordType,
	target: DuplicateRecord,
	selections: Readonly<Record<string, string | null>>,
): MergeFieldUpdates {
	const values: Record<string, string | null> = {};
	const intents: SingleRowCommandType[] = [];

	for (const field of MERGE_FIELDS[recordType]) {
		if (!Object.hasOwn(selections, field.column)) {
			continue;
		}
		const chosen = normalize(selections[field.column]);
		if (chosen === fieldValue(target, field.column)) {
			continue;
		}
		values[field.column] = chosen;
		if (!intents.includes(field.intent)) {
			intents.push(field.intent);
		}
	}

	return { intents, values };
}

/**
 * The fields that cannot be saved as they stand, by label.
 *
 * Only emptiness, and only for the columns the domain requires. Everything else
 * is checked on the server: this exists so the dialog does not send a write it
 * already knows will be refused, not to restate the domain's rules in a second
 * place where they can drift.
 */
export function mergeFieldProblems(
	recordType: MergeableRecordType,
	selections: Readonly<Record<string, string | null>>,
): readonly string[] {
	return MERGE_FIELDS[recordType]
		.filter(
			(field) =>
				field.required === true &&
				Object.hasOwn(selections, field.column) &&
				normalize(selections[field.column]) === null,
		)
		.map((field) => field.label);
}

/** What the dialog starts with, keyed by column. */
export function defaultMergeFieldSelections(
	rows: readonly MergeFieldRow[],
): Record<string, string | null> {
	return Object.fromEntries(rows.map((row) => [row.field.column, row.defaultValue]));
}

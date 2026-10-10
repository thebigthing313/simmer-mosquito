import { toast } from 'sonner';
import { type RecordType, recordNoun } from './record-nouns';
import { errorMessageForSave } from './save-error';

/**
 * Where a missed link write is put right, which decides what the report says.
 *
 * - `add`: new links the detail page has no control for, the crew and the
 *   samples, so the retry is the edit form.
 * - `comment`: a note, which is added from the thread on the detail page.
 * - `change`: links the record already had. Its miss can be a removal, and the
 *   retry is the edit form (#1566).
 */
interface LinkRetry {
	readonly write: 'add' | 'comment' | 'change';
	/** The record the links hang off, named from the register in the description. */
	readonly recordType: RecordType;
}

/**
 * Write a record's link rows once the record itself has settled, for a record
 * that is new from a create form or one that already exists, saved from its
 * edit form.
 *
 * These writes cannot gate the save. The record's own write has already
 * committed by the time they run, so failing the save would report a write that
 * landed as one that did not, and leave the user on a form whose record is
 * already changed. On create it is worse, since the id was minted before the
 * form submitted and the only retry collides on it.
 *
 * They cannot be silent either: what the user selected is not on the record. So
 * the save completes and the miss is reported, naming the record page as the
 * place to put it right. Every link is editable from there.
 */
export async function attachLinksBestEffort(
	/** What failed to attach, as a noun phrase: "the additional personnel". */
	subject: string,
	write: () => Promise<void>,
	retry: LinkRetry,
): Promise<void> {
	try {
		await write();
	} catch (error) {
		const reason = errorMessageForSave(error, 'Unknown error.');
		const record = recordNoun(retry.recordType).one;
		if (retry.write === 'change') {
			toast.error(`Saved, but ${subject} could not be updated.`, {
				description: `${reason} Edit the ${record} to try again.`,
			});
			return;
		}
		const next =
			retry.write === 'comment'
				? `Add it as a comment on the ${record}.`
				: `Edit the ${record} to add them.`;
		toast.error(`Saved, but ${subject} could not be attached.`, {
			description: `${reason} ${next}`,
		});
	}
}

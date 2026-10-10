import { toast } from 'sonner';
import { errorMessageForSave } from './save-error';

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
): Promise<void> {
	try {
		await write();
	} catch (error) {
		toast.error(`Saved, but ${subject} could not be attached.`, {
			description: `${errorMessageForSave(error, 'Unknown error.')} Add them from the record.`,
		});
	}
}

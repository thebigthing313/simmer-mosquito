import { toast } from 'sonner';

/**
 * Attach a new record's link rows once the record itself has settled.
 *
 * These writes cannot gate the save. The parent row is already committed by the
 * time they run, and its id was minted before the form submitted, so failing the
 * save would strand the user on a form whose record exists and whose only retry
 * collides on that id.
 *
 * They cannot be silent either: what the user selected is not on the record. So
 * the save completes and the miss is reported, naming the record page as the
 * place to put it right — the links are all editable from there.
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
			description: `${error instanceof Error ? error.message : 'Unknown error.'} Add them from the record.`,
		});
	}
}

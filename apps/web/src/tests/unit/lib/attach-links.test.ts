import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({
	toast: { error: (title: string, options: unknown) => toastError(title, options) },
}));

const { attachLinksBestEffort } = await import('../../../lib/attach-links');

/**
 * What a failed link write says. New crew and samples have no control on the
 * detail page, so the retry is the edit form (#1602). A note is added from the
 * thread on the detail page. Links that already existed can fail on a removal,
 * and the retry is the edit form (#1566).
 */
describe('attachLinksBestEffort', () => {
	beforeEach(() => {
		toastError.mockReset();
	});

	it('says nothing when the write lands', async () => {
		await attachLinksBestEffort('the additional personnel', async () => undefined, {
			write: 'add',
			recordType: 'collection',
		});
		expect(toastError).not.toHaveBeenCalled();
	});

	it('sends a failed attach to the edit form, naming the record from the register', async () => {
		await attachLinksBestEffort(
			'the additional personnel',
			async () => {
				throw new Error('Refused.');
			},
			{ write: 'add', recordType: 'application' },
		);
		expect(toastError).toHaveBeenCalledWith(
			'Saved, but the additional personnel could not be attached.',
			{ description: 'Refused. Edit the chemical application to add them.' },
		);
	});

	it('sends a failed note to the thread on the record', async () => {
		await attachLinksBestEffort(
			'the note',
			async () => {
				throw new Error('Refused.');
			},
			{ write: 'comment', recordType: 'serviceRequest' },
		);
		expect(toastError).toHaveBeenCalledWith('Saved, but the note could not be attached.', {
			description: 'Refused. Add it as a comment on the service request.',
		});
	});

	it('reports a failed change with the edit wording, naming the record from the register', async () => {
		await attachLinksBestEffort(
			'the additional personnel',
			async () => {
				throw new Error('Refused.');
			},
			{ write: 'change', recordType: 'application' },
		);
		expect(toastError).toHaveBeenCalledWith(
			'Saved, but the additional personnel could not be updated.',
			{ description: 'Refused. Edit the chemical application to try again.' },
		);
	});

	it('falls back to a sentence when the failure carries no message', async () => {
		await attachLinksBestEffort(
			'the additional personnel',
			async () => {
				throw null;
			},
			{ write: 'change', recordType: 'inspection' },
		);
		expect(toastError).toHaveBeenCalledWith(
			'Saved, but the additional personnel could not be updated.',
			{ description: 'Unknown error. Edit the inspection to try again.' },
		);
	});
});

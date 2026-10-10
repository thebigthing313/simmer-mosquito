import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({
	toast: { error: (title: string, options: unknown) => toastError(title, options) },
}));

const { attachLinksBestEffort } = await import('../../../lib/attach-links');

/**
 * What a failed link write says. A create form's links are new, so the miss is
 * something to add from the record. An edit form's links already existed, so a
 * removal can be what failed, and the place to retry is the edit form (#1566).
 */
describe('attachLinksBestEffort', () => {
	beforeEach(() => {
		toastError.mockReset();
	});

	it('says nothing when the write lands', async () => {
		await attachLinksBestEffort('the additional personnel', async () => undefined);
		expect(toastError).not.toHaveBeenCalled();
	});

	it('reports a failed attach with the create wording', async () => {
		await attachLinksBestEffort('the additional personnel', async () => {
			throw new Error('Refused.');
		});
		expect(toastError).toHaveBeenCalledWith(
			'Saved, but the additional personnel could not be attached.',
			{ description: 'Refused. Add them from the record.' },
		);
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

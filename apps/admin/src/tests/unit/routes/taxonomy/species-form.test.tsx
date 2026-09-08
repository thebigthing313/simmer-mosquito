/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	EMPTY_SPECIES,
	SpeciesForm,
	type SpeciesFormValues,
} from '../../../../routes/taxonomy/-species-form';

/**
 * The retry #754 was filed on, on the second of the three catalog forms that
 * caught their own rejection. The form kit owns everything else this form does.
 */

function renderForm(onSubmit: (values: SpeciesFormValues) => Promise<void>) {
	render(
		<SpeciesForm
			genera={[]}
			onCancel={() => undefined}
			onSubmit={onSubmit}
			submitLabel="Add Species"
			suggestDisplayName={() => ''}
			values={EMPTY_SPECIES}
		/>,
	);
}

function save() {
	fireEvent.click(screen.getByRole('button', { name: 'Add Species' }));
}

afterEach(cleanup);

describe('SpeciesForm', () => {
	it('saves again on the next press when the write failed and nothing was edited', async () => {
		const onSubmit = vi
			.fn<(values: SpeciesFormValues) => Promise<void>>()
			.mockRejectedValueOnce(new Error('The connection dropped.'))
			.mockResolvedValueOnce(undefined);
		renderForm(onSubmit);

		fireEvent.change(screen.getByLabelText('Epithet', { exact: false }), {
			target: { value: 'aegypti' },
		});
		save();

		expect(await screen.findByText('The connection dropped.')).toBeTruthy();
		expect(
			(screen.getByRole('button', { name: 'Add Species' }) as HTMLButtonElement).disabled,
		).toBe(false);

		save();

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(2);
		});
	});
});

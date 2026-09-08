/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_UNIT, UnitForm, type UnitFormValues } from '../../../../routes/units/-unit-form';

/**
 * The retry #754 was filed on, on the third of the three catalog forms that
 * caught their own rejection. The form kit owns everything else this form does.
 */

function renderForm(onSubmit: (values: UnitFormValues) => Promise<void>) {
	render(
		<UnitForm
			onCancel={() => undefined}
			onSubmit={onSubmit}
			submitLabel="Add Unit"
			values={EMPTY_UNIT}
		/>,
	);
}

function save() {
	fireEvent.click(screen.getByRole('button', { name: 'Add Unit' }));
}

function type(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
}

afterEach(cleanup);

describe('UnitForm', () => {
	it('saves again on the next press when the write failed and nothing was edited', async () => {
		const onSubmit = vi
			.fn<(values: UnitFormValues) => Promise<void>>()
			.mockRejectedValueOnce(new Error('The connection dropped.'))
			.mockResolvedValueOnce(undefined);
		renderForm(onSubmit);

		type('Name', 'hectare');
		type('Code', 'hectare');
		type('Abbreviation', 'ha');
		save();

		expect(await screen.findByText('The connection dropped.')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Add Unit' }) as HTMLButtonElement).disabled).toBe(
			false,
		);

		save();

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(2);
		});
	});
});

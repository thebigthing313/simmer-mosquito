/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_GENUS, GenusForm } from '../../../../routes/taxonomy/-genus-form';

/**
 * What moving a catalog form onto the form kit changed, rather than what the
 * kit already asserts for itself.
 *
 * The old form greyed Save out while a required field was empty, which said
 * nothing about which one. The rules are per-field validators now, so the two
 * assertions worth making are that pressing Save on an empty form names the
 * missing fields and writes nothing, and that a rejected write is shown rather
 * than swallowed.
 */

function renderForm(onSubmit: (values: typeof EMPTY_GENUS) => Promise<void>) {
	render(
		<GenusForm
			onCancel={() => undefined}
			onSubmit={onSubmit}
			submitLabel="Add Genus"
			values={EMPTY_GENUS}
		/>,
	);
}

function save() {
	fireEvent.click(screen.getByRole('button', { name: 'Add Genus' }));
}

function type(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
}

afterEach(cleanup);

describe('GenusForm', () => {
	it('names both missing fields instead of greying the button out', async () => {
		const onSubmit = vi.fn(async () => undefined);
		renderForm(onSubmit);

		const submit = screen.getByRole('button', { name: 'Add Genus' }) as HTMLButtonElement;
		expect(submit.disabled).toBe(false);

		save();

		expect(await screen.findByText('Name is required.')).toBeTruthy();
		expect(screen.getByText('Abbreviation is required.')).toBeTruthy();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('submits the values once both fields are filled', async () => {
		const onSubmit = vi.fn(async () => undefined);
		renderForm(onSubmit);

		type('Name', 'Aedes');
		type('Abbreviation', 'Ae.');
		save();

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith({ name: 'Aedes', abbreviation: 'Ae.' });
		});
	});

	it("shows the server's words when the write is refused", async () => {
		const onSubmit = vi.fn(async () => {
			throw new Error('A genus named Aedes already exists.');
		});
		renderForm(onSubmit);

		type('Name', 'Aedes');
		type('Abbreviation', 'Ae.');
		save();

		expect(await screen.findByText('A genus named Aedes already exists.')).toBeTruthy();
	});

	/*
	 * #754. The form used to catch its own rejection and write a string into the
	 * error map, which reads as a validation error, so Save was dead until the
	 * operator edited a field they did not mean to change. The rejection escapes
	 * now and the kit records it as a `SaveFailure`, which the button knows to
	 * ignore.
	 */
	it('saves again on the next press when the write failed and nothing was edited', async () => {
		const onSubmit = vi
			.fn<(values: typeof EMPTY_GENUS) => Promise<void>>()
			.mockRejectedValueOnce(new Error('The connection dropped.'))
			.mockResolvedValueOnce(undefined);
		renderForm(onSubmit);

		type('Name', 'Aedes');
		type('Abbreviation', 'Ae.');
		save();

		expect(await screen.findByText('The connection dropped.')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Add Genus' }) as HTMLButtonElement).disabled).toBe(
			false,
		);

		save();

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(2);
		});
		await waitFor(() => {
			expect(screen.queryByText('The connection dropped.')).toBeNull();
		});
	});
});

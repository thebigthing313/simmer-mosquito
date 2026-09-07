// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppForm } from '../../../../components/form/app-form';

/**
 * The one title a form passes. Both failures render under it, and the point of
 * the suite is that it is on screen once either way: every form used to hold a
 * second alert with the same words, so a save that failed said it twice.
 */
const TITLE = 'Unable to save the record';

const SERVER_REFUSAL = 'Another record already has that name.';

function SaveForm({ onSave }: { readonly onSave: () => Promise<void> }) {
	const form = useAppForm({
		defaultValues: { name: 'Ash pond' },
		validators: {
			onSubmit: ({ value }: { readonly value: { readonly name: string } }) =>
				value.name.trim().length === 0 ? 'Name is required.' : undefined,
		},
		onSubmit: async () => {
			await onSave();
		},
	});

	return (
		<form.AppForm>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title={TITLE} />
				<form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
				<form.SubmitButton>Save</form.SubmitButton>
			</form>
		</form.AppForm>
	);
}

function save() {
	fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

function typeName(value: string) {
	fireEvent.change(screen.getByLabelText('Name'), { target: { value } });
}

afterEach(() => {
	cleanup();
});

describe('useAppForm save failures', () => {
	it('renders a validation failure under the title once', async () => {
		render(<SaveForm onSave={() => Promise.resolve()} />);
		typeName('   ');
		save();

		expect(await screen.findByText('Name is required.')).toBeDefined();
		expect(screen.getAllByText(TITLE)).toHaveLength(1);
	});

	it('renders a rejected save under the same title, once', async () => {
		render(<SaveForm onSave={() => Promise.reject(new Error(SERVER_REFUSAL))} />);
		save();

		expect(await screen.findByText(SERVER_REFUSAL)).toBeDefined();
		expect(screen.getAllByText(TITLE)).toHaveLength(1);
	});

	it('says the fallback sentence when the save throws something that names no reason', async () => {
		render(<SaveForm onSave={() => Promise.reject({ status: 500 })} />);
		save();

		expect(await screen.findByText('Unable to save changes.')).toBeDefined();
	});

	it('retries the save on the next attempt, with nothing edited in between', async () => {
		const onSave = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(new Error(SERVER_REFUSAL))
			.mockResolvedValueOnce(undefined);

		render(<SaveForm onSave={onSave} />);
		save();
		expect(await screen.findByText(SERVER_REFUSAL)).toBeDefined();

		save();

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledTimes(2);
		});
		await waitFor(() => {
			expect(screen.queryByText(TITLE)).toBeNull();
		});
	});
});

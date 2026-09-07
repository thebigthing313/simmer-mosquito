/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationFoundations } from '../../../../api';
import {
	type DialogKind,
	FoundationForm,
} from '../../../../routes/organizations/$organizationId/-foundation-forms';
import type { useCreateFoundation } from '../../../../routes/organizations/$organizationId/-foundations-data';

/**
 * What the foundation forms decide now that their rules are validators rather
 * than a `disabled` expression on Add.
 *
 * Every one of these forms used to grey the button out while something was
 * missing, which named nothing, and the two geometry forms went further: they
 * returned from their submit handler when the shape was null, so a form that
 * did reach submit did nothing at all and said nothing about why. Both are
 * messages on screen now, and the write is what proves the rule held.
 */

const EMPTY_FOUNDATIONS = {
	regionFolders: [],
	regions: [],
	addresses: [],
	species: [],
	organizationSpecies: [],
	traps: [],
	lookups: { collectionMethods: [], collectionLures: [], habitatTypes: [] },
} as unknown as OrganizationFoundations;

type CreateFoundation = ReturnType<typeof useCreateFoundation>;

function stubCreate() {
	const mutations = {
		regionFolder: { mutateAsync: vi.fn(async () => undefined) },
		region: { mutateAsync: vi.fn(async () => undefined) },
		address: { mutateAsync: vi.fn(async () => undefined) },
		species: { mutateAsync: vi.fn(async () => undefined) },
		lookup: { mutateAsync: vi.fn(async () => undefined) },
		trap: { mutateAsync: vi.fn(async () => undefined) },
	};
	return mutations as unknown as CreateFoundation & typeof mutations;
}

function renderForm(dialog: DialogKind, create: ReturnType<typeof stubCreate>) {
	render(
		<FoundationForm
			availableSpecies={[]}
			create={create}
			dialog={dialog}
			foundations={EMPTY_FOUNDATIONS}
			onSubmit={async (_label, action) => {
				await action();
			}}
		/>,
	);
}

function add() {
	fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}

function type(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
}

afterEach(cleanup);

describe('FoundationForm', () => {
	it('names the missing folder name rather than greying Add out', async () => {
		const create = stubCreate();
		renderForm({ kind: 'region-folder' }, create);

		add();

		expect(await screen.findByText('Folder name is required.')).toBeTruthy();
		expect(create.regionFolder.mutateAsync).not.toHaveBeenCalled();
	});

	it('writes the folder once it is named', async () => {
		const create = stubCreate();
		renderForm({ kind: 'region-folder' }, create);

		type('Folder name', '  North district  ');
		add();

		await waitFor(() => {
			expect(create.regionFolder.mutateAsync).toHaveBeenCalledWith({
				name: 'North district',
				description: '',
			});
		});
	});

	it('says a region needs a boundary instead of doing nothing', async () => {
		const create = stubCreate();
		renderForm({ kind: 'region' }, create);

		type('Region name', 'Zone 4');
		add();

		expect(await screen.findByText('Add a boundary before saving.')).toBeTruthy();
		expect(create.region.mutateAsync).not.toHaveBeenCalled();
	});

	/*
	 * The form-level rule waits for the fields. `handleSubmit` validates every
	 * field first and returns before the form's own validator when one of them
	 * failed, so an operator is asked for the method here and for the location on
	 * the next press. Both are said out loud, which is the part that changed.
	 */
	it('says a trap needs a collection method', async () => {
		const create = stubCreate();
		renderForm({ kind: 'trap' }, create);

		add();

		expect(await screen.findByText('Choose a collection method.')).toBeTruthy();
		expect(create.trap.mutateAsync).not.toHaveBeenCalled();
	});
});

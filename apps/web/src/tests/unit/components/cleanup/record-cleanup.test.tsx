/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuplicateGroup } from '../../../../hooks/use-merge-candidates';
import type { MinimumRole } from '../../../../lib/write-access';

/**
 * What the page asks the user to decide, and what it does with the answer.
 *
 * `use-record-merge.test.ts` proves the request carries the survivor in the path.
 * This proves the page hands it the right survivor in the first place, which is
 * the half a request test cannot see: the default is the oldest record, and the
 * radio is what changes it. Get either wrong and every merge is still a valid
 * request for the wrong merge.
 *
 * The merge button repeats the choice in its own label rather than reading
 * "Merge", so these assertions are also what holds that copy in place. A button
 * that stopped naming the survivor would leave the direction of an irreversible
 * write visible nowhere on the screen.
 */

const RANK: Record<string, number | undefined> = {
	viewer: 0,
	collector: 1,
	manager: 2,
	admin: 3,
	owner: 4,
};
let signedInRole = 'manager';

vi.mock('../../../../hooks/use-can-write', () => ({
	useHasRole: (minimum: MinimumRole) => (RANK[signedInRole] ?? 0) >= (RANK[minimum] ?? 0),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

const merges = vi.fn();
vi.mock('../../../../hooks/mutations/use-record-merge', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../hooks/mutations/use-record-merge')>()),
	useRecordMerge: () => merges,
}));

let groups: readonly DuplicateGroup[] = [];
let failed = false;
vi.mock('../../../../hooks/use-merge-candidates', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../hooks/use-merge-candidates')>();
	return {
		...actual,
		useDuplicateCandidates: () => ({
			data: failed ? undefined : groups,
			error: failed ? new Error('The server said no.') : null,
			isError: failed,
			isPending: false,
			refetch: vi.fn(),
		}),
		useMergeImpact: () => ({
			data: [
				{ key: 'addressHabitats', moved: 2, deduped: 0, singular: 'habitat', plural: 'habitats' },
			],
			isError: false,
			isPending: false,
		}),
	};
});

const { RecordCleanup } = await import('../../../../components/cleanup/record-cleanup');

const OLDEST = '11111111-1111-4111-8111-111111111111';
const MIDDLE = '22222222-2222-4222-8222-222222222222';
const NEWEST = '33333333-3333-4333-8333-333333333333';

function nameGroup(): DuplicateGroup {
	return {
		key: 'same_name:412 oak st',
		reason: 'same_name',
		value: '412 oak st',
		records: [
			record(OLDEST, '412 Oak St', '2024-03-01T00:00:00.000Z'),
			record(MIDDLE, '412 OAK ST', '2025-06-11T00:00:00.000Z'),
			record(NEWEST, '412 Oak Street', '2026-01-04T00:00:00.000Z'),
		],
	};
}

function record(
	id: string,
	label: string,
	createdAt: string,
	fields: Readonly<Record<string, string | null>> = {},
) {
	return {
		id,
		label,
		detail: 'Marion',
		createdAt,
		lat: 35.5,
		lng: -90.5,
		// Every address has a display name, because the column is required at create.
		// Defaulted here so a fixture that overrides one field does not blank it and
		// leave the dialog holding the merge over a field the test is not about.
		fields: { display_name: label, ...fields },
	};
}

function renderPage(recordType: 'address' | 'contact' = 'address') {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<RecordCleanup recordType={recordType} />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	groups = [nameGroup()];
	failed = false;
	signedInRole = 'manager';
	merges.mockReset();
	merges.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('RecordCleanup', () => {
	it('keeps the oldest record by default', () => {
		renderPage();

		// Oldest first is the server's ordering, and the page's default follows it:
		// the row the agency has had longest is the one most likely already named by
		// the records that matter, so merging into it moves the fewest rows.
		expect(screen.getByRole('radio', { name: /412 Oak St$/ }).getAttribute('aria-checked')).toBe(
			'true',
		);
		expect(screen.getByRole('button', { name: 'Merge 2 into 412 Oak St' })).toBeTruthy();
	});

	it('names the newly chosen survivor on the button when the radio changes', () => {
		renderPage();

		fireEvent.click(screen.getByRole('radio', { name: /412 Oak Street/ }));

		expect(screen.getByRole('button', { name: 'Merge 2 into 412 Oak Street' })).toBeTruthy();
	});

	it('sends the chosen survivor as the target and everything else as the sources', async () => {
		renderPage();

		fireEvent.click(screen.getByRole('radio', { name: /412 OAK ST/ }));
		fireEvent.click(screen.getByRole('button', { name: 'Merge 2 into 412 OAK ST' }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('checkbox'));
		fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

		await vi.waitFor(() => expect(merges).toHaveBeenCalledTimes(1));
		expect(merges).toHaveBeenCalledWith({
			targetId: MIDDLE,
			sourceIds: [OLDEST, NEWEST],
			acknowledged: true,
			// These records agree about every field, so there is nothing to keep and
			// no update command to name.
			fieldUpdates: { intents: [], values: {} },
		});
	});

	it('will not merge until the acknowledgement is ticked', async () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Merge 2 into/ }));
		const dialog = await screen.findByRole('alertdialog');

		// Disabled rather than sending `acknowledged: false` and showing the
		// server's refusal: the flag exists so a person agrees, and a round trip is
		// not what makes them read the sentence.
		expect(within(dialog).getByRole('button', { name: 'Merge' }).hasAttribute('disabled')).toBe(
			true,
		);
		expect(merges).not.toHaveBeenCalled();
	});

	it('drops a record the user says is not a duplicate', () => {
		renderPage();

		const rows = screen.getAllByRole('button', { name: 'Not a duplicate' });
		fireEvent.click(rows[2] as HTMLElement);

		expect(screen.queryByText('412 Oak Street')).toBeNull();
		expect(screen.getByRole('button', { name: 'Merge 1 into 412 Oak St' })).toBeTruthy();
	});

	it('refuses a record in one group without refusing it in another', () => {
		// A contact is compared three ways, so the same person appears in a name
		// group and a phone group on different evidence. Refusing one proposal is
		// not refusing the other, and a flat set of ids would withdraw both.
		groups = [
			nameGroup(),
			{
				key: 'same_phone:5550100',
				reason: 'same_phone',
				value: '5550100',
				records: [
					record(MIDDLE, '412 OAK ST', '2025-06-11T00:00:00.000Z'),
					record(NEWEST, '412 Oak Street', '2026-01-04T00:00:00.000Z'),
				],
			},
		];
		renderPage();

		// The first group's copy of MIDDLE.
		fireEvent.click(screen.getAllByRole('button', { name: 'Not a duplicate' })[1] as HTMLElement);

		// The name group loses it and drops to two records; the phone group keeps
		// both of its own.
		expect(screen.getByRole('button', { name: 'Merge 1 into 412 Oak St' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Merge 1 into 412 OAK ST' })).toBeTruthy();
	});

	it('narrows the page to the match types the menu selects', async () => {
		// Contacts are compared three ways and addresses two, so working through
		// duplicates means working through one kind of evidence at a time: a shared
		// phone number is a different judgement from two rows on one rooftop.
		groups = [
			nameGroup(),
			{
				key: 'same_coordinates:35.5, -90.5',
				reason: 'same_coordinates',
				value: '35.5, -90.5',
				records: [
					record(MIDDLE, '412 OAK ST', '2025-06-11T00:00:00.000Z'),
					record(NEWEST, '412 Oak Street', '2026-01-04T00:00:00.000Z'),
				],
			},
		];
		renderPage();

		expect(screen.getAllByRole('button', { name: /^Merge/ })).toHaveLength(2);

		fireEvent.pointerDown(screen.getByRole('button', { name: /All match types/ }), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Same coordinates/ }));

		const remaining = screen.getAllByRole('button', { name: /^Merge/ });
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.textContent).toContain('412 OAK ST');
	});

	it('says a filter is what emptied the page, rather than offering the list', async () => {
		// "Nothing matched" is a fact about the records and "nothing matched this
		// way" is a fact about the filter. Sending somebody to the address list when
		// they have only hidden the group they were reading is the wrong direction.
		renderPage();

		fireEvent.pointerDown(screen.getByRole('button', { name: /All match types/ }), {
			button: 0,
			ctrlKey: false,
		});
		fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Same coordinates/ }));

		expect(screen.getByText('No duplicate addresses of this kind')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Show all match types' })).toBeTruthy();
	});

	it('offers a value only a retired record holds, and sends it with the merge', async () => {
		// Without this the postal code is gone the moment the merge runs: the merge
		// re-points references and retires the row, and never touches the survivor's
		// own columns.
		groups = [
			{
				key: 'same_name:412 oak st',
				reason: 'same_name',
				value: '412 oak st',
				records: [
					record(OLDEST, '412 Oak St', '2024-03-01T00:00:00.000Z', { postal_code: null }),
					record(MIDDLE, '412 OAK ST', '2025-06-11T00:00:00.000Z', { postal_code: '72364' }),
				],
			},
		];
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Merge 1 into 412 Oak St' }));
		const dialog = await screen.findByRole('alertdialog');

		// Started at the retired record's value rather than at blank, so a reader who
		// changes nothing still keeps it.
		expect((within(dialog).getByLabelText('Postal code') as HTMLInputElement).value).toBe('72364');

		fireEvent.click(within(dialog).getByRole('checkbox'));
		fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

		await vi.waitFor(() => expect(merges).toHaveBeenCalledTimes(1));
		expect(merges.mock.calls[0]?.[0].fieldUpdates).toEqual({
			intents: ['foundation.updateAddressDetails'],
			values: { postal_code: '72364' },
		});
	});

	it('does not send a value the survivor already has', async () => {
		// The survivor's answer stands by default, so a merge nobody edited must not
		// name an update command at all: the domain refuses one with no change.
		groups = [
			{
				key: 'same_name:412 oak st',
				reason: 'same_name',
				value: '412 oak st',
				records: [
					record(OLDEST, '412 Oak St', '2024-03-01T00:00:00.000Z', { postal_code: '72364' }),
					record(MIDDLE, '412 OAK ST', '2025-06-11T00:00:00.000Z', { postal_code: '38103' }),
				],
			},
		];
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Merge 1 into 412 Oak St' }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('checkbox'));
		fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

		await vi.waitFor(() => expect(merges).toHaveBeenCalledTimes(1));
		expect(merges.mock.calls[0]?.[0].fieldUpdates).toEqual({ intents: [], values: {} });
	});

	it('moves a retired phone number into the alternate when asked', async () => {
		// Two rows for one person routinely hold two real numbers. The merge that
		// keeps both is the one that puts the second in the other field, which no
		// amount of choosing between rows can do.
		groups = [
			{
				key: 'same_name:ana reyes',
				reason: 'same_name',
				value: 'ana reyes',
				records: [
					record(OLDEST, 'Ana Reyes', '2024-03-01T00:00:00.000Z', {
						contact_name: 'Ana Reyes',
						preferred_phone: '555-0100',
					}),
					record(MIDDLE, 'A Reyes', '2025-06-11T00:00:00.000Z', {
						contact_name: 'Ana Reyes',
						preferred_phone: '555-0199',
					}),
				],
			},
		];
		renderPage('contact');

		fireEvent.click(screen.getByRole('button', { name: 'Merge 1 into Ana Reyes' }));
		const dialog = await screen.findByRole('alertdialog');

		// Nothing disagrees about the alternate, so it sits behind the disclosure
		// with the rest of the fields that are not asking anything.
		fireEvent.click(within(dialog).getByRole('button', { name: /Edit the other/ }));
		const alternate = within(dialog).getByLabelText('Alternate phone') as HTMLInputElement;
		expect(alternate.value).toBe('');

		fireEvent.click(within(dialog).getByRole('button', { name: /555-0199.*preferred phone/ }));
		expect(alternate.value).toBe('555-0199');

		fireEvent.click(within(dialog).getByRole('checkbox'));
		fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

		await vi.waitFor(() => expect(merges).toHaveBeenCalledTimes(1));
		expect(merges.mock.calls[0]?.[0].fieldUpdates).toEqual({
			intents: ['publicEngagement.updateContactCommunication'],
			values: { alternate_phone: '555-0199' },
		});
	});

	it('takes a value the user types that no record holds', async () => {
		// The merge is often the moment somebody notices the name is wrong on both
		// rows, so the fields are editable rather than a set of choices.
		groups = [
			{
				key: 'same_name:ana reyes',
				reason: 'same_name',
				value: 'ana reyes',
				records: [
					record(OLDEST, 'Ana Reyes', '2024-03-01T00:00:00.000Z', { contact_name: 'Ana Reyes' }),
					record(MIDDLE, 'A Reyes', '2025-06-11T00:00:00.000Z', { contact_name: 'Ana Reyes' }),
				],
			},
		];
		renderPage('contact');

		fireEvent.click(screen.getByRole('button', { name: 'Merge 1 into Ana Reyes' }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('button', { name: /Edit the other/ }));
		fireEvent.change(within(dialog).getByLabelText('Name'), {
			target: { value: 'Ana Reyes-Cruz' },
		});
		fireEvent.click(within(dialog).getByRole('checkbox'));
		fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));

		await vi.waitFor(() => expect(merges).toHaveBeenCalledTimes(1));
		expect(merges.mock.calls[0]?.[0].fieldUpdates.values).toEqual({
			contact_name: 'Ana Reyes-Cruz',
		});
	});

	it('holds the merge when a required field has been emptied', async () => {
		// The domain refuses an empty display name, so sending it would spend the
		// user's click to tell them what the dialog already knows.
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Merge 2 into/ }));
		const dialog = await screen.findByRole('alertdialog');
		fireEvent.click(within(dialog).getByRole('checkbox'));
		fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: '  ' } });

		expect(within(dialog).getByText('Name cannot be empty')).toBeTruthy();
		expect(within(dialog).getByRole('button', { name: 'Merge' }).hasAttribute('disabled')).toBe(
			true,
		);
	});

	it('stops proposing a group that excluding leaves with one record', () => {
		renderPage();

		const rows = screen.getAllByRole('button', { name: 'Not a duplicate' });
		fireEvent.click(rows[2] as HTMLElement);
		fireEvent.click(screen.getAllByRole('button', { name: 'Not a duplicate' })[1] as HTMLElement);

		// One record is not a duplicate set, and a group of one offers a merge with
		// nothing to merge.
		expect(screen.queryByRole('button', { name: /^Merge/ })).toBeNull();
		expect(screen.getByText('No duplicate addresses found')).toBeTruthy();
	});

	it('hides the merge control below the manager floor', () => {
		signedInRole = 'collector';
		renderPage();

		// Matching every other control that starts a write: the answer to "why can't
		// I?" is a fact about the account, not about the records on screen.
		expect(screen.queryByRole('button', { name: /^Merge/ })).toBeNull();
		expect(screen.getByText('412 Oak St')).toBeTruthy();
	});

	it('says what it was looking for when it proposes nothing', () => {
		groups = [];
		renderPage();

		// "No duplicates" alone reads as a tool that does nothing. The rule it
		// applied is what makes an empty page an answer.
		expect(screen.getByText('No duplicate addresses found')).toBeTruthy();
		expect(screen.getByText(/share a display name, a street address/)).toBeTruthy();
	});

	it('offers a retry rather than an empty state when the read failed', () => {
		failed = true;
		renderPage();

		// An empty state here would say "no duplicates", which is a different claim
		// from "we could not look".
		expect(screen.getByText('Could not look for duplicates')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
	});
});

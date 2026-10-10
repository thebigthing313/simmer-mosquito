/** @vitest-environment jsdom */
import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The settings sheet frame, through the descriptors it draws: it opens on the
 * saved values, holds a value it cannot convert open with the message inline,
 * and closes on a valid save with the write reported by toast if it fails.
 * The service request context cases are #1431's first slice: `Number('')` is
 * 0, so a cleared day window used to save as 0 with no message.
 */

const setServiceRequestContext = vi.fn();
const setServiceRequestOverdueDays = vi.fn();
const setAdultCollectionTimingMode = vi.fn();
const toastError = vi.fn();

vi.mock('../../../../../hooks/mutations/use-organization-settings-mutations', () => ({
	useOrganizationSettingsMutations: () => ({
		canWrite: true,
		setAdultCollectionTimingMode,
		setServiceRequestContext,
		setServiceRequestOverdueDays,
	}),
}));
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const { SettingsSectionSheet } = await import(
	'../../../../../components/my-organization/layout/settings-section-sheet'
);
const { collectionTimingSection, serviceRequestContextSection } = await import(
	'../../../../../components/my-organization/settings-sections'
);

const SETTINGS = {
	adultSurveillance: { collectionTimingMode: 'exact_timestamps' },
	publicEngagement: {
		serviceRequestContext: {
			radius: { amount: 1, unitCode: 'mi' },
			timeWindow: { daysBefore: 7, daysAfter: 14 },
		},
		serviceRequestOverdueDays: 14,
	},
} as unknown as OrganizationSettings;

beforeEach(() => {
	setServiceRequestContext.mockReset();
	setServiceRequestContext.mockResolvedValue(undefined);
	setServiceRequestOverdueDays.mockReset();
	setServiceRequestOverdueDays.mockResolvedValue(undefined);
	setAdultCollectionTimingMode.mockReset();
	setAdultCollectionTimingMode.mockResolvedValue(undefined);
	toastError.mockReset();
});

afterEach(cleanup);

describe('SettingsSectionSheet', () => {
	it('opens on the saved values', () => {
		openContextSheet();

		expect(inputValue('Search radius')).toBe('1');
		expect(inputValue('Radius unit')).toBe('mi');
		expect(inputValue('Days before')).toBe('7');
		expect(inputValue('Days after')).toBe('14');
	});

	it('holds a value it cannot convert open, with the message inline, then closes on a valid save', async () => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Days after'), { target: { value: '' } });
		save();

		expect((await screen.findByRole('alert')).textContent).toContain('Days after is required.');
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(setServiceRequestContext).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText('Days after'), { target: { value: '3' } });
		save();

		await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(setServiceRequestContext).toHaveBeenCalledWith({
			radius: { amount: 1, unitCode: 'mi' },
			timeWindow: { daysBefore: 7, daysAfter: 3 },
		});
	});

	it('reopens on the saved values with no message from the last attempt', async () => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Days before'), { target: { value: '' } });
		save();
		await screen.findByRole('alert');

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(inputValue('Days before')).toBe('7');
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('reports a refused write as a toast after closing', async () => {
		setServiceRequestContext.mockRejectedValue(new Error('Distance unit not found.'));
		openContextSheet();
		save();

		await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith('Distance unit not found.'));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it.each([
		['Days before', 'Days before is required.'],
		['Days after', 'Days after is required.'],
		['Search radius', 'Search radius is required.'],
	])('refuses an emptied %s and writes nothing', async (label, message) => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
		save();

		expect((await screen.findByRole('alert')).textContent).toContain(message);
		expect(setServiceRequestContext).not.toHaveBeenCalled();
	});

	it.each([
		['0', 'Search radius must be greater than zero.'],
		['-1', 'Search radius must be greater than zero.'],
	])('refuses a Search radius of %s and writes nothing', async (value, message) => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Search radius'), { target: { value } });
		save();

		expect((await screen.findByRole('alert')).textContent).toContain(message);
		expect(setServiceRequestContext).not.toHaveBeenCalled();
	});

	it('refuses a fractional day count, naming the field', async () => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Days after'), { target: { value: '1.5' } });
		save();

		expect((await screen.findByRole('alert')).textContent).toContain(
			'Days after must be a nonnegative whole number.',
		);
		expect(setServiceRequestContext).not.toHaveBeenCalled();
	});

	it('saves a fractional Search radius', async () => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Search radius'), { target: { value: '0.25' } });
		save();

		await vi.waitFor(() => expect(setServiceRequestContext).toHaveBeenCalledTimes(1));
		expect(setServiceRequestContext).toHaveBeenCalledWith({
			radius: { amount: 0.25, unitCode: 'mi' },
			timeWindow: { daysBefore: 7, daysAfter: 14 },
		});
	});

	it('saves a day window of zero as zero', async () => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Days before'), { target: { value: '0' } });
		fireEvent.change(screen.getByLabelText('Days after'), { target: { value: '0' } });
		save();

		await vi.waitFor(() => expect(setServiceRequestContext).toHaveBeenCalledTimes(1));
		expect(setServiceRequestContext).toHaveBeenCalledWith({
			radius: { amount: 1, unitCode: 'mi' },
			timeWindow: { daysBefore: 0, daysAfter: 0 },
		});
	});

	// #1246: the overdue threshold is a switch and a number beside the context.
	it('opens on the saved overdue threshold', () => {
		openContextSheet();

		expect(
			screen.getByRole('switch', { name: 'Mark overdue requests' }).getAttribute('aria-checked'),
		).toBe('true');
		expect(inputValue('Overdue after (days)')).toBe('14');
	});

	it('saves a new number of days after the context', async () => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Overdue after (days)'), { target: { value: '30' } });
		save();

		await vi.waitFor(() => expect(setServiceRequestOverdueDays).toHaveBeenCalledWith(30));
		expect(setServiceRequestContext).toHaveBeenCalledTimes(1);
	});

	it('saves off when the switch is turned off', async () => {
		openContextSheet();
		fireEvent.click(screen.getByRole('switch', { name: 'Mark overdue requests' }));
		save();

		await vi.waitFor(() => expect(setServiceRequestOverdueDays).toHaveBeenCalledWith('off'));
	});

	it('refuses a threshold above a year and writes nothing', async () => {
		openContextSheet();
		fireEvent.change(screen.getByLabelText('Overdue after (days)'), { target: { value: '400' } });
		save();

		expect((await screen.findByRole('alert')).textContent).toContain(
			'Overdue after (days) must be a whole number from 1 to 365.',
		);
		expect(setServiceRequestContext).not.toHaveBeenCalled();
		expect(setServiceRequestOverdueDays).not.toHaveBeenCalled();
	});

	it('moves the active collection timing card as the select changes', async () => {
		render(<SettingsSectionSheet section={collectionTimingSection} settings={SETTINGS} />);
		fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		const sheet = screen.getByRole('dialog');

		expect(card(sheet, 'Exact Timestamps').dataset.active).toBe('true');
		expect(card(sheet, 'Collection Date and Duration').dataset.active).toBe('false');

		chooseOption(sheet, 'Collection timing', 'Collection date and duration');

		expect(card(sheet, 'Exact Timestamps').dataset.active).toBe('false');
		expect(card(sheet, 'Collection Date and Duration').dataset.active).toBe('true');

		save();
		await vi.waitFor(() =>
			expect(setAdultCollectionTimingMode).toHaveBeenCalledWith('collection_date_duration'),
		);
	});
});

function openContextSheet(): void {
	render(<SettingsSectionSheet section={serviceRequestContextSection} settings={SETTINGS} />);
	fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

function save(): void {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

function inputValue(label: string): string {
	return (screen.getByLabelText(label) as HTMLInputElement).value;
}

function card(sheet: HTMLElement, title: string): HTMLElement {
	const element = within(sheet).getByText(title).closest<HTMLElement>('[data-active]');
	if (element === null) {
		throw new Error(`No choice card titled ${title}.`);
	}
	return element;
}

function chooseOption(sheet: HTMLElement, label: string, option: string): void {
	const trigger = within(sheet).getByRole('combobox', { name: label });
	fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
	fireEvent.click(screen.getByRole('option', { name: option }));
}

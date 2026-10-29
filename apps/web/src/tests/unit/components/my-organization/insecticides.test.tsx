/** @vitest-environment jsdom */
import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The My Organization Insecticides card. Its Edit sheet holds one setting,
 * whether chemical applications record a batch, and the card used to draw only
 * a pointer to Control Operations: the section drew its read-only fields only
 * when it had no body, so the setting the sheet changes was nowhere on the
 * page, and the Edit button did not say what it edits (#1668).
 */

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ to, children }: { readonly to: string; readonly children?: ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock('../../../../hooks/mutations/use-organization-settings-mutations', () => ({
	useOrganizationSettingsMutations: () => ({
		canWrite: true,
		setInsecticideBatchTracking: vi.fn().mockResolvedValue(undefined),
	}),
}));
vi.mock('../../../../hooks/queries/use-insecticide-records', () => ({
	useInsecticideRecords: () => [],
}));

const { InsecticidesSection } = await import('../../../../components/my-organization/insecticides');

afterEach(cleanup);

describe('InsecticidesSection', () => {
	it.each([
		[true, 'On'],
		[false, 'Off'],
	])('shows batch tracking as it is saved (%s reads %s)', (track, shown) => {
		render(<InsecticidesSection canManage settings={settingsTracking(track)} />);

		const setting = screen.getByText('Track insecticide batches').parentElement;
		if (setting === null) {
			throw new Error('The batch tracking setting has no container.');
		}
		expect(within(setting).getByText(shown)).toBeTruthy();
	});

	it('keeps the pointer to Control Operations under the setting', () => {
		render(<InsecticidesSection canManage settings={settingsTracking(true)} />);

		expect(screen.getByRole('link', { name: 'Manage Insecticides' }).getAttribute('href')).toBe(
			'/control-operations/chemical/insecticides',
		);
	});

	it('names what its Edit control edits, and opens on the saved value', () => {
		render(<InsecticidesSection canManage settings={settingsTracking(true)} />);

		fireEvent.click(screen.getByRole('button', { name: 'Edit Batch Tracking' }));

		expect(
			screen
				.getByRole('switch', { name: 'Track insecticide batches' })
				.getAttribute('aria-checked'),
		).toBe('true');
	});

	it('draws no Edit control below the Admin floor', () => {
		render(<InsecticidesSection canManage={false} settings={settingsTracking(true)} />);

		expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
		expect(screen.getByText('On')).toBeTruthy();
	});
});

function settingsTracking(track: boolean): OrganizationSettings {
	return {
		controlOperations: { trackInsecticideBatches: track },
	} as unknown as OrganizationSettings;
}

/** @vitest-environment jsdom */

/**
 * A save refused over a field drawn by a control of the app's own, rather than
 * one of the kit's `field.*` components, says why on that field.
 *
 * `domainValidator` files every issue it can map on the field it names, and
 * `FormErrorAlert` leaves field errors to the field, so a control that does not
 * draw them refuses the save with nothing on screen. The habitat pick on an
 * inspection, the trap pick on a collection and every `DateControl` did that
 * until #871: a habitat inspection with no habitat, a trap collection with no
 * trap, or a required date cleared, and the Save button did nothing.
 *
 * One file for the three, grouped by the rule rather than by module, for the
 * reason `mission-stop-geometry-forms.test.tsx` gives: `vi.mock` hoists per file
 * and the stub block is the same for all three.
 */

import { DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY } from '@simmer-mosquito/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render as renderElement, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectionFormPage } from '../../../../components/adult-surveillance/collections/collection-form';
import { defaultCollectionFormValues } from '../../../../components/adult-surveillance/collections/collection-form-values';
import {
	BiocontrolFormPage,
	defaultBiocontrolFormValues,
} from '../../../../components/control-operations/biocontrol/biocontrol-form';
import { InspectionFormPage } from '../../../../components/larval-surveillance/inspections/inspection-form';
import { defaultInspectionFormValues } from '../../../../components/larval-surveillance/inspections/inspection-form-values';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, to }: { readonly children?: ReactNode; readonly to?: string }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock('../../../../components/map', () => ({ MapCanvas: () => <div data-testid="map" /> }));
vi.mock('../../../../components/pickers/address-picker', () => ({ AddressPicker: () => null }));
vi.mock('../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));
vi.mock('../../../../hooks/queries/use-habitat-names', () => ({
	useHabitatNames: () => new Map(),
}));
vi.mock('../../../../hooks/queries/use-habitat-search', () => ({
	useHabitatSearch: () => ({ matches: [], isReady: true, isError: false }),
}));

const ZONE = 'America/New_York';

const TODAY = '2026-10-05';

afterEach(cleanup);

/** The geometry control's region fill reads through React Query. */
function render(element: ReactElement) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	renderElement(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

/** The error drawn under the control the accessible name names, through its description. */
function describedError(control: HTMLElement): string | null {
	const id = control.getAttribute('aria-describedby');
	return id === null ? null : (document.getElementById(id)?.textContent ?? null);
}

describe('a save refused over a field an app control draws', () => {
	it('marks the habitat pick required and says a habitat inspection has none, under it', async () => {
		const onSave = vi.fn(async () => undefined);
		render(
			<InspectionFormPage
				canSubmit
				defaultValues={defaultInspectionFormValues(TODAY, 'profile-1')}
				habitatTypes={[]}
				header={{
					title: 'Record Inspection',
					backTo: '/larval-surveillance/inspections',
					backLabel: 'Inspections',
				}}
				mode="create"
				onSave={onSave}
				organizationId="org-1"
				policy={DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY}
				profiles={[]}
			/>,
		);

		expect(
			screen.getByText(
				(_, element) => element?.tagName === 'SPAN' && element.textContent === 'Habitat*',
			),
		).toBeDefined();

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		const pick = await screen.findByRole('searchbox', { name: 'Habitat' });
		await vi.waitFor(() => expect(pick.getAttribute('aria-invalid')).toBe('true'));
		expect(describedError(pick)).toMatch(/^Habitat /);
		expect(onSave).not.toHaveBeenCalled();
	});

	it('says a trap collection has no trap, under the trap pick', async () => {
		const onSave = vi.fn(async () => undefined);
		render(
			<CollectionFormPage
				canSubmit
				collectionLures={[]}
				collectionMethods={[]}
				defaultValues={defaultCollectionFormValues(TODAY, null, 'exact_timestamps')}
				header={{
					title: 'Record Collection',
					backTo: '/adult-surveillance/collections',
					backLabel: 'Collections',
				}}
				mode="create"
				onSave={onSave}
				profiles={[]}
				traps={[]}
				units={[]}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		const pick = await screen.findByRole('searchbox', { name: 'Trap' });
		await vi.waitFor(() => expect(pick.getAttribute('aria-invalid')).toBe('true'));
		expect(describedError(pick)).toMatch(/^Trap /);
		expect(onSave).not.toHaveBeenCalled();
	});

	it('says a required date was cleared, under the date', async () => {
		const onSave = vi.fn(async () => undefined);
		render(
			<BiocontrolFormPage
				biocontrolMethods={[]}
				canSubmit
				defaultValues={{ ...defaultBiocontrolFormValues(ZONE), biocontrolDate: '' }}
				header={{
					title: 'Record Biocontrol',
					backTo: '/control-operations/biocontrol',
					backLabel: 'Biocontrol',
				}}
				missionStop={null}
				mode="create"
				onSave={onSave}
				organizationId="org-1"
				profiles={[]}
				units={[]}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		const date = await screen.findByRole('button', { name: 'Release date' });
		await vi.waitFor(() => expect(date.getAttribute('aria-invalid')).toBe('true'));
		expect(describedError(date)).toMatch(/^Biocontrol date /);
		expect(onSave).not.toHaveBeenCalled();
	});
});

/** @vitest-environment jsdom */

/**
 * What inspection create reports when its samples fail to land after the
 * inspection saved.
 *
 * The inspection page has no control for adding a sample, so the miss sends the
 * person to the edit form, naming the inspection from the register (#1602). The
 * save stands and the route still opens the inspection.
 *
 * Every hook the route reads is stood in, since what this file asks is what the
 * route does with a save. The form is a probe that hands back the `onSave` it
 * was given.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InspectionFormValues } from '../../../../components/larval-surveillance/inspections/inspection-form-values';

const INSPECTION_ID = 'a3000000-0000-4000-8000-000000000001';

const harness = vi.hoisted(() => ({
	onSave: null as unknown,
	defaultValues: null as unknown,
	navigate: vi.fn((_to: unknown) => Promise.resolve()),
	toastError: vi.fn((_title: string, _options: unknown) => undefined),
	addSample: vi.fn((_input: unknown) => Promise.reject(new Error('Refused.'))),
	attach: vi.fn((_input: unknown) => Promise.resolve()),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-router')>();
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useRouteContext: () => ({ auth: { snapshot: null } }),
			useSearch: () => ({}),
		}),
		useNavigate: () => harness.navigate,
	};
});

vi.mock('sonner', () => ({
	toast: { error: harness.toastError, success: () => undefined },
}));

vi.mock('../../../../hooks/forms/use-record-extras', () => ({
	useRecordExtras: () => ({ attach: harness.attach, attachComment: () => Promise.resolve() }),
}));
vi.mock('../../../../hooks/larval-surveillance/use-new-inspection-draft', () => ({
	useNewInspectionDraft: () => INSPECTION_ID,
}));
vi.mock('../../../../hooks/mutations/use-inspection-mutations', () => ({
	useInspectionMutations: () => ({ record: () => Promise.resolve() }),
}));
vi.mock('../../../../hooks/mutations/use-sample-mutations', () => ({
	useSampleMutations: () => ({ add: harness.addSample }),
}));
vi.mock('../../../../hooks/queries/use-catalog-roster', () => ({
	useCatalogRoster: () => [],
}));
vi.mock('../../../../hooks/queries/use-profile-roster', () => ({
	useProfileRoster: () => [],
}));
vi.mock('../../../../hooks/use-acknowledged-write', () => ({
	useAcknowledgedWrite: () => ({
		run: (write: (acknowledgements: readonly string[]) => Promise<void>) => write([]),
		dialog: null,
	}),
}));
vi.mock('../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));
vi.mock('../../../../hooks/use-organization-workspace', () => ({
	useOrganizationWorkspace: () => ({
		organization: { id: 'b1000000-0000-4000-8000-000000000001' },
		settings: { larvalSurveillance: { inspectionEntryPolicy: 'optional' } },
	}),
}));

vi.mock(
	'../../../../components/larval-surveillance/inspections/inspection-form',
	async (importOriginal) => ({
		...(await importOriginal<Record<string, unknown>>()),
		InspectionFormPage: (props: { onSave: unknown; defaultValues: unknown }) => {
			harness.onSave = props.onSave;
			harness.defaultValues = props.defaultValues;
			return <p>inspection form</p>;
		},
	}),
);

type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

let CreateInspection: () => ReactNode;

beforeAll(async () => {
	const module = await import('../../../../routes/larval-surveillance/inspections/create');
	const component = module.Route.options.component as SplitComponent;
	await component.preload?.();
	CreateInspection = component;
}, 300_000);

afterEach(cleanup);

describe('inspection create, when the samples fail after the save', () => {
	it('sends the person to the edit form and still opens the inspection', async () => {
		render(<CreateInspection />);
		await screen.findByText('inspection form');
		const onSave = harness.onSave as (input: {
			readonly values: InspectionFormValues;
			readonly adhocGeometry: unknown;
			readonly habitatGeometry: unknown;
		}) => Promise<void>;
		const values = harness.defaultValues as InspectionFormValues;
		await act(() =>
			onSave({
				values: {
					...values,
					locationMode: 'adhoc',
					samples: [{ id: 'c0000000-0000-4000-8000-000000000001', label: 'A' }],
				},
				adhocGeometry: { type: 'Point', coordinates: [-74.5, 40.2] },
				habitatGeometry: null,
			}),
		);
		expect(harness.toastError).toHaveBeenCalledWith(
			'Saved, but the samples could not be attached.',
			{ description: 'Refused. Edit the inspection to add them.' },
		);
		expect(harness.navigate).toHaveBeenCalledWith({
			to: '/larval-surveillance/inspections/$id',
			params: { id: INSPECTION_ID },
		});
	});
});

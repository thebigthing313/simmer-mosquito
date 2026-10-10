/** @vitest-environment jsdom */

/**
 * What inspection edit reports when a link write fails after the inspection
 * saved.
 *
 * The form opens on the crew already on the inspection, so a save can remove a
 * row as well as add one. A failed removal used to read as a failed attach and
 * send the person to the record page, which has no crew control (#1566). The
 * samples are only ever new on this form, so their miss keeps the attach
 * wording. Either way the save stands and the route moves on to the record.
 *
 * The route renders whole over the memory collections, with the crew row from
 * `edit-record-fixtures.ts`, so the crew the form opens on is the one the read
 * hook found. `setPersonnel` is the real one: `mutateCollection` is the seam,
 * and it answers the removal with a rejection. The form itself is a probe that
 * hands back the `onSave` and the values it was given, since what this file
 * asks is what the route does with a save and not how the form draws.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InspectionFormValues } from '../../../../components/larval-surveillance/inspections/inspection-form-values';
import { additional_personnel } from '../../../../lib/collections/additional_personnel';
import { habitat_types } from '../../../../lib/collections/habitat_types';
import { inspections } from '../../../../lib/collections/inspections';
import { organizations } from '../../../../lib/collections/organizations';
import { profiles } from '../../../../lib/collections/profiles';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import {
	ADDITIONAL_PERSONNEL,
	HABITAT_TYPE,
	INSPECTION,
	ORGANIZATION,
	ORGANIZATION_ID,
	PROFILES,
	TECHNICIAN_ID,
} from '../edit-record-fixtures';
import { signedInSnapshot } from '../route-mock-stand-ins';

type OnSave = (input: {
	readonly values: InspectionFormValues;
	readonly adhocGeometry: null;
	readonly habitatGeometry: null;
}) => Promise<void>;

const harness = vi.hoisted(() => ({
	context: { auth: { snapshot: null as unknown } } as unknown,
	params: {} as Record<string, string>,
	/** What the form probe was last handed. */
	form: null as { onSave: unknown; defaultValues: unknown } | null,
	navigate: (_to: unknown) => Promise.resolve(),
	toastError: (_title: string, _options: unknown) => undefined,
	/** The command intents `mutateCollection` refuses. */
	refused: new Set<string>(),
	addSample: (_input: unknown) => Promise.resolve(),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-router')>();
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useRouteContext: () => harness.context,
			useParams: () => harness.params,
			useSearch: () => ({}),
		}),
		useNavigate: () => (to: unknown) => harness.navigate(to),
		Link: ({ children, ...rest }: { readonly children?: ReactNode }) => <a {...rest}>{children}</a>,
	};
});

vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => (harness.context as { auth: { snapshot: unknown } }).auth.snapshot,
}));

vi.mock('sonner', () => ({
	toast: {
		error: (title: string, options: unknown) => harness.toastError(title, options),
		success: () => undefined,
	},
}));

vi.mock('../../../../lib/collections/mutate', () => ({
	mutateCollection: (_collection: unknown, write: { intent: string }) => ({
		when: () =>
			harness.refused.has(write.intent)
				? Promise.reject(new Error('This crew member could not be removed.'))
				: Promise.resolve(),
	}),
}));

vi.mock('../../../../hooks/mutations/use-inspection-mutations', () => ({
	useInspectionMutations: () => ({ save: () => Promise.resolve() }),
}));

vi.mock('../../../../hooks/mutations/use-sample-mutations', () => ({
	useSampleMutations: () => ({ add: (input: unknown) => harness.addSample(input) }),
}));

vi.mock('../../../../hooks/use-owned-geometry', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../hooks/use-owned-geometry')>()),
	useOwnedGeometry: () => ({ geojson: null, isError: false, isPending: false }),
}));

vi.mock(
	'../../../../components/larval-surveillance/inspections/inspection-form',
	async (importOriginal) => ({
		...(await importOriginal<Record<string, unknown>>()),
		InspectionFormPage: (props: { onSave: unknown; defaultValues: unknown }) => {
			harness.form = props;
			return <p>inspection form</p>;
		},
	}),
);

const toastError = vi.fn();
const navigate = vi.fn(() => Promise.resolve());
const addSample = vi.fn((_input: unknown) => Promise.resolve());

type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

let EditInspection: () => ReactNode;

beforeAll(async () => {
	installMemoryCollections();
	seedRows(organizations, [ORGANIZATION]);
	seedRows(profiles, PROFILES);
	seedRows(habitat_types, [HABITAT_TYPE]);
	seedRows(inspections, [INSPECTION]);
	seedRows(additional_personnel, ADDITIONAL_PERSONNEL);
	const module = await import('../../../../routes/larval-surveillance/inspections/$id_.edit');
	const component = module.Route.options.component as SplitComponent;
	await component.preload?.();
	EditInspection = component;
}, 300_000);

beforeEach(() => {
	harness.context = { auth: { snapshot: signedInSnapshot(ORGANIZATION_ID, TECHNICIAN_ID) } };
	harness.params = { id: INSPECTION.id };
	harness.form = null;
	harness.refused = new Set();
	toastError.mockReset();
	navigate.mockClear();
	addSample.mockReset();
	addSample.mockImplementation(() => Promise.resolve());
	harness.toastError = toastError;
	harness.navigate = navigate;
	harness.addSample = addSample;
});

afterEach(cleanup);

/** Render the route, wait for the form, and save it with `change` applied. */
async function saveWith(change: Partial<InspectionFormValues>): Promise<void> {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<EditInspection />
			</Suspense>
		</QueryClientProvider>,
	);
	await screen.findByText('inspection form');
	const form = harness.form as { onSave: OnSave; defaultValues: InspectionFormValues };
	await act(() =>
		form.onSave({
			values: { ...form.defaultValues, ...change },
			adhocGeometry: null,
			habitatGeometry: null,
		}),
	);
}

const INSPECTION_PAGE = {
	to: '/larval-surveillance/inspections/$id',
	params: { id: INSPECTION.id },
};

describe('inspection edit, when a link write fails after the save', () => {
	it('opens on the crew row the fixture puts on the inspection', async () => {
		await saveWith({});
		const values = (harness.form as { defaultValues: InspectionFormValues }).defaultValues;
		expect(values.additionalPersonnelIds).toHaveLength(1);
	});

	it('reports a failed crew removal as a change to retry from the edit form', async () => {
		harness.refused.add('fieldWork.removeAdditionalPersonnel');
		await saveWith({ additionalPersonnelIds: [] });
		expect(toastError).toHaveBeenCalledTimes(1);
		const [title, options] = toastError.mock.calls[0] as [string, { description: string }];
		expect(title).toBe('Saved, but the additional personnel could not be updated.');
		expect(options.description).toMatch(/ Edit the inspection to try again\.$/u);
		expect(options.description).toBe(
			'This crew member could not be removed. Edit the inspection to try again.',
		);
	});

	it('still opens the inspection after a failed crew change', async () => {
		harness.refused.add('fieldWork.removeAdditionalPersonnel');
		await saveWith({ additionalPersonnelIds: [] });
		expect(navigate).toHaveBeenCalledWith(INSPECTION_PAGE);
	});

	it('keeps the attach wording for a sample that fails, since samples are only ever new here', async () => {
		addSample.mockImplementation(() => Promise.reject(new Error('Refused.')));
		await saveWith({ samples: [{ id: 'c0000000-0000-4000-8000-000000000001', label: 'A' }] });
		expect(toastError).toHaveBeenCalledWith('Saved, but the samples could not be attached.', {
			description: 'Refused. Add them from the record.',
		});
		expect(navigate).toHaveBeenCalledWith(INSPECTION_PAGE);
	});
});

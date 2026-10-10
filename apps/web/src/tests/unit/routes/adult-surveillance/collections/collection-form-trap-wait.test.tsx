/** @vitest-environment jsdom */

/**
 * The collection create and edit routes hold the form back until the trap list
 * is ready.
 *
 * The form reads the trap it opens on once, to put the trap's point on the map
 * from the first paint, so a form mounted on the empty list a cold tab starts
 * with drew no trap point and, before #1436, saved against no trap at all. Each
 * route draws the form skeleton while `useTrapOptions` is not ready and the
 * form once it is.
 *
 * Everything but the two routes is faked: the read hooks answer from
 * `harness`, the form is a paragraph, and the skeleton is another, because what
 * a case asks is which of the two a route chose.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ trapsReady: false }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-router')>();
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useRouteContext: () => ({ auth: { snapshot: null } }),
			useParams: () => ({ id: COLLECTION_ID }),
			useSearch: () => ({ trapId: TRAP_ID }),
		}),
		useNavigate: () => async () => undefined,
		Link: ({ children }: { readonly children?: ReactNode }) => <a href="/">{children}</a>,
	};
});

vi.mock(
	'../../../../../components/adult-surveillance/collections/collection-form',
	async (original) => ({
		...(await original<
			typeof import('../../../../../components/adult-surveillance/collections/collection-form')
		>()),
		CollectionFormPage: () => <p>collection form</p>,
	}),
);
vi.mock('../../../../../components/record', async (original) => ({
	...(await original<typeof import('../../../../../components/record')>()),
	EditFormSkeleton: () => <p>form skeleton</p>,
}));
vi.mock('../../../../../components/map', async (original) => ({
	...(await original<typeof import('../../../../../components/map')>()),
	MapCanvas: () => null,
}));

vi.mock('../../../../../hooks/queries/use-trap-options', () => ({
	useTrapOptions: () => ({ traps: [], isReady: harness.trapsReady }),
}));
vi.mock('../../../../../hooks/queries/use-catalog-roster', () => ({
	useCatalogRoster: () => [],
}));
vi.mock('../../../../../hooks/queries/use-profile-roster', () => ({
	useProfileRoster: () => [],
}));
vi.mock('../../../../../hooks/queries/use-unit-labels', () => ({
	useUnitLabels: () => ({ all: [] }),
}));
vi.mock('../../../../../hooks/queries/use-additional-personnel', () => ({
	useAdditionalPersonnel: () => ({ isReady: true, isError: false, rows: [], profileIds: [] }),
}));
vi.mock('../../../../../hooks/queries/use-collection-record', () => ({
	useCollectionRecord: () => ({ collection: COLLECTION, isReady: true, isError: false }),
}));
vi.mock('../../../../../hooks/mutations/use-collection-mutations', () => ({
	useCollectionMutations: () => ({ canWrite: true }),
}));
vi.mock('../../../../../hooks/mutations/use-additional-personnel-mutations', () => ({
	useAdditionalPersonnelMutations: () => ({ setPersonnel: async () => undefined }),
}));
vi.mock('../../../../../hooks/forms/use-record-extras', () => ({
	useRecordExtras: () => ({ attach: async () => undefined }),
}));
vi.mock('../../../../../hooks/use-acknowledged-write', () => ({
	useAcknowledgedWrite: () => ({ run: async () => undefined, dialog: null }),
}));
vi.mock('../../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));
vi.mock('../../../../../hooks/use-organization-workspace', () => ({
	useOrganizationWorkspace: () => ({
		settings: { adultSurveillance: { collectionTimingMode: 'exact_timestamps' } },
	}),
}));

const COLLECTION_ID = 'c011ec70-0000-4000-8000-000000000001';
const TRAP_ID = 'c011ec70-0000-4000-8000-0000000000a1';

/** A trap collection, as the edit route's record read hands one over. */
const COLLECTION = {
	id: COLLECTION_ID,
	trapId: TRAP_ID,
	addressId: null,
	collectionMethodId: 'c011ec70-0000-4000-8000-0000000000b1',
	collectionLureId: null,
	collectionTimingMode: 'exact_timestamps',
	startedAt: null,
	collectedAt: null,
	collectionDate: null,
	durationAmount: null,
	durationUnitId: null,
	setByProfileId: null,
	collectedByProfileId: null,
	hasProblem: false,
	metadata: null,
	latitude: 38.58,
	longitude: -121.49,
};

type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

type RouteModule = { readonly Route: { readonly options: { readonly component?: unknown } } };

/** A route's component, loaded, for the reason `edit-loaders.test.tsx` gives. */
async function componentOf(module: RouteModule): Promise<() => ReactNode> {
	const component = module.Route.options.component as SplitComponent | undefined;
	if (typeof component !== 'function') {
		throw new Error('This route declares no component.');
	}
	await component.preload?.();
	return component;
}

const routes: Record<'create' | 'edit', () => ReactNode> = {
	create: () => null,
	edit: () => null,
};

beforeAll(async () => {
	routes.create = await componentOf(
		await import('../../../../../routes/adult-surveillance/collections/create'),
	);
	routes.edit = await componentOf(
		await import('../../../../../routes/adult-surveillance/collections/$id_.edit'),
	);
}, 300_000);

afterEach(() => {
	cleanup();
	harness.trapsReady = false;
});

describe.each(['create', 'edit'] as const)('the collection %s route', (key) => {
	it('draws the skeleton until the trap list is ready, then the form', () => {
		const Component = routes[key];
		const view = render(<Component />);

		expect(screen.getByText('form skeleton')).toBeTruthy();
		expect(screen.queryByText('collection form')).toBeNull();

		harness.trapsReady = true;
		view.rerender(<Component />);

		expect(screen.getByText('collection form')).toBeTruthy();
		expect(screen.queryByText('form skeleton')).toBeNull();
	});
});

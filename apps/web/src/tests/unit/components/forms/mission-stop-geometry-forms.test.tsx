/** @vitest-environment jsdom */

/**
 * The four control action forms a mission stop opens, over the stop's geometry.
 *
 * A form opened off a stop draws the stop's geometry when it opens, refuses a
 * save once that geometry is cleared, and offers it back from the location band
 * beside the refusal (#1233). Before, the form opened on an empty map and a save
 * with nothing drawn took the stop's geometry on the server, so the location a
 * record was saved at was one nobody had been shown.
 *
 * Each form wires the stop into its own location hook, so each is rendered here
 * rather than trusting the band's own suite for all four. The map and the two
 * pickers are stubbed, since they read Mapbox and live collections and neither
 * is the question.
 *
 * One file for four forms, grouped by the surface rather than mirroring a
 * module, for the reason `hooks/mutations/` is: `vi.mock` hoists per file, so a
 * suite per form would write the same stub block out four times, and the rule
 * under test is one rule the four forms share.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render as renderElement, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawGeometry } from '../../../../hooks/map/use-map-draw';
import type { MissionStopGeometry } from '../../../../hooks/operations/use-mission-stop-geometry';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, to }: { readonly children?: ReactNode; readonly to?: string }) => (
		<a href={to}>{children}</a>
	),
}));
vi.mock('../../../../components/map', () => ({ MapCanvas: () => <div data-testid="map" /> }));
vi.mock('../../../../components/pickers/address-picker', () => ({ AddressPicker: () => null }));
vi.mock('../../../../components/control-operations/control-pickers', () => ({
	HabitatPicker: () => null,
}));

const { ApplicationFormPage } = await import(
	'../../../../components/control-operations/chemical/application-form'
);
const { defaultApplicationFormValues } = await import(
	'../../../../components/control-operations/chemical/application-form-values'
);
const { BiocontrolFormPage, defaultBiocontrolFormValues } = await import(
	'../../../../components/control-operations/biocontrol/biocontrol-form'
);
const { SourceReductionFormPage, defaultSourceReductionFormValues } = await import(
	'../../../../components/control-operations/source-reduction/source-reduction-form'
);
const { OutreachFormPage, defaultOutreachFormValues } = await import(
	'../../../../components/public-engagement/outreach/outreach-form'
);

const ZONE = 'America/New_York';

const STOP_AREA: DrawGeometry = {
	type: 'Polygon',
	coordinates: [
		[
			[-74.41, 40.52],
			[-74.41, 40.53],
			[-74.4, 40.53],
			[-74.41, 40.52],
		],
	],
};

const shared = {
	canSubmit: true,
	mode: 'create',
	onSave: async () => undefined,
	organizationId: 'org-1',
	profiles: [],
} as const;

/** One row per form: how to render it on a stop, and the refusal its band says. */
const FORMS: readonly {
	readonly name: string;
	readonly missing: string;
	readonly render: (missionStop: MissionStopGeometry, onSave: () => Promise<void>) => ReactElement;
}[] = [
	{
		name: 'chemical application',
		missing: 'Map where the product was applied.',
		render: (missionStop, onSave) => (
			<ApplicationFormPage
				{...shared}
				applicationMethods={[]}
				defaultValues={defaultApplicationFormValues(ZONE)}
				equipment={[]}
				header={{
					title: 'Create Application',
					description: 'Record an application.',
					backTo: '/control-operations/chemical',
					backLabel: 'Applications',
				}}
				insecticides={[]}
				missionStop={missionStop}
				onSave={onSave}
				units={[]}
				vehicles={[]}
			/>
		),
	},
	{
		name: 'biocontrol action',
		missing: 'Map where the agents were released.',
		render: (missionStop, onSave) => (
			<BiocontrolFormPage
				{...shared}
				biocontrolMethods={[]}
				defaultValues={defaultBiocontrolFormValues(ZONE)}
				header={{
					title: 'Create Biocontrol',
					description: 'Record a release.',
					backTo: '/control-operations/biocontrol',
					backLabel: 'Biocontrol',
				}}
				missionStop={missionStop}
				onSave={onSave}
				units={[]}
			/>
		),
	},
	{
		name: 'source reduction',
		missing: 'Map where the sources were eliminated.',
		render: (missionStop, onSave) => (
			<SourceReductionFormPage
				{...shared}
				defaultValues={defaultSourceReductionFormValues(ZONE)}
				header={{
					title: 'Create Source Reduction',
					description: 'Record a source reduction.',
					backTo: '/control-operations/source-reduction',
					backLabel: 'Source Reductions',
				}}
				methods={[]}
				missionStop={missionStop}
				onSave={onSave}
				units={[]}
			/>
		),
	},
	{
		name: 'outreach action',
		missing: 'Map where the outreach happened.',
		render: (missionStop, onSave) => (
			<OutreachFormPage
				{...shared}
				defaultValues={defaultOutreachFormValues(ZONE)}
				header={{
					title: 'Create Outreach',
					description: 'Record outreach.',
					backTo: '/public-engagement/outreach',
					backLabel: 'Outreach',
				}}
				missionStop={missionStop}
				onSave={onSave}
				outreachMethods={[]}
			/>
		),
	},
];

afterEach(cleanup);

/** The region fill in the geometry control reads through React Query. */
function render(element: ReactElement) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const wrap = (child: ReactElement) => (
		<QueryClientProvider client={client}>{child}</QueryClientProvider>
	);
	const result = renderElement(wrap(element));
	return { rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

describe.each(FORMS)('the $name form on a mission stop', (form) => {
	const ready: MissionStopGeometry = { status: 'ready', geometry: STOP_AREA };

	it('opens with the stop geometry drawn', () => {
		render(form.render(ready, async () => undefined));

		expect(screen.getByText('Captured')).toBeDefined();
	});

	it('refuses a save once the geometry is cleared, beside the way back to it', async () => {
		const onSave = vi.fn(async () => undefined);
		render(form.render(ready, onSave));

		fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText(form.missing)).toBeDefined();
		expect(onSave).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Use Stop Geometry' }));

		expect(screen.getByText('Captured')).toBeDefined();
		expect(screen.queryByText(form.missing)).toBeNull();
	});

	it('draws the stop geometry once it arrives', () => {
		const { rerender } = render(form.render({ status: 'loading' }, async () => undefined));
		expect(screen.queryByText('Captured')).toBeNull();

		rerender(form.render(ready, async () => undefined));

		expect(screen.getByText('Captured')).toBeDefined();
	});
});

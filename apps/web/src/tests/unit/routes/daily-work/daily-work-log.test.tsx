/** @vitest-environment jsdom */

/**
 * The Daily Work page, rendered whole, with a day of mixed families in the
 * results panel (#1003).
 *
 * The log used to open with a collapsible section headed by the date, with the
 * family sections nested one level under it. The date is the stepper's, so the
 * heading repeated it, and the fold hid the whole day behind one click for a
 * surface that never has a second day to scan past. This holds the panel to
 * what it draws now: the family sections are the top level, each foldable
 * with its count and open by default, and no section is headed by a date.
 *
 * The heading structure is read off the collapsible triggers rather than off
 * the words alone, because "the date is not a heading" and "the families are
 * not nested under anything" are both questions about depth, and a suite that
 * only asked for the family names would pass with the fold still there.
 *
 * The log reads memory collections holding one record in each family on the
 * day and one Habitat the day before, so changing the day is the same subsets
 * answering differently, which is what lets the selection cases say that a
 * key the new day does not hold is no selection. The canvas stand-in records
 * the `activityLayer` prop, which is where the map's highlight comes from.
 * What is faked is what `traps-empty-state.test.tsx` fakes, for the reasons its
 * docblock gives, and the component is preloaded first for the reason
 * `write-attribution.test.tsx` gives.
 */

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityRow } from '../../../../components/activity/activity-data';
import type { DayActivityEntry } from '../../../../components/activity/activity-entries';
import type { ActivityLayerConfig } from '../../../../hooks/map/use-activity-layer';
import { applications } from '../../../../lib/collections/applications';
import { habitats } from '../../../../lib/collections/habitats';
import { organizations } from '../../../../lib/collections/organizations';
import { profiles } from '../../../../lib/collections/profiles';
import { service_requests } from '../../../../lib/collections/service_requests';
import { tag_items } from '../../../../lib/collections/tag_items';
import { tags } from '../../../../lib/collections/tags';
import { traps } from '../../../../lib/collections/traps';
import type { MinimumRole } from '../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { preloadRouteComponent, renderExplorer, stubPanelLayout } from '../explorer-route-harness';
import { notifyRouterStandIn } from '../route-mock-stand-ins';

const PROFILE_ID = '2f1b8c4e-9d3a-4f7b-8c21-5a6d7e8f9a0b';
const DAY = '2026-08-05';
const OTHER_DAY = '2026-08-04';

/** Noon in New York on `day`, so a timestamp files under that day whatever the zone. */
function noonOn(day: string): Date {
	return new Date(`${day}T16:00:00Z`);
}

/** One record in each of the four families on the day, so every family section draws. */
function seedMixedDay(): void {
	seedRows(habitats, [
		{
			id: 'habitat-1',
			lat: 35.5,
			lng: -90.5,
			habitat_name: 'Culvert 12',
			habitat_type_id: null,
			is_active: true,
			is_inaccessible: false,
			created_by_profile_id: PROFILE_ID,
			created_at: noonOn(DAY),
		},
		// The day before holds one Habitat and nothing the mixed day holds.
		{
			id: 'habitat-2',
			lat: 35.5,
			lng: -90.5,
			habitat_name: 'Ditch 7',
			habitat_type_id: null,
			is_active: true,
			is_inaccessible: false,
			created_by_profile_id: PROFILE_ID,
			created_at: noonOn(OTHER_DAY),
		},
	]);
	seedRows(traps, [
		{
			id: 'trap-1',
			lat: 35.6,
			lng: -90.5,
			trap_code: 'GT-04',
			trap_name: null,
			collection_method_id: null,
			is_active: true,
			created_by_profile_id: PROFILE_ID,
			created_at: noonOn(DAY),
		},
	]);
	seedRows(applications, [
		{
			id: 'application-1',
			lat: 35.7,
			lng: -90.5,
			application_date: DAY,
			habitat_id: 'habitat-1',
			address_id: null,
			insecticide_id: null,
			application_method_id: null,
			amount_applied: null,
			application_unit_id: null,
			applicator_profile_id: PROFILE_ID,
			created_at: noonOn(DAY),
		},
	]);
	seedRows(service_requests, [
		{
			id: 'request-1',
			lat: 35.8,
			lng: -90.5,
			display_name: 88,
			address_id: null,
			request_date: DAY,
			received_by_profile_id: PROFILE_ID,
			closed_at: null,
			closed_by_profile_id: null,
			created_at: noonOn(DAY),
		},
	]);
}

const harness = vi.hoisted(() => ({
	/** The search params a match would carry: the day. */
	search: {} as Record<string, unknown>,
	/** The path params a match would carry: the Profile. */
	params: {} as Record<string, string>,
	/** What the canvas was last handed for the activity layer. */
	activityLayer: null as ActivityLayerConfig | null,
	role: 'admin' as string,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../route-mock-stand-ins');
	return routerStandIn(
		await importOriginal<object>(),
		() => harness.search,
		() => harness.params,
	);
});

vi.mock('../../../../hooks/use-can-write', async () => {
	const { roleReaches } = await import('../explorer-route-harness');
	return { useHasRole: (minimum: MinimumRole) => roleReaches(harness.role, minimum) };
});

vi.mock('../../../../components/map', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../components/map')>();
	return {
		...actual,
		MapCanvas: ({ activityLayer }: { readonly activityLayer?: ActivityLayerConfig }) => {
			harness.activityLayer = activityLayer ?? null;
			return <p>map surface</p>;
		},
	};
});

stubPanelLayout();

let DailyWork: () => ReactNode;

beforeAll(async () => {
	DailyWork = await preloadRouteComponent(
		() => import('../../../../routes/daily-work/$profileId'),
		'daily work',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	seedRows(profiles, [
		{ id: PROFILE_ID, organization_id: 'org-1', display_name: 'Dana Okafor', deleted_at: null },
	]);
	seedMixedDay();
	harness.search = { date: DAY };
	harness.params = { profileId: PROFILE_ID };
	harness.activityLayer = null;
	harness.role = 'admin';
});

afterEach(() => {
	cleanup();
});

function renderDailyWork() {
	return renderExplorer(DailyWork);
}

/** The stepper pressed: the day in the URL changes and the router says so. */
function stepTo(day: string): void {
	harness.search = { date: day };
	act(() => notifyRouterStandIn());
}

/**
 * The panel's section headings, outermost first, each with how many
 * collapsibles it sits inside. A day heading over the families reads as depth
 * 0 with the families at depth 1; families at the top read as depth 0 alone.
 */
function headingStructure(): readonly string[] {
	return Array.from(
		document.querySelectorAll<HTMLElement>('[data-slot="collapsible-trigger"]'),
	).map((trigger) => {
		let depth = 0;
		for (
			let node = trigger.parentElement?.closest('[data-slot="collapsible"]') ?? null;
			node !== null;
			node = node.parentElement?.closest('[data-slot="collapsible"]') ?? null
		) {
			depth += 1;
		}
		return `${'  '.repeat(depth - 1)}${trigger.textContent} [${trigger.dataset.state}]`;
	});
}

function selectButton(title: string): HTMLElement {
	return screen.getByRole('button', { name: `Show ${title} on the map` });
}

describe('the Daily Work log', () => {
	it('lists the family sections at the top of the panel, open, each with its count', async () => {
		renderDailyWork();
		await screen.findByText('Culvert 12');

		const structure = headingStructure();
		// Printed so the shape is in the run's output.
		console.info(['heading structure:', ...structure].join('\n'));

		expect(structure).toEqual([
			'Larval Surveillance1 [open]',
			'Adult Surveillance1 [open]',
			'Control Actions1 [open]',
			'Public Engagement1 [open]',
		]);
		// The stepper is the only thing that says the date: the fold's heading was
		// the list-date form, and nothing draws it now.
		expect(screen.queryByText('Aug 5, 2026')).toBeNull();
	});

	it('folds a family section on its heading and unfolds it again', async () => {
		renderDailyWork();
		await screen.findByText('Culvert 12');

		const larval = screen.getByRole('button', { name: /^Larval Surveillance/ });
		fireEvent.click(larval);
		expect(larval.dataset.state).toBe('closed');
		expect(screen.queryByText('Culvert 12')).toBeNull();
		// The other three are untouched.
		expect(screen.getByText('GT-04')).toBeTruthy();

		fireEvent.click(larval);
		expect(larval.dataset.state).toBe('open');
		expect(screen.getByText('Culvert 12')).toBeTruthy();
	});

	// An application has no badge under either placement, and the row used to
	// get an empty element anyway, which laid out a badge column with nothing in
	// it (#1107).
	it('passes an application row no badges', async () => {
		renderDailyWork();
		await screen.findByText('GT-04');

		// The chevron follows the title block directly: no badge column between,
		// and no stacked line under the title either.
		const chevron = screen.getByLabelText('View details for Application');
		expect(chevron.previousElementSibling?.contains(screen.getByText('Application'))).toBe(true);
		expect(
			screen
				.getByText('Application')
				.closest('li')
				?.querySelector('[data-slot="explorer-row-stacked-badges"]'),
		).toBeNull();
		// A row with a state pill still draws it, beside the title since a pill
		// alone does not stack, so the absence above is the application's and not
		// the page's.
		expect(
			screen.getByText('Open').closest('[data-slot="explorer-row-inline-badges"]'),
		).not.toBeNull();
	});
});

describe('selecting a row on the Daily Work log', () => {
	it('opens the focus card and highlights the pin', async () => {
		renderDailyWork();
		await screen.findByText('GT-04');

		fireEvent.click(selectButton('GT-04'));

		expect(selectButton('GT-04').getAttribute('aria-pressed')).toBe('true');
		// The card is the trap card, resolved off the same collection the log read,
		// so it titles itself by the trap's label. The page heading is the person's.
		expect(await screen.findByRole('heading', { name: 'GT-04' })).toBeTruthy();
		await waitFor(() => expect(harness.activityLayer?.selectedKey).toBe('trap:trap-1:created'));
	});

	it('clears a selection the new day does not contain', async () => {
		renderDailyWork();
		await screen.findByText('GT-04');
		fireEvent.click(selectButton('GT-04'));
		await waitFor(() => expect(harness.activityLayer?.selectedKey).toBe('trap:trap-1:created'));

		stepTo(OTHER_DAY);
		await screen.findByText('Ditch 7');

		expect(screen.queryByText('GT-04')).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Trap' })).toBeNull();
		expect(screen.queryByRole('button', { pressed: true })).toBeNull();
		// The key is still held, and resolves to nothing on this day: the pin cloud
		// holds the new day's one entry and the selected key names none of it.
		const cloud = harness.activityLayer?.data as GeoJSON.FeatureCollection | null | undefined;
		expect(cloud?.features.map((feature) => feature.properties?.id)).toEqual([
			'habitat:habitat-2:created',
		]);
		expect(headingStructure()).toEqual(['Larval Surveillance1 [open]']);
	});
});

describe('a row on the Daily Work log', () => {
	const PRIORITY = { id: 'tag-1', tag_name: 'Priority', color: null, description: null };
	const ACCESS = { id: 'tag-2', tag_name: 'Access code', color: null, description: null };

	// The title, the detail link and the Tags are the shared row's, the one the
	// nearby list on a service request reads too, so a habitat here is the
	// habitat beside a request. The row's own additions, the verb and the time
	// of day, sit in the subtitle and are not what this pins. The link's href
	// needs a real router and is `link-destinations.test.tsx`'s case.
	it('draws the title and the Tags that activityRow answers', async () => {
		seedRows(tags, [PRIORITY, ACCESS]);
		seedRows(tag_items, [
			{ id: 'ti-1', entity_type: 'habitat', entity_id: 'habitat-1', tag_id: ACCESS.id },
			{ id: 'ti-2', entity_type: 'habitat', entity_id: 'habitat-1', tag_id: PRIORITY.id },
		]);
		const tagged: DayActivityEntry = {
			category: 'habitat',
			family: 'larval',
			involvement: 'primary',
			role: 'created',
			id: 'habitat-1',
			lat: 35.5,
			lng: -90.5,
			date: DAY,
			occurredAt: noonOn(DAY).toISOString(),
			label: 'Culvert 12',
			placeName: null,
			refId: null,
			methodRefId: null,
			amount: null,
			unitId: null,
			detail: 'active',
			stages: null,
			context: null,
			hasBycatch: null,
			tagIds: [ACCESS.id, PRIORITY.id],
			profileId: PROFILE_ID,
			recordedAt: noonOn(DAY).toISOString(),
		};
		renderDailyWork();
		await screen.findByText('Culvert 12');

		// The lookups the page resolves off the seeded collections: no catalog
		// names, and the two Tags.
		const expected = activityRow(tagged, {
			nameById: new Map(),
			formatQuantity: String,
			tagById: new Map(
				[PRIORITY, ACCESS].map((tag) => [tag.id, { ...tag, name: tag.tag_name }] as const),
			),
		});
		const row = selectButton(expected.title).closest('li') as HTMLElement;
		expect(within(row).getByText(expected.title)).toBeTruthy();
		// The chips in the order drawn, which is the order answered.
		const chipRow = within(row).getByText(PRIORITY.tag_name).parentElement as HTMLElement;
		expect(Array.from(chipRow.children, (chip) => chip.textContent)).toEqual(
			expected.tags.map((tag) => tag.name),
		);
	});
});

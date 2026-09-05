/** @vitest-environment jsdom */

/**
 * Where the links this app renders actually go.
 *
 * One file rather than a case beside each component, and not named for a module
 * it covers: it imports the generated route tree, which pulls in every route
 * module, and vitest isolates modules per file. Split across two suites that
 * cost is paid twice. `router-harness.tsx` beside this says why the real tree is
 * what it builds a router over.
 *
 * The three destinations here are the ones #582 found shipped untested: a People
 * row action (#483), the Profile display name beside it (#541), and the five
 * habitat history rows (#568). All three are well formed, so `tsc` passed them.
 * What none of them had was anything asserting which id went into the path.
 *
 * Every fixture below gives a row's own id and each foreign id it carries a
 * different value, so a `params` reading the neighbouring field resolves to a
 * different href and fails here.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applications } from '../../lib/collections/applications';
import { inspections } from '../../lib/collections/inspections';
import { memberships } from '../../lib/collections/memberships';
import { profiles } from '../../lib/collections/profiles';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { sample_species } from '../../lib/collections/sample_species';
import { samples } from '../../lib/collections/samples';
import { source_reductions } from '../../lib/collections/source_reductions';
import { HabitatHistoryCard } from '../../routes/-habitat-detail';
import { PeopleSection } from '../../routes/my-organization/-components/people';
import { installMemoryCollections, seedRows } from './lib/collections/memory-collections';
import { linkHref, linkHrefs, renderWithRouter } from './router-harness';

const HABITAT = 'habitat-1';

beforeEach(() => {
	installMemoryCollections();
});

afterEach(cleanup);

/**
 * The habitat History card, one tab at a time.
 *
 * Five rows, five destinations, four different id columns. The card is the
 * shape `tsc` cannot tell apart: `inspection.id` and `sample.id` are both
 * strings, `sample.inspectionId` is the same string as the inspection whose row
 * is one tab over, and a row swapped for its neighbour compiles.
 *
 * A `Tabs` renders one panel at a time, so a case has to press the trigger
 * before the row it wants exists. That is also why the assertion is on every
 * link on screen rather than on one found by name: one entry means the row's
 * first cell carries the link and the rest of the row carries none.
 */
describe('the habitat History card', () => {
	beforeEach(() => {
		seedRows(inspections, [
			{
				id: 'inspection-1',
				habitat_id: HABITAT,
				inspection_date: '2026-08-01',
				inspected_by_profile_id: 'inspector-profile-1',
				is_wet: true,
				dip_count: 4,
				density: null,
				larvae_count: 12,
				has_eggs: false,
				has_first_instar: true,
				has_second_instar: false,
				has_third_instar: false,
				has_fourth_instar: false,
				has_pupae: false,
			},
		]);
		seedRows(samples, [
			{
				id: 'sample-1',
				inspection_id: 'inspection-1',
				display_name: 'North basin dip',
				is_zero_larvae: false,
				has_non_mosquito: false,
				unidentifiable_reason: null,
			},
		]);
		seedRows(sample_species, [
			{
				id: 'sample-species-1',
				sample_id: 'sample-1',
				species_id: 'species-1',
				larvae_count: 12,
			},
		]);
		seedRows(applications, [
			{
				id: 'application-1',
				habitat_id: HABITAT,
				application_date: '2026-08-02',
				applicator_profile_id: 'applicator-profile-1',
				insecticide_id: 'insecticide-1',
				application_method_id: 'application-method-1',
				amount_applied: 3,
				application_unit_id: 'unit-1',
			},
		]);
		seedRows(source_reductions, [
			{
				id: 'source-reduction-1',
				habitat_id: HABITAT,
				source_reduction_date: '2026-08-03',
				source_reduction_method_id: 'source-reduction-method-1',
				technician_profile_id: 'technician-profile-1',
				sources_eliminated_amount: 2,
				sources_eliminated_unit_id: 'unit-1',
			},
		]);
		seedRows(requested_control_actions, [
			{
				id: 'requested-control-action-1',
				habitat_id: HABITAT,
				inspection_id: 'inspection-1',
				collection_id: null,
				control_type: 'application',
				summary: 'Standing water behind the depot',
				requested_by_profile_id: 'requester-profile-1',
				requested_at: new Date('2026-08-04T14:00:00.000Z'),
				resolved_at: null,
			},
		]);
	});

	async function openCard(): Promise<void> {
		renderWithRouter(<HabitatHistoryCard habitatId={HABITAT} />);
		// The tab strip counts every subset, so a trigger showing (1) is the card
		// past its skeleton with the seeded row in hand.
		await waitFor(() => {
			expect(screen.getByRole('tab', { name: /^Inspections \(1\)$/ })).toBeTruthy();
		});
	}

	// `mouseDown`, not `click`. Radix switches the panel on the press rather than
	// on the release, and `fireEvent.click` dispatches neither. A case built on it
	// reads the inspections tab five times and passes four of the five.
	function openTab(name: RegExp): void {
		fireEvent.mouseDown(screen.getByRole('tab', { name }));
	}

	it('opens the inspection a row names, not the habitat it happened at', async () => {
		await openCard();

		expect(linkHrefs()).toEqual(['/larval-surveillance/inspections/inspection-1']);
	});

	it('opens the sample a row names, not the inspection it was taken during', async () => {
		await openCard();
		openTab(/^Samples \(1\)$/);

		expect(linkHrefs()).toEqual(['/larval-surveillance/samples/sample-1']);
	});

	it('opens the application a row names, not the insecticide it applied', async () => {
		await openCard();
		openTab(/^Applications \(1\)$/);

		expect(linkHrefs()).toEqual(['/control-operations/chemical/application-1']);
	});

	it('opens the source reduction a row names, not the method it used', async () => {
		await openCard();
		openTab(/^Source Reductions \(1\)$/);

		expect(linkHrefs()).toEqual(['/control-operations/source-reduction/source-reduction-1']);
	});

	it('opens the request a row names, not the inspection it was raised from', async () => {
		await openCard();
		openTab(/^Requests \(1\)$/);

		expect(linkHrefs()).toEqual(['/operations/requests-for-control/requested-control-action-1']);
	});
});

/**
 * The People roster's two links to a Profile's day.
 *
 * A Profile has no detail page, so both the name (#541) and the row action
 * (#483) go to Daily Work, which is keyed on the Profile, not on the Account
 * behind it and not on the Membership that grants it a role. All three are
 * strings on the same row, and `profiles.user_id` is the one a reader reaching
 * for "the person's id" picks by mistake.
 *
 * Neither link is gated. A Profile nobody signs in as still has a day's work
 * behind it, so the historical row links the same way the linked one does, and
 * the case below is what says that was a decision rather than an oversight.
 */
describe('the People roster', () => {
	beforeEach(() => {
		seedRows(profiles, [
			{
				id: 'profile-1',
				user_id: 'account-1',
				display_name: 'Dana Okafor',
				email: 'dana@example.test',
				is_active: true,
			},
			{
				id: 'profile-2',
				user_id: null,
				display_name: 'Ray Alvarado',
				email: null,
				is_active: true,
			},
		]);
		seedRows(memberships, [
			{
				id: 'membership-1',
				profile_id: 'profile-1',
				role: 'collector',
				status: 'active',
			},
		]);
	});

	// The reader's own role, which the section shows in a badge and nothing here
	// reads. A constant rather than the literal because Biome's `useValidAriaRole`
	// reads a literal `role=` as the ARIA attribute, whatever component it is on.
	const VIEWER_ROLE = 'collector' as const;

	async function openRoster(): Promise<void> {
		renderWithRouter(
			<Suspense fallback={null}>
				<PeopleSection auth={null} canManage={false} role={VIEWER_ROLE} />
			</Suspense>,
		);
		await waitFor(() => {
			expect(screen.getByRole('link', { name: 'Dana Okafor' })).toBeTruthy();
		});
	}

	it('opens the Profile the name belongs to, not the Account behind it', async () => {
		await openRoster();

		expect(linkHref('Dana Okafor')).toBe('/daily-work/profile-1');
	});

	it('sends the row action to the same day the name does', async () => {
		await openRoster();

		// Name then action, per row, in group order: the linked Profile's row
		// first, the historical one's under it. Four entries and no more is what
		// says the badges beside the name are still badges.
		expect(linkHrefs()).toEqual([
			'/daily-work/profile-1',
			'/daily-work/profile-1',
			'/daily-work/profile-2',
			'/daily-work/profile-2',
		]);
	});

	it('links a Profile nobody signs in as, the same as one somebody does', async () => {
		await openRoster();

		expect(linkHref('Ray Alvarado')).toBe('/daily-work/profile-2');
	});
});

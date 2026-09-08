/** @vitest-environment jsdom */

/**
 * What an identity write sends: memberships, profiles and the organization's
 * own row.
 *
 * Three of the fifty-four tables are not written by command, and this surface is
 * all three. Two of its writes dispatch to a collection like every other table's
 * and the rest post, so both seams are here in one file. See
 * `dispatch-harness.ts` for why they are asserted differently.
 *
 * The rule worth the file is the one on the posting half. `writeThroughRest`
 * opens a transaction, lets the library diff the row, and sends nothing when the
 * diff is empty, because a sheet opened and closed on Save asks for exactly
 * that. Reading an empty diff as a failure is what put "Unable to save changes."
 * in front of an admin who had changed nothing. Nothing above this layer can
 * tell the difference between a suppressed write and a sent one, so the
 * assertion has to be that no request went out at all.
 */

import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerUrl } from '../../../../auth';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333333';
const HISTORICAL_PROFILE = '44444444-4444-4444-8444-444444444444';
const SPECIES = '55555555-5555-4555-8555-555555555555';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const {
	commandUrl,
	dispatches,
	lastChanges,
	lastIntents,
	lastRequest,
	lastWrite,
	requests,
	resetDispatches,
	stubApi,
	stubApiRefusal,
} = await import('./dispatch-harness');
const { organizations } = await import('../../../../lib/collections/organizations');
const { CommandError } = await import('@simmer-mosquito/sync');
const { useMembershipMutations } = await import(
	'../../../../hooks/mutations/use-membership-mutations'
);
const { useProfileMutations } = await import('../../../../hooks/mutations/use-profile-mutations');
const { useOrganizationSettingsMutations } = await import(
	'../../../../hooks/mutations/use-organization-settings-mutations'
);

const SETTINGS = resolveOrganizationSettings(null).settings;
const STAMP = '2026-08-18T00:00:00.000Z';
const TIMEZONE = SETTINGS.timezone;

/** The organization row every settings write reads its stamp and its document off. */
const ORGANIZATION_ROW = {
	id: ORGANIZATION,
	workos_organization_id: 'org_01',
	name: 'Coastal MAD',
	slug: 'coastal-mad',
	settings: SETTINGS,
	main_contact_email: 'office@coastal.test',
	phone_number: '555-0100',
	mailing_country: 'US',
	mailing_address_line_1: '100 Marsh Road',
	mailing_address_line_2: null,
	mailing_locality: 'Half Moon Bay',
	mailing_region: 'CA',
	mailing_postal_code: '94019',
	created_at: new Date('2026-01-01T00:00:00.000Z'),
	updated_at: new Date(STAMP),
	updated_by_profile_id: null,
};

/** The settings routes are not command endpoints, so `commandUrl` cannot name them. */
function settingsUrl(route: string): string {
	return `${getServerUrl()}/organization-settings/${route}`;
}

/**
 * A stubbed API that answers with a stamp, recorded locally.
 *
 * `stubApi` answers `{ txid }` alone, which is enough for every other assertion
 * here. The stamp ratchet needs the server to say what it wrote under, and the
 * harness is shared, so this file carries its own rather than changing it.
 */
const answered: { url: string; body: Record<string, unknown> }[] = [];

function stubApiStamping(updatedAt: string): void {
	vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
		answered.push({
			url: String(url),
			body: JSON.parse(String(init.body)) as Record<string, unknown>,
		});
		return Promise.resolve(
			new Response(JSON.stringify({ txid: 4242, updatedAt }), { status: 200 }),
		);
	});
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [ORGANIZATION_ROW]);
	resetDispatches();
	answered.length = 0;
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('a membership write', () => {
	it('posts an invitation instead of drawing a row for it', async () => {
		// What an invitation settles is whether a mail was delivered, which is not a
		// column. An optimistic row would be this client claiming an answer only the
		// server has.
		const { result } = renderHook(() => useMembershipMutations());

		await result.current.invite({
			email: 'crew@example.test',
			displayName: 'Sam Rivera',
			role: 'collector',
			profileId: null,
		});

		expect(dispatches()).toHaveLength(0);
		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('memberships'));
		expect(lastRequest().method).toBe('POST');
		expect(lastRequest().body).toMatchObject({
			intents: ['identity.invite'],
			invited_email: 'crew@example.test',
			display_name: 'Sam Rivera',
			role: 'collector',
		});
	});

	it('mints the Membership and the Profile as two different ids', async () => {
		// Both are minted here so a retry collides on the primary key and the server
		// hands back the row it already wrote. One id used twice would make the
		// Membership and the Profile the same row.
		const { result } = renderHook(() => useMembershipMutations());

		await result.current.invite({
			email: 'crew@example.test',
			displayName: '',
			role: 'viewer',
			profileId: null,
		});

		const body = lastRequest().body;
		expect(typeof body.id).toBe('string');
		expect(typeof body.profile_id).toBe('string');
		expect(body.profile_id).not.toBe(body.id);
	});

	it('sends the Profile the sheet picked rather than a fresh one', async () => {
		// The reason the sheet offers a list at all. A minted id for somebody the
		// organization already records work against splits their field history in
		// two, and the invitation still succeeds.
		const { result } = renderHook(() => useMembershipMutations());

		await result.current.invite({
			email: 'crew@example.test',
			displayName: 'Sam Rivera',
			role: 'collector',
			profileId: HISTORICAL_PROFILE,
		});

		expect(lastRequest().body.profile_id).toBe(HISTORICAL_PROFILE);
	});

	it('posts a re-invitation against the membership whose link it replaces', async () => {
		const { result } = renderHook(() => useMembershipMutations());

		await result.current.reinvite(MEMBERSHIP, 'manager');

		expect(lastRequest().url).toBe(commandUrl('memberships', MEMBERSHIP));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body).toEqual({ intents: ['identity.reinvite'], role: 'manager' });
	});

	it('dispatches a role change and posts nothing, because the row is fully known here', async () => {
		const { result } = renderHook(() => useMembershipMutations());

		await result.current.changeRole(MEMBERSHIP, 'admin');

		expect(lastIntents()).toEqual(['identity.changeRole']);
		expect(lastChanges().role).toBe('admin');
		expect(requests()).toHaveLength(0);
	});

	it('clears the default organization when access ends, and keeps the row', async () => {
		// The Membership is the only record that access was ever held, so this is
		// an update and not a delete. `is_default` left set points at the one
		// organization this person can no longer enter, and their next sign-in has
		// nowhere to go.
		const { result } = renderHook(() => useMembershipMutations());

		await result.current.endMembership(MEMBERSHIP);

		expect(lastIntents()).toEqual(['identity.endMembership']);
		expect(lastWrite().operation).toBe('update');
		expect(lastChanges().status).toBe('inactive');
		expect(lastChanges().is_default).toBe(false);
	});
});

describe('a profile write', () => {
	it('creates a historical Profile with no login behind it', async () => {
		// `user_id: null` is what makes it historical. Attaching a login is an
		// invitation, at a different floor and on a different route.
		const { result } = renderHook(() => useProfileMutations());

		const id = await result.current.createHistorical({ displayName: 'Sam Ordway', isActive: true });

		expect(lastIntents()).toEqual(['identity.createProfile']);
		const row = lastWrite().row as Record<string, unknown>;
		expect(row.user_id).toBeNull();
		expect(row.organization_id).toBe(ORGANIZATION);
		expect(row.id).toBe(id);
	});

	it('names the update and moves only the columns the plan handed it', async () => {
		const { result } = renderHook(() => useProfileMutations());

		await result.current.save(PROFILE, { display_name: 'Dana Okafor' });

		expect(lastIntents()).toEqual(['identity.updateProfile']);
		expect(lastWrite().key).toBe(PROFILE);
		expect(lastChanges().display_name).toBe('Dana Okafor');
	});

	it('writes nothing when the plan found no column', async () => {
		// An empty change set is refused by the domain, and stamping `updated_at` to
		// give it something to carry would turn a no-op into a write.
		const { result } = renderHook(() => useProfileMutations());

		await result.current.save(PROFILE, {});

		expect(dispatches()).toHaveLength(0);
	});
});

function organizationFields(overrides: Record<string, unknown> = {}) {
	return {
		name: ORGANIZATION_ROW.name,
		mainContactEmail: ORGANIZATION_ROW.main_contact_email,
		phoneNumber: ORGANIZATION_ROW.phone_number,
		mailingAddressLine1: ORGANIZATION_ROW.mailing_address_line_1,
		mailingAddressLine2: ORGANIZATION_ROW.mailing_address_line_2,
		mailingLocality: ORGANIZATION_ROW.mailing_locality,
		mailingRegion: ORGANIZATION_ROW.mailing_region,
		mailingPostalCode: ORGANIZATION_ROW.mailing_postal_code,
		timezone: TIMEZONE,
		...overrides,
	};
}

describe('an organization details write', () => {
	it('sends nothing at all when the sheet was opened and closed', async () => {
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		await result.current.saveOrganizationDetails(organizationFields());

		expect(dispatches()).toHaveLength(0);
		expect(requests()).toHaveLength(0);
	});

	it('dispatches the columns as a command and states the stamp it expects', async () => {
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		await result.current.saveOrganizationDetails(organizationFields({ phoneNumber: '555-0199' }));

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual(['identity.updateOrganizationDetails']);
		expect(lastChanges().phone_number).toBe('555-0199');
		expect(lastWrite().arguments).toEqual({ expectedUpdatedAt: STAMP });
		// The timezone is the only field on this sheet that is not a column, and it
		// did not move, so no settings route hears about this save.
		expect(requests()).toHaveLength(0);
	});

	it('sends the timezone to its own route, because it is not a column', async () => {
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		await result.current.saveOrganizationDetails(
			organizationFields({ timezone: 'America/Denver' }),
		);

		expect(dispatches()).toHaveLength(0);
		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(settingsUrl('timezone'));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body).toEqual({
			timezone: 'America/Denver',
			expectedUpdatedAt: STAMP,
		});
	});

	it('sends one of each when the sheet changed a column and the timezone', async () => {
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		await result.current.saveOrganizationDetails(
			organizationFields({ name: 'Coastal Vector Control', timezone: 'America/Denver' }),
		);

		expect(lastIntents()).toEqual(['identity.updateOrganizationDetails']);
		expect(lastChanges().name).toBe('Coastal Vector Control');
		expect(lastRequest().url).toBe(settingsUrl('timezone'));
	});
});

describe('a settings write', () => {
	it('sends no request when the value chosen was already the stored one', async () => {
		// The rule this file exists for. The library records no mutation, the
		// transaction has nothing to commit, and the server is never asked. An admin
		// who changed nothing used to be told the save had failed.
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		await result.current.setInsecticideBatchTracking(
			SETTINGS.controlOperations.trackInsecticideBatches,
		);

		expect(requests()).toHaveLength(0);
	});

	it('sends only its own sub-document, under the key that route reads', async () => {
		// A save used to carry the whole settings document back from the editor's
		// copy, so changing the density bands rewrote the timezone, the unit
		// defaults and the key bindings with whatever that copy held.
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		await result.current.setUnitDefaults({ ...SETTINGS.unitDefaults, weight: 'kg' });

		expect(lastRequest().url).toBe(settingsUrl('unit-defaults'));
		expect(Object.keys(lastRequest().body).sort()).toEqual(['expectedUpdatedAt', 'unitDefaults']);
		expect(lastRequest().body.unitDefaults).toMatchObject({ weight: 'kg' });
	});

	it('reads a 2xx that carried no txid as a failure', async () => {
		// Every one of these routes answers with a txid whenever it wrote, so its
		// absence means no write happened whatever the status line said. Believing
		// the status line leaves the optimistic row on screen looking saved, and
		// nothing throws until the next reload drops it.
		stubApiRefusal(200, { updatedAt: '2026-08-19T00:00:00.000Z' });
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		const refusal = await result.current
			.setUnitDefaults({ ...SETTINGS.unitDefaults, weight: 'kg' })
			.catch((error: unknown) => error);

		// Refused on the answer rather than on the way out: the request was made.
		expect(refusal).toBeInstanceOf(CommandError);
		expect(requests()).toHaveLength(1);
	});

	it('gives every other setting its own route and payload key', async () => {
		// The timezone and the unit defaults are asserted above, each for a reason
		// of its own. These five have only the pairing to get wrong, and the route
		// is how the command is named on this surface.
		const { result } = renderHook(() => useOrganizationSettingsMutations());
		const sends: readonly [string, string, () => Promise<void>][] = [
			[
				'adult-collection-timing-mode',
				'collectionTimingMode',
				() => result.current.setAdultCollectionTimingMode('collection_date_duration'),
			],
			[
				'larval-inspection-entry-policy',
				'policy',
				() =>
					result.current.setLarvalInspectionEntryPolicy({
						...SETTINGS.larvalSurveillance.inspectionEntryPolicy,
						mode: 'count_and_dips_required',
					}),
			],
			[
				'insecticide-batch-tracking',
				'trackInsecticideBatches',
				() => result.current.setInsecticideBatchTracking(false),
			],
			[
				'service-request-context',
				'serviceRequestContext',
				() =>
					result.current.setServiceRequestContext({
						...SETTINGS.publicEngagement.serviceRequestContext,
						timeWindow: { daysBefore: 30, daysAfter: 5 },
					}),
			],
			[
				'species-key-bindings',
				'speciesKeyBindings',
				() => result.current.setSpeciesKeyBindings([{ key: 'a', speciesId: SPECIES }]),
			],
		];

		for (const [route, key, send] of sends) {
			await send();

			expect(lastRequest().url).toBe(settingsUrl(route));
			expect(Object.keys(lastRequest().body).sort()).toEqual(['expectedUpdatedAt', key].sort());
		}
	});

	it('states the stamp the last write committed under, not the one sync last delivered', async () => {
		// A settings write does not advance `updated_at` on the optimistic row, so
		// two saves in a row would state the same stamp twice and the second would
		// be refused as a conflict with the first.
		stubApiStamping('2026-08-19T00:00:00.000Z');
		const { result } = renderHook(() => useOrganizationSettingsMutations());

		await result.current.setUnitDefaults({ ...SETTINGS.unitDefaults, weight: 'kg' });
		await result.current.setUnitDefaults({ ...SETTINGS.unitDefaults, weight: 'lb' });

		expect(answered[0]?.body.expectedUpdatedAt).toBe(STAMP);
		expect(answered[1]?.body.expectedUpdatedAt).toBe('2026-08-19T00:00:00.000Z');
	});
});

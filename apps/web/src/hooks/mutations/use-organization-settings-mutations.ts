/**
 * Configuring the agency.
 *
 * Eight operations, each naming exactly one thing a Profile can change about the
 * agency: the seven `organizationSettings.*` commands, and the agency's details.
 * The details are columns, so since ADR 0013's first slice they are
 * `identity.updateOrganizationDetails` through `mutateCollection` like every
 * other table's writes. The seven are a JSON document and keep their own routes
 * See `organization-writes.ts` for why.
 *
 * What each operation sends is only its own sub-document. The server merges it
 * into the stored settings, so an admin editing the larval density bands no
 * longer rewrites the timezone, the unit defaults and the Species Key Bindings
 * from their own copy of the document.
 *
 * ## Saving the agency details can be two writes
 *
 * The details sheet edits the name, the contact, the mailing address — and the
 * timezone, which is not a column but a setting. So `saveAgencyDetails` sends the
 * details as a command and the timezone to its settings route, each only if it
 * changed, and hands the `updated_at` the first produced to the second. Without
 * that handoff the second write conflicts with the write the same click just
 * made.
 */

import type {
	AdultCollectionTimingMode,
	OrganizationSettings,
	ResolvedLarvalInspectionEntryPolicy,
	ServiceRequestContextSettings,
	SpeciesKeyBinding,
	UnitDefaults,
} from '@simmer-mosquito/domain';
import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { Organization } from '@simmer-mosquito/sync';
import { CommandError, settleWrite } from '@simmer-mosquito/sync';
import { useLiveQuery } from '@tanstack/react-db';
import { useCallback, useRef } from 'react';
import { getServerUrl } from '../../auth';
import { mutateCollection } from '../../lib/collections/mutate';
import { organizations } from '../../lib/collections/organizations';
import { OrganizationConflictError, writeOrganization } from './organization-writes';

/** The agency's details, as its sheet holds them. The timezone is a setting; the rest are columns. */
export interface AgencyDetailsFields {
	readonly name: string;
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
	readonly timezone: string;
}

export interface OrganizationSettingsMutations {
	readonly saveAgencyDetails: (fields: AgencyDetailsFields) => Promise<void>;
	readonly setUnitDefaults: (unitDefaults: UnitDefaults) => Promise<void>;
	readonly setAdultCollectionTimingMode: (mode: AdultCollectionTimingMode) => Promise<void>;
	readonly setLarvalInspectionEntryPolicy: (
		policy: ResolvedLarvalInspectionEntryPolicy,
	) => Promise<void>;
	readonly setInsecticideBatchTracking: (trackInsecticideBatches: boolean) => Promise<void>;
	readonly setServiceRequestContext: (context: ServiceRequestContextSettings) => Promise<void>;
	readonly setSpeciesKeyBindings: (bindings: readonly SpeciesKeyBinding[]) => Promise<void>;
	/** False while the agency's row is still arriving; every write throws until then. */
	readonly canWrite: boolean;
}

/**
 * The seven settings commands, as the routes that carry them.
 *
 * A union rather than a map from command name to path: the path *is* how the
 * command is named on this surface, so a second spelling of the same seven
 * facts would only be somewhere for them to disagree.
 */
type SettingsRoute =
	| 'timezone'
	| 'unit-defaults'
	| 'adult-collection-timing-mode'
	| 'larval-inspection-entry-policy'
	| 'insecticide-batch-tracking'
	| 'service-request-context'
	| 'species-key-bindings';

/** The columns `identity.updateOrganizationDetails` writes. */
export interface AgencyDetailsColumns {
	readonly name: string;
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingCountry: string;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
}

/**
 * What one press of Save on the details sheet means: neither write, one, or both.
 *
 * The sheet spans a boundary nothing on screen shows. Eight of its fields are
 * columns on `organizations` and the ninth, the timezone, is a key in the
 * settings document — so the same press can be an identity write, a command, or
 * one of each. Which it is has to be a function of what actually moved: naming
 * the timezone command on a save that only fixed a typo in the phone number
 * makes the server refuse a command with nothing to change, and skipping the
 * details write when only the timezone moved would be sending a request that
 * asks for nothing.
 *
 * `mailingCountry` is not compared to a field because there is no field. The
 * address is US-shaped, enforced by the domain on both the region and the
 * country, so it is always `'US'`. Comparing it to the stored value is what
 * stops an agency whose row predates that from being left alone forever, which
 * is why the field stays in the plan rather than being dropped.
 */
export function agencyDetailsPlan(
	fields: AgencyDetailsFields,
	current: Organization,
	currentTimezone: string,
): { readonly details: AgencyDetailsColumns | null; readonly timezone: string | null } {
	const details: AgencyDetailsColumns = {
		name: fields.name,
		mainContactEmail: fields.mainContactEmail,
		phoneNumber: fields.phoneNumber,
		mailingCountry: 'US',
		mailingAddressLine1: fields.mailingAddressLine1,
		mailingAddressLine2: fields.mailingAddressLine2,
		mailingLocality: fields.mailingLocality,
		mailingRegion: fields.mailingRegion,
		mailingPostalCode: fields.mailingPostalCode,
	};

	const detailsChanged =
		details.name !== current.name ||
		details.mainContactEmail !== current.main_contact_email ||
		details.phoneNumber !== current.phone_number ||
		details.mailingCountry !== current.mailing_country ||
		details.mailingAddressLine1 !== current.mailing_address_line_1 ||
		details.mailingAddressLine2 !== current.mailing_address_line_2 ||
		details.mailingLocality !== current.mailing_locality ||
		details.mailingRegion !== current.mailing_region ||
		details.mailingPostalCode !== current.mailing_postal_code;

	return {
		details: detailsChanged ? details : null,
		timezone: fields.timezone === currentTimezone ? null : fields.timezone,
	};
}

export function useOrganizationSettingsMutations(): OrganizationSettingsMutations {
	// Not suspense: this is a write hook, and a form that has not been submitted
	// should not be what holds a page behind a fallback. Until the row arrives
	// `canWrite` is false and the surfaces disable their controls.
	const result = useLiveQuery((query) => query.from({ organization: organizations }), []);
	const row: Organization | undefined = result.data?.[0];

	/**
	 * The last `updated_at` the server told us it wrote.
	 *
	 * A settings write does not advance `updated_at` on the optimistic row — the
	 * server stamps it with its own clock — so the collection still holds the old
	 * value until Electric streams the write back. Two saves in a row would send
	 * the same `expectedUpdatedAt` twice and the second would be refused as a
	 * conflict with the first. This remembers what the server last said, and the
	 * later of the two is what gets sent.
	 */
	const lastCommittedAt = useRef<string | null>(null);

	const expectedUpdatedAt = useCallback((): string | null => {
		const synced = row?.updated_at?.toISOString() ?? null;
		const committed = lastCommittedAt.current;
		if (synced === null) {
			return committed;
		}
		return committed !== null && committed > synced ? committed : synced;
	}, [row]);

	/** Apply one sub-document locally, send it to its route, and remember what committed. */
	const writeSettings = useCallback(
		async (
			route: SettingsRoute,
			payload: Record<string, unknown>,
			next: (settings: OrganizationSettings) => OrganizationSettings,
		) => {
			if (row === undefined) {
				throw new Error('Agency details are still loading.');
			}

			const organizationId = row.id;
			const settings = resolveOrganizationSettings(row.settings).settings;
			const result = await writeOrganization({
				url: `${getServerUrl()}/organization-settings/${route}`,
				body: { ...payload, expectedUpdatedAt: expectedUpdatedAt() },
				apply: () => {
					organizations.update(organizationId, (draft) => {
						draft.settings = next(settings);
					});
				},
			});

			// Absent when nothing moved, and then there is no new stamp to remember.
			if (result !== null) {
				lastCommittedAt.current = result.updatedAt;
			}
		},
		[row, expectedUpdatedAt],
	);

	const saveAgencyDetails = useCallback(
		async (fields: AgencyDetailsFields) => {
			if (row === undefined) {
				throw new Error('Agency details are still loading.');
			}

			const organizationId = row.id;
			const settings = resolveOrganizationSettings(row.settings).settings;
			const plan = agencyDetailsPlan(fields, row, settings.timezone);

			if (plan.details !== null) {
				const details = plan.details;
				try {
					await settleWrite(
						mutateCollection(organizations, {
							operation: 'update',
							intent: 'identity.updateOrganizationDetails',
							key: organizationId,
							// All nine, and the library sends only the ones that differ.
							// `agencyDetailsPlan` decided whether to write at all; the diff
							// decides what the body says.
							changes: {
								name: details.name,
								main_contact_email: details.mainContactEmail,
								phone_number: details.phoneNumber,
								mailing_country: details.mailingCountry,
								mailing_address_line_1: details.mailingAddressLine1,
								mailing_address_line_2: details.mailingAddressLine2,
								mailing_locality: details.mailingLocality,
								mailing_region: details.mailingRegion,
								mailing_postal_code: details.mailingPostalCode,
							},
							arguments: { expectedUpdatedAt: expectedUpdatedAt() },
						}),
					);
				} catch (error) {
					// The settings routes raise `OrganizationConflictError` themselves,
					// inside `organizationRefusalFor`. The command path has no such hook
					// and every refusal arrives as a `CommandError`, so the one refusal
					// worth naming is recognized here by the error the server sent.
					throw error instanceof CommandError && error.body.error === 'organization_conflict'
						? new OrganizationConflictError()
						: error;
				}

				// The stamp the timezone write has to state, read back off the row the
				// command just streamed in rather than off the closure's copy, which is
				// the render's and predates the write.
				lastCommittedAt.current =
					organizations.get(organizationId)?.updated_at?.toISOString() ?? null;
			}

			// Second, and only if it moved: `expectedUpdatedAt` now reads the stamp
			// the write above produced rather than the one sync last delivered.
			if (plan.timezone !== null) {
				const timezone = plan.timezone;
				await writeSettings('timezone', { timezone }, (current) => ({ ...current, timezone }));
			}
		},
		[row, expectedUpdatedAt, writeSettings],
	);

	const setUnitDefaults = useCallback(
		(unitDefaults: UnitDefaults) =>
			writeSettings('unit-defaults', { unitDefaults }, (current) => ({
				...current,
				unitDefaults,
			})),
		[writeSettings],
	);

	const setAdultCollectionTimingMode = useCallback(
		(collectionTimingMode: AdultCollectionTimingMode) =>
			writeSettings('adult-collection-timing-mode', { collectionTimingMode }, (current) => ({
				...current,
				adultSurveillance: { ...current.adultSurveillance, collectionTimingMode },
			})),
		[writeSettings],
	);

	const setLarvalInspectionEntryPolicy = useCallback(
		(policy: ResolvedLarvalInspectionEntryPolicy) =>
			writeSettings('larval-inspection-entry-policy', { policy }, (current) => ({
				...current,
				larvalSurveillance: { ...current.larvalSurveillance, inspectionEntryPolicy: policy },
			})),
		[writeSettings],
	);

	const setInsecticideBatchTracking = useCallback(
		(trackInsecticideBatches: boolean) =>
			writeSettings('insecticide-batch-tracking', { trackInsecticideBatches }, (current) => ({
				...current,
				controlOperations: { ...current.controlOperations, trackInsecticideBatches },
			})),
		[writeSettings],
	);

	const setServiceRequestContext = useCallback(
		(serviceRequestContext: ServiceRequestContextSettings) =>
			writeSettings('service-request-context', { serviceRequestContext }, (current) => ({
				...current,
				publicEngagement: { ...current.publicEngagement, serviceRequestContext },
			})),
		[writeSettings],
	);

	const setSpeciesKeyBindings = useCallback(
		(bindings: readonly SpeciesKeyBinding[]) =>
			writeSettings('species-key-bindings', { speciesKeyBindings: { bindings } }, (current) => ({
				...current,
				speciesKeyBindings: { bindings },
			})),
		[writeSettings],
	);

	return {
		saveAgencyDetails,
		setUnitDefaults,
		setAdultCollectionTimingMode,
		setLarvalInspectionEntryPolicy,
		setInsecticideBatchTracking,
		setServiceRequestContext,
		setSpeciesKeyBindings,
		canWrite: row !== undefined,
	};
}

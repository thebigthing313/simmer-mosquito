/**
 * The one place a command asks "does anything already read under this?".
 *
 * `acknowledgedHistoricalLabelChange` alone is declared in six modules, and
 * twelve more flags ask the same question of a different record. Written per
 * handler that would be twenty-one copies of a count, and the copies would
 * disagree about which tables to look in — the state #182 found on the delete
 * side. So it is one call here, the way a delete is one call to
 * `applyRecordDeletion`.
 *
 * The citing tables come from the delete registry, through `citingRules` in
 * `@simmer-mosquito/db`. Two subjects the registry cannot describe pass their
 * own rule instead, and both are documented where they are built below.
 *
 * ## What each caller has to decide
 *
 * Whether the *change* is one that rewrites history. A catalog row's name is;
 * its custom schema, its notes and its active flag are not. The guard is
 * therefore called only when the identifying field is among the changes, which
 * is why these take the change set rather than reading it here — only the
 * handler knows which of its columns is the label.
 */

import {
	assertHistoryAcknowledged,
	assertNoColliding,
	type CitingRule,
	citingRules,
	type DbExecutor,
	type DeletableRecordType,
	type HistoryAcknowledgement,
	sql,
} from '@simmer-mosquito/db';

/**
 * Refuse a write that relabels rows the registry already knows cite this
 * record.
 *
 * `subject` completes "already read under this ___", so it is the domain noun
 * for the record, not its table. `only` narrows to named registry rule keys for
 * a flag whose question is about one citing table rather than all of them.
 */
export async function assertCitedHistoryAcknowledged(
	db: DbExecutor,
	input: {
		readonly recordType: DeletableRecordType;
		readonly recordId: string;
		readonly organizationId: string;
		readonly acknowledgement: HistoryAcknowledgement;
		readonly acknowledged: boolean;
		readonly subject: string;
		/**
		 * Whether this change is one the citing rows are read back under. False
		 * skips the count entirely: a catalog row's notes, its custom schema and
		 * its active flag are not what a past record displays, so editing them
		 * asks nothing. Computed by the caller, because only the handler knows
		 * which of its columns is the label.
		 */
		readonly relabels: boolean;
		readonly only?: readonly string[];
	},
): Promise<void> {
	if (!input.relabels) {
		return;
	}
	await assertHistoryAcknowledged(db, {
		acknowledgement: input.acknowledgement,
		acknowledged: input.acknowledged,
		subject: input.subject,
		rules: citingRules(input.recordType, input.recordId, input.organizationId, input.only),
	});
}

/**
 * The summaries recorded at a weather station.
 *
 * Written out rather than read from the registry because a station is
 * deliberately not a `DeletableRecordType`: `weather_summaries` has no
 * `deleted_at` and a nullable `organization_id`, so every filter the registry
 * applies would find none of these rows. The same reason the station's
 * clearance rule carries its own `where`.
 */
export function stationSummaryRule(stationId: string): CitingRule {
	return {
		key: 'stationSummaries',
		table: 'weather_summaries',
		singular: 'summary',
		plural: 'summaries',
		match: sql`weather_source_id = ${stationId}`,
	};
}

/**
 * The notifications already sent to one registration about one type.
 *
 * Narrower than the registry's rule, which counts everything ever sent to the
 * registration. Dropping a subscription only affects the type being dropped, so
 * counting the rest would put notifications in the sentence that the write does
 * not touch.
 */
export function sentNotificationRule(
	registrationId: string,
	notificationTypeId: string,
	organizationId: string,
): CitingRule {
	return {
		key: 'unsubscribedSentNotifications',
		table: 'mission_notifications',
		singular: 'sent notification',
		plural: 'sent notifications',
		match: sql`notification_registration_id = ${registrationId}
			and notification_type_id = ${notificationTypeId}
			and organization_id = ${organizationId}
			and deleted_at is null`,
	};
}

/**
 * The species filed under a genus.
 *
 * `genera` and `species` are global tables with no `organization_id`, so the
 * count is every agency's and the rule carries no tenancy filter. The caller is
 * an operator, who already reads every agency, so the number leaks nothing.
 */
export function genusSpeciesRule(genusId: string): CitingRule {
	return {
		key: 'genusSpecies',
		table: 'species',
		singular: 'species record',
		plural: 'species records',
		// No soft-delete filter: `species` has no `deleted_at`. The taxonomy is
		// hard-deleted and the foreign keys refuse a genus that still has species.
		match: sql`genus_id = ${genusId}`,
	};
}

/**
 * Everything an agency has identified as a species.
 *
 * Global for the same reason `genusSpeciesRule` is, and counted across the
 * three tables that name a species: the two surveillance counts and the
 * agency's own species list.
 */
export function speciesRecordRules(speciesId: string): readonly CitingRule[] {
	return [
		{
			key: 'speciesCollectionCounts',
			table: 'collection_species',
			singular: 'adult count',
			plural: 'adult counts',
			match: sql`species_id = ${speciesId} and deleted_at is null`,
		},
		{
			key: 'speciesSampleCounts',
			table: 'sample_species',
			singular: 'larval count',
			plural: 'larval counts',
			match: sql`species_id = ${speciesId} and deleted_at is null`,
		},
		{
			key: 'speciesOrganizationLists',
			table: 'organization_species',
			singular: 'agency species list',
			plural: 'agency species lists',
			match: sql`species_id = ${speciesId} and deleted_at is null`,
		},
	];
}

/**
 * Refuse a trap code the agency is already using, unless the caller says they
 * meant it.
 *
 * Not a history check, and kept out of the shared helper for that reason: the
 * traps it counts do not read under the code being written, they compete with
 * it. `traps_organization_code_idx` is a plain index rather than a unique one,
 * so two traps sharing a code is legal and this is a question rather than a
 * rule.
 *
 * Only active traps collide. Retiring a trap frees its code, which is why
 * reactivating one asks the question a second time: the code it is coming back
 * with may have been taken while it was away.
 *
 * `excludeTrapId` is the trap being written, so a reactivation is not refused
 * by its own code.
 */
export async function assertTrapCodeAcknowledged(
	db: DbExecutor,
	input: {
		readonly organizationId: string;
		readonly trapCode: string | null;
		readonly excludeTrapId: string;
		readonly acknowledged: boolean;
	},
): Promise<void> {
	if (input.trapCode === null || input.trapCode.length === 0) {
		return;
	}
	await assertNoColliding(db, {
		acknowledged: input.acknowledged,
		message: 'Another trap in this agency already uses this code.',
		rule: {
			key: 'duplicateTrapCode',
			table: 'traps',
			singular: 'trap',
			plural: 'traps',
			match: sql`organization_id = ${input.organizationId}
				and lower(trim(trap_code)) = lower(trim(${input.trapCode}))
				and id <> ${input.excludeTrapId}
				and is_active
				and deleted_at is null`,
		},
	});
}

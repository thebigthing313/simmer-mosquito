import { type RawBuilder, sql, type Transaction } from 'kysely';

import type { DbExecutor, SimmerDatabase } from '../index.js';

/**
 * Deleting a record is never just the one row.
 *
 * The per-domain docs spell out, for every deletable record, which other rows
 * must go with it, which must survive with their link cleared, and which stop
 * the delete outright. That policy used to live only in prose: every delete
 * handler soft-deleted its own row and nothing else, so a deleted habitat left
 * inspections pointing at it and a deleted address kept its traps.
 *
 * This module holds the policy as data, once, and drives two things from it —
 * the impact the detail page shows before the user commits, and the writes the
 * command transaction performs when they do. One registry means the warning and
 * the effect cannot drift apart.
 */
export type DeletableRecordType =
	| 'address'
	| 'region'
	| 'trap'
	| 'collection'
	| 'habitat'
	| 'inspection'
	| 'sample'
	| 'application'
	| 'sourceReduction'
	| 'outreachAction'
	| 'biocontrolAction'
	| 'contact'
	| 'serviceRequest'
	| 'route'
	| 'assignment'
	| 'requestedControlAction'
	| 'mission';

/**
 * How a rule's rows relate to the record being deleted.
 *
 * `direct` is a plain foreign key. `polymorphic` is the `entity_type`/
 * `entity_id` pair the support tables (comments, tags, personnel, route and
 * assignment items) use — `entityType` is the snake_case column value, not the
 * camelCase domain target name.
 *
 * The two `child` forms reach a generation further: rows that point not at the
 * record but at rows that point at the record — a trap's collections' species
 * counts, an inspection's samples' comments. They read the child set live, so
 * they must run before the children themselves are soft-deleted; `orderRules`
 * guarantees that.
 */
type ReferenceScope =
	| { readonly kind: 'direct'; readonly column: string }
	| { readonly kind: 'polymorphic'; readonly entityType: string }
	| { readonly kind: 'childColumn'; readonly child: ChildSet; readonly column: string }
	| { readonly kind: 'childPolymorphic'; readonly child: ChildSet; readonly entityType: string };

interface ChildSet {
	readonly table: string;
	readonly column: string;
}

/**
 * What happens to the matched rows.
 *
 * `block` refuses the delete while any row matches — the record is load-bearing
 * and the agency has to deal with the references first. `cascade` soft-deletes
 * them alongside the record. `detach` keeps the row and clears its link, which
 * is how surveillance deletes avoid taking control history with them.
 */
type ReferenceEffect = 'block' | 'cascade' | 'detach';

interface ReferenceRule {
	/** Stable id for this consequence, so the UI can key and test it. */
	readonly key: string;
	readonly effect: ReferenceEffect;
	readonly table: string;
	readonly scope: ReferenceScope;
	/** Domain noun for the rows, for copy that reads like the rest of the app. */
	readonly singular: string;
	readonly plural: string;
}

interface DeletableRecordConfig {
	readonly table: string;
	readonly singular: string;
	readonly rules: readonly ReferenceRule[];
}

export interface DeleteImpactEntry {
	readonly key: string;
	readonly count: number;
	readonly singular: string;
	readonly plural: string;
}

export interface DeleteImpact {
	readonly recordType: DeletableRecordType;
	readonly recordId: string;
	/** False when the record is missing, another agency's, or already deleted. */
	readonly found: boolean;
	/** Non-empty means the delete is refused; each entry says by what. */
	readonly blockers: readonly DeleteImpactEntry[];
	/** Rows that go away with the record. */
	readonly cascades: readonly DeleteImpactEntry[];
	/** Rows that survive with their link to the record cleared. */
	readonly detaches: readonly DeleteImpactEntry[];
}

/** Thrown by `applyRecordDeletion` when a `block` rule matched. */
export class RecordDeleteBlockedError extends Error {
	readonly recordType: DeletableRecordType;
	readonly recordId: string;
	readonly blockers: readonly DeleteImpactEntry[];

	constructor(
		recordType: DeletableRecordType,
		recordId: string,
		blockers: readonly DeleteImpactEntry[],
	) {
		// The domain noun, not the registry key: this message is handed to the
		// user verbatim by the command layer, and `requestedControlAction` is not
		// a word anyone in an agency says.
		super(
			`Deleting this ${deletableRecordLabel(recordType)} is blocked by records that reference it.`,
		);
		this.name = 'RecordDeleteBlockedError';
		this.recordType = recordType;
		this.recordId = recordId;
		this.blockers = blockers;
	}
}

// ---------------------------------------------------------------------------
// Rule shorthands
// ---------------------------------------------------------------------------

function blocks(
	key: string,
	table: string,
	column: string,
	singular: string,
	plural: string,
): ReferenceRule {
	return { key, effect: 'block', table, scope: { kind: 'direct', column }, singular, plural };
}

function detaches(
	key: string,
	table: string,
	column: string,
	singular: string,
	plural: string,
): ReferenceRule {
	return { key, effect: 'detach', table, scope: { kind: 'direct', column }, singular, plural };
}

function detachesUnderChild(
	key: string,
	table: string,
	column: string,
	child: ChildSet,
	singular: string,
	plural: string,
): ReferenceRule {
	return {
		key,
		effect: 'detach',
		table,
		scope: { kind: 'childColumn', child, column },
		singular,
		plural,
	};
}

function cascades(
	key: string,
	table: string,
	column: string,
	singular: string,
	plural: string,
): ReferenceRule {
	return { key, effect: 'cascade', table, scope: { kind: 'direct', column }, singular, plural };
}

function cascadesUnderChild(
	key: string,
	table: string,
	column: string,
	child: ChildSet,
	singular: string,
	plural: string,
): ReferenceRule {
	return {
		key,
		effect: 'cascade',
		table,
		scope: { kind: 'childColumn', child, column },
		singular,
		plural,
	};
}

/** Support rows attached through `entity_type`/`entity_id`. */
function cascadesSupport(
	key: string,
	table: string,
	entityType: string,
	singular: string,
	plural: string,
): ReferenceRule {
	return {
		key,
		effect: 'cascade',
		table,
		scope: { kind: 'polymorphic', entityType },
		singular,
		plural,
	};
}

/** Support rows attached to the record's children rather than the record. */
function cascadesSupportUnderChild(
	key: string,
	table: string,
	entityType: string,
	child: ChildSet,
	singular: string,
	plural: string,
): ReferenceRule {
	return {
		key,
		effect: 'cascade',
		table,
		scope: { kind: 'childPolymorphic', child, entityType },
		singular,
		plural,
	};
}

const COLLECTIONS_OF_TRAP: ChildSet = { table: 'collections', column: 'trap_id' };
const SAMPLES_OF_INSPECTION: ChildSet = { table: 'samples', column: 'inspection_id' };
const ITEMS_OF_MISSION: ChildSet = { table: 'mission_items', column: 'mission_id' };

/**
 * Every control action carries the same support rows and the same links out, so
 * the four action types differ only in their table and `entity_type` token.
 */
function controlActionConfig(
	table: string,
	entityType: string,
	singular: string,
): DeletableRecordConfig {
	return {
		table,
		singular,
		rules: [
			cascadesSupport(`${entityType}Comments`, 'comments', entityType, 'comment', 'comments'),
			cascadesSupport(
				`${entityType}Personnel`,
				'additional_personnel',
				entityType,
				'assisting person',
				'assisting people',
			),
		],
	};
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const DELETABLE_RECORDS: Record<DeletableRecordType, DeletableRecordConfig> = {
	/**
	 * Addresses block rather than cascade. An address is shared reference data,
	 * and every operational row that names one keeps it as historical context —
	 * so the agency retires the references first, deliberately, rather than
	 * having a delete quietly rewrite where work happened.
	 */
	address: {
		table: 'addresses',
		singular: 'address',
		rules: [
			blocks('addressTraps', 'traps', 'address_id', 'trap', 'traps'),
			blocks('addressCollections', 'collections', 'address_id', 'collection', 'collections'),
			blocks('addressHabitats', 'habitats', 'address_id', 'habitat', 'habitats'),
			blocks('addressInspections', 'inspections', 'address_id', 'inspection', 'inspections'),
			blocks(
				'addressApplications',
				'applications',
				'address_id',
				'chemical application',
				'chemical applications',
			),
			blocks(
				'addressSourceReductions',
				'source_reductions',
				'address_id',
				'source reduction',
				'source reductions',
			),
			blocks(
				'addressOutreachActions',
				'outreach_actions',
				'address_id',
				'outreach action',
				'outreach actions',
			),
			blocks(
				'addressBiocontrolActions',
				'biocontrol_actions',
				'address_id',
				'biocontrol action',
				'biocontrol actions',
			),
			blocks(
				'addressControlRequests',
				'requested_control_actions',
				'address_id',
				'control request',
				'control requests',
			),
			blocks(
				'addressServiceRequests',
				'service_requests',
				'address_id',
				'service request',
				'service requests',
			),
			blocks(
				'addressNotificationRegistrations',
				'notification_registrations',
				'address_id',
				'notification registration',
				'notification registrations',
			),
			blocks('addressMissionItems', 'mission_items', 'address_id', 'mission stop', 'mission stops'),
			cascadesSupport('addressComments', 'comments', 'address', 'comment', 'comments'),
			cascadesSupport('addressTags', 'tag_items', 'address', 'tag', 'tags'),
		],
	},

	/**
	 * Nothing references a region by id — notification registrations and
	 * operational rows own geometry snapshots and are matched spatially — so a
	 * region delete takes only its own support rows.
	 */
	region: {
		table: 'regions',
		singular: 'region',
		rules: [
			cascadesSupport('regionComments', 'comments', 'region', 'comment', 'comments'),
			cascadesSupport('regionTags', 'tag_items', 'region', 'tag', 'tags'),
		],
	},

	/**
	 * A trap owns its collections, so deleting one takes the whole trapping
	 * record with it — collections, their species counts, and their support
	 * rows — while control work that cited a collection survives with its link
	 * cleared.
	 */
	trap: {
		table: 'traps',
		singular: 'trap',
		rules: [
			cascadesUnderChild(
				'trapCollectionSpecies',
				'collection_species',
				'collection_id',
				COLLECTIONS_OF_TRAP,
				'species count',
				'species counts',
			),
			cascadesSupportUnderChild(
				'trapCollectionComments',
				'comments',
				'collection',
				COLLECTIONS_OF_TRAP,
				'collection comment',
				'collection comments',
			),
			cascadesSupportUnderChild(
				'trapCollectionPersonnel',
				'additional_personnel',
				'collection',
				COLLECTIONS_OF_TRAP,
				'assisting person',
				'assisting people',
			),
			detachesUnderChild(
				'trapCollectionApplications',
				'applications',
				'collection_id',
				COLLECTIONS_OF_TRAP,
				'chemical application',
				'chemical applications',
			),
			detachesUnderChild(
				'trapCollectionControlRequests',
				'requested_control_actions',
				'collection_id',
				COLLECTIONS_OF_TRAP,
				'control request',
				'control requests',
			),
			cascades('trapCollections', 'collections', 'trap_id', 'collection', 'collections'),
			cascadesSupport('trapComments', 'comments', 'trap', 'comment', 'comments'),
			cascadesSupport('trapTags', 'tag_items', 'trap', 'tag', 'tags'),
			cascadesSupport('trapRouteItems', 'route_items', 'trap', 'route stop', 'route stops'),
			cascadesSupport(
				'trapAssignmentItems',
				'assignment_items',
				'trap',
				'assignment stop',
				'assignment stops',
			),
		],
	},

	collection: {
		table: 'collections',
		singular: 'collection',
		rules: [
			cascades(
				'collectionSpecies',
				'collection_species',
				'collection_id',
				'species count',
				'species counts',
			),
			cascadesSupport('collectionComments', 'comments', 'collection', 'comment', 'comments'),
			cascadesSupport(
				'collectionPersonnel',
				'additional_personnel',
				'collection',
				'assisting person',
				'assisting people',
			),
			detaches(
				'collectionApplications',
				'applications',
				'collection_id',
				'chemical application',
				'chemical applications',
			),
			detaches(
				'collectionControlRequests',
				'requested_control_actions',
				'collection_id',
				'control request',
				'control requests',
			),
		],
	},

	/**
	 * Deleting a habitat is for catalog records that should never have existed;
	 * retiring is the lifecycle move. Its inspections are real observations, so
	 * they survive as ad hoc records with their snapshot geometry, type, and
	 * address intact — only the habitat link goes.
	 */
	habitat: {
		table: 'habitats',
		singular: 'habitat',
		rules: [
			cascadesSupport('habitatComments', 'comments', 'habitat', 'comment', 'comments'),
			cascadesSupport('habitatTags', 'tag_items', 'habitat', 'tag', 'tags'),
			cascadesSupport('habitatRouteItems', 'route_items', 'habitat', 'route stop', 'route stops'),
			cascadesSupport(
				'habitatAssignmentItems',
				'assignment_items',
				'habitat',
				'assignment stop',
				'assignment stops',
			),
			cascades('habitatInspections', 'inspections', 'habitat_id', 'inspection', 'inspections'),
			detaches(
				'habitatApplications',
				'applications',
				'habitat_id',
				'chemical application',
				'chemical applications',
			),
			detaches(
				'habitatSourceReductions',
				'source_reductions',
				'habitat_id',
				'source reduction',
				'source reductions',
			),
			detaches(
				'habitatBiocontrolActions',
				'biocontrol_actions',
				'habitat_id',
				'biocontrol action',
				'biocontrol actions',
			),
			detaches(
				'habitatControlRequests',
				'requested_control_actions',
				'habitat_id',
				'control request',
				'control requests',
			),
		],
	},

	inspection: {
		table: 'inspections',
		singular: 'inspection',
		rules: [
			cascadesUnderChild(
				'inspectionSampleSpecies',
				'sample_species',
				'sample_id',
				SAMPLES_OF_INSPECTION,
				'species count',
				'species counts',
			),
			cascadesSupportUnderChild(
				'inspectionSampleComments',
				'comments',
				'sample',
				SAMPLES_OF_INSPECTION,
				'sample comment',
				'sample comments',
			),
			cascades('inspectionSamples', 'samples', 'inspection_id', 'sample', 'samples'),
			cascadesSupport('inspectionComments', 'comments', 'inspection', 'comment', 'comments'),
			cascadesSupport(
				'inspectionPersonnel',
				'additional_personnel',
				'inspection',
				'assisting person',
				'assisting people',
			),
			detaches(
				'inspectionApplications',
				'applications',
				'inspection_id',
				'chemical application',
				'chemical applications',
			),
			detaches(
				'inspectionSourceReductions',
				'source_reductions',
				'inspection_id',
				'source reduction',
				'source reductions',
			),
			detaches(
				'inspectionOutreachActions',
				'outreach_actions',
				'inspection_id',
				'outreach action',
				'outreach actions',
			),
			detaches(
				'inspectionBiocontrolActions',
				'biocontrol_actions',
				'inspection_id',
				'biocontrol action',
				'biocontrol actions',
			),
			detaches(
				'inspectionControlRequests',
				'requested_control_actions',
				'inspection_id',
				'control request',
				'control requests',
			),
		],
	},

	sample: {
		table: 'samples',
		singular: 'sample',
		rules: [
			cascades('sampleSpecies', 'sample_species', 'sample_id', 'species count', 'species counts'),
			cascadesSupport('sampleComments', 'comments', 'sample', 'comment', 'comments'),
		],
	},

	application: {
		table: 'applications',
		singular: 'chemical application',
		rules: [
			cascades(
				'applicationBatches',
				'application_batches',
				'application_id',
				'batch record',
				'batch records',
			),
			cascadesSupport('applicationComments', 'comments', 'application', 'comment', 'comments'),
			cascadesSupport(
				'applicationPersonnel',
				'additional_personnel',
				'application',
				'assisting person',
				'assisting people',
			),
		],
	},

	sourceReduction: controlActionConfig('source_reductions', 'source_reduction', 'source reduction'),
	outreachAction: controlActionConfig('outreach_actions', 'outreach_action', 'outreach action'),
	biocontrolAction: controlActionConfig(
		'biocontrol_actions',
		'biocontrol_action',
		'biocontrol action',
	),

	/**
	 * A contact is a person, and the records naming them are the reason the
	 * agency has their details at all. Delete refuses while any survive rather
	 * than leaving requests and notification lists pointing at nobody.
	 */
	contact: {
		table: 'contacts',
		singular: 'contact',
		rules: [
			blocks(
				'contactServiceRequests',
				'service_requests',
				'contact_id',
				'service request',
				'service requests',
			),
			blocks(
				'contactNotificationRegistrations',
				'notification_registrations',
				'contact_id',
				'notification registration',
				'notification registrations',
			),
			blocks(
				'contactMissionNotifications',
				'mission_notifications',
				'contact_id',
				'sent notification',
				'sent notifications',
			),
			cascadesSupport('contactComments', 'comments', 'contact', 'comment', 'comments'),
			cascadesSupport('contactTags', 'tag_items', 'contact', 'tag', 'tags'),
		],
	},

	serviceRequest: {
		table: 'service_requests',
		singular: 'service request',
		rules: [
			cascadesSupport(
				'serviceRequestComments',
				'comments',
				'service_request',
				'comment',
				'comments',
			),
			cascadesSupport('serviceRequestTags', 'tag_items', 'service_request', 'tag', 'tags'),
			cascadesSupport(
				'serviceRequestAssignmentItems',
				'assignment_items',
				'service_request',
				'assignment stop',
				'assignment stops',
			),
		],
	},

	/** Deleting the shared route leaves the assignments cut from it alone. */
	route: {
		table: 'routes',
		singular: 'route',
		rules: [
			cascades('routeItems', 'route_items', 'route_id', 'stop', 'stops'),
			cascadesSupport('routeComments', 'comments', 'route', 'comment', 'comments'),
		],
	},

	assignment: {
		table: 'assignments',
		singular: 'assignment',
		rules: [
			cascades('assignmentItems', 'assignment_items', 'assignment_id', 'stop', 'stops'),
			cascadesSupport('assignmentComments', 'comments', 'assignment', 'comment', 'comments'),
		],
	},

	/** The request goes; the work done in answer to it stays, unlinked. */
	requestedControlAction: {
		table: 'requested_control_actions',
		singular: 'control request',
		rules: [
			cascadesSupport(
				'controlRequestComments',
				'comments',
				'requested_control_action',
				'comment',
				'comments',
			),
			detaches(
				'controlRequestApplications',
				'applications',
				'requested_control_action_id',
				'chemical application',
				'chemical applications',
			),
			detaches(
				'controlRequestSourceReductions',
				'source_reductions',
				'requested_control_action_id',
				'source reduction',
				'source reductions',
			),
			detaches(
				'controlRequestOutreachActions',
				'outreach_actions',
				'requested_control_action_id',
				'outreach action',
				'outreach actions',
			),
			detaches(
				'controlRequestBiocontrolActions',
				'biocontrol_actions',
				'requested_control_action_id',
				'biocontrol action',
				'biocontrol actions',
			),
			detaches(
				'controlRequestMissionItems',
				'mission_items',
				'requested_control_action_id',
				'mission stop',
				'mission stops',
			),
		],
	},

	mission: {
		table: 'missions',
		singular: 'mission',
		rules: [
			detachesUnderChild(
				'missionItemApplications',
				'applications',
				'mission_item_id',
				ITEMS_OF_MISSION,
				'chemical application',
				'chemical applications',
			),
			detachesUnderChild(
				'missionItemSourceReductions',
				'source_reductions',
				'mission_item_id',
				ITEMS_OF_MISSION,
				'source reduction',
				'source reductions',
			),
			detachesUnderChild(
				'missionItemOutreachActions',
				'outreach_actions',
				'mission_item_id',
				ITEMS_OF_MISSION,
				'outreach action',
				'outreach actions',
			),
			detachesUnderChild(
				'missionItemBiocontrolActions',
				'biocontrol_actions',
				'mission_item_id',
				ITEMS_OF_MISSION,
				'biocontrol action',
				'biocontrol actions',
			),
			cascades('missionItems', 'mission_items', 'mission_id', 'stop', 'stops'),
			cascades(
				'missionNotifications',
				'mission_notifications',
				'mission_id',
				'notification',
				'notifications',
			),
			cascadesSupport('missionComments', 'comments', 'mission', 'comment', 'comments'),
		],
	},
};

const DELETABLE_RECORD_TYPES = Object.keys(DELETABLE_RECORDS) as readonly DeletableRecordType[];

export function isDeletableRecordType(value: string): value is DeletableRecordType {
	return Object.hasOwn(DELETABLE_RECORDS, value);
}

export function deletableRecordTypes(): readonly DeletableRecordType[] {
	return DELETABLE_RECORD_TYPES;
}

/** The domain noun for the record itself, for confirmation copy. */
export function deletableRecordLabel(recordType: DeletableRecordType): string {
	return DELETABLE_RECORDS[recordType].singular;
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

function childIdSelect(child: ChildSet, recordId: string, organizationId: string) {
	return sql`select id from ${sql.table(child.table)}
		where ${sql.ref(child.column)} = ${recordId}
			and organization_id = ${organizationId}
			and deleted_at is null`;
}

function scopeMatch(rule: ReferenceRule, recordId: string, organizationId: string) {
	const scope = rule.scope;
	switch (scope.kind) {
		case 'direct':
			return sql`${sql.ref(scope.column)} = ${recordId}`;
		case 'polymorphic':
			return sql`entity_type = ${scope.entityType} and entity_id = ${recordId}`;
		case 'childColumn':
			return sql`${sql.ref(scope.column)} in (${childIdSelect(scope.child, recordId, organizationId)})`;
		case 'childPolymorphic':
			return sql`entity_type = ${scope.entityType}
				and entity_id in (${childIdSelect(scope.child, recordId, organizationId)})`;
	}
}

/**
 * The column a `detach` rule clears. Both scopes that a detach may use name it
 * directly; the support scopes never detach, because clearing half of an
 * `entity_type`/`entity_id` pair would leave a row pointing nowhere.
 */
function detachColumn(rule: ReferenceRule): string {
	if (rule.scope.kind === 'direct' || rule.scope.kind === 'childColumn') {
		return rule.scope.column;
	}
	throw new Error(`Detach rule ${rule.key} cannot target a polymorphic association.`);
}

/**
 * Child-scoped rules first.
 *
 * They resolve their child set from rows that are still live, so once the
 * children are soft-deleted the subquery finds nothing and the grandchildren
 * survive the delete of their parent. Sorting here rather than trusting the
 * registry's order means a rule added in the wrong place still runs correctly.
 */
function orderRules(rules: readonly ReferenceRule[]): readonly ReferenceRule[] {
	const depth = (rule: ReferenceRule): number =>
		rule.scope.kind === 'childColumn' || rule.scope.kind === 'childPolymorphic' ? 0 : 1;
	return [...rules].sort((left, right) => depth(left) - depth(right));
}

async function recordExists(
	db: DbExecutor,
	config: DeletableRecordConfig,
	recordId: string,
	organizationId: string,
): Promise<boolean> {
	const result = await sql<{ readonly id: string }>`
		select id from ${sql.table(config.table)}
		where id = ${recordId} and organization_id = ${organizationId} and deleted_at is null
		limit 1
	`.execute(db);
	return result.rows.length > 0;
}

/**
 * Every rule's row count in one round-trip.
 *
 * A `union all` of scalar counts rather than a query per rule: an address has
 * fourteen rules, and the detail page asks for this on every open.
 */
async function countRules(
	db: DbExecutor,
	rules: readonly ReferenceRule[],
	recordId: string,
	organizationId: string,
): Promise<ReadonlyMap<string, number>> {
	if (rules.length === 0) {
		return new Map();
	}

	const parts: RawBuilder<unknown>[] = rules.map(
		(rule) => sql`
			select ${rule.key}::text as key, count(*)::text as count
			from ${sql.table(rule.table)}
			where ${scopeMatch(rule, recordId, organizationId)}
				and organization_id = ${organizationId}
				and deleted_at is null
		`,
	);

	const result = await sql<{ readonly key: string; readonly count: string }>`${sql.join(
		parts,
		sql` union all `,
	)}`.execute(db);

	return new Map(result.rows.map((row) => [row.key, Number.parseInt(row.count, 10)]));
}

function toEntries(
	rules: readonly ReferenceRule[],
	counts: ReadonlyMap<string, number>,
	effect: ReferenceEffect,
): DeleteImpactEntry[] {
	return rules
		.filter((rule) => rule.effect === effect)
		.map((rule) => ({
			key: rule.key,
			count: counts.get(rule.key) ?? 0,
			singular: rule.singular,
			plural: rule.plural,
		}))
		.filter((entry) => entry.count > 0);
}

/**
 * What deleting this record would do, without doing it.
 *
 * Answers the detail page's danger zone: the consequences to state up front and
 * the references that refuse the delete. A record the caller cannot see reports
 * `found: false` with nothing else — the same answer as a record that is
 * already gone, because the agency should not learn from this endpoint that
 * another agency's record exists.
 */
export async function readDeleteImpact(
	db: DbExecutor,
	input: {
		readonly recordType: DeletableRecordType;
		readonly recordId: string;
		readonly organizationId: string;
	},
): Promise<DeleteImpact> {
	const config = DELETABLE_RECORDS[input.recordType];
	const empty = {
		recordType: input.recordType,
		recordId: input.recordId,
		blockers: [],
		cascades: [],
		detaches: [],
	} as const;

	if (!(await recordExists(db, config, input.recordId, input.organizationId))) {
		return { ...empty, found: false };
	}

	const counts = await countRules(db, config.rules, input.recordId, input.organizationId);
	return {
		...empty,
		found: true,
		blockers: toEntries(config.rules, counts, 'block'),
		cascades: toEntries(config.rules, counts, 'cascade'),
		detaches: toEntries(config.rules, counts, 'detach'),
	};
}

/**
 * Run the record's delete policy inside the caller's transaction.
 *
 * Call this before soft-deleting the record itself: it refuses the delete when
 * a blocking reference exists, then performs the cascades and detaches. Returns
 * false when there is nothing to delete — a missing, already-deleted, or
 * other-agency record — so the caller's own soft delete stays idempotent
 * instead of the request failing on a repeat.
 *
 * @throws RecordDeleteBlockedError when a `block` rule matched.
 */
export async function applyRecordDeletion(
	trx: Transaction<SimmerDatabase>,
	input: {
		readonly recordType: DeletableRecordType;
		readonly recordId: string;
		readonly organizationId: string;
		readonly actorProfileId: string | null;
	},
): Promise<boolean> {
	const { recordType, recordId, organizationId, actorProfileId } = input;
	const config = DELETABLE_RECORDS[recordType];

	if (!(await recordExists(trx, config, recordId, organizationId))) {
		return false;
	}

	const blocking = config.rules.filter((rule) => rule.effect === 'block');
	if (blocking.length > 0) {
		const counts = await countRules(trx, blocking, recordId, organizationId);
		const blockers = toEntries(blocking, counts, 'block');
		if (blockers.length > 0) {
			throw new RecordDeleteBlockedError(recordType, recordId, blockers);
		}
	}

	for (const rule of orderRules(config.rules.filter((rule) => rule.effect !== 'block'))) {
		const match = scopeMatch(rule, recordId, organizationId);
		const set =
			rule.effect === 'detach'
				? sql`${sql.ref(detachColumn(rule))} = null,
						updated_by_profile_id = ${actorProfileId},
						updated_at = now()`
				: sql`deleted_at = now(),
						deleted_by_profile_id = ${actorProfileId},
						updated_by_profile_id = ${actorProfileId},
						updated_at = now()`;

		await sql`
			update ${sql.table(rule.table)}
			set ${set}
			where ${match} and organization_id = ${organizationId} and deleted_at is null
		`.execute(trx);
	}

	return true;
}

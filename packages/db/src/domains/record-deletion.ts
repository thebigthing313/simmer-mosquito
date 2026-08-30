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
	| 'regionFolder'
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
	| 'mission'
	| 'notificationRegistration'
	// Catalogs. Every catalog rule is a `block`, and that is the decision rather
	// than an omission. The reasoning is in the registry, above `collectionMethod`.
	| 'collectionMethod'
	| 'collectionLure'
	| 'habitatType'
	| 'applicationMethod'
	| 'sourceReductionMethod'
	| 'outreachMethod'
	| 'biocontrolMethod'
	| 'vehicle'
	| 'equipment'
	| 'insecticide'
	| 'insecticideBatch'
	| 'formulation'
	| 'notificationType'
	| 'tag';

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
export type ReferenceScope =
	| { readonly kind: 'direct'; readonly column: string }
	| { readonly kind: 'polymorphic'; readonly entityType: string }
	| { readonly kind: 'childColumn'; readonly child: ChildSet; readonly column: string }
	| { readonly kind: 'childPolymorphic'; readonly child: ChildSet; readonly entityType: string };

/** A record's children, for a rule that reaches a generation below it. */
export interface ChildSet {
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
export type ReferenceEffect = 'block' | 'cascade' | 'detach';

/**
 * The confirmation a consequence rides on.
 *
 * Every name here is a flag the matching delete command already declares, so
 * the registry and the command vocabulary use one spelling. A rule tagged
 * `null` is performed without asking: the record's own support rows, which
 * carry nothing the agency recorded separately.
 */
export type DeleteAcknowledgement =
	| 'acknowledgedActionDetach'
	| 'acknowledgedActualActionDetach'
	| 'acknowledgedAssignmentItemDeletion'
	| 'acknowledgedAssociatedRecordsDeletion'
	| 'acknowledgedBatchDeletion'
	| 'acknowledgedCascadeDelete'
	| 'acknowledgedCrossDomainDetach'
	| 'acknowledgedInspectionDetach'
	| 'acknowledgedMissionDetach'
	| 'acknowledgedMissionItemDeletion'
	| 'acknowledgedNotificationDeletion'
	| 'acknowledgedRegionDetach'
	| 'acknowledgedRouteItemDeletion'
	| 'acknowledgedSpeciesCountDeletion'
	| 'acknowledgedSupportRecordDeletion';

/** What the caller has confirmed, keyed by flag. Absent reads as withheld. */
export type DeleteAcknowledgements = Partial<Record<DeleteAcknowledgement, boolean>>;

interface ReferenceRule {
	/** Stable id for this consequence, so the UI can key and test it. */
	readonly key: string;
	readonly effect: ReferenceEffect;
	readonly table: string;
	readonly scope: ReferenceScope;
	/** Domain noun for the rows, for copy that reads like the rest of the app. */
	readonly singular: string;
	readonly plural: string;
	/**
	 * The flag that has to be confirmed before this consequence happens, or
	 * `null` when it happens unasked.
	 *
	 * Required rather than optional, and that is the point of it. A rule reaches
	 * this registry through one of the shorthands below, and every shorthand
	 * that cascades or detaches takes this argument, so a new consequence cannot
	 * be added without someone deciding whether the agency is asked about it.
	 * `blocks` sets it to `null` itself: a refusal is not a confirmation.
	 */
	readonly acknowledgement: DeleteAcknowledgement | null;
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

/**
 * Thrown by `applyRecordDeletion` when the caller withheld a confirmation the
 * delete needed.
 *
 * `consequences` is the same entry shape `/records/:type/:id/delete-impact`
 * returns, so a client that asked before pressing the button and a client that
 * only finds out from the refusal render the same list. The delete has done
 * nothing at this point: the guard runs before the first cascade.
 */
export class DeleteAcknowledgementRequiredError extends Error {
	readonly recordType: DeletableRecordType;
	readonly recordId: string;
	readonly acknowledgement: DeleteAcknowledgement;
	readonly consequences: readonly DeleteImpactEntry[];

	constructor(
		recordType: DeletableRecordType,
		recordId: string,
		acknowledgement: DeleteAcknowledgement,
		consequences: readonly DeleteImpactEntry[],
	) {
		super(
			`Deleting this ${deletableRecordLabel(recordType)} also affects ${countPhrase(consequences)}.`,
		);
		this.name = 'DeleteAcknowledgementRequiredError';
		this.recordType = recordType;
		this.recordId = recordId;
		this.acknowledgement = acknowledgement;
		this.consequences = consequences;
	}
}

/** "3 inspections and 1 chemical application", for the refusal's sentence. */
export function countPhrase(consequences: readonly DeleteImpactEntry[]): string {
	const parts = consequences.map(
		(entry) => `${entry.count} ${entry.count === 1 ? entry.singular : entry.plural}`,
	);
	if (parts.length <= 1) {
		return parts[0] ?? 'other records';
	}
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Clearance
// ---------------------------------------------------------------------------

/**
 * The confirmations that ride on a write clearing a row set rather than
 * deleting a record.
 *
 * Four writes remove rows without any record being deleted: marking a
 * collection zero-result drops its species counts, changing an application's
 * insecticide drops the batch links that no longer match it, retiring a habitat
 * takes it off its routes, and deleting a weather station destroys its
 * summaries. The question the agency is asked is the delete registry's question
 * — "this many rows go, did you mean that" — but the write is not a delete, so
 * no rule in the registry describes it.
 *
 * They deliberately do not become a fourth `ReferenceEffect`. The registry's
 * entries are read twice, once by `readDeleteImpact` to say what a delete would
 * cost and once by `applyRecordDeletion` to perform it, and a rule no delete
 * ever performs would make that read answer with consequences that never
 * happen. What the two share is the counting and the entry shape, which is what
 * this section exports, so a clearance refusal and a delete refusal reach the
 * client as the same body.
 *
 * The station case is why `match` is the caller's whole `where` clause rather
 * than a scope this module assembles: `weather_summaries` has no `deleted_at`
 * and a nullable `organization_id`, so the filters every registry rule applies
 * would find nothing there.
 */
export type ClearanceAcknowledgement =
	| 'acknowledgedBatchClearance'
	| 'acknowledgedRouteRemoval'
	| 'acknowledgedSpeciesCountsClearance'
	| 'acknowledgedSummaryDeletion';

/** The rows a clearance is about to remove, and the words for them. */
export interface ClearanceRule {
	/** Stable id for this consequence, so the UI can key and test it. */
	readonly key: string;
	readonly table: string;
	/** Domain noun for the rows, for copy that reads like the rest of the app. */
	readonly singular: string;
	readonly plural: string;
	/** The whole `where` clause matching the rows the write removes. */
	readonly match: RawBuilder<unknown>;
}

/**
 * Thrown by `assertClearanceAcknowledged` when the rows are there and the
 * confirmation was withheld.
 *
 * Carries the same `consequences` entries a delete refusal does, so the client
 * renders one list either way. Nothing has been written when this is thrown.
 */
export class ClearanceAcknowledgementRequiredError extends Error {
	readonly acknowledgement: ClearanceAcknowledgement;
	readonly consequences: readonly DeleteImpactEntry[];

	constructor(
		acknowledgement: ClearanceAcknowledgement,
		consequences: readonly DeleteImpactEntry[],
	) {
		super(`This change removes ${countPhrase(consequences)}.`);
		this.name = 'ClearanceAcknowledgementRequiredError';
		this.acknowledgement = acknowledgement;
		this.consequences = consequences;
	}
}

/**
 * Refuse a clearing write whose confirmation was withheld.
 *
 * Call it before the write, inside the same transaction. Nothing to clear means
 * nothing to ask about, so an empty match passes whatever the flag says: a
 * collection with no species counts is marked zero-result without a question.
 *
 * @throws ClearanceAcknowledgementRequiredError when rows matched and
 * `acknowledged` was not true.
 */
export async function assertClearanceAcknowledged(
	db: DbExecutor,
	input: {
		readonly acknowledgement: ClearanceAcknowledgement;
		readonly rule: ClearanceRule;
		/** What the command carried. Anything but `true` is withheld. */
		readonly acknowledged: boolean;
	},
): Promise<void> {
	if (input.acknowledged === true) {
		return;
	}

	const result = await sql<{ readonly count: string }>`
		select count(*)::text as count
		from ${sql.table(input.rule.table)}
		where ${input.rule.match}
	`.execute(db);

	const count = Number.parseInt(result.rows[0]?.count ?? '0', 10);
	if (count === 0) {
		return;
	}

	throw new ClearanceAcknowledgementRequiredError(input.acknowledgement, [
		{
			key: input.rule.key,
			count,
			singular: input.rule.singular,
			plural: input.rule.plural,
		},
	]);
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
	return {
		key,
		effect: 'block',
		table,
		scope: { kind: 'direct', column },
		singular,
		plural,
		acknowledgement: null,
	};
}

function detaches(
	key: string,
	table: string,
	column: string,
	singular: string,
	plural: string,
	acknowledgement: DeleteAcknowledgement | null,
): ReferenceRule {
	return {
		key,
		effect: 'detach',
		table,
		scope: { kind: 'direct', column },
		singular,
		plural,
		acknowledgement,
	};
}

function detachesUnderChild(
	key: string,
	table: string,
	column: string,
	child: ChildSet,
	singular: string,
	plural: string,
	acknowledgement: DeleteAcknowledgement | null,
): ReferenceRule {
	return {
		key,
		effect: 'detach',
		table,
		scope: { kind: 'childColumn', child, column },
		singular,
		plural,
		acknowledgement,
	};
}

function cascades(
	key: string,
	table: string,
	column: string,
	singular: string,
	plural: string,
	acknowledgement: DeleteAcknowledgement | null,
): ReferenceRule {
	return {
		key,
		effect: 'cascade',
		table,
		scope: { kind: 'direct', column },
		singular,
		plural,
		acknowledgement,
	};
}

function cascadesUnderChild(
	key: string,
	table: string,
	column: string,
	child: ChildSet,
	singular: string,
	plural: string,
	acknowledgement: DeleteAcknowledgement | null,
): ReferenceRule {
	return {
		key,
		effect: 'cascade',
		table,
		scope: { kind: 'childColumn', child, column },
		singular,
		plural,
		acknowledgement,
	};
}

/** Support rows attached through `entity_type`/`entity_id`. */
function cascadesSupport(
	key: string,
	table: string,
	entityType: string,
	singular: string,
	plural: string,
	acknowledgement: DeleteAcknowledgement | null,
): ReferenceRule {
	return {
		key,
		effect: 'cascade',
		table,
		scope: { kind: 'polymorphic', entityType },
		singular,
		plural,
		acknowledgement,
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
	acknowledgement: DeleteAcknowledgement | null,
): ReferenceRule {
	return {
		key,
		effect: 'cascade',
		table,
		scope: { kind: 'childPolymorphic', child, entityType },
		singular,
		plural,
		acknowledgement,
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
			cascadesSupport(
				`${entityType}Comments`,
				'comments',
				entityType,
				'comment',
				'comments',
				'acknowledgedSupportRecordDeletion',
			),
			cascadesSupport(
				`${entityType}Personnel`,
				'additional_personnel',
				entityType,
				'assisting person',
				'assisting people',
				'acknowledgedSupportRecordDeletion',
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
			cascadesSupport('addressComments', 'comments', 'address', 'comment', 'comments', null),
			cascadesSupport('addressTags', 'tag_items', 'address', 'tag', 'tags', null),
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
			cascadesSupport('regionComments', 'comments', 'region', 'comment', 'comments', null),
			cascadesSupport('regionTags', 'tag_items', 'region', 'tag', 'tags', null),
		],
	},

	/**
	 * A folder is filing, so deleting one unfiles its regions rather than taking
	 * them with it. The regions are the agency's map; the folder is where they
	 * were kept.
	 *
	 * Before this entry the delete soft-deleted the folder row alone, and every
	 * region in it kept a `region_folder_id` pointing at a row that was gone.
	 */
	regionFolder: {
		table: 'region_folders',
		singular: 'region folder',
		rules: [
			detaches(
				'folderRegions',
				'regions',
				'region_folder_id',
				'region',
				'regions',
				'acknowledgedRegionDetach',
			),
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
				'acknowledgedCascadeDelete',
			),
			cascadesSupportUnderChild(
				'trapCollectionComments',
				'comments',
				'collection',
				COLLECTIONS_OF_TRAP,
				'collection comment',
				'collection comments',
				'acknowledgedCascadeDelete',
			),
			cascadesSupportUnderChild(
				'trapCollectionPersonnel',
				'additional_personnel',
				'collection',
				COLLECTIONS_OF_TRAP,
				'assisting person',
				'assisting people',
				'acknowledgedCascadeDelete',
			),
			detachesUnderChild(
				'trapCollectionApplications',
				'applications',
				'collection_id',
				COLLECTIONS_OF_TRAP,
				'chemical application',
				'chemical applications',
				'acknowledgedCascadeDelete',
			),
			detachesUnderChild(
				'trapCollectionControlRequests',
				'requested_control_actions',
				'collection_id',
				COLLECTIONS_OF_TRAP,
				'control request',
				'control requests',
				'acknowledgedCascadeDelete',
			),
			cascades(
				'trapCollections',
				'collections',
				'trap_id',
				'collection',
				'collections',
				'acknowledgedCascadeDelete',
			),
			cascadesSupport(
				'trapComments',
				'comments',
				'trap',
				'comment',
				'comments',
				'acknowledgedCascadeDelete',
			),
			cascadesSupport('trapTags', 'tag_items', 'trap', 'tag', 'tags', 'acknowledgedCascadeDelete'),
			cascadesSupport(
				'trapRouteItems',
				'route_items',
				'trap',
				'route stop',
				'route stops',
				'acknowledgedCascadeDelete',
			),
			cascadesSupport(
				'trapAssignmentItems',
				'assignment_items',
				'trap',
				'assignment stop',
				'assignment stops',
				'acknowledgedCascadeDelete',
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
				'acknowledgedSpeciesCountDeletion',
			),
			cascadesSupport('collectionComments', 'comments', 'collection', 'comment', 'comments', null),
			cascadesSupport(
				'collectionPersonnel',
				'additional_personnel',
				'collection',
				'assisting person',
				'assisting people',
				null,
			),
			detaches(
				'collectionApplications',
				'applications',
				'collection_id',
				'chemical application',
				'chemical applications',
				null,
			),
			detaches(
				'collectionControlRequests',
				'requested_control_actions',
				'collection_id',
				'control request',
				'control requests',
				null,
			),
		],
	},

	/**
	 * Deleting a habitat is for catalog records that should never have existed;
	 * retiring is the lifecycle move. Its inspections are real observations, so
	 * they survive as ad hoc records with their snapshot geometry, type, and
	 * address intact — only the habitat link goes.
	 *
	 * Its route stops and assignment stops go with it, unasked. A stop is a
	 * place on a list to visit, not a record of a visit, so a habitat that
	 * should never have existed takes its stops with it and there is nothing to
	 * confirm. `acknowledgedRouteRemoval` is retire's question, not delete's.
	 */
	habitat: {
		table: 'habitats',
		singular: 'habitat',
		rules: [
			cascadesSupport('habitatComments', 'comments', 'habitat', 'comment', 'comments', null),
			cascadesSupport('habitatTags', 'tag_items', 'habitat', 'tag', 'tags', null),
			cascadesSupport(
				'habitatRouteItems',
				'route_items',
				'habitat',
				'route stop',
				'route stops',
				null,
			),
			cascadesSupport(
				'habitatAssignmentItems',
				'assignment_items',
				'habitat',
				'assignment stop',
				'assignment stops',
				null,
			),
			detaches(
				'habitatInspections',
				'inspections',
				'habitat_id',
				'inspection',
				'inspections',
				'acknowledgedInspectionDetach',
			),
			detaches(
				'habitatApplications',
				'applications',
				'habitat_id',
				'chemical application',
				'chemical applications',
				'acknowledgedCrossDomainDetach',
			),
			detaches(
				'habitatSourceReductions',
				'source_reductions',
				'habitat_id',
				'source reduction',
				'source reductions',
				'acknowledgedCrossDomainDetach',
			),
			detaches(
				'habitatBiocontrolActions',
				'biocontrol_actions',
				'habitat_id',
				'biocontrol action',
				'biocontrol actions',
				'acknowledgedCrossDomainDetach',
			),
			detaches(
				'habitatControlRequests',
				'requested_control_actions',
				'habitat_id',
				'control request',
				'control requests',
				'acknowledgedCrossDomainDetach',
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
				'acknowledgedAssociatedRecordsDeletion',
			),
			cascadesSupportUnderChild(
				'inspectionSampleComments',
				'comments',
				'sample',
				SAMPLES_OF_INSPECTION,
				'sample comment',
				'sample comments',
				'acknowledgedAssociatedRecordsDeletion',
			),
			cascades(
				'inspectionSamples',
				'samples',
				'inspection_id',
				'sample',
				'samples',
				'acknowledgedAssociatedRecordsDeletion',
			),
			cascadesSupport(
				'inspectionComments',
				'comments',
				'inspection',
				'comment',
				'comments',
				'acknowledgedAssociatedRecordsDeletion',
			),
			cascadesSupport(
				'inspectionPersonnel',
				'additional_personnel',
				'inspection',
				'assisting person',
				'assisting people',
				'acknowledgedAssociatedRecordsDeletion',
			),
			detaches(
				'inspectionApplications',
				'applications',
				'inspection_id',
				'chemical application',
				'chemical applications',
				'acknowledgedCrossDomainDetach',
			),
			detaches(
				'inspectionSourceReductions',
				'source_reductions',
				'inspection_id',
				'source reduction',
				'source reductions',
				'acknowledgedCrossDomainDetach',
			),
			detaches(
				'inspectionOutreachActions',
				'outreach_actions',
				'inspection_id',
				'outreach action',
				'outreach actions',
				'acknowledgedCrossDomainDetach',
			),
			detaches(
				'inspectionBiocontrolActions',
				'biocontrol_actions',
				'inspection_id',
				'biocontrol action',
				'biocontrol actions',
				'acknowledgedCrossDomainDetach',
			),
			detaches(
				'inspectionControlRequests',
				'requested_control_actions',
				'inspection_id',
				'control request',
				'control requests',
				'acknowledgedCrossDomainDetach',
			),
		],
	},

	sample: {
		table: 'samples',
		singular: 'sample',
		rules: [
			cascades(
				'sampleSpecies',
				'sample_species',
				'sample_id',
				'species count',
				'species counts',
				'acknowledgedAssociatedRecordsDeletion',
			),
			cascadesSupport(
				'sampleComments',
				'comments',
				'sample',
				'comment',
				'comments',
				'acknowledgedAssociatedRecordsDeletion',
			),
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
				'acknowledgedBatchDeletion',
			),
			cascadesSupport(
				'applicationComments',
				'comments',
				'application',
				'comment',
				'comments',
				'acknowledgedSupportRecordDeletion',
			),
			cascadesSupport(
				'applicationPersonnel',
				'additional_personnel',
				'application',
				'assisting person',
				'assisting people',
				'acknowledgedSupportRecordDeletion',
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
			cascadesSupport('contactComments', 'comments', 'contact', 'comment', 'comments', null),
			cascadesSupport('contactTags', 'tag_items', 'contact', 'tag', 'tags', null),
		],
	},

	/**
	 * A registration is a promise to warn somebody before a mission runs near
	 * them, and a mission notification is a record of having kept it.
	 *
	 * The block is the same policy the merge registry reads the other way round:
	 * `mission_notifications` is not re-pointed on a contact merge because those
	 * rows snapshot who was told, and a row that snapshots something cannot have
	 * the thing it names deleted out from under it. Without the rule the delete
	 * went through and left every notification naming a retired registration,
	 * with the foreign key still satisfied and nothing to read (#322).
	 *
	 * The subscriptions go with it, unasked: `notification_registration_types` is
	 * the link between this registration and the types it wanted, so it records
	 * nothing on its own.
	 */
	notificationRegistration: {
		table: 'notification_registrations',
		singular: 'notification registration',
		rules: [
			blocks(
				'registrationMissionNotifications',
				'mission_notifications',
				'notification_registration_id',
				'sent notification',
				'sent notifications',
			),
			cascades(
				'registrationSubscriptions',
				'notification_registration_types',
				'notification_registration_id',
				'notification type subscription',
				'notification type subscriptions',
				null,
			),
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
				null,
			),
			cascadesSupport('serviceRequestTags', 'tag_items', 'service_request', 'tag', 'tags', null),
			cascadesSupport(
				'serviceRequestAssignmentItems',
				'assignment_items',
				'service_request',
				'assignment stop',
				'assignment stops',
				'acknowledgedAssignmentItemDeletion',
			),
		],
	},

	/** Deleting the shared route leaves the assignments cut from it alone. */
	route: {
		table: 'routes',
		singular: 'route',
		rules: [
			cascades(
				'routeItems',
				'route_items',
				'route_id',
				'stop',
				'stops',
				'acknowledgedRouteItemDeletion',
			),
			cascadesSupport('routeComments', 'comments', 'route', 'comment', 'comments', null),
		],
	},

	assignment: {
		table: 'assignments',
		singular: 'assignment',
		rules: [
			cascades(
				'assignmentItems',
				'assignment_items',
				'assignment_id',
				'stop',
				'stops',
				'acknowledgedAssignmentItemDeletion',
			),
			cascadesSupport('assignmentComments', 'comments', 'assignment', 'comment', 'comments', null),
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
				null,
			),
			detaches(
				'controlRequestApplications',
				'applications',
				'requested_control_action_id',
				'chemical application',
				'chemical applications',
				'acknowledgedActionDetach',
			),
			detaches(
				'controlRequestSourceReductions',
				'source_reductions',
				'requested_control_action_id',
				'source reduction',
				'source reductions',
				'acknowledgedActionDetach',
			),
			detaches(
				'controlRequestOutreachActions',
				'outreach_actions',
				'requested_control_action_id',
				'outreach action',
				'outreach actions',
				'acknowledgedActionDetach',
			),
			detaches(
				'controlRequestBiocontrolActions',
				'biocontrol_actions',
				'requested_control_action_id',
				'biocontrol action',
				'biocontrol actions',
				'acknowledgedActionDetach',
			),
			detaches(
				'controlRequestMissionItems',
				'mission_items',
				'requested_control_action_id',
				'mission stop',
				'mission stops',
				'acknowledgedMissionDetach',
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
				'acknowledgedActualActionDetach',
			),
			detachesUnderChild(
				'missionItemSourceReductions',
				'source_reductions',
				'mission_item_id',
				ITEMS_OF_MISSION,
				'source reduction',
				'source reductions',
				'acknowledgedActualActionDetach',
			),
			detachesUnderChild(
				'missionItemOutreachActions',
				'outreach_actions',
				'mission_item_id',
				ITEMS_OF_MISSION,
				'outreach action',
				'outreach actions',
				'acknowledgedActualActionDetach',
			),
			detachesUnderChild(
				'missionItemBiocontrolActions',
				'biocontrol_actions',
				'mission_item_id',
				ITEMS_OF_MISSION,
				'biocontrol action',
				'biocontrol actions',
				'acknowledgedActualActionDetach',
			),
			cascades(
				'missionItems',
				'mission_items',
				'mission_id',
				'stop',
				'stops',
				'acknowledgedMissionItemDeletion',
			),
			cascades(
				'missionNotifications',
				'mission_notifications',
				'mission_id',
				'notification',
				'notifications',
				'acknowledgedNotificationDeletion',
			),
			cascadesSupport('missionComments', 'comments', 'mission', 'comment', 'comments', null),
		],
	},

	// -------------------------------------------------------------------------
	// Catalogs
	//
	// Every catalog rule is a `block`, and none of them cascades or detaches.
	// That is the decision, not an omission.
	//
	// Delete means the record should never have existed. Deactivate means it
	// should not be referred to from now on, and it leaves existing records
	// alone. So a catalog row with any live referrer cannot be deleted: the
	// referrer is proof it did exist and was used, and the agency wanted
	// Deactivate. A mistake made minutes ago has no referrers and deletes fine.
	//
	// The block reaches catalog children too. An Insecticide with a Batch needs
	// the Batch deleted first, in the Batch's own drawer. The alternative was to
	// cascade into children that are themselves unreferenced, and that fails in
	// a way the user cannot read: they press Delete on the Insecticide, it
	// refuses, and nothing tells them whether the Insecticide or something under
	// a Batch stopped it. One row per refusal is worth the second click.
	//
	// The registry cannot express the same rule for the three operator-global
	// catalogs (Unit, Genus, Species), because every query here scopes by
	// `organization_id` and those rows have none. Their block counts across
	// every agency and lives with the operator commands.
	// -------------------------------------------------------------------------

	collectionMethod: {
		table: 'collection_methods',
		singular: 'collection method',
		rules: [
			blocks('collectionMethodTraps', 'traps', 'collection_method_id', 'trap', 'traps'),
			blocks(
				'collectionMethodCollections',
				'collections',
				'collection_method_id',
				'collection',
				'collections',
			),
		],
	},

	collectionLure: {
		table: 'collection_lures',
		singular: 'lure',
		rules: [
			blocks('collectionLureTraps', 'traps', 'collection_lure_id', 'trap', 'traps'),
			blocks(
				'collectionLureCollections',
				'collections',
				'collection_lure_id',
				'collection',
				'collections',
			),
		],
	},

	habitatType: {
		table: 'habitat_types',
		singular: 'habitat type',
		rules: [
			blocks('habitatTypeHabitats', 'habitats', 'habitat_type_id', 'habitat', 'habitats'),
			blocks(
				'habitatTypeInspections',
				'inspections',
				'habitat_type_id',
				'inspection',
				'inspections',
			),
		],
	},

	applicationMethod: {
		table: 'application_methods',
		singular: 'application method',
		rules: [
			blocks(
				'applicationMethodApplications',
				'applications',
				'application_method_id',
				'chemical application',
				'chemical applications',
			),
		],
	},

	sourceReductionMethod: {
		table: 'source_reduction_methods',
		singular: 'source reduction method',
		rules: [
			blocks(
				'sourceReductionMethodActions',
				'source_reductions',
				'source_reduction_method_id',
				'source reduction',
				'source reductions',
			),
		],
	},

	outreachMethod: {
		table: 'outreach_methods',
		singular: 'outreach method',
		rules: [
			blocks(
				'outreachMethodActions',
				'outreach_actions',
				'outreach_method_id',
				'outreach action',
				'outreach actions',
			),
		],
	},

	biocontrolMethod: {
		table: 'biocontrol_methods',
		singular: 'biocontrol method',
		rules: [
			blocks(
				'biocontrolMethodActions',
				'biocontrol_actions',
				'biocontrol_method_id',
				'biocontrol action',
				'biocontrol actions',
			),
		],
	},

	vehicle: {
		table: 'vehicles',
		singular: 'vehicle',
		rules: [
			blocks(
				'vehicleApplications',
				'applications',
				'vehicle_id',
				'chemical application',
				'chemical applications',
			),
		],
	},

	equipment: {
		table: 'equipment',
		singular: 'equipment record',
		rules: [
			blocks(
				'equipmentApplications',
				'applications',
				'equipment_id',
				'chemical application',
				'chemical applications',
			),
		],
	},

	insecticide: {
		table: 'insecticides',
		singular: 'insecticide',
		rules: [
			blocks('insecticideBatches', 'insecticide_batches', 'insecticide_id', 'batch', 'batches'),
			blocks(
				'insecticideFormulations',
				'formulation_insecticides',
				'insecticide_id',
				'formulation',
				'formulations',
			),
			blocks(
				'insecticideApplications',
				'applications',
				'insecticide_id',
				'chemical application',
				'chemical applications',
			),
		],
	},

	insecticideBatch: {
		table: 'insecticide_batches',
		singular: 'batch',
		rules: [
			blocks(
				'insecticideBatchApplications',
				'application_batches',
				'insecticide_batch_id',
				'chemical application',
				'chemical applications',
			),
		],
	},

	/**
	 * A Formulation blocks on its own ingredient rows, which reads heavier than
	 * the rest: the ingredients belong to the Formulation and the schema even
	 * cascades them. The rule holds anyway, because a Formulation that lists
	 * insecticides is one somebody built rather than one typed by mistake, and
	 * the ingredient rows are removable from the Formulation's own editor.
	 */
	formulation: {
		table: 'formulations',
		singular: 'formulation',
		rules: [
			blocks(
				'formulationInsecticides',
				'formulation_insecticides',
				'formulation_id',
				'ingredient',
				'ingredients',
			),
		],
	},

	notificationType: {
		table: 'notification_types',
		singular: 'notification type',
		rules: [
			blocks(
				'notificationTypeRegistrations',
				'notification_registration_types',
				'notification_type_id',
				'notification registration',
				'notification registrations',
			),
			blocks(
				'notificationTypeMissionNotifications',
				'mission_notifications',
				'notification_type_id',
				'sent notification',
				'sent notifications',
			),
			blocks('notificationTypeMissions', 'missions', 'notification_type_id', 'mission', 'missions'),
		],
	},

	tag: {
		table: 'tags',
		singular: 'tag',
		rules: [blocks('tagItems', 'tag_items', 'tag_id', 'tagged record', 'tagged records')],
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

/** The table a record type lives in, for a caller that needs to query it. */
export function deletableRecordTable(recordType: DeletableRecordType): string {
	return DELETABLE_RECORDS[recordType].table;
}

/**
 * The registry as data, without the SQL or the copy.
 *
 * `record-merge.ts` holds a second policy over the same referencing tables, and
 * the two have to cover the same ground: a table that gains an `address_id` is a
 * gap in both. Exporting the scopes lets a test compare them, which is cheaper
 * than trusting two hand-written lists to stay in step.
 */
export function deleteReferenceScopes(recordType: DeletableRecordType): readonly {
	readonly key: string;
	readonly table: string;
	readonly effect: ReferenceEffect;
	readonly scope: ReferenceScope;
	readonly acknowledgement: DeleteAcknowledgement | null;
}[] {
	return DELETABLE_RECORDS[recordType].rules.map((rule) => ({
		key: rule.key,
		table: rule.table,
		effect: rule.effect,
		scope: rule.scope,
		acknowledgement: rule.acknowledgement,
	}));
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

/**
 * A row set that already reads under the record's current label.
 *
 * Same fields a `ClearanceRule` carries, and deliberately so: both are "count
 * these rows and say what they are", and both end up in a `DeleteImpactEntry`.
 * They stay separate types because a clearance's rows are about to disappear
 * and a citation's are about to be re-read, and a caller that confused the two
 * would tell the agency its history was being deleted.
 *
 * `match` is the whole `where` clause, including the tenancy and soft-delete
 * filters, because the tables outside the registry — `weather_summaries`, the
 * global taxonomy — do not have the columns the registry's filters assume.
 */
export interface CitingRule {
	/** Stable id for this consequence, so the UI can key and test it. */
	readonly key: string;
	readonly table: string;
	/** Domain noun for the rows, for copy that reads like the rest of the app. */
	readonly singular: string;
	readonly plural: string;
	readonly match: RawBuilder<unknown>;
}

/**
 * The rows that cite a record by name, read out of the delete registry.
 *
 * A label change and a delete ask about the same tables. The registry already
 * enumerates, for every deletable record, which other tables name it and what
 * to call those rows, so reading the citations back out of it is what stops a
 * second map drifting from the first — the same argument `deleteReferenceScopes`
 * makes for the merge policy.
 *
 * **The default is every `direct` scope.** A citation is a row whose own column
 * names this record. The polymorphic rules are the record's comments, tags,
 * personnel and stops, which hang off it rather than reading under its label,
 * and the child scopes reach a generation past the row that does the naming: a
 * trap's collections read under the trap's code, their species counts read
 * under the collection's. Counting either by default would put rows in the
 * sentence that a rename does not touch.
 *
 * `only` names the rules to use instead, for a flag whose question is narrower
 * or differently shaped than "everything that names this row" — a notification
 * type's live subscriptions rather than everything that ever cited it, or the
 * stops worked against a service request, which nothing names by column. A
 * named rule is taken whatever its scope, except a child scope, which is never
 * a citation of this record.
 */
export function citingRules(
	recordType: DeletableRecordType,
	recordId: string,
	organizationId: string,
	only?: readonly string[],
): readonly CitingRule[] {
	return DELETABLE_RECORDS[recordType].rules
		.filter((rule) => (only === undefined ? rule.scope.kind === 'direct' : only.includes(rule.key)))
		.filter((rule) => rule.scope.kind !== 'childColumn' && rule.scope.kind !== 'childPolymorphic')
		.map((rule) => ({
			key: rule.key,
			table: rule.table,
			singular: rule.singular,
			plural: rule.plural,
			match: sql`${scopeMatch(rule, recordId, organizationId)}
				and organization_id = ${organizationId}
				and deleted_at is null`,
		}));
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
 * Refuse the delete if anything live still refers to the record.
 *
 * The whole of a catalog's policy, since every catalog rule blocks and none
 * cascades or detaches: there is nothing to write, only something to refuse. It
 * takes a `DbExecutor` rather than a `Transaction` for that reason, which is
 * what lets the lookup and tag writers in this package call it without being
 * retyped.
 *
 * `applyRecordDeletion` calls this rather than repeating it, so the two cannot
 * come to disagree about what blocks.
 *
 * @throws RecordDeleteBlockedError when a `block` rule matched.
 */
export async function assertRecordDeletable(
	db: DbExecutor,
	input: {
		readonly recordType: DeletableRecordType;
		readonly recordId: string;
		readonly organizationId: string;
	},
): Promise<void> {
	const { recordType, recordId, organizationId } = input;
	const blocking = DELETABLE_RECORDS[recordType].rules.filter((rule) => rule.effect === 'block');
	if (blocking.length === 0) {
		return;
	}

	const counts = await countRules(db, blocking, recordId, organizationId);
	const blockers = toEntries(blocking, counts, 'block');
	if (blockers.length > 0) {
		throw new RecordDeleteBlockedError(recordType, recordId, blockers);
	}
}

/**
 * Refuse the delete when a confirmation it needed was withheld.
 *
 * The counting half already existed: `readDeleteImpact` walks the same rules to
 * tell the detail page what a delete would take with it. What was missing was
 * anyone asking. Fifty-nine `acknowledged*` flags were declared on command
 * payloads, normalized by the domain builders, carried into the write, and read
 * by nothing, so a client that withheld one got its record deleted anyway.
 *
 * One flag at a time, in registry order, because a form can only ask one
 * question at a time and the first consequence is the one to name. The
 * remaining questions arrive on the next attempt.
 *
 * A rule whose acknowledgement is `null` is never counted here. Nothing about
 * it is refusable: it is the record's own comments and tags going with it.
 *
 * @throws DeleteAcknowledgementRequiredError when a covered rule matched rows
 * and its flag was not `true`.
 */
async function assertDeleteAcknowledged(
	db: DbExecutor,
	input: {
		readonly recordType: DeletableRecordType;
		readonly recordId: string;
		readonly organizationId: string;
		readonly acknowledged: DeleteAcknowledgements;
	},
): Promise<void> {
	const { recordType, recordId, organizationId, acknowledged } = input;
	const withheld = DELETABLE_RECORDS[recordType].rules.filter(
		(rule) =>
			rule.effect !== 'block' &&
			rule.acknowledgement !== null &&
			acknowledged[rule.acknowledgement] !== true,
	);
	if (withheld.length === 0) {
		return;
	}

	const counts = await countRules(db, withheld, recordId, organizationId);
	for (const flag of orderedAcknowledgements(withheld)) {
		const covered = withheld.filter((rule) => rule.acknowledgement === flag);
		const consequences = [
			...toEntries(covered, counts, 'cascade'),
			...toEntries(covered, counts, 'detach'),
		];
		if (consequences.length > 0) {
			throw new DeleteAcknowledgementRequiredError(recordType, recordId, flag, consequences);
		}
	}
}

/** The distinct flags across these rules, keeping the registry's order. */
function orderedAcknowledgements(rules: readonly ReferenceRule[]): DeleteAcknowledgement[] {
	const seen: DeleteAcknowledgement[] = [];
	for (const rule of rules) {
		if (rule.acknowledgement !== null && !seen.includes(rule.acknowledgement)) {
			seen.push(rule.acknowledgement);
		}
	}
	return seen;
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
 * Both refusals happen before anything is written, so a delete that comes back
 * refused has changed nothing.
 *
 * @throws RecordDeleteBlockedError when a `block` rule matched.
 * @throws DeleteAcknowledgementRequiredError when a cascade or detach the
 * caller did not confirm matched rows.
 */
export async function applyRecordDeletion(
	trx: Transaction<SimmerDatabase>,
	input: {
		readonly recordType: DeletableRecordType;
		readonly recordId: string;
		readonly organizationId: string;
		readonly actorProfileId: string | null;
		/**
		 * The confirmations the command carried, straight from its payload.
		 *
		 * Required, so that adding a delete writer means answering this. A flag
		 * left out is withheld, and the delete is refused the moment the rules it
		 * covers match anything.
		 */
		readonly acknowledged: DeleteAcknowledgements;
	},
): Promise<boolean> {
	const { recordType, recordId, organizationId, actorProfileId } = input;
	const config = DELETABLE_RECORDS[recordType];

	if (!(await recordExists(trx, config, recordId, organizationId))) {
		return false;
	}

	await assertRecordDeletable(trx, { recordType, recordId, organizationId });
	await assertDeleteAcknowledged(trx, {
		recordType,
		recordId,
		organizationId,
		acknowledged: input.acknowledged,
	});

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

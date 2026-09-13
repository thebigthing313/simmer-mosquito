import type { CommentTargetType } from '@simmer-mosquito/domain';

/**
 * Record types with a web surface that the comment vocabulary does not carry.
 *
 * `CommentTargetType` is the domain's own list of the things a person can talk
 * about, which is nearly every record with a page. These three have a page and
 * no comment box: a weather station, a mission item and a notification
 * registration. They are widened in here rather than pushed into the domain,
 * because nothing in the domain wants them as comment targets and a vocabulary
 * that grows to suit a label is no longer the domain's.
 */
type ExtraRecordType = 'weatherStation' | 'missionItem' | 'notificationRegistration';

/**
 * Every record type this app names on screen, in the camelCase domain
 * vocabulary.
 *
 * Keyed off `CommentTargetType` rather than restated, so a record type the
 * domain adds arrives here as a missing key that `tsc` names, and one it drops
 * arrives as an entry with nowhere to go.
 */
export type RecordType = CommentTargetType | ExtraRecordType;

/** What a record type is called, in the three shapes a screen asks for. */
export interface RecordNoun {
	/** Lowercase, as it reads mid-sentence: `This trap has no location`. */
	readonly one: string;
	/** Lowercase plural, for a count: `3 service requests`. */
	readonly many: string;
	/** Title case, for a heading: `Request for Control Unavailable`. */
	readonly title: string;
}

/**
 * The one register of what each record type is called on screen.
 *
 * Six components used to take a free-text noun and every route spelled it at
 * each call site, so one record type carried as many spellings as it had call
 * sites. Seven of them disagreed with themselves: a chemical application was an
 * `application` in its result count and a `chemical application` in its
 * heading, a biocontrol action counted `releases`, an outreach action counted
 * `actions`, a weather station counted `stations`, and a request for control
 * and a service request both counted plain `requests`, which is the same word
 * for two different records on two surfaces a person moves between.
 *
 * The components take a `recordType` and look the noun up, so the compiler
 * holds membership and `pnpm check:record-nouns` only has to refuse the noun
 * being written out again somewhere else.
 *
 * The spellings follow `CONTEXT.md`'s terms, lowercased. The one that departs
 * is `requestedControlAction`, whose term is **Requested Control Action** and
 * whose display form is `request for control`; `CONTEXT.md` carries the note
 * saying so, under Ambiguities to preserve.
 *
 * `title` is a field rather than a rule because title-casing a noun is not a
 * rule: word by word it gives `Request For Control`, and the preposition is
 * lowercase in English.
 *
 * Module private, reached through {@link recordNoun}. One accessor is what
 * makes a missing entry impossible to write, and `check:record-nouns` reads the
 * declaration out of this source rather than importing it.
 */
const RECORD_NOUNS: Record<RecordType, RecordNoun> = {
	address: { one: 'address', many: 'addresses', title: 'Address' },
	application: {
		one: 'chemical application',
		many: 'chemical applications',
		title: 'Chemical Application',
	},
	assignment: { one: 'assignment', many: 'assignments', title: 'Assignment' },
	biocontrolAction: {
		one: 'biocontrol action',
		many: 'biocontrol actions',
		title: 'Biocontrol Action',
	},
	collection: { one: 'collection', many: 'collections', title: 'Collection' },
	contact: { one: 'contact', many: 'contacts', title: 'Contact' },
	habitat: { one: 'habitat', many: 'habitats', title: 'Habitat' },
	inspection: { one: 'inspection', many: 'inspections', title: 'Inspection' },
	mission: { one: 'mission', many: 'missions', title: 'Mission' },
	missionItem: { one: 'mission item', many: 'mission items', title: 'Mission Item' },
	notificationRegistration: {
		one: 'registration',
		many: 'registrations',
		title: 'Registration',
	},
	outreachAction: { one: 'outreach action', many: 'outreach actions', title: 'Outreach Action' },
	region: { one: 'region', many: 'regions', title: 'Region' },
	requestedControlAction: {
		one: 'request for control',
		many: 'requests for control',
		title: 'Request for Control',
	},
	route: { one: 'route', many: 'routes', title: 'Route' },
	sample: { one: 'sample', many: 'samples', title: 'Sample' },
	serviceRequest: { one: 'service request', many: 'service requests', title: 'Service Request' },
	sourceReduction: {
		one: 'source reduction',
		many: 'source reductions',
		title: 'Source Reduction',
	},
	trap: { one: 'trap', many: 'traps', title: 'Trap' },
	weatherStation: { one: 'weather station', many: 'weather stations', title: 'Weather Station' },
};

/** What this record type is called. */
export function recordNoun(recordType: RecordType): RecordNoun {
	return RECORD_NOUNS[recordType];
}

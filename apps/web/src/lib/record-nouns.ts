import type { CommentTargetType } from '@simmer-mosquito/domain';
import { countPhrase } from './format-count';

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

/** What a record type is called, in the four shapes a screen asks for. */
export interface RecordNoun {
	/** Lowercase, as it reads mid-sentence: `This trap has no location`. */
	readonly one: string;
	/** Lowercase plural, for a count: `3 service requests`. */
	readonly many: string;
	/** Title case, for a heading: `Request for Control Unavailable`. */
	readonly title: string;
	/** Title case plural, for a heading over a list: `Requests for Control`. */
	readonly titleMany: string;
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
 * `titleMany` is stored for both of those reasons at once, and neither of the
 * two forms beside it will produce it. `title` plus an `s` is the
 * pluralization rule this module refuses on the way in, and title-casing
 * `many` word by word gives `Requests For Control` again. It is named for
 * `title` rather than for `many` because it is the title form first and plural
 * second, which is also what puts it beside `title` when the four are read in
 * order.
 *
 * Module private, reached through {@link recordNoun}. One accessor is what
 * makes a missing entry impossible to write, and `check:record-nouns` reads the
 * declaration out of this source rather than importing it.
 */
const RECORD_NOUNS: Record<RecordType, RecordNoun> = {
	address: { one: 'address', many: 'addresses', title: 'Address', titleMany: 'Addresses' },
	application: {
		one: 'chemical application',
		many: 'chemical applications',
		title: 'Chemical Application',
		titleMany: 'Chemical Applications',
	},
	assignment: {
		one: 'assignment',
		many: 'assignments',
		title: 'Assignment',
		titleMany: 'Assignments',
	},
	biocontrolAction: {
		one: 'biocontrol action',
		many: 'biocontrol actions',
		title: 'Biocontrol Action',
		titleMany: 'Biocontrol Actions',
	},
	collection: {
		one: 'collection',
		many: 'collections',
		title: 'Collection',
		titleMany: 'Collections',
	},
	contact: { one: 'contact', many: 'contacts', title: 'Contact', titleMany: 'Contacts' },
	habitat: { one: 'habitat', many: 'habitats', title: 'Habitat', titleMany: 'Habitats' },
	inspection: {
		one: 'inspection',
		many: 'inspections',
		title: 'Inspection',
		titleMany: 'Inspections',
	},
	mission: { one: 'mission', many: 'missions', title: 'Mission', titleMany: 'Missions' },
	missionItem: {
		one: 'mission item',
		many: 'mission items',
		title: 'Mission Item',
		titleMany: 'Mission Items',
	},
	notificationRegistration: {
		one: 'registration',
		many: 'registrations',
		title: 'Registration',
		titleMany: 'Registrations',
	},
	outreachAction: {
		one: 'outreach action',
		many: 'outreach actions',
		title: 'Outreach Action',
		titleMany: 'Outreach Actions',
	},
	region: { one: 'region', many: 'regions', title: 'Region', titleMany: 'Regions' },
	requestedControlAction: {
		one: 'request for control',
		many: 'requests for control',
		title: 'Request for Control',
		titleMany: 'Requests for Control',
	},
	route: { one: 'route', many: 'routes', title: 'Route', titleMany: 'Routes' },
	sample: { one: 'sample', many: 'samples', title: 'Sample', titleMany: 'Samples' },
	serviceRequest: {
		one: 'service request',
		many: 'service requests',
		title: 'Service Request',
		titleMany: 'Service Requests',
	},
	sourceReduction: {
		one: 'source reduction',
		many: 'source reductions',
		title: 'Source Reduction',
		titleMany: 'Source Reductions',
	},
	trap: { one: 'trap', many: 'traps', title: 'Trap', titleMany: 'Traps' },
	weatherStation: {
		one: 'weather station',
		many: 'weather stations',
		title: 'Weather Station',
		titleMany: 'Weather Stations',
	},
};

/** What this record type is called. */
export function recordNoun(recordType: RecordType): RecordNoun {
	return RECORD_NOUNS[recordType];
}

/**
 * `1 chemical application`, `3 chemical applications` — a count that names a
 * record type.
 *
 * A count written into a sentence is where the register's reach ended, because
 * `check:record-nouns` refuses a *copy* of a register form and these three said
 * a word the register does not carry: two toasts on the chemical create route
 * and the mix preview above the form all counted `applications` where the
 * register says `chemical applications`, so the surface that writes a record
 * named it one way in its heading and another in the line that confirmed the
 * save (#940).
 *
 * So the call site passes the record type and the noun comes from here, which
 * is what the six components reading `recordNoun` already do. The number and
 * the singular fork are {@link countPhrase}'s, shared with the count beside
 * every explorer heading; what differs there is the empty set, which
 * `countLabel` draws as `None`.
 */
export function recordCount(recordType: RecordType, total: number): string {
	return countPhrase(total, RECORD_NOUNS[recordType]);
}

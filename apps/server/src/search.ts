import {
	type Kysely,
	SEARCH_COMMENT_TABLE,
	type SearchDocumentRow,
	type SimmerDatabase,
	searchDocuments,
} from '@simmer-mosquito/db';
import {
	type CommentTargetType,
	type CorpusTable,
	fromDbEntityType,
	SEARCH_MAX_LIMIT,
	SEARCH_MAX_OFFSET,
	SEARCH_QUERY_MAX_LENGTH,
	SEARCH_QUERY_MIN_LENGTH,
	type SearchDocumentClass,
	type SearchDocumentTable,
	type SearchResponse,
	type SearchResult,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import type { syncShapeScopes } from './shape-scopes.js';

/**
 * Global search over the record corpus and comments, for the palette and the
 * results page in `apps/web`.
 *
 * One endpoint for both callers, because they render the same `SearchResult`
 * union and two endpoints would be two rankings that drift. The difference
 * between them is `limit` and `offset`.
 *
 * GET rather than POST. A palette query is a handful of words, and GET is the
 * only choice where the browser's cache semantics and `vary: cookie` mean
 * anything. `/organization/memberships/list` is a read behind a POST because it
 * returns withheld columns behind a role floor, not because reads should be
 * POSTs.
 */
export function registerSearchRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.get('/search', options.authContextMiddleware, async (context) => {
		const parsed = readSearchQuery(new URL(context.req.url).searchParams);
		if (!parsed.ok) {
			return context.json({ error: 'invalid_query', reason: parsed.reason }, 400);
		}

		// One organization, off `AuthContext`, with no parameter that widens it. An
		// operator who has entered an organization under ADR 0011 holds an ordinary
		// `admin` membership there, so they get that organization and nothing else.
		//
		// Role deliberately does not filter results. No read in this repo is
		// role-filtered: `shapeScopeOf` derives every predicate from
		// `organization_id` and `deleted_at`, and `/map/service-requests/:id/nearby`
		// checks org and nothing else. Making search the one role-filtered read
		// would show less than the explorer page the same person can already open,
		// and the drift between the two would be invisible.
		const organizationId = context.get('authContext').organization.id;

		const result = await searchDocuments(options.db, {
			organizationId,
			query: parsed.query,
			limit: parsed.limit,
			offset: parsed.offset,
			documentClass: parsed.documentClass,
		});

		if (result.total === 0) {
			logEmptyResult(organizationId, parsed);
		}

		const response: SearchResponse = {
			// Echoed so the client can assert a response matches the request it
			// rendered under, which matters because the palette deliberately shows a
			// previous list under a live one.
			query: parsed.query,
			results: result.rows.map(toSearchResult),
			total: result.total,
			counts: result.counts,
			offset: parsed.offset,
			limit: parsed.limit,
		};

		return context.json(response satisfies SearchResponse);
	});
}

/**
 * One line per query that ran and matched nothing.
 *
 * What the count answers is "how often does `GET /search` come back empty", and
 * nothing sharper. It is not "how often search failed a person". The palette
 * shows four groups and only two of them are these results: `usePaletteContent`
 * matches pages and actions client-side off the bundle, so somebody who types
 * `traps`, takes the nav row they wanted and presses Enter produced an empty
 * response here and found what they came for. The results page is the honest
 * surface, because its empty state is this same `total === 0`.
 *
 * The query text is never written. It is free text somebody typed and can hold
 * a caller's name, a street address or a phone number, so the length stands in
 * for it: a log line is organization data in a stream nothing in this codebase
 * scopes and no deletion request reaches. Issue #282 is the record of why there
 * is no table here either.
 *
 * Only a query that reached Postgres gets a line. A refusal already answered
 * `400 invalid_query` above and is not a miss.
 */
function logEmptyResult(
	organizationId: string,
	parsed: Extract<ParsedSearchQuery, { readonly ok: true }>,
): void {
	console.log(
		`[search] Empty result. Organization ${organizationId}, query length ${parsed.query.length}, class ${parsed.documentClass ?? 'all'}.`,
	);
}

/**
 * Every corpus table streams under the plain organization scope.
 *
 * A migration that moves one to `'global'` or `'organization-or-global'` fails
 * the build naming the table, rather than quietly widening what search returns.
 * Same trick `ScopeFor` already plays on the scope map.
 *
 * `weather_sources` is the one exception and it is named rather than omitted: it
 * is `'organization-or-global'`, and its global rows are platform-owned stations
 * with a null `organization_id`. The index column is `not null`, so the trigger
 * drops them and search never returns one. That is a stated gap, not a widening.
 */
type CorpusScope<TTable extends SearchDocumentTable> = TTable extends 'weather_sources'
	? 'organization-or-global'
	: 'organization';

/** Empty while every document class streams under its expected scope. */
type CorpusScopeViolations = {
	readonly [TTable in SearchDocumentTable]: (typeof syncShapeScopes)[TTable] extends CorpusScope<TTable>
		? never
		: TTable;
}[SearchDocumentTable];

// The assertion itself. A migration that rescopes a corpus table makes this line
// fail to compile, naming the table it moved.
const _everyCorpusTableIsOrganizationScoped: never = undefined as unknown as CorpusScopeViolations;
void _everyCorpusTableIsOrganizationScoped;

/**
 * The parsed and normalized query string, or the reason it was refused.
 *
 * Reuses the `{ ok, reason }` parser protocol `map-tiles.ts` exports and
 * `service-request-nearby.ts` consumes, so `/search` answers refusals in the one
 * shape the rest of the read surface already uses.
 */
type ParsedSearchQuery =
	| {
			readonly ok: true;
			readonly query: string;
			readonly limit: number;
			readonly offset: number;
			readonly documentClass: SearchDocumentClass | undefined;
	  }
	| { readonly ok: false; readonly reason: string };

function readSearchQuery(searchParams: URLSearchParams): ParsedSearchQuery {
	const query = readQueryText(searchParams.get('q') ?? '');
	if (!query.ok) {
		return query;
	}

	const limit = readBoundedInteger(searchParams.get('limit'), {
		name: 'Limit',
		min: 1,
		max: SEARCH_MAX_LIMIT,
		required: true,
	});
	if (!limit.ok) {
		return limit;
	}

	const offset = readBoundedInteger(searchParams.get('offset'), {
		name: 'Offset',
		min: 0,
		max: SEARCH_MAX_OFFSET,
		required: false,
	});
	if (!offset.ok) {
		return offset;
	}

	const documentClass = readDocumentClass(searchParams.get('class'));
	if (!documentClass.ok) {
		return documentClass;
	}

	return {
		ok: true,
		query: query.value,
		limit: limit.value,
		offset: offset.value,
		documentClass: documentClass.value,
	};
}

type Parsed<TValue> =
	| { readonly ok: true; readonly value: TValue }
	| { readonly ok: false; readonly reason: string };

/**
 * Trimmed and whitespace-collapsed, and refused above the cap rather than
 * truncated: a silently truncated query returns results for a phrase the person
 * did not type. The palette's input carries the same cap as `maxLength`, so the
 * refusal only ever answers a caller that went around it.
 */
function readQueryText(raw: string): Parsed<string> {
	const query = raw.trim().replace(/\s+/gu, ' ');
	if (query.length < SEARCH_QUERY_MIN_LENGTH) {
		return { ok: false, reason: 'A search query is required.' };
	}
	if (query.length > SEARCH_QUERY_MAX_LENGTH) {
		return {
			ok: false,
			reason: `A search query may be at most ${SEARCH_QUERY_MAX_LENGTH} characters.`,
		};
	}
	return { ok: true, value: query };
}

/**
 * `limit` is required and has no default: the palette cannot know its server
 * budget until the group caps are applied, so making the caller state it keeps
 * that decision on the client rather than frozen in a server default. `offset`
 * defaults to the start of the list.
 */
function readBoundedInteger(
	raw: string | null,
	bounds: {
		readonly name: string;
		readonly min: number;
		readonly max: number;
		readonly required: boolean;
	},
): Parsed<number> {
	if (raw === null) {
		return bounds.required
			? { ok: false, reason: `A ${bounds.name.toLowerCase()} is required.` }
			: { ok: true, value: bounds.min };
	}

	const value = Number(raw);
	if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
		return {
			ok: false,
			reason: `${bounds.name} must be a whole number from ${bounds.min} to ${bounds.max}.`,
		};
	}

	return { ok: true, value };
}

function readDocumentClass(raw: string | null): Parsed<SearchDocumentClass | undefined> {
	if (raw === null) {
		return { ok: true, value: undefined };
	}
	if (raw !== 'records' && raw !== 'comments') {
		return { ok: false, reason: 'Class must be records or comments.' };
	}
	return { ok: true, value: raw };
}

/**
 * The composition rules, one per document class.
 *
 * They live here rather than in the trigger because they are real per-table
 * logic — a service request reads as `#1042`, a route as its name plus what kind
 * of route it is — and in plpgsql they could not be unit tested and would sit
 * inside a migration that is immutable once applied.
 *
 * `title` and `subtitle` arrive display-ready and `subtitle` is one string, not
 * a context line plus a matched line: a palette row has one line of space, and
 * two slots would double the per-table rules needed to fill it.
 */
function toSearchResult(row: SearchDocumentRow): SearchResult {
	if (row.sourceTable === SEARCH_COMMENT_TABLE) {
		const text = row.fields.comment_text ?? '';
		return {
			kind: 'comment',
			id: row.sourceId,
			title: firstLine(text),
			// The column stores the polymorphic type `snake_case`; the domain speaks
			// `camelCase`, and the route map is keyed the domain's way. Without this
			// bridge the five multi-word target types miss the map and the row
			// navigates nowhere. `toDbEntityType` is what put it in that shape.
			targetType: fromDbEntityType(row.display.entity_type ?? '') as CommentTargetType,
			targetId: row.display.entity_id ?? '',
			matchedField: row.matchedField,
			matchClass: row.matchClass,
		};
	}

	const table = row.sourceTable;
	const composed = composeRecord(table, row);

	return {
		kind: 'record',
		id: row.sourceId,
		title: composed.title,
		// The matched field's text when the match was not on the title, and the
		// record's context line otherwise. Prefixed with the field's own word where
		// the title does not already explain the hit, so a habitat matched on its
		// name shows its context line plain and one matched on `description` shows
		// `Description: …`.
		subtitle: composed.titleField === row.matchedField ? composed.context : matchedLine(row),
		table,
		matchedField: row.matchedField,
		matchClass: row.matchClass,
		...(table === 'routes' && row.display.route_type !== undefined
			? { routeType: row.display.route_type }
			: {}),
		// Only the three tables with a lifecycle put `is_active` in `display`, so
		// this is absent for the other nine rather than false. Read off the
		// document and not off a join: the trigger keeps it in step with the row.
		...(row.display.is_active === 'false' ? { retired: true } : {}),
	};
}

interface ComposedRecord {
	readonly title: string;
	/** The field the title was drawn from, or `''` where the title is synthesized. */
	readonly titleField: string;
	readonly context: string | undefined;
}

/** What one table's fields compose into. `short` is the id's first eight characters. */
type RecordComposer = (fields: Record<string, string>, short: string) => ComposedRecord;

/**
 * One composer per corpus table, as a table rather than a switch.
 *
 * These are twelve independent rules with nothing shared between the arms, so a
 * `switch` over them was one function carrying the cyclomatic complexity of all
 * twelve at once and failing `pnpm fallow:health` on it. Keyed on `CorpusTable`,
 * so a table joining the corpus fails to compile until it has a rule here.
 */
const RECORD_COMPOSERS: Record<CorpusTable, RecordComposer> = {
	habitats: (fields, short) => ({
		title: text(fields.habitat_name) ?? `Habitat ${short}`,
		titleField: 'habitat_name',
		context: text(fields.description),
	}),

	traps: (fields, short) => {
		const name = text(fields.trap_name);
		return {
			title: name ?? text(fields.trap_code) ?? `Trap ${short}`,
			titleField: name === undefined ? 'trap_code' : 'trap_name',
			context: name === undefined ? text(fields.description) : text(fields.trap_code),
		};
	},

	// `display_name` is a sequential integer the server assigns after the write
	// commits, and `serviceRequestTitle` in `apps/web` reads it the same way:
	// `#1042`, or a short id where it has not landed yet.
	service_requests: (fields, short) => {
		const number = text(fields.display_name);
		return {
			title: number === undefined ? short : `#${number}`,
			titleField: 'display_name',
			context: text(fields.details),
		};
	},

	// Identity-strength order, matching `contactDisplayName` in `apps/web`.
	contacts: (fields, short) => {
		const order = ['contact_name', 'company', 'email', 'preferred_phone'] as const;
		const titleField = order.find((field) => text(fields[field]) !== undefined);
		return {
			title: titleField === undefined ? `Contact ${short}` : (text(fields[titleField]) as string),
			titleField: titleField ?? '',
			context:
				titleField === 'contact_name'
					? (text(fields.company) ?? text(fields.email))
					: text(fields.email),
		};
	},

	addresses: (fields, short) => ({
		title: text(fields.display_name) ?? `Address ${short}`,
		titleField: 'display_name',
		context: joinNonEmpty([text(fields.locality), text(fields.postal_code)], ' '),
	}),

	regions: (fields, short) => ({
		title: text(fields.name) ?? `Region ${short}`,
		titleField: 'name',
		context: text(fields.description),
	}),

	// A route carries nothing but its name and what kind of route it is, and the
	// kind is what tells a habitat route from a trap route. It rides in `display`,
	// so the caller passes it in rather than reading it off `fields`.
	routes: (fields, short) => ({
		title: text(fields.route_name) ?? `Route ${short}`,
		titleField: 'route_name',
		context: undefined,
	}),

	assignments: (fields, short) => ({
		title: text(fields.assignment_name) ?? `Assignment ${short}`,
		titleField: 'assignment_name',
		context: undefined,
	}),

	missions: (fields, short) => ({
		title: text(fields.mission_name) ?? `Mission ${short}`,
		titleField: 'mission_name',
		context: undefined,
	}),

	// No identifier field at all, so the prose *is* the title.
	requested_control_actions: (fields, short) => ({
		title: firstLine(fields.summary ?? `Request for control ${short}`),
		titleField: 'summary',
		context: undefined,
	}),

	samples: (fields, short) => ({
		title: text(fields.display_name) ?? `Sample ${short}`,
		titleField: 'display_name',
		context: undefined,
	}),

	weather_sources: (fields, short) => {
		const name = text(fields.source_name);
		return {
			title: name ?? text(fields.source_code) ?? `Weather station ${short}`,
			titleField: name === undefined ? 'source_code' : 'source_name',
			context: name === undefined ? undefined : text(fields.source_code),
		};
	},
};

function composeRecord(table: CorpusTable, row: SearchDocumentRow): ComposedRecord {
	const composed = RECORD_COMPOSERS[table](row.fields, row.sourceId.slice(0, 8));
	if (table !== 'routes') {
		return composed;
	}

	// The one rule that needs a column outside `fields`.
	return { ...composed, context: routeTypeLabel(row.display.route_type) };
}

/**
 * The word a matched field goes by on screen.
 *
 * Only the fields that can reach a subtitle need one: a field that produced the
 * title never prefixes anything.
 */
const MATCHED_FIELD_LABELS: Record<string, string> = {
	alternate_phone: 'Phone',
	company: 'Company',
	description: 'Description',
	details: 'Details',
	email: 'Email',
	locality: 'Locality',
	postal_code: 'Postal code',
	preferred_phone: 'Phone',
	source_code: 'Code',
	trap_code: 'Code',
};

function matchedLine(row: SearchDocumentRow): string | undefined {
	const value = text(row.fields[row.matchedField]);
	if (value === undefined) {
		return undefined;
	}

	const label = MATCHED_FIELD_LABELS[row.matchedField];
	const line = firstLine(value);
	return label === undefined ? line : `${label}: ${line}`;
}

function routeTypeLabel(routeType: string | undefined): string | undefined {
	switch (routeType) {
		case 'habitat':
			return 'Habitat route';
		case 'trap':
			return 'Trap route';
		default:
			return undefined;
	}
}

/**
 * The first line of a value, capped.
 *
 * A comment is prose and its title is the first thing a person reads; a
 * thousand-character note would otherwise arrive whole and be cut off by CSS in
 * a place nobody chose. This is not `ts_headline`: it is the stored field, cut,
 * never an excerpt generated off the document text, which is the one shape that
 * can leak a column nobody listed.
 */
const LINE_LENGTH_CAP = 160;

function firstLine(value: string): string {
	const line = value.split(/\r?\n/u)[0]?.trim() ?? '';
	return line.length > LINE_LENGTH_CAP ? `${line.slice(0, LINE_LENGTH_CAP).trimEnd()}…` : line;
}

function text(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function joinNonEmpty(
	parts: readonly (string | undefined)[],
	separator: string,
): string | undefined {
	const joined = parts.filter((part): part is string => part !== undefined).join(separator);
	return joined === '' ? undefined : joined;
}

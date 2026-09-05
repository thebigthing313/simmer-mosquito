import {
	CORPUS_TABLES,
	type SearchDocumentTable,
	type SearchMatchClass,
} from '@simmer-mosquito/domain';
import { type Kysely, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';

/** The document class a row belongs to. `comments` is one; everything else is a record. */
export const SEARCH_COMMENT_TABLE = 'comments';

/**
 * The fields the index holds for one corpus table, in the order ties break on.
 *
 * This is the declaration `pnpm check:search-corpus` reads. A field named here
 * has to be a column of that table in the generated row schemas, and may not be
 * a column sync withholds from clients. The tables declared here have to be
 * exactly the tables the migration creates triggers for.
 *
 * Generating the migration from this instead would be a new machine, and a
 * migration is immutable once applied, so a regeneration could only ever emit a
 * second one.
 *
 * Weight comes from which list a field is in, mechanically: identifier fields
 * are weight `A`, prose fields weight `B`. A second judgement in the migration
 * would be the same decision written in two places that can disagree.
 */
export interface SearchCorpusFields {
	/** Text the organization itself typed as a handle. Searched by all four classes. */
	readonly identifierFields: readonly string[];
	/** Free text. Reachable by the `text` class alone. */
	readonly proseFields: readonly string[];
}

/**
 * What each document class holds.
 *
 * A table enters the corpus only if it holds a typeable handle and has a detail
 * route. Both gates are checkable rather than a judgement call, which is what
 * makes "is this new table searchable" answerable by whoever writes the next
 * migration. Four of the twelve hold zero production rows; they are here because
 * the gate is the table's shape and not its current row count.
 *
 * The key is `SearchDocumentTable`, so the corpus and the union the client
 * renders cannot name different tables. Their *order* is `CORPUS_TABLES`, read
 * straight from the domain, which is what the tie-break sorts on.
 */
export const SEARCH_CORPUS: Record<SearchDocumentTable, SearchCorpusFields> = {
	habitats: { identifierFields: ['habitat_name'], proseFields: ['description'] },
	traps: { identifierFields: ['trap_name', 'trap_code'], proseFields: ['description'] },
	service_requests: { identifierFields: ['display_name'], proseFields: ['details'] },
	contacts: {
		identifierFields: ['contact_name', 'company', 'email', 'preferred_phone', 'alternate_phone'],
		proseFields: [],
	},
	addresses: { identifierFields: ['display_name', 'locality', 'postal_code'], proseFields: [] },
	regions: { identifierFields: ['name'], proseFields: ['description'] },
	routes: { identifierFields: ['route_name'], proseFields: [] },
	assignments: { identifierFields: ['assignment_name'], proseFields: [] },
	missions: { identifierFields: ['mission_name'], proseFields: [] },
	requested_control_actions: { identifierFields: [], proseFields: ['summary'] },
	samples: { identifierFields: ['display_name'], proseFields: [] },
	weather_sources: { identifierFields: ['source_name', 'source_code'], proseFields: [] },
	// The thirteenth, and its own document class. No identifier field, so a
	// comment is reachable by full text alone.
	comments: { identifierFields: [], proseFields: ['comment_text'] },
};

/**
 * Every document class, in the order the tie-break reads. Comments sort last:
 * `CORPUS_TABLES` is the twelve record tables, and a comment loses a tie to a
 * record of the same class and score.
 */
export const SEARCH_DOCUMENT_TABLES: readonly SearchDocumentTable[] = [
	...CORPUS_TABLES,
	SEARCH_COMMENT_TABLE,
];

export interface SearchDocumentRow {
	readonly sourceTable: SearchDocumentTable;
	readonly sourceId: string;
	readonly matchClass: SearchMatchClass;
	/** The declared field that produced the winning class, first in declared order on a tie. */
	readonly matchedField: string;
	/** Every indexed field of the document, column key to text. */
	readonly fields: Record<string, string>;
	/**
	 * The non-indexed columns composition needs: `route_type`, a comment's
	 * target, and `is_active` on the three tables that have one, as `'true'` or
	 * `'false'`. Nothing here reaches the vector, so nothing here ranks.
	 */
	readonly display: Record<string, string>;
}

export interface SearchDocumentsInput {
	readonly organizationId: string;
	/** Already trimmed and whitespace-collapsed by the caller. */
	readonly query: string;
	readonly limit: number;
	readonly offset: number;
	/** Narrows the returned page and `total`, never `counts`. */
	readonly documentClass?: 'records' | 'comments' | undefined;
}

export interface SearchDocumentsResult {
	readonly rows: readonly SearchDocumentRow[];
	/** Exact, over the whole match set, narrowed by `documentClass` when one is set. */
	readonly total: number;
	/** Exact, over the whole match set, never narrowed. */
	readonly counts: { readonly records: number; readonly comments: number };
}

/**
 * The threshold `word_similarity` has to clear for the `fuzzy` class.
 *
 * Set per transaction rather than inherited from the session, because a session
 * GUC set on a pooled connection outlives the request that set it.
 */
const WORD_SIMILARITY_THRESHOLD = 0.6;

/**
 * The `fuzzy` class is capped at this many rows before the ladder and before
 * `total`.
 *
 * The threshold cannot be tuned instead: this organization's handles are codes
 * on one template, so `similarity` at 0.3 returns 394 fuzzy hits for a single
 * habitat name while 0.6 loses ordinary typos. Capping by rank is what keeps
 * `total` honest. 20 is above anything the palette's cap of 4 or a first page
 * can show.
 */
const FUZZY_CLASS_CAP = 20;

/**
 * Below this length `gin_trgm_ops` degenerates to a scan.
 *
 * It is the floor for two branches, not one: `fuzzy` is off entirely below it,
 * and `prefix` loses the index-servable pre-filter that keeps it off a sequential
 * scan. `exact` and `text` are served at any length.
 */
const TRIGRAM_MIN_QUERY_LENGTH = 3;

/**
 * The statement budget. Search is the one read a person fires on every
 * keystroke, so what this guards against is a plan regression turning the
 * palette into a stalled connection pool.
 *
 * Measured on a clone of production, 135,198 documents in one organization: a
 * whole query at three characters or more runs in **6.7 ms**, with all four
 * branches bitmap-scanning their own index and OR-ing together. One and two
 * character queries scan the organization's documents instead, at **81 ms** and
 * **89 ms**.
 *
 * The timeout is thirty times the worse of those, and the scan is one a person
 * only reaches while typing the first two characters of a query that is
 * debounced at 200 ms. Both numbers are warm-cache: the plan reports 7,000
 * buffer hits and no reads, which is the steady state for a table queried on
 * every keystroke, and not what the first query after a deploy will see.
 */
const SEARCH_STATEMENT_TIMEOUT = '3s';

/**
 * Everything one search query needs, in one round trip: the ranked page, the
 * exact total under the class filter, and the exact per-class counts without it.
 *
 * One reader rather than one per match class. The four branches are one query
 * shape over one table, and splitting them would put the merge in the route
 * handler where it cannot be tested against Postgres.
 *
 * It returns rows, not `SearchResult`s: composition is per-table display logic
 * and belongs at the endpoint, exactly as every command handler maps its own
 * reads.
 */
export async function searchDocuments(
	db: Kysely<SimmerDatabase>,
	input: SearchDocumentsInput,
): Promise<SearchDocumentsResult> {
	const tokens = input.query.split(/\s+/u).filter((token) => token !== '');
	if (tokens.length === 0) {
		return { rows: [], total: 0, counts: { records: 0, comments: 0 } };
	}

	const folded = input.query.toLowerCase();
	const escaped = escapeLikePattern(folded);
	const prefixPattern = `${escaped}%`;
	const containsPattern = `%${escaped}%`;
	const trigramUsable = folded.length >= TRIGRAM_MIN_QUERY_LENGTH;

	/*
	 * An identifier field equals the query. `@>` and not `= any(...)`: the two
	 * mean the same thing and only one of them is an indexable operator for
	 * `array_ops`, so `= any` seq-scanned the whole organization. Measured on
	 * staging, 15.6 ms became 0.19 ms.
	 */
	const exactPredicate = sql`d.search_text @> array[p.qq]`;

	/*
	 * An identifier field starts with the query.
	 *
	 * The `exists` over the array is the predicate that is actually meant: a
	 * prefix has to match the start of *a field*, and testing the joined column
	 * would only ever reach the first field in declared order, which is the
	 * smaller version of the bug that made `search_text` an array in the first
	 * place. No index serves that test.
	 *
	 * So at three characters and up it is preceded by a trigram containment test,
	 * which is a superset of it and which the trigram index does serve, leaving
	 * the array test as a recheck over what comes back. 41.0 ms became 3.2 ms on
	 * staging, over the same 835 rows.
	 *
	 * Below three characters `gin_trgm_ops` degenerates and there is nothing to
	 * add, so a one or two character query scans one organization's documents.
	 * That is the measured and accepted gap: 41 ms over staging's 47,861
	 * documents, so roughly 115 ms over production's 135,198.
	 */
	const prefixPredicate = trigramUsable
		? sql`d.search_text_joined like p.qq_contains and exists (
				select 1 from unnest(d.search_text) e where e like p.qq_prefix
			)`
		: sql`exists (select 1 from unnest(d.search_text) e where e like p.qq_prefix)`;

	/** `word_similarity` at or above the threshold. Off below the trigram floor. */
	const fuzzyPredicate = trigramUsable ? sql`d.search_text_joined %> p.qq` : sql`false`;
	const commentsOnly = input.documentClass === 'comments';
	const recordsOnly = input.documentClass === 'records';

	return await db.transaction().execute(async (trx) => {
		await sql`set local statement_timeout = ${sql.lit(SEARCH_STATEMENT_TIMEOUT)}`.execute(trx);
		await sql`set local pg_trgm.word_similarity_threshold = ${sql.lit(
			String(WORD_SIMILARITY_THRESHOLD),
		)}`.execute(trx);

		const result = await sql<{
			readonly source_table: SearchDocumentTable;
			readonly source_id: string;
			readonly match_class: SearchMatchClass;
			readonly matched_field: string | null;
			readonly fields: Record<string, string>;
			readonly display: Record<string, string>;
			readonly total: string;
			readonly records: string;
			readonly comments: string;
		}>`
			with p as (
				select
					${folded}::text as qq,
					${prefixPattern}::text as qq_prefix,
					${containsPattern}::text as qq_contains,
					${buildTsQuery(tokens)} as tsq
			),
			-- The corpus declaration, carried into the query so the matched field can
			-- be recovered in declared order. A lateral over the returned page only:
			-- free for 10 rows and ruinous for 135,198.
			corpus (source_table, ord, field_key, is_identifier) as (
				values ${sql.join(corpusValueRows())}
			),
			matched as (
				select
					d.source_table,
					d.source_id,
					d.fields,
					d.display,
					case
						when d.search_text is not null and ${exactPredicate} then 'exact'
						when d.search_text is not null and ${prefixPredicate} then 'prefix'
						when ${fuzzyPredicate} then 'fuzzy'
						else 'text'
					end as match_class,
					case
						when ${fuzzyPredicate} then word_similarity(p.qq, d.search_text_joined)
						else 0
					end as fuzzy_score,
					-- Normalization flag 1, log document length. Flag 32 is
					-- \`rank/(rank+1)\`, which is strictly increasing and therefore
					-- order-preserving with flag 0: it carries no length term at all, and
					-- measured on the real corpus it puts a 1015-character comment above
					-- a 14-character habitat name.
					ts_rank(d.search_vector, p.tsq, 1) as text_score
				from search_documents d
				cross join p
				where d.organization_id = ${input.organizationId}
					and (
						(d.search_text is not null and ${exactPredicate})
						or (d.search_text is not null and ${prefixPredicate})
						or (${fuzzyPredicate})
						or d.search_vector @@ p.tsq
					)
			),
			ranked as (
				select
					m.*,
					case m.match_class
						when 'exact' then 1 when 'prefix' then 2 when 'fuzzy' then 3 else 4
					end as class_rank,
					case
						when m.match_class = 'fuzzy' then m.fuzzy_score
						when m.match_class = 'text' then m.text_score
						else 0
					end as score,
					case m.source_table ${sql.join(tableRankBranches(), sql` `)} else 99 end as table_rank
				from matched m
			),
			-- The \`fuzzy\` class is capped here, before the ladder and before the
			-- counts, so \`total\` never promises rows the ranking has thrown away.
			capped as (
				select * from ranked where match_class <> 'fuzzy'
				union all
				select * from (
					select * from ranked where match_class = 'fuzzy'
					order by score desc, table_rank, source_id
					limit ${FUZZY_CLASS_CAP}
				) f
			),
			filtered as (
				select * from capped
				where (${!commentsOnly} or source_table = ${SEARCH_COMMENT_TABLE})
					and (${!recordsOnly} or source_table <> ${SEARCH_COMMENT_TABLE})
			),
			tallies as (
				select
					(select count(*) from filtered) as total,
					(select count(*) from capped where source_table <> ${SEARCH_COMMENT_TABLE}) as records,
					(select count(*) from capped where source_table = ${SEARCH_COMMENT_TABLE}) as comments
			),
			page as (
				select * from filtered
				-- Class first, score second, then the table's corpus position and the
				-- id. The last two are what make the same query twice return the same
				-- list, which is the one thing the tests assert literally.
				order by class_rank, score desc, table_rank, source_id
				limit ${input.limit} offset ${input.offset}
			)
			select
				page.source_table,
				page.source_id,
				page.match_class,
				page.fields,
				page.display,
				mf.field_key as matched_field,
				tallies.total,
				tallies.records,
				tallies.comments
			from page
			cross join p
			cross join tallies
			left join lateral (
				select c.field_key
				from corpus c
				where c.source_table = page.source_table
					and nullif(btrim(page.fields ->> c.field_key), '') is not null
				-- Matching fields first, then the best fuzzy score, then declared
				-- order. A multi-token \`text\` match can be spread across two fields
				-- with neither matching alone, which is why this falls back to the
				-- first field present rather than returning nothing.
				order by
					(case page.match_class
						when 'exact' then c.is_identifier
							and lower(btrim(page.fields ->> c.field_key)) = p.qq
						when 'prefix' then c.is_identifier
							and lower(btrim(page.fields ->> c.field_key)) like p.qq_prefix
						when 'fuzzy' then c.is_identifier
							and lower(btrim(page.fields ->> c.field_key)) %> p.qq
						else to_tsvector('english', page.fields ->> c.field_key) @@ p.tsq
					end) desc,
					(case when page.match_class = 'fuzzy'
						then word_similarity(p.qq, lower(btrim(page.fields ->> c.field_key)))
						else 0 end) desc,
					c.ord
				limit 1
			) mf on true
			order by page.class_rank, page.score desc, page.table_rank, page.source_id
		`.execute(trx);

		const first = result.rows[0];
		if (first === undefined) {
			// No page rows means no match set either: `filtered` is a subset of
			// `capped`, and an empty `capped` makes both counts zero. An offset past
			// the end is the one case where the tallies are real and unreachable, and
			// a second round trip to recover them is not worth a page nobody linked.
			return { rows: [], total: 0, counts: { records: 0, comments: 0 } };
		}

		return {
			rows: result.rows.map((row) => ({
				sourceTable: row.source_table,
				sourceId: row.source_id,
				matchClass: row.match_class,
				matchedField: row.matched_field ?? '',
				fields: row.fields ?? {},
				display: row.display ?? {},
			})),
			total: Number(first.total),
			counts: { records: Number(first.records), comments: Number(first.comments) },
		};
	});
}

/**
 * The `tsquery`, built here rather than by `websearch_to_tsquery`.
 *
 * `to_tsquery` is the only constructor that accepts the `:*` prefix label, and
 * it raises syntax errors rather than swallowing them, so every token is quoted
 * as a `tsquery` lexeme and can hold an apostrophe or an operator character
 * without becoming one.
 *
 * The quoting happens here and the whole expression goes over as one bound
 * parameter. Assembling it in SQL out of `quote_literal` looked equivalent and
 * is not: `quote_literal` prefixes its answer with `E` for any value holding a
 * backslash, and `to_tsquery` reads that `E` as a lexeme of its own, so a query
 * with a backslash in it searched for `e` followed by the tail of the token.
 * `tsquery`'s own escape rules are the ones that apply inside `to_tsquery`, and
 * they are the two below: double a backslash, double a quote.
 *
 * Tokens are ANDed and the prefix label rides on the last token only, since that
 * is the one still being typed. OR would make a two-word query return more rows
 * than a one-word query, which reads as broken.
 */
function buildTsQuery(tokens: readonly string[]) {
	const query = tokens
		.map((token, index) => {
			const lexeme = `'${token.toLowerCase().replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
			return index === tokens.length - 1 ? `${lexeme}:*` : lexeme;
		})
		.join(' & ');

	return sql`to_tsquery('english', ${query})`;
}

/** The corpus declaration as `(source_table, ord, field_key, is_identifier)` rows. */
function corpusValueRows() {
	return SEARCH_DOCUMENT_TABLES.flatMap((table) => {
		const entry = SEARCH_CORPUS[table];
		const fields = [
			...entry.identifierFields.map((field) => ({ field, identifier: true })),
			...entry.proseFields.map((field) => ({ field, identifier: false })),
		];

		return fields.map(
			(field, index) =>
				sql`(${table}::text, ${index}::int, ${field.field}::text, ${field.identifier}::boolean)`,
		);
	});
}

/** `when 'habitats' then 1 ...`, the corpus order the tie-break reads. */
function tableRankBranches() {
	return SEARCH_DOCUMENT_TABLES.map((table, index) => sql`when ${table} then ${index + 1}`);
}

/**
 * Escapes the three characters `LIKE` gives meaning to, so a postal code with an
 * underscore in it is a prefix and not a wildcard.
 */
function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

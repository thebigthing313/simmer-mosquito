/**
 * The SQL fragments that decide how a record *reads*, shared by the surfaces
 * that answer with records rather than with one record type.
 *
 * These are display decisions, not query logic: what a trap is called, which of
 * three words describes a site's availability, how an inspection's result is
 * summarised. Two surfaces already answered them — the service-request context
 * view and the profile activity log — and answered them identically, by copy.
 * A third would have copied them again, and the first divergence would show up
 * as one surface calling a trap `T-1 - North gate` and another calling it
 * `T-1`, with nothing failing.
 *
 * Each takes the alias its table is bound to, because these appear inside
 * branches that name the same table differently (`t` in a join, `r` in a union
 * branch).
 */

/**
 * A trap's display label: `code - name`, dash-free when only one is set, null
 * when neither is. The web app renders traps this way, so a trap named on a map
 * card and the same trap named in a list read the same.
 */
export function trapLabelSql(alias: string): string {
	return `nullif(concat_ws(' - ', nullif(btrim(${alias}.trap_code), ''), nullif(btrim(${alias}.trap_name), '')), '')`;
}

/**
 * A habitat's availability: retired, unreachable, or in service. Inaccessible
 * outranks inactive — a site nobody can get to is the more useful thing to say.
 */
export function habitatStatusSql(alias: string): string {
	return `case when ${alias}.is_active = false then 'inactive'
		when ${alias}.is_inaccessible = true then 'inaccessible' else 'active' end`;
}

/** A trap's availability. Traps have no inaccessible state. */
export function trapStatusSql(alias: string): string {
	return `case when ${alias}.is_active = false then 'inactive' else 'active' end`;
}

/**
 * What an inspection found: `dry`, or the density recorded, or `wet` where the
 * site held water but nothing was counted. Dry and "wet with none found" are
 * different statements and must not collapse into one.
 */
export function inspectionResultSql(alias: string): string {
	return `case when ${alias}.is_wet = false then 'dry' else coalesce(${alias}.density::text, 'wet') end`;
}

/**
 * A `timestamptz` as the calendar date it fell on **in the organization's
 * timezone**.
 *
 * Postgres converts `timestamptz::date` using the session's timezone, which is
 * the database server's, not the organization's. For a US organization on a UTC
 * server that silently files an evening's work under the next day — and a
 * date-bounded read then omits it from the range that was actually asked for.
 *
 * The zone is validated by {@link assertIanaTimeZone} before it reaches here,
 * because it is interpolated rather than bound: `at time zone` takes an
 * expression, but these fragments are assembled as text.
 */
export function localDateSql(expression: string, timeZone: string): string {
	return `((${expression}) at time zone '${timeZone}')::date`;
}

/**
 * IANA zone names only — letters, digits, and the few separators they use.
 *
 * Timezones reach the readers from organization settings, where the domain
 * normalizes them through `Intl.DateTimeFormat` on write, so a stored value is
 * already a real zone. This is the second lock: {@link localDateSql} splices
 * its argument into SQL, and a value that ever arrived from somewhere else must
 * not be able to carry a quote with it.
 */
const IANA_TIME_ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

export function assertIanaTimeZone(timeZone: string): string {
	if (!IANA_TIME_ZONE.test(timeZone)) {
		throw new Error(`Invalid IANA time zone: ${timeZone}`);
	}
	return timeZone;
}

/**
 * A collection's state, resolved by precedence so the map colour, the result
 * rail and the activity log can never disagree about what one is.
 *
 * `pending` first, because it says the record is not finished: the trap is
 * still out and there is nothing to report a problem or a count about yet. It
 * reads the row's own `collection_timing_mode` rather than the organization's
 * current setting, because a null `collected_at` means "not emptied" only under
 * exact timestamps. Under date-plus-duration every finished collection has one,
 * and a status keyed off the column alone would paint the whole surface
 * pending.
 */
export function collectionStatusSql(alias: string): string {
	return `case
		when ${alias}.collection_timing_mode = 'exact_timestamps' and ${alias}.collected_at is null then 'pending'
		when ${alias}.has_problem then 'problem'
		when ${alias}.is_zero_result then 'zero_result'
		else 'collected'
	end`;
}

/**
 * The life stages an inspection found, as the `E1234P` codes the strip draws.
 *
 * One short string rather than six booleans, because it crosses a `union all`
 * where eight other branches have no life stages to report and every column
 * costs each of them a cast. The order is the order the strip reads in, egg to
 * pupae, so the client rebuilds the flags by looking each code up rather than
 * by trusting a position. Null where nothing was found, which is a different
 * statement from a dry site and stays one: `inspectionResultSql` says which.
 */
export function lifeStageCodesSql(alias: string): string {
	const codes: readonly (readonly [string, string])[] = [
		['has_eggs', 'E'],
		['has_first_instar', '1'],
		['has_second_instar', '2'],
		['has_third_instar', '3'],
		['has_fourth_instar', '4'],
		['has_pupae', 'P'],
	];
	const parts = codes
		.map(([column, code]) => `case when ${alias}.${column} then '${code}' else '' end`)
		.join(', ');
	return `nullif(concat(${parts}), '')`;
}

/**
 * The Tags on one record, as ids.
 *
 * Ids rather than names, because the Tag catalog syncs eagerly and the client
 * already holds the name, the colour and the description that a chip draws. A
 * correlated subquery rather than a join, because `tag_items` is polymorphic
 * and a join would multiply the branch's rows by the tags on each record.
 *
 * `entityType` is the **snake_case** spelling the column holds, which is what
 * `toDbEntityType` produces from the domain's camelCase vocabulary. A camelCase
 * value here matches nothing and reads exactly like an untagged record.
 *
 * No organization predicate: `entity_id` names a row the calling branch has
 * already scoped, and `tag_items_entity_idx` is `(entity_type, entity_id) where
 * deleted_at is null`, which is exactly this lookup.
 */
export function recordTagIdsSql(alias: string, entityType: string): string {
	return `(
		select array_agg(ti.tag_id::text)
		from tag_items ti
		where ti.entity_type = '${entityType}'
			and ti.entity_id = ${alias}.id
			and ti.deleted_at is null
	)`;
}

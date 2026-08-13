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
 * A `timestamptz` as the calendar date it fell on **in the agency's timezone**.
 *
 * Postgres converts `timestamptz::date` using the session's timezone, which is
 * the database server's, not the agency's. For a US agency on a UTC server that
 * silently files an evening's work under the next day — and a date-bounded read
 * then omits it from the range that was actually asked for.
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

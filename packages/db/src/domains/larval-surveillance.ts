import { type Kysely, sql } from 'kysely';

import type { SimmerDatabase } from '../index.js';

/** One sample still awaiting species identification, with its inspection context. */
export interface AwaitingSampleRow {
	readonly id: string;
	readonly displayName: string | null;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
}

export interface SamplesAwaitingInput {
	readonly organizationId: string;
	/** Inclusive lower bound on the parent inspection's date (`YYYY-MM-DD`). */
	readonly since: string;
	/** Maximum rows to return; the total is reported separately. */
	readonly limit: number;
}

export interface SamplesAwaitingResult {
	readonly total: number;
	readonly samples: AwaitingSampleRow[];
}

/**
 * Recent samples awaiting identification for one organization: collected samples
 * that carry no identified species yet and have not been closed out as
 * zero-larvae or unidentifiable. Bounded by the parent inspection's date so the
 * overview reads only the current window, and returned oldest-first because the
 * longest-waiting samples are the ones that need attention.
 *
 * Reported `total` is the full count in the window; `samples` is capped at
 * `limit` for the preview list.
 */
export async function listSamplesAwaitingIdentification(
	db: Kysely<SimmerDatabase>,
	input: SamplesAwaitingInput,
): Promise<SamplesAwaitingResult> {
	// A sample is "awaiting" when it holds larvae (not zero, not unidentifiable)
	// and no species row has been recorded against it yet.
	const awaitingCondition = sql`
		s.organization_id = ${input.organizationId}
		and s.deleted_at is null
		and s.is_zero_larvae = false
		and s.unidentifiable_reason is null
		and i.deleted_at is null
		and i.inspection_date >= ${input.since}
		and not exists (
			select 1
			from sample_species ss
			where ss.sample_id = s.id
				and ss.deleted_at is null
		)
	`;

	const totalResult = await sql<{ total: number }>`
		select count(*)::int as total
		from samples s
		join inspections i on i.id = s.inspection_id
		where ${awaitingCondition}
	`.execute(db);

	const listResult = await sql<AwaitingSampleRow>`
		select
			s.id,
			s.display_name as "displayName",
			i.inspection_date::text as "inspectionDate",
			i.habitat_id as "habitatId",
			h.habitat_name as "habitatName"
		from samples s
		join inspections i on i.id = s.inspection_id
		left join habitats h on h.id = i.habitat_id
		where ${awaitingCondition}
		order by i.inspection_date asc, s.created_at asc
		limit ${input.limit}
	`.execute(db);

	return {
		total: totalResult.rows[0]?.total ?? 0,
		samples: listResult.rows,
	};
}

/**
 * The weather writers, against Postgres.
 *
 * The unit tests cover the translation from column names to domain arguments.
 * What they cannot cover is everything these writers exist for, because all of
 * it turns on stored rows: whether the agency owns the station, whether it
 * already holds summaries, whether a bucket overlaps one, and what a station
 * delete takes with it.
 *
 * Four of those are worth the round trip in particular:
 *
 * - **Overlap.** `docs/weather-domain.md` declines the `btree_gist` exclusion
 *   constraint that would enforce it, so no-overlap is a handler invariant with
 *   nothing underneath it. A regression here is silent: two straddling buckets
 *   both write, and every report that sums them double-counts.
 * - **Tenancy.** Both tables carry a *nullable* `organization_id`, so they miss
 *   the `OrgOwnedTable` guard the shared helpers apply, and the predicate is
 *   written by hand in `weather-commands/shared.ts`. Written by hand is exactly
 *   what wants proving.
 * - **The station delete.** It hard-deletes summaries and then soft-deletes the
 *   station. Getting that order wrong leaves rows nothing can reach.
 * - **The import.** Its verdict comes from re-reading the database, not from
 *   what the client claimed, and the acknowledgement gates refuse the whole
 *   batch before the first row is written.
 */

import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import {
	commitWeatherSummaryImportCommand,
	createWeatherStationCommand,
	createWeatherSummaryCommand,
	deleteWeatherStationCommand,
	deleteWeatherSummaryCommand,
	updateWeatherStationDetailsCommand,
	updateWeatherStationLocationCommand,
	updateWeatherSummaryCommand,
	type CommitWeatherSummaryImportCommand,
	type WeatherCommand,
} from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import { CommandError } from '../../command-endpoint.js';
import type { CommandTransaction } from '../../command-write.js';
import { commitWeatherSummaryImport } from '../../weather-commands/import.js';
import { writeWeatherStationCommand } from '../../weather-commands/stations.js';
import { writeWeatherSummaryCommand } from '../../weather-commands/summaries.js';

type Db = Kysely<SimmerDatabase>;

const PIN = { type: 'Point', coordinates: [-90.5, 35.5] } as const;
const OTHER_PIN = { type: 'Point', coordinates: [-91.5, 36.5] } as const;

describeDbIntegration('weather commands against Postgres', () => {
	// ------------------------------------------------------------------
	// Stations
	// ------------------------------------------------------------------

	it('writes a station as its own source, scoped to the agency', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_create');
			const stationId = uuid(1);

			const station = await writeStation(
				db,
				createWeatherStationCommand({
					organizationId,
					actorProfileId,
					weatherStationId: stationId,
					stationName: 'North Gauge',
					stationCode: 'NG-1',
					geometry: PIN,
				}),
			);

			expect(station).toMatchObject({
				id: stationId,
				organizationId,
				stationName: 'North Gauge',
				stationCode: 'NG-1',
				// v1 agency stations are always their own source; `nws` is plumbing no
				// command writes.
				sourceType: 'organization',
				providerSourceId: null,
				isActive: true,
			});
			// The generated columns are what a collection actually carries, so the
			// point has to survive as coordinates and not only as `geom`.
			expect(station?.lat).toBeCloseTo(35.5, 5);
			expect(station?.lng).toBeCloseTo(-90.5, 5);
		});
	});

	it('refuses a second station with the same name, case and spacing aside', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_dupe');
			await writeStation(
				db,
				createWeatherStationCommand({
					organizationId,
					actorProfileId,
					weatherStationId: uuid(1),
					stationName: 'North Gauge',
					geometry: PIN,
				}),
			);

			// The unique index is on `lower(trim(source_name))`, so this is the same
			// name as far as an agency reading a list is concerned.
			const refusal = await refused(
				writeStation(
					db,
					createWeatherStationCommand({
						organizationId,
						actorProfileId,
						weatherStationId: uuid(2),
						stationName: '  north gauge ',
						geometry: OTHER_PIN,
					}),
				),
			);

			expect(refusal).toMatchObject({ status: 409, body: { error: 'weather_station_duplicate' } });
		});
	});

	it('lets another agency use the same station name', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await agency(db, 'station_name_mine');
			const theirs = await agency(db, 'station_name_theirs');
			const command = (organizationId: string, actorProfileId: string, id: string) =>
				createWeatherStationCommand({
					organizationId,
					actorProfileId,
					weatherStationId: id,
					stationName: 'North Gauge',
					geometry: PIN,
				});

			await writeStation(db, command(mine.organizationId, mine.actorProfileId, uuid(1)));
			const second = await writeStation(
				db,
				command(theirs.organizationId, theirs.actorProfileId, uuid(2)),
			);

			// Uniqueness is per organization. Two districts either side of a county
			// line both having a "North Gauge" is ordinary.
			expect(second).toMatchObject({ organizationId: theirs.organizationId });
		});
	});

	it('answers a station the agency does not own as if it were not there', async () => {
		await withTestDb(async ({ db }) => {
			const owner = await agency(db, 'station_owner');
			const stranger = await agency(db, 'station_stranger');
			const stationId = uuid(1);
			await writeStation(
				db,
				createWeatherStationCommand({
					organizationId: owner.organizationId,
					actorProfileId: owner.actorProfileId,
					weatherStationId: stationId,
					stationName: 'North Gauge',
					geometry: PIN,
				}),
			);

			const answer = await writeStation(
				db,
				updateWeatherStationDetailsCommand({
					organizationId: stranger.organizationId,
					actorProfileId: stranger.actorProfileId,
					weatherStationId: stationId,
					stationName: 'Renamed',
				}),
			);

			// `null` is what `runCommands` turns into a 404. "Not yours" and "not
			// there" have to be the same answer, or the endpoint becomes a way to
			// probe another agency's ids.
			expect(answer).toBeNull();
			const stored = await db
				.selectFrom('weather_sources')
				.select('source_name')
				.where('id', '=', stationId)
				.executeTakeFirstOrThrow();
			expect(stored.source_name).toBe('North Gauge');
		});
	});

	it('asks before renaming a station that already has summaries', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_rename_ack');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-01');

			const refusal = await refused(
				writeStation(
					db,
					updateWeatherStationDetailsCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						stationName: 'Renamed',
						acknowledgedHistoricalStationIdentityChange: false,
					}),
				),
			);

			expect(refusal).toMatchObject({
				status: 409,
				body: { error: 'weather_station_identity_change_unacknowledged' },
			});
		});
	});

	it('renames a station with no summaries without asking', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_rename_free');
			const stationId = await seedStation(db, organizationId, actorProfileId);

			const station = await writeStation(
				db,
				updateWeatherStationDetailsCommand({
					organizationId,
					actorProfileId,
					weatherStationId: stationId,
					stationName: 'Renamed',
					acknowledgedHistoricalStationIdentityChange: false,
				}),
			);

			// Nothing to rewrite, so nothing to confirm. The acknowledgement is about
			// history, not about the edit.
			expect(station).toMatchObject({ stationName: 'Renamed' });
		});
	});

	it('asks before moving a station that already has summaries', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_move_ack');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-01');

			const refusal = await refused(
				writeStation(
					db,
					updateWeatherStationLocationCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						geometry: OTHER_PIN,
						acknowledgedHistoricalLocationChange: false,
					}),
				),
			);

			// Summaries do not snapshot where the station stood, so moving one moves
			// every reading ever taken there.
			expect(refusal).toMatchObject({
				status: 409,
				body: { error: 'weather_station_location_change_unacknowledged' },
			});
		});
	});

	it('refuses a stale write when the client said what it had loaded', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_conflict');
			const stationId = await seedStation(db, organizationId, actorProfileId);

			const refusal = await refused(
				writeStation(
					db,
					updateWeatherStationDetailsCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						stationName: 'Renamed',
						expectedUpdatedAt: new Date('2020-01-01T00:00:00.000Z'),
					}),
				),
			);

			expect(refusal).toMatchObject({
				status: 409,
				body: { error: 'weather_station_conflict' },
			});
		});
	});

	it('deletes a station by taking its summaries with it', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_delete');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-01');
			await seedSummary(db, organizationId, stationId, '2026-06-02', '2026-06-04');

			const station = await writeStation(
				db,
				deleteWeatherStationCommand({
					organizationId,
					actorProfileId,
					weatherStationId: stationId,
					acknowledgedSummaryDeletion: true,
				}),
			);

			expect(station).not.toBeNull();
			const stored = await db
				.selectFrom('weather_sources')
				.select(['deleted_at', 'deleted_by_profile_id'])
				.where('id', '=', stationId)
				.executeTakeFirstOrThrow();
			// The station is retired, not removed: reports that already name it keep
			// resolving.
			expect(stored.deleted_at).not.toBeNull();
			expect(stored.deleted_by_profile_id).toBe(actorProfileId);
			// The summaries are gone for good. They have no `deleted_at` of their
			// own, so leaving them would leave rows nothing can reach.
			const left = await db
				.selectFrom('weather_summaries')
				.select('id')
				.where('weather_source_id', '=', stationId)
				.execute();
			expect(left).toEqual([]);
		});
	});

	it('will not delete a station with summaries unless the loss is acknowledged', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'station_delete_ack');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-01');

			const refusal = await refused(
				writeStation(
					db,
					deleteWeatherStationCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						acknowledgedSummaryDeletion: false,
					}),
				),
			);

			expect(refusal).toMatchObject({
				status: 409,
				body: { error: 'weather_station_summary_deletion_unacknowledged' },
			});
			// Refused before anything ran, so the summary is still there.
			const left = await db
				.selectFrom('weather_summaries')
				.select('id')
				.where('weather_source_id', '=', stationId)
				.execute();
			expect(left).toHaveLength(1);
		});
	});

	// ------------------------------------------------------------------
	// Summaries
	// ------------------------------------------------------------------

	it('writes a bucket with the agency on it', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_create');
			const stationId = await seedStation(db, organizationId, actorProfileId);

			const summary = await writeSummary(
				db,
				createWeatherSummaryCommand({
					organizationId,
					actorProfileId,
					weatherStationId: stationId,
					weatherSummaryId: uuid(9),
					startDate: '2026-06-01',
					endDate: '2026-06-03',
					precipitationInches: 1.25,
					temperatureMinF: 54,
					temperatureMaxF: 78.5,
				}),
			);

			expect(summary).toMatchObject({
				weatherStationId: stationId,
				// `shape-scopes.ts` reads this table as `organization-or-global`, so a
				// null here would sync one agency's rain to every agency.
				organizationId,
				precipitationInches: 1.25,
			});
		});
	});

	it('refuses a bucket that straddles one the station already holds', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_overlap');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-03');

			// Not a duplicate of anything, so the unique index does not see it. This
			// is the case the missing exclusion constraint would have caught.
			const refusal = await refused(
				writeSummary(
					db,
					createWeatherSummaryCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						weatherSummaryId: uuid(9),
						startDate: '2026-06-03',
						endDate: '2026-06-05',
						precipitationInches: 0.5,
					}),
				),
			);

			expect(refusal).toMatchObject({ status: 409, body: { error: 'weather_summary_overlap' } });
		});
	});

	it('allows a bucket that starts the day after another ends', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_adjacent');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-03');

			const summary = await writeSummary(
				db,
				createWeatherSummaryCommand({
					organizationId,
					actorProfileId,
					weatherStationId: stationId,
					weatherSummaryId: uuid(9),
					startDate: '2026-06-04',
					endDate: '2026-06-06',
					precipitationInches: 0.5,
				}),
			);

			// Both ends are inclusive, so adjacent buckets share no day. A gauge read
			// every third day produces exactly this.
			expect(summary).not.toBeNull();
		});
	});

	it('judges an edited bucket by the dates it would end up with', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_widen');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			const first = await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-02');
			await seedSummary(db, organizationId, stationId, '2026-06-05', '2026-06-06');

			// Only one end moves. Checking the submitted half alone would let a client
			// widen a bucket over its neighbour one end at a time.
			const refusal = await refused(
				writeSummary(
					db,
					updateWeatherSummaryCommand({
						organizationId,
						actorProfileId,
						weatherSummaryId: first,
						endDate: '2026-06-05',
					}),
				),
			);

			expect(refusal).toMatchObject({ status: 409, body: { error: 'weather_summary_overlap' } });
		});
	});

	it('does not count a bucket as overlapping itself', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_self');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			const summaryId = await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-03');

			const summary = await writeSummary(
				db,
				updateWeatherSummaryCommand({
					organizationId,
					actorProfileId,
					weatherSummaryId: summaryId,
					precipitationInches: 2.5,
				}),
			);

			expect(summary).toMatchObject({ precipitationInches: 2.5 });
		});
	});

	it('clears a metric on an explicit null and leaves an unnamed one alone', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_patch');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			const summaryId = await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-01');

			const summary = await writeSummary(
				db,
				updateWeatherSummaryCommand({
					organizationId,
					actorProfileId,
					weatherSummaryId: summaryId,
					precipitationInches: null,
				}),
			);

			// The seed carries precipitation and a temperature pair. The patch names
			// one field, so the others must survive untouched.
			expect(summary).toMatchObject({
				precipitationInches: null,
				temperatureMinF: 54,
				temperatureMaxF: 78,
			});
		});
	});

	it('refuses a manual entry against an inactive station', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_inactive');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await db
				.updateTable('weather_sources')
				.set({ is_active: false })
				.where('id', '=', stationId)
				.execute();

			const refusal = await refused(
				writeSummary(
					db,
					createWeatherSummaryCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						weatherSummaryId: uuid(9),
						startDate: '2026-06-01',
						endDate: '2026-06-01',
						precipitationInches: 1,
					}),
				),
			);

			// An inactive station is one the agency has stopped reading. Correcting
			// its history stays open; adding to it does not.
			expect(refusal).toMatchObject({ status: 409, body: { error: 'weather_station_inactive' } });
		});
	});

	it('deletes a summary outright, and finds nothing the second time', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'summary_delete');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			const summaryId = await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-01');
			const command = deleteWeatherSummaryCommand({
				organizationId,
				actorProfileId,
				weatherSummaryId: summaryId,
			});

			const first = await writeSummary(db, command);
			const second = await writeSummary(db, command);

			expect(first).toMatchObject({ id: summaryId });
			// Not idempotent, by the domain's rule: a second delete is a 404 rather
			// than a claim to have removed the row again.
			expect(second).toBeNull();
		});
	});

	// ------------------------------------------------------------------
	// The import
	// ------------------------------------------------------------------

	it('sorts an import into inserts, updates and no-changes by re-reading the station', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'import_mixed');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			const unchanged = await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-01');
			const changed = await seedSummary(db, organizationId, stationId, '2026-06-02', '2026-06-02');

			const result = await runImport(
				db,
				commitWeatherSummaryImportCommand({
					organizationId,
					actorProfileId,
					weatherStationId: stationId,
					acknowledgedUpdates: true,
					rows: [
						// Byte for byte what the row already holds.
						importRow('row-1', uuid(11), '2026-06-01', '2026-06-01', {
							precipitationInches: 1.25,
							temperatureMinF: 54,
							temperatureMaxF: 78,
						}),
						// Same bucket, different reading.
						importRow('row-2', uuid(12), '2026-06-02', '2026-06-02', {
							precipitationInches: 3,
						}),
						// A bucket the station does not hold.
						importRow('row-3', uuid(13), '2026-06-03', '2026-06-03', {
							precipitationInches: 0.25,
						}),
					],
				}),
			);

			expect(result?.counts).toEqual({ inserted: 1, updated: 1, noChange: 1, failed: 0 });
			// The proposed id is honoured for an insert and ignored for an update:
			// the row that already holds the bucket keeps its own id, because
			// anything already pointing at it still has to resolve.
			expect(result?.rows).toEqual([
				expect.objectContaining({ clientRowId: 'row-1', status: 'noChange', weatherSummaryId: unchanged }),
				expect.objectContaining({ clientRowId: 'row-2', status: 'updated', weatherSummaryId: changed }),
				expect.objectContaining({ clientRowId: 'row-3', status: 'inserted', weatherSummaryId: uuid(13) }),
			]);

			// An update is a full-row replacement, not a patch: the temperatures the
			// spreadsheet did not carry are cleared rather than left standing.
			const stored = await db
				.selectFrom('weather_summaries')
				.select(['precipitation_inches', 'temperature_min_f'])
				.where('id', '=', changed)
				.executeTakeFirstOrThrow();
			expect(stored).toMatchObject({ precipitation_inches: 3, temperature_min_f: null });
		});
	});

	it('writes nothing at all when an overwrite was not agreed to', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'import_ack');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-02', '2026-06-02');

			const refusal = await refused(
				runImport(
					db,
					commitWeatherSummaryImportCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						rows: [
							importRow('row-1', uuid(11), '2026-06-02', '2026-06-02', { precipitationInches: 9 }),
							importRow('row-2', uuid(12), '2026-06-03', '2026-06-03', { precipitationInches: 1 }),
						],
					}),
				),
			);

			expect(refusal).toMatchObject({
				status: 409,
				body: { error: 'weather_import_updates_unacknowledged' },
			});
			// All or nothing. The row that would only have inserted is not written
			// either, so the user is answering a question rather than mopping up a
			// half-finished import.
			const rows = await db
				.selectFrom('weather_summaries')
				.select('id')
				.where('weather_source_id', '=', stationId)
				.execute();
			expect(rows).toHaveLength(1);
		});
	});

	it('will not write the good rows of a partly bad file without consent', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'import_partial');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-05');

			const refusal = await refused(
				runImport(
					db,
					commitWeatherSummaryImportCommand({
						organizationId,
						actorProfileId,
						weatherStationId: stationId,
						rows: [
							importRow('row-1', uuid(11), '2026-06-10', '2026-06-10', { precipitationInches: 1 }),
							// Straddles the stored 1st-to-5th bucket, so it cannot be written.
							importRow('row-2', uuid(12), '2026-06-04', '2026-06-06', { precipitationInches: 2 }),
						],
					}),
				),
			);

			expect(refusal).toMatchObject({
				status: 409,
				body: { error: 'weather_import_partial_unacknowledged' },
			});
		});
	});

	it('writes the good rows and reports the bad ones once partial import is agreed', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId, actorProfileId } = await agency(db, 'import_partial_ok');
			const stationId = await seedStation(db, organizationId, actorProfileId);
			await seedSummary(db, organizationId, stationId, '2026-06-01', '2026-06-05');

			const result = await runImport(
				db,
				commitWeatherSummaryImportCommand({
					organizationId,
					actorProfileId,
					weatherStationId: stationId,
					acknowledgedPartialImport: true,
					rows: [
						importRow('row-1', uuid(11), '2026-06-10', '2026-06-10', { precipitationInches: 1 }),
						importRow('row-2', uuid(12), '2026-06-04', '2026-06-06', { precipitationInches: 2 }),
					],
				}),
			);

			expect(result?.counts).toEqual({ inserted: 1, updated: 0, noChange: 0, failed: 1 });
			// A failed row comes back with the reason against a path the client can
			// map to a spreadsheet line.
			expect(result?.rows[1]).toMatchObject({
				clientRowId: 'row-2',
				status: 'failed',
				weatherSummaryId: null,
			});
			expect(result?.rows[1]?.issues[0]?.path).toBe('dateRange');
		});
	});

	it('refuses an import against a station the agency does not own', async () => {
		await withTestDb(async ({ db }) => {
			const owner = await agency(db, 'import_owner');
			const stranger = await agency(db, 'import_stranger');
			const stationId = await seedStation(db, owner.organizationId, owner.actorProfileId);

			const result = await runImport(
				db,
				commitWeatherSummaryImportCommand({
					organizationId: stranger.organizationId,
					actorProfileId: stranger.actorProfileId,
					weatherStationId: stationId,
					rows: [importRow('row-1', uuid(11), '2026-06-01', '2026-06-01', { precipitationInches: 1 })],
				}),
			);

			// The same "as if it were not there" answer the row commands give.
			expect(result).toBeNull();
			const rows = await db
				.selectFrom('weather_summaries')
				.select('id')
				.where('weather_source_id', '=', stationId)
				.execute();
			expect(rows).toEqual([]);
		});
	});
});

// ===========================================================================
// Running a writer
// ===========================================================================

/**
 * A writer, in its own transaction, with the refusals left to propagate.
 *
 * `writeCommands` is what the routes use, and it adds the ownership resolver and
 * the txid read. Neither is under test here — `command-write.test.ts` owns the
 * first and no weather command carries an ownership rule — and going without
 * them keeps a refusal a `CommandError` rather than a `Response`.
 */
async function writeStation(db: Db, command: WeatherCommand) {
	return db.transaction().execute((trx) => writeWeatherStationCommand(trx as CommandTransaction, command));
}

async function writeSummary(db: Db, command: WeatherCommand) {
	return db.transaction().execute((trx) => writeWeatherSummaryCommand(trx as CommandTransaction, command));
}

async function runImport(db: Db, command: CommitWeatherSummaryImportCommand) {
	return db
		.transaction()
		.execute((trx) => commitWeatherSummaryImport(trx as CommandTransaction, command));
}

/** The refusal a writer raised, as something a matcher can read. */
async function refused(
	pending: Promise<unknown>,
): Promise<{ readonly status: number; readonly body: unknown } | null> {
	try {
		await pending;
		return null;
	} catch (error) {
		if (error instanceof CommandError) {
			return { status: error.status, body: error.body };
		}
		throw error;
	}
}

// ===========================================================================
// Fixtures
// ===========================================================================

async function agency(
	db: Db,
	slug: string,
): Promise<{ readonly organizationId: string; readonly actorProfileId: string }> {
	const organization = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const profile = await db
		.insertInto('profiles')
		.values({ organization_id: organization.id, display_name: 'Technician' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return { organizationId: organization.id, actorProfileId: profile.id };
}

async function seedStation(
	db: Db,
	organizationId: string,
	actorProfileId: string,
): Promise<string> {
	const row = await db
		.insertInto('weather_sources')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			source_type: 'organization',
			source_name: 'North Gauge',
			created_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/** A bucket carrying rain and a temperature pair, so a patch has something to leave alone. */
async function seedSummary(
	db: Db,
	organizationId: string,
	weatherStationId: string,
	startDate: string,
	endDate: string,
): Promise<string> {
	const row = await db
		.insertInto('weather_summaries')
		.values({
			organization_id: organizationId,
			weather_source_id: weatherStationId,
			start_date: sql`${startDate}::date`,
			end_date: sql`${endDate}::date`,
			precipitation_inches: 1.25,
			temperature_min_f: 54,
			temperature_max_f: 78,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

function importRow(
	clientRowId: string,
	weatherSummaryId: string,
	startDate: string,
	endDate: string,
	metrics: {
		readonly precipitationInches?: number;
		readonly temperatureMinF?: number;
		readonly temperatureMaxF?: number;
	},
) {
	return {
		clientRowId,
		weatherSummaryId,
		startDate,
		endDate,
		temperatureMinF: metrics.temperatureMinF ?? null,
		temperatureMaxF: metrics.temperatureMaxF ?? null,
		precipitationInches: metrics.precipitationInches ?? null,
		relativeHumidityMin: null,
		relativeHumidityMax: null,
		windSpeedMinMph: null,
		windSpeedMaxMph: null,
	};
}

/** A distinct, valid v4-shaped uuid per slot. */
function uuid(slot: number): string {
	const tail = slot.toString().padStart(12, '0');
	return `00000000-0000-4000-8000-${tail}`;
}

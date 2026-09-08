import { eq, useLiveQuery } from '@tanstack/react-db';
import { useCallback, useEffect, useRef } from 'react';
import {
	type CommitBaseline,
	flushedKeysAfter,
	planCommit,
} from '../../components/key-entry/commit-plan';
import { KeyEntryDialog } from '../../components/key-entry/key-entry-dialog';
import {
	entryKeyFor,
	NO_VARIANT,
	type TallyEntry,
} from '../../components/key-entry/use-key-entry-tally';
import {
	type SampleSpeciesFields,
	useSampleSpeciesMutations,
} from '../../hooks/mutations/use-sample-species-mutations';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { useSpeciesKeyBindings } from '../../hooks/use-species-key-bindings';
import { sample_species } from '../../lib/collections/sample_species';
import { todayInTimeZone } from './-overview-data';

/** One identification row, as the tally grid reads and writes it. */
interface KeyEntryRow extends SampleSpeciesFields {
	readonly id: string;
}

/**
 * Larval identification counts larvae per species and nothing else — no sex or
 * physiological status — so the modal runs without a mode bar and `sample_species`
 * holds at most one row per species.
 */
export function SampleKeyEntryDialog({
	open,
	onOpenChange,
	sampleId,
	actorProfileId,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly sampleId: string;
	readonly actorProfileId: string | null;
}) {
	const bindings = useSpeciesKeyBindings();
	const mutations = useSampleSpeciesMutations();
	const timeZone = useOrganizationTimeZone();

	const result = useLiveQuery(
		{
			query: (query) =>
				query
					.from({ sampleSpecies: sample_species() })
					.where(({ sampleSpecies }) => eq(sampleSpecies.sample_id, sampleId))
					.select(({ sampleSpecies }) => ({
						id: sampleSpecies.id,
						speciesId: sampleSpecies.species_id,
						larvaeCount: sampleSpecies.larvae_count,
						identifiedByProfileId: sampleSpecies.identified_by_profile_id,
						identifiedAt: sampleSpecies.identified_at,
					})),
		},
		[sampleId],
	);
	const rows = (result.data ?? []) as readonly KeyEntryRow[];

	// See the adult dialog: commits set each row to baseline + tally so repeated
	// auto-save flushes stay idempotent and undo walks the count back down.
	const baselineRef = useRef<ReadonlyMap<string, CommitBaseline>>(new Map());
	const insertedRef = useRef<Map<string, string>>(new Map());
	const flushedRef = useRef<ReadonlySet<string>>(new Set());

	const rowsRef = useRef(rows);
	rowsRef.current = rows;

	useEffect(() => {
		if (!open) {
			return;
		}
		baselineRef.current = new Map(
			rowsRef.current.map(
				(row) =>
					[
						entryKeyFor(row.speciesId, NO_VARIANT),
						{ rowId: row.id, count: row.larvaeCount },
					] as const,
			),
		);
		insertedRef.current = new Map();
		flushedRef.current = new Set();
	}, [open]);

	const commit = useCallback(
		async (entries: readonly TallyEntry[]) => {
			const steps = planCommit({
				entries,
				baseline: baselineRef.current,
				inserted: insertedRef.current,
				flushed: flushedRef.current,
			});
			const writes = steps.map((step) => {
				if (step.kind === 'update') {
					const current = rowsRef.current.find((row) => row.id === step.rowId);
					return current === undefined
						? Promise.resolve()
						: mutations.save(step.rowId, { ...current, larvaeCount: step.count }, current);
				}
				if (step.kind === 'delete') {
					insertedRef.current.delete(step.entryKey);
					return mutations.remove(step.rowId);
				}

				const id = crypto.randomUUID();
				// Remember the id only once the insert sticks. A rejected insert is rolled
				// back out of the collection, so recording it up front would leave the next
				// flush trying to update a row that no longer exists.
				return mutations
					.add({
						sampleSpeciesId: id,
						sampleId,
						fields: {
							speciesId: step.speciesId,
							larvaeCount: step.count,
							identifiedByProfileId: actorProfileId,
							// A calendar date, not a timestamp — the domain builder validates
							// identifiedAt against YYYY-MM-DD and rejects a full ISO string.
							identifiedAt: todayInTimeZone(timeZone),
						},
					})
					.then(() => {
						insertedRef.current.set(step.entryKey, id);
					});
			});

			await Promise.all(writes);
			flushedRef.current = flushedKeysAfter(entries);
		},
		[actorProfileId, sampleId, timeZone, mutations],
	);

	return (
		<KeyEntryDialog
			bindings={bindings}
			countLabel="larvae"
			description="Press a species key to tally a larva into this sample."
			mode={null}
			onCommit={commit}
			onOpenChange={onOpenChange}
			open={open}
			title="Key entry"
		/>
	);
}

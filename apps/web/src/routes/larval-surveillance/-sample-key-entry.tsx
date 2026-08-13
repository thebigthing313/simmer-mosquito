import type { SampleSpeciesRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
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
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { useSpeciesKeyBindings } from '../../hooks/use-species-key-bindings';
import { webCollections } from '../../sync/webCollections';
import { todayInTimeZone } from './-overview-data';

/**
 * Larval identification counts larvae per species and nothing else — no sex or
 * physiological status — so the modal runs without a mode bar and `sample_species`
 * holds at most one row per species.
 */
export function SampleKeyEntryDialog({
	open,
	onOpenChange,
	sampleId,
	organizationId,
	actorProfileId,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly sampleId: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
}) {
	const bindings = useSpeciesKeyBindings();
	const timeZone = useOrganizationTimeZone();

	const result = useLiveQuery(
		{
			query: (query) =>
				query
					.from({ sampleSpecies: webCollections.sampleSpecies })
					.where(({ sampleSpecies }) => eq(sampleSpecies.sampleId, sampleId)),
		},
		[sampleId],
	);
	const rows = (result.data ?? []) as readonly SampleSpeciesRow[];

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
			const now = new Date().toISOString();

			const writes = steps.map((step) => {
				if (step.kind === 'update') {
					return updateCount(step.rowId, step.count, actorProfileId);
				}
				if (step.kind === 'delete') {
					insertedRef.current.delete(step.entryKey);
					return settleWrite(webCollections.sampleSpecies.delete(step.rowId));
				}

				const id = crypto.randomUUID();
				const row: SampleSpeciesRow = {
					id,
					organizationId,
					sampleId,
					speciesId: step.speciesId,
					larvaeCount: step.count,
					identifiedByProfileId: actorProfileId,
					// A calendar date, not a timestamp — the domain builder validates
					// identifiedAt against YYYY-MM-DD and rejects a full ISO string.
					identifiedAt: todayInTimeZone(timeZone),
					createdByProfileId: actorProfileId,
					updatedByProfileId: actorProfileId,
					createdAt: now,
					updatedAt: now,
				};
				// Remember the id only once the insert sticks. A rejected insert is rolled
				// back out of the collection, so recording it up front would leave the next
				// flush trying to update a row that no longer exists.
				return settleWrite(webCollections.sampleSpecies.insert(row)).then(() => {
					insertedRef.current.set(step.entryKey, id);
				});
			});

			await Promise.all(writes);
			flushedRef.current = flushedKeysAfter(entries);
		},
		[actorProfileId, organizationId, sampleId, timeZone],
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

function updateCount(rowId: string, count: number, actorProfileId: string | null): Promise<void> {
	return settleWrite(
		webCollections.sampleSpecies.update(rowId, (draft) => {
			const mutable = draft as { larvaeCount: number; updatedByProfileId: string | null };
			mutable.larvaeCount = count;
			mutable.updatedByProfileId = actorProfileId;
		}),
	);
}

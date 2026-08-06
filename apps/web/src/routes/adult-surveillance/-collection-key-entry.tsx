import type { CollectionSpeciesRow, SpeciesSex, SpeciesStatus } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useCallback, useEffect, useRef } from 'react';
import {
	type CommitBaseline,
	flushedKeysAfter,
	planCommit,
} from '../../components/key-entry/commit-plan';
import { KeyEntryDialog, type VariantMode } from '../../components/key-entry/key-entry-dialog';
import {
	entryKeyFor,
	type TallyEntry,
	type TallyVariant,
} from '../../components/key-entry/use-key-entry-tally';
import { useSpeciesKeyBindings } from '../../hooks/use-species-key-bindings';
import { webCollections } from '../../sync/webCollections';
import {
	SPECIES_SEX_VALUES,
	SPECIES_STATUS_VALUES,
	speciesSexLabel,
	speciesStatusLabel,
} from './-adult-display';
import { todayInTimeZone } from './-overview-data';

/**
 * Adult identification defaults to females with no status recorded — the counts a
 * surveillance program acts on. The mode bar carries whatever the tech selects to
 * every subsequent press, so a tray sorted by status is entered in one pass per pile.
 */
const ADULT_VARIANT_MODE: VariantMode = {
	sexOptions: [
		...SPECIES_SEX_VALUES.map((value) => ({ value, label: speciesSexLabel(value) })),
		{ value: null, label: 'Unsexed' },
	],
	statusOptions: [
		{ value: null, label: 'None' },
		...SPECIES_STATUS_VALUES.map((value) => ({ value, label: speciesStatusLabel(value) })),
	],
	defaultVariant: { sex: 'female', status: null },
	describe: (variant) =>
		variant.status === null
			? speciesSexLabel(variant.sex as SpeciesSex | null)
			: `${speciesSexLabel(variant.sex as SpeciesSex | null)} · ${speciesStatusLabel(
					variant.status as SpeciesStatus,
				)}`,
};

export function CollectionKeyEntryDialog({
	open,
	onOpenChange,
	collectionId,
	organizationId,
	actorProfileId,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly collectionId: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
}) {
	const bindings = useSpeciesKeyBindings();

	const result = useLiveQuery(
		{
			query: (query) =>
				query
					.from({ collectionSpecies: webCollections.collectionSpecies })
					.where(({ collectionSpecies }) => eq(collectionSpecies.collectionId, collectionId)),
		},
		[collectionId],
	);
	const rows = (result.data ?? []) as readonly CollectionSpeciesRow[];

	// What was already recorded when the modal opened, plus what this session has
	// written. `planCommit` reads all three to turn the tally into absolute targets.
	const baselineRef = useRef<ReadonlyMap<string, CommitBaseline>>(new Map());
	const insertedRef = useRef<Map<string, string>>(new Map());
	const flushedRef = useRef<ReadonlySet<string>>(new Set());

	const rowsRef = useRef(rows);
	rowsRef.current = rows;

	useEffect(() => {
		if (!open) {
			return;
		}
		baselineRef.current = baselineFrom(rowsRef.current);
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
					return settleWrite(webCollections.collectionSpecies.delete(step.rowId));
				}

				const id = crypto.randomUUID();
				const row: CollectionSpeciesRow = {
					id,
					organizationId,
					collectionId,
					speciesId: step.speciesId,
					count: step.count,
					sex: step.variant.sex as SpeciesSex | null,
					status: step.variant.status as SpeciesStatus | null,
					identifiedByProfileId: actorProfileId,
					identifiedDate: todayInTimeZone(undefined),
					createdByProfileId: actorProfileId,
					updatedByProfileId: actorProfileId,
					createdAt: now,
					updatedAt: now,
				};
				// Remember the id only once the insert sticks. A rejected insert is rolled
				// back out of the collection, so recording it up front would leave the next
				// flush trying to update a row that no longer exists.
				return settleWrite(webCollections.collectionSpecies.insert(row)).then(() => {
					insertedRef.current.set(step.entryKey, id);
				});
			});

			await Promise.all(writes);
			flushedRef.current = flushedKeysAfter(entries);
		},
		[actorProfileId, collectionId, organizationId],
	);

	return (
		<KeyEntryDialog
			bindings={bindings}
			countLabel="specimens"
			description="Press a species key to tally a specimen. Sex and status apply to every press until you change them."
			mode={ADULT_VARIANT_MODE}
			onCommit={commit}
			onOpenChange={onOpenChange}
			open={open}
			title="Key entry"
		/>
	);
}

/**
 * The first active row per species/sex/status. `collection_species` carries no
 * uniqueness constraint, so a duplicate pair can exist; keying off the earliest row
 * leaves any other alone rather than silently folding them together.
 */
function baselineFrom(rows: readonly CollectionSpeciesRow[]): ReadonlyMap<string, CommitBaseline> {
	const baseline = new Map<string, CommitBaseline>();
	const ordered = [...rows].sort((first, second) =>
		first.createdAt.localeCompare(second.createdAt),
	);
	for (const row of ordered) {
		const entryKey = entryKeyFor(row.speciesId, variantOf(row));
		if (!baseline.has(entryKey)) {
			baseline.set(entryKey, { rowId: row.id, count: row.count });
		}
	}
	return baseline;
}

function variantOf(row: CollectionSpeciesRow): TallyVariant {
	return { sex: row.sex, status: row.status };
}

function updateCount(rowId: string, count: number, actorProfileId: string | null): Promise<void> {
	return settleWrite(
		webCollections.collectionSpecies.update(rowId, (draft) => {
			const mutable = draft as { count: number; updatedByProfileId: string | null };
			mutable.count = count;
			mutable.updatedByProfileId = actorProfileId;
		}),
	);
}

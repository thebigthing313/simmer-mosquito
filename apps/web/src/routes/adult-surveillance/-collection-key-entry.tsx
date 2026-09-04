import type { SpeciesSex, SpeciesStatus } from '@simmer-mosquito/domain';
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
import { newRecordId } from '../../hooks/mutations/shared';
import { useCollectionSpeciesMutations } from '../../hooks/mutations/use-collection-species-mutations';
import {
	type CollectionIdentification,
	useCollectionIdentifications,
} from '../../hooks/queries/use-collection-identifications';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { useSpeciesKeyBindings } from '../../hooks/use-species-key-bindings';
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
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly collectionId: string;
}) {
	const bindings = useSpeciesKeyBindings();
	const timeZone = useOrganizationTimeZone();
	const { identifications } = useCollectionIdentifications(collectionId);
	const mutations = useCollectionSpeciesMutations();

	// What was already recorded when the modal opened, plus what this session has
	// written. `planCommit` reads all three to turn the tally into absolute targets.
	const baselineRef = useRef<ReadonlyMap<string, CommitBaseline>>(new Map());
	const insertedRef = useRef<Map<string, string>>(new Map());
	const flushedRef = useRef<ReadonlySet<string>>(new Set());

	const rowsRef = useRef(identifications);
	rowsRef.current = identifications;

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

			const writes = steps.map((step) => {
				if (step.kind === 'update') {
					return mutations.save(step.rowId, { count: step.count });
				}
				if (step.kind === 'delete') {
					insertedRef.current.delete(step.entryKey);
					return mutations.remove(step.rowId);
				}

				const collectionSpeciesId = newRecordId();
				// Remember the id only once the insert sticks. A rejected insert is rolled
				// back out of the collection, so recording it up front would leave the next
				// flush trying to update a row that no longer exists.
				return mutations
					.add({
						collectionId,
						collectionSpeciesId,
						identifiedDate: todayInTimeZone(timeZone),
						fields: {
							speciesId: step.speciesId,
							count: step.count,
							sex: step.variant.sex as SpeciesSex | null,
							status: step.variant.status as SpeciesStatus | null,
						},
					})
					.then(() => {
						insertedRef.current.set(step.entryKey, collectionSpeciesId);
					});
			});

			await Promise.all(writes);
			flushedRef.current = flushedKeysAfter(entries);
		},
		[collectionId, timeZone, mutations],
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
 *
 * The read seam hands `created_at` up as the `Date` the row schema parses, so the
 * ordering is by instant rather than by the lexical compare the raw string
 * allowed.
 */
function baselineFrom(
	rows: readonly CollectionIdentification[],
): ReadonlyMap<string, CommitBaseline> {
	const baseline = new Map<string, CommitBaseline>();
	const ordered = [...rows].sort(
		(first, second) => first.createdAt.getTime() - second.createdAt.getTime(),
	);
	for (const row of ordered) {
		const entryKey = entryKeyFor(row.speciesId, variantOf(row));
		if (!baseline.has(entryKey)) {
			baseline.set(entryKey, { rowId: row.id, count: row.count });
		}
	}
	return baseline;
}

function variantOf(row: CollectionIdentification): TallyVariant {
	return { sex: row.sex, status: row.status };
}

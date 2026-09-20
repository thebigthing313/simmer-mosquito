import { Autocomplete } from '@simmer-mosquito/ui-web/components/ui/autocomplete';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { NumberInput } from '@simmer-mosquito/ui-web/components/ui/number-input';
import { iconRegistry, Loader2Icon, PlusIcon, XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import type { SampleSpeciesFields } from '../../../hooks/mutations/use-sample-species-mutations';
import { SectionLabel } from './section-label';

// Identification is about the mosquitoes in the sample, not the taxonomy tree the
// names come from. The same mark heads the card on adult collections.
const SpeciesIcon = iconRegistry.simmer.mosquito.icon;

/**
 * One identification as this page holds it.
 *
 * The same four fields `useSampleSpeciesMutations` compares against, plus the
 * id — so a count correction can be handed straight to `save` without the page
 * rebuilding the current values from somewhere else.
 */
export interface SampleSpeciesEntry extends SampleSpeciesFields {
	readonly id: string;
}

export interface SpeciesOption {
	readonly id: string;
	readonly label: string;
}

/** Species names are binomials, so they read italic wherever they appear. */
function renderSpeciesOption(option: { readonly label: string }) {
	return <span className="italic">{option.label}</span>;
}

/**
 * The identified species on a sample, one row each with an editable count, and
 * the row that adds one. Takes the rows, the species names to draw them with,
 * and the three writes; the page it sits on owns the queries and the commands.
 */
export function SpeciesResultList({
	rows,
	total,
	nameById,
	canManage,
	onUpdateCount,
	onRemove,
}: {
	readonly rows: readonly SampleSpeciesEntry[];
	readonly total: number;
	readonly nameById: ReadonlyMap<string, string>;
	readonly canManage: boolean;
	readonly onUpdateCount: (rowId: string, count: number) => Promise<void>;
	readonly onRemove: (rowId: string) => Promise<void>;
}) {
	if (rows.length === 0) {
		return (
			<div className="grid gap-1.5">
				<SectionLabel>Identified species</SectionLabel>
				<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-4 text-muted-foreground text-sm">
					No species identified yet.
					{canManage ? ' Add one below, or mark the sample’s disposition.' : ''}
				</p>
			</div>
		);
	}

	return (
		<div className="grid gap-1.5">
			<div className="flex items-baseline justify-between gap-3">
				<SectionLabel>Identified species</SectionLabel>
				<span className="text-muted-foreground text-xs">
					{total.toLocaleString('en-US')} larvae total
				</span>
			</div>
			<ul className="grid gap-2">
				{rows.map((row) => (
					<SpeciesResultRow
						canManage={canManage}
						key={row.id}
						name={nameById.get(row.speciesId) ?? 'Unknown species'}
						onRemove={onRemove}
						onUpdateCount={onUpdateCount}
						row={row}
					/>
				))}
			</ul>
		</div>
	);
}

function SpeciesResultRow({
	row,
	name,
	canManage,
	onUpdateCount,
	onRemove,
}: {
	readonly row: SampleSpeciesEntry;
	readonly name: string;
	readonly canManage: boolean;
	readonly onUpdateCount: (rowId: string, count: number) => Promise<void>;
	readonly onRemove: (rowId: string) => Promise<void>;
}) {
	// The draft is held beside the stored count it was typed over, so a count
	// that changes out from under the input (a sync from another device) reads
	// as the new count with no reset, and no render draws the old draft over it.
	const [held, setHeld] = useState<{ readonly stored: number; readonly draft: number | null }>({
		stored: row.larvaeCount,
		draft: row.larvaeCount,
	});
	const draft = held.stored === row.larvaeCount ? held.draft : row.larvaeCount;
	const setDraft = (next: number | null) => setHeld({ stored: row.larvaeCount, draft: next });
	const [busy, setBusy] = useState(false);

	// Commits on blur, Enter, and stepper click; a blank or negative entry reverts to
	// the stored count rather than writing a value the server would reject.
	const commit = async (next: number | null) => {
		if (next === null || !Number.isFinite(next) || next < 0) {
			setDraft(row.larvaeCount);
			return;
		}
		const resolved = Math.trunc(next);
		setDraft(resolved);
		if (resolved === row.larvaeCount) {
			return;
		}
		setBusy(true);
		await onUpdateCount(row.id, resolved).finally(() => setBusy(false));
	};

	const remove = async () => {
		setBusy(true);
		await onRemove(row.id).finally(() => setBusy(false));
	};

	return (
		<li className="flex items-center gap-2 rounded-md border border-border/40 bg-background/60 px-3 py-2">
			<SpeciesIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm italic">
				{name}
			</span>
			{canManage ? (
				<>
					<NumberInput
						aria-label={`Larvae count for ${name}`}
						className="w-28"
						disabled={busy}
						min={0}
						onCommit={(next) => void commit(next)}
						onValueChange={setDraft}
						value={draft}
					/>
					<Button
						aria-label={`Remove ${name}`}
						disabled={busy}
						onClick={() => void remove()}
						size="icon-xs"
						title="Remove Species"
						variant="ghost"
					>
						<XIcon aria-hidden="true" />
					</Button>
				</>
			) : (
				<Badge tone="success" variant="outline">
					<span className="tabular-nums">{row.larvaeCount.toLocaleString('en-US')}</span> larvae
				</Badge>
			)}
		</li>
	);
}

export function AddSpeciesRow({
	options,
	takenSpeciesIds,
	onAdd,
}: {
	readonly options: readonly SpeciesOption[];
	readonly takenSpeciesIds: ReadonlySet<string>;
	readonly onAdd: (speciesId: string, count: number) => Promise<void>;
}) {
	const [speciesId, setSpeciesId] = useState<string | null>(null);
	const [count, setCount] = useState<number | null>(1);
	const [busy, setBusy] = useState(false);

	// `sample_species` holds one row per species, so anything already identified is
	// edited in the list above rather than offered again here.
	const available = options
		.filter((option) => !takenSpeciesIds.has(option.id))
		.map((option) => ({ value: option.id, label: option.label }));

	const canAdd =
		speciesId !== null && count !== null && Number.isFinite(count) && count >= 0 && !busy;

	const submit = async () => {
		if (speciesId === null || count === null || !Number.isFinite(count) || count < 0 || busy) {
			return;
		}
		setBusy(true);
		await onAdd(speciesId, Math.trunc(count)).finally(() => setBusy(false));
		setSpeciesId(null);
		setCount(1);
	};

	return (
		<div className="grid gap-1.5">
			<SectionLabel>Add species</SectionLabel>
			<div className="flex flex-wrap items-center gap-2">
				<div className="min-w-48 flex-1">
					<Autocomplete
						aria-label="Choose species"
						onValueChange={setSpeciesId}
						options={available}
						placeholder="Search species…"
						renderOption={renderSpeciesOption}
						renderSelectedValue={renderSpeciesOption}
						value={speciesId}
					/>
				</div>
				<NumberInput
					aria-label="Larvae count"
					className="w-28"
					min={0}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && canAdd) {
							event.preventDefault();
							void submit();
						}
					}}
					onValueChange={setCount}
					placeholder="Count"
					value={count}
				/>
				<Button disabled={!canAdd} onClick={() => void submit()} size="sm" type="button">
					{busy ? (
						<Loader2Icon aria-hidden="true" className="animate-spin" />
					) : (
						<PlusIcon aria-hidden="true" />
					)}
					Add
				</Button>
			</div>
		</div>
	);
}

import { isBindableKey } from '@simmer-mosquito/domain';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Kbd } from '@simmer-mosquito/ui-web/components/ui/kbd';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { usePersistentFlag } from '@simmer-mosquito/ui-web/hooks/use-persistent-flag';
import {
	iconRegistry,
	KeyboardIcon,
	Loader2Icon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
	ResolvedSpeciesKeyBinding,
	SpeciesKeyBindingsView,
} from '../../hooks/use-species-key-bindings';
import { createCommitQueue } from './commit-queue';
import {
	NO_VARIANT,
	type TallyEntry,
	type TallyVariant,
	useKeyEntryTally,
} from './use-key-entry-tally';

const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

/** How long an idle pause runs before auto-save flushes the tally. */
const AUTO_SAVE_IDLE_MS = 600;

const AUTO_SAVE_PREFERENCE_KEY = 'simmer.key-entry.auto-save';

export interface VariantOption {
	readonly value: string | null;
	readonly label: string;
}

/**
 * The sticky mode bar. Adult identification passes sex and status groups; larval
 * identification passes none and every press records the species alone.
 */
export interface VariantMode {
	readonly sexOptions: readonly VariantOption[];
	readonly statusOptions: readonly VariantOption[];
	readonly defaultVariant: TallyVariant;
	readonly describe: (variant: TallyVariant) => string;
}

export interface KeyEntryDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly title: string;
	readonly description: string;
	readonly bindings: SpeciesKeyBindingsView;
	readonly mode: VariantMode | null;
	/** Unit noun for the running total, e.g. "specimens" or "larvae". */
	readonly countLabel: string;
	/**
	 * Write the tally. Called with every tallied line; the implementation sets each
	 * stored row to `baseline + tally` rather than incrementing, so repeated calls
	 * during auto-save are safe.
	 */
	readonly onCommit: (entries: readonly TallyEntry[]) => Promise<void>;
	/** Rendered under the tally, e.g. a link to manage bindings. */
	readonly footnote?: ReactNode;
}

export function KeyEntryDialog({
	open,
	onOpenChange,
	title,
	description,
	bindings,
	mode,
	countLabel,
	onCommit,
	footnote,
}: KeyEntryDialogProps) {
	const tally = useKeyEntryTally();
	const [autoSave, setAutoSave] = usePersistentFlag(AUTO_SAVE_PREFERENCE_KEY, true);
	const [variant, setVariant] = useState<TallyVariant>(mode?.defaultVariant ?? NO_VARIANT);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const [unknownKey, setUnknownKey] = useState<string | null>(null);

	// The last committed snapshot. Held in state so the footer can react to it, and
	// mirrored into a ref so the async commit path always reads the current value.
	// Note this is a *signature*, not a count: an empty tally that differs from the
	// committed snapshot still has work to do — it means every line written this
	// session was retracted and the rows have to be walked back.
	const [committedSignature, setCommittedSignature] = useState('');
	const committedRef = useRef<string>('');
	const entriesRef = useRef<readonly TallyEntry[]>(tally.entries);
	entriesRef.current = tally.entries;

	const markCommitted = useCallback((signature: string) => {
		committedRef.current = signature;
		setCommittedSignature(signature);
	}, []);

	// The scheduled idle flush, so an explicit save can call it off. Without that, a
	// burst followed straight by Enter leaves the timer to fire mid-save.
	const autoSaveTimerRef = useRef<number | null>(null);
	const cancelScheduledFlush = useCallback(() => {
		if (autoSaveTimerRef.current !== null) {
			window.clearTimeout(autoSaveTimerRef.current);
			autoSaveTimerRef.current = null;
		}
	}, []);

	const enqueueCommitRef = useRef(createCommitQueue());

	const commit = useCallback(
		(entries: readonly TallyEntry[]): Promise<boolean> =>
			// Queued rather than called directly: a flush already in flight has to finish
			// before the next plans, or both read the same pre-write state and insert the
			// same row twice. Once the first lands, the signature check below turns a
			// duplicate request into a no-op.
			enqueueCommitRef.current(async () => {
				const signature = signatureOf(entries);
				if (signature === committedRef.current) {
					return true;
				}
				setBusy(true);
				setError(null);
				try {
					await onCommit(entries);
					markCommitted(signature);
					return true;
				} catch (cause) {
					setError(messageOf(cause, 'Unable to save these counts.'));
					return false;
				} finally {
					setBusy(false);
				}
			}),
		[markCommitted, onCommit],
	);

	const pendingEntries = tally.entries;
	const pendingSignature = useMemo(() => signatureOf(pendingEntries), [pendingEntries]);
	/** Storage does not yet match the tally — including when the tally is now empty. */
	const hasPendingChanges = pendingSignature !== committedSignature;

	// Auto-save flushes on an idle pause rather than per key press: the tally already
	// renders instantly, so a burst of presses becomes one write per species instead of
	// one per keystroke. Each new press replaces the pending timer, so the flush lands
	// once the person stops typing.
	useEffect(() => {
		if (!open || !autoSave || !hasPendingChanges) {
			return;
		}
		const timer = window.setTimeout(() => {
			autoSaveTimerRef.current = null;
			void commit(pendingEntries);
		}, AUTO_SAVE_IDLE_MS);
		autoSaveTimerRef.current = timer;
		return () => {
			window.clearTimeout(timer);
			if (autoSaveTimerRef.current === timer) {
				autoSaveTimerRef.current = null;
			}
		};
	}, [open, autoSave, hasPendingChanges, pendingEntries, commit]);

	// Clear the unknown-key warning once the next press lands.
	useEffect(() => {
		if (unknownKey === null) {
			return;
		}
		const timer = setTimeout(() => {
			setUnknownKey(null);
		}, 2000);
		return () => {
			clearTimeout(timer);
		};
	}, [unknownKey]);

	const reset = useCallback(() => {
		tally.clear();
		markCommitted('');
		setError(null);
		setConfirmDiscard(false);
		setUnknownKey(null);
		setVariant(mode?.defaultVariant ?? NO_VARIANT);
	}, [markCommitted, mode, tally]);

	const requestClose = useCallback(async () => {
		cancelScheduledFlush();
		const hasUnsaved = signatureOf(entriesRef.current) !== committedRef.current;
		if (hasUnsaved && !confirmDiscard) {
			// Auto-save owes the user this write, so try it before closing. A failure
			// must never trap them here though — it falls through to the same
			// close-again-to-discard confirmation an explicit save uses, so the second
			// attempt always closes whatever the server said.
			if (autoSave) {
				const saved = await commit(entriesRef.current);
				if (saved) {
					reset();
					onOpenChange(false);
					return;
				}
			}
			setConfirmDiscard(true);
			return;
		}
		reset();
		onOpenChange(false);
	}, [autoSave, cancelScheduledFlush, commit, confirmDiscard, onOpenChange, reset]);

	const save = useCallback(async () => {
		cancelScheduledFlush();
		const saved = await commit(entriesRef.current);
		if (saved) {
			reset();
			onOpenChange(false);
		}
	}, [cancelScheduledFlush, commit, onOpenChange, reset]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			// Never swallow browser and OS shortcuts.
			if (event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}
			// A typed count in the tally list owns its own keys.
			if (isTextEntryTarget(event.target)) {
				return;
			}

			if (event.key === 'Backspace') {
				event.preventDefault();
				tally.undo();
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				void save();
				return;
			}
			// Escape is handled by the dialog's own onEscapeKeyDown, not here — Radix
			// dismisses on a document-level listener, so a second handler on this node
			// would race it and the unsaved-tally guard would lose.
			if (!isBindableKey(event.key)) {
				return;
			}

			// A bindable key belongs to entry, not to whatever button holds focus.
			event.preventDefault();
			event.stopPropagation();
			const binding = bindings.byKey.get(event.key.toLowerCase());
			if (binding === undefined) {
				setUnknownKey(event.key.toLowerCase());
				return;
			}
			setUnknownKey(null);
			setConfirmDiscard(false);
			tally.add(binding.speciesId, variant);
		},
		[bindings, save, tally, variant],
	);

	const modeSummary = mode?.describe(variant) ?? null;

	return (
		<Dialog
			onOpenChange={(next) => {
				if (next) {
					onOpenChange(true);
					return;
				}
				void requestClose();
			}}
			open={open}
		>
			<DialogContent
				// Wider than a typical dialog: the key sheet and the running tally sit side
				// by side, and species names are long enough that a narrower shell truncates
				// the reference someone is reading mid-entry.
				className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-4xl"
				// Escape is deliberately NOT handled here. Radix already routes it through
				// onOpenChange, and adding a second handler ran the unsaved-tally guard
				// twice per press — invisible in a browser, where the extra close is a
				// no-op, but it meant two commits could be requested for one keystroke.
				// An outside click never dismisses: it would discard a tally mid-entry.
				onInteractOutside={(event) => {
					event.preventDefault();
				}}
				onKeyDownCapture={handleKeyDown}
				showCloseButton={false}
			>
				<DialogHeader className="gap-2 border-border/60 border-b px-5 py-4">
					<div className="flex items-start justify-between gap-4">
						<div className="grid gap-1">
							<DialogTitle className="flex items-center gap-2">
								<KeyboardIcon aria-hidden="true" className="size-4 text-muted-foreground" />
								{title}
							</DialogTitle>
							<DialogDescription>{description}</DialogDescription>
						</div>
						<div className="flex items-center gap-3">
							<AutoSaveToggle busy={busy} checked={autoSave} onCheckedChange={setAutoSave} />
							<Button
								aria-label="Close"
								onClick={() => void requestClose()}
								size="icon"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden="true" />
							</Button>
						</div>
					</div>
				</DialogHeader>

				<div className="grid max-h-[calc(90vh-13rem)] gap-4 overflow-y-auto px-5 py-4">
					{error !== null ? (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}

					{mode === null ? null : <ModeBar mode={mode} onChange={setVariant} variant={variant} />}

					<PressSurface
						describeVariant={mode?.describe ?? null}
						hasBindings={bindings.hasBindings}
						lastEntry={tally.entries.find((entry) => entry.entryKey === tally.lastEntryKey) ?? null}
						modeSummary={modeSummary}
						nameFor={(speciesId) => speciesNameFor(bindings, speciesId)}
						unknownKey={unknownKey}
					/>

					{bindings.hasBindings ? (
						<div className="grid gap-4 md:grid-cols-2">
							<BindingSheet bindings={bindings.bindings} />
							<TallyList
								countLabel={countLabel}
								describeVariant={mode?.describe ?? null}
								entries={tally.entries}
								nameById={bindings}
								onSetCount={tally.setCount}
								total={tally.total}
							/>
						</div>
					) : (
						<NoBindings />
					)}

					{footnote === undefined ? null : (
						<div className="text-muted-foreground text-xs">{footnote}</div>
					)}
				</div>

				<DialogFooter className="items-center justify-between gap-3 border-border/60 border-t px-5 py-3 sm:justify-between">
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
						<LegendItem keyLabel="Backspace">Undo last</LegendItem>
						<LegendItem keyLabel="Enter">Save and close</LegendItem>
						<LegendItem keyLabel="Esc">Close</LegendItem>
					</div>
					<div className="flex items-center gap-2">
						{confirmDiscard ? (
							<span className="text-destructive text-xs">
								{tally.total > 0 ? `${tally.total} unsaved` : 'Unsaved changes'} — close again to
								discard.
							</span>
						) : null}
						<Button
							disabled={!tally.canUndo || busy}
							onClick={tally.undo}
							size="sm"
							type="button"
							variant="ghost"
						>
							Undo
						</Button>
						<Button
							// Enabled whenever storage differs from the tally, which includes a
							// tally emptied by undo — that still has rows to walk back.
							disabled={(!hasPendingChanges && tally.isEmpty) || busy}
							onClick={() => void save()}
							size="sm"
							type="button"
						>
							{busy ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
							{autoSave ? 'Done' : `Save ${tally.total || ''}`.trim()}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AutoSaveToggle({
	checked,
	onCheckedChange,
	busy,
}: {
	readonly checked: boolean;
	readonly onCheckedChange: (next: boolean) => void;
	readonly busy: boolean;
}) {
	const id = useId();
	return (
		<div className="flex items-center gap-2">
			<Label className="text-muted-foreground text-xs" htmlFor={id}>
				{busy ? 'Saving…' : 'Auto-save'}
			</Label>
			<Switch checked={checked} id={id} onCheckedChange={onCheckedChange} />
		</div>
	);
}

function ModeBar({
	mode,
	variant,
	onChange,
}: {
	readonly mode: VariantMode;
	readonly variant: TallyVariant;
	readonly onChange: (next: TallyVariant) => void;
}) {
	return (
		<div className="grid gap-3 rounded-md border border-border/50 bg-muted/30 p-3 sm:grid-cols-2">
			<VariantGroup
				label="Sex"
				onChange={(next) => onChange({ ...variant, sex: next })}
				options={mode.sexOptions}
				value={variant.sex}
			/>
			<VariantGroup
				label="Status"
				onChange={(next) => onChange({ ...variant, status: next })}
				options={mode.statusOptions}
				value={variant.status}
			/>
		</div>
	);
}

function VariantGroup({
	label,
	options,
	value,
	onChange,
}: {
	readonly label: string;
	readonly options: readonly VariantOption[];
	readonly value: string | null;
	readonly onChange: (next: string | null) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</span>
			<ToggleGroup
				className="flex-wrap justify-start"
				onValueChange={(next) => {
					// Radix clears the value when the active item is pressed again; the mode bar
					// always has exactly one choice, so ignore the empty signal.
					if (next.length > 0) {
						onChange(next === UNSET_VARIANT_VALUE ? null : next);
					}
				}}
				size="sm"
				type="single"
				value={value ?? UNSET_VARIANT_VALUE}
				variant="outline"
			>
				{options.map((option) => (
					<ToggleGroupItem
						key={option.value ?? UNSET_VARIANT_VALUE}
						value={option.value ?? UNSET_VARIANT_VALUE}
					>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

const UNSET_VARIANT_VALUE = '__unset__';

function PressSurface({
	lastEntry,
	nameFor,
	modeSummary,
	describeVariant,
	unknownKey,
	hasBindings,
}: {
	readonly lastEntry: TallyEntry | null;
	readonly nameFor: (speciesId: string) => string | null;
	readonly modeSummary: string | null;
	readonly describeVariant: ((variant: TallyVariant) => string) | null;
	readonly unknownKey: string | null;
	readonly hasBindings: boolean;
}) {
	// Describe the line by its own sex/status, not the mode bar's current selection —
	// undoing back across a mode change leaves a line the current mode no longer
	// describes, and reading the stale mode there would misstate what was recorded.
	const lastSummary =
		lastEntry === null || describeVariant === null ? null : describeVariant(lastEntry.variant);

	return (
		<div
			className={cn(
				'grid min-h-[5.5rem] place-items-center gap-1 rounded-md border-2 border-dashed px-4 py-4 text-center transition-colors',
				unknownKey !== null
					? 'border-destructive/50 bg-destructive/5'
					: lastEntry !== null
						? 'border-primary/40 bg-primary/5'
						: 'border-border/60 bg-muted/20',
			)}
		>
			{!hasBindings ? (
				<span className="text-muted-foreground text-sm">
					No keys are set up for this agency yet.
				</span>
			) : unknownKey !== null ? (
				<>
					<Kbd>{unknownKey}</Kbd>
					<span className="text-destructive text-sm">Not bound to a species.</span>
				</>
			) : lastEntry === null ? (
				<>
					<span className="font-medium text-foreground text-sm">
						Press a species key to record it.
					</span>
					{modeSummary === null ? null : (
						<span className="text-muted-foreground text-xs">Recording as {modeSummary}</span>
					)}
				</>
			) : (
				<>
					<span className="font-semibold text-[1.05rem] text-foreground italic">
						{nameFor(lastEntry.speciesId) ?? 'Unknown species'}
					</span>
					<span className="text-muted-foreground text-xs">
						{lastSummary === null ? '' : `${lastSummary} · `}
						{lastEntry.count} recorded this session
					</span>
				</>
			)}
		</div>
	);
}

/**
 * The bench sheet. Bounded at 36 rows by construction — one key per species over the
 * 36 bindable characters — so it lays out in columns rather than a long scroll: a
 * reference you glance at mid-entry is useless if it has to be scrolled. The columns
 * keep a typical 10–20 key agency fully visible, and a fully-loaded 36 is a short
 * scroll rather than a very long one.
 */
function BindingSheet({ bindings }: { readonly bindings: readonly ResolvedSpeciesKeyBinding[] }) {
	return (
		<div className="grid content-start gap-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					Keys
				</span>
				<span className="text-muted-foreground text-xs">{bindings.length}</span>
			</div>
			{/* Two columns of 18 hold the full 36, so the cap is a backstop for short
			    viewports rather than something a normal agency ever hits. */}
			<ul className="grid max-h-96 grid-cols-1 gap-x-3 gap-y-0.5 overflow-y-auto rounded-md border border-border/40 p-2 sm:grid-cols-2">
				{bindings.map((binding) => (
					<li className="flex items-center gap-1.5 px-1 py-0.5 text-sm" key={binding.key}>
						<Kbd className="shrink-0">{binding.key}</Kbd>
						<span
							className={cn(
								'min-w-0 flex-1 truncate',
								binding.speciesName === null ? 'text-muted-foreground' : 'italic',
							)}
						>
							{binding.speciesName ?? 'Species no longer in the taxonomy'}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function TallyList({
	entries,
	total,
	countLabel,
	nameById,
	describeVariant,
	onSetCount,
}: {
	readonly entries: readonly TallyEntry[];
	readonly total: number;
	readonly countLabel: string;
	readonly nameById: SpeciesKeyBindingsView;
	readonly describeVariant: ((variant: TallyVariant) => string) | null;
	readonly onSetCount: (entryKey: string, count: number) => void;
}) {
	return (
		<div className="grid content-start gap-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					This session
				</span>
				{total > 0 ? (
					<span className="text-muted-foreground text-xs">
						{total.toLocaleString()} {countLabel}
					</span>
				) : null}
			</div>
			{entries.length === 0 ? (
				<p className="m-0 rounded-md border border-border/40 bg-muted/20 px-3 py-4 text-center text-muted-foreground text-sm">
					Nothing recorded yet.
				</p>
			) : (
				<ul className="grid max-h-64 gap-1 overflow-y-auto rounded-md border border-border/40 p-2">
					{entries.map((entry) => (
						<li
							className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted/40"
							key={entry.entryKey}
						>
							<span className="min-w-0 flex-1 truncate italic">
								{speciesNameFor(nameById, entry.speciesId) ?? 'Unknown species'}
							</span>
							{describeVariant === null ? null : (
								<Badge className="shrink-0" tone="neutral" variant="outline">
									{describeVariant(entry.variant)}
								</Badge>
							)}
							<Button
								aria-label="Remove one"
								className="shrink-0"
								onClick={() => onSetCount(entry.entryKey, entry.count - 1)}
								size="icon-xs"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden="true" />
							</Button>
							<span className="w-10 shrink-0 text-right font-medium tabular-nums">
								{entry.count}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function NoBindings() {
	return (
		<Empty className="min-h-[140px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SpeciesIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>No Species Keys</EmptyTitle>
				<EmptyDescription>
					An owner or admin assigns a key to each species under Organization → Key Bindings.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function LegendItem({
	keyLabel,
	children,
}: {
	readonly keyLabel: string;
	readonly children: ReactNode;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<Kbd>{keyLabel}</Kbd>
			{children}
		</span>
	);
}

// --- helpers -----------------------------------------------------------------

function speciesNameFor(view: SpeciesKeyBindingsView, speciesId: string): string | null {
	const key = view.keyBySpeciesId.get(speciesId);
	return key === undefined ? null : (view.byKey.get(key)?.speciesName ?? null);
}

/** A stable fingerprint of the tally, used to skip writes that would be no-ops. */
function signatureOf(entries: readonly TallyEntry[]): string {
	return [...entries]
		.map((entry) => `${entry.entryKey}=${entry.count}`)
		.sort()
		.join(';');
}

function isTextEntryTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target.isContentEditable
	);
}

function messageOf(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

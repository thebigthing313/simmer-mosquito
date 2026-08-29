import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { useEffect, useId, useState } from 'react';
import { mergeRefusalReason } from '../../hooks/mutations/use-record-merge';
import {
	type DuplicateRecord,
	type MergeableRecordType,
	type MergeMoveEntry,
	moveCountLabel,
	useMergeImpact,
} from '../../hooks/use-merge-candidates';
import type { RecordCleanupConfig } from './record-cleanup-config';

export interface MergeConfirmDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly recordType: MergeableRecordType;
	readonly config: RecordCleanupConfig;
	/** The record that stays. */
	readonly target: DuplicateRecord;
	/** The records folded into it and retired. */
	readonly sources: readonly DuplicateRecord[];
	/** Runs the merge. Rejects with the server's refusal. */
	readonly onConfirm: (acknowledged: boolean) => Promise<void>;
}

/**
 * The last thing between a duplicate set and a merge that cannot be undone.
 *
 * A modal, which is usually the lazy answer, and is the right one here for the
 * reason `DangerZoneCard` opens one to delete: the action is irreversible, so it
 * should interrupt rather than sit inline where it can be pressed on the way
 * past. It is also the same shape the app already uses to confirm a destructive
 * write, and a second vocabulary for the same kind of decision would be worse
 * than a modal.
 *
 * Three things have to be true before the button is live: the impact is known,
 * the user has read which record survives, and they have ticked the
 * acknowledgement. Until then this sends `false` for the flag rather than
 * omitting it, because the server reads an absent flag as agreement.
 */
export function MergeConfirmDialog(props: MergeConfirmDialogProps) {
	const acknowledgementId = useId();
	const [acknowledged, setAcknowledged] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [isMerging, setIsMerging] = useState(false);

	const sourceIds = props.sources.map((record) => record.id);
	const impact = useMergeImpact(props.recordType, props.target.id, sourceIds, props.open);

	// A dialog that reopens holding the previous tick would let a second merge go
	// through on a confirmation given for a different set of records.
	useEffect(() => {
		if (!props.open) {
			setAcknowledged(false);
			setFailure(null);
			setIsMerging(false);
		}
	}, [props.open]);

	const targetLabel = props.target.label.trim() === '' ? props.config.unnamed : props.target.label;

	async function confirm(): Promise<void> {
		setIsMerging(true);
		setFailure(null);
		try {
			await props.onConfirm(acknowledged);
			props.onOpenChange(false);
		} catch (error) {
			setFailure(refusalMessage(error, props.config));
		} finally {
			setIsMerging(false);
		}
	}

	return (
		<AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Merge {props.sources.length} into {targetLabel}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						{targetLabel} stays. The{' '}
						{props.sources.length === 1 ? 'other' : `other ${props.sources.length}`}{' '}
						{props.sources.length === 1 ? props.config.noun.one : props.config.noun.many} are
						retired.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="grid gap-4 text-sm">
					<RetiredList config={props.config} sources={props.sources} />
					<MoveSummary
						config={props.config}
						isLoading={impact.isPending}
						isError={impact.isError}
						moves={impact.data ?? []}
					/>

					{failure === null ? null : (
						<Alert variant="destructive">
							<AlertTitle>The merge did not run</AlertTitle>
							<AlertDescription>{failure}</AlertDescription>
						</Alert>
					)}

					{/*
					 * The no-undo sentence is the label of the control that agrees to it,
					 * so the thing they tick is the thing that says it. A warning beside a
					 * plainer checkbox separates the fact from the consent, and the fact is
					 * then the skippable half.
					 */}
					<div className="flex items-start gap-3 rounded-md border border-border bg-muted/50 p-3">
						<Checkbox
							checked={acknowledged}
							className="mt-0.5"
							id={acknowledgementId}
							onCheckedChange={(value) => setAcknowledged(value === true)}
						/>
						<Label className="font-normal leading-snug" htmlFor={acknowledgementId}>
							This cannot be undone. The other{' '}
							{props.sources.length === 1
								? props.config.noun.one
								: `${props.sources.length} ${props.config.noun.many}`}{' '}
							will be retired, and everything that names{' '}
							{props.sources.length === 1 ? 'it' : 'them'} will name {targetLabel} instead.
						</Label>
					</div>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel disabled={isMerging}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={!acknowledged || isMerging || impact.isPending}
						onClick={(event) => {
							// The primitive closes on click. This one has to stay open to show
							// a refusal, and closes itself once the write settles.
							event.preventDefault();
							void confirm();
						}}
					>
						{isMerging ? 'Merging…' : 'Merge'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/** The records that go away, named rather than counted. */
function RetiredList({
	config,
	sources,
}: {
	readonly config: RecordCleanupConfig;
	readonly sources: readonly DuplicateRecord[];
}) {
	return (
		<div>
			<h3 className="font-semibold text-muted-foreground text-xs uppercase">Retired</h3>
			<ul className="mt-1 grid gap-0.5">
				{sources.map((record) => (
					<li className="truncate text-foreground" key={record.id}>
						{record.label.trim() === '' ? config.unnamed : record.label}
						{record.detail === null ? null : (
							<span className="text-muted-foreground"> · {record.detail}</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * What moves, counted by the server from the rules the write uses.
 *
 * An empty list is a real answer and says so: two duplicates nothing refers to
 * yet is the easiest merge there is, and a blank space here would read as a
 * count that failed to load.
 */
function MoveSummary({
	config,
	isError,
	isLoading,
	moves,
}: {
	readonly config: RecordCleanupConfig;
	readonly isError: boolean;
	readonly isLoading: boolean;
	readonly moves: readonly MergeMoveEntry[];
}) {
	if (isLoading) {
		return <Skeleton className="h-10 w-full" />;
	}

	if (isError) {
		return (
			<p className="text-destructive">
				Could not read what this merge would move. The merge itself is still checked by the server,
				but the counts are not available.
			</p>
		);
	}

	return (
		<div>
			<h3 className="font-semibold text-muted-foreground text-xs uppercase">Moves</h3>
			{moves.length === 0 ? (
				<p className="mt-1 text-muted-foreground">
					Nothing refers to{' '}
					{config.noun.many === 'addresses' ? 'these addresses' : `these ${config.noun.many}`} yet.
				</p>
			) : (
				<ul className="mt-1 grid gap-0.5">
					{moves.map((entry) => (
						<li className="text-foreground tabular-nums" key={entry.key}>
							{moveCountLabel(entry)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * A refusal, said as something the reader can act on.
 *
 * `target_inactive` is the only one of the three they can fix from here, and it
 * is the only one whose message names a next step. The other two mean the
 * proposal is out of date, which the page's own refetch resolves.
 */
function refusalMessage(error: unknown, config: RecordCleanupConfig): string {
	switch (mergeRefusalReason(error)) {
		case 'target_inactive':
			return `The ${config.noun.one} you chose to keep is retired. Reactivate it, or keep a different one.`;
		case 'target_not_found':
		case 'source_not_found':
			return `One of these ${config.noun.many} is already gone. Refresh the page to see what is left.`;
		default:
			return error instanceof Error ? error.message : 'The merge could not be sent.';
	}
}

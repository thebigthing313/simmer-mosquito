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
import { useEffect, useId, useMemo, useState } from 'react';
import { type MergeFieldUpdates, mergeRefusalReason } from '../../hooks/mutations/use-record-merge';
import type { DuplicateRecord, MergeableRecordType } from '../../hooks/use-merge-candidates';
import {
	defaultMergeFieldSelections,
	mergeFieldProblems,
	mergeFieldRows,
	mergeFieldUpdates,
} from './merge-field-plan';
import { MergeRecordBuilder } from './merge-record-builder';
import { type RecordCleanupConfig, recordLabel } from './record-cleanup-config';

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
	readonly onConfirm: (acknowledged: boolean, fieldUpdates: MergeFieldUpdates) => Promise<void>;
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
 * Two things have to be true before the button is live: no required field has
 * been emptied, and the user has ticked the acknowledgement. Until then this
 * sends `false` for the flag rather than omitting it, because the server reads
 * an absent flag as agreement.
 *
 * ## What moves is stated, not counted
 *
 * This used to read `/records/{type}/{id}/merge-impact` and list the rows each
 * referencing table would hand over. The counts were accurate and answered a
 * question nobody was asking: whichever number came back, everything that named
 * a retired record ends up naming the survivor, and that is the whole of what a
 * reader needs before agreeing.
 *
 * The acknowledgement label says it, so it is the sentence they tick rather
 * than a line above the one they tick. Saying it twice would make the copy that
 * matters look like a repeat.
 */
export function MergeConfirmDialog(props: MergeConfirmDialogProps) {
	const acknowledgementId = useId();
	const [acknowledged, setAcknowledged] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [isMerging, setIsMerging] = useState(false);

	const rows = useMemo(
		() => mergeFieldRows(props.recordType, props.target, props.sources),
		[props.recordType, props.target, props.sources],
	);
	// Seeded once. The page unmounts this dialog when the set or the survivor
	// changes, so there is no open dialog whose defaults could go stale, and
	// re-seeding on every render would undo the reader's edit as they typed it.
	const [selections, setSelections] = useState(() => defaultMergeFieldSelections(rows));
	const problems = mergeFieldProblems(props.recordType, selections);

	// A dialog that reopens holding the previous tick would let a second merge go
	// through on a confirmation given for a different set of records.
	useEffect(() => {
		if (!props.open) {
			setAcknowledged(false);
			setFailure(null);
			setIsMerging(false);
		}
	}, [props.open]);

	const targetLabel = recordLabel(props.target, props.config);

	async function confirm(): Promise<void> {
		setIsMerging(true);
		setFailure(null);
		try {
			await props.onConfirm(
				acknowledged,
				mergeFieldUpdates(props.recordType, props.target, selections),
			);
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
						{targetLabel} stays. {retiredPhrase(props.sources.length, props.config)}
					</AlertDialogDescription>
				</AlertDialogHeader>

				{/*
				 * Scrolls on its own so the title and the acknowledgement stay put. A
				 * set disagreeing about six fields is a tall dialog, and the control
				 * that agrees to something irreversible must not be the part that
				 * scrolls out of sight.
				 */}
				<div className="grid max-h-[55vh] gap-4 overflow-y-auto pr-1 text-sm">
					<RetiredList config={props.config} sources={props.sources} />
					{rows.length === 0 ? null : (
						<MergeRecordBuilder
							config={props.config}
							onChange={(column, value) =>
								setSelections((current) => ({ ...current, [column]: value }))
							}
							rows={rows}
							selections={selections}
							sources={props.sources}
							target={props.target}
						/>
					)}
					<EmptyFieldAlert config={props.config} problems={problems} />

					{failure === null ? null : (
						<Alert variant="destructive">
							<AlertTitle>The merge did not run</AlertTitle>
							<AlertDescription>{failure}</AlertDescription>
						</Alert>
					)}

					<Acknowledgement
						checked={acknowledged}
						config={props.config}
						id={acknowledgementId}
						onChange={setAcknowledged}
						sourceCount={props.sources.length}
						targetLabel={targetLabel}
					/>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel disabled={isMerging}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={!acknowledged || isMerging || problems.length > 0}
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

/**
 * A required field the reader has emptied.
 *
 * Held here rather than sent and refused. The domain rejects an empty one, so a
 * round trip would spend the user's click to tell them what the dialog already
 * knows.
 */
function EmptyFieldAlert({
	config,
	problems,
}: {
	readonly config: RecordCleanupConfig;
	readonly problems: readonly string[];
}) {
	if (problems.length === 0) {
		return null;
	}

	return (
		<Alert variant="destructive">
			<AlertTitle>
				{problems.length === 1 ? `${problems[0]} cannot be empty` : 'Some fields cannot be empty'}
			</AlertTitle>
			<AlertDescription>
				{problems.length === 1
					? `Every ${config.noun.one} needs one.`
					: `${problems.join(', ')} each need a value.`}
			</AlertDescription>
		</Alert>
	);
}

/**
 * Agreeing to the part with no undo.
 *
 * The no-undo sentence is the label of the control that agrees to it, so the
 * thing they tick is the thing that says it. A warning beside a plainer checkbox
 * separates the fact from the consent, and the fact is then the skippable half.
 */
function Acknowledgement({
	checked,
	config,
	id,
	onChange,
	sourceCount,
	targetLabel,
}: {
	readonly checked: boolean;
	readonly config: RecordCleanupConfig;
	readonly id: string;
	readonly onChange: (checked: boolean) => void;
	readonly sourceCount: number;
	readonly targetLabel: string;
}) {
	return (
		<div className="flex items-start gap-3 rounded-md border border-border bg-muted/50 p-3">
			<Checkbox
				checked={checked}
				className="mt-0.5"
				id={id}
				onCheckedChange={(value) => onChange(value === true)}
			/>
			<Label className="font-normal leading-snug" htmlFor={id}>
				This cannot be undone. {retiredSubject(sourceCount, config)} will be retired, and everything
				that names {sourceCount === 1 ? 'it' : 'them'} will name {targetLabel} instead.
			</Label>
		</div>
	);
}

/**
 * "The other address is retired." / "The other 3 addresses are retired."
 *
 * One sentence rather than four interpolations, because the count decides the
 * article, the noun and the verb together, and assembling them separately is how
 * "The other address are retired" reached the screen.
 */
function retiredPhrase(count: number, config: RecordCleanupConfig): string {
	return count === 1
		? `The other ${config.noun.one} is retired.`
		: `The other ${count} ${config.noun.many} are retired.`;
}

/** The same subject, for a sentence that supplies its own verb. */
function retiredSubject(count: number, config: RecordCleanupConfig): string {
	return count === 1 ? `The other ${config.noun.one}` : `The other ${count} ${config.noun.many}`;
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
						{recordLabel(record, config)}
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

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useId, useState } from 'react';
import type { DuplicateRecord } from '../../hooks/use-merge-candidates';
import type { MergeFieldRow, MergeSuggestion } from './merge-field-plan';
import type { RecordCleanupConfig } from './record-cleanup-config';

const ChevronIcon = iconRegistry.arrows.chevronRight.icon;

export interface MergeRecordBuilderProps {
	readonly rows: readonly MergeFieldRow[];
	readonly config: RecordCleanupConfig;
	/** The record that stays, whose values the fields start from. */
	readonly target: DuplicateRecord;
	readonly sources: readonly DuplicateRecord[];
	/** The value each column will be saved with. */
	readonly selections: Readonly<Record<string, string | null>>;
	readonly onChange: (column: string, value: string | null) => void;
}

/**
 * The record the merge is about to write, as a form.
 *
 * Without it the merge silently drops every value only a retired record holds,
 * which for contacts is the common case rather than the edge one: a second row
 * for a person usually exists because somebody had a number the first row did
 * not. Picking one row wholesale is not the answer either, because the two rows
 * are usually two halves of one person.
 *
 * So every field is editable and every value in the set is one click away.
 * Typing is allowed too: the merge is often the moment somebody notices the name
 * is wrong on both rows.
 *
 * ## Two groups, not one list
 *
 * The fields where the records disagree, or where a retired record fills
 * something the survivor leaves empty, are the ones the merge would otherwise
 * decide on its own, so they are the ones on screen. The rest sit behind a
 * disclosure. Showing all of them flat would bury the two that matter in the ten
 * that do not, on a dialog whose whole job is to be read before something
 * irreversible happens.
 *
 * ## The starting values change nothing on their own
 *
 * Each field starts at the survivor's own value, or at a retired record's where
 * the survivor has none. So a reader can skim this, change nothing, and the
 * merge still keeps more than it would have.
 */
export function MergeRecordBuilder(props: MergeRecordBuilderProps) {
	const [isOpen, setIsOpen] = useState(false);
	const labels = recordLabels(props.target, props.sources, props.config);
	const decisions = props.rows.filter((row) => row.needsDecision);
	const rest = props.rows.filter((row) => !row.needsDecision);

	return (
		<div>
			<h3 className="font-semibold text-muted-foreground text-xs uppercase">
				{titleCase(props.config.noun.one)} kept
			</h3>
			<p className="mt-1 text-muted-foreground">
				{decisions.length === 0
					? `These ${props.config.noun.many} agree on everything, so nothing is lost by merging them.`
					: `Where they disagree, pick what ${labels.get(props.target.id)} ends up saying.`}
			</p>

			<div className="mt-3 grid gap-3">
				{decisions.map((row) => (
					<FieldControl
						key={row.field.column}
						labels={labels}
						onChange={(value) => props.onChange(row.field.column, value)}
						row={row}
						targetId={props.target.id}
						value={props.selections[row.field.column] ?? null}
					/>
				))}
			</div>

			{rest.length === 0 ? null : (
				<Collapsible className="mt-3" onOpenChange={setIsOpen} open={isOpen}>
					<CollapsibleTrigger className="flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground">
						<ChevronIcon
							aria-hidden="true"
							className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
						/>
						{isOpen ? 'Hide' : 'Edit'} the other {rest.length} fields
					</CollapsibleTrigger>
					<CollapsibleContent className="mt-3 grid gap-3">
						{rest.map((row) => (
							<FieldControl
								key={row.field.column}
								labels={labels}
								onChange={(value) => props.onChange(row.field.column, value)}
								row={row}
								targetId={props.target.id}
								value={props.selections[row.field.column] ?? null}
							/>
						))}
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}

/**
 * One field: what it will be saved as, and every value the set can fill it from.
 *
 * The input holds the answer and the buttons under it are shortcuts into it, so
 * there is one place to look for what is about to be written. A set of radios
 * over the found values would read the same until somebody needed a value none
 * of the records holds, which is most of the reason to open this at all.
 */
function FieldControl({
	labels,
	onChange,
	row,
	targetId,
	value,
}: {
	readonly labels: ReadonlyMap<string, string>;
	readonly onChange: (value: string | null) => void;
	readonly row: MergeFieldRow;
	readonly targetId: string;
	readonly value: string | null;
}) {
	const inputId = useId();
	const isEmpty = (value ?? '').trim() === '';

	return (
		<div>
			<Label htmlFor={inputId}>{row.field.label}</Label>
			<Input
				aria-invalid={row.field.required === true && isEmpty ? true : undefined}
				className="mt-1"
				id={inputId}
				onChange={(event) => onChange(event.target.value)}
				placeholder={row.field.required === true ? 'Required' : 'Not recorded'}
				value={value ?? ''}
			/>
			<div className="mt-1.5 flex flex-wrap gap-1">
				{row.suggestions.map((suggestion) => (
					<SuggestionButton
						isSelected={suggestion.value === value}
						key={`${suggestion.fromColumn}:${suggestion.value}`}
						labels={labels}
						onSelect={() => onChange(suggestion.value)}
						row={row}
						suggestion={suggestion}
						targetId={targetId}
					/>
				))}
				{row.field.required === true || isEmpty ? null : (
					<button
						className="rounded-md border border-border border-dashed px-2 py-0.5 text-muted-foreground text-xs hover:text-foreground"
						onClick={() => onChange(null)}
						type="button"
					>
						Clear
					</button>
				)}
			</div>
		</div>
	);
}

function SuggestionButton({
	isSelected,
	labels,
	onSelect,
	row,
	suggestion,
	targetId,
}: {
	readonly isSelected: boolean;
	readonly labels: ReadonlyMap<string, string>;
	readonly onSelect: () => void;
	readonly row: MergeFieldRow;
	readonly suggestion: MergeSuggestion;
	readonly targetId: string;
}) {
	return (
		<button
			aria-pressed={isSelected}
			className={`rounded-md border px-2 py-0.5 text-xs ${
				isSelected
					? 'border-primary bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground'
			}`}
			onClick={onSelect}
			type="button"
		>
			{suggestion.value}
			<span className="ml-1.5 text-[0.6875rem] text-muted-foreground">
				{attribution(row, suggestion, labels, targetId)}
			</span>
		</button>
	);
}

/**
 * Where a value comes from, which is the whole basis for choosing between them.
 *
 * A value already in this field on another record needs only the record named. A
 * value borrowed from a different field needs that field named too: offering
 * somebody's preferred number as an alternate is a claim about the person, and
 * the reader can only judge it if they can see it is what is being proposed.
 */
function attribution(
	row: MergeFieldRow,
	suggestion: MergeSuggestion,
	labels: ReadonlyMap<string, string>,
	targetId: string,
): string {
	const holder = whoHoldsIt(suggestion, labels, targetId);
	if (suggestion.fromColumn === row.field.column) {
		return holder;
	}
	// Where the survivor is the only one holding it, naming the record says
	// nothing the dialog has not already said, and the field it sits in is the
	// whole of what there is to add.
	return holder === 'kept'
		? pooledLabel(suggestion.fromColumn)
		: `${holder}, ${pooledLabel(suggestion.fromColumn)}`;
}

/**
 * Which record holds a value, with the survivor's own called "kept".
 *
 * Named rather than counted, because the count is the thing a reader cannot act
 * on. Duplicates do routinely share a name, so this is sometimes no help at all;
 * it is still better than a number.
 */
function whoHoldsIt(
	suggestion: MergeSuggestion,
	labels: ReadonlyMap<string, string>,
	targetId: string,
): string {
	const isKept = suggestion.recordIds.includes(targetId);
	if (suggestion.recordIds.length > 1) {
		return isKept ? 'kept, and others' : `${suggestion.recordIds.length} records`;
	}
	return isKept ? 'kept' : (labels.get(suggestion.recordIds[0] ?? '') ?? 'a record');
}

/** The column a borrowed value sits in today, said the way the field labels are. */
function pooledLabel(column: string): string {
	return column.replaceAll('_', ' ');
}

/** Each record by the name the dialog calls it, so a chip can say where it came from. */
function recordLabels(
	target: DuplicateRecord,
	sources: readonly DuplicateRecord[],
	config: RecordCleanupConfig,
): ReadonlyMap<string, string> {
	return new Map(
		[target, ...sources].map((record) => [
			record.id,
			record.label.trim() === '' ? config.unnamed : record.label,
		]),
	);
}

/** `contact` to `Contact`, for a heading that leads with the record type. */
function titleCase(noun: string): string {
	return `${noun.slice(0, 1).toUpperCase()}${noun.slice(1)}`;
}

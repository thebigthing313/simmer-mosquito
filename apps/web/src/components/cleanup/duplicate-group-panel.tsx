import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from '@simmer-mosquito/ui-web/components/ui/item';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@simmer-mosquito/ui-web/components/ui/radio-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import type {
	DuplicateGroup,
	DuplicateRecord,
	DuplicateRecordType,
} from '../../hooks/use-merge-candidates';
import { WriteOnly } from '../write-only';
import { type MergeFieldValue, mergeFieldSummary } from './merge-field-plan';
import {
	duplicateGroupHeading,
	type RecordCleanupConfig,
	recordCountLabel,
	recordLabel,
} from './record-cleanup-config';

const MergeIcon = iconRegistry.actions.merge.icon;

export interface DuplicateGroupPanelProps {
	readonly group: DuplicateGroup;
	readonly config: RecordCleanupConfig;
	/** Which register a row reads its columns from. */
	readonly recordType: DuplicateRecordType;
	/** Which record the user has chosen to keep. */
	readonly survivorId: string;
	readonly onSurvivorChange: (recordId: string) => void;
	/**
	 * The records still in this proposal, with any the user refused already gone.
	 *
	 * Filtered by the page rather than here: refusing a record is per group, and a
	 * contact compared three ways sits in three proposals on different evidence,
	 * so the key that records a refusal is the page's to know.
	 */
	readonly records: readonly DuplicateRecord[];
	readonly onExclude: (recordId: string) => void;
	readonly onMerge: () => void;
}

/**
 * One proposed set, and the single choice that decides what a merge means.
 *
 * The radio is the whole asymmetry. A merge names one record in the path and
 * carries the rest in the body, and reading that backwards retires the record
 * the user meant to keep with nothing in the type system, the permission check
 * or the server tests to notice. So the survivor is picked once, visibly, on the
 * row itself, and the merge button repeats the choice in its own label rather
 * than saying "Merge".
 *
 * Excluding a row is deliberately weaker than merging one: two people at the
 * same address genuinely share a phone number, so a proposal has to be
 * refusable, and refusing it costs nothing because the grouping is recomputed
 * from the records themselves on the next read.
 */
export function DuplicateGroupPanel(props: DuplicateGroupPanelProps) {
	const groupId = useId();
	const kept = props.records;
	const survivor = kept.find((record) => record.id === props.survivorId) ?? kept[0];
	const sources = kept.filter((record) => record.id !== survivor?.id);

	if (kept.length < 2 || survivor === undefined) {
		return null;
	}

	return (
		<Panel
			count={kept.length}
			footer={
				<WriteOnly minimum="manager">
					<Button onClick={props.onMerge} size="sm">
						<MergeIcon aria-hidden="true" />
						Merge {sources.length} into {recordLabel(survivor, props.config)}
					</Button>
				</WriteOnly>
			}
			icon={<props.config.icon aria-hidden="true" className="size-4" />}
			title={duplicateGroupHeading(props.group)}
		>
			<RadioGroup
				aria-labelledby={groupId}
				onValueChange={props.onSurvivorChange}
				value={survivor.id}
			>
				<p className="sr-only" id={groupId}>
					Which of these {recordCountLabel(kept.length, props.config)} to keep
				</p>
				<ItemGroup>
					{kept.map((record) => (
						<CandidateRow
							config={props.config}
							isSurvivor={record.id === survivor.id}
							key={record.id}
							onExclude={() => props.onExclude(record.id)}
							record={record}
							recordType={props.recordType}
						/>
					))}
				</ItemGroup>
			</RadioGroup>
		</Panel>
	);
}

/**
 * One record in a proposed set, said in full.
 *
 * A row is where somebody decides whether two records are one thing, so it
 * carries every column the merge can carry. It used to carry a name and a
 * joined line, which meant judging a set of contacts by opening each of them in
 * a new tab and losing the page you were working through.
 *
 * The columns are labelled and stacked rather than run together with separators.
 * Two phone numbers side by side are two bare numbers; "Preferred phone" and
 * "Alternate phone" over them is the difference between reading the row and
 * guessing at it. Stacking is also what keeps the row honest at the 1024px
 * floor: nothing here truncates, so a long company name takes a second line
 * rather than losing its end.
 */
function CandidateRow({
	config,
	isSurvivor,
	onExclude,
	record,
	recordType,
}: {
	readonly config: RecordCleanupConfig;
	readonly isSurvivor: boolean;
	readonly onExclude: () => void;
	readonly record: DuplicateRecord;
	readonly recordType: DuplicateRecordType;
}) {
	const radioId = useId();
	const facts = candidateFacts(recordType, record);

	return (
		<Item size="sm" variant={isSurvivor ? 'muted' : 'default'}>
			<ItemMedia>
				<RadioGroupItem id={radioId} value={record.id} />
			</ItemMedia>
			<ItemContent className="min-w-0">
				<ItemTitle>
					<Label className="cursor-pointer font-medium" htmlFor={radioId}>
						{recordLabel(record, config)}
					</Label>
					{isSurvivor ? (
						<Badge className="ml-2" variant="secondary">
							Keeping
						</Badge>
					) : null}
				</ItemTitle>
				{facts.length === 0 ? null : (
					<dl className="grid gap-1">
						{facts.map((fact) => (
							<div
								className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-baseline gap-3 text-sm"
								key={fact.column}
							>
								<dt className="m-0 min-w-0 wrap-anywhere text-muted-foreground leading-snug">
									{fact.label}
								</dt>
								<dd className="m-0 min-w-0 wrap-anywhere text-foreground">{fact.value}</dd>
							</div>
						))}
					</dl>
				)}
				<ItemDescription>Added {addedOn(record.createdAt)}</ItemDescription>
			</ItemContent>
			<ItemActions className="self-start">
				<Button asChild size="sm" variant="ghost">
					<Link params={{ id: record.id }} to={config.detailTo}>
						Open
					</Link>
				</Button>
				<Button onClick={onExclude} size="sm" variant="ghost">
					Not a duplicate
				</Button>
			</ItemActions>
		</Item>
	);
}

/**
 * What one row shows: the columns a merge carries, then where the record sits.
 *
 * The columns come from the merge register, so the row and the merge form agree
 * without either restating the other. Coordinates are not one of them and are
 * here anyway, because a set of addresses can be proposed for standing on the
 * same point, and that is the one kind of match a reader would otherwise have to
 * take the group heading's word for.
 *
 * They are written the way the heading writes them, straight off the doubles the
 * key was built from, which is what lets the two be compared at all. Nothing
 * branches on the record type: a contact carries no geometry, so the server
 * sends it no coordinates and the row shows none.
 */
function candidateFacts(
	recordType: DuplicateRecordType,
	record: DuplicateRecord,
): readonly MergeFieldValue[] {
	const columns = mergeFieldSummary(recordType, record);
	if (record.lat === null || record.lng === null) {
		return columns;
	}
	return [
		...columns,
		{ column: 'coordinates', label: 'Coordinates', value: `${record.lat}, ${record.lng}` },
	];
}

/**
 * When the record was added, which is what decides the default survivor.
 *
 * The oldest row is preselected because it is the one the agency has had longest
 * and so the one most likely already named by the records that matter. Showing
 * the date is what makes that choice checkable rather than arbitrary.
 */
function addedOn(createdAt: string): string {
	const parsed = new Date(createdAt);
	if (Number.isNaN(parsed.getTime())) {
		return 'an unknown date';
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	}).format(parsed);
}

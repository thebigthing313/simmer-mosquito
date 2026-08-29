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
import type { DuplicateGroup, DuplicateRecord } from '../../hooks/use-merge-candidates';
import { WriteOnly } from '../write-only';
import {
	duplicateGroupHeading,
	type RecordCleanupConfig,
	recordCountLabel,
} from './record-cleanup-config';

const MergeIcon = iconRegistry.actions.merge.icon;

export interface DuplicateGroupPanelProps {
	readonly group: DuplicateGroup;
	readonly config: RecordCleanupConfig;
	/** Which record the user has chosen to keep. */
	readonly survivorId: string;
	readonly onSurvivorChange: (recordId: string) => void;
	/** Records the user has said do not belong in this group. */
	readonly excludedIds: ReadonlySet<string>;
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
	const kept = props.group.records.filter((record) => !props.excludedIds.has(record.id));
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
						Merge {sources.length} into {labelOf(survivor, props.config)}
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
						/>
					))}
				</ItemGroup>
			</RadioGroup>
		</Panel>
	);
}

function CandidateRow({
	config,
	isSurvivor,
	onExclude,
	record,
}: {
	readonly config: RecordCleanupConfig;
	readonly isSurvivor: boolean;
	readonly onExclude: () => void;
	readonly record: DuplicateRecord;
}) {
	const radioId = useId();

	return (
		<Item size="sm" variant={isSurvivor ? 'muted' : 'default'}>
			<ItemMedia>
				<RadioGroupItem id={radioId} value={record.id} />
			</ItemMedia>
			<ItemContent className="min-w-0">
				<ItemTitle>
					<Label className="cursor-pointer font-medium" htmlFor={radioId}>
						{labelOf(record, config)}
					</Label>
					{isSurvivor ? (
						<Badge className="ml-2" variant="secondary">
							Keeping
						</Badge>
					) : null}
				</ItemTitle>
				<ItemDescription className="truncate">
					{record.detail === null ? null : <>{record.detail} · </>}
					Added {addedOn(record.createdAt)}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
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

function labelOf(record: DuplicateRecord, config: RecordCleanupConfig): string {
	return record.label.trim() === '' ? config.unnamed : record.label;
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

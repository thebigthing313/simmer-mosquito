import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ChevronRightIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useEntityTags } from '../../../hooks/explorer/use-entity-tags';
import { useHabitatTypeOptions } from '../../../hooks/explorer/use-habitat-type-options';
import type { Tag } from '../../../hooks/queries/tag-view';
import { habitatName, habitatTypeName } from '../../../lib/habitat-name';
import { ClampedTextCell, LinkedTableRow } from '../../record/linked-table-row';
import { TagBadge } from '../../tag-badge';

const NO_TAGS: readonly Tag[] = [];

/** One Habitat as `/map/habitats` answers it, cut to what the table draws. */
export interface HabitatTableRow {
	readonly id: string;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly description: string;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}

/**
 * A page of Habitats as a table, one row per habitat with its Tags, each opening its detail page. Takes the rows the route read.
 */
export function HabitatsTable({ rows }: { readonly rows: readonly HabitatTableRow[] }) {
	const { nameById: typeNameById } = useHabitatTypeOptions();
	// Tags for the rows on this page, so the subset request stays small.
	const { byId: tagsByHabitatId } = useEntityTags(
		'habitat',
		rows.map((row) => row.id),
	);
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Name</TableHead>
						<TableHead>Habitat Type</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Access</TableHead>
						<TableHead>Tags</TableHead>
						<TableHead>Description</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<HabitatRow
							key={row.id}
							row={row}
							tags={tagsByHabitatId.get(row.id) ?? NO_TAGS}
							typeName={habitatTypeName(row.habitatTypeId, typeNameById)}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function HabitatRow({
	row,
	tags,
	typeName,
}: {
	readonly row: HabitatTableRow;
	readonly tags: readonly Tag[];
	readonly typeName: string;
}) {
	const name = habitatName(row);
	const description = row.description.trim();
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${name}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/larval-surveillance/habitats/table' }}
						to="/larval-surveillance/habitats/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="max-w-[20rem] truncate font-medium" title={name}>
				{name}
			</TableCell>
			<TableCell className="text-muted-foreground">{typeName}</TableCell>
			<TableCell>
				{row.isActive ? (
					<Badge tone="success" variant="outline">
						<CheckCircle2Icon aria-hidden="true" />
						Active
					</Badge>
				) : (
					<Badge tone="neutral" variant="outline">
						Inactive
					</Badge>
				)}
			</TableCell>
			<TableCell>
				{row.isInaccessible ? (
					<Badge tone="danger" variant="outline">
						<AlertTriangleIcon aria-hidden="true" />
						Inaccessible
					</Badge>
				) : (
					<span className="text-muted-foreground">Accessible</span>
				)}
			</TableCell>
			<TableCell>
				{tags.length === 0 ? (
					<AbsentValue />
				) : (
					<div className="flex flex-wrap gap-1">
						{tags.map((tag) => (
							<TagBadge key={tag.id} tag={tag} />
						))}
					</div>
				)}
			</TableCell>
			<ClampedTextCell empty={<AbsentValue />} text={description} />
		</LinkedTableRow>
	);
}

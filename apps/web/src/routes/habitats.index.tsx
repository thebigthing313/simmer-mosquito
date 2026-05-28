import type { HabitatDisplayRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	PlusIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
	type HabitatAccessFilter,
	type HabitatStatusFilter,
	type HabitatsLayoutContextValue,
	useHabitatsLayoutContext,
	type VisibleHabitat,
} from './habitats';

export const Route = createFileRoute('/habitats/')({
	component: HabitatsIndexRoute,
});

function HabitatsIndexRoute() {
	const habitats = useHabitatsLayoutContext();

	return (
		<>
			<CardHeader className="px-4 py-4">
				<div>
					<CardTitle>Habitats</CardTitle>
					<CardDescription>{visibleCountLabel(habitats.visibleHabitats.length)}</CardDescription>
				</div>
				<CardAction>
					<Button asChild size="sm">
						<Link to="/habitats/create">
							<PlusIcon data-icon="inline-start" />
							New habitat
						</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent padding="compact" className="flex min-h-0 flex-1 flex-col gap-4">
				<HabitatFiltersPanel {...habitats} />
				<Separator />
				<HabitatCards habitats={habitats.visibleHabitats} />
			</CardContent>
		</>
	);
}

function HabitatFiltersPanel({
	filters,
	habitatTypes,
	onFiltersChange,
}: HabitatsLayoutContextValue) {
	return (
		<FieldGroup className="grid grid-cols-2 gap-2 min-[1440px]:grid-cols-3">
			<Field className="gap-1">
				<FieldLabel className="sr-only">Habitat status</FieldLabel>
				<Select
					onValueChange={(value) =>
						onFiltersChange({ ...filters, status: value as HabitatStatusFilter })
					}
					value={filters.status}
				>
					<SelectTrigger aria-label="Habitat status" className="w-full bg-background/80" size="sm">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">All statuses</SelectItem>
							<SelectItem value="active">Active</SelectItem>
							<SelectItem value="inactive">Inactive</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field className="gap-1">
				<FieldLabel className="sr-only">Access</FieldLabel>
				<Select
					onValueChange={(value) =>
						onFiltersChange({ ...filters, access: value as HabitatAccessFilter })
					}
					value={filters.access}
				>
					<SelectTrigger aria-label="Access" className="w-full bg-background/80" size="sm">
						<SelectValue placeholder="Access" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">Any access</SelectItem>
							<SelectItem value="accessible">Accessible</SelectItem>
							<SelectItem value="inaccessible">Inaccessible</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field className="col-span-2 gap-1 min-[1440px]:col-span-1">
				<FieldLabel className="sr-only">Habitat type</FieldLabel>
				<Select
					onValueChange={(value) => onFiltersChange({ ...filters, habitatTypeId: value })}
					value={filters.habitatTypeId}
				>
					<SelectTrigger aria-label="Habitat type" className="w-full bg-background/80" size="sm">
						<SelectValue placeholder="Type" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">All types</SelectItem>
							{habitatTypes.map((type) => (
								<SelectItem key={type.id} value={type.id}>
									{type.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
		</FieldGroup>
	);
}

function HabitatCards({ habitats }: { readonly habitats: readonly VisibleHabitat[] }) {
	if (habitats.length === 0) {
		return <HabitatEmpty />;
	}

	return (
		<ScrollArea className="min-h-0 flex-1 pr-3">
			<div className="grid gap-3">
				{habitats.map((habitat) => (
					<article
						key={habitat.row.id}
						className="grid gap-3 rounded-md border border-border/40 bg-muted/30 px-4 py-4"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="grid gap-1">
								<strong className="text-[0.98rem] leading-none font-semibold text-foreground">
									{habitatName(habitat.row)}
								</strong>
								<span className="text-sm text-muted-foreground">{habitat.typeName}</span>
							</div>
							<HabitatStateBadge habitat={habitat.row} />
						</div>
						<div className="grid gap-3">
							<p className="m-0 line-clamp-2 text-[0.88rem] text-muted-foreground">
								{habitatDescription(habitat.row)}
							</p>
							<HabitatFacts habitat={habitat.row} />
						</div>
					</article>
				))}
			</div>
		</ScrollArea>
	);
}

function HabitatFacts({ habitat }: { readonly habitat: HabitatDisplayRow }) {
	return (
		<div className="grid grid-cols-3 gap-2 text-[0.78rem] max-[560px]:grid-cols-1">
			<Fact label="Geometry" value={habitat.geomType} />
			<Fact label="Location" value={coordinateLabel(habitat)} />
			<Fact label="Updated" value={formatShortDate(habitat.updatedAt)} />
		</div>
	);
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-background px-2.5 py-2">
			<span className="font-bold text-muted-foreground">{label}</span>
			<strong className="truncate font-semibold text-foreground">{value}</strong>
		</div>
	);
}

function HabitatStateBadge({ habitat }: { readonly habitat: HabitatDisplayRow }) {
	if (habitat.isInaccessible) {
		return (
			<Badge variant="outline" tone="danger">
				<AlertTriangleIcon aria-hidden="true" />
				Inaccessible
			</Badge>
		);
	}

	if (habitat.isActive) {
		return (
			<Badge variant="outline" tone="success">
				<CheckCircle2Icon aria-hidden="true" />
				Active
			</Badge>
		);
	}

	return (
		<Badge variant="outline" tone="neutral">
			Inactive
		</Badge>
	);
}

function HabitatEmpty() {
	return (
		<Empty className="min-h-[220px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>No habitats in the current display</EmptyTitle>
				<EmptyDescription>
					Pan the map or loosen filters to bring habitat records into the bounded list.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function habitatName(habitat: HabitatDisplayRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}

function habitatDescription(habitat: HabitatDisplayRow): string {
	return habitat.description.trim() || 'No description recorded.';
}

function coordinateLabel(habitat: HabitatDisplayRow): string {
	return `${habitat.lat.toFixed(4)}, ${habitat.lng.toFixed(4)}`;
}

function visibleCountLabel(total: number): string {
	return `Showing ${total} habitats in map bounds, limit 50`;
}

function formatShortDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	}).format(date);
}

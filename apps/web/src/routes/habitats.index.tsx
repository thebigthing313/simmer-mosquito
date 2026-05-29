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
import { PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { HabitatCard } from './-habitat-card';
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
					<HabitatCard habitat={habitat} key={habitat.row.id} mode="compact" />
				))}
			</div>
		</ScrollArea>
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

function visibleCountLabel(total: number): string {
	return `Showing ${total} habitats in map bounds, limit 50`;
}

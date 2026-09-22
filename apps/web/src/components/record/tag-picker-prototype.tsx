/**
 * PROTOTYPE - throwaway. Ticket #1207, map #1204.
 *
 * Three variants of the tag picker on a record detail page, switchable with
 * `?variant=A|B|C` and the floating bar at the bottom of the screen. Nothing
 * here writes: assignment is an in-memory set seeded from the record's real
 * Tags, and relevance is stubbed, because the `relevant_entity_types` column
 * does not exist yet.
 *
 * A - a `+` at the end of the header chip row, opening a Command popover.
 * B - a Tags card in the page body; the header stays read-only.
 * C - a "Tags" button in the header opening a modal over the whole catalog.
 */

import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import {
	CheckIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	PlusIcon,
	TagIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRecordTags } from '../../hooks/queries/use-record-tags';
import { type TagRecord, useTagCatalog } from '../../hooks/queries/use-tag-catalog';
import { TagBadge } from '../tag-badge';

export type PrototypeVariant = 'A' | 'B' | 'C';

const VARIANTS: readonly PrototypeVariant[] = ['A', 'B', 'C'];

const VARIANT_NAMES: Record<PrototypeVariant, string> = {
	A: 'Plus in the header chip row',
	B: 'Tags card in the body',
	C: 'Modal over the whole catalog',
};

/** The record type the stub relevance is measured against. */
const RECORD_NOUN = 'habitats';

interface PrototypeState {
	readonly variant: PrototypeVariant;
	/** `some`: half the catalog is relevant. `none`: nothing is. */
	readonly scenario: 'some' | 'none';
	/** Null until somebody touches the picker, then the whole assignment. */
	readonly assigned: ReadonlySet<string> | null;
}

let state: PrototypeState = {
	assigned: null,
	scenario: 'some',
	variant: readVariantFromUrl(),
};

const listeners = new Set<() => void>();

function setState(next: Partial<PrototypeState>) {
	state = { ...state, ...next };
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function usePrototypeState(): PrototypeState {
	return useSyncExternalStore(
		subscribe,
		() => state,
		() => state,
	);
}

function readVariantFromUrl(): PrototypeVariant {
	if (typeof window === 'undefined') {
		return 'A';
	}
	const value = new URLSearchParams(window.location.search).get('variant');
	return value === 'B' || value === 'C' ? value : 'A';
}

function setVariant(variant: PrototypeVariant) {
	const url = new URL(window.location.href);
	url.searchParams.set('variant', variant);
	window.history.replaceState(null, '', url);
	setState({ variant });
}

/** Stubbed: every other Tag in the catalog is relevant to this record type. */
function isRelevant(tag: TagRecord, scenario: PrototypeState['scenario']): boolean {
	if (scenario === 'none') {
		return false;
	}
	return tag.name.trim().charCodeAt(0) % 2 === 0;
}

interface PickerModel {
	readonly assigned: readonly TagRecord[];
	readonly relevant: readonly TagRecord[];
	readonly other: readonly TagRecord[];
	/** Assigned, but not relevant to this record type. */
	readonly offType: readonly TagRecord[];
	readonly isAssigned: (id: string) => boolean;
	readonly toggle: (id: string) => void;
}

function usePickerModel(recordId: string): PickerModel {
	const { scenario, assigned: override } = usePrototypeState();
	const live = useRecordTags(recordId);
	const { activeTags } = useTagCatalog();
	const assignedIds = override ?? new Set(live.map((tag) => tag.id));
	const isAssigned = (id: string) => assignedIds.has(id);
	const toggle = (id: string) => {
		const next = new Set(assignedIds);
		if (!next.delete(id)) {
			next.add(id);
		}
		setState({ assigned: next });
	};
	const assigned = activeTags.filter((tag) => isAssigned(tag.id));
	return {
		assigned,
		isAssigned,
		offType: assigned.filter((tag) => !isRelevant(tag, scenario)),
		other: activeTags.filter((tag) => !isRelevant(tag, scenario)),
		relevant: activeTags.filter((tag) => isRelevant(tag, scenario)),
		toggle,
	};
}

function asTag(tag: TagRecord) {
	return { color: tag.color, description: tag.description, id: tag.id, name: tag.name };
}

/* ------------------------------------------------------------------ header */

/**
 * What the detail header draws in place of `RecordTags`. Every variant keeps
 * the chips; they differ in what sits at the end of the row.
 */
export function PrototypeHeaderTags({ recordId }: { readonly recordId: string }) {
	const { variant } = usePrototypeState();
	const model = usePickerModel(recordId);
	if (variant === 'B') {
		return (
			<>
				{model.assigned.map((tag) => (
					<TagBadge key={tag.id} tag={asTag(tag)} />
				))}
			</>
		);
	}
	if (variant === 'C') {
		return <HeaderWithModal model={model} />;
	}
	return <HeaderWithPopover model={model} />;
}

/** A: chips, then a plus that opens a Command popover. */
function HeaderWithPopover({ model }: { readonly model: PickerModel }) {
	const { scenario } = usePrototypeState();
	const [open, setOpen] = useState(false);
	const [widened, setWidened] = useState(false);
	const nothingRelevant = model.relevant.length === 0;
	const showAll = widened || nothingRelevant;
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{model.assigned.map((tag) => (
				<TagBadge key={tag.id} tag={asTag(tag)} />
			))}
			<Popover
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) {
						setWidened(false);
					}
				}}
				open={open}
			>
				<PopoverTrigger asChild>
					<Button
						aria-label="Add a tag"
						className={model.assigned.length === 0 ? 'px-2 font-normal' : undefined}
						size={model.assigned.length === 0 ? 'sm' : 'icon-sm'}
						variant={model.assigned.length === 0 ? 'outline' : 'ghost'}
					>
						{model.assigned.length === 0 ? (
							<>
								<TagIcon aria-hidden="true" />
								Tags
							</>
						) : (
							<PlusIcon aria-hidden="true" />
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-72 p-0">
					<Command>
						<CommandInput placeholder="Search tags..." />
						<CommandList>
							<CommandEmpty>No tag by that name.</CommandEmpty>
							{model.offType.length > 0 ? (
								<>
									<CommandGroup heading="On this record">
										{model.offType.map((tag) => (
											<PickerRow key={tag.id} model={model} tag={tag} />
										))}
									</CommandGroup>
									<CommandSeparator />
								</>
							) : null}
							<CommandGroup heading={nothingRelevant ? 'All tags' : `For ${RECORD_NOUN}`}>
								{(nothingRelevant ? model.other : model.relevant).map((tag) => (
									<PickerRow key={tag.id} model={model} tag={tag} />
								))}
							</CommandGroup>
							{showAll && !nothingRelevant ? (
								<CommandGroup heading="Other tags">
									{model.other.map((tag) => (
										<PickerRow key={tag.id} model={model} tag={tag} />
									))}
								</CommandGroup>
							) : null}
						</CommandList>
						<Separator />
						<div className="p-1">
							{nothingRelevant ? (
								<p className="px-2 py-1.5 text-muted-foreground text-xs">
									No tags are set up for {RECORD_NOUN}. Showing every tag.
								</p>
							) : (
								<Button
									className="w-full justify-start font-normal"
									onClick={() => setWidened(!widened)}
									size="sm"
									variant="ghost"
								>
									{widened ? `Show only tags for ${RECORD_NOUN}` : 'Show all tags'}
								</Button>
							)}
						</div>
					</Command>
				</PopoverContent>
			</Popover>
			<ScenarioNote scenario={scenario} />
		</div>
	);
}

function PickerRow({ tag, model }: { readonly tag: TagRecord; readonly model: PickerModel }) {
	const checked = model.isAssigned(tag.id);
	return (
		<CommandItem onSelect={() => model.toggle(tag.id)} value={`${tag.name} ${tag.id}`}>
			<span
				className={cn(
					'flex size-4 items-center justify-center rounded-sm border',
					checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
				)}
			>
				{checked ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
			</span>
			<TagBadge tag={asTag(tag)} />
		</CommandItem>
	);
}

/** C: chips, then a counted button that opens the catalog in a dialog. */
function HeaderWithModal({ model }: { readonly model: PickerModel }) {
	const [open, setOpen] = useState(false);
	const { scenario } = usePrototypeState();
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{model.assigned.map((tag) => (
				<span className="group relative inline-flex" key={tag.id}>
					<TagBadge tag={asTag(tag)} />
					<button
						aria-label={`Remove ${tag.name}`}
						className="-right-1 -top-1 absolute hidden size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground group-hover:flex"
						onClick={() => model.toggle(tag.id)}
						type="button"
					>
						<XIcon aria-hidden="true" className="size-2.5" />
					</button>
				</span>
			))}
			<Button onClick={() => setOpen(true)} size="sm" variant="outline">
				<TagIcon aria-hidden="true" />
				Tags
				{model.assigned.length > 0 ? (
					<Badge className="px-1.5" variant="secondary">
						{model.assigned.length}
					</Badge>
				) : null}
			</Button>
			<TagDialog model={model} onOpenChange={setOpen} open={open} />
			<ScenarioNote scenario={scenario} />
		</div>
	);
}

function TagDialog({
	model,
	open,
	onOpenChange,
}: {
	readonly model: PickerModel;
	readonly open: boolean;
	readonly onOpenChange: (next: boolean) => void;
}) {
	const [search, setSearch] = useState('');
	const matches = (tag: TagRecord) => tag.name.toLowerCase().includes(search.trim().toLowerCase());
	const relevant = model.relevant.filter(matches);
	const other = model.other.filter(matches);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Tags</DialogTitle>
					<DialogDescription>
						Any tag can go on any record. The ones set up for {RECORD_NOUN} are listed first.
					</DialogDescription>
				</DialogHeader>
				<Input
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search tags..."
					value={search}
				/>
				<div className="grid max-h-80 gap-4 overflow-y-auto">
					<DialogSection
						empty={`No tags are set up for ${RECORD_NOUN}.`}
						heading={`For ${RECORD_NOUN}`}
						model={model}
						tags={relevant}
					/>
					<DialogSection
						empty="Nothing else in the catalog."
						heading="Every other tag"
						model={model}
						tags={other}
					/>
				</div>
				<DialogFooter className="sm:justify-between">
					<span className="text-muted-foreground text-sm">
						{model.assigned.length} on this habitat
					</span>
					<Button onClick={() => onOpenChange(false)}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DialogSection({
	heading,
	tags,
	empty,
	model,
}: {
	readonly heading: string;
	readonly tags: readonly TagRecord[];
	readonly empty: string;
	readonly model: PickerModel;
}) {
	return (
		<div className="grid gap-1">
			<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
				{heading}
			</span>
			{tags.length === 0 ? (
				<p className="text-muted-foreground text-sm">{empty}</p>
			) : (
				tags.map((tag) => {
					const checked = model.isAssigned(tag.id);
					return (
						<button
							className={cn(
								'flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent',
								checked ? 'bg-accent/50' : undefined,
							)}
							key={tag.id}
							onClick={() => model.toggle(tag.id)}
							type="button"
						>
							<span
								className={cn(
									'flex size-4 items-center justify-center rounded-sm border',
									checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
								)}
							>
								{checked ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
							</span>
							<TagBadge tag={asTag(tag)} />
							{tag.description === null ? null : (
								<span className="truncate text-muted-foreground text-xs">{tag.description}</span>
							)}
						</button>
					);
				})
			)}
		</div>
	);
}

/* -------------------------------------------------------------------- body */

/** B: the Tags card in the page body. Renders nothing for the other variants. */
export function PrototypeTagsCard({ recordId }: { readonly recordId: string }) {
	const { variant, scenario } = usePrototypeState();
	const model = usePickerModel(recordId);
	const [open, setOpen] = useState(false);
	const [widened, setWidened] = useState(false);
	const nothingRelevant = model.relevant.length === 0;
	const listed = nothingRelevant || widened ? [...model.relevant, ...model.other] : model.relevant;
	if (variant !== 'B') {
		return null;
	}
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Tags</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				{model.assigned.length === 0 ? (
					<p className="text-muted-foreground text-sm">No tags on this habitat.</p>
				) : (
					<div className="flex flex-wrap items-center gap-1.5">
						{model.assigned.map((tag) => (
							<span
								className={cn(
									'inline-flex items-center gap-1 rounded-md',
									model.offType.includes(tag) ? 'outline-1 outline-border outline-dashed' : undefined,
								)}
								key={tag.id}
							>
								<TagBadge tag={asTag(tag)} />
								<button
									aria-label={`Remove ${tag.name}`}
									className="text-muted-foreground hover:text-foreground"
									onClick={() => model.toggle(tag.id)}
									type="button"
								>
									<XIcon aria-hidden="true" className="size-3.5" />
								</button>
							</span>
						))}
					</div>
				)}
				<Popover onOpenChange={setOpen} open={open}>
					<PopoverTrigger asChild>
						<Button className="w-fit font-normal" size="sm" variant="outline">
							<PlusIcon aria-hidden="true" />
							Add a tag
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 p-0">
						<Command>
							<CommandInput placeholder="Search tags..." />
							<CommandList>
								<CommandEmpty>No tag by that name.</CommandEmpty>
								<CommandGroup
									heading={nothingRelevant || widened ? 'All tags' : `For ${RECORD_NOUN}`}
								>
									{listed.map((tag) => (
										<PickerRow key={tag.id} model={model} tag={tag} />
									))}
								</CommandGroup>
							</CommandList>
							<Separator />
							<div className="p-1">
								{nothingRelevant ? (
									<p className="px-2 py-1.5 text-muted-foreground text-xs">
										No tags are set up for {RECORD_NOUN}. Showing every tag.
									</p>
								) : (
									<Button
										className="w-full justify-start font-normal"
										onClick={() => setWidened(!widened)}
										size="sm"
										variant="ghost"
									>
										{widened ? `Show only tags for ${RECORD_NOUN}` : 'Show all tags'}
									</Button>
								)}
							</div>
						</Command>
					</PopoverContent>
				</Popover>
				<ScenarioNote scenario={scenario} />
			</CardContent>
		</Card>
	);
}

function ScenarioNote({ scenario }: { readonly scenario: PrototypeState['scenario'] }) {
	if (scenario !== 'none') {
		return null;
	}
	return <span className="text-muted-foreground text-xs">(no tag is relevant here)</span>;
}

/* ---------------------------------------------------------------- switcher */

/** The floating bar. Left and right cycle variants; the pill toggles the scenario. */
export function PrototypeSwitcher() {
	const { variant, scenario } = usePrototypeState();
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target !== null &&
				(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
			) {
				return;
			}
			if (event.key === 'ArrowLeft') {
				setVariant(step(-1));
			}
			if (event.key === 'ArrowRight') {
				setVariant(step(1));
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	return (
		<div className="-translate-x-1/2 fixed bottom-4 left-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-foreground px-2 py-1 text-background shadow-lg">
			<Button
				aria-label="Previous variant"
				className="text-background hover:bg-background/20 hover:text-background"
				onClick={() => setVariant(step(-1))}
				size="icon-sm"
				variant="ghost"
			>
				<ChevronLeftIcon aria-hidden="true" />
			</Button>
			<span className="text-xs">
				{variant}: {VARIANT_NAMES[variant]}
			</span>
			<Button
				aria-label="Next variant"
				className="text-background hover:bg-background/20 hover:text-background"
				onClick={() => setVariant(step(1))}
				size="icon-sm"
				variant="ghost"
			>
				<ChevronRightIcon aria-hidden="true" />
			</Button>
			<Button
				className="h-7 rounded-full px-2 text-xs"
				onClick={() => setState({ assigned: null, scenario: scenario === 'some' ? 'none' : 'some' })}
				size="sm"
				variant="secondary"
			>
				{scenario === 'some' ? 'Some relevant' : 'None relevant'}
			</Button>
		</div>
	);
}

function step(by: number): PrototypeVariant {
	const index = VARIANTS.indexOf(state.variant);
	return VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length] as PrototypeVariant;
}

import {
	normalizeBindableKey,
	type OrganizationSettings,
	type SpeciesKeyBinding,
} from '@simmer-mosquito/domain';
import type { OrganizationRow, OrganizationSpeciesRow, SpeciesRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Kbd } from '@simmer-mosquito/ui-web/components/ui/kbd';
import {
	iconRegistry,
	KeyboardIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useMemo, useState } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { errorMessageForSave, updateCurrentOrganization } from './helpers';

const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

interface SpeciesOption {
	readonly id: string;
	readonly label: string;
}

/**
 * Key binding setup: one key per species, assigned against the agency's adopted
 * species list. The same set drives adult and larval key entry, so the editor keeps
 * both a bound list and an unbound list visible rather than hiding what is left.
 */
export function KeyBindingsSettings({
	canManage,
	organization,
	settings,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
}) {
	const options = useSpeciesOptions();
	const stored = settings.speciesKeyBindings.bindings;
	const [error, setError] = useState<string | null>(null);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [filter, setFilter] = useState('');

	const keyBySpeciesId = useMemo(
		() => new Map(stored.map((binding) => [binding.speciesId, binding.key] as const)),
		[stored],
	);
	const takenKeys = useMemo(() => new Set(stored.map((binding) => binding.key)), [stored]);

	const bound = useMemo(
		() =>
			stored.map((binding) => ({
				binding,
				label: options.find((option) => option.id === binding.speciesId)?.label ?? null,
			})),
		[stored, options],
	);
	// The filter narrows the unassigned list only — bound keys stay visible so an
	// admin can always see what a key is already taken by while searching.
	const unbound = useMemo(() => {
		const needle = filter.trim().toLowerCase();
		const available = options.filter((option) => !keyBySpeciesId.has(option.id));
		return needle.length === 0
			? available
			: available.filter((option) => option.label.toLowerCase().includes(needle));
	}, [options, keyBySpeciesId, filter]);

	async function save(next: readonly SpeciesKeyBinding[], busy: string): Promise<void> {
		setBusyKey(busy);
		setError(null);
		try {
			await updateCurrentOrganization(organization, (draft) => {
				draft.settings = {
					...settings,
					speciesKeyBindings: { bindings: next },
				};
			});
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		} finally {
			setBusyKey(null);
		}
	}

	function assign(speciesId: string, rawKey: string): void {
		const key = normalizeBindableKey(rawKey);
		if (key === null) {
			setError('A key must be a single letter or digit.');
			return;
		}
		const heldBy = stored.find((binding) => binding.key === key && binding.speciesId !== speciesId);
		if (heldBy !== undefined) {
			const name =
				options.find((option) => option.id === heldBy.speciesId)?.label ?? 'another species';
			setError(`“${key}” already records ${name}. Clear it first, or pick another key.`);
			return;
		}
		void save(
			[...stored.filter((binding) => binding.speciesId !== speciesId), { key, speciesId }],
			speciesId,
		);
	}

	function clear(speciesId: string): void {
		void save(
			stored.filter((binding) => binding.speciesId !== speciesId),
			speciesId,
		);
	}

	if (options.length === 0) {
		return (
			<Empty className="min-h-[160px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<SpeciesIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>No Species Adopted</EmptyTitle>
					<EmptyDescription>
						Adopt species for this agency before assigning keys to them.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="grid gap-4">
			{error !== null ? (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			<div className="grid gap-2">
				<div className="flex items-baseline justify-between gap-2">
					<SectionLabel>Bound keys</SectionLabel>
					<span className="text-muted-foreground text-xs">
						{bound.length} of {options.length} species
					</span>
				</div>
				{bound.length === 0 ? (
					<p className="m-0 rounded-md border border-border/40 bg-muted/20 px-3 py-4 text-center text-muted-foreground text-sm">
						No keys assigned yet. Give a species a key below to start.
					</p>
				) : (
					<ul className="grid gap-1.5">
						{bound.map(({ binding, label }) => (
							<li
								className="flex items-center gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2"
								key={binding.speciesId}
							>
								<Kbd className="size-6 shrink-0 text-sm">{binding.key}</Kbd>
								<span
									className={cn(
										'min-w-0 flex-1 truncate text-sm',
										label === null ? 'text-muted-foreground' : 'italic',
									)}
								>
									{label ?? 'Species no longer in the taxonomy'}
								</span>
								{canManage ? (
									<Button
										aria-label={`Clear the key for ${label ?? 'this species'}`}
										disabled={busyKey !== null}
										onClick={() => clear(binding.speciesId)}
										size="icon-xs"
										type="button"
										variant="ghost"
									>
										<XIcon aria-hidden="true" />
									</Button>
								) : null}
							</li>
						))}
					</ul>
				)}
			</div>

			{canManage ? (
				<div className="grid gap-2">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<SectionLabel>Unassigned species</SectionLabel>
						<div className="relative w-full sm:w-64">
							<SearchIcon
								aria-hidden="true"
								className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground"
							/>
							<Input
								aria-label="Filter species"
								className="h-8 pl-8"
								onChange={(event) => setFilter(event.target.value)}
								placeholder="Filter species…"
								type="search"
								value={filter}
							/>
						</div>
					</div>
					{unbound.length === 0 ? (
						<p className="m-0 rounded-md border border-border/40 bg-muted/20 px-3 py-4 text-center text-muted-foreground text-sm">
							{filter.trim().length > 0
								? `No unassigned species match “${filter.trim()}”.`
								: 'Every species has a key.'}
						</p>
					) : (
						<ul className="grid gap-1.5">
							{unbound.map((option) => (
								<AssignRow
									busy={busyKey !== null}
									key={option.id}
									onAssign={(key) => assign(option.id, key)}
									option={option}
									takenKeys={takenKeys}
								/>
							))}
						</ul>
					)}
				</div>
			) : null}

			<p className="m-0 text-muted-foreground text-xs">
				Bindable keys: letters and digits. Escape, Enter, Backspace, Tab, and the arrow keys stay
				reserved for the entry modal.
			</p>
		</div>
	);
}

function AssignRow({
	option,
	takenKeys,
	busy,
	onAssign,
}: {
	readonly option: SpeciesOption;
	readonly takenKeys: ReadonlySet<string>;
	readonly busy: boolean;
	readonly onAssign: (key: string) => void;
}) {
	const [draft, setDraft] = useState('');
	const normalized = normalizeBindableKey(draft);
	const isTaken = normalized !== null && takenKeys.has(normalized);

	function submit(key: string): void {
		onAssign(key);
		setDraft('');
	}

	return (
		<li className="flex items-center gap-3 rounded-md border border-border/40 border-dashed px-3 py-2">
			<span className="min-w-0 flex-1 truncate text-sm italic">{option.label}</span>
			{isTaken ? (
				<Badge tone="warning" variant="outline">
					Key in use
				</Badge>
			) : null}
			<Input
				aria-label={`Key for ${option.label}`}
				className="h-8 w-14 text-center font-medium uppercase"
				disabled={busy}
				maxLength={1}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter' && normalized !== null) {
						event.preventDefault();
						submit(normalized);
					}
				}}
				placeholder="—"
				value={draft}
			/>
			<Button
				disabled={busy || normalized === null || isTaken}
				onClick={() => {
					if (normalized !== null) {
						submit(normalized);
					}
				}}
				size="sm"
				type="button"
				variant="outline"
			>
				<KeyboardIcon aria-hidden="true" />
				Bind
			</Button>
		</li>
	);
}

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
	return (
		<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
			{children}
		</span>
	);
}

/**
 * The agency's adopted species, falling back to the full taxonomy when none are
 * curated — the same rule the sample identification picker follows.
 */
function useSpeciesOptions(): readonly SpeciesOption[] {
	const { rows: species } = useCollectionRows<SpeciesRow>(webCollections.species);
	const { rows: organizationSpecies } = useCollectionRows<OrganizationSpeciesRow>(
		webCollections.organizationSpecies,
	);

	return useMemo(() => {
		const adopted = new Set(organizationSpecies.map((row) => row.speciesId));
		const source = adopted.size > 0 ? species.filter((row) => adopted.has(row.id)) : species;
		return source
			.map((row) => ({ id: row.id, label: row.displayName }))
			.sort((first, second) => first.label.localeCompare(second.label));
	}, [species, organizationSpecies]);
}

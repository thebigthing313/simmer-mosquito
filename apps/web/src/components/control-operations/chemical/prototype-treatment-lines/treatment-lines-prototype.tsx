/**
 * PROTOTYPE, throwaway (#1743). Three layouts for a Treatment's product lines,
 * switched with `?variant=A|B|C` on `/control-operations/chemical/create`, in
 * place of today's Product section. Nothing saves: the panel under the variant
 * shows the command body a save would send, per #1740. "Simulate edit" seeds
 * two saved lines (one with batch links) so removals and the PATCH can be tried.
 */
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { type ReactNode, useEffect, useState } from 'react';
import type { ApplicationFormValues } from '../application-form-values';
import { noSelectionValue } from '../application-form-values';
import {
	blankLine,
	type Catalog,
	commandBody,
	formulationOf,
	type Line,
	linesFromMix,
	type Mix,
	type Mode,
	refusalsFor,
	seededEditLines,
} from './model';
import type { LineOps } from './ops';
import { VariantATable } from './variant-a-table';
import { VariantBCards } from './variant-b-cards';
import { VariantCLedger } from './variant-c-ledger';

const VARIANTS = [
	{ key: 'A', name: 'Line table', Component: VariantATable },
	{ key: 'B', name: 'Product cards', Component: VariantBCards },
	{ key: 'C', name: 'Mix ledger', Component: VariantCLedger },
] as const;

/** The `?variant=` key when the prototype is switched on, else null. Dev builds only. */
export function readPrototypeVariant(): string | null {
	if (!import.meta.env.DEV || typeof window === 'undefined') {
		return null;
	}
	return new URLSearchParams(window.location.search).get('variant');
}

export function TreatmentLinesPrototype({
	catalog,
	values,
	defaults,
}: {
	readonly catalog: Catalog;
	readonly values: ApplicationFormValues;
	readonly defaults: ApplicationFormValues;
}) {
	const [variant, setVariant] = useState(() => readPrototypeVariant() ?? 'A');
	const [mode, setMode] = useState<Mode>('create');
	const [lines, setLines] = useState<readonly Line[]>(() => [blankLine()]);
	const [mix, setMixState] = useState<Mix | null>(null);
	const [serverDuplicate, setServerDuplicate] = useState(false);
	const [treatmentId] = useState(() => crypto.randomUUID());

	const index = Math.max(
		0,
		VARIANTS.findIndex((row) => row.key === variant),
	);
	const current = VARIANTS[index] ?? VARIANTS[0];
	const go = (step: number) => {
		const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length] ?? VARIANTS[0];
		const url = new URL(window.location.href);
		url.searchParams.set('variant', next.key);
		window.history.replaceState(window.history.state, '', url);
		setVariant(next.key);
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest('input, textarea, select, [contenteditable]')) {
				return;
			}
			if (event.key === 'ArrowLeft') go(-1);
			if (event.key === 'ArrowRight') go(1);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const ops: LineOps = {
		add: () => setLines((prev) => [...prev, blankLine()]),
		update: (id, patch) =>
			setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line))),
		remove: (id) =>
			setLines((prev) =>
				prev.flatMap((line) => {
					if (line.id !== id) return [line];
					return line.stored ? [{ ...line, removed: true }] : [];
				}),
			),
		undoRemove: (id) =>
			setLines((prev) => prev.map((line) => (line.id === id ? { ...line, removed: false } : line))),
		setMix: setMixState,
		fillFromMix: (next) => {
			setMixState(next);
			setLines((prev) => [
				...prev.filter((line) => line.stored).map((line) => ({ ...line, removed: true })),
				...linesFromMix(catalog, next),
			]);
		},
	};

	const switchMode = (next: Mode) => {
		setMode(next);
		setMixState(null);
		setServerDuplicate(false);
		setLines(next === 'edit' ? seededEditLines(catalog) : [blankLine()]);
	};

	const refusals = refusalsFor(catalog, lines, mode, serverDuplicate);
	const header = headerOf(values);
	const headerTouched = JSON.stringify(header) !== JSON.stringify(headerOf(defaults));
	const body = commandBody({
		mode,
		treatmentId,
		header,
		headerTouched: headerTouched || (mode === 'edit' && mix !== null),
		lines,
		mix,
		mixUnitId:
			mix === null ? null : (formulationOf(catalog, mix.formulationId)?.batchUnitId ?? null),
	});
	const Variant = current.Component;

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/60 border-dashed bg-amber-500/5 px-3 py-2 text-xs">
				<strong>Prototype #1743</strong>
				<span className="text-muted-foreground">Nothing saves.</span>
				<Seg active={mode === 'create'} onClick={() => switchMode('create')}>
					Create
				</Seg>
				<Seg active={mode === 'edit'} onClick={() => switchMode('edit')}>
					Simulate edit
				</Seg>
				<Seg active={serverDuplicate} onClick={() => setServerDuplicate((on) => !on)}>
					Simulate server 400 on line 2
				</Seg>
			</div>

			<Variant
				catalog={catalog}
				lines={lines}
				mix={mix}
				mode={mode}
				ops={ops}
				refusals={refusals}
			/>

			<details className="rounded-md border border-border bg-muted/20 text-xs" open>
				<summary className="cursor-pointer px-3 py-2 font-medium">What Save would send</summary>
				<pre className="m-0 max-h-80 overflow-auto px-3 pb-3 font-mono text-[11px] leading-snug">
					{JSON.stringify(body, null, 2)}
				</pre>
			</details>

			<div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-background shadow-lg">
				<Button
					aria-label="Previous variant"
					className="rounded-full text-background hover:bg-background/20 hover:text-background"
					onClick={() => go(-1)}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					←
				</Button>
				<span className="min-w-36 text-center font-medium text-sm">
					{current.key} ({current.name})
				</span>
				<Button
					aria-label="Next variant"
					className="rounded-full text-background hover:bg-background/20 hover:text-background"
					onClick={() => go(1)}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					→
				</Button>
			</div>
		</div>
	);
}

function Seg({
	active,
	onClick,
	children,
}: {
	readonly active: boolean;
	readonly onClick: () => void;
	readonly children: ReactNode;
}) {
	return (
		<Button onClick={onClick} size="xs" type="button" variant={active ? 'default' : 'outline'}>
			{children}
		</Button>
	);
}

function headerOf(values: ApplicationFormValues) {
	const pick = (value: string) => (value === noSelectionValue || value === '' ? null : value);
	return {
		applicationDate: values.applicationDate,
		applicatorProfileId: pick(values.applicatorProfileId),
		applicationMethodId: pick(values.applicationMethodId),
		vehicleId: pick(values.vehicleId),
		equipmentId: pick(values.equipmentId),
		metadata: values.metadata,
	};
}

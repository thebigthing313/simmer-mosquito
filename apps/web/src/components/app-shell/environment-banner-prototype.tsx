/**
 * PROTOTYPE, THROWAWAY. Ticket #380: what does the staging banner say, and
 * where does it sit in the two-rail shell?
 *
 * Three structurally different answers on the real shell over real data,
 * switched with `?envBanner=A|B|C` and a floating bar. Nothing here is meant
 * to merge: the winner gets rewritten, the rest go to the prototype branch.
 *
 * Read the variant from `window.location.search` rather than the router's
 * typed search, so no route schema has to learn a param that is about to be
 * deleted.
 */

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { TriangleAlertIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { useEffect, useState } from 'react';

const VARIANTS = ['A', 'B', 'C'] as const;
type Variant = (typeof VARIANTS)[number];

const VARIANT_NAMES: Record<Variant, string> = {
	A: 'Strip above the shell',
	B: 'Tinted rail and header pill',
	C: 'Gate on entry, corner tab after',
};

/**
 * The copy, in one place, so a variant argues about shape and not wording.
 * Three facts: which environment, what happens to the data, what it refuses.
 */
const ENVIRONMENT = 'Staging';
const SHORT = 'A copy of your live data. Changes here are erased on the next refresh.';
const REFUSES =
	'Sign-in accounts, Memberships, roles and invitations cannot be changed on Staging. Everything else works.';

function useVariant(): [Variant | null, (next: Variant | null) => void] {
	const read = (): Variant | null => {
		const raw = new URLSearchParams(window.location.search).get('envBanner');
		return (VARIANTS as readonly string[]).includes(raw ?? '') ? (raw as Variant) : null;
	};
	const [variant, setVariant] = useState<Variant | null>(read);

	const write = (next: Variant | null) => {
		const params = new URLSearchParams(window.location.search);
		if (next === null) {
			params.delete('envBanner');
		} else {
			params.set('envBanner', next);
		}
		const query = params.toString();
		window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
		setVariant(next);
	};

	return [variant, write];
}

/** Variant A: a strip across the top, above both rails. Not dismissible. */
function StripBanner() {
	return (
		<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-amber-950 text-sm">
			<TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
			<span className="font-semibold">{ENVIRONMENT}</span>
			<span>{SHORT}</span>
			<Popover>
				<PopoverTrigger className="underline underline-offset-2">
					What is different here
				</PopoverTrigger>
				<PopoverContent align="start" className="text-sm">
					{REFUSES}
				</PopoverContent>
			</Popover>
		</div>
	);
}

/** Variant B: the rail changes colour and the header carries a pill. */
function HeaderPill() {
	return (
		<Popover>
			<PopoverTrigger className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 font-semibold text-amber-950 text-xs shadow-sm">
				<TriangleAlertIcon aria-hidden className="size-3.5" />
				{ENVIRONMENT}
			</PopoverTrigger>
			<PopoverContent align="end" className="space-y-2 text-sm">
				<p>{SHORT}</p>
				<p>{REFUSES}</p>
			</PopoverContent>
		</Popover>
	);
}

/** Variant C: one dialog per browser session, then a corner tab. */
function EntryGate() {
	const KEY = 'prototype-380-gate-seen';
	const [open, setOpen] = useState(() => window.sessionStorage.getItem(KEY) === null);

	return (
		<Dialog
			onOpenChange={(next) => {
				if (!next) {
					window.sessionStorage.setItem(KEY, 'yes');
				}
				setOpen(next);
			}}
			open={open}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>You are on {ENVIRONMENT}</DialogTitle>
					<DialogDescription className="space-y-2 text-left">
						<span className="block">{SHORT}</span>
						<span className="block">{REFUSES}</span>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button onClick={() => setOpen(false)}>Continue</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CornerTab() {
	return (
		<Popover>
			<PopoverTrigger className="fixed right-4 bottom-4 z-40 flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 font-semibold text-amber-950 text-xs shadow-lg">
				<TriangleAlertIcon aria-hidden className="size-3.5" />
				{ENVIRONMENT}
			</PopoverTrigger>
			<PopoverContent align="end" className="space-y-2 text-sm" side="top">
				<p>{SHORT}</p>
				<p>{REFUSES}</p>
			</PopoverContent>
		</Popover>
	);
}

function Switcher({
	variant,
	onChange,
}: {
	readonly variant: Variant;
	readonly onChange: (next: Variant) => void;
}) {
	const step = (delta: number) => {
		const at = VARIANTS.indexOf(variant);
		onChange(VARIANTS[(at + delta + VARIANTS.length) % VARIANTS.length] as Variant);
	};

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest('input, textarea, [contenteditable]') !== null) {
				return;
			}
			if (event.key === 'ArrowLeft') {
				step(-1);
			}
			if (event.key === 'ArrowRight') {
				step(1);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	return (
		<div className="-translate-x-1/2 fixed bottom-4 left-1/2 z-[60] flex items-center gap-2 rounded-full bg-black px-2 py-1 text-white text-xs shadow-xl">
			<button className="px-2 py-1" onClick={() => step(-1)} type="button">
				←
			</button>
			<span className="px-1">
				{variant} — {VARIANT_NAMES[variant]}
			</span>
			<button className="px-2 py-1" onClick={() => step(1)} type="button">
				→
			</button>
		</div>
	);
}

/**
 * Wraps the shell. With no `?envBanner=` param it renders children untouched,
 * so the app is exactly itself until somebody asks for a variant.
 */
export function EnvironmentBannerPrototype({ children }: { readonly children: React.ReactNode }) {
	const [variant, setVariant] = useVariant();

	if (!import.meta.env.DEV || variant === null) {
		return children;
	}

	// `OutletShell` sizes itself `h-svh`, so a strip above it would push the
	// shell off the bottom of the window. The child selector shrinks the shell
	// root to the space left over. Prototype-only hack; the real thing would
	// change `OutletShell` instead.
	const stacked = variant === 'A';

	return (
		<div className={stacked ? 'flex h-svh flex-col [&>div>div]:!h-full' : undefined}>
			{stacked ? <StripBanner /> : null}
			{stacked ? <div className="min-h-0 flex-1">{children}</div> : children}
			{variant === 'B' ? (
				<>
					<style>{':root { --simmer-green-900: oklch(32% 0.075 68); }'}</style>
					<div className="pointer-events-none fixed top-3 right-4 z-50">
						<HeaderPill />
					</div>
				</>
			) : null}
			{variant === 'C' ? (
				<>
					<EntryGate />
					<CornerTab />
				</>
			) : null}
			<Switcher onChange={setVariant} variant={variant} />
		</div>
	);
}

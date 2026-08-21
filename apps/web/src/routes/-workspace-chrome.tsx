import { PRIMARY_SIDEBAR_COLLAPSED_KEY } from '@simmer-mosquito/ui-web/components/app-shell';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { usePersistentFlag } from '@simmer-mosquito/ui-web/hooks/use-persistent-flag';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Fragment, useEffect, useState } from 'react';
import {
	buildErrorReport,
	describeError,
	type ErrorDetails,
	joinStacks,
} from './-workspace-error-report';

/**
 * The two whole-window states of the authenticated root route: the workspace is
 * still resolving, or it threw before the shell mounted. Both are pre-shell, so
 * neither can read the shell context. Once a page is inside the shell, the
 * in-region states are `OutletContentFallback` and the page's own boundaries.
 */

const BrandMark = iconRegistry.simmer.brandMark.icon;
const ErrorIcon = iconRegistry.generic.error.icon;
const ChevronIcon = iconRegistry.arrows.chevronRight.icon;
const CopyIcon = iconRegistry.actions.copy.icon;

/**
 * Placeholder row widths, uneven on purpose: a column of identical bars reads as
 * a pattern, and a ragged one reads as text that has not arrived yet. Each row
 * carries its own key because the same width repeats down a column.
 */
const RAIL_ROWS = [
	{ id: 'rail-1', width: 'w-full' },
	{ id: 'rail-2', width: 'w-11/12' },
	{ id: 'rail-3', width: 'w-full' },
	{ id: 'rail-4', width: 'w-10/12' },
	{ id: 'rail-5', width: 'w-full' },
	{ id: 'rail-6', width: 'w-9/12' },
] as const;

const NAV_ROWS = [
	{ id: 'nav-1', width: 'w-full' },
	{ id: 'nav-2', width: 'w-5/6' },
	{ id: 'nav-3', width: 'w-full' },
	{ id: 'nav-4', width: 'w-2/3' },
	{ id: 'nav-5', width: 'w-11/12' },
] as const;

const CONTENT_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'] as const;

/**
 * The whole-window state while the authenticated shell resolves.
 *
 * It draws the shell's own bands rather than a card in an empty field: green
 * rail, navigation column, header, content stage. The reader watches the
 * workspace arrive in place, and nothing shifts sideways when `AppShellRoot`
 * commits over the top of it.
 *
 * Widths restate `ui-web`'s chrome (`w-60` or `w-16` rail, `w-60` navigation,
 * `h-16` header) rather than import it, because the real chrome needs the shell
 * context, identity, and navigation model this surface is still waiting on. The
 * one value that is shared is the rail's collapse key, so an operator who works
 * with a collapsed rail is not shown an expanded one for a second.
 */
export function WorkspaceChromeFallback() {
	const [railCollapsed] = usePersistentFlag(PRIMARY_SIDEBAR_COLLAPSED_KEY, false);

	return (
		<div
			aria-busy="true"
			aria-label="Loading workspace"
			className="flex h-svh w-full overflow-hidden bg-background"
			role="status"
		>
			<FallbackRail collapsed={railCollapsed} />
			<FallbackNav />
			<FallbackStage />
		</div>
	);
}

/** The domain rail, at whatever width this browser last left it. */
function FallbackRail({ collapsed }: { readonly collapsed: boolean }) {
	return (
		<div
			className={cn(
				'flex shrink-0 flex-col gap-5 border-white/10 border-r bg-simmer-green-900 py-3',
				collapsed ? 'w-16 items-center' : 'w-60 px-4',
			)}
		>
			{collapsed ? (
				<BrandMark aria-hidden="true" className="size-9 shrink-0" role="presentation" />
			) : (
				<img alt="" className="h-10 w-auto self-center" src="/logo.svg" />
			)}
			<div className={cn('grid w-full gap-2', collapsed && 'justify-items-center')}>
				{RAIL_ROWS.map(({ id, width }) => (
					<div
						className={cn('h-8 animate-pulse rounded-md bg-white/10', collapsed ? 'w-9' : width)}
						key={id}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * The active domain's navigation column.
 *
 * `bg-muted` and `bg-sidebar` resolve to the same paper, so a muted placeholder
 * is invisible here. The strong step up is not.
 */
function FallbackNav() {
	return (
		<div className="flex w-60 shrink-0 flex-col gap-2.5 border-sidebar-border border-r bg-sidebar px-3 py-4">
			<div className="h-4 w-24 animate-pulse rounded bg-sidebar-accent" />
			{NAV_ROWS.map(({ id, width }) => (
				<div className={cn('h-7 animate-pulse rounded-md bg-sidebar-accent', width)} key={id} />
			))}
		</div>
	);
}

/** Header band and the scrolling region the router will render into. */
function FallbackStage() {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex h-16 shrink-0 items-center gap-3 border-border border-b bg-card px-5">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="ml-auto h-4 w-24" />
				<Skeleton className="size-8 rounded-full" />
			</div>
			<div className="relative min-h-0 flex-1 overflow-hidden bg-(--app-stage)">
				{/*
				 * The one moving part. Skeletons say what is coming; they cannot say
				 * whether anything is still happening.
				 */}
				<span aria-hidden="true" className="workspace-sweep" />
				<div className="grid gap-3 p-6">
					<Skeleton className="h-8 w-[min(280px,45%)]" />
					<Skeleton className="h-4 w-[min(420px,65%)]" />
					<div className="mt-3 grid gap-3">
						{CONTENT_ROWS.map((row) => (
							<Skeleton className="h-14 w-full" key={row} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

interface WorkspaceChromeErrorProps {
	/** Whatever the boundary caught. Typed loosely because a `throw` is unchecked. */
	readonly error?: unknown;
	readonly info?: { readonly componentStack: string } | undefined;
	/** Clears the boundary and re-renders. Absent when nothing can retry in place. */
	readonly reset?: (() => void) | undefined;
}

/**
 * The workspace failed before the shell mounted.
 *
 * This surface has one job the previous version did not do: hand over what
 * actually broke. A user who reads "unable to load workspace data" and reloads
 * twice has nothing to report. So the thrown message is on screen verbatim, the
 * stack sits one disclosure away, and "Copy details" puts message, stack, page,
 * app version, time, and browser on the clipboard for a support thread.
 *
 * `error`, `info`, and `reset` arrive from TanStack Router's `errorComponent`.
 * All three are optional because `SuspenseQueryBoundary` renders this surface
 * too, and it only ever caught an error.
 */
export function WorkspaceChromeError({ error, info, reset }: WorkspaceChromeErrorProps) {
	const details = describeError(error);
	const stackText = joinStacks(details.stack, info?.componentStack);

	return (
		<div className="grid min-h-svh place-items-center bg-(--app-stage) p-6">
			<Card className="w-[min(680px,100%)] overflow-hidden" variant="panel">
				<ErrorHeadline />
				<CardContent className="grid gap-4 py-5" padding="default">
					<div className="grid gap-1.5">
						<span className="font-bold text-[0.72rem] text-muted-foreground uppercase tracking-[0.06em]">
							{details.name}
						</span>
						<p className="m-0 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 px-3 py-2.5 font-mono text-[0.82rem] text-foreground leading-relaxed">
							{details.message}
						</p>
					</div>

					<ErrorFacts />
					<ErrorStack text={stackText} />
					<ErrorActions componentStack={info?.componentStack} details={details} reset={reset} />
				</CardContent>
			</Card>
		</div>
	);
}

/**
 * What broke, in one line, and what to do about it.
 *
 * `navigator.onLine` is read during render rather than tracked: this surface
 * does not re-render, and the answer that matters is the one at the moment the
 * read failed.
 */
function ErrorHeadline() {
	const offline = navigator.onLine === false;

	return (
		<div className="flex items-start gap-3 border-destructive/20 border-b bg-destructive/8 px-6 py-4">
			<ErrorIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
			<div className="grid gap-1">
				<strong className="font-bold text-[1.05rem] text-foreground leading-tight">
					The workspace did not finish loading
				</strong>
				<p className="m-0 max-w-[62ch] text-muted-foreground text-sm leading-normal">
					{offline
						? 'Your browser reports no network connection. Reconnect, then try again.'
						: 'Try again first. If it keeps happening, copy the details and send them with your report.'}
				</p>
			</div>
		</div>
	);
}

/** The context a support thread needs and the reader cannot be expected to know. */
function ErrorFacts() {
	const facts = [
		{ label: 'Page', value: `${window.location.pathname}${window.location.search}` },
		{ label: 'Version', value: `SIMMER ${__APP_VERSION__}` },
		{ label: 'Time', value: new Date().toLocaleString() },
	];

	return (
		<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.8rem]">
			{facts.map(({ label, value }) => (
				<Fragment key={label}>
					<dt className="m-0 text-muted-foreground">{label}</dt>
					<dd className="m-0 truncate font-mono text-foreground" title={value}>
						{value}
					</dd>
				</Fragment>
			))}
		</dl>
	);
}

/**
 * The stack, folded away.
 *
 * Native `<details>` rather than the Collapsible primitive. This is the surface
 * that renders once the app is already broken, and the disclosure needs no React
 * state and no portal to work.
 */
function ErrorStack({ text }: { readonly text: string }) {
	if (text === '') {
		return null;
	}

	return (
		<details className="group rounded-md border border-border bg-muted/30">
			<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
				<ChevronIcon
					aria-hidden="true"
					className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
				/>
				Technical details
			</summary>
			<pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words border-border border-t px-3 py-2.5 font-mono text-[0.75rem] text-muted-foreground leading-relaxed">
				{text}
			</pre>
		</details>
	);
}

const COPY_LABELS = {
	idle: 'Copy details',
	copied: 'Copied',
	failed: 'Copy failed',
} as const;

/**
 * Retry, reload, and take the report away.
 *
 * "Reload the page" only appears when `reset` exists. Without it "Try again" is
 * a reload already, and two buttons that do the same thing is a choice the
 * reader has to make for nothing.
 */
function ErrorActions({
	componentStack,
	details,
	reset,
}: {
	readonly componentStack: string | undefined;
	readonly details: ErrorDetails;
	readonly reset: (() => void) | undefined;
}) {
	const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

	// Back to "Copy details" after a beat, so a second copy is visibly a second
	// copy. A label stuck on "Copied" cannot confirm the next click.
	useEffect(() => {
		if (copyState === 'idle') {
			return;
		}

		const timer = window.setTimeout(() => setCopyState('idle'), 2500);
		return () => window.clearTimeout(timer);
	}, [copyState]);

	// `navigator.clipboard` is absent outside a secure context, and reading
	// `.writeText` off `undefined` throws inside the handler. Nothing on this
	// surface may raise a second error: the boundary above it has already caught
	// one, so a throw here is what the reader sees instead of the report.
	const copyDetails = () => {
		try {
			navigator.clipboard
				.writeText(buildErrorReport(details, componentStack, readReportContext()))
				.then(() => setCopyState('copied'))
				.catch(() => setCopyState('failed'));
		} catch {
			setCopyState('failed');
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-2 pt-1">
			<Button onClick={reset ?? reloadPage} size="sm" type="button">
				Try again
			</Button>
			{reset === undefined ? null : (
				<Button onClick={reloadPage} size="sm" type="button" variant="outline">
					Reload the page
				</Button>
			)}
			<Button className="ml-auto" onClick={copyDetails} size="sm" type="button" variant="ghost">
				<CopyIcon aria-hidden="true" />
				{COPY_LABELS[copyState]}
			</Button>
		</div>
	);
}

function reloadPage() {
	window.location.reload();
}

/** The page context stamped into a copied report, read at the moment of the copy. */
function readReportContext() {
	return {
		version: __APP_VERSION__,
		href: window.location.href,
		time: new Date().toISOString(),
		userAgent: navigator.userAgent,
	};
}

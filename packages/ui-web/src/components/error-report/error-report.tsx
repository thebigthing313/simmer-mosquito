import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Fragment, useEffect, useState } from 'react';
import {
	buildErrorReport,
	describeError,
	type ErrorDetails,
	joinStacks,
} from './error-report-text';

/**
 * The body every SIMMER error surface shows: what broke, the context a support
 * thread needs, the stack behind a disclosure, and the ways out.
 *
 * It carries no frame of its own. `WorkspaceChromeError` puts it in a centred
 * card on an empty stage, because when the shell has not mounted there is
 * nothing else on screen; `RouteErrorPage` puts it in a page-region panel, with
 * the shell's navigation still around it. Both show the same report, and the
 * only thing that differs is what the reader can still see.
 */

const ErrorIcon = iconRegistry.generic.error.icon;
const ChevronIcon = iconRegistry.arrows.chevronRight.icon;
const CopyIcon = iconRegistry.actions.copy.icon;

export interface ErrorReportProps {
	/** Whatever the boundary caught. Typed loosely because a `throw` is unchecked. */
	readonly error?: unknown;
	readonly info?: { readonly componentStack: string } | undefined;
	/** Clears the boundary and re-renders. Absent when nothing can retry in place. */
	readonly reset?: (() => void) | undefined;
	/** What failed, in the reader's terms. Also the copied report's opening line. */
	readonly title: string;
	/** The running app version, for the facts row and the report. */
	readonly version: string;
}

export function ErrorReport({ error, info, reset, title, version }: ErrorReportProps) {
	const details = describeError(error);
	const stackText = joinStacks(details.stack, info?.componentStack);

	return (
		<>
			<ErrorHeadline title={title} />
			<div className="grid gap-4 px-6 py-5">
				<div className="grid gap-1.5">
					<span className="font-bold text-muted-foreground text-xs uppercase tracking-wide">
						{details.name}
					</span>
					<p className="m-0 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 px-3 py-2.5 font-mono text-foreground text-sm leading-relaxed">
						{details.message}
					</p>
				</div>

				<ErrorFacts version={version} />
				<ErrorStack text={stackText} />
				<ErrorActions
					componentStack={info?.componentStack}
					details={details}
					reset={reset}
					summary={title}
					version={version}
				/>
			</div>
		</>
	);
}

/**
 * What broke, in one line, and what to do about it.
 *
 * `navigator.onLine` is read during render rather than tracked: this surface
 * does not re-render, and the answer that matters is the one at the moment the
 * read failed.
 */
function ErrorHeadline({ title }: { readonly title: string }) {
	const offline = navigator.onLine === false;

	return (
		<div className="flex items-start gap-3 border-destructive/20 border-b bg-destructive/8 px-6 py-4">
			<ErrorIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
			<div className="grid gap-1">
				<strong className="font-semibold text-foreground text-lg leading-tight">{title}</strong>
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
function ErrorFacts({ version }: { readonly version: string }) {
	const facts = [
		{ label: 'Page', value: `${window.location.pathname}${window.location.search}` },
		{ label: 'Version', value: `SIMMER ${version}` },
		{ label: 'Time', value: new Date().toLocaleString() },
	];

	return (
		<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
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
			<pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words border-border border-t px-3 py-2.5 font-mono text-muted-foreground text-xs leading-relaxed">
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
	summary,
	version,
}: {
	readonly componentStack: string | undefined;
	readonly details: ErrorDetails;
	readonly reset: (() => void) | undefined;
	readonly summary: string;
	readonly version: string;
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
		const report = buildErrorReport(details, componentStack, {
			summary,
			version,
			href: window.location.href,
			time: new Date().toISOString(),
			userAgent: navigator.userAgent,
		});

		try {
			navigator.clipboard
				.writeText(report)
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

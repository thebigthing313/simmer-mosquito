import { OutletSimpleLayout } from '@simmer-mosquito/ui-web/components/app-shell';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import { adminLogoutUrl, isOperatorRequiredError } from '../api';

/**
 * The console's page frame and its three not-the-happy-path states.
 *
 * The header is deliberately the same shape as the agency workspace's catalog
 * pages (`apps/web/src/routes/control-operations/-control-methods-page.tsx`):
 * a tinted icon tile, an `xl` title, a measured description, actions on the
 * right. Two consoles from one product should not disagree about what a page
 * heading looks like — and `xl` rather than `2xl` is the product register's
 * answer, because these are work surfaces, not announcements.
 */

const WarningIcon = iconRegistry.actions.warning.icon;
const LockIcon = iconRegistry.generic.settings.icon;

export function AdminPage({
	title,
	description,
	icon: PageIcon,
	actions,
	children,
	className,
}: {
	readonly title: string;
	readonly description?: string | undefined;
	/** The page's subject, tiled beside the title. */
	readonly icon: RegistryIcon;
	/** Primary page action — usually the create control. */
	readonly actions?: ReactNode | undefined;
	readonly children: ReactNode;
	readonly className?: string | undefined;
}) {
	return (
		<OutletSimpleLayout className={cn('grid content-start gap-5', className)}>
			<header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
				<div className="flex min-w-0 items-start gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<PageIcon aria-hidden="true" className="size-5" />
					</span>
					<div className="grid min-w-0 gap-1">
						<h1 className="text-pretty font-semibold text-foreground text-xl leading-tight">
							{title}
						</h1>
						{description === undefined ? null : (
							<p className="max-w-[60ch] text-pretty text-muted-foreground text-sm leading-snug">
								{description}
							</p>
						)}
					</div>
				</div>
				{actions === undefined ? null : (
					<div className="flex shrink-0 items-center gap-2">{actions}</div>
				)}
			</header>
			{children}
		</OutletSimpleLayout>
	);
}

/**
 * Placeholder rows while a page's first read settles.
 *
 * Skeletons rather than a spinner, per the product register: the operator sees
 * the shape of what is arriving instead of an unplaced circle.
 */
export function AdminLoading({ rows = 5 }: { readonly rows?: number }) {
	return (
		<div aria-busy="true" aria-label="Loading" className="grid gap-2" role="status">
			{Array.from({ length: rows }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder list with no identity
				<Skeleton className="h-14 w-full rounded-md" key={index} />
			))}
		</div>
	);
}

export function AdminEmpty({
	title,
	description,
	icon: EmptyIcon,
	action,
}: {
	readonly title: string;
	readonly description: string;
	readonly icon?: RegistryIcon | undefined;
	readonly action?: ReactNode | undefined;
}) {
	return (
		<Empty className="border-border/60">
			<EmptyHeader>
				{EmptyIcon === undefined ? null : (
					<EmptyMedia variant="icon">
						<EmptyIcon aria-hidden="true" />
					</EmptyMedia>
				)}
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action === undefined ? null : <EmptyContent>{action}</EmptyContent>}
		</Empty>
	);
}

/** No rows matched the current filter. Quieter than an empty state — the data exists. */
export function AdminNoMatches({ query }: { readonly query: string }) {
	return (
		<p className="rounded-md border border-border/40 border-dashed bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
			Nothing matches “{query}”.
		</p>
	);
}

/**
 * What a page shows when its read failed.
 *
 * The operator-allowlist refusal gets its own answer rather than being rendered
 * as an error string. It is not a fault the operator can retry past — the fix is
 * a different account, or their address added to `SIMMER_OPERATOR_EMAILS` — so
 * the screen says that and offers the only action that helps.
 */
export function AdminError({ error }: { readonly error: unknown }) {
	if (isOperatorRequiredError(error)) {
		return <OperatorRequired />;
	}

	const message = error instanceof Error ? error.message : 'Something went wrong.';
	return (
		<Empty className="border-destructive/30 bg-destructive/5">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<WarningIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>Could Not Load</EmptyTitle>
				<EmptyDescription>{message}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function OperatorRequired() {
	return (
		<Empty className="border-border/60">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<LockIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>Not an Operator Account</EmptyTitle>
				<EmptyDescription>
					You are signed in, but this account is not on the SIMMER operator list. Agency work
					happens in the SIMMER web app; this console is for platform operators.
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button asChild variant="outline">
					<a href={adminLogoutUrl()}>Sign out</a>
				</Button>
			</EmptyContent>
		</Empty>
	);
}

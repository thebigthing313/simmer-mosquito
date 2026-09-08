import { OutletSimpleLayout } from '@simmer-mosquito/ui-web/components/app-shell';
import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import { adminLogoutUrl, isOperatorNotConfiguredError, isOperatorRequiredError } from '../api';

/**
 * The console's page frame, and the one failure state that is its own.
 *
 * The frame is a mount point: the shared {@link PageHeader} inside the outlet
 * this app renders into. The heading itself, and the waiting/empty/no-matches
 * states pages compose under it, live in `@simmer-mosquito/ui-web` — the
 * organization workspace wears the same ones, which is what keeps two consoles
 * from one product from disagreeing about what a page looks like.
 */

const WarningIcon = iconRegistry.actions.warning.icon;
const LockIcon = iconRegistry.generic.settings.icon;

export function AdminPage({
	title,
	description,
	icon,
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
			<PageHeader actions={actions} description={description} icon={icon} title={title} />
			{children}
		</OutletSimpleLayout>
	);
}

/**
 * What a page shows when its read failed.
 *
 * The two operator refusals get their own answers rather than being rendered as
 * error strings. Neither is a fault the operator can retry past, and they take
 * opposite fixes, which is why the server sends two codes rather than one.
 */
export function AdminError({ error }: { readonly error: unknown }) {
	if (isOperatorNotConfiguredError(error)) {
		return <OperatorNotConfigured />;
	}

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

/**
 * Signed in, but not as SIMMER. The fix is to sign in as SIMMER rather than as
 * an organization, or to be added to the SIMMER organization, so the screen
 * says that and offers the only action that helps.
 */
function OperatorRequired() {
	return (
		<Empty className="border-border/60">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<LockIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>Not Signed In as SIMMER</EmptyTitle>
				<EmptyDescription>
					This console is for platform operators. If you also work in an organization, sign out and
					sign back in as SIMMER. Your own work happens in the SIMMER web app.
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

/**
 * The server has no `SIMMER_OPERATOR_ORG_ID`, so it refuses everyone.
 *
 * The counterpart of the `VITE_SIMMER_OPERATOR_ORG_ID` refusal in
 * `routes/-auth.tsx`, and it names its variable for the same reason: the two are
 * set on different services and are easy to set only one of. Miss the server
 * one and sign-in works, so the operator is looking at a console that behaves
 * as though there is nothing on the platform.
 *
 * No sign-out button here, unlike {@link OperatorRequired}. Signing back in
 * changes nothing when the server cannot tell an operator from anyone else, and
 * offering the action would send the operator around a loop that cannot end.
 */
function OperatorNotConfigured() {
	return (
		<Empty className="border-warning/30 bg-attention/20">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<WarningIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>Server Not Configured</EmptyTitle>
				<EmptyDescription>
					The SIMMER server has no operator organization configured, so it refuses every request
					from this console. Set SIMMER_OPERATOR_ORG_ID on the server service to the WorkOS
					organization that is SIMMER in this environment, and redeploy.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

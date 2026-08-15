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
import { adminLogoutUrl, isOperatorRequiredError } from '../api';

/**
 * The console's page frame, and the one failure state that is its own.
 *
 * The frame is a mount point: the shared {@link PageHeader} inside the outlet
 * this app renders into. The heading itself, and the waiting/empty/no-matches
 * states pages compose under it, live in `@simmer-mosquito/ui-web` — the agency
 * workspace wears the same ones, which is what keeps two consoles from one
 * product from disagreeing about what a page looks like.
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
 * The operator refusal gets its own answer rather than being rendered as an
 * error string. It is not a fault the operator can retry past — the fix is to
 * sign in as SIMMER rather than as an agency, or to be added to the SIMMER
 * organization — so the screen says that and offers the only action that helps.
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
				<EmptyTitle>Not Signed In as SIMMER</EmptyTitle>
				<EmptyDescription>
					This console is for platform operators. If you also work in an agency, sign out and sign
					back in as SIMMER. Agency work happens in the SIMMER web app.
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

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
import { getServerUrl } from '../auth';

/**
 * Pre-shell surfaces: the unauthenticated landing/login pages and the chrome
 * loading/error fallbacks used by the root route. The authenticated shell lives
 * in `components/app-shell`.
 */

function BrandMark() {
	return (
		<span className="inline-grid size-[34px] place-items-center rounded-md bg-primary font-extrabold text-primary-foreground">
			S
		</span>
	);
}

export function LandingPage({
	authReason,
	redirectTo,
}: {
	readonly authReason?: 'organization_required';
	readonly redirectTo: string;
}) {
	const loginUrl = `${getServerUrl()}/auth/login?returnTo=${encodeURIComponent(redirectTo)}`;

	return (
		<div className="grid min-h-screen place-items-center bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_360px),var(--app-stage)] p-6">
			<section className="grid w-[min(620px,100%)] gap-3.5 rounded-md border border-border/30 bg-card p-7">
				<BrandMark />
				<p className="eyebrow">SIMMER</p>
				<h1 className="m-0 text-[2rem] leading-tight">
					Mosquito control operations, grounded in the map.
				</h1>
				<p className="m-0 leading-normal text-muted-foreground">
					Sign in to manage surveillance, field work, public engagement, control operations, and
					organization setup from one operational workspace.
				</p>
				{authReason === 'organization_required' ? (
					<div className="grid gap-1 rounded-md border border-warning/20 bg-[color-mix(in_oklch,var(--warning-bg)_54%,var(--card))] p-3">
						<strong className="text-[0.94rem] text-foreground">Organization access needed</strong>
						<p className="m-0 text-[0.86rem] leading-normal text-muted-foreground">
							Your account is signed in, but no active SIMMER organization membership is selected.
						</p>
					</div>
				) : null}
				<div className="flex flex-wrap gap-2.5">
					<Button asChild>
						<a href={loginUrl}>Sign in</a>
					</Button>
				</div>
			</section>
		</div>
	);
}

export function LoginPage() {
	const returnTo = typeof window === 'undefined' ? '/' : window.location.origin;
	const loginUrl = `${getServerUrl()}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

	return (
		<div className="grid min-h-screen place-items-center bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_360px),var(--app-stage)] p-6">
			<section className="grid w-[min(460px,100%)] gap-3.5 rounded-md border border-border/30 bg-card p-7">
				<BrandMark />
				<p className="eyebrow">SIMMER sign in</p>
				<h1 className="m-0 text-[1.6rem] leading-tight">Continue to your operations workspace</h1>
				<p className="m-0 leading-normal text-muted-foreground">
					Authentication is handled by WorkOS. After sign in, SIMMER returns you to the app route
					you were trying to open.
				</p>
				<Button asChild>
					<a href={loginUrl}>Sign in</a>
				</Button>
			</section>
		</div>
	);
}

export function WorkspaceChromeFallback() {
	return (
		<div className="grid min-h-screen place-items-center bg-(--app-stage) p-6">
			<Card variant="surface" className="w-[min(420px,100%)]">
				<CardContent padding="default" className="grid gap-2">
					<p className="eyebrow">SIMMER</p>
					<strong className="text-[1rem] text-foreground">Loading workspace</strong>
				</CardContent>
			</Card>
		</div>
	);
}

export function WorkspaceChromeError() {
	return (
		<div className="grid min-h-screen place-items-center bg-(--app-stage) p-6">
			<Card variant="surface" className="w-[min(460px,100%)]">
				<CardContent padding="default" className="grid gap-3">
					<div className="grid gap-1">
						<p className="eyebrow">SIMMER</p>
						<strong className="text-[1rem] text-foreground">Unable to load workspace data</strong>
					</div>
					<Button type="button" onClick={() => window.location.reload()}>
						Reload
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

import { SignedOutEnvironmentBanner } from '@simmer-mosquito/ui-web/components/environment-banner';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { LandingStage } from './-landing-stage';

/**
 * The unauthenticated landing page. The root route's whole-window loading and
 * error surfaces are in `-workspace-chrome`, and the authenticated shell is in
 * `components/app-shell`.
 *
 * The landing page is the one product surface that earns a committed brand
 * treatment: a drenched-green "map room" stage carrying the real SIMMER logo,
 * paired with a calm, focused sign-in panel. The auth pages stand on the same
 * stage — see `-landing-stage`.
 */

const WarningIcon = iconRegistry.actions.warning.icon;

export function LandingPage({
	authReason,
	redirectTo,
}: {
	readonly authReason?: 'organization_required';
	readonly redirectTo: string;
}) {
	const redirectPath = toRedirectPath(redirectTo);

	// Locked to the viewport at desktop widths, like the shell it introduces:
	// each column owns its own overflow, so the window itself never scrolls.
	//
	// The banner sits in a wrapper outside the split rather than inside it, for
	// the reason `OutletShell` grew a slot in #380: the split is `lg:h-svh`, so a
	// strip added as a sibling row pushes the page off the bottom of the window.
	// The brand stage loses the strip's height instead.
	return (
		<div className="grid min-h-svh grid-rows-[auto_1fr] lg:h-svh">
			<SignedOutEnvironmentBanner environment={import.meta.env.VITE_SIMMER_ENVIRONMENT} />
			<div className="grid grid-rows-[auto_1fr] lg:min-h-0 lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-1">
				<LandingStage />
				<LandingEntry authReason={authReason} redirectPath={redirectPath} />
			</div>
		</div>
	);
}

/** The calm entry panel: welcome copy, the sign-in actions, and account recovery. */
function LandingEntry({
	authReason,
	redirectPath,
}: {
	readonly authReason: 'organization_required' | undefined;
	readonly redirectPath: string;
}) {
	// `m-auto` rather than `items-center`: a centred flex child in a scroll
	// container puts its own overflowing top out of reach. The entry animation
	// rides the panel, not the section — translating a full-height grid item
	// pushes the window into overflow for as long as it runs.
	return (
		<section className="flex min-h-0 overflow-y-auto bg-(--app-stage) px-6 py-12 sm:px-10">
			<div className="landing-fade m-auto flex w-full max-w-[420px] flex-col gap-7">
				<div className="grid gap-2">
					<h2 className="m-0 text-[1.5rem] font-bold leading-tight text-foreground">
						Welcome Back
					</h2>
					<p className="m-0 leading-normal text-muted-foreground">
						Sign in to your agency workspace, or create an account to get started.
					</p>
				</div>

				{authReason === 'organization_required' ? (
					<Alert className="border-warning/30 bg-[color-mix(in_oklch,var(--warning-bg)_60%,var(--card))] text-foreground">
						<WarningIcon className="text-warning" />
						<AlertTitle>Organization Access Needed</AlertTitle>
						<AlertDescription className="text-muted-foreground">
							You&rsquo;re signed in, but no active SIMMER organization is selected for your
							account. Choose or request an organization to continue.
						</AlertDescription>
					</Alert>
				) : null}

				<div className="grid gap-2.5">
					<Button asChild size="lg" className="w-full">
						<Link to="/sign-in" search={{ redirect: redirectPath }}>
							Sign In
						</Link>
					</Button>
					<Button asChild size="lg" variant="outline" className="w-full">
						<Link to="/sign-up" search={{ redirect: redirectPath }}>
							Create an Account
						</Link>
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border/60 pt-5 text-sm">
					<span className="text-muted-foreground">Trouble signing in?</span>
					<Link
						to="/forgot-password"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Reset your password
					</Link>
				</div>
			</div>
		</section>
	);
}

/** Normalizes a landing `redirect` (which may be an absolute URL) to a same-origin path. */
function toRedirectPath(redirectTo: string): string {
	if (redirectTo.startsWith('/')) {
		return redirectTo;
	}

	try {
		const url = new URL(redirectTo);
		return `${url.pathname}${url.search}${url.hash}` || '/';
	} catch {
		return '/';
	}
}

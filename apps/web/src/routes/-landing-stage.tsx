import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ComponentType, SVGProps } from 'react';

/**
 * The brand stage every unauthenticated surface stands on: a drenched-green
 * "map room" column carrying the real SIMMER logo, what the acronym stands for,
 * the value line, and the capability list.
 *
 * It lives in its own module because the landing page and the auth pages both
 * render it. They are the same doorway to the same product, and a visitor who
 * clicks "Sign In" should not feel handed off to a different one.
 */

const SurveillanceIcon = iconRegistry.generic.scanEye.icon;
const ControlIcon = iconRegistry.domains.controlOperations.icon;
const EngagementIcon = iconRegistry.domains.publicEngagement.icon;

type LandingCapability = {
	readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
	readonly title: string;
	readonly detail: string;
};

/**
 * The three capabilities are the three integrated mosquito management tactics
 * SIMMER covers today, ordered the way a program runs them. Copy stays
 * descriptive: the reader runs a mosquito control agency and does not need the
 * value of surveillance explained back to them.
 */
const CAPABILITIES: readonly LandingCapability[] = [
	{
		icon: SurveillanceIcon,
		title: 'Surveillance',
		detail:
			'Larval and adult populations tracked per habitat, trap, and collection, against your action thresholds.',
	},
	{
		icon: ControlIcon,
		title: 'Control operations',
		detail:
			'Source reduction, biocontrol, and insecticide applications recorded with product, rate, and treated area.',
	},
	{
		icon: EngagementIcon,
		title: 'Community engagement',
		detail:
			'Service requests and the contacts behind them, kept alongside the field data they belong to.',
	},
];

/**
 * The committed brand stage: real logo, the full product name, value
 * proposition, and capability list.
 *
 * `variant` says what the stage is on the surface rendering it, and two things
 * follow from that:
 *
 * - `page` (the landing page) — the stage *is* the page, so its display line is
 *   the document's `h1` and every block shows at every width.
 * - `aside` (the auth pages) — the page's heading is the task beside it ("Sign
 *   In to Your Workspace"), so the display line drops to a paragraph, and below
 *   `lg`, where there is no left-hand side and both layouts stack, everything
 *   under the logo band collapses rather than pushing the form off the fold.
 */
export function LandingStage({ variant = 'page' }: { readonly variant?: 'page' | 'aside' }) {
	const isAside = variant === 'aside';
	const Display = isAside ? 'p' : 'h1';

	return (
		<section className="landing-stage relative isolate flex min-h-0 flex-col overflow-hidden px-(--landing-pad-x) py-(--landing-pad-y) text-white">
			<div className="landing-rise relative z-10 flex flex-1 flex-col justify-between gap-(--landing-gap)">
				<div className="grid gap-2">
					<img
						alt="SIMMER"
						className="landing-logo w-(--landing-logo) max-w-[58%]"
						height={122}
						src="/logo.svg"
						width={248}
					/>
					<p className="m-0 max-w-[64ch] font-medium text-[0.72rem] text-simmer-green-100/80 uppercase leading-snug tracking-[0.14em]">
						Strategic Integrated Mosquito Management Enterprise Resources
					</p>
				</div>

				<div
					className={cn(
						'flex flex-col justify-center gap-(--landing-gap-tight)',
						isAside && 'hidden lg:flex',
					)}
				>
					<Display className="m-0 max-w-[24ch] text-balance font-bold text-(length:--landing-display) leading-[1.08] tracking-[-0.02em]">
						Integrated mosquito management, on one living map.
					</Display>
					<p className="m-0 max-w-[62ch] text-pretty text-[1.02rem] text-simmer-green-100 leading-relaxed">
						Surveillance, control operations, and public requests stay tied to the ground they
						happen on, so every decision rests on the data your program collected.
					</p>

					<ul className="m-0 grid list-none gap-(--landing-gap-tight) p-0">
						{CAPABILITIES.map(({ icon: Icon, title, detail }) => (
							<li className="flex items-start gap-3.5" key={title}>
								<span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-white/10 text-white ring-1 ring-white/15 ring-inset">
									<Icon aria-hidden="true" className="size-[1.15rem]" />
								</span>
								<div className="grid gap-0.5">
									<p className="m-0 font-semibold text-[0.95rem] text-white leading-tight">
										{title}
									</p>
									<p className="m-0 max-w-[54ch] text-[0.86rem] text-simmer-green-100 leading-snug">
										{detail}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>

				<p
					className={cn(
						'landing-tail m-0 max-w-[88ch] text-[0.85rem] text-simmer-green-100/90 leading-normal',
						isAside && 'hidden lg:block',
					)}
				>
					Built around the five tactics of integrated mosquito management, for the agencies that
					keep communities protected.
				</p>
			</div>
		</section>
	);
}

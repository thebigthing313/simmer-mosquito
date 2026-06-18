import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { resolveActive } from './navigation';
import { OutletSimpleLayout } from './outlet/simple-layout';
import { useShell } from './shell-context';

const PlaceholderIcon = iconRegistry.generic.component.icon;

/**
 * Placeholder page for routes that aren't built yet. It names the current
 * section (resolved from the active path) so the shell chrome can be exercised
 * end to end while real screens are still pending.
 */
export function RouteStub({ title }: { readonly title?: string }) {
	const { activePath } = useShell();
	const { domain, item } = resolveActive(activePath);
	const heading = title ?? item?.label ?? domain.label;

	return (
		<OutletSimpleLayout>
			<Empty className="min-h-[60vh]">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<PlaceholderIcon />
					</EmptyMedia>
					<EmptyTitle>{heading}</EmptyTitle>
					<EmptyDescription>
						This workspace isn&apos;t built yet. The shell, navigation, and routing are wired — the{' '}
						{heading.toLowerCase()} screen will land here.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</OutletSimpleLayout>
	);
}

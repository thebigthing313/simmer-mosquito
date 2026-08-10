import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { ReactNode } from 'react';

/**
 * The one action an auth step offers: full width, `lg`, and disabled while the
 * round trip is out — with a label that says what is happening rather than
 * leaving a dead button to explain itself.
 */
export function AuthSubmitButton({
	pending,
	pendingLabel,
	children,
}: {
	readonly pending: boolean;
	readonly pendingLabel: string;
	readonly children: ReactNode;
}) {
	return (
		<Button className="w-full" disabled={pending} size="lg" type="submit">
			{pending ? pendingLabel : children}
		</Button>
	);
}

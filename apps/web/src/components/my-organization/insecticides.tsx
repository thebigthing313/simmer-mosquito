import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useInsecticideRecords } from '../../hooks/queries/use-insecticide-records';
import { ArrowRightIcon } from './constants';
import { LookupListFrame } from './layout/lookup-list-frame';

/**
 * Insecticides and their batches are managed on the control operations route,
 * next to the applications that use them; this shows their counts and points
 * there.
 */
export function InsecticideLookupPointer() {
	const products = useInsecticideRecords();
	const activeCount = products.filter((insecticide) => insecticide.isActive).length;

	return (
		<LookupListFrame
			activeCount={activeCount}
			inactiveCount={products.length - activeCount}
			title="Insecticides"
			action={
				<Button asChild size="sm" variant="outline">
					<Link to="/control-operations/chemical/insecticides">
						Manage Insecticides
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
				Insecticides and their batches are managed in Control Operations, alongside the applications
				that use them.
			</p>
		</LookupListFrame>
	);
}

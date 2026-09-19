import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { useApplicationMethodRoster } from '../../../hooks/queries/use-application-method-roster';
import { useInsecticideRecords } from '../../../hooks/queries/use-insecticide-records';
import { useProfileNames } from '../../../hooks/queries/use-profile-names';
import { useSourceReductionMethodRoster } from '../../../hooks/queries/use-source-reduction-method-roster';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatAmount } from '../../../lib/format-count';

/**
 * One eager read of the whole roster rather than a subset per name rendered.
 * Profiles number in the tens and every row on this page names an actor, so a
 * query each would be dozens of identical suspending reads for one small table.
 */
export function ProfileName({ profileId }: { readonly profileId: string }) {
	return <>{useProfileNames().get(profileId) ?? 'Unknown'}</>;
}

// insecticides, units, and application methods are eager baseline collections, so
// suspense is safe — unlike the on-demand applications subset they decorate.
export function InsecticideName({ insecticideId }: { readonly insecticideId: string }) {
	const match = useInsecticideRecords().find((product) => product.id === insecticideId);
	return <>{match?.tradeName ?? 'Unknown insecticide'}</>;
}

export function ApplicationMethodName({
	applicationMethodId,
}: {
	readonly applicationMethodId: string | null;
}) {
	const methods = useApplicationMethodRoster();

	if (applicationMethodId === null) {
		return <AbsentValue />;
	}

	const match = methods.find((method) => method.id === applicationMethodId);
	return <>{match?.name ?? 'Unknown method'}</>;
}

export function SourceReductionMethodName({
	sourceReductionMethodId,
}: {
	readonly sourceReductionMethodId: string;
}) {
	const methods = useSourceReductionMethodRoster();
	const match = methods.find((method) => method.id === sourceReductionMethodId);
	return <>{match?.name ?? 'Unknown method'}</>;
}

export function AmountWithUnit({
	amount,
	unitId,
}: {
	readonly amount: number;
	readonly unitId: string;
}) {
	const abbreviation = useUnitLabels().byId.get(unitId)?.abbreviation ?? '';
	return (
		<>
			{formatAmount(amount)}
			{abbreviation === '' ? null : ` ${abbreviation}`}
		</>
	);
}

/**
 * A stamp, in the organization's zone.
 *
 * Takes a `Date` as well as a string: the read seam hands back `created_at` and
 * `updated_at` as `Date` — `coerce.date()` in the row schema — where the row
 * type this page used to hold spelled them as ISO strings. Accepting both is
 * what keeps the two remaining string call sites working while the surfaces
 * around this one still speak the old shape.
 */
export function formatDateTime(value: string | Date, timeZone: string | undefined): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return 'Unknown';
	}

	return new Intl.DateTimeFormat('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone === undefined ? {} : { timeZone }),
	}).format(date);
}

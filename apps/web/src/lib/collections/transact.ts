/**
 * Writing a command that one row cannot describe.
 *
 * The other half of `mutate.ts`, and bound the same way: `packages/sync` has no
 * dependency on `packages/domain`, so the vocabulary arrives as a type argument
 * and this module is where the two meet.
 *
 * `MultiRowCommandType` is the complement of what `mutateCollection` accepts, so
 * between them every command in SIMMER has exactly one way to be sent — and
 * sending one the wrong way is a compile error rather than a half-drawn screen.
 * See `MultiRowCommandType` for which fifteen commands are here and why.
 */

import type { MultiRowCommandType } from '@simmer-mosquito/domain';
import { createCommandTransactor } from '@simmer-mosquito/sync';
import { getServerUrl } from '../../auth';

export const commandTransaction = createCommandTransactor<MultiRowCommandType>({
	serverUrl: getServerUrl(),
});

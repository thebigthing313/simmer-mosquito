/**
 * Writing to a collection, with the command named in the call.
 *
 * `packages/sync` has no dependency on `packages/domain` and must not acquire
 * one, so the command vocabulary arrives as a type argument. This module is where
 * the two meet, and binding it once here is what makes every write in this app
 * name a command the domain actually defines.
 *
 * `SingleRowCommandType` excludes the fourteen commands that write more than one
 * row. Those need `createTransaction` grouping their optimistic mutations, and
 * naming one here would leave a second record on screen showing its old state —
 * see `MultiRowCommandType` for the list and the reasoning.
 */

import type { SingleRowCommandType } from '@simmer-mosquito/domain';
import { createCollectionMutator } from '@simmer-mosquito/sync';

export const mutateCollection = createCollectionMutator<SingleRowCommandType>();

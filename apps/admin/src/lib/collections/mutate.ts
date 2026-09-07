/**
 * Writing to a collection, with the command named in the call.
 *
 * `packages/sync` has no dependency on `packages/domain` and must not acquire
 * one, so the command vocabulary arrives as a type argument. This module is where
 * the two meet, and binding it once here is what makes every write in this app
 * name a command the domain actually defines. Before it existed the console
 * passed `metadata.intents` as bare strings, and the only thing reading them was
 * `requireIntents` at runtime, so a typo was a 400 rather than a build failure.
 *
 * The console writes the global taxonomy and the global units, which are nine
 * `foundation.*` commands and all single-row, so it binds the same union
 * `apps/web` does. `SingleRowCommandType` excludes the commands that write more
 * than one row; those need `createTransaction` grouping their optimistic
 * mutations, and naming one here would leave a second record on screen showing
 * its old state.
 */

import type { SingleRowCommandType } from '@simmer-mosquito/domain';
import { createCollectionMutator } from '@simmer-mosquito/sync';

export const mutateCollection = createCollectionMutator<SingleRowCommandType>();

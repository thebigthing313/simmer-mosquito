/**
 * The agency role ladder, as five names.
 *
 * One declaration, here, because a role is domain vocabulary before it is a
 * column: identity command builders name it, `COMMAND_PERMISSIONS` writes floors
 * against it, and the People page picks from it. It was declared five times
 * before ADR 0013: in `packages/db`, in `packages/sync`, and three times inside
 * the two frontends under three names. Five copies of one value set can disagree
 * while every one of them compiles.
 *
 * The ordering is not here. Which role outranks which is an authorization
 * question, and authorization is the server's: `apps/server/src/roles.ts` holds
 * the rank and the floors it decides.
 */
export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';

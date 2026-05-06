import {
  type ColumnType,
  type Generated,
  Kysely,
  PostgresDialect,
  sql
} from "kysely";
import pg from "pg";

const { Pool } = pg;

type TimestampWithDefault = ColumnType<
  Date,
  Date | undefined,
  Date | undefined
>;
type NullableTimestampWithDefault = ColumnType<
  Date | null,
  Date | null | undefined,
  Date | null | undefined
>;
type BooleanWithDefault = ColumnType<boolean, boolean | undefined, boolean>;

export type SimmerRole = "owner" | "admin" | "manager" | "collector" | "viewer";
export type MembershipStatus = "active" | "inactive" | "invited";

export interface UsersTable {
  id: Generated<string>;
  workos_user_id: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email_verified: boolean | null;
  profile_picture_url: string | null;
  created_at: TimestampWithDefault;
  updated_at: TimestampWithDefault;
}

export interface OrganizationsTable {
  id: Generated<string>;
  workos_organization_id: string | null;
  name: string;
  slug: string | null;
  settings: unknown | null;
  created_at: TimestampWithDefault;
  updated_at: TimestampWithDefault;
  deleted_at: NullableTimestampWithDefault;
  deleted_by_profile_id: string | null;
}

export interface ProfilesTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  is_active: BooleanWithDefault;
  created_at: TimestampWithDefault;
  updated_at: TimestampWithDefault;
  deleted_at: NullableTimestampWithDefault;
  deleted_by_profile_id: string | null;
}

export interface MembershipsTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string;
  profile_id: string;
  role: SimmerRole;
  status: MembershipStatus;
  is_default: BooleanWithDefault;
  created_at: TimestampWithDefault;
  updated_at: TimestampWithDefault;
}

export interface SimmerDatabase {
  users: UsersTable;
  organizations: OrganizationsTable;
  profiles: ProfilesTable;
  memberships: MembershipsTable;
}

export interface CreateDbOptions {
  readonly databaseUrl: string;
  readonly maxConnections?: number;
}

export function createDb(options: CreateDbOptions): Kysely<SimmerDatabase> {
  return new Kysely<SimmerDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: options.databaseUrl,
        max: options.maxConnections ?? 10
      })
    })
  });
}

export interface WorkOsIdentityInput {
  readonly workosUserId: string;
  readonly email: string;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly emailVerified: boolean | null;
  readonly profilePictureUrl: string | null;
  readonly workosOrganizationId: string | null;
  readonly workosOrganizationName?: string | null;
  readonly workosRole?: string | null;
}

export interface LocalIdentity {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly profileId: string | null;
  readonly membershipId: string | null;
  readonly role: SimmerRole | null;
}

export async function upsertWorkOsIdentity(
  db: Kysely<SimmerDatabase>,
  input: WorkOsIdentityInput
): Promise<LocalIdentity> {
  return db.transaction().execute(async (trx) => {
    const user = await trx
      .insertInto("users")
      .values({
        workos_user_id: input.workosUserId,
        email: input.email,
        display_name: input.displayName,
        first_name: input.firstName,
        last_name: input.lastName,
        email_verified: input.emailVerified,
        profile_picture_url: input.profilePictureUrl
      })
      .onConflict((oc) =>
        oc.column("workos_user_id").doUpdateSet({
          email: input.email,
          display_name: input.displayName,
          first_name: input.firstName,
          last_name: input.lastName,
          email_verified: input.emailVerified,
          profile_picture_url: input.profilePictureUrl,
          updated_at: sql`now()`
        })
      )
      .returning(["id"])
      .executeTakeFirstOrThrow();

    if (input.workosOrganizationId === null) {
      return {
        userId: user.id,
        organizationId: null,
        profileId: null,
        membershipId: null,
        role: null
      };
    }

    const organizationName =
      input.workosOrganizationName ?? input.workosOrganizationId;

    const organization = await trx
      .insertInto("organizations")
      .values({
        workos_organization_id: input.workosOrganizationId,
        name: organizationName
      })
      .onConflict((oc) =>
        oc.column("workos_organization_id").doUpdateSet({
          name: organizationName,
          updated_at: sql`now()`
        })
      )
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const existingMembershipCount = await trx
      .selectFrom("memberships")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("organization_id", "=", organization.id)
      .executeTakeFirstOrThrow();

    const defaultRole =
      Number(existingMembershipCount.count) === 0 ? "owner" : "viewer";

    const profile = await trx
      .insertInto("profiles")
      .values({
        organization_id: organization.id,
        user_id: user.id,
        display_name: input.displayName,
        email: input.email
      })
      .onConflict((oc) =>
        oc.columns(["organization_id", "user_id"]).doUpdateSet({
          display_name: input.displayName,
          email: input.email,
          updated_at: sql`now()`
        })
      )
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const membership = await trx
      .insertInto("memberships")
      .values({
        organization_id: organization.id,
        user_id: user.id,
        profile_id: profile.id,
        role: coerceRole(input.workosRole) ?? defaultRole,
        status: "active",
        is_default: defaultRole === "owner"
      })
      .onConflict((oc) =>
        oc.columns(["organization_id", "user_id"]).doUpdateSet({
          profile_id: profile.id,
          status: "active",
          updated_at: sql`now()`
        })
      )
      .returning(["id", "role"])
      .executeTakeFirstOrThrow();

    return {
      userId: user.id,
      organizationId: organization.id,
      profileId: profile.id,
      membershipId: membership.id,
      role: membership.role
    };
  });
}

function coerceRole(role: string | null | undefined): SimmerRole | null {
  if (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "collector" ||
    role === "viewer"
  ) {
    return role;
  }

  return null;
}

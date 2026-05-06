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

export interface ActiveLocalAuthIdentity {
  readonly user: {
    readonly id: string;
    readonly workosUserId: string;
    readonly email: string;
    readonly displayName: string;
    readonly firstName: string | null;
    readonly lastName: string | null;
    readonly emailVerified: boolean | null;
    readonly profilePictureUrl: string | null;
  };
  readonly organization: {
    readonly id: string;
    readonly workosOrganizationId: string;
    readonly name: string;
    readonly slug: string | null;
  };
  readonly profile: {
    readonly id: string;
    readonly organizationId: string;
    readonly userId: string | null;
    readonly displayName: string;
    readonly email: string | null;
  };
  readonly membership: {
    readonly id: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly profileId: string;
    readonly role: SimmerRole;
    readonly status: MembershipStatus;
    readonly isDefault: boolean;
  };
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

export async function resolveActiveLocalAuthIdentity(
  db: Kysely<SimmerDatabase>,
  input: {
    readonly workosUserId: string;
    readonly workosOrganizationId: string;
  }
): Promise<ActiveLocalAuthIdentity | null> {
  const row = await db
    .selectFrom("users")
    .innerJoin("memberships", "memberships.user_id", "users.id")
    .innerJoin("organizations", "organizations.id", "memberships.organization_id")
    .innerJoin("profiles", "profiles.id", "memberships.profile_id")
    .select([
      "users.id as user_id",
      "users.workos_user_id as user_workos_user_id",
      "users.email as user_email",
      "users.display_name as user_display_name",
      "users.first_name as user_first_name",
      "users.last_name as user_last_name",
      "users.email_verified as user_email_verified",
      "users.profile_picture_url as user_profile_picture_url",
      "organizations.id as organization_id",
      "organizations.workos_organization_id as organization_workos_organization_id",
      "organizations.name as organization_name",
      "organizations.slug as organization_slug",
      "profiles.id as profile_id",
      "profiles.organization_id as profile_organization_id",
      "profiles.user_id as profile_user_id",
      "profiles.display_name as profile_display_name",
      "profiles.email as profile_email",
      "memberships.id as membership_id",
      "memberships.organization_id as membership_organization_id",
      "memberships.user_id as membership_user_id",
      "memberships.profile_id as membership_profile_id",
      "memberships.role as membership_role",
      "memberships.status as membership_status",
      "memberships.is_default as membership_is_default"
    ])
    .where("users.workos_user_id", "=", input.workosUserId)
    .where("organizations.workos_organization_id", "=", input.workosOrganizationId)
    .where("organizations.deleted_at", "is", null)
    .where("memberships.status", "=", "active")
    .where("profiles.is_active", "=", true)
    .where("profiles.deleted_at", "is", null)
    .executeTakeFirst();

  if (row === undefined || row.organization_workos_organization_id === null) {
    return null;
  }

  return {
    user: {
      id: row.user_id,
      workosUserId: row.user_workos_user_id,
      email: row.user_email,
      displayName: row.user_display_name,
      firstName: row.user_first_name,
      lastName: row.user_last_name,
      emailVerified: row.user_email_verified,
      profilePictureUrl: row.user_profile_picture_url
    },
    organization: {
      id: row.organization_id,
      workosOrganizationId: row.organization_workos_organization_id,
      name: row.organization_name,
      slug: row.organization_slug
    },
    profile: {
      id: row.profile_id,
      organizationId: row.profile_organization_id,
      userId: row.profile_user_id,
      displayName: row.profile_display_name,
      email: row.profile_email
    },
    membership: {
      id: row.membership_id,
      organizationId: row.membership_organization_id,
      userId: row.membership_user_id,
      profileId: row.membership_profile_id,
      role: row.membership_role,
      status: row.membership_status,
      isDefault: row.membership_is_default
    }
  };
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

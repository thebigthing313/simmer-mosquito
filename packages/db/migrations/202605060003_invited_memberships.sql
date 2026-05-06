-- migrate:up
alter table memberships
  drop constraint memberships_organization_id_user_id_key;

alter table memberships
  alter column user_id drop not null,
  add column invited_email text,
  add column workos_invitation_id text,
  add constraint memberships_user_or_invited_email_check
    check (user_id is not null or invited_email is not null);

create unique index memberships_organization_user_unique
  on memberships (organization_id, user_id)
  where user_id is not null;

create unique index memberships_organization_invited_email_unique
  on memberships (organization_id, lower(invited_email))
  where user_id is null and status = 'invited' and invited_email is not null;

create unique index profiles_organization_pending_email_unique
  on profiles (organization_id, lower(email))
  where user_id is null and email is not null and deleted_at is null;

-- migrate:down
drop index if exists profiles_organization_pending_email_unique;
drop index if exists memberships_organization_invited_email_unique;
drop index if exists memberships_organization_user_unique;

alter table memberships
  drop constraint if exists memberships_user_or_invited_email_check,
  drop column if exists workos_invitation_id,
  drop column if exists invited_email;

delete from memberships
where user_id is null;

alter table memberships
  alter column user_id set not null,
  add constraint memberships_organization_id_user_id_key unique (organization_id, user_id);

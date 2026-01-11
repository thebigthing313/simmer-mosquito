create or replace function public.user_is_group_member(p_group_id uuid)
returns boolean
language sql
set search_path = ''
security invoker
as $$
  select 
    case 
      when p_group_id is null then true
      else coalesce((auth.jwt() -> 'app_metadata' ->> 'group_id')::uuid = p_group_id, false)
    end;
$$;

create or replace function public.user_has_group_role(p_group_id uuid, p_role_id integer)
returns boolean
language sql
set search_path = ''
security invoker
as $$
  select 
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'group_id')::uuid = p_group_id
      and (auth.jwt() -> 'app_metadata' ->> 'role_id')::integer <= p_role_id,
      false
    );
$$;

create or replace function public.user_owns_record(p_user_id uuid)
returns boolean
language sql
set search_path = ''
security invoker
as $$
  select p_user_id is not null and p_user_id = auth.uid();
$$;
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.user_has_group_role(p_group_id uuid, p_role_id integer)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select 
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'group_id')::uuid = p_group_id
      and (auth.jwt() -> 'app_metadata' ->> 'role_id')::integer <= p_role_id,
      false
    );
$function$
;

CREATE OR REPLACE FUNCTION public.user_is_group_member(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select 
    case 
      when p_group_id is null then true
      else coalesce((auth.jwt() -> 'app_metadata' ->> 'group_id')::uuid = p_group_id, false)
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.user_owns_record(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select p_user_id is not null and p_user_id = auth.uid();
$function$
;



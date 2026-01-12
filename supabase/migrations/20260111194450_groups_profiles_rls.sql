set check_function_bodies = off;

CREATE OR REPLACE FUNCTION simmer.prevent_user_id_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    begin
        if OLD.user_id IS DISTINCT FROM NEW.user_id then
            raise exception 'Cannot change user_id on profiles';
        end if;
        return NEW;
    end;
$function$
;


  create policy "delete: none"
  on "public"."groups"
  as permissive
  for delete
  to public
using (false);



  create policy "insert: none"
  on "public"."groups"
  as permissive
  for insert
  to public
with check (false);



  create policy "read: group members"
  on "public"."groups"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(id));



  create policy "update: group owners"
  on "public"."groups"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(id, 1))
with check (public.user_has_group_role(id, 1));



  create policy "delete: group owners"
  on "public"."profiles"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 1));



  create policy "insert: group owners"
  on "public"."profiles"
  as permissive
  for insert
  to authenticated
with check ((public.user_has_group_role(group_id, 1) AND (user_id IS NULL)));



  create policy "read: group members"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group owners"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 1))
with check (public.user_has_group_role(group_id, 1));


CREATE TRIGGER prevent_user_id_change_trigger BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION simmer.prevent_user_id_change();



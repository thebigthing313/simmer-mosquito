
  create table "public"."region_tags" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "region_id" uuid not null,
    "tag_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."region_tags" enable row level security;


  create table "public"."service_request_tags" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "service_request_id" uuid not null,
    "tag_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."service_request_tags" enable row level security;

CREATE UNIQUE INDEX habitat_tag_unique ON public.habitat_tags USING btree (habitat_id, tag_id);

CREATE UNIQUE INDEX region_tag_unique ON public.region_tags USING btree (region_id, tag_id);

CREATE UNIQUE INDEX region_tags_pkey ON public.region_tags USING btree (id);

CREATE UNIQUE INDEX service_request_tag_unique ON public.service_request_tags USING btree (service_request_id, tag_id);

CREATE UNIQUE INDEX service_request_tags_pkey ON public.service_request_tags USING btree (id);

alter table "public"."region_tags" add constraint "region_tags_pkey" PRIMARY KEY using index "region_tags_pkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_pkey" PRIMARY KEY using index "service_request_tags_pkey";

alter table "public"."habitat_tags" add constraint "habitat_tag_unique" UNIQUE using index "habitat_tag_unique";

alter table "public"."region_tags" add constraint "region_tag_unique" UNIQUE using index "region_tag_unique";

alter table "public"."region_tags" add constraint "region_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."region_tags" validate constraint "region_tags_created_by_fkey";

alter table "public"."region_tags" add constraint "region_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."region_tags" validate constraint "region_tags_group_id_fkey";

alter table "public"."region_tags" add constraint "region_tags_region_id_fkey" FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE not valid;

alter table "public"."region_tags" validate constraint "region_tags_region_id_fkey";

alter table "public"."region_tags" add constraint "region_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE not valid;

alter table "public"."region_tags" validate constraint "region_tags_tag_id_fkey";

alter table "public"."region_tags" add constraint "region_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."region_tags" validate constraint "region_tags_updated_by_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tag_unique" UNIQUE using index "service_request_tag_unique";

alter table "public"."service_request_tags" add constraint "service_request_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_created_by_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_group_id_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_service_request_id_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_tag_id_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_updated_by_fkey";

grant delete on table "public"."region_tags" to "anon";

grant insert on table "public"."region_tags" to "anon";

grant references on table "public"."region_tags" to "anon";

grant select on table "public"."region_tags" to "anon";

grant trigger on table "public"."region_tags" to "anon";

grant truncate on table "public"."region_tags" to "anon";

grant update on table "public"."region_tags" to "anon";

grant delete on table "public"."region_tags" to "authenticated";

grant insert on table "public"."region_tags" to "authenticated";

grant references on table "public"."region_tags" to "authenticated";

grant select on table "public"."region_tags" to "authenticated";

grant trigger on table "public"."region_tags" to "authenticated";

grant truncate on table "public"."region_tags" to "authenticated";

grant update on table "public"."region_tags" to "authenticated";

grant delete on table "public"."region_tags" to "service_role";

grant insert on table "public"."region_tags" to "service_role";

grant references on table "public"."region_tags" to "service_role";

grant select on table "public"."region_tags" to "service_role";

grant trigger on table "public"."region_tags" to "service_role";

grant truncate on table "public"."region_tags" to "service_role";

grant update on table "public"."region_tags" to "service_role";

grant delete on table "public"."service_request_tags" to "anon";

grant insert on table "public"."service_request_tags" to "anon";

grant references on table "public"."service_request_tags" to "anon";

grant select on table "public"."service_request_tags" to "anon";

grant trigger on table "public"."service_request_tags" to "anon";

grant truncate on table "public"."service_request_tags" to "anon";

grant update on table "public"."service_request_tags" to "anon";

grant delete on table "public"."service_request_tags" to "authenticated";

grant insert on table "public"."service_request_tags" to "authenticated";

grant references on table "public"."service_request_tags" to "authenticated";

grant select on table "public"."service_request_tags" to "authenticated";

grant trigger on table "public"."service_request_tags" to "authenticated";

grant truncate on table "public"."service_request_tags" to "authenticated";

grant update on table "public"."service_request_tags" to "authenticated";

grant delete on table "public"."service_request_tags" to "service_role";

grant insert on table "public"."service_request_tags" to "service_role";

grant references on table "public"."service_request_tags" to "service_role";

grant select on table "public"."service_request_tags" to "service_role";

grant trigger on table "public"."service_request_tags" to "service_role";

grant truncate on table "public"."service_request_tags" to "service_role";

grant update on table "public"."service_request_tags" to "service_role";


  create policy "delete: group admin"
  on "public"."region_tags"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: group admin"
  on "public"."region_tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: group data"
  on "public"."region_tags"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group admin"
  on "public"."region_tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own groups collector"
  on "public"."service_request_tags"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 4));



  create policy "insert: own groups collector"
  on "public"."service_request_tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."service_request_tags"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own groups collector"
  on "public"."service_request_tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.region_tags FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.region_tags FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.region_tags FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.service_request_tags FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.service_request_tags FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.service_request_tags FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();



-- New-user bootstrap. Creates a profile and the self-service roles a person may choose at sign-up.
-- ADMIN is never granted here; it can only be granted by an existing admin or the seed script.

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  intent text := coalesce(meta ->> 'signup_intent', 'customer');
  display_name text := coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(coalesce(new.email, 'Member'), '@', 1));
begin
  insert into public.profiles (id, full_name, terms_accepted_at)
  values (new.id, left(display_name, 120), case when meta ->> 'terms_accepted' = 'true' then now() end);

  insert into public.profile_contacts (profile_id, email, phone)
  values (new.id, new.email, nullif(new.phone, ''));

  insert into public.role_assignments (profile_id, role) values (new.id, 'CUSTOMER');

  if intent = 'technician' then
    insert into public.role_assignments (profile_id, role) values (new.id, 'TECHNICIAN');
    insert into public.technician_profiles (profile_id) values (new.id);
  elsif intent = 'property_manager' then
    insert into public.role_assignments (profile_id, role) values (new.id, 'PROPERTY_MANAGER');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Private storage bucket (Supabase only). No storage.objects policies are created for clients:
-- uploads and downloads go through the HomeCare server after an authorisation check.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('homecare-private', 'homecare-private', false, 5242880,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;

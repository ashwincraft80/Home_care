-- Local stand-in for the parts of Supabase that the migrations depend on.
-- Applied ONLY to the embedded PGlite database used by demo mode and automated tests.
-- Never run this against a Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

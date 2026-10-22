-- Row Level Security.
--
-- Access model:
--   * Browsers may read through the Supabase API (anon/publishable key + user JWT) ONLY what these
--     policies allow. They have NO insert/update/delete privileges on any table.
--   * All writes go through the HomeCare server, which authorises each mutation in the service
--     layer (lib/permissions) and executes it in a transaction with the table-owner role.
--   * Server-side reads run as the signed-in user ("set local role authenticated" + JWT claims),
--     so these policies also protect the app against its own query bugs (IDOR defence in depth).
--   * Tenants see only their own unit. Landlords invited to a booking see that booking only.
--     Household members see the owner's personal bookings and passport, never property data.

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant read access explicitly.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema app from public;
grant usage on schema app to anon, authenticated;

grant select on all tables in schema public to authenticated;
grant select on public.service_categories, public.cities, public.service_areas,
  public.service_area_pincodes, public.service_area_categories to anon;

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so that policies do not recurse through RLS.
-- They only ever answer questions about the *current* user (auth.uid()).
-- ---------------------------------------------------------------------------

create or replace function app.has_role(check_role text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.role_assignments where profile_id = auth.uid() and role = check_role)
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.has_role('ADMIN')
$$;

-- Any membership, including tenants.
create or replace function app.is_property_member(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select pid is not null and exists (
    select 1 from public.property_memberships where property_id = pid and profile_id = auth.uid()
  )
$$;

-- Owners, managers and viewers: property-wide visibility.
create or replace function app.is_property_staff(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select pid is not null and exists (
    select 1 from public.property_memberships
    where property_id = pid and profile_id = auth.uid() and member_role in ('OWNER', 'MANAGER', 'VIEWER')
  )
$$;

-- Property-wide staff, or a tenant of this specific unit.
create or replace function app.can_view_unit(pid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select pid is not null and exists (
    select 1 from public.property_memberships m
    where m.property_id = pid and m.profile_id = auth.uid()
      and (m.member_role in ('OWNER', 'MANAGER', 'VIEWER') or (m.member_role = 'TENANT' and m.unit_id = uid))
  )
$$;

-- The current user is a household member of `owner`.
create or replace function app.is_household_of(owner uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select owner is not null and exists (
    select 1 from public.household_members where owner_id = owner and member_id = auth.uid()
  )
$$;

create or replace function app.is_booking_approver(bid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.booking_approvers where booking_id = bid and profile_id = auth.uid())
$$;

-- Full access to a booking.
create or replace function app.is_booking_party(bid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.bookings b
    where b.id = bid
      and (b.customer_id = auth.uid()
           or b.technician_id = auth.uid()
           or app.can_view_unit(b.property_id, b.unit_id)
           or (b.property_id is null and app.is_household_of(b.customer_id))
           or app.is_booking_approver(b.id)
           or app.is_admin())
  )
$$;

-- An approved technician may see (limited) details of an unassigned confirmed booking in
-- a category and service area they serve, unless they declined it.
create or replace function app.is_open_offer_for_me(bid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.bookings b
    join public.technician_profiles tp on tp.profile_id = auth.uid() and tp.verification_status = 'APPROVED'
    join public.technician_capabilities tc on tc.technician_id = tp.profile_id and tc.category_id = b.category_id
    join public.technician_service_areas ta on ta.technician_id = tp.profile_id and ta.service_area_id = b.service_area_id
    where b.id = bid
      and b.status = 'CONFIRMED'
      and b.technician_id is null
      and b.slot_start > now()
      and not exists (select 1 from public.booking_offer_declines d where d.booking_id = b.id and d.technician_id = tp.profile_id)
  )
$$;

-- Requester/technician pairs on a currently active booking may see each other's phone number.
create or replace function app.is_active_counterpart(other uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.bookings b
    where b.status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS','AWAITING_APPROVAL','COMPLETION_PENDING')
      and ((b.customer_id = auth.uid() and b.technician_id = other)
        or (b.technician_id = auth.uid() and b.customer_id = other)
        or (b.technician_id = other and (app.can_view_unit(b.property_id, b.unit_id)
                                         or app.is_booking_approver(b.id)
                                         or (b.property_id is null and app.is_household_of(b.customer_id)))))
  )
$$;

-- Users who appear together on a booking, property team or household (names only).
create or replace function app.shares_context(other uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.bookings b
    where (b.customer_id = auth.uid() and (b.technician_id = other or exists (select 1 from public.booking_approvers a where a.booking_id = b.id and a.profile_id = other)))
       or (b.technician_id = auth.uid() and b.customer_id = other)
       or ((b.technician_id = other or b.customer_id = other) and (app.can_view_unit(b.property_id, b.unit_id) or app.is_booking_approver(b.id)))
       or (b.property_id is null and app.is_household_of(b.customer_id) and (b.technician_id = other or b.customer_id = other))
  ) or exists (
    select 1 from public.property_memberships m1
    join public.property_memberships m2 on m1.property_id = m2.property_id
    where m1.profile_id = auth.uid() and m2.profile_id = other
      and (m1.member_role <> 'TENANT' or m2.member_role in ('OWNER', 'MANAGER'))
  ) or exists (
    select 1 from public.household_members h
    where (h.owner_id = auth.uid() and h.member_id = other) or (h.member_id = auth.uid() and h.owner_id = other)
  )
$$;

create or replace function app.can_view_asset(aid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.assets a
    where a.id = aid
      and (a.owner_id = auth.uid()
           or app.is_household_of(a.owner_id)
           or app.is_property_staff(a.property_id)
           or (a.unit_id is not null and app.can_view_unit(a.property_id, a.unit_id))
           or app.is_admin()
           or exists (select 1 from public.bookings b where b.asset_id = a.id and (b.technician_id = auth.uid() or app.is_booking_approver(b.id))))
  )
$$;

grant execute on all functions in schema app to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table in public.
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Read policies. No write policies exist by design.
-- ---------------------------------------------------------------------------

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_admin() or app.shares_context(id));

create policy profile_contacts_read on public.profile_contacts for select to authenticated
  using (profile_id = auth.uid() or app.is_admin() or app.is_active_counterpart(profile_id));

create policy role_assignments_read on public.role_assignments for select to authenticated
  using (profile_id = auth.uid() or app.is_admin());

create policy addresses_read on public.addresses for select to authenticated
  using (profile_id = auth.uid() or app.is_admin());

-- Public coverage information (anyone can check whether we serve a pincode).
create policy cities_read on public.cities for select to anon, authenticated using (true);
create policy service_areas_read on public.service_areas for select to anon, authenticated using (true);
create policy service_area_pincodes_read on public.service_area_pincodes for select to anon, authenticated using (true);
create policy service_area_categories_read on public.service_area_categories for select to anon, authenticated using (true);

create policy service_waitlist_read on public.service_waitlist for select to authenticated
  using (profile_id = auth.uid() or app.is_admin());

create policy properties_read on public.properties for select to authenticated
  using (app.is_property_member(id) or app.is_admin());

create policy property_units_read on public.property_units for select to authenticated
  using (app.can_view_unit(property_id, id) or app.is_admin());

-- Tenants see their own membership and who manages the property, never other tenants.
create policy property_memberships_read on public.property_memberships for select to authenticated
  using (profile_id = auth.uid()
         or app.is_admin()
         or app.is_property_staff(property_id)
         or (member_role in ('OWNER', 'MANAGER') and app.is_property_member(property_id)));

create policy service_categories_read_public on public.service_categories for select to anon, authenticated
  using (is_active or app.is_admin());

create policy technician_profiles_read on public.technician_profiles for select to authenticated
  using (profile_id = auth.uid() or app.is_admin() or app.shares_context(profile_id));

create policy technician_capabilities_read on public.technician_capabilities for select to authenticated
  using (technician_id = auth.uid() or app.is_admin());

create policy technician_service_areas_read on public.technician_service_areas for select to authenticated
  using (technician_id = auth.uid() or app.is_admin());

create policy availability_slots_read on public.availability_slots for select to authenticated
  using (technician_id = auth.uid() or app.is_admin());

create policy assets_read on public.assets for select to authenticated
  using (app.can_view_asset(id));

create policy bookings_read on public.bookings for select to authenticated
  using (customer_id = auth.uid()
         or technician_id = auth.uid()
         or app.can_view_unit(property_id, unit_id)
         or (property_id is null and app.is_household_of(customer_id))
         or app.is_booking_approver(id)
         or app.is_admin()
         or app.is_open_offer_for_me(id));

-- Exact address: parties only (not technicians browsing open offers).
create policy booking_locations_read on public.booking_locations for select to authenticated
  using (app.is_booking_party(booking_id));

create policy booking_status_history_read on public.booking_status_history for select to authenticated
  using (app.is_booking_party(booking_id));

create policy booking_offer_declines_read on public.booking_offer_declines for select to authenticated
  using (technician_id = auth.uid() or app.is_admin());

create policy booking_approvers_read on public.booking_approvers for select to authenticated
  using (profile_id = auth.uid() or app.is_booking_party(booking_id));

create policy household_members_read on public.household_members for select to authenticated
  using (owner_id = auth.uid() or member_id = auth.uid() or app.is_admin());

create policy invitations_read on public.invitations for select to authenticated
  using (created_by = auth.uid() or accepted_by = auth.uid() or app.is_admin());

create policy estimates_read on public.estimates for select to authenticated
  using (app.is_booking_party(booking_id));

create policy estimate_line_items_read on public.estimate_line_items for select to authenticated
  using (exists (select 1 from public.estimates e where e.id = estimate_id and app.is_booking_party(e.booking_id)));

create policy estimate_approvals_read on public.estimate_approvals for select to authenticated
  using (exists (select 1 from public.estimates e where e.id = estimate_id and app.is_booking_party(e.booking_id)));

create policy job_completions_read on public.job_completions for select to authenticated
  using (app.is_booking_party(booking_id));

create policy invoices_read on public.invoices for select to authenticated
  using (app.is_booking_party(booking_id));

create policy technician_payouts_read on public.technician_payouts for select to authenticated
  using (technician_id = auth.uid() or app.is_admin());

create policy maintenance_records_read on public.maintenance_records for select to authenticated
  using (owner_id = auth.uid()
         or app.is_household_of(owner_id)
         or app.is_property_staff(property_id)
         or (booking_id is not null and app.is_booking_party(booking_id))
         or app.is_admin());

create policy attachments_read on public.attachments for select to authenticated
  using (uploaded_by = auth.uid()
         or (booking_id is not null and app.is_booking_party(booking_id))
         or (asset_id is not null and app.can_view_asset(asset_id)));

create policy complaints_read on public.complaints for select to authenticated
  using (raised_by = auth.uid() or app.is_admin()
         or exists (select 1 from public.bookings b where b.id = booking_id and app.is_property_staff(b.property_id)));

create policy complaint_updates_read on public.complaint_updates for select to authenticated
  using (app.is_admin()
         or (not is_internal and exists (
               select 1 from public.complaints c where c.id = complaint_id
               and (c.raised_by = auth.uid()
                    or exists (select 1 from public.bookings b where b.id = c.booking_id and app.is_property_staff(b.property_id))))));

create policy reviews_read on public.reviews for select to authenticated
  using (author_id = auth.uid() or technician_id = auth.uid() or app.is_admin());

create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy audit_events_read on public.audit_events for select to authenticated
  using (app.is_admin());

create policy analytics_events_read on public.analytics_events for select to authenticated
  using (app.is_admin());

-- Aggregated public rating: only exposed once a technician has enough reviews to be meaningful.
create or replace function public.technician_rating_summary(tid uuid)
returns table (review_count integer, average_rating numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer, case when count(*) >= 5 then round(avg(rating)::numeric, 1) end
  from public.reviews where technician_id = tid
$$;
revoke all on function public.technician_rating_summary(uuid) from public;
grant execute on function public.technician_rating_summary(uuid) to authenticated;

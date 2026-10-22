-- HomeCare core schema.
-- Runs unchanged on Supabase Postgres (production) and PGlite (demo/tests, after supabase/local/shim.sql).
-- Money is stored as integer paise. All timestamps are timestamptz (UTC); display uses the configured launch time zone.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  marketing_opt_in boolean not null default false,
  terms_accepted_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contact details live apart from profiles so that they can be shared more narrowly.
create table public.profile_contacts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{10,16}$'),
  email text check (email is null or position('@' in email) > 1),
  updated_at timestamptz not null default now()
);

create table public.role_assignments (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('CUSTOMER', 'TECHNICIAN', 'PROPERTY_MANAGER', 'ADMIN')),
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home' check (char_length(label) <= 40),
  line1 text not null check (char_length(line1) between 3 and 200),
  landmark text check (char_length(landmark) <= 120),
  locality text not null,
  city text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  created_at timestamptz not null default now()
);
create index addresses_profile_idx on public.addresses (profile_id);

-- ---------------------------------------------------------------------------
-- Cities and service areas (multi-city coverage)
-- A city existing in this table does not make it bookable: only LIVE service areas in
-- LIVE or PILOT cities accept bookings, and only for categories enabled in that area.
-- ---------------------------------------------------------------------------

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  state text not null,
  time_zone text not null default 'Asia/Kolkata',
  status text not null default 'COMING_SOON' check (status in ('LIVE', 'PILOT', 'COMING_SOON', 'PAUSED')),
  support_phone text,
  support_email text,
  escalation_contact text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  status text not null default 'PLANNED' check (status in ('LIVE', 'PAUSED', 'PLANNED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, name)
);

-- Each pincode belongs to at most one service area.
create table public.service_area_pincodes (
  pincode text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  service_area_id uuid not null references public.service_areas (id) on delete cascade
);
create index service_area_pincodes_area_idx on public.service_area_pincodes (service_area_id);

-- ---------------------------------------------------------------------------
-- Properties (property managers, landlords, tenants)
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  property_type text not null default 'RESIDENTIAL' check (property_type in ('RESIDENTIAL', 'APARTMENT_BLOCK', 'COMMERCIAL', 'OTHER')),
  line1 text not null check (char_length(line1) between 3 and 200),
  locality text not null,
  city text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  service_area_id uuid references public.service_areas (id),
  created_by uuid not null references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (property_id, label)
);

create table public.property_memberships (
  property_id uuid not null references public.properties (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- TENANT members only see and request work for their own unit.
  member_role text not null check (member_role in ('OWNER', 'MANAGER', 'VIEWER', 'TENANT')),
  unit_id uuid references public.property_units (id) on delete cascade,
  -- Maximum estimate total this member may approve. NULL = no limit (owners only).
  approval_limit_paise integer check (approval_limit_paise is null or approval_limit_paise >= 0),
  created_at timestamptz not null default now(),
  primary key (property_id, profile_id),
  check (member_role <> 'TENANT' or unit_id is not null),
  check (member_role = 'OWNER' or approval_limit_paise is not null or member_role = 'VIEWER')
);
create index property_memberships_profile_idx on public.property_memberships (profile_id);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  name_hi text,
  icon text not null,
  short_description text not null,
  description text not null,
  common_jobs text[] not null default '{}',
  asset_types text[] not null default '{}',
  visit_fee_paise integer not null check (visit_fee_paise >= 0),
  indicative_min_paise integer check (indicative_min_paise >= 0),
  indicative_max_paise integer check (indicative_max_paise >= 0),
  warranty_days integer not null default 0 check (warranty_days between 0 and 365),
  warranty_exclusions text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (indicative_min_paise is null or indicative_max_paise is null or indicative_min_paise <= indicative_max_paise)
);

-- Services offered in each area (operations may enable categories area by area).
create table public.service_area_categories (
  service_area_id uuid not null references public.service_areas (id) on delete cascade,
  category_id uuid not null references public.service_categories (id) on delete cascade,
  primary key (service_area_id, category_id)
);

-- People who asked to be told when we serve their area. Contact details only with explicit consent.
create table public.service_waitlist (
  id uuid primary key default gen_random_uuid(),
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  city_id uuid references public.cities (id) on delete set null,
  category_id uuid references public.service_categories (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete cascade,
  contact_email text check (contact_email is null or position('@' in contact_email) > 1),
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  check (contact_email is null or consent_at is not null)
);
create index service_waitlist_pincode_idx on public.service_waitlist (pincode);

-- ---------------------------------------------------------------------------
-- Technicians
-- ---------------------------------------------------------------------------

create table public.technician_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bio text check (char_length(bio) <= 600),
  years_experience integer check (years_experience between 0 and 60),
  verification_status text not null default 'PENDING_REVIEW'
    check (verification_status in ('PENDING_REVIEW', 'APPROVED', 'SUSPENDED', 'REJECTED')),
  review_notes text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.technician_capabilities (
  technician_id uuid not null references public.technician_profiles (profile_id) on delete cascade,
  category_id uuid not null references public.service_categories (id) on delete cascade,
  primary key (technician_id, category_id)
);

create table public.technician_service_areas (
  technician_id uuid not null references public.technician_profiles (profile_id) on delete cascade,
  service_area_id uuid not null references public.service_areas (id) on delete cascade,
  primary key (technician_id, service_area_id)
);

-- Weekly recurring availability: which appointment windows a technician usually works.
create table public.availability_slots (
  technician_id uuid not null references public.technician_profiles (profile_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  window_key text not null,
  primary key (technician_id, weekday, window_key)
);

-- ---------------------------------------------------------------------------
-- Assets (home maintenance passport)
-- ---------------------------------------------------------------------------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  unit_id uuid references public.property_units (id) on delete set null,
  asset_type text not null check (asset_type in ('AC','GEYSER','RO','INVERTER','SOLAR','WASHING_MACHINE','REFRIGERATOR','WIRING','PLUMBING_FIXTURE','OTHER')),
  nickname text not null check (char_length(nickname) between 1 and 80),
  brand text check (char_length(brand) <= 80),
  model text check (char_length(model) <= 80),
  location_in_home text check (char_length(location_in_home) <= 80),
  installed_on date,
  warranty_expires_on date,
  notes text check (char_length(notes) <= 1000),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_id is not null) <> (property_id is not null))
);
create index assets_owner_idx on public.assets (owner_id);
create index assets_property_idx on public.assets (property_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references public.profiles (id),
  property_id uuid references public.properties (id),
  unit_id uuid references public.property_units (id),
  category_id uuid not null references public.service_categories (id),
  asset_id uuid references public.assets (id) on delete set null,
  problem_description text not null check (char_length(problem_description) between 10 and 2000),
  service_area_id uuid not null references public.service_areas (id),
  locality text not null, -- service area name snapshot
  city text not null,     -- city name snapshot
  -- Who lives there and who approves costs. Tenants can request work without owning the home.
  occupancy text not null default 'OWNER' check (occupancy in ('OWNER', 'TENANT', 'MANAGER')),
  cost_approval text not null default 'REQUESTER' check (cost_approval in ('REQUESTER', 'LANDLORD', 'PROPERTY')),
  -- With LANDLORD approval, the tenant may still approve (and pay for) estimates up to this amount.
  requester_approval_limit_paise integer check (requester_approval_limit_paise is null or requester_approval_limit_paise >= 0),
  window_key text not null,
  slot_start timestamptz not null,
  slot_end timestamptz not null check (slot_end > slot_start),
  requested_slot_start timestamptz,
  requested_slot_end timestamptz,
  requested_window_key text,
  status text not null default 'REQUESTED' check (status in (
    'REQUESTED','CONFIRMED','ASSIGNED','EN_ROUTE','IN_PROGRESS','AWAITING_APPROVAL',
    'COMPLETION_PENDING','COMPLETED','CANCELLED','DECLINED','RESCHEDULE_REQUESTED','DISPUTED')),
  technician_id uuid references public.technician_profiles (profile_id),
  -- Price snapshot shown to the customer at submission time.
  visit_fee_paise integer not null check (visit_fee_paise >= 0),
  indicative_min_paise integer,
  indicative_max_paise integer,
  cancellation_terms text not null,
  payment_method text not null default 'PAY_AFTER_SERVICE' check (payment_method in ('PAY_AFTER_SERVICE', 'ONLINE')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  cancellation_reason text,
  cancellation_fee_paise integer check (cancellation_fee_paise >= 0),
  cancelled_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  assigned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unit_id is null or property_id is not null)
);
create unique index bookings_idempotency_idx on public.bookings (customer_id, idempotency_key);
create index bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index bookings_technician_idx on public.bookings (technician_id, slot_start);
create index bookings_status_idx on public.bookings (status, slot_start);
create index bookings_property_idx on public.bookings (property_id);
create index bookings_category_slot_idx on public.bookings (category_id, slot_start);
create index bookings_area_slot_idx on public.bookings (service_area_id, slot_start);
-- A technician cannot hold two active jobs in the same window.
create unique index bookings_technician_window_unique on public.bookings (technician_id, slot_start)
  where technician_id is not null
    and status in ('ASSIGNED','EN_ROUTE','IN_PROGRESS','AWAITING_APPROVAL','COMPLETION_PENDING','RESCHEDULE_REQUESTED');
-- A requester cannot hold two open bookings for the same service in the same window.
create unique index bookings_customer_category_window_unique on public.bookings (customer_id, category_id, slot_start, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status not in ('CANCELLED','DECLINED','COMPLETED');

-- Exact address is kept apart from the booking row: technicians browsing open jobs see the
-- locality only; the full address is visible once they are assigned.
create table public.booking_locations (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  line1 text not null,
  landmark text,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$')
);

create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles (id),
  actor_role text,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index booking_status_history_booking_idx on public.booking_status_history (booking_id, created_at);

create table public.booking_offer_declines (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  technician_id uuid not null references public.technician_profiles (profile_id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (booking_id, technician_id)
);

-- A landlord (or other cost approver) invited by the requester for one booking.
create table public.booking_approvers (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  relation text not null default 'LANDLORD' check (relation in ('LANDLORD')),
  approval_limit_paise integer check (approval_limit_paise is null or approval_limit_paise >= 0),
  created_at timestamptz not null default now(),
  primary key (booking_id, profile_id)
);
create index booking_approvers_profile_idx on public.booking_approvers (profile_id);

-- Household members (e.g. a partner) who can follow — and optionally manage — the owner's own bookings.
create table public.household_members (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  access text not null default 'VIEW' check (access in ('VIEW', 'MANAGE')),
  approval_limit_paise integer check (approval_limit_paise is null or approval_limit_paise >= 0),
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);
create index household_members_member_idx on public.household_members (member_id);

-- Single-use invitation links. Only a SHA-256 hash of the token is stored.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('BOOKING_APPROVER', 'PROPERTY_MEMBER', 'HOUSEHOLD_MEMBER')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  created_by uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  unit_id uuid references public.property_units (id) on delete cascade,
  member_role text check (member_role in ('MANAGER', 'VIEWER', 'TENANT')),
  access text check (access in ('VIEW', 'MANAGE')),
  approval_limit_paise integer check (approval_limit_paise is null or approval_limit_paise >= 0),
  note text check (char_length(note) <= 200),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED')),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'BOOKING_APPROVER') = (booking_id is not null)),
  check ((kind = 'PROPERTY_MEMBER') = (property_id is not null and member_role is not null)),
  check (kind <> 'HOUSEHOLD_MEMBER' or access is not null)
);
create index invitations_created_by_idx on public.invitations (created_by, created_at desc);

-- ---------------------------------------------------------------------------
-- Estimates
-- ---------------------------------------------------------------------------

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  version integer not null check (version >= 1),
  kind text not null check (kind in ('INITIAL', 'SUPPLEMENTARY')),
  technician_id uuid not null references public.technician_profiles (profile_id),
  diagnosis text not null check (char_length(diagnosis) between 5 and 2000),
  visit_fee_paise integer not null check (visit_fee_paise >= 0),
  labour_paise integer not null check (labour_paise >= 0),
  parts_paise integer not null check (parts_paise >= 0),
  additional_paise integer not null check (additional_paise >= 0),
  total_paise integer not null check (total_paise = visit_fee_paise + labour_paise + parts_paise + additional_paise),
  valid_until timestamptz not null,
  notes text check (char_length(notes) <= 1000),
  exclusions text check (char_length(exclusions) <= 1000),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'WITHDRAWN')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, version)
);
-- At most one estimate awaiting a decision per booking.
create unique index estimates_one_open_per_booking on public.estimates (booking_id) where status = 'SUBMITTED';

create table public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates (id) on delete cascade,
  kind text not null check (kind in ('LABOUR', 'PART', 'ADDITIONAL')),
  description text not null check (char_length(description) between 2 and 200),
  quantity integer not null check (quantity between 1 and 1000),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  total_paise integer not null check (total_paise = quantity * unit_price_paise),
  position integer not null default 0
);
create index estimate_line_items_estimate_idx on public.estimate_line_items (estimate_id, position);

create table public.estimate_approvals (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null unique references public.estimates (id) on delete cascade,
  decision text not null check (decision in ('APPROVED', 'REJECTED')),
  decided_by uuid not null references public.profiles (id),
  decided_by_role text not null,
  -- Who is responsible for paying this approved amount.
  payer text not null default 'REQUESTER' check (payer in ('REQUESTER', 'LANDLORD', 'PROPERTY', 'HOUSEHOLD')),
  total_paise_at_decision integer not null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Completion, invoices, payouts
-- ---------------------------------------------------------------------------

create table public.job_completions (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  technician_id uuid not null references public.technician_profiles (profile_id),
  checklist jsonb not null default '{}'::jsonb,
  work_summary text not null check (char_length(work_summary) between 5 and 2000),
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles (id),
  confirmed_by_role text,
  confirmed_at timestamptz
);

create sequence public.invoice_number_seq start 1001;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  number text not null unique,
  customer_id uuid not null references public.profiles (id),
  property_id uuid references public.properties (id),
  visit_fee_paise integer not null check (visit_fee_paise >= 0),
  labour_paise integer not null check (labour_paise >= 0),
  parts_paise integer not null check (parts_paise >= 0),
  additional_paise integer not null check (additional_paise >= 0),
  total_paise integer not null check (total_paise = visit_fee_paise + labour_paise + parts_paise + additional_paise),
  payment_status text not null default 'UNPAID' check (payment_status in ('UNPAID', 'PAID', 'WAIVED')),
  paid_at timestamptz,
  warranty_days integer not null default 0,
  warranty_expires_on date,
  warranty_terms text not null default '',
  issued_at timestamptz not null default now()
);
create index invoices_customer_idx on public.invoices (customer_id, issued_at desc);
create index invoices_property_idx on public.invoices (property_id);

create table public.technician_payouts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  technician_id uuid not null references public.technician_profiles (profile_id),
  amount_paise integer not null check (amount_paise >= 0),
  breakdown jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'PAID', 'ON_HOLD')),
  note text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index technician_payouts_technician_idx on public.technician_payouts (technician_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Maintenance history & files
-- ---------------------------------------------------------------------------

create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets (id) on delete set null,
  booking_id uuid unique references public.bookings (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  source text not null check (source in ('JOB', 'SELF_REPORTED')),
  performed_on date not null,
  title text not null check (char_length(title) between 2 and 160),
  details text check (char_length(details) <= 2000),
  cost_paise integer check (cost_paise >= 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((owner_id is not null) <> (property_id is not null))
);
create index maintenance_records_asset_idx on public.maintenance_records (asset_id, performed_on desc);
create index maintenance_records_owner_idx on public.maintenance_records (owner_id, performed_on desc);
create index maintenance_records_property_idx on public.maintenance_records (property_id, performed_on desc);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles (id),
  booking_id uuid references public.bookings (id) on delete cascade,
  asset_id uuid references public.assets (id) on delete cascade,
  purpose text not null check (purpose in ('BOOKING_PHOTO', 'BEFORE_PHOTO', 'AFTER_PHOTO', 'WARRANTY_DOCUMENT', 'INVOICE_DOCUMENT')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  original_name text check (char_length(original_name) <= 200),
  created_at timestamptz not null default now(),
  check (booking_id is not null or asset_id is not null)
);
create index attachments_booking_idx on public.attachments (booking_id);
create index attachments_asset_idx on public.attachments (asset_id);

-- ---------------------------------------------------------------------------
-- Support, feedback, notifications, audit, analytics
-- ---------------------------------------------------------------------------

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  booking_id uuid references public.bookings (id) on delete set null,
  raised_by uuid not null references public.profiles (id),
  raised_by_role text not null,
  category text not null check (category in ('QUALITY','PRICING','BEHAVIOUR','NO_SHOW','DAMAGE','WARRANTY_CLAIM','PAYOUT','SAFETY','OTHER')),
  description text not null check (char_length(description) between 10 and 2000),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED')),
  priority text not null default 'NORMAL' check (priority in ('NORMAL', 'HIGH', 'URGENT')),
  resolution text check (char_length(resolution) <= 2000),
  assigned_admin uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index complaints_raised_by_idx on public.complaints (raised_by, created_at desc);
create index complaints_status_idx on public.complaints (status, created_at);
create index complaints_booking_idx on public.complaints (booking_id);

create table public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_role text not null,
  message text not null check (char_length(message) between 1 and 2000),
  status_change text,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index complaint_updates_complaint_idx on public.complaint_updates (complaint_id, created_at);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  technician_id uuid not null references public.technician_profiles (profile_id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index reviews_technician_idx on public.reviews (technician_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at);
create index audit_events_created_idx on public.audit_events (created_at desc);

-- Product analytics. Must never contain names, phone numbers, addresses or free text.
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[a-z_]{3,60}$'),
  anonymous_id text check (char_length(anonymous_id) <= 64),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on public.analytics_events (name, created_at);

-- ---------------------------------------------------------------------------
-- Integrity triggers (defence in depth: the service layer validates first)
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
create trigger cities_touch before update on public.cities for each row execute function app.touch_updated_at();
create trigger service_areas_touch before update on public.service_areas for each row execute function app.touch_updated_at();
create trigger properties_touch before update on public.properties for each row execute function app.touch_updated_at();
create trigger service_categories_touch before update on public.service_categories for each row execute function app.touch_updated_at();
create trigger technician_profiles_touch before update on public.technician_profiles for each row execute function app.touch_updated_at();
create trigger assets_touch before update on public.assets for each row execute function app.touch_updated_at();
create trigger bookings_touch before update on public.bookings for each row execute function app.touch_updated_at();
create trigger payouts_touch before update on public.technician_payouts for each row execute function app.touch_updated_at();
create trigger complaints_touch before update on public.complaints for each row execute function app.touch_updated_at();

-- Allowed booking status transitions. Must match features/bookings/state-machine.ts.
create or replace function app.booking_transition_allowed(from_status text, to_status text) returns boolean
language sql immutable as $$
  select (from_status, to_status) in (
    ('REQUESTED','CONFIRMED'), ('REQUESTED','DECLINED'), ('REQUESTED','CANCELLED'), ('REQUESTED','ASSIGNED'), ('REQUESTED','RESCHEDULE_REQUESTED'),
    ('CONFIRMED','ASSIGNED'), ('CONFIRMED','CANCELLED'), ('CONFIRMED','RESCHEDULE_REQUESTED'), ('CONFIRMED','DECLINED'),
    ('ASSIGNED','EN_ROUTE'), ('ASSIGNED','CONFIRMED'), ('ASSIGNED','CANCELLED'), ('ASSIGNED','RESCHEDULE_REQUESTED'),
    ('EN_ROUTE','IN_PROGRESS'), ('EN_ROUTE','CONFIRMED'), ('EN_ROUTE','CANCELLED'),
    ('IN_PROGRESS','AWAITING_APPROVAL'), ('IN_PROGRESS','COMPLETION_PENDING'), ('IN_PROGRESS','DISPUTED'), ('IN_PROGRESS','CANCELLED'),
    ('AWAITING_APPROVAL','IN_PROGRESS'), ('AWAITING_APPROVAL','DISPUTED'), ('AWAITING_APPROVAL','CANCELLED'),
    ('COMPLETION_PENDING','COMPLETED'), ('COMPLETION_PENDING','DISPUTED'), ('COMPLETION_PENDING','IN_PROGRESS'),
    ('RESCHEDULE_REQUESTED','CONFIRMED'), ('RESCHEDULE_REQUESTED','ASSIGNED'), ('RESCHEDULE_REQUESTED','CANCELLED'),
    ('DISPUTED','COMPLETED'), ('DISPUTED','IN_PROGRESS'), ('DISPUTED','CANCELLED')
  )
$$;

create or replace function app.enforce_booking_transition() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and not app.booking_transition_allowed(old.status, new.status) then
    raise exception 'Invalid booking status transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  -- Price snapshot and requester are immutable after submission.
  if new.visit_fee_paise <> old.visit_fee_paise or new.customer_id <> old.customer_id or new.category_id <> old.category_id then
    raise exception 'Booking price snapshot, requester and category are immutable' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger bookings_transition before update on public.bookings for each row execute function app.enforce_booking_transition();

-- Estimates: amounts are immutable once created; only status/decided_at may change, and only from SUBMITTED.
create or replace function app.enforce_estimate_immutability() returns trigger language plpgsql as $$
begin
  if new.total_paise <> old.total_paise or new.labour_paise <> old.labour_paise or new.parts_paise <> old.parts_paise
     or new.additional_paise <> old.additional_paise or new.visit_fee_paise <> old.visit_fee_paise
     or new.booking_id <> old.booking_id or new.version <> old.version or new.diagnosis <> old.diagnosis then
    raise exception 'Estimate amounts and content cannot be changed after submission' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status and old.status <> 'SUBMITTED' then
    raise exception 'Estimate % is already %', old.id, old.status using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger estimates_immutable before update on public.estimates for each row execute function app.enforce_estimate_immutability();

create or replace function app.enforce_line_item_immutability() returns trigger language plpgsql as $$
declare
  est_status text;
  has_decision boolean;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Estimate line items cannot be modified or removed' using errcode = 'check_violation';
  end if;
  select status into est_status from public.estimates where id = new.estimate_id;
  select exists (select 1 from public.estimate_approvals where estimate_id = new.estimate_id) into has_decision;
  if est_status <> 'SUBMITTED' or has_decision then
    raise exception 'Cannot add items to an estimate that has been decided' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger estimate_line_items_immutable before insert or update or delete on public.estimate_line_items
  for each row execute function app.enforce_line_item_immutability();

-- Approval records are append-only and must match the estimate total.
create or replace function app.enforce_approval_record() returns trigger language plpgsql as $$
declare
  est record;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Approval records are append-only' using errcode = 'check_violation';
  end if;
  select status, total_paise into est from public.estimates where id = new.estimate_id;
  if est.status <> 'SUBMITTED' then
    raise exception 'Estimate is not awaiting a decision' using errcode = 'check_violation';
  end if;
  if est.total_paise <> new.total_paise_at_decision then
    raise exception 'Approval total does not match the estimate' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger estimate_approvals_append_only before insert or update or delete on public.estimate_approvals
  for each row execute function app.enforce_approval_record();

-- Audit events and status history are append-only.
create or replace function app.forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'check_violation';
end $$;
create trigger audit_events_append_only before update or delete on public.audit_events for each row execute function app.forbid_mutation();
create trigger booking_status_history_append_only before update or delete on public.booking_status_history for each row execute function app.forbid_mutation();

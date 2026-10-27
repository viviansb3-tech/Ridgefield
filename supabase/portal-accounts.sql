-- Additive account and portal schema for the existing Ridgefield Academy project.
-- Apply once to the existing project; do not reapply supabase/schema.sql.

alter table public.rf_students
  add column if not exists is_test_fixture boolean not null default false;

create table if not exists public.rf_teacher_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  campus text not null,
  pathway text not null check (pathway in ('Cambridge','CAPS Secondary','Primary')),
  subjects_json jsonb not null default '[]'::jsonb check (jsonb_typeof(subjects_json)='array'),
  status text not null default 'Pending' check (status in ('Pending','Active','Rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rf_teacher_accounts_status_created
  on public.rf_teacher_accounts(status, created_at desc);

create table if not exists public.rf_teacher_assignments (
  teacher_id uuid not null references public.rf_teacher_accounts(user_id) on delete cascade,
  student_id uuid not null references public.rf_students(id) on delete cascade,
  subject text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (teacher_id, student_id, subject)
);
create index if not exists rf_teacher_assignments_student
  on public.rf_teacher_assignments(student_id);
create unique index if not exists rf_learner_access_student_login
  on public.rf_learner_access(student_id)
  where relationship = 'student';

create table if not exists public.rf_student_invites (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.rf_students(id) on delete cascade,
  email text not null,
  token_digest text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  claim_id uuid,
  claimed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((claim_id is null) = (claimed_at is null))
);
create unique index if not exists rf_student_invites_one_open_per_student
  on public.rf_student_invites(student_id)
  where consumed_at is null and revoked_at is null;

alter table public.rf_teacher_accounts enable row level security;
alter table public.rf_teacher_assignments enable row level security;
alter table public.rf_student_invites enable row level security;
revoke all on public.rf_teacher_accounts, public.rf_teacher_assignments, public.rf_student_invites
  from public, anon, authenticated;
grant all on public.rf_teacher_accounts, public.rf_teacher_assignments, public.rf_student_invites
  to service_role;
create policy internal_only on public.rf_teacher_accounts
  for all to anon, authenticated using (false) with check (false);
create policy internal_only on public.rf_teacher_assignments
  for all to anon, authenticated using (false) with check (false);
create policy internal_only on public.rf_student_invites
  for all to anon, authenticated using (false) with check (false);

create or replace function public.rf_submit_teacher_registration(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_campus text,
  p_pathway text,
  p_subjects jsonb
) returns text
language plpgsql security invoker set search_path = '' as $$
declare existing_status text;
begin
  select status into existing_status
  from public.rf_teacher_accounts
  where user_id = p_user_id
  for update;

  if existing_status = 'Active' then
    return 'Active';
  end if;

  insert into public.rf_teacher_accounts(
    user_id, email, first_name, last_name, campus, pathway, subjects_json, status, updated_at
  ) values (
    p_user_id, lower(p_email), p_first_name, p_last_name, p_campus, p_pathway, p_subjects, 'Pending', now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    campus = excluded.campus,
    pathway = excluded.pathway,
    subjects_json = excluded.subjects_json,
    status = 'Pending',
    updated_at = now()
  where public.rf_teacher_accounts.status <> 'Active';

  return 'Pending';
end $$;
revoke all on function public.rf_submit_teacher_registration(uuid,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.rf_submit_teacher_registration(uuid,text,text,text,text,text,jsonb)
  to service_role;

create or replace function public.rf_claim_student_invite(
  p_token_digest text,
  p_email text,
  p_claim_id uuid
) returns table(invite_id uuid, student_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  return query
  update public.rf_student_invites i
     set claim_id = p_claim_id, claimed_at = now()
   where i.token_digest = p_token_digest
     and lower(i.email) = lower(p_email)
     and i.expires_at > now()
     and i.consumed_at is null
     and i.revoked_at is null
     and (i.claim_id is null or i.claimed_at < now() - interval '5 minutes')
  returning i.id, i.student_id;
end $$;
revoke all on function public.rf_claim_student_invite(text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.rf_claim_student_invite(text,text,uuid)
  to service_role;

create or replace function public.rf_finalize_student_invite(
  p_invite_id uuid,
  p_claim_id uuid,
  p_user_id uuid
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare linked_student uuid;
begin
  update public.rf_student_invites i
     set consumed_at = now(), claim_id = null, claimed_at = null
   where i.id = p_invite_id
     and i.claim_id = p_claim_id
     and i.claimed_at > now() - interval '5 minutes'
     and i.expires_at > now()
     and i.consumed_at is null
     and i.revoked_at is null
  returning i.student_id into strict linked_student;

  insert into public.rf_learner_access(user_id, student_id, relationship)
  values (p_user_id, linked_student, 'student');

  return linked_student;
end $$;
revoke all on function public.rf_finalize_student_invite(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.rf_finalize_student_invite(uuid,uuid,uuid)
  to service_role;

create or replace function public.rf_release_student_invite(
  p_invite_id uuid,
  p_claim_id uuid
) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.rf_student_invites
     set claim_id = null, claimed_at = null
   where id = p_invite_id
     and claim_id = p_claim_id
     and consumed_at is null;
  return found;
end $$;
revoke all on function public.rf_release_student_invite(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.rf_release_student_invite(uuid,uuid)
  to service_role;

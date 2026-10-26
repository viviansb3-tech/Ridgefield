-- Ridgefield Academy BaaS. Apply to the separate Ridgefield project only.
create table public.rf_staff (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','admissions')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.rf_applications (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 request_id text not null unique,
 payload_digest text not null,
 learner_first text not null, learner_last text not null, dob date not null,
 guardian_name text not null, guardian_email text not null, guardian_phone text not null,
 pathway text not null check(pathway in ('Cambridge','CAPS Secondary','Primary')),
 campus text not null, learner_grade text not null,
 status text not null default 'Pending' check(status in ('Pending','Under Review','Documents Required','Interview','Accepted','Waitlisted','Declined','Enrolled')),
 payload jsonb not null, admin_notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index rf_applications_status_created on public.rf_applications(status,created_at desc);
create table public.rf_enquiries (
 id uuid primary key default gen_random_uuid(),reference text not null unique,
 request_id text not null unique,payload_digest text not null,
 name text not null,email text not null,phone text not null default '',
 enquiry_type text not null,subject text not null,message text not null,
 status text not null default 'New' check(status in ('New','In Progress','Resolved')),
 payload jsonb not null,created_at timestamptz not null default now()
);
create index rf_enquiries_created on public.rf_enquiries(created_at desc);
create table public.rf_students (
 id uuid primary key default gen_random_uuid(),student_ref text not null unique,
 application_id uuid unique references public.rf_applications(id),
 first_name text not null,last_name text not null,grade text not null,pathway text not null,
 campus text not null,parent_email text,status text not null default 'Active',
 created_at timestamptz not null default now()
);
create index rf_students_application on public.rf_students(application_id);
create table public.rf_learner_access (
 user_id uuid references auth.users(id) on delete cascade,
 student_id uuid references public.rf_students(id) on delete cascade,
 relationship text not null check(relationship in ('student','guardian')),
 primary key(user_id,student_id)
);
create index rf_learner_access_student on public.rf_learner_access(student_id);
create table public.rf_academic_records (
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.rf_students(id) on delete cascade,
 subject text not null,assessment text not null,score numeric,max_score numeric check(max_score>0),
 term text,academic_year integer,comment text,created_at timestamptz not null default now()
);
create index rf_records_student on public.rf_academic_records(student_id);
create table public.rf_attendance (
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.rf_students(id) on delete cascade,
 attendance_date date not null,status text not null check(status in ('Present','Absent','Late','Excused')),note text,
 unique(student_id,attendance_date)
);
create table public.rf_content (
 section text primary key,title text not null,body text not null,
 published boolean not null default false,updated_at timestamptz not null default now()
);
create table public.rf_documents (
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.rf_applications(id) on delete cascade,
 storage_path text not null unique,file_name text not null,mime_type text not null,
 file_size integer not null check(file_size>0 and file_size<=5242880),document_type text not null,
 status text not null default 'Pending' check(status in ('Pending','Verified','Rejected','Resubmit')),
 admin_note text not null default '',uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index rf_documents_application on public.rf_documents(application_id);
create index rf_documents_uploaded_by on public.rf_documents(uploaded_by);
create table public.rf_audit (
 id bigint generated always as identity primary key,actor_id uuid references auth.users(id),
 action text not null,target_id uuid,created_at timestamptz not null default now()
);
create index rf_audit_actor on public.rf_audit(actor_id);
-- Not exposed to browser clients. Used atomically by the Edge Function.
create table public.rf_rate_limits (
 key text primary key,window_start timestamptz not null default now(),hits integer not null default 1
);
create function public.rf_allow_request(rate_key text,max_hits integer default 15) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare current_hits integer;
begin
 delete from public.rf_rate_limits where window_start < now()-interval '1 day';
 insert into public.rf_rate_limits as r(key,window_start,hits) values(rate_key,now(),1)
 on conflict(key) do update set
  hits=case when r.window_start<now()-interval '1 minute' then 1 else r.hits+1 end,
  window_start=case when r.window_start<now()-interval '1 minute' then now() else r.window_start end
 returning hits into current_hits;
 return current_hits<=least(greatest(max_hits,1),60);
end $$;
revoke all on function public.rf_allow_request(text,integer) from public,anon,authenticated;
grant execute on function public.rf_allow_request(text,integer) to service_role;
-- RLS protects direct Data API access as well as the checked Edge API.
alter table public.rf_staff enable row level security;
create policy staff_self on public.rf_staff for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.rf_staff from anon,authenticated;
grant select on public.rf_staff to authenticated;
do $$ declare t text; begin
 foreach t in array array['rf_applications','rf_enquiries','rf_students','rf_learner_access','rf_academic_records','rf_attendance','rf_content','rf_documents','rf_audit','rf_rate_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;
create policy internal_only on public.rf_rate_limits for all to anon,authenticated using(false) with check(false);
-- Direct client access is read-only and restricted to current staff membership.
do $$ declare t text; begin
 foreach t in array array['rf_applications','rf_enquiries','rf_students','rf_learner_access','rf_academic_records','rf_attendance','rf_content','rf_documents','rf_audit'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy staff_read on public.%I for select to authenticated using(exists(select 1 from public.rf_staff s where s.user_id=(select auth.uid()) and s.active))',t);
 end loop;
end $$;
create policy linked_students on public.rf_students for select to authenticated using(exists(select 1 from public.rf_learner_access a where a.user_id=(select auth.uid()) and a.student_id=rf_students.id));
create policy own_links on public.rf_learner_access for select to authenticated using(user_id=(select auth.uid()));
create policy linked_records on public.rf_academic_records for select to authenticated using(exists(select 1 from public.rf_learner_access a where a.user_id=(select auth.uid()) and a.student_id=rf_academic_records.student_id));
create policy linked_attendance on public.rf_attendance for select to authenticated using(exists(select 1 from public.rf_learner_access a where a.user_id=(select auth.uid()) and a.student_id=rf_attendance.student_id));
grant select on public.rf_content to anon;
create policy published_content on public.rf_content for select to anon,authenticated using(published);
grant all on public.rf_staff,public.rf_applications,public.rf_enquiries,public.rf_students,public.rf_learner_access,public.rf_academic_records,public.rf_attendance,public.rf_content,public.rf_documents,public.rf_audit,public.rf_rate_limits to service_role;
grant usage,select on sequence public.rf_audit_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ridgefield-documents','ridgefield-documents',false,5242880,array['application/pdf','image/jpeg','image/png']);
-- No storage.objects policies: uploads/downloads require the checked staff Edge API.

-- Consolidate overlapping SELECT rules for a single evaluation path.
drop policy staff_read on public.rf_students;
drop policy linked_students on public.rf_students;
create policy authorized_read on public.rf_students for select to authenticated using (
 exists(select 1 from public.rf_staff s where s.user_id=(select auth.uid()) and s.active)
 or exists(select 1 from public.rf_learner_access a where a.user_id=(select auth.uid()) and a.student_id=rf_students.id));
drop policy staff_read on public.rf_learner_access;
drop policy own_links on public.rf_learner_access;
create policy authorized_read on public.rf_learner_access for select to authenticated using (
 user_id=(select auth.uid()) or exists(select 1 from public.rf_staff s where s.user_id=(select auth.uid()) and s.active));
drop policy staff_read on public.rf_academic_records;
drop policy linked_records on public.rf_academic_records;
create policy authorized_read on public.rf_academic_records for select to authenticated using (
 exists(select 1 from public.rf_staff s where s.user_id=(select auth.uid()) and s.active)
 or exists(select 1 from public.rf_learner_access a where a.user_id=(select auth.uid()) and a.student_id=rf_academic_records.student_id));
drop policy staff_read on public.rf_attendance;
drop policy linked_attendance on public.rf_attendance;
create policy authorized_read on public.rf_attendance for select to authenticated using (
 exists(select 1 from public.rf_staff s where s.user_id=(select auth.uid()) and s.active)
 or exists(select 1 from public.rf_learner_access a where a.user_id=(select auth.uid()) and a.student_id=rf_attendance.student_id));
drop policy staff_read on public.rf_content;
drop policy published_content on public.rf_content;
create policy authorized_read on public.rf_content for select to authenticated using (
 published or exists(select 1 from public.rf_staff s where s.user_id=(select auth.uid()) and s.active));
create policy published_content on public.rf_content for select to anon using(published);

-- One-time onboarding capabilities are generated by the operator, never shipped to clients.
create table public.rf_bootstrap (
 token_digest text primary key,email text not null,
 created_at timestamptz not null default now(),consumed_at timestamptz
);
alter table public.rf_bootstrap enable row level security;
revoke all on public.rf_bootstrap from anon,authenticated;
grant all on public.rf_bootstrap to service_role;
create policy internal_only on public.rf_bootstrap for all to anon,authenticated using(false) with check(false);

-- Permanent learner numbering and application-to-enrolment linkage.
-- Permanent identifiers: RIDC + original application year + accumulating sequence.
-- Cambridge uses even sequences; CAPS Secondary and Primary use odd sequences.
-- Counter never resets by year. Allocations are transactional and cannot be recycled.
create table public.rf_number_counter (
 singleton boolean primary key default true check(singleton),
 last_value bigint not null default 0 check(last_value>=0)
);
insert into public.rf_number_counter(singleton,last_value) values(true,0);
create table public.rf_learner_numbers (
 reference text primary key,
 sequence_no bigint not null unique check(sequence_no>0),
 issue_year integer not null check(issue_year between 1900 and 9999),
 initial_pathway text not null check(initial_pathway in ('Cambridge','CAPS Secondary','Primary')),
 issued_at timestamptz not null default now(),
 check((initial_pathway='Cambridge' and sequence_no%2=0) or (initial_pathway<>'Cambridge' and sequence_no%2=1)),
 check(reference = 'RIDC'||issue_year::text||case when length(sequence_no::text)<5 then lpad(sequence_no::text,5,'0') else sequence_no::text end)
);
alter table public.rf_number_counter enable row level security;
alter table public.rf_learner_numbers enable row level security;
revoke all on public.rf_number_counter, public.rf_learner_numbers from public,anon,authenticated,service_role;
grant select,update on public.rf_number_counter to service_role;
grant select,insert on public.rf_learner_numbers to service_role;
create policy internal_only on public.rf_number_counter for all to anon,authenticated using(false) with check(false);
create policy internal_only on public.rf_learner_numbers for all to anon,authenticated using(false) with check(false);

create function public.rf_allocate_learner_number(p_pathway text,p_year integer default extract(year from now() at time zone 'Africa/Johannesburg')::integer)
returns text language plpgsql security invoker set search_path='' as $$
declare n bigint; result text;
begin
 if p_pathway not in ('Cambridge','CAPS Secondary','Primary') or p_pathway is null then raise exception 'Invalid pathway'; end if;
 if p_year not between 1900 and 9999 or p_year is null then raise exception 'Invalid issue year'; end if;
 select last_value+1 into strict n from public.rf_number_counter where singleton for update;
 if (p_pathway='Cambridge' and n%2<>0) or (p_pathway<>'Cambridge' and n%2<>1) then n:=n+1; end if;
 update public.rf_number_counter set last_value=n where singleton;
 result:='RIDC'||p_year::text||case when length(n::text)<5 then lpad(n::text,5,'0') else n::text end;
 insert into public.rf_learner_numbers(reference,sequence_no,issue_year,initial_pathway) values(result,n,p_year,p_pathway);
 return result;
end $$;
revoke all on function public.rf_allocate_learner_number(text,integer) from public,anon,authenticated;
grant execute on function public.rf_allocate_learner_number(text,integer) to service_role;

alter table public.rf_applications add column legacy_reference text unique;
alter table public.rf_students add column legacy_student_ref text unique;
-- Convert existing legacy identifiers once, retaining them for correspondence and lookup.
do $$ declare a record; s record; permanent text; begin
 for a in select id,reference,pathway,created_at from public.rf_applications order by created_at,id loop
  permanent:=public.rf_allocate_learner_number(a.pathway,extract(year from a.created_at at time zone 'Africa/Johannesburg')::integer);
  update public.rf_applications set legacy_reference=reference,reference=permanent where id=a.id;
 end loop;
 for s in select id,student_ref,application_id,pathway,created_at from public.rf_students order by created_at,id loop
  permanent:=null;
  if s.application_id is not null then select reference into permanent from public.rf_applications where id=s.application_id; end if;
  if permanent is null then permanent:=public.rf_allocate_learner_number(s.pathway,extract(year from s.created_at at time zone 'Africa/Johannesburg')::integer); end if;
  update public.rf_students set legacy_student_ref=student_ref,student_ref=permanent where id=s.id;
 end loop;
end $$;
alter table public.rf_applications add constraint rf_application_permanent_number foreign key(reference) references public.rf_learner_numbers(reference);
alter table public.rf_students add constraint rf_student_permanent_number foreign key(student_ref) references public.rf_learner_numbers(reference);

create function public.rf_application_number_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  new.reference:=public.rf_allocate_learner_number(new.pathway);
 elsif new.reference is distinct from old.reference or new.legacy_reference is distinct from old.legacy_reference then
  raise exception 'The permanent learner number cannot be changed';
 end if;
 return new;
end $$;
create trigger rf_application_number before insert or update on public.rf_applications for each row execute function public.rf_application_number_guard();

create function public.rf_student_number_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.application_id is not null then
   select reference into strict new.student_ref from public.rf_applications where id=new.application_id;
  else
   new.student_ref:=public.rf_allocate_learner_number(new.pathway);
  end if;
 elsif new.student_ref is distinct from old.student_ref or new.application_id is distinct from old.application_id or new.legacy_student_ref is distinct from old.legacy_student_ref then
  raise exception 'The permanent learner number and original application link cannot be changed';
 end if;
 return new;
end $$;
create trigger rf_student_number before insert or update on public.rf_students for each row execute function public.rf_student_number_guard();
revoke all on function public.rf_application_number_guard(),public.rf_student_number_guard() from public,anon,authenticated;
grant execute on function public.rf_application_number_guard(),public.rf_student_number_guard() to service_role;

create function public.rf_enrol_application(p_application_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.rf_applications; s public.rf_students;
begin
 select * into a from public.rf_applications where id=p_application_id for update;
 if not found then raise sqlstate 'PT404' using message='Application not found'; end if;
 if a.status not in ('Accepted','Enrolled') then raise sqlstate 'PT409' using message='Accept the application before enrolling the learner'; end if;
 insert into public.rf_students(student_ref,application_id,first_name,last_name,grade,pathway,campus,parent_email)
 values(a.reference,a.id,a.learner_first,a.learner_last,a.learner_grade,a.pathway,a.campus,a.guardian_email)
 on conflict(application_id) do nothing;
 select * into strict s from public.rf_students where application_id=a.id;
 update public.rf_applications set status='Enrolled',updated_at=now() where id=a.id;
 return jsonb_build_object('ok',true,'studentRef',s.student_ref,'studentId',s.id,'applicationId',a.id);
end $$;
revoke all on function public.rf_enrol_application(uuid) from public,anon,authenticated;
grant execute on function public.rf_enrol_application(uuid) to service_role;

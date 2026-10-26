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

-- Execute as an administrator on the Ridgefield project. All fixtures and counter changes roll back.
begin;
set local role service_role;
do $$
declare c uuid; s uuid; cp uuid; a text; b text; pr text; n bigint; first_result jsonb; second_result jsonb; rejected boolean;
begin
 insert into public.rf_applications(request_id,payload_digest,learner_first,learner_last,dob,guardian_name,guardian_email,guardian_phone,pathway,campus,learner_grade,payload)
 values('RF-NUMBER-TEST-C','test','Synthetic','Cambridge','2010-01-01','Synthetic Guardian','test@example.com','0000000000','Cambridge','test','IGCSE','{}') returning id,reference into c,a;
 insert into public.rf_applications(request_id,payload_digest,learner_first,learner_last,dob,guardian_name,guardian_email,guardian_phone,pathway,campus,learner_grade,payload)
 values('RF-NUMBER-TEST-S','test','Synthetic','CAPS','2010-01-01','Synthetic Guardian','test@example.com','0000000000','CAPS Secondary','test','Grade 10','{}') returning id,reference into s,b;
 insert into public.rf_applications(request_id,payload_digest,learner_first,learner_last,dob,guardian_name,guardian_email,guardian_phone,pathway,campus,learner_grade,payload)
 values('RF-NUMBER-TEST-P','test','Synthetic','Primary','2015-01-01','Synthetic Guardian','test@example.com','0000000000','Primary','test','Grade 5','{}') returning id,reference into cp,pr;
 assert a ~ '^RIDC[0-9]{9,}$','Cambridge number format';
 assert substring(a from 9)::bigint%2=0,'Cambridge must be even';
 assert substring(b from 9)::bigint%2=1,'CAPS must be odd';
 assert substring(pr from 9)::bigint%2=1,'Primary must be odd';
 assert substring(a from 9)::bigint<substring(b from 9)::bigint and substring(b from 9)::bigint<substring(pr from 9)::bigint,'Global accumulation';
 select last_value into n from public.rf_number_counter;
 begin
  insert into public.rf_applications(request_id,payload_digest,learner_first,learner_last,dob,guardian_name,guardian_email,guardian_phone,pathway,campus,learner_grade,payload)
  values('RF-NUMBER-TEST-C','test','Synthetic','Cambridge','2010-01-01','Synthetic Guardian','test@example.com','0000000000','Cambridge','test','IGCSE','{}');
 exception when unique_violation then null;
 end;
 assert (select last_value=n from public.rf_number_counter),'Duplicate retries must not advance counter';
 rejected:=false;
 begin perform public.rf_enrol_application(c); exception when sqlstate 'PT409' then rejected:=true; end;
 assert rejected,'Pending applications cannot be enrolled';
 update public.rf_applications set status='Accepted' where id=c;
 first_result:=public.rf_enrol_application(c);second_result:=public.rf_enrol_application(c);
 assert first_result->>'studentRef'=a,'Enrolment must retain original number';
 assert first_result->>'studentId'=second_result->>'studentId','Repeated enrolment must reuse same learner';
 assert (select count(*)=1 from public.rf_students where application_id=c),'Single learner per application';
 rejected:=false;
 begin update public.rf_applications set reference=b where id=c;exception when raise_exception then rejected:=true;end;
 assert rejected,'Application number is immutable';
 rejected:=false;
 begin update public.rf_students set student_ref=b where application_id=c;exception when raise_exception then rejected:=true;end;
 assert rejected,'Enrolled learner number is immutable';
 update public.rf_students set pathway='CAPS Secondary',grade='Grade 11' where application_id=c;
 assert (select student_ref=a from public.rf_students where application_id=c),'Pathway transfer must preserve number';
 a:=public.rf_allocate_learner_number('Cambridge',2027);
 assert a like 'RIDC2027%','Issue year';
 assert substring(a from 9)::bigint>n,'New year must not restart counter';
 update public.rf_number_counter set last_value=99999 where singleton;
 a:=public.rf_allocate_learner_number('Cambridge',2027);
 assert a='RIDC2027100000','Sequences beyond five digits must not truncate';
end $$;
rollback;

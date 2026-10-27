import assert from 'node:assert/strict';

const baseUrl = 'https://ridgefield-test.supabase.co';
const teacherId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const otherStudentId = '33333333-3333-4333-8333-333333333333';
const env = {
  SUPABASE_URL: baseUrl,
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'service-role-test-key' }),
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'publishable-test-key' })
};
let actor = 'teacher';
const requests = [];

globalThis.Deno = { env: { get: key => env[key] || '' }, serve: () => {} };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input);
  requests.push({ url, init });
  const reply = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' }
  });
  if (url.pathname === '/auth/v1/user') {
    if (actor === 'teacher') return reply({ id: teacherId, email: 'teacher@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' });
    if (actor === 'student') return reply({ id: '44444444-4444-4444-8444-444444444444', email: 'student@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' });
    return reply({ id: '55555555-5555-4555-8555-555555555555', email: 'new@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: {} });
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const table = url.pathname.slice('/rest/v1/'.length);
    if (table === 'rf_teacher_accounts' && init.method !== 'POST') {
      if (actor !== 'teacher') return reply([]);
      return reply([{ user_id: teacherId, email: 'teacher@example.test', first_name: 'Synthetic', last_name: 'Teacher', campus: '25 Wilcock Road, Noordhoek', pathway: 'Cambridge', subjects_json: ['Mathematics'], status: 'Active' }]);
    }
    if (table === 'rf_teacher_assignments' && init.method !== 'POST') {
      return reply(url.searchParams.get('student_id') === 'eq.' + studentId ? [{ subject: 'Mathematics' }] : []);
    }
    if (table === 'rf_academic_records' && init.method === 'POST') return reply([{ id: 'record-id' }]);
    if (table === 'rf_audit' && init.method === 'POST') return reply([{ id: 1 }]);
    if (table === 'rf_staff') return reply([]);
    if (table === 'rf_learner_access') return reply(actor === 'student' ? [{ student_id: studentId }] : []);
    if (table === 'rf_students') return reply([{ id: studentId, student_ref: 'RIDC202600002', first_name: 'Fictional', last_name: 'Tester', grade: 'IGCSE', pathway: 'Cambridge', campus: '25 Wilcock Road, Noordhoek', status: 'Active' }]);
    if (table === 'rf_attendance' || table === 'rf_academic_records') return reply([]);
  }
  throw new Error('Unexpected mocked backend request: ' + init.method + ' ' + url.pathname);
};
const { handler } = await import('../supabase/functions/ridgefield-api/index.ts');

async function call(path, { method = 'GET', body, token = 'teacher-token' } = {}) {
  const request = new Request(baseUrl + '/functions/v1/ridgefield-api' + path, {
    method,
    headers: {
      Origin: 'https://ridgefieldacademy.co.za',
      apikey: 'publishable-test-key',
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const response = await handler(request);
  return { status: response.status, body: await response.json() };
}

requests.length = 0;
const denied = await call('/teacher/records', {
  method: 'POST',
  body: { studentId: otherStudentId, subject: 'Mathematics', assessment: 'Test 1', score: 8, maxScore: 10 }
});
assert.equal(denied.status, 403, 'A teacher cannot write records for an unassigned learner.');
assert(!requests.some(item => item.url.pathname === '/rest/v1/rf_academic_records' && item.init.method === 'POST'));

requests.length = 0;
const invalidScore = await call('/teacher/records', {
  method: 'POST',
  body: { studentId, subject: 'Mathematics', assessment: 'Test 1', score: 11, maxScore: 10 }
});
assert.equal(invalidScore.status, 400, 'Scores above the maximum are rejected.');
assert(!requests.some(item => item.url.pathname === '/rest/v1/rf_academic_records' && item.init.method === 'POST'));

requests.length = 0;
const saved = await call('/teacher/records', {
  method: 'POST',
  body: { studentId, subject: 'Mathematics', assessment: 'Test 1', score: 8, maxScore: 10, academicYear: 2026 }
});
assert.equal(saved.status, 200);
assert.equal(saved.body.ok, true);
assert(requests.some(item => item.url.pathname === '/rest/v1/rf_academic_records' && item.init.method === 'POST'));

requests.length = 0;
const blockedAdmin = await call('/admin/teachers');
assert.equal(blockedAdmin.status, 403, 'Teacher accounts cannot administer staff registrations.');
assert(!requests.some(item => item.url.pathname === '/rest/v1/rf_teacher_accounts' && item.init.method !== 'POST'));

actor = 'student';
requests.length = 0;
const student = await call('/student/dashboard', { token: 'student-token' });
assert.equal(student.status, 200);
assert.equal(student.body.students[0].id, studentId);
const studentQueries = requests.filter(item => /rf_(students|academic_records|attendance)$/.test(item.url.pathname));
assert(studentQueries.length >= 3);
for (const item of studentQueries) {
  if (item.url.searchParams.has('student_id')) {
    assert.equal(item.url.searchParams.get('student_id'), 'in.(' + studentId + ')');
  }
  if (item.url.searchParams.has('id')) {
    assert.equal(item.url.searchParams.get('id'), 'in.(' + studentId + ')');
  }
  assert(!item.url.href.includes(otherStudentId), 'Student queries are restricted to linked records.');
}

actor = 'unregistered';
const unregistered = await call('/me', { token: 'new-user-token' });
assert.equal(unregistered.status, 200);
assert.equal(unregistered.body.role, 'unregistered');

console.log('PASS: role gates, assignment-scoped teacher writes, score validation, student record isolation and unregistered accounts');

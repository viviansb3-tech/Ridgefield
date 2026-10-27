(() => {
  'use strict';
  const B = window.RidgefieldBaas;
  const byId = id => document.getElementById(id);

  function notify(id, message) { byId(id).textContent = message; }
  function setOptions(select, values) {
    select.replaceChildren();
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value.value;
      option.textContent = value.label;
      if (value.studentId) option.dataset.studentId = value.studentId;
      if (value.subject) option.dataset.subject = value.subject;
      select.append(option);
    }
  }
  function appendRow(table, values) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value ?? '—');
      row.append(cell);
    }
    table.append(row);
  }
  function empty(table, columns, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td'); cell.colSpan = columns; cell.textContent = message;
    row.append(cell); table.replaceChildren(row);
  }
  function formProfile() {
    return {
      firstName: byId('teacherFirstName').value.trim(),
      lastName: byId('teacherLastName').value.trim(),
      pathway: byId('teacherPathway').value,
      campus: byId('teacherCampus').value,
      subjects: byId('teacherSubjects').value.split(',').map(subject => subject.trim()).filter(Boolean)
    };
  }
  function fillProfile(profile = {}) {
    byId('teacherFirstName').value = profile.firstName || profile.first_name || '';
    byId('teacherLastName').value = profile.lastName || profile.last_name || '';
    byId('teacherPathway').value = profile.pathway || 'Cambridge';
    byId('teacherCampus').value = profile.campus || '25 Wilcock Road, Noordhoek';
    byId('teacherSubjects').value = Array.isArray(profile.subjects)
      ? profile.subjects.join(', ')
      : Array.isArray(profile.subjects_json) ? profile.subjects_json.join(', ') : '';
  }
  function showPending(message) {
    byId('login').classList.add('hidden');
    byId('dash').classList.add('hidden');
    byId('teacherStatus').classList.remove('hidden');
    notify('teacherStatusText', message);
  }
  function showRegistration(profile) {
    byId('teacherStatus').classList.add('hidden');
    byId('login').classList.remove('hidden');
    byId('loginForm').classList.add('hidden');
    byId('registerForm').classList.remove('hidden');
    if (profile) fillProfile(profile);
  }
  async function submitRegistration(profile) {
    const result = await B.api('/teacher/register', {
      method: 'POST', authenticated: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    if (result.status === 'Active') {
      await loadDashboard();
      return;
    }
    showPending(result.message || 'Your registration is awaiting administrator approval.');
  }
  async function openAccount(profile, user) {
    const state = await B.api('/me', { authenticated: true });
    if (state.role === 'teacher' && state.status === 'Active') {
      await loadDashboard();
    } else if (state.role === 'teacher' && state.status === 'Pending') {
      showPending('Your teacher account is awaiting administrator approval. You will be able to access the portal after approval.');
    } else if (state.role === 'teacher' && state.status === 'Rejected') {
      showRegistration(state);
      notify('registrationMessage', 'The registration was not approved. Update your details and submit it again, or contact the school.');
    } else if (state.role === 'unregistered') {
      const saved = state.registration || user?.user_metadata?.teacher_application || profile;
      if (saved && typeof saved === 'object') await submitRegistration(saved);
      else showRegistration();
    } else {
      throw new Error('This account is not eligible for the teacher portal. Use the portal for your account type.');
    }
  }
  async function withBusy(button, action, errorId) {
    button.disabled = true;
    try { await action(); }
    catch (error) { notify(errorId, error.message || 'The request could not be completed.'); }
    finally { button.disabled = false; }
  }

  async function loadDashboard() {
    const data = await B.api('/teacher/dashboard', { authenticated: true });
    const teacher = data.teacher;
    byId('login').classList.add('hidden');
    byId('teacherStatus').classList.add('hidden');
    byId('dash').classList.remove('hidden');
    byId('teacherName').textContent = teacher.first_name + ' ' + teacher.last_name;
    byId('teacherMeta').textContent = teacher.pathway + ' · ' + teacher.email;
    byId('campus').textContent = teacher.campus;
    byId('nStudents').textContent = new Set(data.assignments.map(item => item.student_id)).size;
    byId('nSubjects').textContent = Array.isArray(teacher.subjects_json) ? teacher.subjects_json.length : 0;
    byId('nRecords').textContent = data.records.length;

    const assignedStudents = new Map();
    for (const assignment of data.assignments) {
      if (assignment.student) assignedStudents.set(assignment.student.id, assignment.student);
    }
    setOptions(byId('student'), data.assignments.filter(item => item.student).map((item, index) => ({
      value: String(index),
      label: item.student.first_name + ' ' + item.student.last_name + ' — ' + item.subject,
      studentId: item.student_id,
      subject: item.subject
    })));
    setOptions(byId('attStudent'), [...assignedStudents.values()].map(student => ({
      value: student.id, label: student.first_name + ' ' + student.last_name
    })));
    byId('recordForm').querySelector('button[type="submit"]').disabled = !data.assignments.length;
    byId('attendanceForm').querySelector('button[type="submit"]').disabled = !assignedStudents.size;
    if (!data.assignments.length) notify('portalMessage', 'Your account is approved. An administrator must assign learners and subjects before you can enter records.');
    else notify('portalMessage', '');

    const studentNames = new Map([...assignedStudents].map(([id, student]) => [id, student.first_name + ' ' + student.last_name]));
    const records = byId('records'); records.replaceChildren();
    if (!data.records.length) empty(records, 6, 'No academic records have been published yet.');
    else for (const item of data.records) {
      appendRow(records, [studentNames.get(item.student_id), item.subject, item.assessment, item.score === null ? '—' : item.score + (item.max_score ? ' / ' + item.max_score : ''), item.term, item.academic_year]);
    }
    if (!byId('year').value) byId('year').value = String(new Date().getFullYear());
    if (!byId('attDate').value) byId('attDate').value = new Date().toISOString().slice(0, 10);
  }

  byId('loginForm').addEventListener('submit', event => {
    event.preventDefault(); notify('error', '');
    withBusy(event.currentTarget.querySelector('button[type="submit"]'), async () => {
      const user = await B.signIn(byId('email').value, byId('password').value);
      byId('password').value = '';
      await openAccount(null, user);
    }, 'error');
  });
  byId('registerForm').addEventListener('submit', event => {
    event.preventDefault(); notify('registrationMessage', '');
    withBusy(event.currentTarget.querySelector('button[type="submit"]'), async () => {
      const profile = formProfile();
      const existing = B.hasSession();
      if (!existing) {
        const metadata = { teacher_application: profile };
        const user = await B.signUp(byId('teacherEmail').value, byId('teacherPassword').value, metadata, new URL('teacher-portal.html', location.href).href);
        byId('teacherPassword').value = '';
        if (!B.hasSession()) {
          notify('registrationMessage', 'Check your email to confirm the account, then return here and sign in to submit your registration for approval.');
          return;
        }
        await openAccount(profile, user);
      } else {
        await submitRegistration(profile);
      }
    }, 'registrationMessage');
  });
  byId('teacherPathway').addEventListener('change', event => {
    byId('teacherCampus').value = event.currentTarget.value === 'Cambridge' ? '25 Wilcock Road, Noordhoek' : '22 Maartens Street';
  });
  for (const id of ['logoutTeacher', 'logoutStatus']) byId(id).addEventListener('click', async () => {
    try { await B.signOut(); }
    finally { location.reload(); }
  });
  byId('recordForm').addEventListener('submit', event => {
    event.preventDefault(); notify('portalMessage', '');
    withBusy(event.currentTarget.querySelector('button[type="submit"]'), async () => {
      const option = byId('student').selectedOptions[0];
      if (!option) throw new Error('No learner and subject assignment is available.');
      const score = byId('score').value; const maxScore = byId('maxScore').value;
      await B.api('/teacher/records', {
        method: 'POST', authenticated: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: option.dataset.studentId, subject: option.dataset.subject, assessment: byId('assessment').value,
          score: score === '' ? null : Number(score), maxScore: maxScore === '' ? null : Number(maxScore),
          term: byId('term').value, academicYear: byId('year').value, comment: byId('comment').value
        })
      });
      byId('assessment').value = ''; byId('score').value = ''; byId('maxScore').value = '';
      byId('term').value = ''; byId('comment').value = '';
      notify('portalMessage', 'Academic record saved.'); await loadDashboard();
    }, 'portalMessage');
  });
  byId('attendanceForm').addEventListener('submit', event => {
    event.preventDefault(); notify('portalMessage', '');
    withBusy(event.currentTarget.querySelector('button[type="submit"]'), async () => {
      await B.api('/teacher/attendance', {
        method: 'POST', authenticated: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: byId('attStudent').value, date: byId('attDate').value,
          status: byId('attStatus').value, note: byId('attNote').value
        })
      });
      notify('portalMessage', 'Attendance saved.'); await loadDashboard();
    }, 'portalMessage');
  });

  byId('teacherCampus').value = '25 Wilcock Road, Noordhoek';
  document.querySelectorAll('[data-year]').forEach(element => { element.value = String(new Date().getFullYear()); });
  if (B?.hasSession()) {
    openAccount(null).catch(error => notify('error', error.message || 'Unable to load the teacher portal.'));
  }
})();

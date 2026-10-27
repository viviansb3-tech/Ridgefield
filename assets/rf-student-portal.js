(() => {
  'use strict';
  const B = window.RidgefieldBaas;
  const byId = id => document.getElementById(id);
  const params = new URLSearchParams(location.hash.slice(1));
  const inviteToken = params.get('invite');

  function row(table, values) {
    const tr = document.createElement('tr');
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = String(value ?? '—');
      tr.append(td);
    }
    table.append(tr);
  }
  function empty(table, columns, message) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan = columns; td.textContent = message;
    tr.append(td); table.replaceChildren(tr);
  }
  function notify(id, message) { byId(id).textContent = message; }

  async function load() {
    const profile = await B.api('/me', { authenticated: true });
    if (profile.role !== 'student') throw new Error('This account does not have student portal access.');
    const data = await B.api('/student/dashboard', { authenticated: true });
    const student = data.students[0];
    if (!student) throw new Error('No student record is linked to this account.');
    byId('login').classList.add('hidden');
    byId('dash').classList.remove('hidden');
    byId('name').textContent = student.first_name + ' ' + student.last_name;
    byId('path').textContent = student.pathway + ' · ' + student.campus;
    byId('ref').textContent = student.student_ref;
    byId('grade').textContent = student.grade;
    byId('campus').textContent = student.campus;

    const records = byId('records'); records.replaceChildren();
    if (!data.records.length) empty(records, 6, 'No academic records have been published yet.');
    else for (const item of data.records) {
      row(records, [item.subject, item.assessment, item.score === null ? '—' : item.score + (item.max_score ? ' / ' + item.max_score : ''), item.term, item.academic_year, item.comment]);
    }

    const attendance = byId('attendance'); attendance.replaceChildren();
    if (!data.attendance.length) empty(attendance, 3, 'No attendance records have been published yet.');
    else for (const item of data.attendance) row(attendance, [item.attendance_date, item.status, item.note]);
  }

  byId('loginForm').addEventListener('submit', async event => {
    event.preventDefault(); notify('error', '');
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await B.signIn(byId('email').value, byId('password').value);
      byId('password').value = '';
      await load();
    } catch (error) { notify('error', error.message || 'Sign in failed.'); }
    finally { submit.disabled = false; }
  });

  byId('activate').addEventListener('submit', async event => {
    event.preventDefault(); notify('activateError', '');
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (!inviteToken) throw new Error('This activation link is missing its invitation code.');
      const email = byId('activateEmail').value.trim();
      const password = byId('activatePassword').value;
      await B.api('/student/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inviteToken, email, password })
      });
      await B.signIn(email, password);
      byId('activatePassword').value = '';
      history.replaceState(null, '', location.pathname + location.search);
      await load();
    } catch (error) { notify('activateError', error.message || 'The account could not be activated.'); }
    finally { submit.disabled = false; }
  });

  byId('portalLogout').addEventListener('click', async () => {
    try { await B.signOut(); }
    finally { location.reload(); }
  });

  document.querySelectorAll('[data-year]').forEach(element => { element.textContent = new Date().getFullYear(); });
  if (inviteToken) {
    byId('loginForm').classList.add('hidden');
    byId('activate').classList.remove('hidden');
    byId('activateEmail').focus();
  } else if (B?.hasSession()) {
    load().catch(error => notify('error', error.message || 'Unable to load the student portal.'));
  }
})();

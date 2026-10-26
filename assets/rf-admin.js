(() => {
  'use strict';
  const B = window.RidgefieldBaas;
  const byId = id => document.getElementById(id);
  const request = (path, options = {}) => B.api(path, { ...options, authenticated: true });
  const json = (method, value) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const message = value => { byId('message').textContent = value; };
  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = String(value ?? '');
    if (className) element.className = className;
    return element;
  }
  function cell(row, value) { const td = node('td', value); row.append(td); return td; }
  function empty(table, columns, value) {
    table.replaceChildren(); const row = node('tr'); const td = cell(row, value); td.colSpan = columns; table.append(row);
  }
  function select(values, selected) {
    const result = node('select');
    for (const value of values) { const option = node('option', value); option.value = value; option.selected = value === selected; result.append(option); }
    return result;
  }
  function button(label, callback) {
    const result = node('button', label, 'btn'); result.type = 'button';
    result.addEventListener('click', () => busy(result, callback)); return result;
  }
  async function busy(control, callback) {
    if (control.disabled) return;
    control.disabled = true;
    try { await callback(); }
    catch (error) { message(error.message || 'The request could not be completed.'); }
    finally { control.disabled = false; }
  }
  async function summary() {
    const value = await request('/admin/summary');
    for (const [id, key] of [['sApps','applications'],['sPending','pending'],['sReview','review'],['sAccepted','accepted'],['sStudents','students']]) byId(id).textContent = value[key];
  }
  async function applications() {
    const status = byId('appFilter').value;
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    const number = byId('appSearch').value.trim().toUpperCase();
    if (number) query.set('number', number);
    const { applications: records } = await request('/admin/applications' + (query.size ? '?' + query.toString() : ''));
    const body = byId('appRows'); body.replaceChildren();
    if (!records.length) return empty(body, 7, 'No applications have been received yet.');
    for (const app of records) {
      const row = node('tr'); const numberCell = cell(row, app.reference);
      if (app.legacy_reference) numberCell.append(node('p', 'Previous reference: ' + app.legacy_reference, 'muted'));
      const learnerCell = cell(row, app.learner_first + ' ' + app.learner_last);
      const details = node('details'); details.append(node('summary', 'View completed application'));
      const values = node('dl');
      const payload = app.payload || {};
      for (const [key, label] of [['current-school','Current school'],['preferred-start','Preferred start'],['main-enquiry','Academic questions'],['q1','Reason for applying'],['q2','Learner confidence'],['q3','Support priority'],['q4','Preferred contact'],['q5','Response urgency'],['q6','Visit preference'],['cambridge-experience','Cambridge experience'],['cambridge-subjects','Subjects of interest'],['caps-current-grade','Current CAPS grade'],['caps-support','CAPS support'],['primary-current-grade','Current primary grade'],['primary-support','Primary support'],['document-prep-report','School report prepared'],['document-prep-id','Learner identity document prepared'],['document-prep-address','Proof of address prepared'],['document-prep-additional','Additional documents prepared']]) {
        if (payload[key]) values.append(node('dt', label), node('dd', payload[key]));
      }
      values.prepend(node('dt', 'Date of birth'), node('dd', app.dob)); details.append(values); learnerCell.append(details);
      cell(row, app.pathway); cell(row, app.learner_grade);
      cell(row, app.guardian_name + ' · ' + app.guardian_email + ' · ' + app.guardian_phone);
      const field = cell(row); const status = select(['Pending','Under Review','Documents Required','Interview','Accepted','Waitlisted','Declined','Enrolled'], app.status);
      status.setAttribute('aria-label', 'Status for ' + app.reference); field.append(status);
      field.append(button('Save', async () => { await request('/admin/applications/' + app.id, json('PATCH', { status: status.value, adminNotes: app.admin_notes })); message('Application status saved.'); await Promise.all([summary(), applications()]); }));
      if (app.status === 'Accepted') field.append(button('Enrol learner', async () => {
        const result = await request('/admin/applications/' + app.id + '/enrol', { method: 'POST' });
        message('Learner enrolled. Permanent number: ' + result.studentRef);
        await Promise.all([summary(), applications()]);
      }));
      cell(row, new Date(app.created_at).toLocaleDateString()); body.append(row);
    }
  }
  async function students() {
    const { students } = await request('/admin/students'); const body = byId('studentRows'); body.replaceChildren();
    if (!students.length) return empty(body, 6, 'No learners have been added yet.');
    for (const s of students) { const row = node('tr'); for (const v of [s.student_ref, s.first_name + ' ' + s.last_name, s.grade, s.pathway, s.campus, s.status]) cell(row, v); body.append(row); }
  }
  async function enquiries() {
    const { enquiries } = await request('/admin/enquiries'); const body = byId('enquiryRows'); body.replaceChildren();
    if (!enquiries.length) return empty(body, 5, 'No enquiries have been received yet.');
    for (const enquiry of enquiries) {
      const row = node('tr'); cell(row, enquiry.reference); cell(row, enquiry.name + ' · ' + enquiry.email + (enquiry.phone ? ' · ' + enquiry.phone : ''));
      cell(row, enquiry.subject); cell(row, enquiry.message); const field = cell(row);
      const status = select(['New','In Progress','Resolved'], enquiry.status); status.setAttribute('aria-label', 'Status for ' + enquiry.reference); field.append(status);
      field.append(button('Save', async () => { await request('/admin/enquiries/' + enquiry.id, json('PATCH', { status: status.value })); message('Enquiry status saved.'); })); body.append(row);
    }
  }
  async function content() {
    const value = await request('/admin/content'); const list = byId('contentList'); list.replaceChildren();
    if (!value.content.length) list.append(node('p', 'No content sections have been saved yet.'));
    for (const c of value.content) { const entry = node('article'); entry.append(node('h4', c.title), node('p', c.section + ' · ' + (c.published ? 'Published' : 'Draft')), node('p', c.body)); list.append(entry); }
  }
  async function documentApplications() {
    const { applications } = await request('/admin/applications'); const field = byId('documentApplication'); const value = field.value;
    field.replaceChildren(); const placeholder = node('option', 'Select an application'); placeholder.value = ''; field.append(placeholder);
    for (const app of applications) { const option = node('option', app.reference + ' · ' + app.learner_first + ' ' + app.learner_last); option.value = app.id; field.append(option); }
    field.value = value; await documents();
  }
  async function documents() {
    const body = byId('documentRows'); const appId = byId('documentApplication').value;
    if (!appId) return empty(body, 4, 'Select an application to view its documents.');
    const value = await request('/admin/documents?applicationId=' + encodeURIComponent(appId)); body.replaceChildren();
    if (!value.documents.length) return empty(body, 4, 'No documents have been uploaded for this application.');
    for (const doc of value.documents) {
      const row = node('tr'); cell(row, doc.document_type); cell(row, doc.file_name + ' · ' + Math.ceil(doc.file_size / 1024) + ' KB');
      const review = cell(row); const status = select(['Pending','Verified','Rejected','Resubmit'], doc.status); status.setAttribute('aria-label', 'Review status for ' + doc.file_name);
      const note = node('textarea'); note.value = doc.admin_note; note.setAttribute('aria-label', 'Review note for ' + doc.file_name); review.append(status, note);
      review.append(button('Save review', async () => { await request('/admin/documents/' + doc.id, json('PATCH', { status: status.value, adminNote: note.value })); message('Document review saved.'); }));
      const actions = cell(row); actions.append(button('Create viewing link', async () => {
        const { url } = await request('/admin/documents/' + doc.id + '/link'); const link = node('a', 'Open document (valid for 60 seconds)'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.append(link);
        setTimeout(() => link.remove(), 60000);
      })); body.append(row);
    }
  }
  const loaders = { dashboard: summary, applications, enquiries, students, content, documents: documentApplications };
  async function showSection(id) {
    if (!B?.hasSession()) return;
    if (!byId(id)?.classList.contains('section')) id = 'dashboard';
    document.querySelectorAll('.section').forEach(e => { e.classList.toggle('active', e.id === id); });
    document.querySelectorAll('[data-section]').forEach(e => e.classList.toggle('active', e.dataset.section === id));
    if (loaders[id]) await loaders[id]();
  }
  async function enter() {
    await request('/me'); byId('staffLogin').hidden = true; byId('staffWorkspace').hidden = false; byId('staffSide').hidden = false; byId('staffLogout').hidden = false;
    message('Signed in.'); await showSection(location.hash.slice(1) || 'dashboard');
  }
  byId('staffLoginForm').addEventListener('submit', event => {
    event.preventDefault(); busy(byId('staffSignIn'), async () => {
      message('Signing in…'); await B.signIn(byId('staffEmail').value, byId('staffPassword').value); byId('staffPassword').value = ''; await enter();
    });
  });
  byId('staffLogout').addEventListener('click', event => busy(event.currentTarget, async () => { await B.signOut(); location.reload(); }));
  document.querySelectorAll('[data-section]').forEach(e => e.addEventListener('click', () => busy(e, () => showSection(e.dataset.section))));
  byId('appFilter').addEventListener('change', () => applications().catch(e => message(e.message)));
  byId('refreshApps').addEventListener('click', event => busy(event.currentTarget, applications));
  byId('appSearch').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); applications().catch(e => message(e.message)); }
  });
  byId('refreshEnquiries').addEventListener('click', event => busy(event.currentTarget, enquiries));
  byId('documentApplication').addEventListener('change', () => documents().catch(e => message(e.message)));
  byId('addStudent').addEventListener('click', event => busy(event.currentTarget, async () => {
    await request('/admin/students', json('POST', { firstName: byId('sf').value, lastName: byId('sl').value, grade: byId('sg').value, pathway: byId('sp').value, campus: byId('sc').value, parentEmail: byId('se').value }));
    message('Learner added.'); await students();
  }));
  byId('saveContent').addEventListener('click', event => busy(event.currentTarget, async () => {
    const key = byId('ckey').value.trim(); if (!/^[a-z0-9_-]+$/.test(key)) throw new Error('Use letters, numbers and hyphens for the section key.');
    await request('/admin/content/' + key, json('PUT', { title: byId('ctitle').value, body: byId('cbody').value, published: byId('contentPublished').checked }));
    message('Content saved.'); await content();
  }));
  byId('uploadDocument').addEventListener('click', event => busy(event.currentTarget, async () => {
    const applicationId = byId('documentApplication').value; const file = byId('documentFile').files[0];
    if (!applicationId || !file) throw new Error('Select an application and a document first.');
    if (!file.size || file.size > 5242880) throw new Error('Choose a file no larger than 5 MB.');
    message('Uploading document…');
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('The file could not be read.')); reader.readAsDataURL(file); });
    await request('/admin/documents/upload', json('POST', { applicationId, fileName: file.name, documentType: byId('documentType').value, base64 }));
    byId('documentFile').value = ''; message('Document uploaded privately.'); await documents();
  }));
  if (B?.hasSession()) enter().catch(error => message(error.message));
})();

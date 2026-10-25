/**
 * Humanities Learning Portal - Frontend Application Controller
 * Strict CSP compliant: No inline styles, safe DOM manipulation.
 * Connects to authenticated backend APIs under /api/humanities/*
 */

(() => {
  "use strict";

  // Application State
  const state = {
    token: null,
    user: null,
    modules: [],
    currentModule: null,
    currentResource: null,
    activeTab: "dashboard"
  };

  // DOM Elements
  const el = {
    app: document.getElementById("hmApp"),
    loginSection: document.getElementById("hmLoginSection"),
    portalSection: document.getElementById("hmPortalSection"),
    loginForm: document.getElementById("hmLoginForm"),
    loginError: document.getElementById("hmLoginError"),
    userDisplayName: document.getElementById("hmUserDisplayName"),
    userRoleBadge: document.getElementById("hmUserRoleBadge"),
    logoutBtn: document.getElementById("hmLogoutBtn"),
    navBar: document.getElementById("hmNavBar"),
    tabDashboard: document.getElementById("tabDashboard"),
    tabTeaching: document.getElementById("tabTeaching"),
    tabAdmin: document.getElementById("tabAdmin"),
    viewDashboard: document.getElementById("viewDashboard"),
    viewModule: document.getElementById("viewModule"),
    viewReader: document.getElementById("viewReader"),
    viewTeaching: document.getElementById("viewTeaching"),
    viewAdmin: document.getElementById("viewAdmin"),
    modulesGrid: document.getElementById("hmModulesGrid"),
    moduleTitle: document.getElementById("hmModuleTitle"),
    moduleCode: document.getElementById("hmModuleCode"),
    moduleDesc: document.getElementById("hmModuleDesc"),
    moduleResourcesList: document.getElementById("hmModuleResourcesList"),
    backToDashboardBtn: document.getElementById("hmBackToDashboardBtn"),
    readerTitle: document.getElementById("hmReaderTitle"),
    readerFrame: document.getElementById("hmReaderFrame"),
    readerDownloadBtn: document.getElementById("hmReaderDownloadBtn"),
    readerPageInput: document.getElementById("hmReaderPageInput"),
    saveProgressBtn: document.getElementById("hmSaveProgressBtn"),
    progressStatus: document.getElementById("hmProgressStatus"),
    backToModuleBtn: document.getElementById("hmBackToModuleBtn"),
    uploadResourceForm: document.getElementById("hmUploadResourceForm"),
    teachingModuleSelect: document.getElementById("hmTeachingModuleSelect"),
    teachingStatusAlert: document.getElementById("hmTeachingStatusAlert"),
    adminAuditTableBody: document.getElementById("hmAdminAuditTableBody"),
    adminEnrolForm: document.getElementById("hmAdminEnrolForm"),
    adminStatusAlert: document.getElementById("hmAdminStatusAlert")
  };

  // Helper: API Fetch Wrapper
  async function api(path, options = {}) {
    options.headers = options.headers || {};
    if (state.token) {
      options.headers["Authorization"] = `Bearer ${state.token}`;
    }
    options.headers["Accept"] = "application/json";
    if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(path, options);
    let data = {};
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data;
  }

  // --- Authentication Flow ---
  async function checkAuth() {
    // Check saved token or session
    const savedToken = sessionStorage.getItem("rf_humanities_token");
    if (savedToken) {
      state.token = savedToken;
      try {
        const res = await api("/api/humanities/auth/me");
        state.user = res.user;
        showPortal();
        return;
      } catch (e) {
        state.token = null;
        sessionStorage.removeItem("rf_humanities_token");
      }
    }
    showLogin();
  }

  function showLogin() {
    el.loginSection.classList.remove("hm-hidden");
    el.portalSection.classList.add("hm-hidden");
    el.loginError.classList.add("hm-hidden");
  }

  function showPortal() {
    el.loginSection.classList.add("hm-hidden");
    el.portalSection.classList.remove("hm-hidden");
    el.userDisplayName.textContent = state.user.display_name;
    el.userRoleBadge.textContent = state.user.role.toUpperCase();

    // Toggle navigation based on role
    const isTeacherOrAdmin = state.user.role === "teacher" || state.user.role === "admin";
    const isAdmin = state.user.role === "admin";
    el.tabTeaching.classList.toggle("hm-hidden", !isTeacherOrAdmin);
    el.tabAdmin.classList.toggle("hm-hidden", !isAdmin);

    switchTab("dashboard");
    loadModules();
  }

  async function handleLogin(e) {
    e.preventDefault();
    el.loginError.classList.add("hm-hidden");
    const email = document.getElementById("hmLoginEmail").value.trim();
    const password = document.getElementById("hmLoginPassword").value;

    try {
      const res = await api("/api/humanities/auth/login", {
        method: "POST",
        body: { email, password }
      });
      state.token = res.token;
      state.user = res.user;
      sessionStorage.setItem("rf_humanities_token", res.token);
      showPortal();
    } catch (err) {
      el.loginError.textContent = err.message || "Login failed. Check your credentials.";
      el.loginError.classList.remove("hm-hidden");
    }
  }

  async function handleLogout() {
    try {
      await api("/api/humanities/auth/logout", { method: "POST" });
    } catch (e) {}
    state.token = null;
    state.user = null;
    sessionStorage.removeItem("rf_humanities_token");
    showLogin();
  }

  // --- Tab Management ---
  function switchTab(tabId) {
    state.activeTab = tabId;
    const views = [
      { id: "dashboard", btn: el.tabDashboard, view: el.viewDashboard },
      { id: "teaching", btn: el.tabTeaching, view: el.viewTeaching },
      { id: "admin", btn: el.tabAdmin, view: el.viewAdmin }
    ];

    views.forEach(v => {
      if (v.btn) {
        v.btn.setAttribute("aria-selected", v.id === tabId ? "true" : "false");
      }
      if (v.view) {
        v.view.classList.toggle("hm-hidden", v.id !== tabId);
      }
    });

    el.viewModule.classList.add("hm-hidden");
    el.viewReader.classList.add("hm-hidden");

    if (tabId === "teaching") {
      loadTeachingStudio();
    } else if (tabId === "admin") {
      loadAdminConsole();
    }
  }

  // --- Dashboard & Modules ---
  async function loadModules() {
    el.modulesGrid.innerHTML = "<p>Loading enrolled modules…</p>";
    try {
      const res = await api("/api/humanities/modules");
      state.modules = res.modules || [];
      renderModulesGrid();
    } catch (err) {
      el.modulesGrid.innerHTML = `<div class="hm-alert hm-alert-danger">Failed to load modules: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderModulesGrid() {
    if (state.modules.length === 0) {
      el.modulesGrid.innerHTML = `
        <div class="hm-card">
          <p>No active modules found for this account. Contact your academic administrator for enrolment.</p>
        </div>
      `;
      return;
    }

    el.modulesGrid.innerHTML = "";
    state.modules.forEach(m => {
      const card = document.createElement("div");
      card.className = "hm-module-card";
      card.innerHTML = `
        <div>
          <span class="hm-module-code">${escapeHtml(m.code)} &bull; ${escapeHtml(m.academic_year)}</span>
          <h3 class="hm-module-title">${escapeHtml(m.title)}</h3>
          <p class="hm-module-desc">${escapeHtml(m.description || "Core humanities syllabus.")}</p>
        </div>
        <div>
          <button type="button" class="hm-btn hm-btn-primary hm-btn-sm" data-module-id="${m.id}">
            View Module &amp; Books &rarr;
          </button>
        </div>
      `;
      card.querySelector("button").addEventListener("click", () => openModule(m.id));
      el.modulesGrid.appendChild(card);
    });
  }

  // --- Module View & Reading List ---
  async function openModule(moduleId) {
    el.viewDashboard.classList.add("hm-hidden");
    el.viewModule.classList.remove("hm-hidden");
    el.viewReader.classList.add("hm-hidden");

    el.moduleTitle.textContent = "Loading module…";
    el.moduleCode.textContent = "";
    el.moduleDesc.textContent = "";
    el.moduleResourcesList.innerHTML = "<p>Retrieving authorized reading list…</p>";

    try {
      const res = await api(`/api/humanities/modules/${moduleId}`);
      const m = res.module;
      state.currentModule = m;
      el.moduleTitle.textContent = m.title;
      el.moduleCode.textContent = `${m.code} (${m.academic_year})`;
      el.moduleDesc.textContent = m.description || "Core syllabus reading list.";

      renderResourcesList(m.resources || []);
    } catch (err) {
      el.moduleResourcesList.innerHTML = `<div class="hm-alert hm-alert-danger">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderResourcesList(resources) {
    if (resources.length === 0) {
      el.moduleResourcesList.innerHTML = "<p>No published resources currently available for this module.</p>";
      return;
    }

    el.moduleResourcesList.innerHTML = "";
    resources.forEach(r => {
      const item = document.createElement("div");
      item.className = "hm-resource-item";

      const kbSize = Math.round(r.byte_size / 1024);
      const isDraft = r.status === "draft";

      item.innerHTML = `
        <div class="hm-resource-info">
          <h4 class="hm-resource-title">${escapeHtml(r.title)}</h4>
          <span class="hm-resource-meta">
            Author: ${escapeHtml(r.author || "Department")} &bull; Year: ${escapeHtml(r.edition_year || "2026")} &bull; ${kbSize} KB
            ${isDraft ? ' <span class="hm-tag hm-tag-draft">Draft</span>' : ' <span class="hm-tag hm-tag-published">Published</span>'}
          </span>
        </div>
        <div>
          <button type="button" class="hm-btn hm-btn-primary hm-btn-sm" data-read-id="${r.id}">
            Read Online
          </button>
        </div>
      `;

      item.querySelector("button").addEventListener("click", () => openReader(r.id, r.title, r.allow_download));
      el.moduleResourcesList.appendChild(item);
    });
  }

  // --- Embedded Reader View & Progress Tracking ---
  async function openReader(resourceId, title, allowDownload) {
    el.viewModule.classList.add("hm-hidden");
    el.viewReader.classList.remove("hm-hidden");
    el.readerTitle.textContent = title;
    el.progressStatus.textContent = "";

    state.currentResource = { id: resourceId, title, allowDownload };

    // Stream URL with auth token header simulated or query parameter/direct endpoint
    const contentUrl = `/api/humanities/resources/${resourceId}/content`;
    el.readerFrame.src = contentUrl;

    if (allowDownload) {
      el.readerDownloadBtn.classList.remove("hm-hidden");
      el.readerDownloadBtn.href = contentUrl;
    } else {
      el.readerDownloadBtn.classList.add("hm-hidden");
    }

    // Load saved progress
    try {
      const res = await api(`/api/humanities/progress/${resourceId}`);
      if (res.progress && res.progress.current_page) {
        el.readerPageInput.value = res.progress.current_page;
        el.progressStatus.textContent = `Resuming at page ${res.progress.current_page}`;
      } else {
        el.readerPageInput.value = 1;
      }
    } catch (e) {
      el.readerPageInput.value = 1;
    }
  }

  async function handleSaveProgress() {
    if (!state.currentResource) return;
    const page = parseInt(el.readerPageInput.value, 10) || 1;
    el.progressStatus.textContent = "Saving progress…";
    try {
      await api("/api/humanities/progress", {
        method: "POST",
        body: { resource_id: state.currentResource.id, current_page: page, total_pages: 100 }
      });
      el.progressStatus.textContent = `Progress saved (page ${page})!`;
    } catch (err) {
      el.progressStatus.textContent = `Failed to save progress: ${err.message}`;
    }
  }

  // --- Teacher Studio (Upload & Publish) ---
  async function loadTeachingStudio() {
    el.teachingStatusAlert.classList.add("hm-hidden");
    el.teachingModuleSelect.innerHTML = "<option>Loading modules…</option>";

    try {
      const res = await api("/api/humanities/modules");
      el.teachingModuleSelect.innerHTML = "";
      res.modules.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${m.code} - ${m.title}`;
        el.teachingModuleSelect.appendChild(opt);
      });
    } catch (e) {
      el.teachingModuleSelect.innerHTML = "<option>Error loading modules</option>";
    }
  }

  async function handleUploadResource(e) {
    e.preventDefault();
    el.teachingStatusAlert.classList.add("hm-hidden");

    const moduleId = el.teachingModuleSelect.value;
    const title = document.getElementById("hmUploadTitle").value.trim();
    const author = document.getElementById("hmUploadAuthor").value.trim();
    const editionYear = document.getElementById("hmUploadYear").value.trim();
    const autoPublish = document.getElementById("hmUploadAutoPublish").checked;

    try {
      const res = await api("/api/humanities/teacher/resources", {
        method: "POST",
        body: {
          module_id: moduleId,
          title,
          author,
          edition_year: editionYear
        }
      });

      if (autoPublish) {
        await api(`/api/humanities/teacher/resources/${res.resource_id}/publish`, { method: "POST" });
      }

      el.teachingStatusAlert.className = "hm-alert hm-alert-success";
      el.teachingStatusAlert.textContent = `Resource "${title}" created successfully as ${autoPublish ? "Published" : "Draft"}!`;
      el.teachingStatusAlert.classList.remove("hm-hidden");
      el.uploadResourceForm.reset();
    } catch (err) {
      el.teachingStatusAlert.className = "hm-alert hm-alert-danger";
      el.teachingStatusAlert.textContent = `Upload failed: ${err.message}`;
      el.teachingStatusAlert.classList.remove("hm-hidden");
    }
  }

  // --- Admin Console (Enrolments & Audit) ---
  async function loadAdminConsole() {
    el.adminStatusAlert.classList.add("hm-hidden");
    el.adminAuditTableBody.innerHTML = "<tr><td colspan='4'>Loading audit events…</td></tr>";

    try {
      const res = await api("/api/humanities/admin/audit");
      renderAuditLog(res.events || []);
    } catch (err) {
      el.adminAuditTableBody.innerHTML = `<tr><td colspan='4' class='hm-alert-danger'>Error: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderAuditLog(events) {
    if (events.length === 0) {
      el.adminAuditTableBody.innerHTML = "<tr><td colspan='4'>No audit events recorded yet.</td></tr>";
      return;
    }

    el.adminAuditTableBody.innerHTML = "";
    events.forEach(ev => {
      const tr = document.createElement("tr");
      const dateStr = ev.created_at ? ev.created_at.replace("T", " ").slice(0, 19) : "-";
      tr.innerHTML = `
        <td>${escapeHtml(dateStr)}</td>
        <td><strong>${escapeHtml(ev.actor_name || "System")}</strong></td>
        <td><code>${escapeHtml(ev.action)}</code></td>
        <td><small>${escapeHtml(ev.metadata_json || "-")}</small></td>
      `;
      el.adminAuditTableBody.appendChild(tr);
    });
  }

  async function handleAdminEnrol(e) {
    e.preventDefault();
    el.adminStatusAlert.classList.add("hm-hidden");

    const studentId = document.getElementById("hmAdminStudentId").value;
    const moduleId = document.getElementById("hmAdminModuleId").value;
    const statusVal = document.getElementById("hmAdminEnrolStatus").value;

    try {
      await api("/api/humanities/admin/enrolments", {
        method: "POST",
        body: { student_id: studentId, module_id: moduleId, status: statusVal }
      });

      el.adminStatusAlert.className = "hm-alert hm-alert-success";
      el.adminStatusAlert.textContent = `Student ${studentId} successfully set to "${statusVal}" in Module ${moduleId}!`;
      el.adminStatusAlert.classList.remove("hm-hidden");
      loadAdminConsole();
    } catch (err) {
      el.adminStatusAlert.className = "hm-alert hm-alert-danger";
      el.adminStatusAlert.textContent = `Enrolment failed: ${err.message}`;
      el.adminStatusAlert.classList.remove("hm-hidden");
    }
  }

  // --- Escape Utility ---
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Event Listeners Initialization ---
  function init() {
    el.loginForm.addEventListener("submit", handleLogin);
    el.logoutBtn.addEventListener("click", handleLogout);

    el.tabDashboard.addEventListener("click", () => switchTab("dashboard"));
    el.tabTeaching.addEventListener("click", () => switchTab("teaching"));
    el.tabAdmin.addEventListener("click", () => switchTab("admin"));

    el.backToDashboardBtn.addEventListener("click", () => {
      el.viewModule.classList.add("hm-hidden");
      el.viewDashboard.classList.remove("hm-hidden");
    });

    el.backToModuleBtn.addEventListener("click", () => {
      el.viewReader.classList.add("hm-hidden");
      el.viewModule.classList.remove("hm-hidden");
    });

    el.saveProgressBtn.addEventListener("click", handleSaveProgress);
    el.uploadResourceForm.addEventListener("submit", handleUploadResource);
    el.adminEnrolForm.addEventListener("submit", handleAdminEnrol);

    // Initial Auth Check
    checkAuth();
  }

  // Bootstrap when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ============================================
   LAFORÊT — admin_script.js
   Admin meal list page
   ============================================ */

function normalizeName(value) {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

/* ════════════════════════════════════════════
   INIT — uses getAdminData (one combined call)
   ════════════════════════════════════════════ */

async function initAdminPage() {
  resetWeeklyPreferences().catch(() => {});

  const { sat, sun } = getWeekendDates();
  document.getElementById('adminSatDate').textContent    = sat;
  document.getElementById('adminSunDate').textContent    = sun;
  document.getElementById('adminDatesBadge').textContent = `${sat} — ${sun}`;

  // Show loading state immediately
  ['satList','sunList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="admin-empty">Loading…</div>';
  });

  try {
    // One combined API call returns both staff and prefs
    const res = await gasRequest('getAdminData');
    const staff = res.staff || [];
    const prefs = res.prefs  || [];

    // Apply staff to live arrays + update cache
    applyStaffList(staff);
    setCachedStaff(staff);

    // Render meal lists using the prefs we already have
    _renderFromPrefs(staff, prefs);

  } catch(e) {
    console.warn('Laforêt admin: getAdminData failed, falling back:', e.message);
    // Fallback: load staff fast (cache/fallback), then fetch prefs separately
    await loadStaffFast();
    await renderAdminLists();
  }
}

/* ════════════════════════════════════════════
   MEAL LIST RENDERING
   ════════════════════════════════════════════ */

let _cachedApps = null;

/* Render using staff + prefs already fetched (no extra API call) */
function _renderFromPrefs(staff, sheetsPrefs) {
  const prefMap = {};
  sheetsPrefs.forEach(p => { prefMap[normalizeName(p.name)] = p; });

  const apps = staff.map(s => {
    const p = prefMap[normalizeName(s.name)];
    return {
      name: s.name,
      dept: s.dept || (p ? p.dept : '') || '',
      sat:  p ? p.sat  : null,
      sun:  p ? p.sun  : null,
      note: p ? (p.note || '') : ''
    };
  });
  apps.sort((a, b) => a.name.localeCompare(b.name));
  _cachedApps = apps;

  const satAttending = apps.filter(a => a.sat === true);
  const sunAttending = apps.filter(a => a.sun === true);
  renderDayList('sat', satAttending);
  renderDayList('sun', sunAttending);
  document.getElementById('satCountBadge').textContent = `${satAttending.length} attending`;
  document.getElementById('sunCountBadge').textContent = `${sunAttending.length} attending`;
}

/* renderAdminLists — fetches prefs fresh (used after reset, fallback) */
async function getMealApplications() {
  let sheetsPrefs = [];
  try {
    const res = await gasRequest('getPrefs');
    sheetsPrefs = res.prefs || [];
  } catch(e) {
    console.warn('Laforêt admin: Could not fetch prefs:', e.message);
  }
  _renderFromPrefs(staffNames.map(n => ({ name: n, dept: staffDepartments[n] || '' })), sheetsPrefs);
  return _cachedApps;
}

async function renderAdminLists() {
  ['satList','sunList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="admin-empty">Loading…</div>';
  });
  await getMealApplications();
}

function renderDayList(day, attendees) {
  const listEl = document.getElementById(`${day}List`);
  if (!listEl) return;
  if (!attendees.length) {
    listEl.innerHTML = '<div class="admin-empty">No responses yet</div>';
    return;
  }
  listEl.innerHTML = attendees.map((person, idx) => {
    const initials     = person.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const hasNote  = person.note && person.note.trim();
    const noteText = hasNote ? 'Note: ' + person.note.trim() : '';
    const subLine  = (person.dept || '') + (person.dept && noteText ? ' — ' : '') + noteText || person.dept || '';
    return `
      <div class="admin-staff-row" style="animation-delay:${idx * 0.05}s;">
        <div class="admin-staff-num">${idx + 1}</div>
        <div class="admin-staff-avatar">${initials}</div>
        <div class="admin-staff-info">
          <div class="admin-staff-name">${person.name}</div>
          <div class="admin-staff-note">${subLine}</div>
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════════
   STAFF LIST MODAL
   ════════════════════════════════════════════ */

let _slAllStaff = [];

function openStaffListModal() {
  document.getElementById('staffListOverlay').classList.add('open');
  document.getElementById('slNameInput').value   = '';
  document.getElementById('slDeptInput').value   = '';
  document.getElementById('slSearchInput').value = '';
  _slShowMsg('', '');
  slBuildList();
  setTimeout(() => document.getElementById('slNameInput').focus(), 80);
}

function closeStaffListModal(event) {
  if (event && event.target !== document.getElementById('staffListOverlay')) return;
  document.getElementById('staffListOverlay').classList.remove('open');
}

function slBuildList() {
  _slAllStaff = staffNames
    .map(name => ({ name, dept: staffDepartments[name] || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  slRenderList(_slAllStaff);
}

function slRenderList(staff) {
  const listEl  = document.getElementById('slList');
  const countEl = document.getElementById('slCount');
  if (!listEl) return;

  countEl.textContent = staff.length + ' staff member' + (staff.length !== 1 ? 's' : '');

  if (!staff.length) {
    listEl.innerHTML = '<div class="admin-empty">No staff found</div>';
    return;
  }

  listEl.innerHTML = staff.map(function(s, idx) {
    const initials = s.name.split(' ').map(function(w){ return w[0]; }).join('').slice(0, 2).toUpperCase();
    const safeName = s.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<div class="sl-staff-row" style="animation-delay:' + (idx * 0.03) + 's;">' +
      '<div class="sl-avatar">' + initials + '</div>' +
      '<div class="sl-info">' +
        '<div class="sl-name">' + s.name + '</div>' +
        '<div class="sl-dept">' + (s.dept || '—') + '</div>' +
      '</div>' +
      '<button class="sl-delete-btn" title="Remove ' + s.name + '" onclick="slDeleteStaff(\'' + safeName + '\')">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
        '</svg>' +
      '</button>' +
    '</div>';
  }).join('');
}

function slFilterList() {
  const val = (document.getElementById('slSearchInput').value || '').trim().toLowerCase();
  if (!val) { slRenderList(_slAllStaff); return; }
  const filtered = _slAllStaff.filter(function(s) {
    return s.name.toLowerCase().includes(val) || s.dept.toLowerCase().includes(val);
  });
  slRenderList(filtered);
}

async function slAddStaff() {
  const nameInput = document.getElementById('slNameInput');
  const deptInput = document.getElementById('slDeptInput');
  const name = nameInput.value.trim();
  const dept = deptInput.value.trim();

  if (!name) { _slShowMsg('Please enter a staff name', 'err'); nameInput.focus(); return; }
  if (!dept) { _slShowMsg('Please select a department', 'err'); deptInput.focus(); return; }

  const dupe = staffNames.find(function(n){ return normalizeName(n) === normalizeName(name); });
  if (dupe) { _slShowMsg('Staff already exists', 'err'); return; }

  const addBtn = document.querySelector('.sl-add-btn');
  if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Saving…'; }

  try {
    const res = await gasRequest('addStaff', { name, dept });
    // Server returns updated staff list — apply it directly
    if (res.staff) {
      applyStaffList(res.staff);
      setCachedStaff(res.staff);
    } else {
      // Fallback: manually push
      staffNames.push(name);
      staffDepartments[name] = dept;
    }
    nameInput.value = '';
    deptInput.value = '';
    _slShowMsg(name + ' added successfully', 'ok');
    slBuildList();
    await renderAdminLists();
  } catch(e) {
    _slShowMsg('Error: ' + e.message, 'err');
  } finally {
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add';
    }
  }
}

async function slDeleteStaff(name) {
  if (!confirm('Remove ' + name + ' from the staff list?\nTheir meal choices will also be deleted.')) return;

  const normalizedName = normalizeName(name);
  try {
    const res = await gasRequest('deleteStaff', { name });
    // Server returns updated staff list — apply it directly
    if (res.staff) {
      applyStaffList(res.staff);
      setCachedStaff(res.staff);
    } else {
      // Fallback: manually remove
      const idx = staffNames.findIndex(function(n){ return normalizeName(n) === normalizedName; });
      if (idx >= 0) staffNames.splice(idx, 1);
      const deptKey = Object.keys(staffDepartments).find(function(k){ return normalizeName(k) === normalizedName; });
      if (deptKey) delete staffDepartments[deptKey];
    }
    _slShowMsg(name + ' removed', 'ok');
    slBuildList();
    await renderAdminLists();
  } catch(e) {
    _slShowMsg('Error: ' + e.message, 'err');
  }
}

function _slShowMsg(text, type) {
  const el = document.getElementById('slMsg');
  if (!el) return;
  el.textContent = text;
  el.className = 'sl-msg' + (type === 'ok' ? ' visible-ok' : type === 'err' ? ' visible-err' : '');
  if (text) setTimeout(function(){ el.className = 'sl-msg'; }, 3500);
}

/* ════════════════════════════════════════════
   TEST RESET
   ════════════════════════════════════════════ */

async function testWeeklyReset() {
  if (!confirm('Reset all Saturday/Sunday choices now?\nNotes, staff names, and departments will not be affected.')) return;
  try {
    await forceResetPreferences();
    await renderAdminLists();
    const { sat, sun } = getWeekendDates();
    document.getElementById('adminSatDate').textContent    = sat;
    document.getElementById('adminSunDate').textContent    = sun;
    document.getElementById('adminDatesBadge').textContent = `${sat} — ${sun}`;
    alert('Reset complete. All Saturday/Sunday meal choices have been cleared.');
  } catch(e) {
    alert('Reset failed: ' + e.message);
  }
}

/* ════════════════════════════════════════════
   PRINT
   ════════════════════════════════════════════ */

function printMealList(day) {
  const doprint = (apps) => {
    const { sat, sun } = getWeekendDates();
    const sections = [];
    if (day === 'sat' || day === 'both') sections.push(buildPrintSection('Saturday', sat, apps.filter(a => a.sat === true)));
    if (day === 'sun' || day === 'both') sections.push(buildPrintSection('Sunday',   sun, apps.filter(a => a.sun === true)));
    const today = new Date().toLocaleDateString('en-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    document.getElementById('printSection').innerHTML = `
      <div class="print-doc-header">
        <div class="print-restaurant">La Forêt</div>
        <div class="print-title">Staff Meal List</div>
        <div class="print-date-line">Generated ${today}</div>
      </div>
      ${sections.join('')}
      <div class="print-footer">Laforêt · Staff Access Only · Confidential</div>`;
    window.print();
  };

  if (_cachedApps) {
    doprint(_cachedApps);
  } else {
    getMealApplications().then(() => doprint(_cachedApps)).catch(e => alert('Could not load data for printing: ' + e.message));
  }
}

function buildPrintSection(dayName, dateStr, people) {
  const rows = people.length
    ? people.map((p, i) => {
        const hasNote  = p.note && p.note.trim();
        const noteText = hasNote ? 'Note: ' + p.note.trim() : '';
        const infoText = (p.dept || '') + (p.dept && noteText ? ' — ' : '') + noteText || p.dept || '';
        return `<div class="print-staff-row">
          <div class="print-num">${i+1}.</div>
          <div class="print-line">
            <span class="print-name">${p.name}</span>
            <span class="print-dash"> — </span>
            <span class="print-note">${infoText}</span>
          </div>
        </div>`;
      }).join('')
    : '<div class="print-empty">No staff attending</div>';
  return `<div class="print-day-section">
    <div class="print-day-heading"><span>${dayName}</span><span class="print-day-count">${dateStr} · ${people.length} attending</span></div>
    ${rows}
  </div>`;
}

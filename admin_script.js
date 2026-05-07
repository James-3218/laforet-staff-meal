/* ============================================
   LAFORÊT — admin_script.js
   Admin meal list page
   ============================================ */

/* ════════════════════════════════════════════
   LOCAL STAFF MANAGEMENT (extra/deleted)
   Still uses localStorage for the staff list
   itself — only meal *choices* go to Sheets.
   ════════════════════════════════════════════ */

function normalizeName(value) {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

/* All active staff = base staffNames + extra from Sheets, minus deleted */
function getActiveStaffNames() {
  // staffNames and staffDepartments are already updated by loadExtraStaff()
  // which runs in initAdminPage → they already exclude deleted and include extra
  return [...staffNames];
}

function getAllDepartments() {
  return { ...staffDepartments };
}

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */

async function initAdminPage() {
  // Load staff list from Sheets (merges extra/deleted into live arrays)
  await loadExtraStaff();

  const { sat, sun } = getWeekendDates();
  document.getElementById('adminSatDate').textContent  = sat;
  document.getElementById('adminSunDate').textContent  = sun;
  document.getElementById('adminDatesBadge').textContent = `${sat} — ${sun}`;

  await renderAdminLists();
  initModalAutocomplete();
}

/* ════════════════════════════════════════════
   MEAL APPLICATIONS — fetched from Sheets
   ════════════════════════════════════════════ */

// Cache so print doesn't need a second fetch
let _cachedApps = null;

async function getMealApplications() {
  const depts   = getAllDepartments();
  const deleted = []; // already excluded by loadExtraStaff

  let sheetsPrefs = [];
  try {
    const res = await gasRequest('getPrefs');
    sheetsPrefs = res.prefs || [];
  } catch(e) {
    console.warn('Laforêt admin: Could not fetch prefs:', e.message);
  }

  // Build map: normalizedName → pref
  const prefMap = {};
  sheetsPrefs.forEach(p => {
    prefMap[normalizeName(p.name)] = p;
  });

  // Build full list from active staff
  const apps = staffNames.map(name => {
    const p = prefMap[normalizeName(name)];
    return {
      name,
      dept: depts[name] || (p ? p.dept : '') || '',
      sat:  p ? p.sat  : null,
      sun:  p ? p.sun  : null,
      note: p ? (p.note || '') : ''
    };
  });

  apps.sort((a, b) => a.name.localeCompare(b.name));
  _cachedApps = apps;
  return apps;
}

async function renderAdminLists() {
  // Show loading state
  ['satList','sunList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="admin-empty">Loading…</div>';
  });

  const apps        = await getMealApplications();
  const satAttending = apps.filter(a => a.sat === true);
  const sunAttending = apps.filter(a => a.sun === true);

  renderDayList('sat', satAttending);
  renderDayList('sun', sunAttending);
  document.getElementById('satCountBadge').textContent = `${satAttending.length} attending`;
  document.getElementById('sunCountBadge').textContent = `${sunAttending.length} attending`;
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
    const allergyLabel = person.note && person.note.trim() ? person.note.trim() : 'No allergy noted';
    const subLine      = `${person.dept || ''}${person.dept ? ' — ' : ''}Allergy: ${allergyLabel}`;
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
   ADD STAFF MODAL
   ════════════════════════════════════════════ */

function openAddStaffModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalNameInput').value = '';
  document.getElementById('modalDeptInput').value = '';
  closeModalSuggestions();
  setTimeout(() => document.getElementById('modalNameInput').focus(), 50);
}

function closeAddStaffModal(event) {
  if (event && event.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
}

async function saveAdminStaff() {
  const nameInput = document.getElementById('modalNameInput');
  const deptInput = document.getElementById('modalDeptInput');
  const name = nameInput.value.trim();
  const dept = deptInput.value.trim();

  if (!name) { alert('Please enter staff name'); nameInput.focus(); return; }
  if (!dept) { alert('Please select department'); deptInput.focus(); return; }

  // Duplicate check against current live arrays
  const normalizedNew = normalizeName(name);
  const duplicate = staffNames.find(n => normalizeName(n) === normalizedNew);
  if (duplicate) { alert('Staff already exists'); return; }

  try {
    await gasRequest('addStaff', { name, dept });

    // Push into live arrays for this session
    staffNames.push(name);
    staffDepartments[name] = dept;

    document.getElementById('modalOverlay').classList.remove('open');
    await renderAdminLists();
    alert('Staff saved');
  } catch(e) {
    alert('Error saving staff: ' + e.message);
  }
}

/* ── Modal autocomplete ── */
function initModalAutocomplete() {
  const input        = document.getElementById('modalNameInput');
  const suggestionsEl = document.getElementById('modalSuggestions');
  if (!input || !suggestionsEl) return;
  let highlighted   = -1;
  let filteredNames = [];

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    if (!val) { closeModalSuggestions(); return; }
    const allNames = getActiveStaffNames();
    filteredNames  = allNames.filter(n => n.toLowerCase().includes(val));
    if (!filteredNames.length) { closeModalSuggestions(); return; }
    highlighted = -1;
    suggestionsEl.innerHTML = filteredNames.map(n => {
      const initials = n.split(' ').map(w => w[0]).join('').slice(0, 2);
      return `<div class="suggestion-item" onclick="selectModalName('${n.replace(/'/g,"\\'")}')">
        <div class="suggestion-avatar">${initials}</div>${n}
      </div>`;
    }).join('');
    suggestionsEl.classList.add('open');
    const deptMap = getAllDepartments();
    const exact   = Object.keys(deptMap).find(k => k.toLowerCase() === val);
    if (exact && deptMap[exact]) document.getElementById('modalDeptInput').value = deptMap[exact];
  });

  input.addEventListener('keydown', (e) => {
    const items = suggestionsEl.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown')  { e.preventDefault(); highlighted = Math.min(highlighted+1, items.length-1); items.forEach((el,i) => el.classList.toggle('highlighted', i===highlighted)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(highlighted-1, -1); items.forEach((el,i) => el.classList.toggle('highlighted', i===highlighted)); }
    else if (e.key === 'Enter')   { e.preventDefault(); if (highlighted>=0 && filteredNames[highlighted]) selectModalName(filteredNames[highlighted]); }
    else if (e.key === 'Escape')  closeModalSuggestions();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#modalNameInput') && !e.target.closest('#modalSuggestions')) closeModalSuggestions();
  });
}

window.selectModalName = function(name) {
  document.getElementById('modalNameInput').value = name;
  closeModalSuggestions();
  const deptMap = getAllDepartments();
  if (deptMap[name]) document.getElementById('modalDeptInput').value = deptMap[name];
  document.getElementById('modalNameInput').focus();
};

function closeModalSuggestions() {
  const el = document.getElementById('modalSuggestions');
  if (el) { el.classList.remove('open'); el.innerHTML = ''; }
}

/* ════════════════════════════════════════════
   DELETE STAFF MODAL
   ════════════════════════════════════════════ */

function openDeleteStaffModal() {
  populateDeleteSelect();
  document.getElementById('deleteModalOverlay').classList.add('open');
}

function populateDeleteSelect() {
  const select     = document.getElementById('deleteStaffSelect');
  if (!select) return;
  const activeNames = getActiveStaffNames().sort((a, b) => a.localeCompare(b));
  const deptMap     = getAllDepartments();
  select.innerHTML  = '<option value="" disabled selected>Select staff to delete</option>';
  if (!activeNames.length) {
    select.innerHTML += '<option disabled>No active staff found</option>';
  } else {
    activeNames.forEach(name => {
      const dept = deptMap[name] || '';
      const opt  = document.createElement('option');
      opt.value       = name;
      opt.textContent = dept ? `${name} — ${dept}` : name;
      select.appendChild(opt);
    });
  }
}

function closeDeleteStaffModal(event) {
  if (event && event.target !== document.getElementById('deleteModalOverlay')) return;
  document.getElementById('deleteModalOverlay').classList.remove('open');
}

async function confirmDeleteStaff() {
  const select = document.getElementById('deleteStaffSelect');
  const name   = select ? select.value : '';
  if (!name) { alert('Please select staff'); return; }

  const normalizedName = normalizeName(name);
  const found = staffNames.find(n => normalizeName(n) === normalizedName);
  if (!found) { alert('Staff not found'); return; }

  try {
    await gasRequest('deleteStaff', { name });

    // Remove from live arrays
    const idx = staffNames.findIndex(n => normalizeName(n) === normalizedName);
    if (idx >= 0) staffNames.splice(idx, 1);
    const deptKey = Object.keys(staffDepartments).find(k => normalizeName(k) === normalizedName);
    if (deptKey) delete staffDepartments[deptKey];

    document.getElementById('deleteModalOverlay').classList.remove('open');
    await renderAdminLists();
    alert('Staff deleted');
  } catch(e) {
    alert('Error deleting staff: ' + e.message);
  }
}

/* ════════════════════════════════════════════
   TEST RESET (admin button)
   ════════════════════════════════════════════ */

async function testWeeklyReset() {
  if (!confirm('Reset all Saturday/Sunday choices now?\nNotes, staff names, and departments will not be affected.')) return;
  try {
    await forceResetPreferences(); // defined in script.js
    await renderAdminLists();
    const { sat, sun } = getWeekendDates();
    document.getElementById('adminSatDate').textContent  = sat;
    document.getElementById('adminSunDate').textContent  = sun;
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
  // Use cached apps if available, otherwise fetch
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
    getMealApplications().then(doprint).catch(e => alert('Could not load data for printing: ' + e.message));
  }
}

function buildPrintSection(dayName, dateStr, people) {
  const rows = people.length
    ? people.map((p, i) => {
        const allergyText = p.note && p.note.trim() ? p.note.trim() : 'No allergy noted';
        const infoText    = `${p.dept || ''}${p.dept ? ' — ' : ''}Allergy: ${allergyText}`;
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

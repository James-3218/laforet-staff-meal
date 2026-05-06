/* ============================================
   LAFORÊT — admin_script.js
   Admin meal list page
   ============================================ */

/* ════════════════════════════════════════════
   LOCALSTORAGE HELPERS
   ════════════════════════════════════════════ */

function getExtraStaff() {
  try { return JSON.parse(localStorage.getItem('laforet_extra_staff') || '[]'); }
  catch(e) { return []; }
}
function saveExtraStaff(list) {
  localStorage.setItem('laforet_extra_staff', JSON.stringify(list));
}

function getDeletedStaff() {
  try { return JSON.parse(localStorage.getItem('laforet_deleted_staff') || '[]'); }
  catch(e) { return []; }
}
function saveDeletedStaff(list) {
  localStorage.setItem('laforet_deleted_staff', JSON.stringify(list));
}

/* Normalize: lowercase + strip all whitespace for comparison */
function normalizeName(value) {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

/* All active staff = base staffNames + extra, minus deleted */
function getActiveStaffNames() {
  const deleted = getDeletedStaff().map(n => n.toLowerCase());
  const base = staffNames.filter(n => !deleted.includes(n.toLowerCase()));
  const extra = getExtraStaff()
    .filter(s => !deleted.includes(s.name.toLowerCase()))
    .map(s => s.name);
  // deduplicate
  const seen = new Set();
  return [...base, ...extra].filter(n => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function getAllDepartments() {
  const deleted = getDeletedStaff().map(n => n.toLowerCase());
  const combined = {};
  Object.keys(staffDepartments).forEach(k => {
    if (!deleted.includes(k.toLowerCase())) combined[k] = staffDepartments[k];
  });
  getExtraStaff()
    .filter(s => !deleted.includes(s.name.toLowerCase()))
    .forEach(s => { combined[s.name] = s.dept; });
  return combined;
}

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */

function initAdminPage() {
  // Load extra/deleted staff and run weekly reset if needed
  if (typeof resetWeeklyPreferences === 'function') resetWeeklyPreferences();
  if (typeof loadExtraStaff === 'function') loadExtraStaff();

  const { sat, sun } = getWeekendDates();
  document.getElementById('adminSatDate').textContent = sat;
  document.getElementById('adminSunDate').textContent = sun;
  document.getElementById('adminDatesBadge').textContent = `${sat} — ${sun}`;
  renderAdminLists();
  initModalAutocomplete();
}

/* ════════════════════════════════════════════
   MEAL APPLICATIONS
   ════════════════════════════════════════════ */

function getMealApplications() {
  const depts = getAllDepartments();
  const deleted = getDeletedStaff().map(n => n.toLowerCase());
  const seen = new Set();
  const apps = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('laforet_pref_')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      let displayName = data.name;
      if (!displayName) {
        const rawName = key.replace('laforet_pref_', '');
        displayName = rawName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      if (deleted.includes(displayName.toLowerCase())) continue;
      const dept = data.dept || depts[displayName] || '';
      seen.add(displayName.toLowerCase());
      apps.push({ name: displayName, dept, sat: data.sat ?? null, sun: data.sun ?? null, note: data.note || '' });
    } catch(e) {}
  }

  // Include extra staff with no pref yet
  getExtraStaff()
    .filter(s => !deleted.includes(s.name.toLowerCase()) && !seen.has(s.name.toLowerCase()))
    .forEach(s => apps.push({ name: s.name, dept: s.dept, sat: null, sun: null, note: '' }));

  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

function renderAdminLists() {
  const apps = getMealApplications();
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
    const initials = person.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const allergyLabel = person.note && person.note.trim() ? person.note.trim() : 'No allergy noted';
    const subLine = `${person.dept || ''}${person.dept ? ' — ' : ''}Allergy: ${allergyLabel}`;
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

function saveAdminStaff() {
  const nameInput = document.getElementById('modalNameInput');
  const deptInput = document.getElementById('modalDeptInput');
  const name = nameInput.value.trim();
  const dept = deptInput.value.trim();

  // Validation
  if (!name) {
    alert('Please enter staff name');
    nameInput.focus();
    return;
  }
  if (!dept) {
    alert('Please select department');
    deptInput.focus();
    return;
  }

  // Duplicate check — normalized name match across all active staff
  const normalizedNew = normalizeName(name);
  const activeNames = getActiveStaffNames();
  const duplicate = activeNames.find(n => normalizeName(n) === normalizedNew);
  if (duplicate) {
    alert('Staff already exists');
    return;
  }

  // Save to laforet_extra_staff
  const extra = getExtraStaff();
  extra.push({ name, dept });
  saveExtraStaff(extra);

  // Push into live arrays for this session
  if (!staffNames.find(n => normalizeName(n) === normalizedNew)) {
    staffNames.push(name);
  }
  staffDepartments[name] = dept;

  // Remove from deleted list if re-adding a previously deleted name
  const delList = getDeletedStaff().filter(n => normalizeName(n) !== normalizedNew);
  saveDeletedStaff(delList);

  // Save pref entry
  const prefKey = `laforet_pref_${name.toLowerCase().replace(/\s+/g, '_')}`;
  const existing = JSON.parse(localStorage.getItem(prefKey) || '{}');
  localStorage.setItem(prefKey, JSON.stringify({
    ...existing, name, dept,
    sat: existing.sat ?? null,
    sun: existing.sun ?? null,
    note: existing.note || '',
    savedAt: existing.savedAt || new Date().toISOString()
  }));

  // Close modal, refresh, alert
  document.getElementById('modalOverlay').classList.remove('open');
  renderAdminLists();
  alert('Staff saved');
}

/* ── Modal autocomplete ── */
function initModalAutocomplete() {
  const input = document.getElementById('modalNameInput');
  const suggestionsEl = document.getElementById('modalSuggestions');
  if (!input || !suggestionsEl) return;
  let highlighted = -1;
  let filteredNames = [];

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    if (!val) { closeModalSuggestions(); return; }
    const allNames = getActiveStaffNames();
    filteredNames = allNames.filter(n => n.toLowerCase().includes(val));
    if (!filteredNames.length) { closeModalSuggestions(); return; }
    highlighted = -1;
    suggestionsEl.innerHTML = filteredNames.map(n => {
      const initials = n.split(' ').map(w => w[0]).join('').slice(0, 2);
      return `<div class="suggestion-item" onclick="selectModalName('${n.replace(/'/g, "\\'")}')">
        <div class="suggestion-avatar">${initials}</div>${n}
      </div>`;
    }).join('');
    suggestionsEl.classList.add('open');
    // Auto-fill department if known
    const deptMap = getAllDepartments();
    const exact = Object.keys(deptMap).find(k => k.toLowerCase() === val);
    if (exact && deptMap[exact]) document.getElementById('modalDeptInput').value = deptMap[exact];
  });

  input.addEventListener('keydown', (e) => {
    const items = suggestionsEl.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); highlighted = Math.min(highlighted+1, items.length-1); items.forEach((el,i)=>el.classList.toggle('highlighted',i===highlighted)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlighted = Math.max(highlighted-1,-1); items.forEach((el,i)=>el.classList.toggle('highlighted',i===highlighted)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (highlighted>=0 && filteredNames[highlighted]) selectModalName(filteredNames[highlighted]); }
    else if (e.key === 'Escape') closeModalSuggestions();
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
  const select = document.getElementById('deleteStaffSelect');
  if (!select) return;

  const activeNames = getActiveStaffNames().sort((a, b) => a.localeCompare(b));
  const deptMap = getAllDepartments();

  select.innerHTML = '<option value="" disabled selected>Select staff to delete</option>';
  if (!activeNames.length) {
    select.innerHTML += '<option disabled>No active staff found</option>';
  } else {
    activeNames.forEach(name => {
      const dept = deptMap[name] || '';
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = dept ? `${name} — ${dept}` : name;
      select.appendChild(opt);
    });
  }
}

function closeDeleteStaffModal(event) {
  if (event && event.target !== document.getElementById('deleteModalOverlay')) return;
  document.getElementById('deleteModalOverlay').classList.remove('open');
}

function confirmDeleteStaff() {
  const select = document.getElementById('deleteStaffSelect');
  const name = select ? select.value : '';

  if (!name) {
    alert('Please select staff');
    return;
  }

  const normalizedName = normalizeName(name);

  // Verify staff exists in active list
  const activeNames = getActiveStaffNames();
  const found = activeNames.find(n => normalizeName(n) === normalizedName);
  if (!found) {
    alert('Staff not found');
    return;
  }

  // 1. Remove from laforet_extra_staff if admin-added
  const extra = getExtraStaff().filter(s => normalizeName(s.name) !== normalizedName);
  saveExtraStaff(extra);

  // 2. If base staff, add to laforet_deleted_staff
  const isBase = staffNames.some(n => normalizeName(n) === normalizedName);
  if (isBase) {
    const delList = getDeletedStaff();
    if (!delList.find(n => normalizeName(n) === normalizedName)) {
      delList.push(name);
      saveDeletedStaff(delList);
    }
  }

  // 3. Remove from live arrays this session
  const idx = staffNames.findIndex(n => normalizeName(n) === normalizedName);
  if (idx >= 0) staffNames.splice(idx, 1);
  const deptKey = Object.keys(staffDepartments).find(k => normalizeName(k) === normalizedName);
  if (deptKey) delete staffDepartments[deptKey];

  // 4. Remove pref entry from localStorage
  const prefKey = `laforet_pref_${name.toLowerCase().replace(/\s+/g, '_')}`;
  localStorage.removeItem(prefKey);

  // 5. Close modal, refresh, alert
  document.getElementById('deleteModalOverlay').classList.remove('open');
  renderAdminLists();
  alert('Staff deleted');
}

/* ════════════════════════════════════════════
   TEST RESET (admin button)
   ════════════════════════════════════════════ */

function testWeeklyReset() {
  if (!confirm('Reset all Saturday/Sunday choices now? Notes, staff names, and departments will not be affected.')) return;
  forceResetPreferences(); // defined in script.js
  // Refresh the admin list to reflect cleared choices
  renderAdminLists();
  // Re-display dates in case they updated
  const { sat, sun } = getWeekendDates();
  document.getElementById('adminSatDate').textContent = sat;
  document.getElementById('adminSunDate').textContent = sun;
  document.getElementById('adminDatesBadge').textContent = `${sat} — ${sun}`;
  alert('Reset complete. All Saturday/Sunday meal choices have been cleared.');
}



function printMealList(day) {
  const apps = getMealApplications();
  const { sat, sun } = getWeekendDates();
  const sections = [];
  if (day === 'sat' || day === 'both') sections.push(buildPrintSection('Saturday', sat, apps.filter(a => a.sat === true)));
  if (day === 'sun' || day === 'both') sections.push(buildPrintSection('Sunday', sun, apps.filter(a => a.sun === true)));
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
}

function buildPrintSection(dayName, dateStr, people) {
  const rows = people.length
    ? people.map((p,i) => {
        const allergyText = p.note && p.note.trim() ? p.note.trim() : 'No allergy noted';
        const infoText = `${p.dept || ''}${p.dept ? ' — ' : ''}Allergy: ${allergyText}`;
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

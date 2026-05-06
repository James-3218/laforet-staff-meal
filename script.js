/* ============================================
   LAFORÊT STAFF MEAL — script.js
   Handles both login (index.html) and
   personal preference page (staff.html)
   ============================================ */

const staffNames = [
  "Jeolita",
  "Maha Marzi",
  "Noriko",
  "Yohan",
  "Sima Kokabian",
  "Sumu Sharma",
  "Umesh Ranasingha",
  "Alexander Bangoy",
  "Dan B Kil",
  "George Jose Abaygar",
  "Hanbin Chung",
  "Heesue Choi",
  "Jeongwoo",
  "Kayla Moon",
  "Miradee Chua",
  "Seoyeun Joanna Bae",
  "Trishita",
  "Wonhyeok Cho",
  "Yena Kim",
  "Yisol Han",
  "Dabin Shin",
  "Hyangmi Kim",
  "Inhoo Choi",
  "Joyce Danielle Pamilar",
  "Sam K Lee",
  "Saurabh Rana",
  "Taekyung Han",
  "Tristin James Louis",
  "Wonju Choi",
  "Ben",
  "Eunho Park"
];

const staffDepartments = {
  "Jeolita": "Bakery",
  "Maha Marzi": "Bakery",
  "Noriko": "Bakery",
  "Yohan": "Bakery",
  "Sima Kokabian": "Dish",
  "Sumu Sharma": "Dish",
  "Umesh Ranasingha": "Dish",
  "Alexander Bangoy": "FOH",
  "Dan B Kil": "FOH",
  "George Jose Abaygar": "FOH",
  "Hanbin Chung": "FOH",
  "Heesue Choi": "FOH",
  "Jeongwoo": "FOH",
  "Kayla Moon": "FOH",
  "Miradee Chua": "FOH",
  "Seoyeun Joanna Bae": "FOH",
  "Trishita": "FOH",
  "Wonhyeok Cho": "FOH",
  "Yena Kim": "FOH",
  "Yisol Han": "FOH",
  "Dabin Shin": "Kitchen",
  "Hyangmi Kim": "Kitchen",
  "Inhoo Choi": "Kitchen",
  "Joyce Danielle Pamilar": "Kitchen",
  "Sam K Lee": "Kitchen",
  "Saurabh Rana": "Kitchen",
  "Taekyung Han": "Kitchen",
  "Tristin James Louis": "Kitchen",
  "Wonju Choi": "Kitchen",
  "Ben": "Store Support",
  "Eunho Park": "Store Support"
};

/* ──────────────────────────────────────────
   LOGIN PAGE
   ────────────────────────────────────────── */


/* ──────────────────────────────────────────
   WEEKLY RESET (every Monday)
   ────────────────────────────────────────── */

function resetWeeklyPreferences() {
  try {
    const now = new Date();
    // Only run on Mondays (day === 1)
    if (now.getDay() !== 1) return;
    // Build a "Monday date string" like "2025-01-06" to track per-Monday resets
    const mondayKey = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const lastReset = localStorage.getItem('laforet_last_reset');
    // Already ran today → skip
    if (lastReset === mondayKey) return;
    const keysToReset = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('laforet_pref_')) keysToReset.push(key);
    }
    keysToReset.forEach(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        data.sat = null;
        data.sun = null;
        data.savedAt = new Date().toISOString();
        localStorage.setItem(key, JSON.stringify(data));
      } catch(e) {}
    });
    localStorage.setItem('laforet_last_reset', mondayKey);
    console.log('Laforêt: Weekly Monday reset done');
  } catch(e) {}
}

/* Force-reset for admin test button — clears all sat/sun choices immediately */
function forceResetPreferences() {
  try {
    const keysToReset = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('laforet_pref_')) keysToReset.push(key);
    }
    keysToReset.forEach(key => {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        data.sat = null;
        data.sun = null;
        data.savedAt = new Date().toISOString();
        localStorage.setItem(key, JSON.stringify(data));
      } catch(e) {}
    });
    // Clear the reset lock so real Monday reset can still fire
    localStorage.removeItem('laforet_last_reset');
    console.log('Laforêt: Force reset done');
  } catch(e) {}
}

/* Load any admin-added staff from localStorage into live arrays */
function loadExtraStaff() {
  resetWeeklyPreferences();
  try {
    // Load deleted list first
    const deleted = JSON.parse(localStorage.getItem('laforet_deleted_staff') || '[]')
      .map(n => n.toLowerCase());

    // Remove base staff that have been deleted
    for (let i = staffNames.length - 1; i >= 0; i--) {
      if (deleted.includes(staffNames[i].toLowerCase())) {
        staffNames.splice(i, 1);
      }
    }
    deleted.forEach(n => {
      const k = Object.keys(staffDepartments).find(k => k.toLowerCase() === n);
      if (k) delete staffDepartments[k];
    });

    // Add admin-added extra staff (skip if deleted)
    const extra = JSON.parse(localStorage.getItem('laforet_extra_staff') || '[]');
    extra.forEach(s => {
      if (!s.name || deleted.includes(s.name.toLowerCase())) return;
      if (!staffNames.find(n => n.toLowerCase() === s.name.toLowerCase())) {
        staffNames.push(s.name);
      }
      if (s.dept) staffDepartments[s.name] = s.dept;
    });
  } catch(e) {}
}

function initLogin() {
  loadExtraStaff();
  const input        = document.getElementById('nameInput');
  const suggestionsEl = document.getElementById('suggestions');
  const validationMsg = document.getElementById('validationMsg');

  if (!input) return;

  let highlighted = -1;
  let filteredNames = [];

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    validationMsg.classList.remove('visible');
    if (!val || val.length < 3) { closeSuggestions(); return; }
    filteredNames = staffNames.filter(n => n.toLowerCase().includes(val));
    renderSuggestions(filteredNames);
  });

  input.addEventListener('keydown', (e) => {
    const items = suggestionsEl.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, items.length - 1);
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, -1);
      updateHighlight(items);
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && items[highlighted]) selectName(filteredNames[highlighted]);
      else handleContinue();
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-group')) closeSuggestions();
  });

  function renderSuggestions(names) {
    highlighted = -1;
    if (!names.length) { closeSuggestions(); return; }
    suggestionsEl.innerHTML = names.map(n => {
      const initials = n.split(' ').map(w => w[0]).join('').slice(0, 2);
      return `<div class="suggestion-item" onclick="selectName('${n}')">
        <div class="suggestion-avatar">${initials}</div>${n}
      </div>`;
    }).join('');
    suggestionsEl.classList.add('open');
  }

  function updateHighlight(items) {
    items.forEach((el, i) => el.classList.toggle('highlighted', i === highlighted));
  }

  window.selectName = function(name) {
    input.value = name;
    closeSuggestions();
    input.focus();
  };

  function closeSuggestions() {
    suggestionsEl.classList.remove('open');
    suggestionsEl.innerHTML = '';
    highlighted = -1;
    filteredNames = [];
  }
}

/* Normalize a name for comparison: lowercase, strip all whitespace */
function normalizeName(value) {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

/* Called by login button */
function handleContinue() {
  const input        = document.getElementById('nameInput');
  const validationMsg = document.getElementById('validationMsg');
  const btnEl        = document.getElementById('continueBtn');
  const btnText      = document.getElementById('btnText');
  const raw          = input ? input.value.trim() : '';

  if (!raw) {
    validationMsg.classList.add('visible');
    input.style.borderColor = 'rgba(200, 100, 100, 0.4)';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
    return;
  }

  const normalized = normalizeName(raw);

  // Admin check
  if (normalized === 'admin') {
    btnEl.classList.add('success');
    btnText.textContent = 'Admin Access ✓';
    input.disabled = true;
    setTimeout(() => { window.location.href = 'admin.html'; }, 900);
    return;
  }

  // Match against staffNames (case + space insensitive)
  const matchedName = staffNames.find(n => normalizeName(n) === normalized);

  if (!matchedName) {
    validationMsg.classList.add('visible');
    input.style.borderColor = 'rgba(200, 100, 100, 0.4)';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
    return;
  }

  // Save the official name and redirect to staff page
  localStorage.setItem('laforet_staff_name', matchedName);

  btnEl.classList.add('success');
  btnText.textContent = `Welcome, ${matchedName.split(' ')[0]} ✓`;
  input.disabled = true;

  setTimeout(() => { window.location.href = 'staff.html'; }, 900);
}


/* ──────────────────────────────────────────
   STAFF PAGE
   ────────────────────────────────────────── */

// State
let prefs = { sat: null, sun: null, note: '' };

function initStaffPage() {
  // Redirect if no name
  const name = localStorage.getItem('laforet_staff_name');
  if (!name) {
    window.location.href = 'index.html';
    return;
  }

  // Populate name fields
  const first = name.split(' ')[0];
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  document.getElementById('welcomeName').textContent = first;
  document.getElementById('staffNameEl').textContent = name;
  document.getElementById('avatarEl').textContent    = initials;
  document.title = `${first} — Laforêt Staff Meal`;

  // Show department if available
  const deptEl = document.getElementById('deptEl');
  if (deptEl) {
    const dept = staffDepartments[name] || '';
    deptEl.textContent = dept ? dept : '';
    deptEl.style.display = dept ? '' : 'none';
  }

  // Populate weekend dates
  const { sat, sun } = getWeekendDates();
  document.getElementById('satDate').textContent = sat;
  document.getElementById('sunDate').textContent = sun;

  // Load saved prefs for this user
  const key = `laforet_pref_${name.toLowerCase().replace(/\s+/g, '_')}`;
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      prefs = { sat: parsed.sat ?? null, sun: parsed.sun ?? null, note: parsed.note || '' };
      applyState();
      const noteField = document.getElementById('noteField');
      if (noteField) noteField.value = prefs.note;
      const lastSaved = document.getElementById('lastSaved');
      if (parsed.savedAt) {
        lastSaved.textContent = `Last saved: ${formatSavedAt(parsed.savedAt)}`;
      }
    } catch(e) {}
  }
}

function getWeekendDates() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  // Find the *next* Saturday (always at least 1 day ahead if today is Sat,
  // and never show the past Sunday as "this weekend")
  let daysToSat;
  if (day === 6) {
    // Today is Saturday — next Saturday is 7 days away; show this Sat/Sun pair
    daysToSat = 0;
  } else {
    // 0=Sun → 6 days, 1=Mon → 5 days … 5=Fri → 1 day
    daysToSat = (6 - day + 7) % 7 || 7;
  }
  const satDate = new Date(now);
  satDate.setDate(now.getDate() + daysToSat);
  const sunDate = new Date(satDate);
  sunDate.setDate(satDate.getDate() + 1);

  const fmt = (d) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  return { sat: fmt(satDate), sun: fmt(sunDate) };
}

function formatSavedAt(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* Called from HTML */
function setDay(day, value) {
  // Toggle off if same value clicked again
  if (prefs[day] === value) {
    prefs[day] = null;
  } else {
    prefs[day] = value;
  }
  applyState();
}

function setBoth(value) {
  prefs.sat = value;
  prefs.sun = value;
  applyState();
}

function applyState() {
  applyDayState('sat');
  applyDayState('sun');
}

function applyDayState(day) {
  const yes    = document.getElementById(`${day}Yes`);
  const no     = document.getElementById(`${day}No`);
  const status = document.getElementById(`${day}Status`);
  if (!yes || !no) return;

  yes.classList.remove('active-yes', 'active-no');
  no.classList.remove('active-yes', 'active-no');
  status.classList.remove('status-yes', 'status-no');
  status.textContent = '';

  if (prefs[day] === true) {
    yes.classList.add('active-yes');
    status.classList.add('status-yes');
    status.textContent = 'Attending ✓';
  } else if (prefs[day] === false) {
    no.classList.add('active-no');
    status.classList.add('status-no');
    status.textContent = 'Skipping ✗';
  }
}

function savePreference() {
  const name = localStorage.getItem('laforet_staff_name');
  if (!name) return;

  const noteField = document.getElementById('noteField');
  prefs.note = noteField ? noteField.value.trim() : '';

  const key = `laforet_pref_${name.toLowerCase().replace(/\s+/g, '_')}`;
  const payload = { ...prefs, savedAt: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(payload));

  // Success animation
  const btn = document.getElementById('saveBtn');
  const btnText = document.getElementById('saveBtnText');
  btn.classList.add('saved');
  btnText.textContent = 'Saved ✓';

  const lastSaved = document.getElementById('lastSaved');
  lastSaved.textContent = `Last saved: ${formatSavedAt(payload.savedAt)}`;

  setTimeout(() => {
    btn.classList.remove('saved');
    btnText.textContent = 'Save Preference';
  }, 2500);
}

function goBack() {
  window.location.href = 'index.html';
}

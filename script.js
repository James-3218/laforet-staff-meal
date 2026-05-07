/* ============================================
   LAFORÊT STAFF MEAL — script.js
   Handles both login (index.html) and
   personal preference page (staff.html)
   ============================================ */

/* ── SET YOUR APPS SCRIPT WEB APP URL HERE ── */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzvm0nZ4CaV3nESJY8-kyss6Bymjqds-Nukn3RwQv3nHUvCQe-qnVBAuFbpkQI_WsxkRw/exec';

/* ════════════════════════════════════════════
   BASE STAFF DATA (hardcoded, read-only)
   Extra/deleted staff come from Google Sheets
   ════════════════════════════════════════════ */

const staffNames = [
  "Jeolita","Maha Marzi","Noriko","Yohan",
  "Sima Kokabian","Sumu Sharma","Umesh Ranasingha",
  "Alexander Bangoy","Dan B Kil","George Jose Abaygar",
  "Hanbin Chung","Heesue Choi","Jeongwoo","Kayla Moon",
  "Miradee Chua","Seoyeun Joanna Bae","Trishita","Wonhyeok Cho",
  "Yena Kim","Yisol Han",
  "Dabin Shin","Hyangmi Kim","Inhoo Choi","Joyce Danielle Pamilar",
  "Sam K Lee","Saurabh Rana","Taekyung Han","Tristin James Louis",
  "Wonju Choi","Ben","Eunho Park"
];

const staffDepartments = {
  "Jeolita":"Bakery","Maha Marzi":"Bakery","Noriko":"Bakery","Yohan":"Bakery",
  "Sima Kokabian":"Dish","Sumu Sharma":"Dish","Umesh Ranasingha":"Dish",
  "Alexander Bangoy":"FOH","Dan B Kil":"FOH","George Jose Abaygar":"FOH",
  "Hanbin Chung":"FOH","Heesue Choi":"FOH","Jeongwoo":"FOH","Kayla Moon":"FOH",
  "Miradee Chua":"FOH","Seoyeun Joanna Bae":"FOH","Trishita":"FOH","Wonhyeok Cho":"FOH",
  "Yena Kim":"FOH","Yisol Han":"FOH",
  "Dabin Shin":"Kitchen","Hyangmi Kim":"Kitchen","Inhoo Choi":"Kitchen",
  "Joyce Danielle Pamilar":"Kitchen","Sam K Lee":"Kitchen","Saurabh Rana":"Kitchen",
  "Taekyung Han":"Kitchen","Tristin James Louis":"Kitchen","Wonju Choi":"Kitchen",
  "Ben":"Store Support","Eunho Park":"Store Support"
};

/* ════════════════════════════════════════════
   API HELPER — JSONP to bypass CORS
   GAS does not support CORS headers, so we
   use JSONP (script tag injection) instead.
   ════════════════════════════════════════════ */

function gasRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const cbName = '_gasCallback_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
    const data    = { action, ...(payload || {}) };
    const encoded = encodeURIComponent(JSON.stringify(data));
    const url     = GAS_URL + '?callback=' + cbName + '&payload=' + encoded;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out'));
    }, 15000);

    const script = document.createElement('script');
    script.src   = url;
    script.onerror = () => {
      cleanup();
      reject(new Error('Script load failed — check your GAS URL'));
    };

    window[cbName] = (result) => {
      cleanup();
      if (!result.ok) reject(new Error(result.error || 'API error'));
      else resolve(result);
    };

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    document.head.appendChild(script);
  });
}

/* ════════════════════════════════════════════
   WEEKLY RESET (Monday — triggers server reset)
   ════════════════════════════════════════════ */

async function resetWeeklyPreferences() {
  try {
    const now = new Date();
    if (now.getDay() !== 1) return; // Only Mondays
    const mondayKey = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    // Use sessionStorage to avoid duplicate calls in the same tab session
    if (sessionStorage.getItem('laforet_reset_sent') === mondayKey) return;
    sessionStorage.setItem('laforet_reset_sent', mondayKey);
    await gasRequest('resetWeekly', { mondayKey });
    console.log('Laforêt: Weekly Monday reset sent to server');
  } catch(e) {
    console.warn('Laforêt: Weekly reset failed:', e.message);
  }
}

/* Force reset — called by admin Test Reset button */
async function forceResetPreferences() {
  await gasRequest('forceReset');
  console.log('Laforêt: Force reset done');
}

/* ════════════════════════════════════════════
   LOAD STAFF FROM SHEETS
   ════════════════════════════════════════════ */

async function loadExtraStaff() {
  // Fire Monday reset check (non-blocking, don't await)
  resetWeeklyPreferences().catch(() => {});

  try {
    const { extra, deleted } = await gasRequest('getStaff');
    const deletedNorm = deleted.map(n => normalizeName(n));

    // Remove deleted base staff from live arrays
    for (let i = staffNames.length - 1; i >= 0; i--) {
      if (deletedNorm.includes(normalizeName(staffNames[i]))) staffNames.splice(i, 1);
    }
    deletedNorm.forEach(n => {
      const k = Object.keys(staffDepartments).find(k => normalizeName(k) === n);
      if (k) delete staffDepartments[k];
    });

    // Add extra staff
    extra.forEach(s => {
      if (!s.name || deletedNorm.includes(normalizeName(s.name))) return;
      if (!staffNames.find(n => normalizeName(n) === normalizeName(s.name))) staffNames.push(s.name);
      if (s.dept) staffDepartments[s.name] = s.dept;
    });
  } catch(e) {
    console.warn('Laforêt: Could not load staff from Sheets:', e.message);
    // Graceful degradation — base staffNames still work offline
  }
}

/* ════════════════════════════════════════════
   LOGIN PAGE
   ════════════════════════════════════════════ */

async function initLogin() {
  await loadExtraStaff();

  const input         = document.getElementById('nameInput');
  const suggestionsEl = document.getElementById('suggestions');
  const validationMsg = document.getElementById('validationMsg');
  if (!input) return;

  let highlighted   = -1;
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
    highlighted   = -1;
    filteredNames = [];
  }
}

/* Normalize: lowercase, strip whitespace */
function normalizeName(value) {
  return value.toLowerCase().replace(/\s+/g, '').trim();
}

/* Called by login button */
async function handleContinue() {
  const input         = document.getElementById('nameInput');
  const validationMsg = document.getElementById('validationMsg');
  const btnEl         = document.getElementById('continueBtn');
  const btnText       = document.getElementById('btnText');
  const raw           = input ? input.value.trim() : '';

  if (!raw) {
    validationMsg.classList.add('visible');
    input.style.borderColor = 'rgba(200, 100, 100, 0.4)';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
    return;
  }

  const normalized = normalizeName(raw);

  if (normalized === 'admin') {
    btnEl.classList.add('success');
    btnText.textContent = 'Admin Access ✓';
    input.disabled = true;
    setTimeout(() => { window.location.href = 'admin.html'; }, 900);
    return;
  }

  const matchedName = staffNames.find(n => normalizeName(n) === normalized);
  if (!matchedName) {
    validationMsg.classList.add('visible');
    input.style.borderColor = 'rgba(200, 100, 100, 0.4)';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
    return;
  }

  // Use sessionStorage (shared across tabs, cleared when browser closes)
  sessionStorage.setItem('laforet_staff_name', matchedName);

  btnEl.classList.add('success');
  btnText.textContent = `Welcome, ${matchedName.split(' ')[0]} ✓`;
  input.disabled = true;
  setTimeout(() => { window.location.href = 'staff.html'; }, 900);
}

/* ════════════════════════════════════════════
   STAFF PAGE
   ════════════════════════════════════════════ */

let prefs = { sat: null, sun: null, note: '' };

async function initStaffPage() {
  const name = sessionStorage.getItem('laforet_staff_name');
  if (!name) { window.location.href = 'index.html'; return; }

  const first    = name.split(' ')[0];
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  document.getElementById('welcomeName').textContent = first;
  document.getElementById('staffNameEl').textContent = name;
  document.getElementById('avatarEl').textContent    = initials;
  document.title = `${first} — Laforêt Staff Meal`;

  // Department
  const deptEl = document.getElementById('deptEl');
  const dept   = staffDepartments[name] || '';
  if (deptEl) {
    deptEl.textContent   = dept;
    deptEl.style.display = dept ? '' : 'none';
  }

  // Weekend dates
  const { sat, sun } = getWeekendDates();
  document.getElementById('satDate').textContent = sat;
  document.getElementById('sunDate').textContent = sun;

  // Load prefs from Sheets
  const lastSaved = document.getElementById('lastSaved');
  try {
    const { prefs: allPrefs } = await gasRequest('getPrefs');
    const myPref = allPrefs.find(p => normalizeName(p.name) === normalizeName(name));
    if (myPref) {
      prefs = { sat: myPref.sat, sun: myPref.sun, note: myPref.note || '' };
      applyState();
      const noteField = document.getElementById('noteField');
      if (noteField) noteField.value = prefs.note;
      if (myPref.updatedAt && lastSaved) {
        lastSaved.textContent = `Last saved: ${formatSavedAt(myPref.updatedAt)}`;
      }
    }
  } catch(e) {
    console.warn('Laforêt: Could not load prefs:', e.message);
    if (lastSaved) lastSaved.textContent = 'Could not load saved data';
  }
}

function getWeekendDates() {
  const now = new Date();
  const day = now.getDay();
  let daysToSat = day === 6 ? 0 : (6 - day + 7) % 7 || 7;
  const satDate = new Date(now);
  satDate.setDate(now.getDate() + daysToSat);
  const sunDate = new Date(satDate);
  sunDate.setDate(satDate.getDate() + 1);
  const fmt = d => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  return { sat: fmt(satDate), sun: fmt(sunDate) };
}

function formatSavedAt(iso) {
  return new Date(iso).toLocaleString('en-CA', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function setDay(day, value) {
  prefs[day] = prefs[day] === value ? null : value;
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

  yes.classList.remove('active-yes','active-no');
  no.classList.remove('active-yes','active-no');
  status.classList.remove('status-yes','status-no');
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

async function savePreference() {
  const name = sessionStorage.getItem('laforet_staff_name');
  if (!name) return;

  const noteField = document.getElementById('noteField');
  prefs.note = noteField ? noteField.value.trim() : '';
  const dept = staffDepartments[name] || '';

  const btn       = document.getElementById('saveBtn');
  const btnText   = document.getElementById('saveBtnText');
  const lastSaved = document.getElementById('lastSaved');

  btn.disabled        = true;
  btnText.textContent = 'Saving…';

  try {
    await gasRequest('savePref', { name, dept, sat: prefs.sat, sun: prefs.sun, note: prefs.note });

    btn.classList.add('saved');
    btnText.textContent = 'Saved ✓';
    if (lastSaved) lastSaved.textContent = `Last saved: ${formatSavedAt(new Date().toISOString())}`;
  } catch(e) {
    btnText.textContent = 'Error — try again';
    console.error('Laforêt: Save failed:', e.message);
  } finally {
    btn.disabled = false;
    setTimeout(() => {
      btn.classList.remove('saved');
      btnText.textContent = 'Save Preference';
    }, 2500);
  }
}

function goBack() {
  window.location.href = 'index.html';
}

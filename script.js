/* ============================================
   LAFORÊT STAFF MEAL — script.js
   Handles login (index.html) and staff page (staff.html)
   ============================================ */

/* ── SET YOUR APPS SCRIPT WEB APP URL HERE ── */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzpQSYqAP_x-gpG0v05VMe5Ykj3SNDU1dyK0kZRIiRzGmSQ0Gj0ofpU5LSjnPM2IaX7fg/exec';

/* ════════════════════════════════════════════
   STAFF DATA — live arrays rebuilt from cache/server
   Kept for compatibility with login autocomplete,
   staff page dept display, and admin_script.js
   ════════════════════════════════════════════ */

let staffNames       = [];   // array of name strings
let staffDepartments = {};   // { name: dept }

/* ════════════════════════════════════════════
   EMERGENCY FALLBACK
   Only used if cache AND server both fail.
   ════════════════════════════════════════════ */

function getEmergencyStaffFallback() {
  return [
    { name: "Jeolita",              dept: "Bakery" },
    { name: "Maha Marzi",           dept: "Bakery" },
    { name: "Noriko",               dept: "Bakery" },
    { name: "Yohan",                dept: "Bakery" },
    { name: "Sima Kokabian",        dept: "Dish" },
    { name: "Sumu Sharma",          dept: "Dish" },
    { name: "Umesh Ranasingha",     dept: "Dish" },
    { name: "Alexander Bangoy",     dept: "FOH" },
    { name: "Dan B Kil",            dept: "FOH" },
    { name: "George Jose Abaygar",  dept: "FOH" },
    { name: "Hanbin Chung",         dept: "FOH" },
    { name: "Heesue Choi",          dept: "FOH" },
    { name: "Jeongwoo",             dept: "FOH" },
    { name: "Kayla Moon",           dept: "FOH" },
    { name: "Miradee Chua",         dept: "FOH" },
    { name: "Seoyeun Joanna Bae",   dept: "FOH" },
    { name: "Trishita",             dept: "FOH" },
    { name: "Wonhyeok Cho",         dept: "FOH" },
    { name: "Yena Kim",             dept: "FOH" },
    { name: "Yisol Han",            dept: "FOH" },
    { name: "Juseok Oh",            dept: "FOH" },
    { name: "Ivy Kang",             dept: "FOH" },
    { name: "Dabin Shin",           dept: "Kitchen" },
    { name: "Hyangmi Kim",          dept: "Kitchen" },
    { name: "Inhoo Choi",           dept: "Kitchen" },
    { name: "Joyce Danielle Pamilar", dept: "Kitchen" },
    { name: "Sam K Lee",            dept: "Kitchen" },
    { name: "Saurabh Rana",         dept: "Kitchen" },
    { name: "Taekyung Han",         dept: "Kitchen" },
    { name: "Tristin James Louis",  dept: "Kitchen" },
    { name: "Wonju Choi",           dept: "Kitchen" },
    { name: "Ben",                  dept: "Store Support" },
    { name: "Eunho Park",           dept: "Store Support" }
  ];
}

/* ════════════════════════════════════════════
   STAFF CACHE (localStorage, 5-min TTL)
   ════════════════════════════════════════════ */

const STAFF_CACHE_KEY      = 'laforet_staff_cache';
const STAFF_CACHE_TIME_KEY = 'laforet_staff_cache_time';
const STAFF_CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

function getCachedStaff() {
  try {
    const raw = localStorage.getItem(STAFF_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function setCachedStaff(staffList) {
  try {
    localStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(staffList));
    localStorage.setItem(STAFF_CACHE_TIME_KEY, Date.now().toString());
  } catch(e) {}
}

function isStaffCacheFresh() {
  try {
    const t = parseInt(localStorage.getItem(STAFF_CACHE_TIME_KEY) || '0', 10);
    return (Date.now() - t) < STAFF_CACHE_TTL_MS;
  } catch(e) { return false; }
}

/* Apply a staff list [{name, dept}] to the live arrays */
function applyStaffList(staffList) {
  staffNames       = staffList.map(s => s.name);
  staffDepartments = {};
  staffList.forEach(s => { staffDepartments[s.name] = s.dept; });
}

/* ════════════════════════════════════════════
   FAST STAFF LOADING
   1. Use cache immediately if fresh
   2. Fetch server in background
   3. If cache stale/missing, wait for server
   4. If server fails, use cache or fallback
   ════════════════════════════════════════════ */

async function loadStaffFast() {
  const cached = getCachedStaff();

  if (cached && isStaffCacheFresh()) {
    // Cache is fresh — use it immediately, refresh in background
    applyStaffList(cached);
    refreshStaffFromServer().catch(() => {});
    return;
  }

  if (cached) {
    // Cache exists but stale — use it while fetching
    applyStaffList(cached);
    try {
      await refreshStaffFromServer();
    } catch(e) {
      console.warn('Laforêt: Server refresh failed, using stale cache');
    }
    return;
  }

  // No cache — must wait for server
  try {
    await refreshStaffFromServer();
  } catch(e) {
    console.warn('Laforêt: Server failed, using emergency fallback');
    applyStaffList(getEmergencyStaffFallback());
  }
}

async function refreshStaffFromServer() {
  const res = await gasRequest('getStaff');
  const staff = res.staff || [];
  applyStaffList(staff);
  setCachedStaff(staff);
}

/* ════════════════════════════════════════════
   LEGACY: kept for backward compatibility
   admin_script.js still calls loadExtraStaff()
   ════════════════════════════════════════════ */

async function loadExtraStaff() {
  resetWeeklyPreferences().catch(() => {});
  await loadStaffFast();
}

/* ════════════════════════════════════════════
   API HELPER — JSONP to bypass CORS
   ════════════════════════════════════════════ */

function gasRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const cbName  = '_gasCallback_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
    const data    = { action, ...(payload || {}) };
    const encoded = encodeURIComponent(JSON.stringify(data));
    const url     = GAS_URL + '?callback=' + cbName + '&payload=' + encoded;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out'));
    }, 15000);

    const script    = document.createElement('script');
    script.src      = url;
    script.onerror  = () => { cleanup(); reject(new Error('Script load failed — check your GAS URL')); };

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
   WEEKLY RESET
   ════════════════════════════════════════════ */

async function resetWeeklyPreferences() {
  try {
    const now = new Date();
    if (now.getDay() !== 1) return;
    const mondayKey = now.toLocaleDateString('en-CA');
    if (sessionStorage.getItem('laforet_reset_sent') === mondayKey) return;
    sessionStorage.setItem('laforet_reset_sent', mondayKey);
    await gasRequest('resetWeekly', { mondayKey });
    console.log('Laforêt: Weekly Monday reset sent to server');
  } catch(e) {
    console.warn('Laforêt: Weekly reset failed:', e.message);
  }
}

async function forceResetPreferences() {
  await gasRequest('forceReset');
  console.log('Laforêt: Force reset done');
}

/* ════════════════════════════════════════════
   LOGIN PAGE
   ════════════════════════════════════════════ */

async function initLogin() {
  const input         = document.getElementById('nameInput');
  const suggestionsEl = document.getElementById('suggestions');
  const validationMsg = document.getElementById('validationMsg');
  if (!input) return;

  let highlighted   = -1;
  let filteredNames = [];

  // Set up event listeners immediately — page is usable right away
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

  // Load staff (fast — uses cache if available, doesn't block the UI)
  resetWeeklyPreferences().catch(() => {});
  await loadStaffFast();
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

  // Load staff fast so dept shows correctly even if cache is cold
  await loadStaffFast();

  const deptEl = document.getElementById('deptEl');
  const dept   = staffDepartments[name] || '';
  if (deptEl) {
    deptEl.textContent   = dept;
    deptEl.style.display = dept ? '' : 'none';
  }

  const { sat, sun } = getWeekendDates();
  document.getElementById('satDate').textContent = sat;
  document.getElementById('sunDate').textContent = sun;

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

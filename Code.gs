/* ============================================================
   LAFORÊT STAFF MEAL — Code.gs
   Google Apps Script Web App
   ============================================================ */

const SS_ID = '18q-7_c7cFrz6wieqNRzU1R4hiIjvbjyf8eC2e4FETdk';

const SHEET_PREFS = 'Preferences';
const SHEET_STAFF = 'Staff';
const SHEET_RESET = 'ResetLog';
const APP_TIME_ZONE = 'America/Vancouver';

/* ════════════════════════════════════════════════════════════
   ENTRY POINT
   ════════════════════════════════════════════════════════════ */

function doGet(e) {
  const params   = e.parameter || {};
  const callback = params.callback || 'callback';
  let result;

  try {
    let raw = params.payload || '{}';
    let body;
    try {
      body = JSON.parse(raw);
    } catch(_) {
      body = JSON.parse(decodeURIComponent(raw));
    }
    const action = body.action;

    if (action !== 'forceReset') {
      ensureCurrentWeekReset();
    }

    switch (action) {
      case 'getPrefs':      result = getPrefs();          break;
      case 'savePref':      result = savePref(body);      break;
      case 'resetWeekly':   result = resetWeekly(body);   break;
      case 'forceReset':    result = forceReset();        break;
      case 'getStaff':      result = getStaff();          break;
      case 'getAdminData':  result = getAdminData();      break;
      case 'addStaff':      result = addStaff(body);      break;
      case 'deleteStaff':   result = deleteStaff(body);   break;
      default:
        result = { ok: false, error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { ok: false, error: err.message };
  }

  const output = ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')');
  output.setMimeType(ContentService.MimeType.JAVASCRIPT);
  return output;
}

/* ════════════════════════════════════════════════════════════
   SHEET HELPERS
   ════════════════════════════════════════════════════════════ */

function getPrefsSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(SHEET_PREFS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PREFS);
    sheet.getRange(1, 1, 1, 6).setValues([['Name','Dept','Sat','Sun','Note','UpdatedAt']]);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  return sheet;
}

function getStaffSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(SHEET_STAFF);
  if (!sheet) {
    // New schema: Name | Dept | Active | CreatedAt | UpdatedAt
    sheet = ss.insertSheet(SHEET_STAFF);
    sheet.getRange(1, 1, 1, 5).setValues([['Name','Dept','Active','CreatedAt','UpdatedAt']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  return sheet;
}

function getResetSheet() {
  const ss = SpreadsheetApp.openById(SS_ID);
  let sheet = ss.getSheetByName(SHEET_RESET);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESET);
    sheet.getRange(1, 1, 1, 1).setValues([['ResetDate']]);
    sheet.getRange(1, 1, 1, 1).setFontWeight('bold');
  }
  return sheet;
}

/* ════════════════════════════════════════════════════════════
   STAFF — reads all rows, detects old schema vs new schema
   Old schema: Name | Dept | Type | Deleted
   New schema: Name | Dept | Active | CreatedAt | UpdatedAt
   ════════════════════════════════════════════════════════════ */

/* Returns active staff as [{ name, dept }] */
function _getActiveStaff() {
  const sheet   = getStaffSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const numCols = Math.min(sheet.getLastColumn(), 5);
  const headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  const data    = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

  // Detect schema by header name in column 3
  const col3Header = String(headers[2] || '').toLowerCase().trim();
  const isNewSchema = col3Header === 'active';
  // Mixed case: old header but seed wrote TRUE/FALSE into col3
  const isMixed = !isNewSchema && data.some(row =>
    row[2] === true || String(row[2]).toUpperCase() === 'TRUE' ||
    row[2] === false || String(row[2]).toUpperCase() === 'FALSE'
  );

  const active = [];
  data.forEach(row => {
    const name = String(row[0] || '').trim();
    const dept = String(row[1] || '').trim();
    if (!name) return;

    if (isNewSchema || isMixed) {
      // col 2 = Active: TRUE means active
      const isActive = row[2] === true || String(row[2]).toUpperCase() === 'TRUE';
      if (isActive) active.push({ name, dept });
    } else {
      // Pure old schema: col 3 = Deleted: TRUE means deleted
      const isDeleted = row[3] === true || String(row[3]).toUpperCase() === 'TRUE';
      if (!isDeleted) active.push({ name, dept });
    }
  });

  return active;
}

/* getStaff action — returns active staff only */
function getStaff() {
  const staff = _getActiveStaff();
  return { ok: true, staff };
}

/* getAdminData — staff + prefs in one call */
function getAdminData() {
  const staff = _getActiveStaff();
  const prefsResult = getPrefs();
  return { ok: true, staff, prefs: prefsResult.prefs || [] };
}

/* addStaff — create or reactivate */
function addStaff(body) {
  const { name, dept } = body;
  if (!name) return { ok: false, error: 'Name required' };

  const sheet   = getStaffSheet();
  const lastRow = sheet.getLastRow();
  const now     = new Date().toISOString();

  const headers = lastRow >= 1
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    : [];
  const isNewSchema = String(headers[2] || '').toLowerCase() === 'active';

  if (lastRow > 1) {
    const numCols = Math.min(sheet.getLastColumn(), 5);
    const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (let i = 0; i < data.length; i++) {
      if (normName(data[i][0]) === normName(name)) {
        if (isNewSchema) {
          const isActive = data[i][2] === true || String(data[i][2]).toUpperCase() === 'TRUE';
          if (isActive) return { ok: false, error: 'Staff already exists' };
          // Reactivate
          sheet.getRange(i + 2, 2, 1, 4).setValues([[dept, true, data[i][3], now]]);
        } else {
          const isDeleted = data[i][3] === true || String(data[i][3]).toUpperCase() === 'TRUE';
          if (!isDeleted) return { ok: false, error: 'Staff already exists' };
          // Restore old schema row
          sheet.getRange(i + 2, 2, 1, 3).setValues([[dept, data[i][2], false]]);
        }
        const staff = _getActiveStaff();
        return { ok: true, restored: true, staff };
      }
    }
  }

  // New row
  if (isNewSchema) {
    sheet.getRange(lastRow + 1, 1, 1, 5).setValues([[name, dept || '', true, now, now]]);
  } else {
    sheet.getRange(lastRow + 1, 1, 1, 4).setValues([[name, dept || '', 'extra', false]]);
  }
  savePref({ name, dept, sat: null, sun: null, note: '' });
  const staff = _getActiveStaff();
  return { ok: true, added: true, staff };
}

/* deleteStaff — soft delete (set Active=FALSE) */
function deleteStaff(body) {
  const { name } = body;
  if (!name) return { ok: false, error: 'Name required' };

  const sheet   = getStaffSheet();
  const lastRow = sheet.getLastRow();
  const now     = new Date().toISOString();

  const headers = lastRow >= 1
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    : [];
  const isNewSchema = String(headers[2] || '').toLowerCase() === 'active';

  if (lastRow > 1) {
    const numCols = Math.min(sheet.getLastColumn(), 5);
    const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (let i = 0; i < data.length; i++) {
      if (normName(data[i][0]) === normName(name)) {
        if (isNewSchema) {
          sheet.getRange(i + 2, 3).setValue(false); // Active = FALSE
          sheet.getRange(i + 2, 5).setValue(now);   // UpdatedAt
        } else {
          sheet.getRange(i + 2, 4).setValue(true);  // Deleted = TRUE
        }
        _removePref(name);
        const staff = _getActiveStaff();
        return { ok: true, deleted: true, staff };
      }
    }
  }

  // Base staff not in sheet — add as inactive
  if (isNewSchema) {
    sheet.getRange(lastRow + 1, 1, 1, 5).setValues([[name, '', false, now, now]]);
  } else {
    sheet.getRange(lastRow + 1, 1, 1, 4).setValues([[name, '', 'base', true]]);
  }
  _removePref(name);
  const staff = _getActiveStaff();
  return { ok: true, deleted: true, staff };
}

/* ════════════════════════════════════════════════════════════
   PREFERENCES
   ════════════════════════════════════════════════════════════ */

function getPrefs() {
  const sheet = getPrefsSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, prefs: [] };

  const prefs = data.slice(1).map(row => ({
    name:      String(row[0] || ''),
    dept:      String(row[1] || ''),
    sat:       row[2] === true || row[2] === 'TRUE'  ? true
             : row[2] === false || row[2] === 'FALSE' ? false : null,
    sun:       row[3] === true || row[3] === 'TRUE'  ? true
             : row[3] === false || row[3] === 'FALSE' ? false : null,
    note:      String(row[4] || ''),
    updatedAt: row[5] ? String(row[5]) : ''
  })).filter(r => r.name);

  return { ok: true, prefs };
}

function savePref(body) {
  const { name, dept, sat, sun, note } = body;
  if (!name) return { ok: false, error: 'Name required' };

  const sheet = getPrefsSheet();
  const data  = sheet.getDataRange().getValues();
  const now   = new Date().toISOString();

  for (let i = 1; i < data.length; i++) {
    if (normName(data[i][0]) === normName(name)) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[
        name,
        dept  !== undefined ? dept  : data[i][1],
        sat   !== undefined ? sat   : data[i][2],
        sun   !== undefined ? sun   : data[i][3],
        note  !== undefined ? note  : data[i][4],
        now
      ]]);
      return { ok: true, updated: true };
    }
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 6).setValues([[
    name, dept || '',
    sat  !== undefined ? sat  : null,
    sun  !== undefined ? sun  : null,
    note || '', now
  ]]);
  return { ok: true, updated: false };
}

/* ════════════════════════════════════════════════════════════
   WEEKLY RESET
   ════════════════════════════════════════════════════════════ */

function resetWeekly(body) {
  const mondayKey = body.mondayKey || getMondayKey(new Date());
  if (!mondayKey) return { ok: false, error: 'mondayKey required' };

  return resetForMondayKey(mondayKey);
}

function forceReset() {
  _clearSatSun();
  return { ok: true, reset: true };
}

function ensureCurrentWeekReset() {
  const now = new Date();
  const day = getLocalDayOfWeek(now); // 1=Mon ... 7=Sun
  if (day > 5) return { ok: true, skippedWeekend: true };
  return resetForMondayKey(getMondayKey(now));
}

function resetForMondayKey(mondayKey) {
  const resetSheet = getResetSheet();
  const resets = resetSheet.getDataRange().getValues();
  for (let i = 1; i < resets.length; i++) {
    if (normalizeResetKey(resets[i][0]) === mondayKey) return { ok: true, alreadyDone: true };
  }

  _clearSatSun();
  resetSheet.getRange(resetSheet.getLastRow() + 1, 1).setValue(mondayKey);
  return { ok: true, reset: true };
}

function _clearSatSun() {
  const sheet   = getPrefsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const now = new Date().toISOString();
  for (let i = 2; i <= lastRow; i++) {
    sheet.getRange(i, 3, 1, 2).setValues([[null, null]]);
    sheet.getRange(i, 6).setValue(now);
  }
}

/* ════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════ */

function _removePref(name) {
  const sheet   = getPrefsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (normName(data[i][0]) === normName(name)) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}

function normName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

function scheduledWeeklyReset() {
  const result = resetForMondayKey(getMondayKey(new Date()));
  Logger.log('Scheduled reset result: ' + JSON.stringify(result));
}

function getMondayKey(date) {
  const localDate = getLocalDate(date);
  const utcDate = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
  const daysSinceMonday = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - daysSinceMonday);
  return formatUtcDateKey(utcDate);
}

function normalizeResetKey(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_TIME_ZONE, 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return isoMatch[1] + '-' + isoMatch[2].padStart(2, '0') + '-' + isoMatch[3].padStart(2, '0');
  }
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return slashMatch[3] + '-' + slashMatch[1].padStart(2, '0') + '-' + slashMatch[2].padStart(2, '0');
  }
  return text;
}

function getLocalDayOfWeek(date) {
  const localDate = getLocalDate(date);
  const utcDate = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
  const day = utcDate.getUTCDay();
  return day === 0 ? 7 : day;
}

function getLocalDate(date) {
  const parts = Utilities.formatDate(date, APP_TIME_ZONE, 'yyyy-MM-dd').split('-');
  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2])
  };
}

function formatUtcDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/* ════════════════════════════════════════════════════════════
   ONE-TIME HEADER FIX — run this ONCE if staff still shows 0
   Updates the Staff sheet header from old to new schema.
   ════════════════════════════════════════════════════════════ */

function fixStaffSheetHeader() {
  const sheet = getStaffSheet();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  // If col3 header is 'Type' or 'Deleted', upgrade to new schema headers
  const col3 = String(headers[2] || '').toLowerCase();
  if (col3 !== 'active') {
    // Set new headers
    sheet.getRange(1, 1, 1, 5).setValues([['Name','Dept','Active','CreatedAt','UpdatedAt']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    Logger.log('Header upgraded to new schema.');
  } else {
    Logger.log('Header already correct: ' + headers.join(' | '));
  }
}

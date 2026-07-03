/**
 * Cedars Attendance — Apps Script backend
 *
 * Serves as a JSON API in front of the "Cedars Attendance" Google Sheet.
 * Every request must include a valid Google ID token for a cedarsprohub.com
 * account — verified here, server-side, on every single call. Even if
 * someone edited the React frontend to skip its own checks, this file
 * would still refuse them.
 *
 * SETUP:
 * 1. Open the "Cedars Attendance" Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Delete any starter code, paste this whole file in.
 * 4. Set SHEET_ID below (already filled in with your sheet's ID).
 * 5. Deploy > New deployment > type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 *    (We deliberately do NOT restrict this to "Anyone within cedarsprohub.com" —
 *     that setting triggers a Google login *redirect*, which breaks clean
 *     fetch() calls from a separately-hosted React app. Instead, the domain
 *     check happens inside verifyToken() below, on every request.)
 * 6. Copy the deployment URL (ends in /exec) into the React app's .env file
 *    as VITE_APPS_SCRIPT_URL.
 * 7. Whenever you edit this file, you must create a NEW deployment version
 *    (Deploy > Manage deployments > Edit > New version) for changes to go live.
 */

const SHEET_ID = '1VY2WycPGzNs5PNNSWc3RQzCZTbBbV9PG1DJkq-wuivU';
const ALLOWED_DOMAIN = 'cedarsprohub.com';
const ATTENDANCE_SHEET = 'Attendance';
const STAFF_SHEET = 'Staff';
const HEADERS = ['Record ID', 'Staff Name', 'Date', 'Status', 'Time In', 'Time Out', 'Notes'];

/** Verifies a Google ID token and confirms it belongs to the allowed domain. Returns the email, or null. */
function verifyToken(idToken) {
  if (!idToken) return null;
  try {
    const resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;
    const data = JSON.parse(resp.getContentText());
    const email = data.email || '';
    if (data.hd === ALLOWED_DOMAIN || email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) {
      return email;
    }
    return null;
  } catch (err) {
    return null;
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const token = e.parameter.token;
  const email = verifyToken(token);
  if (!email) return jsonOut({ error: 'unauthorized' });

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const action = e.parameter.action || 'list';

  if (action === 'staff') {
    const sheet = ss.getSheetByName(STAFF_SHEET);
    const values = sheet.getDataRange().getValues().slice(1).map((r) => r[0]).filter(String);
    return jsonOut({ staff: values, user: email });
  }

  const sheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const rows = sheet.getDataRange().getValues();
  const records = rows
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({
      id: r[0],
      staffName: r[1],
      date: fmtDate_(r[2]),
      status: r[3],
      timeIn: r[4],
      timeOut: r[5],
      notes: r[6],
    }));
  return jsonOut({ records, user: email });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: 'bad_request' });
  }

  const email = verifyToken(body.token);
  if (!email) return jsonOut({ error: 'unauthorized' });

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ATTENDANCE_SHEET);
  const action = body.action;

  if (action === 'add') {
    const id = 'a' + new Date().getTime();
    sheet.appendRow([
      id,
      body.staffName || '',
      body.date || '',
      body.status || '',
      body.timeIn || '',
      body.timeOut || '',
      body.notes || '',
    ]);
    return jsonOut({ success: true, id });
  }

  if (action === 'update') {
    const rowIndex = findRowById_(sheet, body.id);
    if (rowIndex === -1) return jsonOut({ error: 'not_found' });
    sheet.getRange(rowIndex, 2, 1, 6).setValues([[
      body.staffName || '',
      body.date || '',
      body.status || '',
      body.timeIn || '',
      body.timeOut || '',
      body.notes || '',
    ]]);
    return jsonOut({ success: true });
  }

  if (action === 'delete') {
    const rowIndex = findRowById_(sheet, body.id);
    if (rowIndex === -1) return jsonOut({ error: 'not_found' });
    sheet.deleteRow(rowIndex);
    return jsonOut({ success: true });
  }

  if (action === 'addStaff') {
    const staffSheet = ss.getSheetByName(STAFF_SHEET);
    staffSheet.appendRow([body.name || '']);
    return jsonOut({ success: true });
  }

  return jsonOut({ error: 'unknown_action' });
}

function findRowById_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function fmtDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value;
}

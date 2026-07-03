/**
 * Cedars Attendance - Apps Script backend
 *
 * Serves as a JSON API in front of the "Cedars Attendance" Google Sheet.
 * Every request must include a valid Google ID token for a cedarsprohub.com
 * account, verified server-side on every call.
 */

const SHEET_ID = '1VY2WycPGzNs5PNNSWc3RQzCZTbBbV9PG1DJkq-wuivU';
const GOOGLE_CLIENT_ID = ''; // Optional but recommended: paste the OAuth Client ID used by the frontend.
const ALLOWED_DOMAIN = 'cedarsprohub.com';
const ATTENDANCE_SHEET = 'Attendance';
const STAFF_SHEET = 'Staff';
const HEADERS = ['Record ID', 'Staff Name', 'Date', 'Status', 'Time In', 'Time Out', 'Notes'];
const STAFF_HEADERS = ['Staff Name'];
const STATUSES = ['Present', 'Absent', 'Leave'];

function doGet(e) {
  return handleRequest_({
    token: e.parameter.token,
    action: e.parameter.action || 'list',
  });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ error: 'bad_request' });
  }

  return handleRequest_(body);
}

function handleRequest_(body) {
  const email = verifyToken_(body.token);
  if (!email) return jsonOut_({ error: 'unauthorized' });

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheets = ensureWorkbook_(ss);
  const action = body.action || 'list';

  if (action === 'staff') {
    return jsonOut_({ staff: readStaff_(sheets.staffSheet), user: email });
  }

  if (action === 'list') {
    return jsonOut_({ records: readRecords_(sheets.attendanceSheet), user: email });
  }

  if (action === 'addStaff') {
    const name = cleanText_(body.name);
    if (!name) return jsonOut_({ error: 'validation_error' });

    const staff = readStaff_(sheets.staffSheet);
    if (!staff.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      sheets.staffSheet.appendRow([name]);
    }
    return jsonOut_({ success: true, staff: readStaff_(sheets.staffSheet), user: email });
  }

  if (action === 'add') {
    const validation = validateRecord_(body, sheets.staffSheet);
    if (validation) return jsonOut_({ error: validation });

    const id = Utilities.getUuid();
    sheets.attendanceSheet.appendRow(toRow_(id, body));
    return jsonOut_({ success: true, id, user: email });
  }

  if (action === 'update') {
    const validation = validateRecord_(body, sheets.staffSheet);
    if (validation) return jsonOut_({ error: validation });

    const rowIndex = findRowById_(sheets.attendanceSheet, body.id);
    if (rowIndex === -1) return jsonOut_({ error: 'not_found' });

    sheets.attendanceSheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([toRow_(body.id, body)]);
    return jsonOut_({ success: true, user: email });
  }

  if (action === 'delete') {
    const rowIndex = findRowById_(sheets.attendanceSheet, body.id);
    if (rowIndex === -1) return jsonOut_({ error: 'not_found' });

    sheets.attendanceSheet.deleteRow(rowIndex);
    return jsonOut_({ success: true, user: email });
  }

  return jsonOut_({ error: 'unknown_action' });
}

function verifyToken_(idToken) {
  if (!idToken) return null;

  try {
    const resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;

    const data = JSON.parse(resp.getContentText());
    const email = data.email || '';
    const correctAudience = !GOOGLE_CLIENT_ID || data.aud === GOOGLE_CLIENT_ID;
    const correctDomain = data.hd === ALLOWED_DOMAIN || email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN);

    return correctAudience && correctDomain ? email : null;
  } catch (err) {
    return null;
  }
}

function ensureWorkbook_(ss) {
  return {
    staffSheet: ensureSheet_(ss, STAFF_SHEET, STAFF_HEADERS),
    attendanceSheet: ensureSheet_(ss, ATTENDANCE_SHEET, HEADERS),
  };
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = headers.some((header, index) => existing[index] !== header);

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function readStaff_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map((row) => cleanText_(row[0]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function readRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, HEADERS.length)
    .getValues()
    .filter((row) => row[0])
    .map((row) => ({
      id: row[0],
      staffName: row[1],
      date: fmtDate_(row[2]),
      status: row[3],
      timeIn: fmtTime_(row[4]),
      timeOut: fmtTime_(row[5]),
      notes: row[6],
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function validateRecord_(body, staffSheet) {
  const staffName = cleanText_(body.staffName);
  const date = cleanText_(body.date);
  const status = cleanText_(body.status);
  const staff = readStaff_(staffSheet);

  if (!staffName || !date || STATUSES.indexOf(status) === -1) return 'validation_error';
  if (staff.indexOf(staffName) === -1) return 'unknown_staff';
  return null;
}

function toRow_(id, body) {
  const status = cleanText_(body.status);
  return [
    id,
    cleanText_(body.staffName),
    cleanText_(body.date),
    status,
    status === 'Present' ? cleanText_(body.timeIn) : '',
    status === 'Present' ? cleanText_(body.timeOut) : '',
    cleanText_(body.notes),
  ];
}

function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i += 1) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function fmtDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return cleanText_(value);
}

function fmtTime_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  const match = cleanText_(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return cleanText_(value).slice(0, 5);
  return match[1].padStart(2, '0') + ':' + match[2];
}

function cleanText_(value) {
  return String(value || '').trim();
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

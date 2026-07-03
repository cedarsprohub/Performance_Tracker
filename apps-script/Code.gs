/**
 * Cedars Performance Tracker - Apps Script backend
 *
 * Serves as a JSON API in front of the "Cedars Attendance" Google Sheet
 * (attendance, tasks, courses, learning) and reads KPI figures live from the
 * separate "Teams Tracker" spreadsheet.
 *
 * Every request must include a valid Google ID token for a cedarsprohub.com
 * account, verified server-side on every call.
 */

const SHEET_ID = '1VY2WycPGzNs5PNNSWc3RQzCZTbBbV9PG1DJkq-wuivU';
const KAIZEN_SHEET_ID = '186UmukCBpm_OyreThPH7mYlJ8dxbdobOXS4OTZ8VDw0';
const TEAMS_TRACKER_ID = '1dBkdl1xvBaMlsXUHBR2D9jZlCpugK2JKYJ22xUWtAO0';
const GOOGLE_CLIENT_ID = ''; // Optional but recommended: paste the OAuth Client ID used by the frontend.
const ALLOWED_DOMAIN = 'cedarsprohub.com';

const ATTENDANCE_SHEET = 'Attendance';
const STAFF_SHEET = 'Staff';
const TASKS_SHEET = 'Tasks';
const COURSES_SHEET = 'Courses';
const LEARNING_SHEET = 'Learning';

const ATTENDANCE_HEADERS = ['Record ID', 'Staff Name', 'Date', 'Status', 'Time In', 'Time Out', 'Notes'];
const STAFF_HEADERS = ['Staff Name'];
const TASKS_HEADERS = ['Task ID', 'Staff Name', 'Date', 'Label', 'Status'];
const COURSES_HEADERS = ['Course Name'];
const LEARNING_HEADERS = ['Staff Name', 'Course Name', 'Status'];

const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Leave'];
const TASK_STATUSES = ['red', 'yellow', 'green'];
const LEARNING_STATUSES = ['inprogress', 'completed'];

// Departments/people tracked on the Teams Tracker spreadsheet, and who owns each.
const KPI_SHEETS = [
  { department: 'Social Media', owner: 'Sopirinye Jumbo' },
  { department: 'Grant and Partnership', owner: 'Desmond Jumbo' },
  { department: 'Digital Studio', owner: 'Harry Ngere' },
  { department: 'People & Operations(HR)', owner: 'Priscillia Israel' },
  { department: 'Davy Ledum', owner: 'Davy Ledum' },
  { department: 'Macdonald Iyowuna', owner: 'Macdonald Iyowuna' },
  { department: 'Michelle Jumbo', owner: 'Michelle Jumbo' },
  { department: 'Angel Jeremiah', owner: 'Angel Jeremiah' },
];
const KPI_MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

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

  // ---------- Attendance ----------
  if (action === 'staff') return jsonOut_({ staff: readStaff_(sheets.staffSheet), user: email });
  if (action === 'list') return jsonOut_({ records: readAttendance_(sheets.attendanceSheet), user: email });

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
    const validation = validateAttendance_(body, sheets.staffSheet);
    if (validation) return jsonOut_({ error: validation });
    const id = Utilities.getUuid();
    sheets.attendanceSheet.appendRow(attendanceToRow_(id, body));
    return jsonOut_({ success: true, id, user: email });
  }

  if (action === 'update') {
    const validation = validateAttendance_(body, sheets.staffSheet);
    if (validation) return jsonOut_({ error: validation });
    const rowIndex = findRowById_(sheets.attendanceSheet, body.id);
    if (rowIndex === -1) return jsonOut_({ error: 'not_found' });
    // Arrival time is locked once a record exists — only status, time out, and notes can change.
    const existingRow = sheets.attendanceSheet.getRange(rowIndex, 1, 1, ATTENDANCE_HEADERS.length).getValues()[0];
    const lockedBody = Object.assign({}, body, { timeIn: existingRow[4] });
    sheets.attendanceSheet.getRange(rowIndex, 1, 1, ATTENDANCE_HEADERS.length).setValues([attendanceToRow_(body.id, lockedBody)]);
    return jsonOut_({ success: true, user: email });
  }

  if (action === 'delete') {
    const rowIndex = findRowById_(sheets.attendanceSheet, body.id);
    if (rowIndex === -1) return jsonOut_({ error: 'not_found' });
    sheets.attendanceSheet.deleteRow(rowIndex);
    return jsonOut_({ success: true, user: email });
  }

  // ---------- Kaizen tasks ----------
  if (action === 'tasks') return jsonOut_({ tasks: readTasks_(sheets.tasksSheet), user: email });
  if (action === 'liveTasks') return jsonOut_({ tasks: readLiveWorkPlan_(readStaff_(sheets.staffSheet)), user: email });

  if (action === 'addTask') {
    const staffName = cleanText_(body.staffName);
    const date = cleanText_(body.date);
    const label = cleanText_(body.label);
    const status = cleanText_(body.status);
    if (!staffName || !date || !label || TASK_STATUSES.indexOf(status) === -1) {
      return jsonOut_({ error: 'validation_error' });
    }
    const id = Utilities.getUuid();
    sheets.tasksSheet.appendRow([id, staffName, date, label, status]);
    return jsonOut_({ success: true, id, user: email });
  }

  if (action === 'updateTaskStatus') {
    const status = cleanText_(body.status);
    if (TASK_STATUSES.indexOf(status) === -1) return jsonOut_({ error: 'validation_error' });
    const rowIndex = findRowById_(sheets.tasksSheet, body.id);
    if (rowIndex === -1) return jsonOut_({ error: 'not_found' });
    sheets.tasksSheet.getRange(rowIndex, 5).setValue(status);
    return jsonOut_({ success: true, user: email });
  }

  if (action === 'deleteTask') {
    const rowIndex = findRowById_(sheets.tasksSheet, body.id);
    if (rowIndex === -1) return jsonOut_({ error: 'not_found' });
    sheets.tasksSheet.deleteRow(rowIndex);
    return jsonOut_({ success: true, user: email });
  }

  // ---------- Upskilling ----------
  if (action === 'courses') return jsonOut_({ courses: readCourses_(sheets.coursesSheet), user: email });

  if (action === 'addCourse') {
    const name = cleanText_(body.name);
    if (!name) return jsonOut_({ error: 'validation_error' });
    const courses = readCourses_(sheets.coursesSheet);
    if (!courses.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      sheets.coursesSheet.appendRow([name]);
    }
    return jsonOut_({ success: true, courses: readCourses_(sheets.coursesSheet), user: email });
  }

  if (action === 'learning') return jsonOut_({ learning: readLearning_(sheets.learningSheet), user: email });
  if (action === 'liveLearning') {
    const live = readLiveUpskilling_(readStaff_(sheets.staffSheet));
    return jsonOut_({ courses: live.courses, learning: live.learning, user: email });
  }

  if (action === 'setLearning') {
    const staffName = cleanText_(body.staffName);
    const courseName = cleanText_(body.courseName);
    const status = cleanText_(body.status); // '' clears, else 'inprogress' | 'completed'
    if (!staffName || !courseName) return jsonOut_({ error: 'validation_error' });
    if (status && LEARNING_STATUSES.indexOf(status) === -1) return jsonOut_({ error: 'validation_error' });

    const data = sheets.learningSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i += 1) {
      if (data[i][0] === staffName && data[i][1] === courseName) { rowIndex = i + 1; break; }
    }
    if (!status) {
      if (rowIndex !== -1) sheets.learningSheet.deleteRow(rowIndex);
      return jsonOut_({ success: true, user: email });
    }
    if (rowIndex !== -1) {
      sheets.learningSheet.getRange(rowIndex, 3).setValue(status);
    } else {
      sheets.learningSheet.appendRow([staffName, courseName, status]);
    }
    return jsonOut_({ success: true, user: email });
  }

  // ---------- Team KPI (live from the Teams Tracker sheet) ----------
  if (action === 'kpi') return jsonOut_({ departments: readTeamKpi_(), user: email });

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
    attendanceSheet: ensureSheet_(ss, ATTENDANCE_SHEET, ATTENDANCE_HEADERS),
    tasksSheet: ensureSheet_(ss, TASKS_SHEET, TASKS_HEADERS),
    coursesSheet: ensureSheet_(ss, COURSES_SHEET, COURSES_HEADERS),
    learningSheet: ensureSheet_(ss, LEARNING_SHEET, LEARNING_HEADERS),
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

// ---------- Attendance helpers ----------
function readStaff_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map((row) => cleanText_(row[0])).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function readAttendance_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, ATTENDANCE_HEADERS.length).getValues()
    .filter((row) => row[0])
    .map((row) => ({
      id: row[0], staffName: row[1], date: fmtDate_(row[2]), status: row[3],
      timeIn: fmtTime_(row[4]), timeOut: fmtTime_(row[5]), notes: row[6],
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function validateAttendance_(body, staffSheet) {
  const staffName = cleanText_(body.staffName);
  const date = cleanText_(body.date);
  const status = cleanText_(body.status);
  const staff = readStaff_(staffSheet);
  if (!staffName || !date || ATTENDANCE_STATUSES.indexOf(status) === -1) return 'validation_error';
  if (staff.indexOf(staffName) === -1) return 'unknown_staff';
  return null;
}

function attendanceToRow_(id, body) {
  const status = cleanText_(body.status);
  return [
    id, cleanText_(body.staffName), cleanText_(body.date), status,
    status === 'Present' ? cleanText_(body.timeIn) : '',
    status === 'Present' ? cleanText_(body.timeOut) : '',
    cleanText_(body.notes),
  ];
}

// ---------- Tasks helpers ----------
function readTasks_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, TASKS_HEADERS.length).getValues()
    .filter((row) => row[0])
    .map((row) => ({ id: row[0], staffName: row[1], date: fmtDate_(row[2]), label: row[3], status: row[4] }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// ---------- Upskilling helpers ----------
function readCourses_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().map((row) => cleanText_(row[0])).filter(Boolean);
}

function readLearning_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, LEARNING_HEADERS.length).getValues()
    .filter((row) => row[0] && row[1])
    .map((row) => ({ staffName: row[0], courseName: row[1], status: row[2] }));
}

// ---------- Team KPI (reads a different spreadsheet live) ----------
function readTeamKpi_() {
  const ss = SpreadsheetApp.openById(TEAMS_TRACKER_ID);
  return KPI_SHEETS.map((entry) => {
    const sheet = ss.getSheetByName(entry.department);
    if (!sheet) return { department: entry.department, owner: entry.owner, kpis: [] };
    return { department: entry.department, owner: entry.owner, kpis: extractKpiSheet_(sheet) };
  });
}

function extractKpiSheet_(sheet) {
  const maxCol = sheet.getLastColumn();
  const maxRow = sheet.getLastRow();
  if (maxRow < 4 || maxCol < 3) return [];

  const monthRow = sheet.getRange(2, 1, 1, maxCol).getValues()[0];
  const monthCols = []; // { col (1-indexed), monthKey: 'YYYY-MM' }
  for (let c = 1; c < maxCol; c += 1) {
    const label = cleanText_(monthRow[c]);
    if (!label) continue;
    const key = normalizeMonth_(label);
    if (key) monthCols.push({ col: c + 1, monthKey: key });
  }
  if (monthCols.length === 0) return [];

  const kpis = [];
  for (let r = 4; r <= maxRow; r += 1) {
    const kpiName = cleanText_(sheet.getRange(r, 1).getValue());
    if (!kpiName) continue;
    const months = {};
    monthCols.forEach(({ col, monthKey }) => {
      const target = parseKpiNumber_(sheet.getRange(r, col).getValue());
      const achieved = parseKpiNumber_(sheet.getRange(r, col + 1).getValue());
      if (target !== null || achieved !== null) months[monthKey] = { target, achieved };
    });
    if (Object.keys(months).length > 0) kpis.push({ name: kpiName, months });
  }
  return kpis;
}

function normalizeMonth_(label) {
  const key = String(label).replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 4);
  const found = Object.keys(KPI_MONTH_MAP).find((k) => key.indexOf(k.slice(0, 3)) === 0);
  return found ? '2026-' + KPI_MONTH_MAP[found] : null;
}

function parseKpiNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (s === '-' || s === '') return null;
  const match = s.replace(/[₦,]/g, '').match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

// ---------- Live reads from the "Cedars Daily Kaizen" sheet ----------
const WORKPLAN_COLORS = {
  '#d9ead3': 'green',
  '#f4cccc': 'red',
  '#fff2cc': 'yellow',
};

function normalizeToStaff_(rawName, staffList) {
  const first = String(rawName).trim().split(/\s+/)[0].toLowerCase();
  const match = staffList.find((s) => s.split(/\s+/)[0].toLowerCase() === first);
  return match || String(rawName).trim();
}

function readLiveWorkPlan_(staffList) {
  const ss = SpreadsheetApp.openById(KAIZEN_SHEET_ID);
  const sheet = ss.getSheetByName('WorkPlan');
  if (!sheet) return [];

  const maxRow = sheet.getLastRow();
  const maxCol = sheet.getLastColumn();
  if (maxRow < 3 || maxCol < 2) return [];

  const values = sheet.getRange(1, 1, maxRow, maxCol).getValues();
  const backgrounds = sheet.getRange(1, 1, maxRow, maxCol).getBackgrounds();

  // Row 2 (index 1) holds the date header across columns 2..maxCol.
  const dateCols = []; // { col (0-indexed), date: 'yyyy-MM-dd' }
  for (let c = 1; c < maxCol; c += 1) {
    const v = values[1][c];
    if (v instanceof Date) {
      dateCols.push({ col: c, date: Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') });
    }
  }
  if (dateCols.length === 0) return [];

  // Find staff blocks: rows (from row 3, index 2) where column 1 has a name.
  const nameRows = [];
  for (let r = 2; r < maxRow; r += 1) {
    const v = values[r][0];
    if (v && String(v).trim() && String(v).trim() !== 'Team Member') {
      nameRows.push({ row: r, name: String(v).trim() });
    }
  }

  const tasks = [];
  nameRows.forEach((block, i) => {
    const endRow = i + 1 < nameRows.length ? nameRows[i + 1].row - 1 : maxRow - 1;
    const staffName = normalizeToStaff_(block.name, staffList);
    dateCols.forEach(({ col, date }) => {
      for (let r = block.row; r <= endRow; r += 1) {
        const label = values[r][col];
        if (label === null || label === undefined || String(label).trim() === '') continue;
        const bg = String(backgrounds[r][col]).toLowerCase();
        const status = WORKPLAN_COLORS[bg];
        if (status) {
          tasks.push({
            id: 'live-' + r + '-' + col,
            staffName, date, label: String(label).trim().slice(0, 200), status,
          });
        }
      }
    });
  });
  return tasks;
}

function readLiveUpskilling_(staffList) {
  const ss = SpreadsheetApp.openById(KAIZEN_SHEET_ID);
  const sheet = ss.getSheetByName('Staff Development Tracker');
  if (!sheet) return { courses: [], learning: [] };

  const maxRow = sheet.getLastRow();
  const maxCol = sheet.getLastColumn();
  if (maxRow < 3 || maxCol < 4) return { courses: [], learning: [] };

  const values = sheet.getRange(1, 1, maxRow, maxCol).getValues();
  const header = values[1]; // row 2

  const staffCols = []; // { col (0-indexed), name }
  for (let c = 3; c < maxCol; c += 1) {
    if (header[c] && String(header[c]).trim()) {
      staffCols.push({ col: c, name: normalizeToStaff_(header[c], staffList) });
    }
  }

  const courses = [];
  const learning = [];
  for (let r = 2; r < maxRow; r += 1) {
    const course = values[r][1]; // column B
    if (!course || !String(course).trim()) continue;
    const courseName = String(course).trim();
    if (courses.indexOf(courseName) === -1) courses.push(courseName);

    staffCols.forEach(({ col, name }) => {
      const val = values[r][col];
      if (!val || !String(val).trim()) return;
      const text = String(val).toLowerCase();
      const status = text.indexOf('complet') !== -1 ? 'completed' : (text.indexOf('progress') !== -1 ? 'inprogress' : null);
      if (status) learning.push({ staffName: name, courseName, status });
    });
  }
  return { courses, learning };
}


// ---------- Shared helpers ----------
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
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return cleanText_(value);
}

function fmtTime_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
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

export const APPS_SCRIPT_URL = (import.meta.env.VITE_APPS_SCRIPT_URL || '').trim();
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const ALLOWED_DOMAIN = 'cedarsprohub.com';

export const configIssues = [
  !APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE_YOUR_DEPLOYMENT_ID')
    ? 'VITE_APPS_SCRIPT_URL is missing or still contains the placeholder value.'
    : null,
  !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('PASTE_YOUR_CLIENT_ID')
    ? 'VITE_GOOGLE_CLIENT_ID is missing or still contains the placeholder value.'
    : null,
].filter(Boolean);

export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    return null;
  }
}

function friendlyApiError(code) {
  const messages = {
    unauthorized: 'Your sign-in could not be verified. Please refresh and sign in again.',
    bad_request: 'The request was not valid. Please try again.',
    not_found: 'That record no longer exists.',
    unknown_action: 'The backend did not recognize this request.',
    unknown_staff: 'That staff member is not in the staff list.',
    validation_error: 'Please check the form and try again.',
  };
  return messages[code] || 'The backend returned an unexpected error.';
}

export async function apiRequest(token, action, payload = {}) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // text/plain avoids a CORS preflight, which Apps Script web apps do not handle.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, action, ...payload }),
  });

  let data;
  try {
    data = await res.json();
  } catch (error) {
    throw new Error('The backend did not return valid JSON.');
  }
  if (!res.ok || data.error) throw new Error(friendlyApiError(data.error));
  return data;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(value) {
  if (!value) return '-';
  const [y, m, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return value;
  return new Date(y, m - 1, day).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- period helpers (month / quarter / year) ----------
export function periodRange(type, ref) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (type === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (type === 'quarter') {
    const q = Math.floor(m / 3);
    return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0))];
  }
  return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
}

export function periodLabel(type, ref) {
  if (type === 'month') return ref.toLocaleString('default', { month: 'long', year: 'numeric' });
  if (type === 'quarter') return `Q${Math.floor(ref.getMonth() / 3) + 1} ${ref.getFullYear()}`;
  return `${ref.getFullYear()}`;
}

export function shiftPeriod(type, ref, dir) {
  const d = new Date(ref);
  if (type === 'month') d.setMonth(d.getMonth() + dir);
  else if (type === 'quarter') d.setMonth(d.getMonth() + dir * 3);
  else d.setFullYear(d.getFullYear() + dir);
  return d;
}

// ---------- scoring ----------
export const TASK_META = {
  red: { color: '#c9352b', label: 'Not done', pts: 0 },
  yellow: { color: '#b7791f', label: 'Sprint', pts: 50 },
  green: { color: '#178a50', label: 'Done', pts: 100 },
};
export const ATT_META = {
  Present: { color: '#178a50', label: 'Present', pts: 90 },
  Absent: { color: '#c9352b', label: 'Absent', pts: 0 },
  Leave: { color: '#3478d4', label: 'Leave', pts: null },
};
export const LEARN_META = {
  inprogress: { color: '#b7791f', label: 'In progress', pts: 50 },
  completed: { color: '#178a50', label: 'Completed', pts: 100 },
};
export const WEIGHTS = { kpi: 0.6, task: 0.1, att: 0.3 };

function kpiRatioPts(target, achieved) {
  if (achieved === null || achieved === undefined || target === null || target === undefined) return null;
  if (target === 0) return 100;
  return Math.round(Math.min(Math.max(achieved / target, 0), 1) * 100);
}

function monthsInRange(start, end) {
  const out = [];
  let d = new Date(start.slice(0, 7) + '-01');
  const endD = new Date(end.slice(0, 7) + '-01');
  while (d <= endD) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function computeTeamKpi(entry, start, end) {
  if (!entry) return { pct: null, details: [] };
  const months = monthsInRange(start, end);
  const details = [];
  entry.kpis.forEach((k) => {
    months.forEach((m) => {
      const md = k.months[m];
      if (!md) return;
      const pts = kpiRatioPts(md.target, md.achieved);
      if (pts !== null) details.push({ kpi: k.name, month: m, target: md.target, achieved: md.achieved, pts });
    });
  });
  const pct = details.length ? Math.round(details.reduce((s, d) => s + d.pts, 0) / details.length) : null;
  return { pct, details };
}

const LOW_SAMPLE_THRESHOLD = 3;

// staffNames: string[]; tasks/attendance/learning: raw records from the API; kpiDepartments: from 'kpi' action
export function computeScores(staffNames, { tasks, attendance, learning, courses, kpiDepartments }, start, end) {
  const inR = (d) => d >= start && d <= end;
  const kpiByOwner = {};
  (kpiDepartments || []).forEach((e) => { kpiByOwner[e.owner] = e; });

  return staffNames.map((name) => {
    const myTasks = (tasks || []).filter((t) => t.staffName === name && inR(t.date));
    const taskGreen = myTasks.filter((t) => t.status === 'green').length;
    const taskYellow = myTasks.filter((t) => t.status === 'yellow').length;
    const taskRed = myTasks.filter((t) => t.status === 'red').length;
    const taskPct = myTasks.length ? Math.round(myTasks.reduce((s, t) => s + (TASK_META[t.status]?.pts ?? 0), 0) / myTasks.length) : null;

    const myAtt = (attendance || []).filter((a) => a.staffName === name && inR(a.date) && ATT_META[a.status]?.pts !== null);
    const attPct = myAtt.length ? Math.round(myAtt.reduce((s, a) => s + ATT_META[a.status].pts, 0) / myAtt.length) : null;

    const myLearn = (learning || []).filter((l) => l.staffName === name);
    const learnCompleted = (courses || []).filter((c) => myLearn.find((l) => l.courseName === c && l.status === 'completed')).length;
    const learnInProgress = (courses || []).filter((c) => myLearn.find((l) => l.courseName === c && l.status === 'inprogress')).length;
    const learnPct = (courses || []).length
      ? Math.round(courses.reduce((s, c) => {
        const l = myLearn.find((x) => x.courseName === c);
        return s + (l ? (LEARN_META[l.status]?.pts ?? 0) : 0);
      }, 0) / courses.length)
      : null;

    const kpiEntry = kpiByOwner[name];
    const { pct: kpiPct, details: kpiDetails } = computeTeamKpi(kpiEntry, start, end);

    const weighted = [];
    if (kpiPct !== null) weighted.push({ label: 'Team KPI', pct: kpiPct, weight: WEIGHTS.kpi });
    if (taskPct !== null) weighted.push({ label: 'Tasks', pct: taskPct, weight: WEIGHTS.task });
    if (attPct !== null) weighted.push({ label: 'Attendance', pct: attPct, weight: WEIGHTS.att });
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    const overall = totalWeight > 0 ? Math.round(weighted.reduce((s, w) => s + w.pct * w.weight, 0) / totalWeight) : null;
    const weightBreakdown = weighted.map((w) => ({ ...w, effectiveWeight: Math.round((w.weight / totalWeight) * 100) }));

    return {
      name, taskPct, attPct, learnPct, overall, weightBreakdown,
      taskCount: myTasks.length, taskGreen, taskYellow, taskRed,
      attCount: myAtt.length,
      learnCompleted, learnInProgress, courseTotal: (courses || []).length,
      kpiPct, kpiDetails, kpiDepartment: kpiEntry ? kpiEntry.department : null,
      kpiMetCount: kpiDetails.filter((d) => d.pts >= 100).length,
      kpiMissedCount: kpiDetails.filter((d) => d.pts < 100).length,
      lowSampleTask: myTasks.length > 0 && myTasks.length < LOW_SAMPLE_THRESHOLD,
      lowSampleKpi: kpiDetails.length > 0 && kpiDetails.length < LOW_SAMPLE_THRESHOLD,
    };
  }).sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const APPS_SCRIPT_URL = (import.meta.env.VITE_APPS_SCRIPT_URL || '').trim();
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const ALLOWED_DOMAIN = 'cedarsprohub.com';
const STATUS_OPTIONS = ['Present', 'Absent', 'Leave'];

const configIssues = [
  !APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE_YOUR_DEPLOYMENT_ID')
    ? 'VITE_APPS_SCRIPT_URL is missing or still contains the placeholder value.'
    : null,
  !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('PASTE_YOUR_CLIENT_ID')
    ? 'VITE_GOOGLE_CLIENT_ID is missing or still contains the placeholder value.'
    : null,
].filter(Boolean);

function decodeJwt(token) {
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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(value) {
  if (!value) return '-';
  const [y, m, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return value;
  return new Date(y, m - 1, day).toLocaleDateString('default', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function friendlyApiError(code) {
  const messages = {
    unauthorized: 'Your sign-in could not be verified. Please refresh and sign in again.',
    bad_request: 'The attendance request was not valid. Please try again.',
    not_found: 'That attendance record no longer exists.',
    unknown_action: 'The attendance backend did not recognize this request.',
    unknown_staff: 'That staff member is not in the staff list.',
    validation_error: 'Please check the form and try again.',
  };
  return messages[code] || 'The attendance backend returned an unexpected error.';
}

async function apiRequest(token, action, payload = {}) {
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
    throw new Error('The attendance backend did not return valid JSON.');
  }

  if (!res.ok || data.error) {
    throw new Error(friendlyApiError(data.error));
  }

  return data;
}

export default function App() {
  const [idToken, setIdToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState('');
  const buttonRef = useRef(null);

  useEffect(() => {
    if (configIssues.length > 0 || idToken) return undefined;

    let cancelled = false;
    const existingScript = document.querySelector('script[data-google-identity]');

    function initializeWhenReady() {
      if (!cancelled) initGoogle();
    }

    if (window.google?.accounts?.id) {
      initializeWhenReady();
      return undefined;
    }

    if (existingScript) {
      existingScript.addEventListener('load', initializeWhenReady, { once: true });
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', initializeWhenReady);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = initializeWhenReady;
    script.onerror = () => setAuthError('Google Sign-In could not load. Check your connection and refresh.');
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.remove();
    };
  }, [idToken]);

  function initGoogle() {
    if (!window.google?.accounts?.id || !buttonRef.current) return;

    buttonRef.current.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      hd: ALLOWED_DOMAIN,
      callback: handleCredential,
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 260,
    });
  }

  function handleCredential(response) {
    const payload = decodeJwt(response.credential);
    const email = payload?.email || '';
    if (!email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      setAuthError(`Sign-in is restricted to @${ALLOWED_DOMAIN} accounts. You signed in as ${email || 'an unknown account'}.`);
      return;
    }
    setAuthError('');
    setProfile(payload);
    setIdToken(response.credential);
  }

  function signOut() {
    window.google?.accounts?.id?.disableAutoSelect();
    setIdToken(null);
    setProfile(null);
  }

  if (configIssues.length > 0) {
    return <SetupRequired issues={configIssues} />;
  }

  if (!idToken) {
    return (
      <main className="login-screen">
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title">Cedars Attendance</h1>
          <p>Sign in with your @{ALLOWED_DOMAIN} account to continue.</p>
          <div className="google-button" ref={buttonRef} />
          {authError && <div className="error-banner">{authError}</div>}
        </section>
      </main>
    );
  }

  return <Dashboard idToken={idToken} profile={profile} onSignOut={signOut} />;
}

function SetupRequired({ issues }) {
  return (
    <main className="login-screen">
      <section className="setup-card" aria-labelledby="setup-title">
        <p className="eyebrow">Setup required</p>
        <h1 id="setup-title">Cedars Attendance</h1>
        <p className="setup-copy">Add the Vercel environment variables, then redeploy.</p>
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Dashboard({ idToken, profile, onSignOut }) {
  const [staff, setStaff] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [staffDraft, setStaffDraft] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [form, setForm] = useState({
    staffName: '',
    date: todayStr(),
    status: 'Present',
    timeIn: '08:00',
    timeOut: '17:00',
    notes: '',
  });

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [staffRes, recordsRes] = await Promise.all([
        apiRequest(idToken, 'staff'),
        apiRequest(idToken, 'list'),
      ]);
      const staffList = staffRes.staff || [];
      setStaff(staffList);
      setRecords(recordsRes.records || []);
      setForm((current) => (
        !current.staffName && staffList.length
          ? { ...current, staffName: staffList[0] }
          : current
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const summary = useMemo(() => {
    const date = todayStr();
    const todayRecords = records.filter((record) => record.date === date);
    return {
      staffCount: staff.length,
      todayCount: todayRecords.length,
      presentCount: todayRecords.filter((record) => record.status === 'Present').length,
      absentCount: todayRecords.filter((record) => record.status === 'Absent').length,
      leaveCount: todayRecords.filter((record) => record.status === 'Leave').length,
    };
  }, [records, staff.length]);

  const grouped = useMemo(() => {
    const map = {};
    const visibleRecords = dayFilter
      ? records.filter((record) => record.date === dayFilter)
      : records;

    visibleRecords.forEach((record) => {
      const date = record.date || 'Undated';
      map[date] = map[date] || [];
      map[date].push(record);
    });

    Object.values(map).forEach((entries) => {
      entries.sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)));
    });

    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [records, dayFilter]);

  function startEdit(record) {
    setNotice('');
    setEditingId(record.id);
    setForm({
      staffName: record.staffName,
      date: record.date,
      status: record.status,
      timeIn: record.timeIn || '08:00',
      timeOut: record.timeOut || '17:00',
      notes: record.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm((current) => ({
      ...current,
      date: todayStr(),
      status: 'Present',
      timeIn: '08:00',
      timeOut: '17:00',
      notes: '',
    }));
  }

  async function addStaff(event) {
    event.preventDefault();
    const name = staffDraft.trim();
    if (!name) return;

    if (staff.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already in the staff list.`);
      return;
    }

    setAddingStaff(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest(idToken, 'addStaff', { name });
      const nextStaff = result.staff || [...staff, name].sort((a, b) => a.localeCompare(b));
      setStaff(nextStaff);
      setForm((current) => ({ ...current, staffName: name }));
      setStaffDraft('');
      setNotice(`${name} was added to the staff list.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingStaff(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.staffName || !form.date) {
      setError('Choose a staff member and date before saving.');
      return;
    }

    const duplicate = records.find((record) => (
      record.staffName === form.staffName
      && record.date === form.date
      && record.id !== editingId
    ));
    if (duplicate && !window.confirm('This staff member already has a record for that date. Save another one anyway?')) {
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        staffName: form.staffName,
        date: form.date,
        status: form.status,
        timeIn: form.status === 'Present' ? form.timeIn : '',
        timeOut: form.status === 'Present' ? form.timeOut : '',
        notes: form.notes,
      };

      if (editingId) {
        await apiRequest(idToken, 'update', { id: editingId, ...payload });
      } else {
        await apiRequest(idToken, 'add', payload);
      }

      setNotice(editingId ? 'Attendance record updated.' : 'Attendance record added.');
      resetForm();
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this attendance record?')) return;

    setError('');
    setNotice('');
    try {
      await apiRequest(idToken, 'delete', { id });
      setNotice('Attendance record deleted.');
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand">Cedars Attendance</h1>
          <p className="subtitle">Daily staff register</p>
        </div>
        <div className="user-chip">
          <span>{profile?.email}</span>
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <section className="summary-grid" aria-label="Attendance summary">
        <SummaryItem label="Staff" value={summary.staffCount} />
        <SummaryItem label="Today" value={summary.todayCount} />
        <SummaryItem label="Present" value={summary.presentCount} />
        <SummaryItem label="Absent" value={summary.absentCount} />
        <SummaryItem label="Leave" value={summary.leaveCount} />
      </section>

      <section className="panel" aria-labelledby="staff-title">
        <div className="section-heading">
          <h2 id="staff-title">Staff</h2>
          <span>{staff.length} total</span>
        </div>
        <form className="inline-form" onSubmit={addStaff}>
          <label>
            Name
            <input
              type="text"
              value={staffDraft}
              onChange={(event) => setStaffDraft(event.target.value)}
              placeholder="Add staff member"
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={addingStaff || !staffDraft.trim()}>
            {addingStaff ? 'Adding...' : 'Add staff'}
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="record-title">
        <div className="section-heading">
          <h2 id="record-title">{editingId ? 'Edit record' : 'Log attendance'}</h2>
          {editingId && <span>Editing selected row</span>}
        </div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>
              Staff
              <select
                value={form.staffName}
                onChange={(event) => setForm({ ...form, staffName: event.target.value })}
                disabled={staff.length === 0}
              >
                {staff.length === 0 && <option value="">Add staff first</option>}
                {staff.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            {form.status === 'Present' && (
              <>
                <label>
                  Arrived
                  <input
                    type="time"
                    value={form.timeIn}
                    onChange={(event) => setForm({ ...form, timeIn: event.target.value })}
                  />
                </label>
                <label>
                  Signed out
                  <input
                    type="time"
                    value={form.timeOut}
                    onChange={(event) => setForm({ ...form, timeOut: event.target.value })}
                  />
                </label>
              </>
            )}
            <label className="notes-field">
              Notes
              <input
                type="text"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={saving || loading || staff.length === 0}>
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add record'}
            </button>
            {editingId && <button type="button" onClick={resetForm}>Cancel edit</button>}
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="log-title">
        <div className="log-header">
          <div className="section-heading">
            <h2 id="log-title">Attendance log</h2>
            <span>{dayFilter ? fmtDate(dayFilter) : 'All days'}</span>
          </div>
          <div className="filter-actions">
            <label>
              Day
              <input type="date" value={dayFilter} onChange={(event) => setDayFilter(event.target.value)} />
            </label>
            {dayFilter && <button type="button" onClick={() => setDayFilter('')}>Clear</button>}
          </div>
        </div>

        {loading ? (
          <p className="empty">Loading...</p>
        ) : grouped.length === 0 ? (
          <p className="empty">No attendance logged yet.</p>
        ) : (
          grouped.map(([date, entries]) => (
            <div key={date} className="day-group">
              <div className="day-heading">{fmtDate(date)}</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Status</th>
                      <th>Arrived</th>
                      <th>Signed out</th>
                      <th>Notes</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((record) => (
                      <tr key={record.id}>
                        <td>{record.staffName}</td>
                        <td>
                          <span className={`status-badge status-${record.status?.toLowerCase()}`}>
                            {record.status}
                          </span>
                        </td>
                        <td>{record.timeIn || '-'}</td>
                        <td>{record.timeOut || '-'}</td>
                        <td>{record.notes || ''}</td>
                        <td className="row-actions">
                          <button type="button" onClick={() => startEdit(record)}>Edit</button>
                          <button type="button" onClick={() => remove(record.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

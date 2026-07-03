import React, { useEffect, useMemo, useRef, useState } from 'react';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const ALLOWED_DOMAIN = 'cedarsprohub.com';

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch (e) {
    return null;
  }
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function apiGet(token, action) {
  const url = `${APPS_SCRIPT_URL}?token=${encodeURIComponent(token)}&action=${action}`;
  const res = await fetch(url);
  return res.json();
}

async function apiPost(token, action, payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // text/plain avoids a CORS preflight, which Apps Script web apps don't handle.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, action, ...payload }),
  });
  return res.json();
}

export default function App() {
  const [idToken, setIdToken] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState('');
  const buttonRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = initGoogle;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  function initGoogle() {
    if (!window.google) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      hd: ALLOWED_DOMAIN,
      callback: handleCredential,
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
    });
  }

  function handleCredential(response) {
    const payload = decodeJwt(response.credential);
    const email = payload?.email || '';
    if (!email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN)) {
      setAuthError(`Sign-in is restricted to @${ALLOWED_DOMAIN} accounts. You signed in as ${email || 'an unknown account'}.`);
      return;
    }
    setAuthError('');
    setProfile(payload);
    setIdToken(response.credential);
  }

  if (!idToken) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Cedars Attendance</h1>
          <p>Sign in with your @{ALLOWED_DOMAIN} account to continue.</p>
          <div ref={buttonRef} />
          {authError && <div className="error-banner">{authError}</div>}
        </div>
      </div>
    );
  }

  return <Dashboard idToken={idToken} profile={profile} onSignOut={() => { setIdToken(null); setProfile(null); }} />;
}

function Dashboard({ idToken, profile, onSignOut }) {
  const [staff, setStaff] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ staffName: '', date: todayStr(), status: 'Present', timeIn: '08:00', timeOut: '17:00', notes: '' });
  const [dayFilter, setDayFilter] = useState('');

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [staffRes, recordsRes] = await Promise.all([
        apiGet(idToken, 'staff'),
        apiGet(idToken, 'list'),
      ]);
      if (staffRes.error || recordsRes.error) {
        setError('Your sign-in could not be verified. Please refresh and sign in again.');
        return;
      }
      setStaff(staffRes.staff || []);
      setRecords(recordsRes.records || []);
      if (!form.staffName && staffRes.staff?.length) {
        setForm((f) => ({ ...f, staffName: staffRes.staff[0] }));
      }
    } catch (e) {
      setError('Could not reach the attendance sheet. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  const grouped = useMemo(() => {
    const map = {};
    let list = records;
    if (dayFilter) list = list.filter((r) => r.date === dayFilter);
    list.forEach((r) => { (map[r.date] = map[r.date] || []).push(r); });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [records, dayFilter]);

  function startEdit(r) {
    setEditingId(r.id);
    setForm({ staffName: r.staffName, date: r.date, status: r.status, timeIn: r.timeIn || '08:00', timeOut: r.timeOut || '17:00', notes: r.notes || '' });
  }
  function resetForm() {
    setEditingId(null);
    setForm((f) => ({ ...f, date: todayStr(), status: 'Present', timeIn: '08:00', timeOut: '17:00', notes: '' }));
  }

  async function submit() {
    if (!form.staffName || !form.date) return;
    setSaving(true);
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
        await apiPost(idToken, 'update', { id: editingId, ...payload });
      } else {
        await apiPost(idToken, 'add', payload);
      }
      resetForm();
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this attendance record?')) return;
    await apiPost(idToken, 'delete', { id });
    await loadAll();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Cedars Attendance</div>
          <div className="subtitle">Manual check-in log</div>
        </div>
        <div className="user-chip">
          <span>{profile?.email}</span>
          <button onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="card">
        <h2>{editingId ? 'Edit record' : 'Log attendance'}</h2>
        <div className="form-row">
          <label>Staff
            <select value={form.staffName} onChange={(e) => setForm({ ...form, staffName: e.target.value })}>
              {staff.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Date
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label>Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Present</option>
              <option>Absent</option>
              <option>Leave</option>
            </select>
          </label>
          {form.status === 'Present' && (
            <>
              <label>Arrived
                <input type="time" value={form.timeIn} onChange={(e) => setForm({ ...form, timeIn: e.target.value })} />
              </label>
              <label>Signed out
                <input type="time" value={form.timeOut} onChange={(e) => setForm({ ...form, timeOut: e.target.value })} />
              </label>
            </>
          )}
          <label className="notes-field">Notes
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </label>
        </div>
        <div className="form-actions">
          <button className="primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add record'}</button>
          {editingId && <button onClick={resetForm}>Cancel edit</button>}
        </div>
      </section>

      <section className="card">
        <div className="log-header">
          <h2>Attendance log by day</h2>
          <label>Filter to one day
            <input type="date" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} />
          </label>
          {dayFilter && <button onClick={() => setDayFilter('')}>Clear</button>}
        </div>
        {loading ? <p>Loading…</p> : grouped.length === 0 ? <p className="empty">No attendance logged yet.</p> : (
          grouped.map(([date, entries]) => (
            <div key={date} className="day-group">
              <div className="day-heading">{fmtDate(date)}</div>
              <table>
                <thead>
                  <tr><th>Staff</th><th>Status</th><th>Arrived</th><th>Signed out</th><th>Notes</th><th></th></tr>
                </thead>
                <tbody>
                  {entries.map((r) => (
                    <tr key={r.id}>
                      <td>{r.staffName}</td>
                      <td><span className={`status-badge status-${r.status?.toLowerCase()}`}>{r.status}</span></td>
                      <td>{r.timeIn || '—'}</td>
                      <td>{r.timeOut || '—'}</td>
                      <td>{r.notes || ''}</td>
                      <td className="row-actions">
                        <button onClick={() => startEdit(r)}>Edit</button>
                        <button onClick={() => remove(r.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

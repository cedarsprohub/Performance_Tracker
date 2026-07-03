import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, periodRange, periodLabel, shiftPeriod, computeScores } from './lib/api.js';
import DashboardTab from './tabs/DashboardTab.jsx';
import KaizenTab from './tabs/KaizenTab.jsx';
import AttendanceTab from './tabs/AttendanceTab.jsx';
import UpskillingTab from './tabs/UpskillingTab.jsx';
import TeamKpiTab from './tabs/TeamKpiTab.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'kpi', label: 'Team KPI' },
  { id: 'kaizen', label: 'Kaizen' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'upskilling', label: 'Upskilling' },
];

export default function Shell({ idToken, profile, onSignOut }) {
  const [tab, setTab] = useState('dashboard');
  const [periodType, setPeriodType] = useState('month');
  const [periodRef, setPeriodRef] = useState(new Date());
  const [data, setData] = useState({ staff: [], attendance: [], tasks: [], courses: [], learning: [], kpiDepartments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [start, end] = useMemo(() => periodRange(periodType, periodRef), [periodType, periodRef]);

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [staffRes, attRes, taskRes, courseRes, learnRes, kpiRes] = await Promise.all([
        apiRequest(idToken, 'staff'),
        apiRequest(idToken, 'list'),
        apiRequest(idToken, 'tasks'),
        apiRequest(idToken, 'courses'),
        apiRequest(idToken, 'learning'),
        apiRequest(idToken, 'kpi'),
      ]);
      setData({
        staff: staffRes.staff || [],
        attendance: attRes.records || [],
        tasks: taskRes.tasks || [],
        courses: courseRes.courses || [],
        learning: learnRes.learning || [],
        kpiDepartments: kpiRes.departments || [],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [idToken]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const scores = useMemo(
    () => computeScores(data.staff, data, start, end),
    [data, start, end]
  );

  const notifyAndReload = useCallback(async (message) => {
    setNotice(message);
    await loadAll({ quiet: true });
  }, [loadAll]);

  const ctx = { idToken, data, scores, start, end, loading, notifyAndReload, setError };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand">Cedars Performance Tracker</h1>
          <p className="subtitle">Kaizen tasks · attendance · upskilling · team KPI</p>
        </div>
        <div className="user-chip">
          <span>{profile?.email}</span>
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <nav className="tab-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-button ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="period-bar">
        <div className="period-label">
          {periodLabel(periodType, periodRef)}
          <button type="button" onClick={() => setPeriodRef(shiftPeriod(periodType, periodRef, -1))}>&larr;</button>
          <button type="button" onClick={() => setPeriodRef(shiftPeriod(periodType, periodRef, 1))}>&rarr;</button>
        </div>
        <div className="period-toggle">
          {['month', 'quarter', 'year'].map((p) => (
            <button key={p} type="button" className={periodType === p ? 'active' : ''} onClick={() => setPeriodType(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="empty">Loading...</p> : (
        <>
          {tab === 'dashboard' && <DashboardTab {...ctx} />}
          {tab === 'kpi' && <TeamKpiTab {...ctx} />}
          {tab === 'kaizen' && <KaizenTab {...ctx} />}
          {tab === 'attendance' && <AttendanceTab {...ctx} />}
          {tab === 'upskilling' && <UpskillingTab {...ctx} />}
        </>
      )}
    </main>
  );
}

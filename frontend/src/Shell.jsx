import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, periodRange, periodLabel, shiftPeriod, computeScores, scanSinceFor } from './lib/api.js';
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [start, end] = useMemo(() => periodRange(periodType, periodRef), [periodType, periodRef]);

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const since = scanSinceFor(start);
      const specs = [
        ['staff', {}, 'staff'], ['list', {}, 'attendance'], ['tasks', {}, 'tasks'],
        ['liveTasks', { since }, 'liveTasks'], ['courses', {}, 'courses'], ['learning', {}, 'learning'],
        ['liveLearning', {}, 'liveLearning'], ['kpi', {}, 'kpi'],
      ];
      const settled = await Promise.allSettled(specs.map(([action, payload]) => apiRequest(idToken, action, payload)));

      const results = {};
      const failures = [];
      settled.forEach((outcome, i) => {
        const [, , key] = specs[i];
        if (outcome.status === 'fulfilled') results[key] = outcome.value;
        else failures.push(`${key} (${outcome.reason.message})`);
      });

      // Merge: live reads from the Kaizen sheet (WorkPlan / Staff Development
      // Tracker) are the source of truth for anything they cover; entries
      // added directly through this app (stored in the Tasks/Courses/
      // Learning tabs) are added on top for anything not already there.
      const tasks = [...(results.liveTasks?.tasks || []), ...(results.tasks?.tasks || [])];

      const courses = Array.from(new Set([...(results.liveLearning?.courses || []), ...(results.courses?.courses || [])]));

      const learningMap = {};
      (results.learning?.learning || []).forEach((l) => { learningMap[`${l.staffName}|${l.courseName}`] = { ...l, live: false }; });
      (results.liveLearning?.learning || []).forEach((l) => { learningMap[`${l.staffName}|${l.courseName}`] = { ...l, live: true }; }); // live wins
      const learning = Object.values(learningMap);

      setData({
        staff: results.staff?.staff || [],
        attendance: results.attendance?.records || [],
        tasks,
        courses,
        learning,
        kpiDepartments: results.kpi?.departments || [],
      });
      setLastRefreshed(new Date());

      if (failures.length > 0) {
        setError(`Some data couldn't load: ${failures.join('; ')}. The rest of the dashboard below still reflects whatever did load successfully.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [idToken, start]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    setNotice('');
    await loadAll({ quiet: true });
    setRefreshing(false);
    setNotice('Refreshed with the latest data from Google Sheets.');
  }, [loadAll]);

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
          <button type="button" className="refresh-button" onClick={manualRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span>{profile?.email}</span>
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {lastRefreshed && (
        <p className="refresh-note">
          Live from Google Sheets · last refreshed {lastRefreshed.toLocaleTimeString()}
        </p>
      )}

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

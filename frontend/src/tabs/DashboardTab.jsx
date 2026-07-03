import React, { useState } from 'react';

function ScoreBadge({ value, size = 'md', low = false, count = null }) {
  if (value === null || value === undefined) return <span className="muted">-</span>;
  const color = value >= 75 ? '#178a50' : value >= 50 ? '#b7791f' : '#c9352b';
  return (
    <span className="score-badge">
      <span style={{ color, fontSize: size === 'lg' ? 20 : 14, fontWeight: 700 }}>{value}%</span>
      {low && <span className="low-n" title="Small sample size">low n{count !== null ? ` (${count})` : ''}</span>}
    </span>
  );
}

export default function DashboardTab({ scores }) {
  const [expanded, setExpanded] = useState(null);
  const ranked = scores.filter((s) => s.overall !== null);
  const podium = ranked.slice(0, 3);
  const medalColor = ['#f1c232', '#b9c1cc', '#d7924a'];

  return (
    <div className="tab-content">
      {ranked.length === 0 ? <p className="empty">No scored activity in this period yet.</p> : (
        <div className="podium-grid">
          {podium.map((s, i) => (
            <div key={s.name} className="podium-card">
              <span className="medal" style={{ background: medalColor[i] + '33', color: medalColor[i] }}>#{i + 1}</span>
              <div>
                <div className="podium-name">{s.name}</div>
                <div className="podium-score">{s.overall}% overall</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="section-heading"><h2>Full ranking</h2><span>Click a row for the breakdown</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>Staff</th><th>Tasks (30%)</th><th>Attendance (10%)</th>
                <th>Learning</th><th>Team KPI (60%)</th><th>Overall</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s, i) => (
                <React.Fragment key={s.name}>
                  <tr className="clickable" onClick={() => setExpanded(expanded === s.name ? null : s.name)}>
                    <td>{i + 1}</td>
                    <td>{s.name}</td>
                    <td><ScoreBadge value={s.taskPct} low={s.lowSampleTask} count={s.taskCount} /></td>
                    <td><ScoreBadge value={s.attPct} /></td>
                    <td><ScoreBadge value={s.learnPct} /></td>
                    <td><ScoreBadge value={s.kpiPct} low={s.lowSampleKpi} count={s.kpiDetails.length} /></td>
                    <td><ScoreBadge value={s.overall} size="lg" /></td>
                  </tr>
                  {expanded === s.name && (
                    <tr className="expand-row">
                      <td colSpan={7}>
                        <div className="breakdown-grid">
                          <div className="breakdown-card">
                            <div className="breakdown-title" style={{ color: '#178a50' }}>Tasks - {s.taskPct === null ? 'no data' : `${s.taskPct}%`}</div>
                            {s.taskCount === 0 ? <div className="muted">No tasks logged.</div> : (
                              <div className="muted">
                                {s.taskGreen} done · {s.taskYellow} sprint · {s.taskRed} not done
                                <div>out of {s.taskCount} logged</div>
                              </div>
                            )}
                          </div>
                          <div className="breakdown-card">
                            <div className="breakdown-title">Attendance - {s.attPct === null ? 'no data' : `${s.attPct}%`}</div>
                            <div className="muted">{s.attCount} days logged this period</div>
                          </div>
                          <div className="breakdown-card">
                            <div className="breakdown-title" style={{ color: '#f1c232' }}>Learning - {s.learnPct === null ? 'no data' : `${s.learnPct}%`} <span className="muted">(not scored)</span></div>
                            <div className="muted">{s.learnCompleted} completed · {s.learnInProgress} in progress out of {s.courseTotal}</div>
                          </div>
                          <div className="breakdown-card">
                            <div className="breakdown-title" style={{ color: '#17406f' }}>Team KPI - {s.kpiPct === null ? 'no data' : `${s.kpiPct}%`}</div>
                            {!s.kpiDepartment ? <div className="muted">Doesn't own a tracked KPI sheet.</div> : (
                              <div className="muted kpi-list">
                                <div>{s.kpiDepartment}</div>
                                {s.kpiDetails.map((d, di) => (
                                  <div key={di}>{d.kpi} ({d.month}): {d.achieved} / {d.target} -&gt; {d.pts}%</div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="muted small-note">
                          Overall ({s.overall === null ? '-' : `${s.overall}%`}) = weighted average of {s.weightBreakdown.map((w) => `${w.label} ${w.pct}% x ${w.effectiveWeight}%`).join(' + ') || 'no scored categories yet'}.
                          Missing categories are excluded and remaining weights rescale to 100%.
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {scores.length === 0 && <tr><td colSpan={7} className="empty">Add staff to see rankings.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

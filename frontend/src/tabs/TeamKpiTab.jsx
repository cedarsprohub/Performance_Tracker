import React from 'react';

export default function TeamKpiTab({ scores }) {
  const owners = scores.filter((s) => s.kpiDepartment);
  const ranked = [...owners].filter((s) => s.kpiPct !== null).sort((a, b) => b.kpiPct - a.kpiPct);

  return (
    <div className="tab-content">
      <div className="panel">
        <div className="section-heading"><h2>Top Team KPI performers</h2><span>Carries 60% of Overall</span></div>
        <div className="chip-row">
          {ranked.map((s, i) => (
            <div key={s.name} className="chip-card">
              <span className={i === 0 ? 'trophy gold' : 'trophy'}>#{i + 1}</span>
              <span>{s.name}</span>
              <span className="muted">{s.kpiPct}% - {s.kpiMetCount} met, {s.kpiMissedCount} missed</span>
            </div>
          ))}
          {ranked.length === 0 && <p className="empty">No KPI figures logged for this period yet.</p>}
        </div>
      </div>

      {owners.length === 0 ? <p className="empty">No staff currently own a tracked KPI sheet.</p> : owners.map((s) => (
        <div key={s.name} className="panel">
          <div className="section-heading">
            <h2>{s.name}</h2>
            <span>{s.kpiDepartment} - {s.kpiMetCount} met, {s.kpiMissedCount} missed</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>KPI</th><th>Month</th><th>Target</th><th>Achieved</th><th>Result</th></tr></thead>
              <tbody>
                {s.kpiDetails.map((d, i) => (
                  <tr key={i}>
                    <td>{d.kpi}</td>
                    <td className="muted">{d.month}</td>
                    <td className="mono right">{d.target}</td>
                    <td className="mono right">{d.achieved}</td>
                    <td>
                      <span className={`status-badge ${d.pts >= 100 ? 'status-present' : 'status-absent'}`}>
                        {d.pts >= 100 ? 'Met' : 'Missed'} ({d.pts}%)
                      </span>
                    </td>
                  </tr>
                ))}
                {s.kpiDetails.length === 0 && <tr><td colSpan={5} className="empty">No target/achieved figures for this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

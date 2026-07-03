import React, { useMemo, useState } from 'react';
import { apiRequest, fmtDate, todayStr, TASK_META } from '../lib/api.js';

export default function KaizenTab({ idToken, data, start, end, notifyAndReload, setError }) {
  const { staff, tasks } = data;
  const [date, setDate] = useState(todayStr() >= start && todayStr() <= end ? todayStr() : end);
  const [staffName, setStaffName] = useState(staff[0] || '');
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState('green');
  const [busy, setBusy] = useState(false);

  const periodTasks = useMemo(() => tasks.filter((t) => t.date >= start && t.date <= end), [tasks, start, end]);
  const dayTasks = tasks.filter((t) => t.date === date);
  const byStaff = staff.map((s) => ({ s, items: dayTasks.filter((t) => t.staffName === s) }));

  const summary = useMemo(() => {
    return staff.map((s) => {
      const mine = periodTasks.filter((t) => t.staffName === s);
      return {
        name: s,
        done: mine.filter((t) => t.status === 'green').length,
        notDone: mine.filter((t) => t.status === 'red').length,
        sprint: mine.filter((t) => t.status === 'yellow').length,
        total: mine.length,
      };
    }).sort((a, b) => b.done - a.done);
  }, [staff, periodTasks]);

  async function addTask() {
    if (!staffName || !label.trim()) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(idToken, 'addTask', { staffName, date, label: label.trim(), status });
      setLabel('');
      await notifyAndReload('Task added.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cycleStatus(task) {
    const order = ['red', 'yellow', 'green'];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    try {
      await apiRequest(idToken, 'updateTaskStatus', { id: task.id, status: next });
      await notifyAndReload('Task updated.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeTask(id) {
    try {
      await apiRequest(idToken, 'deleteTask', { id });
      await notifyAndReload('Task removed.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tab-content">
      <div className="panel">
        <div className="section-heading"><h2>Monthly summary</h2><span>Totals for the selected period</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Staff</th><th>Done</th><th>Not done</th><th>Sprint</th><th>Total</th></tr></thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td style={{ color: TASK_META.green.color }}>{s.done}</td>
                  <td style={{ color: TASK_META.red.color }}>{s.notDone}</td>
                  <td style={{ color: TASK_META.yellow.color }}>{s.sprint}</td>
                  <td className="muted">{s.total}</td>
                </tr>
              ))}
              {summary.length === 0 && <tr><td colSpan={5} className="empty">No staff yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="section-heading"><h2>Daily task log</h2><span>Click a chip to cycle its status</span></div>
        <div className="inline-form-row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <select value={staffName} onChange={(e) => setStaffName(e.target.value)}>
            {staff.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Task description" className="grow" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="green">Done</option>
            <option value="yellow">Sprint</option>
            <option value="red">Not done</option>
          </select>
          <button className="primary" type="button" disabled={busy || !staffName} onClick={addTask}>{busy ? 'Adding...' : 'Add'}</button>
        </div>

        <div className="task-log">
          {byStaff.map(({ s, items }) => (
            <div key={s} className="task-row">
              <div className="task-staff">{s} <span className="muted">({items.length})</span></div>
              <div className="task-chips">
                {items.length === 0 && <span className="muted">No tasks logged</span>}
                {items.map((t) => (
                  <span key={t.id} className="task-chip" style={{ background: TASK_META[t.status].color + '22' }}>
                    <button type="button" onClick={() => cycleStatus(t)}>
                      <span className="dot" style={{ background: TASK_META[t.status].color }} />
                      {t.label}
                    </button>
                    <button type="button" className="chip-remove" onClick={() => removeTask(t.id)}>x</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

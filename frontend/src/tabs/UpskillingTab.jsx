import React, { useMemo, useState } from 'react';
import { apiRequest, LEARN_META } from '../lib/api.js';

const CYCLE = [null, 'inprogress', 'completed'];

export default function UpskillingTab({ idToken, data, scores, notifyAndReload, setError }) {
  const { staff, courses, learning } = data;
  const [courseDraft, setCourseDraft] = useState('');
  const [addingCourse, setAddingCourse] = useState(false);

  const byKey = useMemo(() => {
    const map = {};
    learning.forEach((l) => { map[`${l.staffName}|${l.courseName}`] = l; });
    return map;
  }, [learning]);

  const topLearners = [...scores].filter((s) => s.learnPct !== null).sort((a, b) => b.learnPct - a.learnPct).slice(0, 3);

  async function addCourse() {
    const name = courseDraft.trim();
    if (!name) return;
    setAddingCourse(true);
    try {
      await apiRequest(idToken, 'addCourse', { name });
      setCourseDraft('');
      await notifyAndReload(`${name} added to the course catalogue.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingCourse(false);
    }
  }

  async function cycleCell(staffName, courseName, entry) {
    if (entry?.live) return; // synced from the Staff Development Tracker sheet — edit it there
    const current = entry ? entry.status : null;
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    try {
      await apiRequest(idToken, 'setLearning', { staffName, courseName, status: next || '' });
      await notifyAndReload('Updated.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tab-content">
      <div className="panel">
        <div className="section-heading"><h2>Top learners</h2><span>By overall course completion</span></div>
        <div className="chip-row">
          {topLearners.map((s, i) => (
            <div key={s.name} className="chip-card">
              <span className={i === 0 ? 'trophy gold' : 'trophy'}>#{i + 1}</span>
              <span>{s.name}</span>
              <span className="muted">{s.learnPct}%</span>
            </div>
          ))}
          {topLearners.length === 0 && <p className="empty">No learning activity logged yet.</p>}
        </div>
      </div>

      <div className="panel">
        <div className="section-heading"><h2>Courses</h2><span>{courses.length} total</span></div>
        <div className="inline-form-row">
          <input type="text" value={courseDraft} onChange={(e) => setCourseDraft(e.target.value)} placeholder="Add course" />
          <button type="button" disabled={addingCourse || !courseDraft.trim()} onClick={addCourse}>{addingCourse ? 'Adding...' : 'Add course'}</button>
        </div>
      </div>

      <div className="panel">
        <div className="section-heading"><h2>Course completion</h2><span>Click a cell to cycle: blank -&gt; in progress -&gt; completed</span></div>
        <div className="table-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Staff</th>
                {courses.map((c) => <th key={c} className="rotated"><span>{c}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s}>
                  <td className="sticky-col">{s}</td>
                  {courses.map((c) => {
                    const entry = byKey[`${s}|${c}`];
                    const meta = entry ? LEARN_META[entry.status] : null;
                    return (
                      <td key={c} className="center">
                        <button
                          type="button"
                          className={`dot-button ${entry?.live ? 'locked' : ''}`}
                          style={{ background: meta ? meta.color : 'white', border: meta ? 'none' : '2px solid #cbd5e1' }}
                          title={entry?.live ? `${meta.label} — synced from the tracker sheet` : (meta ? meta.label : 'Not started')}
                          onClick={() => cycleCell(s, c, entry)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {staff.length === 0 && <tr><td colSpan={courses.length + 1} className="empty">Add staff first.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

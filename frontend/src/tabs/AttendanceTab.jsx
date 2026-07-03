import React, { useMemo, useState } from 'react';
import { apiRequest, fmtDate, todayStr } from '../lib/api.js';

const STATUS_OPTIONS = ['Present', 'Absent', 'Leave'];

export default function AttendanceTab({ idToken, data, start, end, notifyAndReload, setError }) {
  const { staff, attendance } = data;
  const [editingId, setEditingId] = useState(null);
  const [staffDraft, setStaffDraft] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dayFilter, setDayFilter] = useState('');
  const [form, setForm] = useState({
    staffName: staff[0] || '', date: todayStr(), status: 'Present', timeIn: '08:00', timeOut: '17:00', notes: '',
  });

  const periodRecords = useMemo(() => attendance.filter((a) => a.date >= start && a.date <= end), [attendance, start, end]);

  const grouped = useMemo(() => {
    const map = {};
    const visible = dayFilter ? periodRecords.filter((r) => r.date === dayFilter) : periodRecords;
    visible.forEach((r) => { (map[r.date] = map[r.date] || []).push(r); });
    Object.values(map).forEach((rows) => rows.sort((a, b) => a.staffName.localeCompare(b.staffName)));
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [periodRecords, dayFilter]);

  function startEdit(record) {
    setEditingId(record.id);
    setForm({
      staffName: record.staffName, date: record.date, status: record.status,
      timeIn: record.timeIn || '08:00', timeOut: record.timeOut || '17:00', notes: record.notes || '',
    });
  }
  function resetForm() {
    setEditingId(null);
    setForm((f) => ({ ...f, date: todayStr(), status: 'Present', timeIn: '08:00', timeOut: '17:00', notes: '' }));
  }

  async function addStaff() {
    const name = staffDraft.trim();
    if (!name) return;
    if (staff.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already in the staff list.`);
      return;
    }
    setAddingStaff(true);
    try {
      await apiRequest(idToken, 'addStaff', { name });
      setStaffDraft('');
      setForm((f) => ({ ...f, staffName: name }));
      await notifyAndReload(`${name} was added to the staff list.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingStaff(false);
    }
  }

  async function submit() {
    if (!form.staffName || !form.date) { setError('Choose a staff member and date before saving.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        staffName: form.staffName, date: form.date, status: form.status,
        timeIn: form.status === 'Present' ? form.timeIn : '',
        timeOut: form.status === 'Present' ? form.timeOut : '',
        notes: form.notes,
      };
      if (editingId) await apiRequest(idToken, 'update', { id: editingId, ...payload });
      else await apiRequest(idToken, 'add', payload);
      resetForm();
      await notifyAndReload(editingId ? 'Attendance record updated.' : 'Attendance record added.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this attendance record?')) return;
    try {
      await apiRequest(idToken, 'delete', { id });
      await notifyAndReload('Attendance record deleted.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="tab-content">
      <div className="panel">
        <div className="section-heading"><h2>Staff</h2><span>{staff.length} total</span></div>
        <div className="inline-form-row">
          <input type="text" value={staffDraft} onChange={(e) => setStaffDraft(e.target.value)} placeholder="Add staff member" />
          <button type="button" disabled={addingStaff || !staffDraft.trim()} onClick={addStaff}>{addingStaff ? 'Adding...' : 'Add staff'}</button>
        </div>
      </div>

      <div className="panel">
        <div className="section-heading"><h2>{editingId ? 'Edit record' : 'Log attendance'}</h2>{editingId && <span>Editing selected row</span>}</div>
        <div className="inline-form-row">
          <select value={form.staffName} onChange={(e) => setForm({ ...form, staffName: e.target.value })} disabled={staff.length === 0}>
            {staff.length === 0 && <option value="">Add staff first</option>}
            {staff.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
          {form.status === 'Present' && (
            <>
              <label>Arrived
                <input
                  type="time"
                  value={form.timeIn}
                  onChange={(e) => setForm({ ...form, timeIn: e.target.value })}
                  disabled={!!editingId}
                  title={editingId ? "Arrival time is locked once saved — only sign-out time can be edited." : ""}
                />
              </label>
              <label>Out <input type="time" value={form.timeOut} onChange={(e) => setForm({ ...form, timeOut: e.target.value })} /></label>
            </>
          )}
          <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" className="grow" />
          <button className="primary" type="button" disabled={saving || staff.length === 0} onClick={submit}>
            {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add record'}
          </button>
          {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </div>

      <div className="panel">
        <div className="log-header">
          <div className="section-heading"><h2>Attendance log</h2><span>{dayFilter ? fmtDate(dayFilter) : 'All days in period'}</span></div>
          <div className="filter-actions">
            <label>Day <input type="date" value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} /></label>
            {dayFilter && <button type="button" onClick={() => setDayFilter('')}>Clear</button>}
          </div>
        </div>
        {grouped.length === 0 ? <p className="empty">No attendance logged in this period.</p> : (
          grouped.map(([date, entries]) => (
            <div key={date} className="day-group">
              <div className="day-heading">{fmtDate(date)}</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Staff</th><th>Status</th><th>Arrived</th><th>Signed out</th><th>Notes</th><th></th></tr></thead>
                  <tbody>
                    {entries.map((r) => (
                      <tr key={r.id}>
                        <td>{r.staffName}</td>
                        <td><span className={`status-badge status-${r.status?.toLowerCase()}`}>{r.status}</span></td>
                        <td>{r.timeIn || '-'}</td>
                        <td>{r.timeOut || '-'}</td>
                        <td>{r.notes || ''}</td>
                        <td className="row-actions">
                          <button type="button" onClick={() => startEdit(r)}>Edit</button>
                          <button type="button" onClick={() => remove(r.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { supabase, fetchExamsFromCloud } from '../services/supabaseService';
import { MCQExamConfig } from '../types/mcq';

export const AdminMCQTicketIssuer: React.FC = () => {
  const [exams, setExams] = useState<MCQExamConfig[]>([]);
  const [examId, setExamId] = useState('');
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [department, setDepartment] = useState('CSE');
  const [semester, setSemester] = useState('4th Sem');
  const [division, setDivision] = useState('A');
  const [ttlHours, setTtlHours] = useState(24);
  const [ticketUrl, setTicketUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void fetchExamsFromCloud().then((rows) => {
      if (!active) return;
      const published = (rows || []).filter((exam) => exam.status === 'PUBLISHED');
      setExams(published);
      setExamId((current) => current || published[0]?.id || '');
      setLoading(false);
    }).catch(() => {
      if (active) {
        setError('Could not load published exams. Confirm the trusted administrator session and Supabase connection.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const issueTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setTicketUrl('');
    if (!examId || !name.trim() || !roll.trim()) {
      setError('Choose a published exam and enter the candidate name and roll number.');
      return;
    }
    setIssuing(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('issue_mcq_candidate_ticket', {
        p_exam_id: examId,
        p_student_name: name.trim(),
        p_student_roll: roll.trim(),
        p_student_dept: department.trim(),
        p_student_sem: semester.trim(),
        p_student_div: division.trim(),
        p_ttl_hours: ttlHours
      });
      if (rpcError) throw new Error(rpcError.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.ticket_token) throw new Error('The server did not return a candidate ticket.');
      // Use the URL fragment so the bearer token is not sent in HTTP requests or referrer headers.
      const url = `${window.location.origin}/mcq#ticket=${encodeURIComponent(row.ticket_token)}`;
      setTicketUrl(url);
      setExpiresAt(row.ticket_expires_at || '');
      setNotice('Ticket issued. Share this link privately with the intended candidate. Anyone holding the link can use it until it expires or is revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to issue candidate ticket.');
    } finally {
      setIssuing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(ticketUrl);
      setNotice('Secure candidate link copied.');
    } catch {
      setNotice('Copy was blocked by the browser. Select and copy the link manually.');
    }
  };

  return <main style={page}><section style={panel}>
    <p style={eyebrow}>AXENT · EXAM AUTHORITY</p>
    <h1 style={{ marginBottom: 8 }}>Issue a secure MCQ ticket</h1>
    <p style={{ color: '#64748b', lineHeight: 1.6 }}>Candidate access is issued per exam. The database stores only a hash of the random ticket; the full link is shown once here.</p>
    {loading ? <p>Loading published exams…</p> : exams.length === 0 ? <p role="alert">No published exams are available. Publish an exam before issuing candidate tickets.</p> : (
      <form onSubmit={(event) => void issueTicket()} style={{ display: 'grid', gap: 14, marginTop: 22 }}>
        <label style={label}>Published examination
          <select required value={examId} onChange={(e) => setExamId(e.target.value)} style={input}>
            {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
          </select>
        </label>
        <div style={twoCols}>
          <label style={label}>Candidate full name<input required value={name} onChange={(e) => setName(e.target.value)} style={input} autoComplete="off" /></label>
          <label style={label}>Roll number / USN<input required value={roll} onChange={(e) => setRoll(e.target.value)} style={input} autoComplete="off" /></label>
        </div>
        <div style={twoCols}>
          <label style={label}>Department<input value={department} onChange={(e) => setDepartment(e.target.value)} style={input} /></label>
          <label style={label}>Semester<input value={semester} onChange={(e) => setSemester(e.target.value)} style={input} /></label>
        </div>
        <div style={twoCols}>
          <label style={label}>Division<input value={division} onChange={(e) => setDivision(e.target.value)} style={input} /></label>
          <label style={label}>Ticket validity
            <select value={ttlHours} onChange={(e) => setTtlHours(Number(e.target.value))} style={input}>
              <option value={1}>1 hour</option><option value={4}>4 hours</option><option value={12}>12 hours</option><option value={24}>24 hours</option><option value={48}>48 hours</option><option value={168}>7 days</option>
            </select>
          </label>
        </div>
        <button disabled={issuing || loading} style={primaryButton}>{issuing ? 'Issuing securely…' : 'Issue candidate link'}</button>
      </form>
    )}
    {error && <p role="alert" style={{ color: '#dc2626', marginTop: 16 }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#166534', marginTop: 16 }}>{notice}</p>}
    {ticketUrl && <div style={linkBox}>
      <strong>Candidate link — shown once</strong>
      <p style={{ overflowWrap: 'anywhere', fontSize: 13 }}>{ticketUrl}</p>
      <button type="button" onClick={() => void copyLink()} style={secondaryButton}>Copy secure link</button>
      {expiresAt && <p style={{ fontSize: 12, color: '#64748b' }}>Expires: {new Date(expiresAt).toLocaleString()}</p>}
      <p style={{ fontSize: 12, color: '#b45309' }}>Treat this link like a password. It grants access to the named candidate's exam until it expires or is revoked.</p>
    </div>}
  </section></main>;
};

const page: React.CSSProperties = { minHeight: 'calc(100vh - 52px)', background: 'var(--bg-main)', padding: '32px 16px', color: 'var(--text-primary)' };
const panel: React.CSSProperties = { maxWidth: 760, margin: '0 auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, boxShadow: '0 12px 40px rgba(15,23,42,.08)' };
const eyebrow: React.CSSProperties = { color: '#64748b', letterSpacing: '.14em', fontSize: 11, fontWeight: 800 };
const label: React.CSSProperties = { display: 'grid', gap: 7, fontSize: 13, fontWeight: 700 };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: 14 };
const twoCols: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const primaryButton: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 700, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontWeight: 600, cursor: 'pointer' };
const linkBox: React.CSSProperties = { marginTop: 22, border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--bg-main)' };

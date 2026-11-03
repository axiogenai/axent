import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  UserPlus,
  Key,
  Copy,
  Check,
  Download,
  Trash2,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  FileText
} from 'lucide-react';
import {
  CodeSparkCandidate,
  getAllCodeSparkCandidates,
  importCodeSparkCandidates,
  importCodeSparkCandidatesDirect,
  parseCandidateImportText,
  saveCodeSparkCandidates,
  deleteCodeSparkCandidateComplete,
  onCodeSparkCandidatesChanged,
  syncCandidatesFromCloud
} from '../../services/codeSparkService';
import { getAllExams } from '../../services/mcqService';
import { playSound } from '../../utils/sounds';

interface CodeSparkCandidateImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetExamId?: string;
}

export const CodeSparkCandidateImportModal: React.FC<CodeSparkCandidateImportModalProps> = ({
  isOpen,
  onClose,
  targetExamId
}) => {
  const [candidates, setCandidates] = useState<CodeSparkCandidate[]>(() => getAllCodeSparkCandidates());
  const [inputText, setInputText] = useState('');
  const effectiveExamId = targetExamId || (typeof window !== 'undefined' ? localStorage.getItem('codedna_codespark_round1_exam_id') : undefined) || undefined;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'roster' | 'import'>('roster');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setCandidates(getAllCodeSparkCandidates());
    void syncCandidatesFromCloud().then((synced) => {
      if (synced && synced.length > 0) setCandidates(synced);
    });
    const unsub = onCodeSparkCandidatesChanged((updated) => setCandidates(updated));
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    playSound('click');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isImporting) return;

    const parsed = parseCandidateImportText(inputText);
    if (parsed.length === 0) {
      playSound('warning');
      setNotification({
        message: 'No valid candidate records detected. Expected format: Full Name, Email Address',
        type: 'error'
      });
      return;
    }

    setIsImporting(true);
    try {
      const created = await importCodeSparkCandidatesDirect(parsed, effectiveExamId);
      setInputText('');
      setActiveSubTab('roster');
      playSound('success');
      setNotification({
        message: `Issued and securely saved ${created.length} AXENT key(s) directly to Supabase Cloud!`,
        type: 'success'
      });
    } catch {
      setNotification({
        message: 'Failed to save candidates to Supabase. Check internet connection.',
        type: 'error'
      });
    } finally {
      setIsImporting(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        setInputText(text);
        setActiveSubTab('import');
        playSound('click');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteCandidate = async (key: string) => {
    playSound('click');
    const remaining = candidates.filter((c) => c.accessKey !== key);
    setCandidates(remaining);
    saveCodeSparkCandidates(remaining);
    await deleteCodeSparkCandidateComplete(key);
    window.dispatchEvent(new Event('codedna_codespark_candidates_updated'));
    window.dispatchEvent(new Event('storage'));
  };

  const handleClearAllCandidates = async () => {
    if (!window.confirm('Delete all provisioned candidate keys and clear roster from database and local storage?')) return;
    playSound('click');
    setCandidates([]);
    saveCodeSparkCandidates([]);
    const { resetCodeSparkSystemInCloud } = await import('../../services/codeSparkService');
    await resetCodeSparkSystemInCloud();
    window.dispatchEvent(new Event('codedna_codespark_candidates_updated'));
    window.dispatchEvent(new Event('storage'));
  };

  const handleExportCSV = () => {
    if (candidates.length === 0) return;
    const header = ['Access Key', 'Candidate Name', 'Email Address', 'Status'];
    const rows = candidates.map((c) => [
      c.accessKey,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      c.status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const a = document.createElement('a');
    a.href = encoded;
    a.download = `CodeSpark_Candidate_Keys_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    playSound('click');
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col shadow-2xl overflow-hidden font-sans">

        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-zinc-800 text-zinc-100 flex items-center justify-center border border-zinc-700">
              <Key size={15} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">
                  CodeSpark Candidate Key Management
                </h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  AXENT-XXXX
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Issue private alphanumeric examination keys for registered candidates
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('roster')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeSubTab === 'roster'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Registered Roster ({candidates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('import')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                activeSubTab === 'import'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              + Ingest Roster
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv,.txt"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-1.5 transition-colors"
            >
              <Upload size={12} />
              <span>Upload CSV</span>
            </button>
            {candidates.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-2.5 py-1.5 rounded text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-1.5 transition-colors"
                >
                  <Download size={12} />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearAllCandidates}
                  className="px-2.5 py-1.5 rounded text-xs text-red-400 hover:text-red-200 bg-red-950/40 hover:bg-red-900/50 border border-red-900/60 flex items-center gap-1.5 transition-colors"
                  title="Clear all provisioned keys and reset roster"
                >
                  <Trash2 size={12} />
                  <span>Clear Roster</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Notification Alert */}
        {notification && (
          <div
            className={`px-5 py-2 text-xs flex items-center gap-2 border-b ${
              notification.type === 'success'
                ? 'bg-zinc-900 text-zinc-200 border-zinc-800'
                : 'bg-red-950/40 text-red-300 border-red-900/50'
            }`}
          >
            {notification.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {activeSubTab === 'import' ? (
            <form onSubmit={handleImport} className="flex flex-col gap-4">
              

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Paste Candidate Records (CSV or Tab-Separated)
                </label>
                <textarea
                  rows={8}
                  required
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste rows formatted as: Full Name, Email Address&#10;Example:&#10;Candidate Name, candidate@email.com&#10;Second Candidate, user@domain.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs text-zinc-100 outline-none focus:border-zinc-700 leading-relaxed"
                />
                <span className="block text-[11px] text-zinc-500 mt-1">
                  Only Candidate Name and Email Address are required. Each candidate receives a unique <code>AXENT-XXXX</code> alphanumeric key.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('roster')}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-100 hover:bg-white text-black font-semibold text-xs rounded transition-colors flex items-center gap-1.5"
                >
                  <Key size={13} />
                  <span>Generate AXENT Keys</span>
                </button>
              </div>
            </form>
          ) : (
            <div>
              {candidates.length === 0 ? (
                <div className="py-16 text-center">
                  <Users size={28} className="mx-auto text-zinc-600 mb-3" />
                  <h4 className="text-sm font-semibold text-zinc-300 mb-1">
                    No Registered Candidates
                  </h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
                    Import your candidate roster (Name and Email) to generate AXENT-XXXX private examination keys.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('import')}
                    className="px-3.5 py-2 bg-zinc-100 hover:bg-white text-black font-medium text-xs rounded transition-colors inline-flex items-center gap-1.5"
                  >
                    <UserPlus size={13} />
                    <span>Import Candidates</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{candidates.length} candidate(s) provisioned with AXENT credentials</span>
                    <span className="text-zinc-500 text-[11px]">Sorted by registration timestamp</span>
                  </div>

                  <div className="border border-zinc-800 rounded overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 text-[11px] uppercase">
                          <th className="py-2 px-3 font-mono">AXENT Key</th>
                          <th className="py-2 px-3">Candidate Name</th>
                          <th className="py-2 px-3">Email Address</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80">
                        {candidates.map((c) => (
                          <tr key={c.accessKey} className="hover:bg-zinc-900/30 text-zinc-200">
                            <td className="py-2 px-3 font-mono font-bold text-zinc-100">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                                {c.accessKey}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-medium">{c.name}</td>
                            <td className="py-2 px-3 text-zinc-400 font-mono text-[11px]">{c.email || '—'}</td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                                {c.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopyKey(c.accessKey)}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono flex items-center gap-1 transition-colors"
                                >
                                  {copiedKey === c.accessKey ? (
                                    <>
                                      <Check size={11} className="text-zinc-200" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={11} />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCandidate(c.accessKey)}
                                  className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
                                  title="Delete candidate"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeSparkCandidateImportModal;

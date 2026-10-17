import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Trash2,
  Copy,
  Check,
  Download,
  ExternalLink,
  RotateCcw,
  Monitor,
  Server,
  Layers,
  Terminal,
  Shield,
  X,
  FileCode,
  CheckCircle2
} from 'lucide-react';
import { CollegeLabInfo } from '../types/dna';
import { getAllCollegeLabs, saveCollegeLab, deleteCollegeLab, resetCollegeLabs, syncCollegeLabsFromCloud } from '../services/adminService';
import { playSound } from '../utils/sounds';
import { ConfirmationModal } from './ConfirmationModal';

interface InstituteLabManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLabsUpdated: () => void;
  activeLabId: string;
}

export const InstituteLabManagerModal: React.FC<InstituteLabManagerModalProps> = ({
  isOpen,
  onClose,
  onLabsUpdated,
  activeLabId
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'kiosk' | 'tokens'>('inventory');
  const [labs, setLabs] = useState<CollegeLabInfo[]>(() => getAllCollegeLabs());
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void syncCollegeLabsFromCloud().then((fresh) => {
        if (fresh && fresh.length > 0) setLabs(fresh);
      });
    }
  }, [isOpen]);

  // New Lab Form State
  const [newLabId, setNewLabId] = useState('');
  const [newLabCode, setNewLabCode] = useState('');
  const [newLabName, setNewLabName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newBlock, setNewBlock] = useState('');
  const [newStations, setNewStations] = useState(40);
  const [newInvigilator, setNewInvigilator] = useState('');
  const [formError, setFormError] = useState('');

  // Kiosk Generator State
  const [serverHost, setServerHost] = useState(
    typeof window !== 'undefined' ? window.location.origin : 'http://192.168.1.100:4000'
  );
  const [selectedKioskLab, setSelectedKioskLab] = useState(activeLabId === 'all' ? (labs[0]?.labId || 'LAB-01') : activeLabId);
  const [kioskExamMode, setKioskExamMode] = useState<'coding' | 'mcq'>('coding');
  const [kioskBrowser, setKioskBrowser] = useState<'chrome' | 'edge'>('chrome');

  // Admit Tokens Batch Generator State
  const [tokenStudentList, setTokenStudentList] = useState(
    '1RV22CS001, Aryan Sharma, CSE, 4th Sem\n1RV22CS002, Bhavana Patel, CSE, 4th Sem\n1RV22CS003, Chaitanya Hegde, CSE, 4th Sem'
  );
  const [generatedTokens, setGeneratedTokens] = useState<Array<{ name: string; roll: string; dept: string; token: string }>>([]);

  if (!isOpen) return null;

  const handleAddLab = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newLabId.trim() || !newLabName.trim() || !newDept.trim()) {
      setFormError('Lab ID, Lab Name, and Department are required.');
      return;
    }

    const cleanId = newLabId.trim().toUpperCase().replace(/\s+/g, '-');
    const existing = labs.find((l) => l.labId.toUpperCase() === cleanId);
    if (existing) {
      setFormError(`Lab with ID ${cleanId} already exists.`);
      return;
    }

    const newLab: CollegeLabInfo = {
      labId: cleanId,
      labCode: newLabCode.trim() || cleanId,
      labName: newLabName.trim(),
      department: newDept.trim(),
      block: newBlock.trim() || 'Central Academic Complex',
      totalStations: Number(newStations) || 40,
      invigilatorName: newInvigilator.trim() || 'Faculty In-Charge'
    };

    const updated = saveCollegeLab(newLab);
    setLabs(updated);
    onLabsUpdated();
    playSound('success');

    // Reset Form
    setNewLabId('');
    setNewLabCode('');
    setNewLabName('');
    setNewDept('');
    setNewBlock('');
    setNewStations(40);
    setNewInvigilator('');
  };

  const [labToDelete, setLabToDelete] = useState<string | null>(null);
  const [showResetDefaultsConfirm, setShowResetDefaultsConfirm] = useState(false);

  const handleDeleteLab = (labId: string) => {
    setLabToDelete(labId);
  };

  const handleResetDefaults = () => {
    setShowResetDefaultsConfirm(true);
  };

  // Generate Kiosk Script Text
  const targetLabInfo = labs.find((l) => l.labId === selectedKioskLab) || labs[0];
  const routePath = kioskExamMode === 'coding' ? '/workspace' : '/mcq';
  
  const generatedBatchScript = `@echo off
:: ============================================================================
:: Axent Secure Computer Lab Workstation Auto-Setup Script
:: Laboratory: ${targetLabInfo?.labName || selectedKioskLab} (${targetLabInfo?.labId})
:: Host Server: ${serverHost}
:: Exam Mode: ${kioskExamMode === 'coding' ? 'Monaco Coding Practical' : 'MCQ Examination'}
:: ============================================================================
title Axent Workstation Lockdown Agent
echo Initializing Axent Workstation Terminal...

:: Extract Station Number from Windows PC Hostname (e.g., PC-01 -> 01)
set PC_NAME=%COMPUTERNAME%
for /f "tokens=2 delims=-" %%a in ("%PC_NAME%") do set DETECTED_STATION=%%a
if "%DETECTED_STATION%"=="" set DETECTED_STATION=01

set /p STATION_NUM="Confirm Station Number [%DETECTED_STATION%]: "
if "%STATION_NUM%"=="" set STATION_NUM=%DETECTED_STATION%

set EXAM_URL=${serverHost}${routePath}?lab=${selectedKioskLab}&station=%STATION_NUM%

echo.
echo Launching Fullscreen Kiosk Lockdown on Workstation #%STATION_NUM%...
echo URL: %EXAM_URL%
echo.

${kioskBrowser === 'chrome' ? `start "" "chrome.exe" --kiosk --incognito --disable-pinch --overscroll-history-navigation=0 --disable-translate --no-first-run "%EXAM_URL%"` : `start "" "msedge.exe" --kiosk "%EXAM_URL%" --edge-kiosk-type=fullscreen --no-first-run --inprivate`}

exit
`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatedBatchScript);
    setCopiedCode(true);
    playSound('success');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleDownloadBat = () => {
    const blob = new Blob([generatedBatchScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `start_${selectedKioskLab.toLowerCase()}_station.bat`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    playSound('success');
  };

  const handleCopyStationUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    playSound('click');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Generate Admit Tokens
  const handleGenerateTokens = () => {
    const lines = tokenStudentList.split('\n').filter((l) => l.trim().length > 0);
    const results = lines.map((line) => {
      const parts = line.split(',').map((p) => p.trim());
      const roll = parts[0] || '1RV22CS000';
      const name = parts[1] || 'Candidate';
      const dept = parts[2] || 'CSE';
      const sem = parts[3] || '4th Sem';

      const payload = {
        name,
        roll,
        dept,
        sem,
        labId: selectedKioskLab,
        examDurationMinutes: 60,
        examMode: kioskExamMode === 'coding' ? 'CODING' : 'MCQ',
        issuedAt: Date.now()
      };

      const token = 'CDNA-' + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      return { name, roll, dept, token };
    });

    setGeneratedTokens(results);
    playSound('success');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '960px',
          maxHeight: '92vh',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Building2 size={16} color="var(--accent)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Real Institute Physical Laboratory & Kiosk Setup
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                Configure department computer labs, workstation IDs, and automate Windows Kiosk lockdown scripts.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '0 20px' }}>
          {[
            { id: 'inventory', label: 'Physical Labs Inventory', icon: Layers, count: labs.length },
            { id: 'kiosk', label: 'Workstation Kiosk Script Generator', icon: Terminal },
            { id: 'tokens', label: 'Batch Admit Token Issuer', icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); playSound('click'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 16px',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  background: 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span style={{ fontSize: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 'var(--radius-pill)', color: 'var(--text-secondary)' }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>

          {/* TAB 1: PHYSICAL LABS INVENTORY & ADD FORM */}
          {activeTab === 'inventory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Form to Add Custom Lab */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={14} color="var(--accent)" />
                  <span>Register a New Physical Laboratory for Your Institute</span>
                </div>

                {formError && (
                  <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--danger)', fontSize: '11px', marginBottom: '12px' }}>
                    {formError}
                  </div>
                )}

                <form onSubmit={handleAddLab}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Lab Identifier (e.g., LAB-CSE-01) *
                      </label>
                      <input
                        value={newLabId}
                        onChange={(e) => setNewLabId(e.target.value)}
                        placeholder="LAB-CSE-01"
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Lab Room Code (e.g., CS-402)
                      </label>
                      <input
                        value={newLabCode}
                        onChange={(e) => setNewLabCode(e.target.value)}
                        placeholder="CS-402"
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Department *
                      </label>
                      <input
                        value={newDept}
                        onChange={(e) => setNewDept(e.target.value)}
                        placeholder="Computer Science & Eng"
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Official Laboratory Name *
                      </label>
                      <input
                        value={newLabName}
                        onChange={(e) => setNewLabName(e.target.value)}
                        placeholder="Data Structures & Algorithms Laboratory"
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Building / Floor
                      </label>
                      <input
                        value={newBlock}
                        onChange={(e) => setNewBlock(e.target.value)}
                        placeholder="Tech Block C, 3rd Floor"
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Workstation PC Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={newStations}
                        onChange={(e) => setNewStations(parseInt(e.target.value, 10) || 40)}
                        style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="submit"
                      style={{
                        padding: '8px 16px',
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--accent-contrast)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Plus size={13} />
                      <span>Save Laboratory</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Labs Table */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Active Institute Laboratories ({labs.length})
                  </div>
                  <button
                    onClick={handleResetDefaults}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RotateCcw size={11} />
                    <span>Restore 50 Default College Labs</span>
                  </button>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '8px 12px' }}>Lab ID</th>
                        <th style={{ padding: '8px 12px' }}>Lab Name</th>
                        <th style={{ padding: '8px 12px' }}>Department</th>
                        <th style={{ padding: '8px 12px' }}>Location</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Stations</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labs.map((lab) => (
                        <tr key={lab.labId} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--accent)' }}>
                            {lab.labId}
                            <span style={{ marginLeft: '6px', fontSize: '9px', color: 'var(--text-muted)' }}>({lab.labCode})</span>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>
                            {lab.labName}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                            {lab.department}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>
                            {lab.block}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>
                            {lab.totalStations}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setSelectedKioskLab(lab.labId);
                                setActiveTab('kiosk');
                                playSound('click');
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                fontSize: '11px',
                                marginRight: '6px'
                              }}
                              title="Generate Kiosk Script for this lab"
                            >
                              <Terminal size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteLab(lab.labId)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--danger)',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                fontSize: '11px'
                              }}
                              title="Delete laboratory"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WORKSTATION KIOSK SCRIPT GENERATOR */}
          {activeTab === 'kiosk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Architecture Guide Card */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Server size={14} color="var(--accent)" />
                  <span>How Real Institute Computer Labs Run Axent</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>1. Local Campus LAN</strong>
                    Run Axent on the Teacher PC / Server via <code style={{ color: 'var(--accent)' }}>npm run dev -- --host 0.0.0.0</code>. All 60 lab computers connect to that local IP (e.g. <code style={{ color: 'var(--accent)' }}>http://192.168.1.100:4000</code>).
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>2. Fullscreen Kiosk Mode</strong>
                    The batch script launches Chrome/Edge with <code style={{ color: 'var(--accent)' }}>--kiosk</code>. This hides URL address bars, tabs, and shortcuts, preventing students from surfing other sites or inspecting elements.
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                    <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>3. Auto-Detect PC Hostname</strong>
                    The script reads Windows <code style={{ color: 'var(--accent)' }}>%COMPUTERNAME%</code> (e.g., <code style={{ color: 'var(--accent)' }}>LAB-PC-05</code>) so the exact same batch file can be deployed across all 60 computers automatically!
                  </div>
                </div>
              </div>

              {/* Generator Controls */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '10px', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Server Hostname or Local LAN IP
                    </label>
                    <input
                      value={serverHost}
                      onChange={(e) => setServerHost(e.target.value)}
                      placeholder="http://192.168.1.100:4000"
                      style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Target Laboratory
                    </label>
                    <select
                      value={selectedKioskLab}
                      onChange={(e) => setSelectedKioskLab(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                    >
                      {labs.map((l) => (
                        <option key={l.labId} value={l.labId}>
                          {l.labId}: {l.labName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Examination Mode
                    </label>
                    <select
                      value={kioskExamMode}
                      onChange={(e) => setKioskExamMode(e.target.value as any)}
                      style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                    >
                      <option value="coding">Coding Practical (/workspace)</option>
                      <option value="mcq">MCQ Examination (/mcq)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Target Browser
                    </label>
                    <select
                      value={kioskBrowser}
                      onChange={(e) => setKioskBrowser(e.target.value as any)}
                      style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '12px' }}
                    >
                      <option value="chrome">Google Chrome (Recommended)</option>
                      <option value="edge">Microsoft Edge</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Generated Script Display & Action Buttons */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileCode size={13} />
                    <span>Generated Windows Batch Script (<code style={{ color: 'var(--accent)' }}>start_{selectedKioskLab.toLowerCase()}_station.bat</code>)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={handleCopyScript}
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedCode ? 'Copied' : 'Copy Batch Script'}</span>
                    </button>
                    <button
                      onClick={handleDownloadBat}
                      style={{
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--accent-contrast)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Download size={12} />
                      <span>Download .bat File</span>
                    </button>
                  </div>
                </div>

                <pre
                  style={{
                    margin: 0,
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: 'var(--text-secondary)',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    lineHeight: 1.4
                  }}
                >
                  {generatedBatchScript}
                </pre>
              </div>

              {/* Workstation Direct Links Matrix */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Monitor size={13} />
                  <span>Workstation Quick-Launch Matrix ({targetLabInfo?.totalStations || 40} Stations)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {Array.from({ length: targetLabInfo?.totalStations || 40 }, (_, i) => {
                    const stNum = (i + 1).toString().padStart(2, '0');
                    const fullUrl = `${serverHost}${routePath}?lab=${selectedKioskLab}&station=${stNum}`;
                    const isCopied = copiedUrl === fullUrl;
                    return (
                      <div
                        key={stNum}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '6px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>WS #{stNum}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            onClick={() => handleCopyStationUrl(fullUrl)}
                            style={{ background: 'transparent', border: 'none', color: isCopied ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                            title="Copy workstation URL"
                          >
                            {isCopied ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent)', padding: '2px', display: 'inline-flex' }}
                            title="Open in new tab to test"
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: BATCH ADMIT TOKEN ISSUER */}
          {activeTab === 'tokens' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} color="var(--accent)" />
                  <span>Batch Candidate Admit Token Generation</span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Enter student roll numbers/names (one per line, format: <code style={{ color: 'var(--accent)' }}>Roll, Name, Department, Semester</code>).
                  Tokens can be printed or distributed; students simply paste their token at their assigned station to auto-bind their profile and start the exam.
                </p>

                <textarea
                  rows={4}
                  value={tokenStudentList}
                  onChange={(e) => setTokenStudentList(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    marginBottom: '10px'
                  }}
                />

                <button
                  onClick={handleGenerateTokens}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--accent-contrast)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <CheckCircle2 size={13} />
                  <span>Generate Cryptographic Tokens ({tokenStudentList.split('\n').filter((l) => l.trim()).length} Students)</span>
                </button>
              </div>

              {generatedTokens.length > 0 && (
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Generated Admit Tokens ({generatedTokens.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                    {generatedTokens.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.name} <span style={{ color: 'var(--accent)', fontWeight: 600 }}>({item.roll})</span>
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.dept}</div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <code style={{ fontSize: '10px', background: 'var(--bg-main)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
                            {item.token.slice(0, 24)}...
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(item.token);
                              playSound('click');
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '3px 8px',
                              fontSize: '10px',
                              color: 'var(--text-primary)',
                              cursor: 'pointer'
                            }}
                          >
                            Copy Token
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Configuring for Active Laboratory: <strong>{targetLabInfo?.labName}</strong>
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Delete Lab Confirmation Modal */}
      <ConfirmationModal
        isOpen={labToDelete !== null}
        title="Delete Laboratory?"
        message={`Are you sure you want to delete laboratory ${labToDelete}? Active stations registered under this lab will need to be reallocated.`}
        confirmText="Yes, Delete Lab"
        cancelText="Cancel"
        tone="danger"
        icon="danger"
        onConfirm={async () => {
          if (labToDelete) {
            const updated = await deleteCollegeLab(labToDelete);
            setLabs(updated);
            onLabsUpdated();
            playSound('click');
            setLabToDelete(null);
          }
        }}
        onCancel={() => setLabToDelete(null)}
      />

      {/* Reset Defaults Confirmation Modal */}
      <ConfirmationModal
        isOpen={showResetDefaultsConfirm}
        title="Restore Default Laboratories?"
        message="Reset all custom laboratories and restore the official college template labs? Any custom laboratories authored in this browser will be replaced."
        confirmText="Restore Templates"
        cancelText="Cancel"
        tone="warning"
        icon="warning"
        onConfirm={async () => {
          const reset = await resetCollegeLabs();
          setLabs(reset);
          onLabsUpdated();
          playSound('warning');
          setShowResetDefaultsConfirm(false);
        }}
        onCancel={() => setShowResetDefaultsConfirm(false)}
      />
    </div>
  );
};

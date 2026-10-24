"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

interface Juror {
  id: number;
  seat: string;
  name: string;
  age: number;
  profession: string;
  education: string;
  lean: "guilty" | "not-guilty" | "undecided";
  sympathy: "Prosecution" | "Defense" | "Neutral";
  isForeperson: boolean;
  notes: string;
  voirDireQuote: string;
  attentionScore: number;
  strikeRisk: "Low" | "Moderate" | "High";
}

interface Evidence {
  id: string;
  batesNumber: string;
  party: "Prosecution" | "Defense";
  title: string;
  description: string;
  dateAdmitted: string;
  status: "Admitted" | "Marked for Review" | "Sealed";
  witness: string;
  relevance: string;
}

interface TimelineEntry {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  category: "deliberation" | "court" | "evidence" | "motion";
}

const INITIAL_JURORS: Juror[] = [
  {
    id: 1,
    seat: "Seat 1 (Foreperson)",
    name: "Sarah Lin",
    age: 41,
    profession: "Lead Enterprise Data Architect",
    education: "M.S. Computer Science, Carnegie Mellon",
    lean: "guilty",
    sympathy: "Neutral",
    isForeperson: true,
    notes: "Systematic thinker. Expressed high confidence in the blockchain forensic evidence. Keeping discussions orderly.",
    voirDireQuote: "Data trails cannot lie, but people can misinterpret intention without proper code audits.",
    attentionScore: 98,
    strikeRisk: "Low",
  },
  {
    id: 2,
    seat: "Seat 2",
    name: "David Thorne",
    age: 58,
    profession: "Retired Navy Commander / Logistics Officer",
    education: "B.S. Naval Engineering, Annapolis",
    lean: "guilty",
    sympathy: "Prosecution",
    isForeperson: false,
    notes: "Very attentive to chain-of-custody protocols. Reacted visibly during Defendant Drake's evasive cross-examination.",
    voirDireQuote: "Chain of command and fiduciary responsibility are non-negotiable standards.",
    attentionScore: 94,
    strikeRisk: "Low",
  },
  {
    id: 3,
    seat: "Seat 3",
    name: "Elena Gomez",
    age: 34,
    profession: "High School STEM Department Chair",
    education: "M.Ed. Curriculum & Physics, Columbia",
    lean: "not-guilty",
    sympathy: "Defense",
    isForeperson: false,
    notes: "Expressed concern regarding the lack of direct cryptographic signing on Exhibit PX-04. Demanded re-reading jury instruction § 4.12.",
    voirDireQuote: "Reasonable doubt means if there is another scientifically plausible explanation, we cannot convict.",
    attentionScore: 92,
    strikeRisk: "Moderate",
  },
  {
    id: 4,
    seat: "Seat 4",
    name: "Marcus King",
    age: 47,
    profession: "Senior Forensic Certified Public Accountant",
    education: "B.A. Accounting & Finance",
    lean: "guilty",
    sympathy: "Prosecution",
    isForeperson: false,
    notes: "Has spent 2 hours recalculating the offshore shell entity transfers. Convinced offshore wire transfers prove deliberate fraud.",
    voirDireQuote: "The balance sheet discrepancies in Q3 cannot be accidental rounding errors.",
    attentionScore: 96,
    strikeRisk: "Low",
  },
  {
    id: 5,
    seat: "Seat 5",
    name: "Chloe Zhao",
    age: 29,
    profession: "Human Factors & UX Researcher",
    education: "B.S. Cognitive Psychology",
    lean: "guilty",
    sympathy: "Neutral",
    isForeperson: false,
    notes: "Focuses heavily on user intent and internal Slack discussions between developers.",
    voirDireQuote: "Tone in unedited chat messages reveals true corporate priorities more than polished press releases.",
    attentionScore: 89,
    strikeRisk: "Low",
  },
  {
    id: 6,
    seat: "Seat 6",
    name: "Robert Patel",
    age: 52,
    profession: "Licensed Commercial General Contractor",
    education: "Associate in Structural Engineering",
    lean: "not-guilty",
    sympathy: "Defense",
    isForeperson: false,
    notes: "Empathizes with founder pressure. Feels government is over-criminalizing corporate misjudgments.",
    voirDireQuote: "In business, projects fail and deadlines slip without everyone being a conspirator.",
    attentionScore: 85,
    strikeRisk: "Moderate",
  },
  {
    id: 7,
    seat: "Seat 7",
    name: "Arthur Vance",
    age: 63,
    profession: "Supply Chain Operations Director",
    education: "B.A. Business Administration",
    lean: "guilty",
    sympathy: "Prosecution",
    isForeperson: false,
    notes: "Believes the defense witness contradicted herself under cross-examination on timestamp discrepancies.",
    voirDireQuote: "When goods or intellectual property vanish overnight, someone opened the warehouse door.",
    attentionScore: 90,
    strikeRisk: "Low",
  },
  {
    id: 8,
    seat: "Seat 8",
    name: "Nadia Bell",
    age: 38,
    profession: "Critical Care Flight Paramedic",
    education: "B.S. Emergency Medical Sciences",
    lean: "guilty",
    sympathy: "Neutral",
    isForeperson: false,
    notes: "Analytical, quiet, takes comprehensive color-coded handwritten notes. Influential during break discussions.",
    voirDireQuote: "Decisions have life-or-death consequences. You follow the verified checklist.",
    attentionScore: 95,
    strikeRisk: "Low",
  },
  {
    id: 9,
    seat: "Seat 9",
    name: "James O'Connor",
    age: 44,
    profession: "Risk Arbitrage Investment Analyst",
    education: "MBA Finance, Wharton",
    lean: "guilty",
    sympathy: "Prosecution",
    isForeperson: false,
    notes: "Immediately understood the synthetic derivatives used to conceal the $42M shortfall.",
    voirDireQuote: "The prospectus intentionally withheld the third-party security vulnerabilities.",
    attentionScore: 97,
    strikeRisk: "Low",
  },
  {
    id: 10,
    seat: "Seat 10",
    name: "Patricia Hughes",
    age: 55,
    profession: "County Archival Information Specialist",
    education: "Master of Library and Information Science",
    lean: "undecided",
    sympathy: "Neutral",
    isForeperson: false,
    notes: "Undecided on Count 2 (Trade Secrets). Wants to review the verbatim testimony of the lead developer before committing.",
    voirDireQuote: "I need to see the exact repository version before I vote to deprive someone of their liberty.",
    attentionScore: 91,
    strikeRisk: "Moderate",
  },
  {
    id: 11,
    seat: "Seat 11",
    name: "Kevin Morales",
    age: 31,
    profession: "Cloud Infrastructure Engineer",
    education: "B.S. Computer Systems",
    lean: "guilty",
    sympathy: "Neutral",
    isForeperson: false,
    notes: "Validated that the AWS S3 bucket permission change was manually triggered by Drake's private credentials.",
    voirDireQuote: "IAM access logs with multi-factor override do not execute themselves autonomously.",
    attentionScore: 99,
    strikeRisk: "Low",
  },
  {
    id: 12,
    seat: "Seat 12",
    name: "Teresa Wright",
    age: 49,
    profession: "Retail Chain Proprietor",
    education: "B.S. Communications",
    lean: "guilty",
    sympathy: "Prosecution",
    isForeperson: false,
    notes: "Persuaded by the whistleblower testimony regarding the altered investor quarterly statements.",
    voirDireQuote: "If you mislead honest investors to protect your stock price, that is fraud.",
    attentionScore: 88,
    strikeRisk: "Low",
  },
];

const INITIAL_EVIDENCE: Evidence[] = [
  {
    id: "PX-01",
    batesNumber: "GOV-001429-001488",
    party: "Prosecution",
    title: "Encrypted Telegram / Signal Export",
    description: "Exported chat threads between Defendant Marcus Drake and Singapore broker coordinating secondary token dumping prior to public disclosure.",
    dateAdmitted: "Day 3 - 10:14 AM",
    status: "Admitted",
    witness: "Special Agent Bradley Cole, FBI Cyber Division",
    relevance: "Establishes mens rea and premeditated knowledge of insolvency."
  },
  {
    id: "PX-04",
    batesNumber: "GOV-003890-003912",
    party: "Prosecution",
    title: "Git Repository Audit & Server Mirror Log",
    description: "Cryptographic commit logs showing automated export of proprietary core neural network weights to private S3 bucket registered under 'Vespera Offshore Holdings'.",
    dateAdmitted: "Day 4 - 02:30 PM",
    status: "Admitted",
    witness: "Dr. Alistair Chen, Independent Digital Forensics Expert",
    relevance: "Proves misappropriation of Trade Secret Asset #9."
  },
  {
    id: "DX-02",
    batesNumber: "DEF-000412-000445",
    party: "Defense",
    title: "PwC Cybersecurity Penetration & Compliance Signoff",
    description: "Third-party audit report certifying Vespera's internal backup and failover data retention compliance as of November 2025.",
    dateAdmitted: "Day 6 - 11:20 AM",
    status: "Admitted",
    witness: "Megan Thorne, CPA & Senior Partner, Forensic Technology",
    relevance: "Supports Defense claim that cloud replication was routine disaster recovery protocol."
  },
  {
    id: "PX-09",
    batesNumber: "GOV-008104-008150",
    party: "Prosecution",
    title: "SWIFT Wire Receipts ($14.2M Cayman Transfer)",
    description: "International wire transaction confirmations routed through Barclays London into an offshore escrow account 48 hours before SEC freeze order.",
    dateAdmitted: "Day 5 - 03:45 PM",
    status: "Admitted",
    witness: "Diane Gallagher, Senior Forensic Auditor, SEC",
    relevance: "Direct paper trail proving unlawful dissipation of investor funds."
  },
  {
    id: "DX-07",
    batesNumber: "DEF-001890-001925",
    party: "Defense",
    title: "Vespera Board Resolution on Open Source Initiative",
    description: "Unanimous board authorization empowering engineering to release model weights under Apache 2.0 dual-licensing framework.",
    dateAdmitted: "Day 7 - 01:15 PM",
    status: "Admitted",
    witness: "Julian Mercer, Esq., Counsel of Record",
    relevance: "Refutes criminal intent to steal proprietary assets; shows legitimate open-source strategy."
  },
  {
    id: "PX-14",
    batesNumber: "GOV-010420-010444",
    party: "Prosecution",
    title: "Audio Recording: November 14 Executive Session",
    description: "Wiretap recording of executive caucus where defendant stated: 'If the auditors see the Q3 retention metrics, this company dissolves before sunrise.'",
    dateAdmitted: "Day 8 - 10:05 AM",
    status: "Admitted",
    witness: "Detective Raymond Diaz, Special Investigations",
    relevance: "Direct confession of intentional concealment from regulatory authorities."
  }
];

const INITIAL_TIMELINE: TimelineEntry[] = [
  {
    id: "t-1",
    timestamp: "09:00 AM",
    title: "Jury Instructions Delivered by Judge Hayes",
    description: "Presiding Judge Theodora Hayes completed final jury charge on Count I (Securities Fraud) and Count II (Trade Secret Theft). Foreperson Sarah Lin designated.",
    category: "court"
  },
  {
    id: "t-2",
    timestamp: "09:45 AM",
    title: "Deliberation Chamber Commenced",
    description: "12 impaneled jurors retired to Deliberation Chamber 4B. Alternates sequestered in Courtroom Annex 2.",
    category: "deliberation"
  },
  {
    id: "t-3",
    timestamp: "10:30 AM",
    title: "Foreperson Note #1 Received by Bailiff",
    description: "Jury requested physical review of Exhibit PX-04 (Git audit logs) and access to courtroom projector.",
    category: "evidence"
  },
  {
    id: "t-4",
    timestamp: "11:45 AM",
    title: "Straw Poll #1 Concluded",
    description: "Initial secret ballot returned 5 Guilty, 5 Not Guilty, 2 Undecided. Foreperson facilitated line-by-line evidence review.",
    category: "deliberation"
  },
  {
    id: "t-5",
    timestamp: "01:30 PM",
    title: "Straw Poll #2 Concluded",
    description: "Consensus shifted following analysis of SWIFT wire documents: 7 Guilty, 4 Not Guilty, 1 Undecided.",
    category: "deliberation"
  },
  {
    id: "t-6",
    timestamp: "02:15 PM",
    title: "Current Deliberation Round Active",
    description: "Tally stands at 9 Guilty, 2 Not Guilty, 1 Undecided. Jurors re-examining reasonable doubt threshold for Count II.",
    category: "deliberation"
  }
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"deliberation" | "roster" | "evidence" | "timeline">("deliberation");
  const [jurors, setJurors] = useState<Juror[]>(INITIAL_JURORS);
  const [evidenceList] = useState<Evidence[]>(INITIAL_EVIDENCE);
  const [evidenceFilter, setEvidenceFilter] = useState<"All" | "Prosecution" | "Defense">("All");
  const [timeline, setTimeline] = useState<TimelineEntry[]>(INITIAL_TIMELINE);
  
  // Modals
  const [selectedJuror, setSelectedJuror] = useState<Juror | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  
  // Timer state
  const [timerSeconds, setTimerSeconds] = useState<number>(15480); // 4h 18m
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  
  // New Note
  const [newLogTitle, setNewLogTitle] = useState("");
  const [newLogDesc, setNewLogDesc] = useState("");
  
  // Deliberation Rounds History
  const [strawRounds, setStrawRounds] = useState([
    { round: "Round 1 (11:45 AM)", guilty: 5, notGuilty: 5, undecided: 2, note: "Initial secret ballot" },
    { round: "Round 2 (01:30 PM)", guilty: 7, notGuilty: 4, undecided: 1, note: "Post-wire review" },
    { round: "Round 3 (Current)", guilty: 9, notGuilty: 2, undecided: 1, note: "Count 1 consensus near" }
  ]);

  // Toast announcement
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatTimer = (totalSecs: number) => {
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Vote counting
  const guiltyCount = jurors.filter((j) => j.lean === "guilty").length;
  const notGuiltyCount = jurors.filter((j) => j.lean === "not-guilty").length;
  const undecidedCount = jurors.filter((j) => j.lean === "undecided").length;
  const guiltyPct = Math.round((guiltyCount / jurors.length) * 100);
  const notGuiltyPct = Math.round((notGuiltyCount / jurors.length) * 100);
  const undecidedPct = Math.round((undecidedCount / jurors.length) * 100);

  const handleVoteChange = (jurorId: number, newLean: "guilty" | "not-guilty" | "undecided", e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setJurors((prev) =>
      prev.map((juror) =>
        juror.id === jurorId ? { ...juror, lean: newLean } : juror
      )
    );
    if (selectedJuror && selectedJuror.id === jurorId) {
      setSelectedJuror((prev) => prev ? { ...prev, lean: newLean } : null);
    }
  };

  const handleCallSecretBallot = () => {
    // Record current snapshot
    const roundNumber = strawRounds.length + 1;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newRound = {
      round: `Round ${roundNumber} (${timeStr})`,
      guilty: guiltyCount,
      notGuilty: notGuiltyCount,
      undecided: undecidedCount,
      note: guiltyCount === 12 ? "Unanimous Conviction reached" : guiltyCount >= 10 ? "Supermajority lean" : "Split deliberation"
    };
    setStrawRounds([newRound, ...strawRounds]);
    
    // Add timeline log
    const newEntry: TimelineEntry = {
      id: `t-${Date.now()}`,
      timestamp: timeStr,
      title: `Secret Ballot #${roundNumber} Recorded`,
      description: `Foreperson tallied straw poll: ${guiltyCount} Guilty, ${notGuiltyCount} Not Guilty, ${undecidedCount} Undecided. Consensus index is ${guiltyPct}%.`,
      category: "deliberation"
    };
    setTimeline([newEntry, ...timeline]);
    showToast(`Straw Poll #${roundNumber} registered: ${guiltyCount} Guilty, ${notGuiltyCount} Not Guilty, ${undecidedCount} Undecided`);
  };

  const handleAddTimelineEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogTitle.trim()) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const entry: TimelineEntry = {
      id: `t-${Date.now()}`,
      timestamp: timeStr,
      title: newLogTitle,
      description: newLogDesc || "Entered into official deliberation docket record by court clerk.",
      category: "court"
    };
    setTimeline([entry, ...timeline]);
    setNewLogTitle("");
    setNewLogDesc("");
    showToast("Case docket entry added to live log.");
  };

  const filteredEvidence = evidenceList.filter((item) => {
    if (evidenceFilter === "All") return true;
    return item.party === evidenceFilter;
  });

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-deep)" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 999,
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--accent-gold)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
            color: "#fff",
            padding: "14px 22px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            animation: "fadeIn 0.3s ease"
          }}
        >
          <span style={{ color: "var(--accent-gold)", fontSize: "1.2rem" }}>⚖</span>
          <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{toastMessage}</span>
        </div>
      )}

      {/* Top Application Bar */}
      <header className="top-nav">
        <div className="nav-brand">
          <div className="brand-icon-wrapper" aria-label="JuryHour Logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
              <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>
              <path d="M7 21h10"/>
              <path d="M12 3v18"/>
              <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>
            </svg>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="brand-title">JuryHour</span>
              <span className="brand-badge">PRO v2.4</span>
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Courtroom & Deliberation Intelligence
            </p>
          </div>
        </div>

        <div className="nav-meta">
          <div className="court-crumb">
            <span style={{ color: "var(--text-gold)" }}>District Court</span>
            <span>/</span>
            <span>Civil & Criminal Docket</span>
            <span>/</span>
            <span style={{ color: "#fff", fontWeight: 600 }}>Room 4B Deliberation</span>
          </div>
          <span style={{ color: "var(--border-light)" }}>|</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="live-beacon"></span>
            <span style={{ fontSize: "0.8rem", color: "var(--status-green)", fontWeight: 700 }}>SESSION ACTIVE</span>
          </div>
        </div>

        <div className="nav-actions">
          <div className="timer-pill" title="Elapsed Deliberation Time">
            <span style={{ color: "var(--accent-gold)" }}>⏱</span>
            <span id="deliberation-timer-display">{formatTimer(timerSeconds)}</span>
            <button
              id="btn-timer-toggle"
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "0.75rem",
                padding: "2px 6px"
              }}
              title={isTimerRunning ? "Pause Timer" : "Resume Timer"}
            >
              {isTimerRunning ? "⏸" : "▶"}
            </button>
          </div>

          <button
            id="btn-secret-ballot"
            className="btn-primary"
            onClick={handleCallSecretBallot}
          >
            <span>🗳</span>
            <span>Record Straw Poll</span>
          </button>
        </div>
      </header>

      <main className="jury-container">
        {/* Hero Case Overview Banner */}
        <section
          className="hero-banner"
          style={{ backgroundImage: `url('/jury_chamber_hero.jpg')` }}
          aria-label="Active Trial Overview"
        >
          <div className="hero-overlay"></div>
          <div className="hero-content">
            <div>
              <div className="case-docket-badge">
                <span>DOCKET #CR-2026-8841</span>
                <span>•</span>
                <span>U.S. DISTRICT COURT</span>
                <span>•</span>
                <span>12 JURORS IMPANELED</span>
              </div>
              <h1 className="hero-title">The State v. Vespera Technologies & Marcus Drake</h1>
              <p className="hero-subtitle">
                Securities Fraud under 18 U.S.C. § 1348 and Economic Trade Secret Exfiltration via Autonomous AI Neural Weights. Day 9 of Trial — Deliberation In Progress.
              </p>
            </div>

            <div className="hero-officials">
              <div className="official-item">
                <span className="official-label">Presiding Judge</span>
                <span className="official-name">Hon. Theodora Hayes</span>
              </div>
              <div className="official-item">
                <span className="official-label">Lead Prosecution</span>
                <span className="official-name">Evelyn Vance, Esq. (U.S. Attorney)</span>
              </div>
              <div className="official-item">
                <span className="official-label">Lead Defense Counsel</span>
                <span className="official-name">Julian Mercer, Esq. (Mercer & Crane)</span>
              </div>
              <div className="official-item">
                <span className="official-label">Jury Foreperson</span>
                <span className="official-name">Juror #1 — Sarah Lin</span>
              </div>
              <div className="official-item">
                <span className="official-label">Standard of Proof</span>
                <span className="official-name" style={{ color: "var(--accent-gold)" }}>Beyond a Reasonable Doubt (12-0)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Real-time KPI Stats Bar */}
        <section className="kpi-grid" aria-label="Trial Metrics">
          <div className="glass-panel kpi-card gold" id="kpi-consensus">
            <div className="kpi-header">
              <span>Current Consensus</span>
              <span>⚖</span>
            </div>
            <div className="kpi-value">
              {guiltyPct}%
              <span style={{ fontSize: "0.95rem", color: "var(--accent-gold)", fontWeight: 600 }}>Lean Guilty</span>
            </div>
            <div className="kpi-subtext">
              {guiltyCount} Guilty • {notGuiltyCount} Not Guilty • {undecidedCount} Undecided
            </div>
          </div>

          <div className="glass-panel kpi-card blue" id="kpi-impaneled">
            <div className="kpi-header">
              <span>Jury Impanelment</span>
              <span>👥</span>
            </div>
            <div className="kpi-value">
              12 / 12
              <span style={{ fontSize: "0.95rem", color: "var(--accent-blue)", fontWeight: 600 }}>Active</span>
            </div>
            <div className="kpi-subtext">
              2 Alternates on standby in Annex 2
            </div>
          </div>

          <div className="glass-panel kpi-card crimson" id="kpi-threshold">
            <div className="kpi-header">
              <span>Verdict Threshold</span>
              <span>🎯</span>
            </div>
            <div className="kpi-value">
              {guiltyCount}/12
              <span style={{ fontSize: "0.95rem", color: "var(--status-guilty)", fontWeight: 600 }}>
                {guiltyCount === 12 ? "UNANIMOUS" : "3 More Needed"}
              </span>
            </div>
            <div className="kpi-subtext">
              Criminal verdict requires 12-0 unanimity
            </div>
          </div>

          <div className="glass-panel kpi-card green" id="kpi-evidence">
            <div className="kpi-header">
              <span>Evidence Admitted</span>
              <span>📂</span>
            </div>
            <div className="kpi-value">
              24 Exhibits
              <span style={{ fontSize: "0.95rem", color: "var(--status-green)", fontWeight: 600 }}>Admitted</span>
            </div>
            <div className="kpi-subtext">
              6 Physical exhibits in jury chamber
            </div>
          </div>
        </section>

        {/* Primary Navigation Tabs */}
        <nav className="tabs-bar" aria-label="Main Application Views">
          <button
            id="tab-deliberation"
            className={`tab-btn ${activeTab === "deliberation" ? "active" : ""}`}
            onClick={() => setActiveTab("deliberation")}
          >
            <span>⚖</span>
            <span>Chamber Deliberation & Straw Poll</span>
            <span className="tab-badge">{guiltyCount}G - {notGuiltyCount}NG</span>
          </button>

          <button
            id="tab-roster"
            className={`tab-btn ${activeTab === "roster" ? "active" : ""}`}
            onClick={() => setActiveTab("roster")}
          >
            <span>🏛</span>
            <span>Voir Dire Impaneled Box</span>
            <span className="tab-badge">12 Seats</span>
          </button>

          <button
            id="tab-evidence"
            className={`tab-btn ${activeTab === "evidence" ? "active" : ""}`}
            onClick={() => setActiveTab("evidence")}
          >
            <span>📁</span>
            <span>Evidence & Exhibit Vault</span>
            <span className="tab-badge">{evidenceList.length}</span>
          </button>

          <button
            id="tab-timeline"
            className={`tab-btn ${activeTab === "timeline" ? "active" : ""}`}
            onClick={() => setActiveTab("timeline")}
          >
            <span>📜</span>
            <span>Bailiff & Court Clerk Docket</span>
            <span className="tab-badge">{timeline.length}</span>
          </button>
        </nav>

        {/* Tab 1: Deliberation Chamber & Interactive Straw Poll */}
        {activeTab === "deliberation" && (
          <div className="animate-fade-in">
            {/* Live Consensus Bar Card */}
            <div className="glass-panel consensus-card">
              <div className="consensus-header">
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>
                    Live Chamber Consensus Meter
                  </h2>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    Dynamic tally across all 12 impaneled juror votes. Click juror cards below to cast or toggle votes.
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-gold)" }}>
                    {guiltyPct}%
                  </span>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Supermajority Lean</div>
                </div>
              </div>

              {/* Stacked Progress Bar */}
              <div className="progress-track" title={`Guilty: ${guiltyCount}, Undecided: ${undecidedCount}, Not Guilty: ${notGuiltyCount}`}>
                <div className="progress-seg-guilty" style={{ width: `${guiltyPct}%` }}>
                  {guiltyCount > 0 && `${guiltyCount} Guilty (${guiltyPct}%)`}
                </div>
                <div className="progress-seg-undecided" style={{ width: `${undecidedPct}%` }}>
                  {undecidedCount > 0 && `${undecidedCount} Undecided`}
                </div>
                <div className="progress-seg-acquittal" style={{ width: `${notGuiltyPct}%` }}>
                  {notGuiltyCount > 0 && `${notGuiltyCount} Not Guilty (${notGuiltyPct}%)`}
                </div>
              </div>

              <div className="consensus-legend">
                <div className="legend-item">
                  <span className="legend-dot guilty"></span>
                  <span>Guilty ({guiltyCount} / 12)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot undecided"></span>
                  <span>Undecided / Re-Examining ({undecidedCount} / 12)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot not-guilty"></span>
                  <span>Not Guilty / Acquittal ({notGuiltyCount} / 12)</span>
                </div>
                <div style={{ fontStyle: "italic", color: "var(--accent-gold)", fontSize: "0.8rem" }}>
                  *Unanimous 12-0 required for criminal verdict
                </div>
              </div>
            </div>

            <div className="deliberation-grid">
              {/* Left Column: 12 Interactive Juror Voting Cards */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                    Impaneled Juror Deliberation Status (12 Seats)
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Click card for voir dire details or click vote buttons below
                  </span>
                </div>

                <div className="juror-vote-grid">
                  {jurors.map((juror) => (
                    <article
                      key={juror.id}
                      id={`juror-card-${juror.id}`}
                      className={`juror-card voted-${juror.lean}`}
                      onClick={() => setSelectedJuror(juror)}
                    >
                      <div className="juror-card-header">
                        <div className="juror-seat-tag">
                          <div className="seat-avatar">#{juror.id}</div>
                          <div>
                            <span className="seat-number">{juror.seat}</span>
                            {juror.isForeperson && (
                              <div style={{ marginTop: "2px" }}>
                                <span className="foreperson-badge">FOREPERSON</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "var(--radius-sm)",
                            textTransform: "uppercase",
                            backgroundColor:
                              juror.lean === "guilty"
                                ? "var(--status-guilty-bg)"
                                : juror.lean === "not-guilty"
                                ? "var(--status-not-guilty-bg)"
                                : "var(--status-undecided-bg)",
                            color:
                              juror.lean === "guilty"
                                ? "var(--status-guilty)"
                                : juror.lean === "not-guilty"
                                ? "var(--status-not-guilty)"
                                : "var(--accent-gold)",
                          }}
                        >
                          {juror.lean === "guilty" ? "Guilty" : juror.lean === "not-guilty" ? "Not Guilty" : "Undecided"}
                        </span>
                      </div>

                      <div className="juror-details">
                        <h4 className="juror-name">{juror.name}, {juror.age}</h4>
                        <p className="juror-profession">{juror.profession}</p>
                      </div>

                      <div className="juror-stats-row">
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.68rem" }}>ATTENTION</span>
                          <span style={{ color: "#fff", fontWeight: 700 }}>{juror.attentionScore}%</span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.68rem" }}>SYMPATHY</span>
                          <span style={{ color: juror.sympathy === "Prosecution" ? "var(--status-guilty)" : juror.sympathy === "Defense" ? "var(--accent-blue)" : "var(--accent-gold)", fontWeight: 700 }}>
                            {juror.sympathy}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.68rem" }}>STRIKE RISK</span>
                          <span style={{ color: juror.strikeRisk === "Low" ? "var(--status-green)" : "var(--status-undecided)", fontWeight: 700 }}>
                            {juror.strikeRisk}
                          </span>
                        </div>
                      </div>

                      {/* Quick Vote Toggles */}
                      <div className="juror-vote-actions">
                        <button
                          id={`vote-guilty-${juror.id}`}
                          className={`vote-btn ${juror.lean === "guilty" ? "active-guilty" : ""}`}
                          onClick={(e) => handleVoteChange(juror.id, "guilty", e)}
                        >
                          Guilty
                        </button>
                        <button
                          id={`vote-undecided-${juror.id}`}
                          className={`vote-btn ${juror.lean === "undecided" ? "active-undecided" : ""}`}
                          onClick={(e) => handleVoteChange(juror.id, "undecided", e)}
                        >
                          Undecided
                        </button>
                        <button
                          id={`vote-not-guilty-${juror.id}`}
                          className={`vote-btn ${juror.lean === "not-guilty" ? "active-not-guilty" : ""}`}
                          onClick={(e) => handleVoteChange(juror.id, "not-guilty", e)}
                        >
                          Not Guilty
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              {/* Right Column: Straw Poll Rounds & Indictment Counts */}
              <div className="side-panel">
                {/* Indictment Counts Focus */}
                <div className="glass-panel" style={{ padding: "20px" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚖</span>
                    <span>Indictment Counts Under Review</span>
                  </h3>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ padding: "12px", background: "rgba(0,0,0,0.25)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--status-guilty)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--status-guilty)", fontWeight: 700 }}>
                        <span>COUNT I</span>
                        <span>83% PROBABLE CONVICTION</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginTop: "3px" }}>
                        Securities Fraud (18 U.S.C. § 1348)
                      </div>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Fabrication of recurring ARR metrics to secure $85M Series C round.
                      </p>
                    </div>

                    <div style={{ padding: "12px", background: "rgba(0,0,0,0.25)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--accent-gold)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--accent-gold)", fontWeight: 700 }}>
                        <span>COUNT II</span>
                        <span>SPLIT / CONFLICTED</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginTop: "3px" }}>
                        Trade Secret Misappropriation (§ 1831)
                      </div>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Exfiltration of core neural weights to offshore repo. Juror #3 and #6 challenging definition of open-source license.
                      </p>
                    </div>

                    <div style={{ padding: "12px", background: "rgba(0,0,0,0.25)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--status-guilty)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--status-guilty)", fontWeight: 700 }}>
                        <span>COUNT III</span>
                        <span>UNANIMITY IMMINENT</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", marginTop: "3px" }}>
                        Obstruction of Justice (18 U.S.C. § 1505)
                      </div>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Destruction of server audit trails 2 hours after subpoena delivery.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Straw Poll Rounds History */}
                <div className="glass-panel" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>
                      Deliberation Straw Poll History
                    </h3>
                    <span style={{ fontSize: "0.75rem", color: "var(--accent-gold)", fontWeight: 700 }}>
                      {strawRounds.length} Rounds
                    </span>
                  </div>

                  <div>
                    {strawRounds.map((round, idx) => (
                      <div key={idx} className="straw-history-item">
                        <div>
                          <div className="history-round">{round.round}</div>
                          <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>{round.note}</div>
                        </div>
                        <div className="history-tally">
                          <span style={{ color: "var(--status-guilty)", fontWeight: 700 }}>{round.guilty} G</span>
                          <span style={{ color: "var(--accent-gold)", fontWeight: 700 }}>{round.undecided} U</span>
                          <span style={{ color: "var(--status-not-guilty)", fontWeight: 700 }}>{round.notGuilty} NG</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    id="btn-trigger-straw-poll"
                    className="btn-primary"
                    style={{ width: "100%", marginTop: "12px", justifyContent: "center" }}
                    onClick={handleCallSecretBallot}
                  >
                    <span>🗳</span>
                    <span>Tally New Secret Ballot</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Voir Dire Impaneled Box View */}
        {activeTab === "roster" && (
          <div className="animate-fade-in voir-dire-container">
            <div className="court-bench-decor">
              <span>⚖ JUDICIAL BENCH & WITNESS STAND PERSPECTIVE (LOOKING AT JURY BOX) ⚖</span>
            </div>

            {/* Front Row (Seats 1 - 6) */}
            <div>
              <div className="jury-row-title">
                <span>FRONT ROW (SEATS 1 TO 6)</span>
                <span style={{ fontSize: "0.75rem", color: "var(--accent-gold)" }}>• Primary Eyeline to Witness Box</span>
              </div>
              <div className="juror-vote-grid">
                {jurors.slice(0, 6).map((juror) => (
                  <article
                    key={juror.id}
                    className="juror-card"
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedJuror(juror)}
                  >
                    <div className="juror-card-header">
                      <div className="juror-seat-tag">
                        <div className="seat-avatar">#{juror.id}</div>
                        <div>
                          <span className="seat-number">{juror.seat}</span>
                          {juror.isForeperson && (
                            <div style={{ marginTop: "2px" }}>
                              <span className="foreperson-badge">ELECTED FOREPERSON</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="btn-outline-gold" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
                        View Dossier
                      </span>
                    </div>

                    <div className="juror-details">
                      <h4 className="juror-name">{juror.name}, {juror.age}</h4>
                      <p className="juror-profession">{juror.profession}</p>
                      <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        {juror.education}
                      </p>
                    </div>

                    <div style={{ padding: "10px", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-sm)", marginBottom: "12px" }}>
                      <span style={{ fontSize: "0.68rem", color: "var(--accent-gold)", fontWeight: 700, textTransform: "uppercase" }}>
                        Voir Dire Quote
                      </span>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "2px" }}>
                        &ldquo;{juror.voirDireQuote}&rdquo;
                      </p>
                    </div>

                    <div className="juror-stats-row">
                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>SYMPATHY:</span>{" "}
                        <strong style={{ color: "#fff" }}>{juror.sympathy}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>ATTENTION:</span>{" "}
                        <strong style={{ color: "var(--status-green)" }}>{juror.attentionScore}%</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {/* Back Row (Seats 7 - 12) */}
            <div style={{ marginTop: "16px" }}>
              <div className="jury-row-title">
                <span>BACK ROW (SEATS 7 TO 12)</span>
                <span style={{ fontSize: "0.75rem", color: "var(--accent-gold)" }}>• Elevated Platform</span>
              </div>
              <div className="juror-vote-grid">
                {jurors.slice(6, 12).map((juror) => (
                  <article
                    key={juror.id}
                    className="juror-card"
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedJuror(juror)}
                  >
                    <div className="juror-card-header">
                      <div className="juror-seat-tag">
                        <div className="seat-avatar">#{juror.id}</div>
                        <div>
                          <span className="seat-number">{juror.seat}</span>
                        </div>
                      </div>
                      <span className="btn-outline-gold" style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
                        View Dossier
                      </span>
                    </div>

                    <div className="juror-details">
                      <h4 className="juror-name">{juror.name}, {juror.age}</h4>
                      <p className="juror-profession">{juror.profession}</p>
                      <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "4px" }}>
                        {juror.education}
                      </p>
                    </div>

                    <div style={{ padding: "10px", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-sm)", marginBottom: "12px" }}>
                      <span style={{ fontSize: "0.68rem", color: "var(--accent-gold)", fontWeight: 700, textTransform: "uppercase" }}>
                        Voir Dire Quote
                      </span>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "2px" }}>
                        &ldquo;{juror.voirDireQuote}&rdquo;
                      </p>
                    </div>

                    <div className="juror-stats-row">
                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>SYMPATHY:</span>{" "}
                        <strong style={{ color: "#fff" }}>{juror.sympathy}</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>ATTENTION:</span>{" "}
                        <strong style={{ color: "var(--status-green)" }}>{juror.attentionScore}%</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {/* Alternates Standby Card */}
            <div className="glass-panel" style={{ padding: "20px", marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>
                    Alternates Sequestered (2 Jurors)
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    In separate chamber. Ready for immediate substitution if juror is excused.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <span className="brand-badge" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "var(--accent-blue)" }}>
                    ALT #1: Henry Baker (Biochemist)
                  </span>
                  <span className="brand-badge" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "var(--accent-blue)" }}>
                    ALT #2: Maya Jenkins (Freelance Journalist)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Evidence & Exhibit Vault */}
        {activeTab === "evidence" && (
          <div className="animate-fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>
                  Courtroom Exhibit Vault & Custody Chain
                </h2>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Exhibits admitted into record by Judge Theodora Hayes and available in deliberation chamber.
                </p>
              </div>

              <div className="evidence-filters">
                {(["All", "Prosecution", "Defense"] as const).map((filter) => (
                  <button
                    key={filter}
                    id={`filter-${filter.toLowerCase()}`}
                    className={`filter-chip ${evidenceFilter === filter ? "active" : ""}`}
                    onClick={() => setEvidenceFilter(filter)}
                  >
                    {filter} Exhibits
                  </button>
                ))}
              </div>
            </div>

            <div className="evidence-grid">
              {filteredEvidence.map((exhibit) => (
                <article
                  key={exhibit.id}
                  id={`exhibit-${exhibit.id}`}
                  className="evidence-card"
                  onClick={() => setSelectedEvidence(exhibit)}
                  style={{ cursor: "pointer" }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span className="evidence-id-badge">{exhibit.id}</span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: exhibit.party === "Prosecution" ? "var(--status-guilty-bg)" : "var(--status-not-guilty-bg)",
                          color: exhibit.party === "Prosecution" ? "var(--status-guilty)" : "var(--status-not-guilty)",
                          border: exhibit.party === "Prosecution" ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(14,165,233,0.3)"
                        }}
                      >
                        {exhibit.party} Exhibit
                      </span>
                    </div>

                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                      {exhibit.title}
                    </h3>

                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--accent-gold)", marginBottom: "10px" }}>
                      Bates: {exhibit.batesNumber}
                    </div>

                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: "14px" }}>
                      {exhibit.description}
                    </p>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px", marginTop: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      <span>Sponsoring Witness:</span>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{exhibit.witness.split(",")[0]}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      <span>Admitted:</span>
                      <span style={{ color: "var(--status-green)", fontWeight: 600 }}>{exhibit.dateAdmitted}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Bailiff & Court Clerk Docket Timeline */}
        {activeTab === "timeline" && (
          <div className="animate-fade-in" style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "24px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#fff" }}>
                  Official Bailiff & Court Clerk Case Log
                </h2>
                <span className="timer-pill" style={{ fontSize: "0.8rem" }}>
                  {timeline.length} Recorded Entries
                </span>
              </div>

              <div className="timeline-list">
                {timeline.map((entry) => (
                  <div key={entry.id} className="timeline-event">
                    <div className="timeline-time">{entry.timestamp}</div>
                    <h3 className="timeline-title">{entry.title}</h3>
                    <p className="timeline-desc">{entry.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Log Entry Form */}
            <div>
              <div className="glass-panel" style={{ padding: "24px" }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>
                  Log Deliberation Note / Motion
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                  Enter courtroom notes, jury notes to the bench, or bailiff chamber notices.
                </p>

                <form onSubmit={handleAddTimelineEntry}>
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                      Entry Title
                    </label>
                    <input
                      id="input-log-title"
                      type="text"
                      className="input-text"
                      placeholder="e.g., Foreperson requested Exhibit PX-09 review..."
                      value={newLogTitle}
                      onChange={(e) => setNewLogTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                      Description & Details
                    </label>
                    <textarea
                      id="input-log-desc"
                      className="input-text"
                      rows={4}
                      placeholder="Add specific context, courtroom observers, or judge instructions..."
                      value={newLogDesc}
                      onChange={(e) => setNewLogDesc(e.target.value)}
                    ></textarea>
                  </div>

                  <button
                    id="btn-submit-log"
                    type="submit"
                    className="btn-primary"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    <span>✍</span>
                    <span>Commit to Chamber Docket</span>
                  </button>
                </form>
              </div>

              <div className="glass-panel" style={{ padding: "20px", marginTop: "20px" }}>
                <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-gold)", textTransform: "uppercase", marginBottom: "8px" }}>
                  Jury Room Sequestration Rules
                </h4>
                <ul style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6, paddingLeft: "16px" }}>
                  <li>All cellular and network devices surrendered to Senior Bailiff.</li>
                  <li>No outside discussion of proceedings under penalty of contempt.</li>
                  <li>Inquiries to the Court must be written and signed by Foreperson.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Juror Dossier & Notes */}
        {selectedJuror && (
          <div className="modal-backdrop" onClick={() => setSelectedJuror(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                id="btn-close-juror-modal"
                className="modal-close-btn"
                onClick={() => setSelectedJuror(null)}
              >
                ✕
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div className="seat-avatar" style={{ width: "42px", height: "42px", fontSize: "1rem" }}>
                  #{selectedJuror.id}
                </div>
                <div>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff" }}>
                    {selectedJuror.name}
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--accent-gold)" }}>
                    {selectedJuror.seat} {selectedJuror.isForeperson && "• JURY FOREPERSON"}
                  </p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "16px 0", padding: "14px", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-md)" }}>
                <div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>OCCUPATION</span>
                  <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.85rem" }}>{selectedJuror.profession}</span>
                </div>
                <div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>EDUCATION</span>
                  <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.85rem" }}>{selectedJuror.education}</span>
                </div>
                <div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>SYMPATHY LEAN</span>
                  <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontSize: "0.85rem" }}>{selectedJuror.sympathy}</span>
                </div>
                <div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>ATTENTION INDEX</span>
                  <span style={{ color: "var(--status-green)", fontWeight: 700, fontSize: "0.85rem" }}>{selectedJuror.attentionScore}% Attentive</span>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <h4 style={{ fontSize: "0.82rem", color: "var(--accent-gold)", textTransform: "uppercase", marginBottom: "6px" }}>
                  Voir Dire Examination Excerpt
                </h4>
                <div style={{ padding: "12px", background: "rgba(245, 158, 11, 0.08)", borderLeft: "3px solid var(--accent-gold)", borderRadius: "var(--radius-sm)", fontStyle: "italic", fontSize: "0.85rem", color: "#f1f5f9" }}>
                  &ldquo;{selectedJuror.voirDireQuote}&rdquo;
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <h4 style={{ fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                  Attorney Deliberation Notes
                </h4>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {selectedJuror.notes}
                </p>
              </div>

              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
                  UPDATE JUROR DELIBERATION VOTE:
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  <button
                    id="modal-vote-guilty"
                    className={`btn-secondary ${selectedJuror.lean === "guilty" ? "active-guilty" : ""}`}
                    style={{
                      justifyContent: "center",
                      backgroundColor: selectedJuror.lean === "guilty" ? "var(--status-guilty)" : undefined,
                      color: selectedJuror.lean === "guilty" ? "#fff" : undefined
                    }}
                    onClick={() => handleVoteChange(selectedJuror.id, "guilty")}
                  >
                    Guilty
                  </button>
                  <button
                    id="modal-vote-undecided"
                    className={`btn-secondary ${selectedJuror.lean === "undecided" ? "active-undecided" : ""}`}
                    style={{
                      justifyContent: "center",
                      backgroundColor: selectedJuror.lean === "undecided" ? "var(--accent-gold)" : undefined,
                      color: selectedJuror.lean === "undecided" ? "#000" : undefined
                    }}
                    onClick={() => handleVoteChange(selectedJuror.id, "undecided")}
                  >
                    Undecided
                  </button>
                  <button
                    id="modal-vote-not-guilty"
                    className={`btn-secondary ${selectedJuror.lean === "not-guilty" ? "active-not-guilty" : ""}`}
                    style={{
                      justifyContent: "center",
                      backgroundColor: selectedJuror.lean === "not-guilty" ? "var(--status-not-guilty)" : undefined,
                      color: selectedJuror.lean === "not-guilty" ? "#fff" : undefined
                    }}
                    onClick={() => handleVoteChange(selectedJuror.id, "not-guilty")}
                  >
                    Not Guilty
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Evidence Details */}
        {selectedEvidence && (
          <div className="modal-backdrop" onClick={() => setSelectedEvidence(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button
                id="btn-close-evidence-modal"
                className="modal-close-btn"
                onClick={() => setSelectedEvidence(null)}
              >
                ✕
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span className="evidence-id-badge" style={{ fontSize: "0.85rem", padding: "4px 10px" }}>
                  {selectedEvidence.id}
                </span>
                <span className="brand-badge">
                  {selectedEvidence.status}
                </span>
              </div>

              <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
                {selectedEvidence.title}
              </h3>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--accent-gold)", marginBottom: "16px" }}>
                Bates Stamp: {selectedEvidence.batesNumber}
              </div>

              <div style={{ padding: "14px", background: "rgba(0,0,0,0.3)", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>EXHIBIT SUMMARY</span>
                <p style={{ fontSize: "0.88rem", color: "#f1f5f9", marginTop: "4px", lineHeight: 1.5 }}>
                  {selectedEvidence.description}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>PARTY INTRODUCING</span>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>{selectedEvidence.party}</span>
                </div>
                <div style={{ padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>DATE & TIME ADMITTED</span>
                  <span style={{ color: "var(--status-green)", fontWeight: 700, fontSize: "0.85rem" }}>{selectedEvidence.dateAdmitted}</span>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>SPONSORING WITNESS / CUSTODIAN</span>
                <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.88rem" }}>{selectedEvidence.witness}</span>
              </div>

              <div style={{ padding: "12px", background: "rgba(59,130,246,0.1)", borderLeft: "3px solid var(--accent-blue)", borderRadius: "var(--radius-sm)" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--accent-blue)", fontWeight: 700, textTransform: "uppercase" }}>
                  Legal Relevance to Counts
                </span>
                <p style={{ fontSize: "0.82rem", color: "#f1f5f9", marginTop: "4px" }}>
                  {selectedEvidence.relevance}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "28px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
        <div style={{ maxWidth: "1440px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <strong>JuryHour Legal Technologies Inc.</strong> — Modern Courtroom & Deliberation Intelligence Platform.
          </div>
          <div style={{ display: "flex", gap: "16px" }}>
            <span>Court Sequestration Mode: Active</span>
            <span>•</span>
            <span>256-Bit Encrypted Chamber Docket</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

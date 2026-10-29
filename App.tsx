import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ArrowRight,
  Copy,
  Check,
  Printer,
  Trash2,
  History,
  FileCode,
  ExternalLink,
  Download,
  X,
  FileText,
  ShieldCheck,
  BookOpen,
  DollarSign,
  HelpCircle,
  FileCheck,
  Mail,
  Info
} from 'lucide-react';

interface EntryDetail {
  ledgerName: string;
  amount: string;
  tallyGroup: string;
  ruleType: 'Real Account' | 'Personal Account' | 'Nominal Account';
  ruleReason: string;
}

interface SolvedEntry {
  voucherType: string;
  voucherShortcut: string;
  voucherExplanation: string;
  debitEntries: EntryDetail[];
  creditEntries: EntryDetail[];
  narration: string;
  goldenRulesSummary: string;
  tallySteps: string[];
  source?: string;
  debitLedger?: string;
  debitAmount?: string;
  debitGroup?: string;
  debitRule?: string;
  creditLedger?: string;
  creditAmount?: string;
  creditGroup?: string;
  creditRule?: string;
}

interface HistoryItem {
  query: string;
  data: SolvedEntry;
}

const SAMPLE_TRANSACTIONS = [
  { label: 'Capital Introduction', text: 'Started business with cash Rs.1,00,000' },
  { label: 'Cash Purchase', text: 'Purchased goods for cash Rs.25,000' },
  { label: 'Credit Sale', text: 'Sold goods to Ramesh on credit Rs.40,000' },
  { label: 'Expense Payment', text: 'Paid rent by cheque Rs.15,000' },
  { label: 'Bank Deposit (Contra)', text: 'Deposited cash Rs.50,000 into State Bank of India' },
  { label: 'Asset on Credit', text: 'Purchased computer for office use Rs.35,000 on credit from Dell Ltd' },
  { label: 'Depreciation (Journal)', text: 'Depreciation charged on machinery @ 10% Rs.8,000' },
  { label: 'Sales Return', text: 'Goods returned by Ramesh Rs.4,000' },
];

function sanitizeXSS(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

export default function App() {
  const [inputText, setInputText] = useState('Started business with cash Rs.1,00,000');
  const [loading, setLoading] = useState(false);
  const [copiedSolution, setCopiedSolution] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Result state
  const [result, setResult] = useState<SolvedEntry | null>({
    voucherType: 'Receipt',
    voucherShortcut: 'F6',
    voucherExplanation: 'Funds received into business from the proprietor as initial capital contribution.',
    debitEntries: [
      {
        ledgerName: 'Cash Account',
        amount: '1,00,000',
        tallyGroup: 'Cash-in-hand',
        ruleType: 'Real Account',
        ruleReason: 'Debit what comes in (Cash enters business drawer)',
      },
    ],
    creditEntries: [
      {
        ledgerName: 'Capital Account',
        amount: '1,00,000',
        tallyGroup: 'Capital Account',
        ruleType: 'Personal Account',
        ruleReason: 'Credit the giver (Proprietor/Owner contributes capital)',
      },
    ],
    narration: '(Being capital introduced by proprietor to commence business)',
    goldenRulesSummary: 'Cash is a Real Account (Debit what comes in). Capital is a Personal Account (Credit the giver).',
    tallySteps: [
      'Open Gateway of Tally > Vouchers.',
      'Press [F6] to select Receipt Voucher.',
      'Account: Select Cash Account.',
      'Particulars: Select Capital Account, enter amount ₹1,00,000.',
      'Enter narration and press Ctrl+A to save.',
    ],
    source: 'rule-engine',
  });

  // History state: stored in localStorage (max 5)
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem('tally_history_last5');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Solve handler
  const handleSolve = async () => {
    const raw = inputText.trim();
    if (!raw) return;

    const sanitized = sanitizeXSS(raw);
    setLoading(true);

    try {
      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: sanitized }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data: SolvedEntry = await response.json();
      setResult(data);

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.query !== raw);
        const updated = [{ query: raw, data }, ...filtered].slice(0, 5);
        try {
          localStorage.setItem('tally_history_last5', JSON.stringify(updated));
        } catch (e) {
          console.warn('Storage error', e);
        }
        return updated;
      });
    } catch (err) {
      console.error('Failed to solve entry:', err);
      alert('Could not solve transaction. Please check server connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSolve();
    }
  };

  const handleCopySolution = () => {
    if (!result) return;
    const dr = result.debitEntries?.[0]?.ledgerName || result.debitLedger || 'Debit Ledger';
    const drAmt = result.debitEntries?.[0]?.amount || result.debitAmount || '0';
    const cr = result.creditEntries?.[0]?.ledgerName || result.creditLedger || 'Credit Ledger';
    const crAmt = result.creditEntries?.[0]?.amount || result.creditAmount || '0';

    const text = `================================================
TALLY JOURNAL ENTRY SOLUTION
================================================
Transaction: ${inputText}
Voucher Type: ${result.voucherType} [${result.voucherShortcut}]

Debit (Dr):  ${dr} (₹ ${drAmt})
Credit (Cr): ${cr} (₹ ${crAmt})

Narration: ${result.narration}
Golden Rules: ${result.goldenRulesSummary}
================================================`;

    navigator.clipboard.writeText(text);
    setCopiedSolution(true);
    setTimeout(() => setCopiedSolution(false), 2000);
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleClearText = () => {
    setInputText('');
    setResult(null);
  };

  const handleClearHistory = () => {
    localStorage.removeItem('tally_history_last5');
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] text-[#F8FAFC] font-sans flex flex-col selection:bg-[#00E5FF]/20 selection:text-[#00E5FF]">
      {/* 1. TOP NAVIGATION / MONETIZATION BAR */}
      <nav className="border-b border-white/8 bg-[#0E131F]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo on the left */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00E5FF] to-[#1A73E8] flex items-center justify-center text-[#0A0D14] font-black text-xl shadow-[0_0_16px_rgba(0,229,255,0.3)] shrink-0">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                  Tally Journal Solver
                </span>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30 px-2 py-0.5 rounded-full">
                  Prime & ERP 9
                </span>
              </div>
            </div>
          </div>

          {/* Right Monetization Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Button 1: Download Tally PDF Notes */}
            <button
              onClick={() => setActiveModal('pdf-notes')}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] text-white hover:opacity-95 shadow-[0_3px_12px_rgba(255,107,0,0.3)] transition-all cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Download Tally PDF Notes</span>
            </button>

            {/* Button 2: Hire Me on Fiverr */}
            <a
              href="https://www.fiverr.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold px-3.5 py-2 rounded-xl bg-[#1DBF73]/12 border border-[#1DBF73] text-[#26D07C] hover:bg-[#1DBF73] hover:text-[#0A0D14] transition-all cursor-pointer whitespace-nowrap shadow-[0_0_14px_rgba(29,191,115,0.2)]"
            >
              <DollarSign className="w-4 h-4" />
              <span>Hire Me on Fiverr</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex-1">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/25 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3 shadow-[0_0_12px_rgba(0,229,255,0.15)]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI & Rule-Powered Accounting Solver</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
            Tally Prime Journal Entry Solver
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
            Input any business transaction in plain English. Automatically generate exact Tally Voucher Types, Debit/Credit Ledgers, and Golden Rules breakdown.
          </p>
        </div>

        {/* 1. INPUT CARD */}
        <div className="bg-[#121620]/85 border border-white/8 rounded-2xl p-6 sm:p-7 shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl mb-6">
          <div className="flex items-center justify-between mb-3">
            <label htmlFor="tx-input" className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#00E5FF]" />
              <span>Enter Accounting Transaction</span>
            </label>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>XSS Protected • Vercel Backend</span>
            </span>
          </div>

          <textarea
            id="tx-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your accounting transaction here (e.g., Started business with cash Rs.1,00,000)"
            className="w-full min-h-[115px] p-4 text-[15px] sm:text-base text-white bg-[#0D121D] border border-white/10 rounded-xl focus:border-[#00E5FF] focus:ring-4 focus:ring-[#00E5FF]/15 outline-none transition-all placeholder:text-slate-500 resize-y"
          />

          {/* Quick Sample Chips */}
          <div className="my-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Quick Sample Transactions
            </div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_TRANSACTIONS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInputText(chip.text)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/8 bg-[#161D2D] text-slate-300 hover:border-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/10 transition-all cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-white/8">
            <button
              type="button"
              onClick={handleSolve}
              disabled={loading || !inputText.trim()}
              className="bg-gradient-to-r from-[#00E5FF] to-[#1A73E8] hover:opacity-95 text-[#0A0D14] font-extrabold text-base py-3 px-8 rounded-xl shadow-[0_4px_16px_rgba(0,229,255,0.3)] transition-all flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
                  <span>Analyzing Entry...</span>
                </>
              ) : (
                <>
                  <span>Solve Entry</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <span className="text-xs text-slate-400 text-center sm:text-right">
              Press Ctrl + Enter to solve instantly
            </span>
          </div>
        </div>

        {/* 2. OUTPUT RESULT CARD */}
        {result && (
          <div id="print-area" className="bg-[#121620]/90 border border-white/8 rounded-2xl p-6 sm:p-7 shadow-[0_16px_36px_rgba(0,0,0,0.5)] backdrop-blur-xl space-y-6 animate-in fade-in duration-300 mb-8">
            {/* Voucher Banner */}
            <div className="rounded-xl bg-gradient-to-r from-[#111A2E] to-[#162444] border border-[#00E5FF]/30 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[inset_0_0_20px_rgba(0,229,255,0.05)]">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-extrabold text-[#00E5FF] mb-1">
                  Recommended Tally Voucher Type
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {result.voucherType} Voucher
                  </h2>
                  <div className="bg-[#00E5FF] text-[#0A0D14] font-mono font-black text-sm sm:text-base px-3.5 py-1 rounded-lg shadow-[0_0_12px_rgba(0,229,255,0.4)]">
                    [{result.voucherShortcut}]
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-300 max-w-xl">
                  {result.voucherExplanation}
                </p>
              </div>

              <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Tally Shortcut Key</span>
                <span className="text-xs font-mono font-bold text-[#00E5FF] bg-[#00E5FF]/10 px-2.5 py-1 rounded-md inline-block mt-1">
                  Press [{result.voucherShortcut}]
                </span>
              </div>
            </div>

            {/* Dr / Cr Ledger Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Debit (Dr) Box */}
              <div className="bg-[#38BDF8]/8 border border-[#38BDF8]/25 rounded-xl p-5 border-l-4 border-l-[#38BDF8] relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider bg-[#38BDF8]/20 text-[#38BDF8] px-2.5 py-0.5 rounded">
                    Debit (Dr) Ledger
                  </span>
                  <span className="font-mono text-lg font-black text-[#38BDF8]">
                    ₹ {result.debitEntries?.[0]?.amount || result.debitAmount || '0'}
                  </span>
                </div>

                <div className="text-xl font-bold text-white mt-1">
                  {result.debitEntries?.[0]?.ledgerName || result.debitLedger || 'Debit Ledger'}
                </div>
                <div className="text-xs text-slate-400 font-medium mt-0.5 mb-3">
                  Tally Group: <span className="text-slate-200 font-semibold">{result.debitEntries?.[0]?.tallyGroup || result.debitGroup}</span>
                </div>

                <div className="pt-2 border-t border-white/8">
                  <span className="inline-block text-[11px] font-semibold bg-white/5 text-slate-300 px-2 py-0.5 rounded">
                    {result.debitEntries?.[0]?.ruleType || result.debitRule}
                  </span>
                  {result.debitEntries?.[0]?.ruleReason && (
                    <p className="text-xs text-slate-400 mt-1 italic">
                      "{result.debitEntries[0].ruleReason}"
                    </p>
                  )}
                </div>
              </div>

              {/* Credit (Cr) Box */}
              <div className="bg-[#34D399]/8 border border-[#34D399]/25 rounded-xl p-5 border-l-4 border-l-[#34D399] relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider bg-[#34D399]/20 text-[#34D399] px-2.5 py-0.5 rounded">
                    Credit (Cr) Ledger
                  </span>
                  <span className="font-mono text-lg font-black text-[#34D399]">
                    ₹ {result.creditEntries?.[0]?.amount || result.creditAmount || '0'}
                  </span>
                </div>

                <div className="text-xl font-bold text-white mt-1">
                  {result.creditEntries?.[0]?.ledgerName || result.creditLedger || 'Credit Ledger'}
                </div>
                <div className="text-xs text-slate-400 font-medium mt-0.5 mb-3">
                  Tally Group: <span className="text-slate-200 font-semibold">{result.creditEntries?.[0]?.tallyGroup || result.creditGroup}</span>
                </div>

                <div className="pt-2 border-t border-white/8">
                  <span className="inline-block text-[11px] font-semibold bg-white/5 text-slate-300 px-2 py-0.5 rounded">
                    {result.creditEntries?.[0]?.ruleType || result.creditRule}
                  </span>
                  {result.creditEntries?.[0]?.ruleReason && (
                    <p className="text-xs text-slate-400 mt-1 italic">
                      "{result.creditEntries[0].ruleReason}"
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Narration */}
            <div className="bg-[#0D121D] border border-white/8 rounded-xl p-4">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#00E5FF] block mb-1">
                Narration
              </span>
              <p className="text-sm font-medium text-slate-200 italic">
                {result.narration}
              </p>
            </div>

            {/* Golden Rules Rationale */}
            <div className="bg-[#0D121D] border border-white/8 rounded-xl p-4">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#00E5FF] block mb-1">
                Accounting Golden Rules Analysis
              </span>
              <p className="text-sm text-slate-300">
                {result.goldenRulesSummary}
              </p>
            </div>

            {/* 3. ADVANCED TOOLS (Copy Solution, Download as PDF, Clear Text) */}
            <div className="pt-4 border-t border-white/8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCopySolution}
                className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl border border-white/10 bg-[#161D2D] hover:border-[#00E5FF] hover:text-[#00E5FF] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {copiedSolution ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Solution Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Solution</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadPDF}
                className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl border border-white/10 bg-[#161D2D] hover:border-[#00E5FF] hover:text-[#00E5FF] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 text-[#00E5FF]" />
                <span>Download as PDF</span>
              </button>

              <button
                type="button"
                onClick={handleClearText}
                className="py-2.5 px-4 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Text</span>
              </button>
            </div>
          </div>
        )}

        {/* 4. HISTORY SECTION (Last 5 transactions from localStorage) */}
        {history.length > 0 && (
          <div className="bg-[#121620]/80 border border-white/8 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#00E5FF]" />
                <h3 className="text-sm font-bold text-white">Recent Transactions (Last 5)</h3>
              </div>
              <button
                onClick={handleClearHistory}
                className="text-xs text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear History
              </button>
            </div>

            <div className="space-y-2.5">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setInputText(item.query);
                    setResult(item.data);
                  }}
                  className="p-3 rounded-xl border border-white/5 bg-[#0D121D] hover:border-[#00E5FF]/40 hover:bg-[#161D2D] transition-all cursor-pointer flex items-center justify-between gap-3"
                >
                  <span className="text-xs font-medium text-slate-300 truncate max-w-md">
                    {item.query}
                  </span>
                  <span className="font-mono text-xs font-bold text-[#00E5FF] bg-[#00E5FF]/10 px-2 py-0.5 rounded shrink-0">
                    {item.data.voucherType} [{item.data.voucherShortcut}]
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 3. FOOTER / ADSENSE LEGAL PAGES */}
      <footer className="border-t border-white/8 bg-[#0B0E17] py-8 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-6 text-slate-400 font-medium">
            <button onClick={() => setActiveModal('privacy')} className="hover:text-[#00E5FF] transition-colors cursor-pointer">
              Privacy Policy
            </button>
            <button onClick={() => setActiveModal('terms')} className="hover:text-[#00E5FF] transition-colors cursor-pointer">
              Terms of Service
            </button>
            <button onClick={() => setActiveModal('about')} className="hover:text-[#00E5FF] transition-colors cursor-pointer">
              About Us
            </button>
            <button onClick={() => setActiveModal('contact')} className="hover:text-[#00E5FF] transition-colors cursor-pointer">
              Contact Us
            </button>
          </div>
          <p className="text-slate-600">
            © 2026 Tally Solver. All rights reserved. Not affiliated with Tally Solutions Pvt. Ltd.
          </p>
        </div>
      </footer>

      {/* MODAL DIALOGS */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] bg-[#111622] border border-white/15 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-y-auto text-slate-300 relative text-sm leading-relaxed"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {activeModal === 'pdf-notes' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-[#FF6B00]">
                  <Download className="w-6 h-6" />
                  <h2 className="text-xl font-bold text-white">Tally Prime PDF Study Materials</h2>
                </div>
                <p>Download or print our complete accounting summary sheet tailored for students & junior accountants.</p>
                <div className="bg-[#0A0D14] p-4 rounded-xl border border-white/5 space-y-2 text-xs">
                  <div className="font-bold text-white">Contents in this Quick Reference Pack:</div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    <li>Voucher Key Shortcuts: F4 (Contra), F5 (Payment), F6 (Receipt), F7 (Journal), F8 (Sales), F9 (Purchase)</li>
                    <li>3 Golden Rules of Double Entry: Real, Personal, and Nominal accounts explained</li>
                    <li>Pre-defined 28 Tally Groups cheat sheet</li>
                    <li>GST input/output ledger classification (CGST, SGST, IGST)</li>
                  </ul>
                </div>
                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => window.print()}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print / Save as PDF</span>
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="py-2.5 px-4 rounded-xl border border-white/10 text-slate-300 hover:text-white text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {activeModal === 'privacy' && (
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-white">Privacy Policy</h2>
                <p className="text-xs text-slate-400">Effective Date: 2026</p>
                <p>Tally Journal Entry Solver respects your privacy. We process input accounting transactions transiently to return ledger suggestions and voucher classifications.</p>
                <h3 className="font-bold text-white text-base pt-2">Google AdSense & Third-Party Cookies</h3>
                <p>Google, as a third-party vendor, uses cookies to serve ads on our site. Google's use of advertising cookies enables it and its partners to serve ads to our users based on their visit to our site and/or other sites on the Internet.</p>
                <p>Users may opt out of personalized advertising by visiting Google Ads Settings or aboutads.info.</p>
                <h3 className="font-bold text-white text-base pt-2">Local Storage</h3>
                <p>Search history (up to 5 recent queries) is stored locally on your device via browser localStorage and never transmitted to our marketing lists.</p>
              </div>
            )}

            {activeModal === 'terms' && (
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-white">Terms of Service</h2>
                <p>By using Tally Journal Entry Solver, you agree to these Terms of Service.</p>
                <h3 className="font-bold text-white text-base pt-2">Educational Reference Only</h3>
                <p>The accounting suggestions, ledger groups, and voucher codes provided by this tool are for educational and bookkeeping reference. Users must verify complex statutory tax or GST returns with a licensed professional.</p>
                <h3 className="font-bold text-white text-base pt-2">Trademark Notice</h3>
                <p>Tally, TallyPrime, and Tally ERP 9 are registered trademarks of Tally Solutions Pvt. Ltd. This website is an independent educational helper tool and is not endorsed by or affiliated with Tally Solutions.</p>
              </div>
            )}

            {activeModal === 'about' && (
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-white">About Us</h2>
                <p>Tally Journal Entry Solver is a dedicated educational and bookkeeping assistant built to help commerce students, accountants, and entrepreneurs master double-entry bookkeeping and Tally Prime navigation effortlessly.</p>
                <p>We combine modern AI processing with the timeless Golden Rules of Accounting to provide clear, error-free voucher suggestions in seconds.</p>
              </div>
            )}

            {activeModal === 'contact' && (
              <div className="space-y-3">
                <h2 className="text-xl font-bold text-white">Contact Us</h2>
                <p>Need custom accounting automation, business solutions, or feature support?</p>
                <div className="bg-[#0A0D14] p-4 rounded-xl border border-white/5 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#00E5FF]" />
                    <span>Support Email: <a href="mailto:support@tallysolver.com" className="text-[#00E5FF] underline">support@tallysolver.com</a></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-[#1DBF73]" />
                    <span>Freelance & Custom Work: Available on Fiverr</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 pt-2">We typically respond to inquiries within 24 to 48 business hours.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

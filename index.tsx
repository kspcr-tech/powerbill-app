
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Home, 
  Building2, 
  Share2, 
  Download, 
  Search, 
  X,
  PlusCircle,
  LayoutGrid,
  ChevronRight,
  FileText,
  Clock,
  Settings,
  Upload,
  Eye,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Interfaces ---

enum ProfileType {
  HOME = 'HOME',
  APARTMENT = 'APARTMENT'
}

type RefreshInterval = 'off' | '1h' | '6h' | '12h' | '24h';

interface BillData {
  consumerName: string;
  billMonth: string;
  dueDate: string;
  amount: string;
  units: string;
  status: string;
  lastFetched: string;
}

interface UKSCNumber {
  id: string;
  number: string;
  nickname: string;
  tenantName: string;
  address: string; 
  phone: string;
  customUrl: string; 
  billData?: BillData;
}

interface Profile {
  id: string;
  name: string;
  type: ProfileType;
  ukscs: UKSCNumber[];
}

interface AppSettings {
  refreshInterval: RefreshInterval;
}

// --- Constants ---

const STORAGE_KEY = 'powerbill_manager_v5_data_v5';
const DEFAULT_URL_TEMPLATE = 'https://tgsouthernpower.org/billinginfo?ukscno=';

const PROXY_LIST = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://thingproxy.freeboard.io/fetch/',
  'https://proxy.cors.sh/'
];

// --- Components ---

const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode 
}> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 border border-slate-100">
        <div className="px-8 py-5 border-b flex justify-between items-center bg-slate-50/50">
          <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8 max-h-[85vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

const ProgressBar: React.FC<{ progress: number; label: string }> = ({ progress, label }) => {
  return (
    <div className="w-full mt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{label}</span>
        <span className="text-[10px] font-black text-slate-400">{progress}%</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-indigo-600 rounded-full transition-all duration-700 ease-in-out shadow-[0_0_12px_rgba(79,70,229,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

// --- Utilities ---

const robustFetch = async (targetUrl: string): Promise<string> => {
  let lastError = null;
  for (const proxy of PROXY_LIST) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        if (proxy.includes('allorigins')) {
          const data = await res.json();
          if (data.contents) return data.contents;
        }
        const text = await res.text();
        if (text && text.length > 100) return text;
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error("Unable to reach billing portal. Network blocked.");
};

// --- App Root Component ---

const App = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({ refreshInterval: 'off' });
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingUKSC, setEditingUKSC] = useState<UKSCNumber | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Initial Data
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfiles(parsed.profiles || []);
        setAppSettings(parsed.settings || { refreshInterval: 'off' });
        if (parsed.profiles?.length > 0) setActiveProfileId(parsed.profiles[0].id);
      } catch (e) {
        console.error("Data Load Error", e);
      }
    }
  }, []);

  // Persist State
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles, settings: appSettings }));
  }, [profiles, appSettings]);

  const activeProfile = useMemo(() => 
    profiles.find(p => p.id === activeProfileId) || null
  , [profiles, activeProfileId]);

  const fetchBillDetails = async (uksc: UKSCNumber) => {
    setLoading(uksc.id);
    setProgress(5);
    setErrorLog(null);
    try {
      const finalUrl = (uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number);
      setProgress(25);
      const rawHtml = await robustFetch(finalUrl);
      setProgress(50);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          { text: `Parse the electricity bill HTML for UKSC: ${uksc.number}. Extract: consumerName, billMonth, dueDate, amount, units, and status (Paid/Unpaid). Output JSON only.` },
          { text: `Source HTML Snippet:\n${rawHtml.substring(0, 45000)}` }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              consumerName: { type: Type.STRING },
              billMonth: { type: Type.STRING },
              dueDate: { type: Type.STRING },
              amount: { type: Type.STRING },
              units: { type: Type.STRING },
              status: { type: Type.STRING },
            },
            required: ["consumerName", "billMonth", "dueDate", "amount", "units", "status"]
          }
        }
      });

      setProgress(90);
      const data = JSON.parse(response.text || '{}');
      const billData: BillData = { ...data, lastFetched: new Date().toLocaleString() };

      setProfiles(prev => prev.map(p => ({
        ...p,
        ukscs: p.ukscs.map(u => u.id === uksc.id ? { ...u, billData } : u)
      })));
      setProgress(100);
    } catch (err: any) {
      setErrorLog(err.message || "Extraction error.");
    } finally {
      setTimeout(() => {
        setLoading(null);
        setProgress(0);
      }, 800);
    }
  };

  // Background Refresh Logic
  useEffect(() => {
    if (appSettings.refreshInterval === 'off') return;

    const intervalMap: Record<RefreshInterval, number> = {
      'off': 0,
      '1h': 3600000,
      '6h': 21600000,
      '12h': 43200000,
      '24h': 86400000
    };

    const timer = setInterval(async () => {
      for (const p of profiles) {
        for (const u of p.ukscs) {
          await fetchBillDetails(u);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }, intervalMap[appSettings.refreshInterval]);

    return () => clearInterval(timer);
  }, [appSettings.refreshInterval, profiles]);

  const handleCreateProfile = (name: string, type: ProfileType) => {
    const newProf: Profile = { id: crypto.randomUUID(), name, type, ukscs: [] };
    setProfiles([...profiles, newProf]);
    setActiveProfileId(newProf.id);
    setIsNewProfileModalOpen(false);
  };

  const handleDeleteProfile = (id: string) => {
    if (confirm("Permanently delete this property?")) {
      const updated = profiles.filter(p => p.id !== id);
      setProfiles(updated);
      if (activeProfileId === id) setActiveProfileId(updated[0]?.id || null);
    }
  };

  const handleBulkAdd = (input: string) => {
    if (!activeProfileId) return;
    const numbers = input.split(/[\n,]+/).map(n => n.trim()).filter(n => n.length > 0);
    const allExistingNumbers = new Set(profiles.flatMap(p => p.ukscs.map(u => u.number)));
    const newUKSCs: UKSCNumber[] = [];
    
    numbers.forEach(num => {
      if (!allExistingNumbers.has(num)) {
        newUKSCs.push({
          id: crypto.randomUUID(), number: num, nickname: `Unit ${num.slice(-3)}`,
          tenantName: '', address: '', phone: '', customUrl: `${DEFAULT_URL_TEMPLATE}${num}`
        });
        allExistingNumbers.add(num);
      }
    });

    if (newUKSCs.length > 0) {
      setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, ukscs: [...p.ukscs, ...newUKSCs] } : p));
      // Auto "Check Bill" for new numbers
      newUKSCs.forEach(u => fetchBillDetails(u));
    }
    setIsBulkAddModalOpen(false);
  };

  const handleUpdateUKSC = (updated: UKSCNumber) => {
    setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, ukscs: p.ukscs.map(u => u.id === updated.id ? updated : u) } : p));
    setEditingUKSC(null);
  };

  const handleDeleteUKSC = (id: string) => {
    if (confirm("Delete this unit?")) {
      setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, ukscs: p.ukscs.filter(u => u.id !== id) } : p));
    }
  };

  const generateFullPDFReport = async (uksc: UKSCNumber) => {
    setExportingId(uksc.id);
    setProgress(5);
    const doc = new jsPDF();
    const finalUrl = (uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number);

    // Header section
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 50, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(255, 255, 255);
    doc.text("POWERBILL SUMMARY", 20, 28);
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text(`Official Analysis for Service ID: ${uksc.number}`, 20, 38);
    setProgress(30);

    // Metadata Section
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 140, 60);

    autoTable(doc, {
      startY: 70,
      head: [['Identity & Metadata', 'Details']],
      body: [
        ['Alias/Unit Name', uksc.nickname],
        ['Occupant', uksc.tenantName || 'Not Specified'],
        ['Plot/Flat Number', uksc.address || 'Not Specified'],
        ['UKSC Identification', uksc.number]
      ],
      headStyles: { fillColor: [79, 70, 229] },
      theme: 'grid'
    });
    setProgress(60);

    // Bill Data Section
    if (uksc.billData) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 12,
        head: [['Extracted Bill Information', 'Value']],
        body: [
          ['Consumer Name', uksc.billData.consumerName],
          ['Billing Month', uksc.billData.billMonth],
          ['Payable Amount', uksc.billData.amount],
          ['Payment Due Date', uksc.billData.dueDate],
          ['Usage (Units)', uksc.billData.units],
          ['Status', uksc.billData.status.toUpperCase()]
        ],
        headStyles: { fillColor: [30, 41, 59] },
        theme: 'striped'
      });
    }
    setProgress(80);

    // HIGH VISIBILITY PORTAL LINK
    const finalY = (doc as any).lastAutoTable.finalY + 35;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text("OFFICIAL PORTAL ACCESS:", 20, finalY);
    
    // Large Bold URL
    doc.setFontSize(18); 
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(finalUrl, 20, finalY + 15, { maxWidth: 170 });

    // Arrow Indicator Graphic
    const arrowY = finalY + 28;
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(1.2);
    // Vertical line pointing UP to the URL
    doc.line(30, arrowY + 12, 30, arrowY); 
    // Arrow head
    doc.line(27, arrowY + 4, 30, arrowY);
    doc.line(33, arrowY + 4, 30, arrowY);
    
    // Instruction text on the arrow
    doc.setFontSize(12);
    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(79, 70, 229);
    doc.text("CLICK THE URL ABOVE FOR MORE DETAILS", 36, arrowY + 6);

    setProgress(95);
    doc.save(`PowerBill_${uksc.number}_Report.pdf`);
    setProgress(100);
    
    setTimeout(() => { setExportingId(null); setProgress(0); }, 800);
  };

  const handleShareWhatsApp = async (uksc: UKSCNumber) => {
    if (!uksc.phone) return alert("Please set a WhatsApp phone number in the unit settings.");
    const text = `*Electricity Bill Update*\n\nUnit: ${uksc.nickname}\nUKSC ID: ${uksc.number}\nAmount: ${uksc.billData?.amount || 'N/A'}\nDue: ${uksc.billData?.dueDate || 'N/A'}\n\n_Access Bill Portal here:_ ${DEFAULT_URL_TEMPLATE}${uksc.number}`;
    let phone = uksc.phone.replace(/\D/g, '');
    phone = phone.startsWith('91') ? phone : `91${phone}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (previewUrl) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col">
        <header className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
          <button onClick={() => setPreviewUrl(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="font-extrabold text-slate-800 tracking-tight flex items-center gap-2"><ExternalLink className="w-5 h-5 text-indigo-500" /> Portal Live View</h2>
          <div className="w-10" />
        </header>
        <iframe src={previewUrl} className="flex-1 w-full border-none" title="Portal View" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#fcfdfe] relative">
      <style>{`
        @keyframes blink-arrow { 0%, 100% { opacity: 1; transform: translateX(0); } 50% { opacity: 0.3; transform: translateX(5px); } }
        .blinking-arrow { animation: blink-arrow 0.8s infinite ease-in-out; }
      `}</style>

      <button onClick={() => setIsSettingsModalOpen(true)} className="fixed top-6 right-6 z-50 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl text-slate-400 hover:text-indigo-600 transition-all hover:scale-105 active:scale-95"><Settings className="w-6 h-6" /></button>

      <aside className="w-full md:w-80 bg-white border-r border-slate-100 flex flex-col h-auto md:h-screen sticky top-0 z-30 shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg rotate-3"><LayoutGrid className="w-7 h-7" /></div>
            <div><h1 className="text-xl font-black text-slate-900 tracking-tight">PowerBill</h1><p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Manager v5</p></div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-4 px-2"><span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Vaults</span><button onClick={() => setIsNewProfileModalOpen(true)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-xl transition-colors"><PlusCircle className="w-5 h-5" /></button></div>
            {profiles.map(p => (
              <div key={p.id} className="group relative mb-2">
                <button onClick={() => setActiveProfileId(p.id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold ${activeProfileId === p.id ? 'bg-indigo-600 text-white shadow-xl translate-x-1' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {p.type === ProfileType.HOME ? <Home className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                  <span className="truncate">{p.name}</span>
                </button>
                <button onClick={() => handleDeleteProfile(p.id)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        {activeProfile ? (
          <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-700">
            <div className="flex justify-between items-end gap-6">
              <div>
                <nav className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2"><span>DIRECTORY</span><ChevronRight className="w-3 h-3" /><span className="text-indigo-600">{activeProfile.name}</span></nav>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none">{activeProfile.name}</h2>
              </div>
              <button onClick={() => setIsBulkAddModalOpen(true)} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl hover:bg-indigo-700 flex items-center gap-3 transition-all hover:-translate-y-1"><Plus className="w-5 h-5" />Add Numbers</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
              {activeProfile.ukscs.map(uksc => (
                <div key={uksc.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col group hover:shadow-2xl transition-all relative overflow-hidden">
                  <div className="p-8 flex-1 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="w-14 h-14 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors"><FileText className="w-7 h-7" /></div>
                      <button onClick={() => setEditingUKSC(uksc)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors"><Edit3 className="w-5 h-5" /></button>
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">{uksc.nickname}</h4>
                      <p className="text-xs font-mono font-bold text-slate-400 mt-1 uppercase">UKSC: {uksc.number}</p>
                    </div>
                    {uksc.billData ? (
                      <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100/30 space-y-4 shadow-inner">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-indigo-400">
                          <span>Month: {uksc.billData.billMonth}</span>
                          <div className={`px-3 py-1 rounded-full ${uksc.billData.status.toLowerCase().includes('paid') && !uksc.billData.status.toLowerCase().includes('unpaid') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{uksc.billData.status}</div>
                        </div>
                        <p className="text-3xl font-black text-slate-900 tracking-tight">{uksc.billData.amount}</p>
                        <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2 italic uppercase"><Clock className="w-3 h-3 text-indigo-300" /> Due: {uksc.billData.dueDate}</p>
                      </div>
                    ) : (
                      <div className="p-10 border-2 border-dashed border-slate-50 rounded-[2.2rem] flex flex-col items-center justify-center opacity-40">
                        <Search className="w-8 h-8 text-slate-300 mb-3" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Awaiting Analysis</p>
                      </div>
                    )}
                    {(loading === uksc.id || exportingId === uksc.id) && <ProgressBar progress={progress} label={loading === uksc.id ? "Analyzing Portal..." : "Generating PDF..."} />}
                    {errorLog && loading === uksc.id && <div className="mt-4 p-3 bg-red-50 rounded-xl flex items-center gap-2 text-[10px] font-bold text-red-600 animate-pulse"><AlertCircle className="w-4 h-4" />{errorLog}</div>}
                  </div>
                  <div className="p-6 pt-0 flex gap-2">
                    <button onClick={() => fetchBillDetails(uksc)} disabled={!!loading || !!exportingId} className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black bg-white text-indigo-600 border border-slate-100 hover:bg-slate-50 disabled:opacity-50 transition-all hover:shadow-md"><Search className="w-4 h-4" />Check</button>
                    <button onClick={() => setPreviewUrl((uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number))} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-1 group relative overflow-hidden">
                      <Eye className="w-5 h-5" />
                      <ArrowRight className="w-4 h-4 blinking-arrow hidden group-hover:block" />
                    </button>
                    <button onClick={() => generateFullPDFReport(uksc)} disabled={!!loading || !!exportingId} className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-lg"><Download className="w-5 h-5" /></button>
                    <button onClick={() => handleShareWhatsApp(uksc)} className="p-4 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg"><Share2 className="w-5 h-5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 bg-white shadow-2xl rounded-[2.5rem] flex items-center justify-center text-indigo-600 mb-10 rotate-3 transition-transform hover:rotate-0"><Plus className="w-12 h-12" /></div>
            <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tighter">No Hub Selected</h2>
            <p className="text-slate-400 max-w-xs mb-10 font-medium">Create or select a property profile to begin managing your electricity bills.</p>
            <button onClick={() => setIsNewProfileModalOpen(true)} className="px-16 py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-indigo-700 transition-all hover:-translate-y-2 active:scale-95">Initialize Hub</button>
          </div>
        )}
      </main>

      {/* --- Modals --- */}
      <Modal isOpen={isNewProfileModalOpen} onClose={() => setIsNewProfileModalOpen(false)} title="Initialize Vault">
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleCreateProfile(fd.get('name') as string, fd.get('type') as ProfileType); }} className="space-y-8">
          <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vault Identity</label><input name="name" required placeholder="e.g. Skyline Residency" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-bold" /></div>
          <div className="grid grid-cols-2 gap-4">
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.HOME} defaultChecked className="hidden peer" /><div className="flex flex-col items-center p-8 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm"><Home className="w-10 h-10 text-slate-300 peer-checked:text-indigo-600 mb-4" /><span className="text-sm font-black text-slate-600">Home</span></div></label>
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.APARTMENT} className="hidden peer" /><div className="flex flex-col items-center p-8 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm"><Building2 className="w-10 h-10 text-slate-300 peer-checked:text-indigo-600 mb-4" /><span className="text-sm font-black text-slate-600">Complex</span></div></label>
          </div>
          <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all active:scale-95">Initialize & Save</button>
        </form>
      </Modal>

      <Modal isOpen={isBulkAddModalOpen} onClose={() => setIsBulkAddModalOpen(false)} title="Bulk Import IDs">
        <div className="space-y-8">
          <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">UKSC Numbers (New line or Comma separated)</label><textarea id="bulkInput" rows={6} placeholder="110390320, 110390321..." className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-mono text-sm font-bold text-slate-700" /></div>
          <button onClick={() => handleBulkAdd((document.getElementById('bulkInput') as HTMLTextAreaElement).value)} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all">Import & Run Auto-Analysis</button>
        </div>
      </Modal>

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Platform Console">
        <div className="space-y-10">
          {/* AI ENGINE STATUS - ENVIRONMENT CONFIGURED */}
          <div className="p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full group-hover:scale-110 transition-transform duration-700" />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3"><ShieldCheck className="w-8 h-8 text-indigo-200" /><h4 className="text-xl font-black tracking-tight">AI Engine Status</h4></div>
              <p className="text-sm font-bold text-indigo-100/80 leading-relaxed italic">The Google Gemini Intelligence core is pre-configured via secure system environment variables.</p>
              <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl w-fit"><div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /><span className="text-[10px] font-black uppercase tracking-widest">Environment Ready</span></div>
            </div>
          </div>

          {/* AUTO REFRESH CONFIG */}
          <div className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><RefreshCw className="w-4 h-4" />Auto-Refresh Sync</div>
            <div className="grid grid-cols-5 gap-1.5">
              {(['off', '1h', '6h', '12h', '24h'] as RefreshInterval[]).map(val => (
                <button key={val} onClick={() => setAppSettings({...appSettings, refreshInterval: val})} className={`py-3 rounded-xl font-black text-[10px] transition-all uppercase ${appSettings.refreshInterval === val ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-400 hover:bg-slate-100'}`}>{val}</button>
              ))}
            </div>
            <p className="text-[9px] text-slate-400 font-bold italic text-center">System will automatically update all UKSC bills in the background at this frequency.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => { const blob = new Blob([JSON.stringify({profiles, settings: appSettings}, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'PowerBill_Vault_Backup.json'; link.click(); }} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-indigo-50 transition-all shadow-sm hover:shadow-md"><Download className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Export Vault</span></button>
            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-emerald-50 transition-all shadow-sm hover:shadow-md"><Upload className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Import Vault</span></button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
             const file = e.target.files?.[0];
             if (!file) return;
             const reader = new FileReader();
             reader.onload = (event) => { try { const p = JSON.parse(event.target?.result as string); setProfiles(p.profiles || []); setAppSettings(p.settings || {refreshInterval: 'off'}); alert("Vault restored successfully."); } catch (err) { alert("Invalid backup file structure."); } };
             reader.readAsText(file);
          }} />
          <div className="text-center pt-4 border-t border-slate-100 opacity-20"><div className="text-[10px] font-black text-slate-900 uppercase tracking-[0.6em]">POWERBILL MANAGER PREMIER EDITION</div></div>
        </div>
      </Modal>

      <Modal isOpen={!!editingUKSC} onClose={() => setEditingUKSC(null)} title="Unit Metadata Panel">
        {editingUKSC && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleUpdateUKSC({ ...editingUKSC, nickname: fd.get('nickname') as string, number: fd.get('number') as string, tenantName: fd.get('tenantName') as string, address: fd.get('address') as string, phone: fd.get('phone') as string, customUrl: fd.get('customUrl') as string }); }} className="space-y-6">
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nickname / Alias</label><input name="nickname" defaultValue={editingUKSC.nickname} required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Service Number (UKSC)</label><input name="number" defaultValue={editingUKSC.number} required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Occupant / Tenant Name</label><input name="tenantName" defaultValue={editingUKSC.tenantName} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Flat/Plot Number</label><input name="address" defaultValue={editingUKSC.address} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp Number</label><input name="phone" defaultValue={editingUKSC.phone} placeholder="91XXXXXXXXXX" className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            </div>
            <div className="pt-8 flex gap-4">
              <button type="button" onClick={() => setEditingUKSC(null)} className="flex-1 py-4 text-slate-400 font-black hover:text-slate-600">Discard</button>
              <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">Apply Metadata Changes</button>
            </div>
            <button type="button" onClick={() => { handleDeleteUKSC(editingUKSC.id); setEditingUKSC(null); }} className="w-full py-4 text-red-400 font-bold hover:bg-red-50 rounded-2xl transition-all flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Remove Unit from Vault</button>
          </form>
        )}
      </Modal>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}

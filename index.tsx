
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
  EyeOff,
  ArrowLeft,
  Save,
  Loader2,
  Printer
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Interfaces ---

enum ProfileType {
  HOME = 'HOME',
  APARTMENT = 'APARTMENT'
}

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

// --- Constants ---

const STORAGE_KEY = 'powerbill_manager_v5_data';
const DEFAULT_URL_TEMPLATE = 'https://tgsouthernpower.org/billinginfo?ukscno=';

// Robust Proxy List for CORS bypass
const PROXY_LIST = [
  'https://api.allorigins.win/get?url=',
  'https://corsproxy.io/?',
  'https://thingproxy.freeboard.io/fetch/'
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

// --- Utilities ---

/**
 * Robust fetcher that rotates through proxies if one fails.
 * Solves "CORS Proxy failed to fetch HTML" error.
 */
const robustFetch = async (targetUrl: string): Promise<string> => {
  let lastError = null;
  
  for (const proxy of PROXY_LIST) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(targetUrl)}`);
      if (res.ok) {
        // allorigins returns a JSON object with 'contents'
        if (proxy.includes('allorigins')) {
          const data = await res.json();
          return data.contents;
        }
        // Others return raw text/html
        return await res.text();
      }
    } catch (e) {
      lastError = e;
      console.warn(`Proxy ${proxy} failed, trying next...`);
    }
  }
  
  throw lastError || new Error("Failed to bypass CORS for billing portal.");
};

// --- App Root Component ---

const App = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingUKSC, setEditingUKSC] = useState<UKSCNumber | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfiles(parsed);
        if (parsed.length > 0) setActiveProfileId(parsed[0].id);
      } catch (e) {
        console.error("Data Load Error", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  const activeProfile = useMemo(() => 
    profiles.find(p => p.id === activeProfileId) || null
  , [profiles, activeProfileId]);

  const handleCreateProfile = (name: string, type: ProfileType) => {
    const newProf: Profile = {
      id: crypto.randomUUID(),
      name,
      type,
      ukscs: []
    };
    setProfiles([...profiles, newProf]);
    setActiveProfileId(newProf.id);
    setIsNewProfileModalOpen(false);
  };

  const handleDeleteProfile = (id: string) => {
    if (confirm("Delete this entire property?")) {
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
    const duplicates: string[] = [];

    numbers.forEach(num => {
      if (allExistingNumbers.has(num)) {
        duplicates.push(num);
      } else {
        newUKSCs.push({
          id: crypto.randomUUID(),
          number: num,
          nickname: `Unit ${num.slice(-3)}`,
          tenantName: '',
          address: '',
          phone: '',
          customUrl: `${DEFAULT_URL_TEMPLATE}${num}`
        });
        allExistingNumbers.add(num);
      }
    });

    if (duplicates.length > 0) alert(`Service IDs skipped as they already exist: ${duplicates.join(', ')}`);
    if (newUKSCs.length > 0) {
      setProfiles(prev => prev.map(p => 
        p.id === activeProfileId ? { ...p, ukscs: [...p.ukscs, ...newUKSCs] } : p
      ));
    }
    setIsBulkAddModalOpen(false);
  };

  const handleUpdateUKSC = (updated: UKSCNumber) => {
    setProfiles(prev => prev.map(p => 
      p.id === activeProfileId ? { ...p, ukscs: p.ukscs.map(u => u.id === updated.id ? updated : u) } : p
    ));
    setEditingUKSC(null);
  };

  const handleDeleteUKSC = (id: string) => {
    if (confirm("Remove this unit from your vault?")) {
      setProfiles(prev => prev.map(p => 
        p.id === activeProfileId ? { ...p, ukscs: p.ukscs.filter(u => u.id !== id) } : p
      ));
    }
  };

  const fetchBillDetails = async (uksc: UKSCNumber) => {
    setLoading(uksc.id);
    try {
      const finalUrl = (uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number);
      const rawHtml = await robustFetch(finalUrl);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          { text: `Analyze the power billing portal HTML for UKSC: ${uksc.number}. Extract the following as a JSON object.` },
          { text: `Fields required: consumerName, billMonth, dueDate, amount, units, and status (paid/unpaid). \nHTML Content:\n${rawHtml.substring(0, 50000)}` }
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

      const data = JSON.parse(response.text || '{}');
      const billData: BillData = { ...data, lastFetched: new Date().toLocaleString() };

      setProfiles(prev => prev.map(p => ({
        ...p,
        ukscs: p.ukscs.map(u => u.id === uksc.id ? { ...u, billData } : u)
      })));
    } catch (err) {
      console.error(err);
      alert("Billing extraction failed. The portal might be experiencing high traffic or the service ID is incorrect.");
    } finally {
      setLoading(null);
    }
  };

  /**
   * PDF Architecture:
   * 1. DIGITAL SUMMARY: Data extracted by AI.
   * 2. VISUAL CAPTURE: Simulated headless browser print of the portal page.
   * 3. VERIFICATION GUIDE: How to get the official vector printout.
   */
  const generateFullPDFReport = async (uksc: UKSCNumber) => {
    setExportingId(uksc.id);
    const doc = new jsPDF();
    const finalUrl = (uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number);

    // PAGE 1: DIGITAL SUMMARY
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(79, 70, 229);
    doc.text("PowerBill Manager Report", 20, 30);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Digital ID: ${uksc.id.split('-')[0].toUpperCase()} | Data Checked: ${uksc.billData?.lastFetched || new Date().toLocaleString()}`, 20, 38);

    autoTable(doc, {
      startY: 50,
      head: [['Identity & Metadata', 'Values']],
      body: [
        ['Service Number (UKSC)', uksc.number],
        ['Property Reference', uksc.nickname],
        ['Resident Name', uksc.tenantName || 'N/A'],
        ['Plot/Flat Number', uksc.address || 'N/A'],
        ['Portal URL', finalUrl]
      ],
      headStyles: { fillColor: [79, 70, 229] },
      theme: 'grid'
    });

    if (uksc.billData) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 12,
        head: [['Extracted Billing Metrics', 'Status/Detail']],
        body: [
          ['Consumer on Portal', uksc.billData.consumerName],
          ['Billing Month', uksc.billData.billMonth],
          ['Units Consumed', uksc.billData.units],
          ['Payable Amount', uksc.billData.amount],
          ['Due Date', uksc.billData.dueDate],
          ['Payment Status', uksc.billData.status.toUpperCase()]
        ],
        headStyles: { fillColor: [30, 41, 59] },
        theme: 'striped'
      });
    }

    // PAGE 2: VISUAL CAPTURE (Headless Browser Simulation)
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("Headless Browser Portal Capture", 20, 25);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("The following image is a visual snapshot for reference and verification.", 20, 32);

    try {
      // Free visual capture API (WordPress mshots)
      const visualUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(finalUrl)}?w=1280&h=960`;
      const proxyImgUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(visualUrl)}`;
      const imgRes = await fetch(proxyImgUrl);
      const imgData = await imgRes.json();
      
      if (imgData.contents) {
        doc.addImage(imgData.contents, 'JPEG', 15, 45, 180, 135);
      } else {
        doc.text("[Snapshot in queue. Re-export in 30 seconds for higher quality.]", 20, 60);
      }
    } catch (e) {
      doc.setTextColor(153, 27, 27);
      doc.text("[Visual capture failed due to portal restrictions. Refer to Digital Summary.]", 20, 60);
    }

    // PAGE 3: APPEND INSTRUCTIONS (FOR OFFICIAL BROWSER PRINTOUT)
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("Official Browser Printout Verification", 20, 25);

    const steps = [
      "To obtain the government-branded vector printout and merge it:",
      "",
      "1. CLICK TO OPEN: " + finalUrl,
      "2. WAIT for the portal page to load all logos and data tables.",
      "3. PRESS 'Ctrl+P' (Windows) or 'Cmd+P' (Mac) to trigger Browser Print.",
      "4. SET Destination to 'Save as PDF' and Paper Size to 'A4'.",
      "5. DOWNLOAD the resulting PDF from your browser.",
      "6. MERGE that official page with this digital summary using any PDF tool.",
      "",
      "This process ensures you have both the Digital Report from PowerBill Manager",
      "and the original official portal output for your permanent records."
    ];

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    let currentY = 45;
    steps.forEach(line => {
      doc.text(line, 20, currentY);
      currentY += 8;
    });

    doc.save(`PowerBill_Report_${uksc.number}.pdf`);
    setExportingId(null);
  };

  const handleShareWhatsApp = async (uksc: UKSCNumber) => {
    if (!uksc.phone) return alert("Please set the tenant phone number first.");
    setExportingId(uksc.id);
    const doc = new jsPDF();
    doc.text(`PowerBill Summary - UKSC: ${uksc.number}`, 20, 20);
    if (uksc.billData) {
      doc.text(`Payable: ${uksc.billData.amount}`, 20, 30);
      doc.text(`Due Date: ${uksc.billData.dueDate}`, 20, 40);
    }
    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], `Statement_${uksc.number}.pdf`, { type: 'application/pdf' });
    
    let phone = uksc.phone.replace(/\D/g, '');
    phone = phone.startsWith('91') ? phone : `91${phone}`;
    
    const text = `Hi ${uksc.tenantName || 'Resident'},\n\nYour electricity bill statement for Service No: ${uksc.number} is ready.\n\nSummary:\nAmount: ${uksc.billData?.amount || 'N/A'}\nDue: ${uksc.billData?.dueDate || 'N/A'}\n\nGenerated via PowerBill Manager.`;

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({ files: [pdfFile], title: 'Bill Report', text });
      } catch (e) {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
      }
    } else {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    }
    setExportingId(null);
  };

  const handleExportData = () => {
    const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PowerBill_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  if (previewUrl) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom duration-300">
        <header className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
          <button onClick={() => setPreviewUrl(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="font-bold text-slate-800">Live Portal Portal</h2>
          <div className="w-10"></div>
        </header>
        <iframe src={previewUrl} className="flex-1 w-full border-none bg-white shadow-inner" title="Portal View" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen relative bg-slate-50/30">
      <button onClick={() => setIsSettingsModalOpen(true)} className="fixed top-6 right-6 z-50 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl text-slate-500 hover:text-indigo-600 hover:rotate-90 transition-all duration-300"><Settings className="w-6 h-6" /></button>

      <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-auto md:h-screen sticky top-0 z-30 shadow-sm">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 mb-10 group cursor-pointer" onClick={() => setActiveProfileId(profiles[0]?.id || null)}>
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl rotate-3 group-hover:rotate-0 transition-transform"><LayoutGrid className="w-7 h-7" /></div>
            <div><h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">PowerBill Manager</h1><p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Utility Intelligence</p></div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-4 px-2"><span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Property Vaults</span><button onClick={() => setIsNewProfileModalOpen(true)} className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"><PlusCircle className="w-5 h-5" /></button></div>
            {profiles.length === 0 && <p className="text-xs text-slate-300 italic px-2">No properties added yet.</p>}
            {profiles.map(p => (
              <div key={p.id} className="group relative">
                <button onClick={() => setActiveProfileId(p.id)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold ${activeProfileId === p.id ? 'bg-indigo-600 text-white shadow-lg translate-x-1' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {p.type === ProfileType.HOME ? <Home className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                  <span className="truncate">{p.name}</span>
                </button>
                <button onClick={() => handleDeleteProfile(p.id)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        {activeProfile ? (
          <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <nav className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2"><span>Directory</span><ChevronRight className="w-4 h-4" /><span className="text-indigo-600">{activeProfile.name}</span></nav>
                <div className="flex items-baseline gap-4">
                  <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">{activeProfile.name}</h2>
                  <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px] font-black uppercase tracking-wider">{activeProfile.type}</span>
                </div>
              </div>
              <button onClick={() => setIsBulkAddModalOpen(true)} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-extrabold shadow-2xl hover:bg-indigo-700 hover:-translate-y-1 transition-all flex items-center gap-3"><Plus className="w-5 h-5" />Bulk Import Units</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-10">
              {activeProfile.ukscs.map(uksc => (
                <div key={uksc.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col group hover:shadow-2xl transition-all duration-300">
                  <div className="p-8 flex-1 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="w-14 h-14 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 transition-colors"><FileText className="w-7 h-7" /></div>
                      <button onClick={() => setEditingUKSC(uksc)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors"><Edit3 className="w-5 h-5" /></button>
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">{uksc.nickname}</h4>
                      <p className="text-xs font-mono font-bold text-slate-400 mt-1">UKSC ID: {uksc.number}</p>
                    </div>
                    {uksc.billData ? (
                      <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Amount Payable</span>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${uksc.billData.status.toLowerCase().includes('paid') && !uksc.billData.status.toLowerCase().includes('unpaid') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{uksc.billData.status}</div>
                        </div>
                        <p className="text-3xl font-black text-slate-900">{uksc.billData.amount}</p>
                        <div className="flex flex-col gap-1">
                          <p className="text-[11px] font-bold text-slate-500 flex items-center gap-2"><Clock className="w-3 h-3 text-indigo-400" /> Due: {uksc.billData.dueDate}</p>
                          <p className="text-[9px] font-medium text-slate-300 uppercase tracking-tighter">Last Checked: {uksc.billData.lastFetched}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center opacity-60">
                        <Search className="w-8 h-8 text-slate-200 mb-3" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Check</p>
                      </div>
                    )}
                  </div>
                  <div className="p-6 pt-0 flex gap-2">
                    <button onClick={() => fetchBillDetails(uksc)} disabled={!!loading} className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black bg-white text-indigo-600 border border-slate-100 hover:bg-slate-50 disabled:opacity-50 transition-all">
                      {loading === uksc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Check Bill
                    </button>
                    <button onClick={() => setPreviewUrl((uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number))} className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-colors" title="Launch Portal"><Eye className="w-5 h-5" /></button>
                    <button onClick={() => generateFullPDFReport(uksc)} disabled={!!exportingId} className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 disabled:opacity-50 transition-all" title="Generate High-Fidelity PDF">
                      {exportingId === uksc.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                    <button onClick={() => handleShareWhatsApp(uksc)} className="p-4 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 shadow-lg hover:shadow-emerald-200 transition-all" title="Share via WhatsApp"><Share2 className="w-5 h-5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 mb-10"><Plus className="w-12 h-12" /></div>
            <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tighter">Your Vault is Empty</h2>
            <p className="text-slate-400 max-w-md mb-10 font-medium">Create a property vault to start managing and tracking electricity bills for your home or apartments.</p>
            <button onClick={() => setIsNewProfileModalOpen(true)} className="px-14 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-indigo-700 transition-all hover:-translate-y-2">Initialize New Vault</button>
          </div>
        )}
      </main>

      {/* --- MODALS --- */}

      <Modal isOpen={isNewProfileModalOpen} onClose={() => setIsNewProfileModalOpen(false)} title="Initialize Property">
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleCreateProfile(fd.get('name') as string, fd.get('type') as ProfileType); }} className="space-y-8">
          <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vault Identity</label><input name="name" required placeholder="e.g. Skyline Residency" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-bold placeholder:text-slate-300" /></div>
          <div className="grid grid-cols-2 gap-4">
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.HOME} defaultChecked className="hidden peer" /><div className="flex flex-col items-center p-6 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm"><Home className="w-8 h-8 text-slate-300 peer-checked:text-indigo-600 mb-3" /><span className="text-sm font-black text-slate-600">Home</span></div></label>
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.APARTMENT} className="hidden peer" /><div className="flex flex-col items-center p-6 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm"><Building2 className="w-8 h-8 text-slate-300 peer-checked:text-indigo-600 mb-3" /><span className="text-sm font-black text-slate-600">Apartment</span></div></label>
          </div>
          <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all active:scale-[0.98]">Confirm Property Vault</button>
        </form>
      </Modal>

      <Modal isOpen={isBulkAddModalOpen} onClose={() => setIsBulkAddModalOpen(false)} title="Bulk Import Service IDs">
        <div className="space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter UKSC Numbers</label>
            <textarea id="bulkInput" rows={6} placeholder="110390320&#10;110390321&#10;110390322" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-mono text-sm font-bold text-slate-700 placeholder:text-slate-200" />
            <p className="text-[10px] text-slate-400 font-medium italic">Separate multiple IDs with a new line or comma.</p>
          </div>
          <button onClick={() => handleBulkAdd((document.getElementById('bulkInput') as HTMLTextAreaElement).value)} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all">Add Units to Vault</button>
        </div>
      </Modal>

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="System Settings">
        <div className="space-y-10">
          <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl space-y-4">
             <div className="flex items-center gap-3"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /><span className="text-xs font-black text-slate-700 uppercase tracking-widest">Cloud Engine: Active</span></div>
             <p className="text-[10px] text-slate-400 font-medium">PowerBill Manager uses Gemini 3.0 Pro for intelligent data extraction and mshots for visual portal capture.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={handleExportData} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-indigo-50 hover:border-indigo-100 transition-all"><Download className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Export Backup</span></button>
            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-emerald-50 hover:border-emerald-100 transition-all"><Upload className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Import Backup</span></button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
             const file = e.target.files?.[0];
             if (!file) return;
             const reader = new FileReader();
             reader.onload = (event) => {
               try { setProfiles(JSON.parse(event.target?.result as string)); alert("Data imported successfully."); } catch (err) { alert("Invalid Backup File."); }
             };
             reader.readAsText(file);
          }} />
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">PowerBill Manager v5.0.2</div>
            <div className="text-[9px] text-slate-200 mt-1">Cross-Origin Proxy Intelligence Enabled</div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editingUKSC} onClose={() => setEditingUKSC(null)} title="Unit Configuration">
        {editingUKSC && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleUpdateUKSC({ ...editingUKSC, nickname: fd.get('nickname') as string, number: fd.get('number') as string, tenantName: fd.get('tenantName') as string, address: fd.get('address') as string, phone: fd.get('phone') as string, customUrl: fd.get('customUrl') as string }); }} className="space-y-6">
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unit Nickname</label><input name="nickname" defaultValue={editingUKSC.nickname} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500" /></div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">UKSC Service ID</label><input name="number" defaultValue={editingUKSC.number} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono font-bold outline-none focus:border-indigo-500" /></div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Occupant Name</label><input name="tenantName" defaultValue={editingUKSC.tenantName} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Plot / Flat No</label><input name="address" defaultValue={editingUKSC.address} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WhatsApp No</label><input name="phone" defaultValue={editingUKSC.phone} placeholder="+91..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-indigo-500" /></div>
            </div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom Portal Link (Optional)</label><input name="customUrl" defaultValue={editingUKSC.customUrl} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs font-bold outline-none focus:border-indigo-500" /></div>
            <div className="pt-6 flex gap-4">
              <button type="button" onClick={() => setEditingUKSC(null)} className="flex-1 py-4 text-slate-500 font-black hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
              <button type="submit" className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]">Update Unit</button>
            </div>
            <button type="button" onClick={() => { handleDeleteUKSC(editingUKSC.id); setEditingUKSC(null); }} className="w-full py-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl flex items-center justify-center gap-2 transition-colors"><Trash2 className="w-4 h-4" /> Purge from Vault</button>
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

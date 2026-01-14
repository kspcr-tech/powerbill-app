
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
  Loader2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Key,
  CheckCircle2,
  AlertTriangle,
  CalendarClock
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Interfaces ---

enum ProfileType {
  HOME = 'HOME',
  APARTMENT = 'APARTMENT'
}

type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

interface RefreshConfig {
  enabled: boolean;
  value: number;
  unit: TimeUnit;
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
  customUrl?: string; 
  billData?: BillData;
}

interface Profile {
  id: string;
  name: string;
  type: ProfileType;
  ukscs: UKSCNumber[];
}

interface AppSettings {
  refreshConfig: RefreshConfig;
  customApiKey: string;
}

// --- Constants ---

const STORAGE_KEY = 'powerbill_manager_v7_data';
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

const PortalPreview: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  const [scale, setScale] = useState(1);
  const desktopWidth = 1280; // Standard desktop width to emulate

  useEffect(() => {
    const handleResize = () => {
      const windowWidth = window.innerWidth;
      // If the screen is narrower than desktopWidth, scale down the iframe
      if (windowWidth < desktopWidth) {
        setScale(windowWidth / desktopWidth);
      } else {
        setScale(1);
      }
    };
    
    // Initial calculation
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in duration-300">
      <header className="px-6 py-4 border-b flex items-center justify-between bg-slate-50 shadow-sm z-20">
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <ExternalLink className="w-5 h-5 text-indigo-500" /> 
          Portal Preview <span className="text-[10px] font-normal bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full hidden sm:inline-block">Desktop Mode</span>
        </h2>
        <div className="w-10" />
      </header>
      <div className="flex-1 relative bg-slate-100 overflow-hidden w-full h-full">
        <iframe 
          src={url} 
          className="absolute inset-0 border-none bg-white origin-top-left shadow-2xl" 
          title="Portal View"
          style={{
            width: `${desktopWidth}px`,
            height: `${100 / scale}%`,
            transform: `scale(${scale})`
          }}
        />
      </div>
    </div>
  );
};

// --- Utilities ---

const robustFetch = async (targetUrl: string): Promise<string> => {
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
      console.warn(`Proxy failed: ${proxy}`);
    }
  }
  throw new Error("Billing portal unreachable. All network gateways blocked.");
};

const calculateMilliseconds = (value: number, unit: TimeUnit): number => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  switch (unit) {
    case 'minutes': return value * minute;
    case 'hours': return value * hour;
    case 'days': return value * day;
    case 'weeks': return value * day * 7;
    case 'months': return value * day * 30;
    case 'years': return value * day * 365;
    default: return 0;
  }
};

// --- App Root Component ---

const App = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  // Default settings
  const [appSettings, setAppSettings] = useState<AppSettings>({ 
    refreshConfig: { enabled: false, value: 6, unit: 'hours' }, 
    customApiKey: '' 
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingUKSC, setEditingUKSC] = useState<UKSCNumber | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for Settings Feedback
  const [tempApiKey, setTempApiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // STRICT API KEY POLICY: Only use the key from settings.
  const hasApiKey = useMemo(() => !!appSettings.customApiKey, [appSettings.customApiKey]);

  // Load Initial Data with Migration for old settings
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        let loadedSettings: AppSettings;

        // Migration logic for old refreshInterval string
        if (parsed.settings?.refreshInterval) {
           const old = parsed.settings.refreshInterval; // 'off' | '1h' etc
           const config: RefreshConfig = { enabled: false, value: 6, unit: 'hours' };
           
           if (old !== 'off') {
             config.enabled = true;
             if (old === '1h') config.value = 1;
             else if (old === '12h') config.value = 12;
             else if (old === '24h') config.value = 24;
           }
           loadedSettings = {
             customApiKey: parsed.settings.customApiKey || '',
             refreshConfig: config
           };
        } else if (parsed.settings?.refreshConfig) {
          loadedSettings = parsed.settings;
        } else {
          loadedSettings = { 
            refreshConfig: { enabled: false, value: 6, unit: 'hours' }, 
            customApiKey: parsed.settings?.customApiKey || '' 
          };
        }

        setProfiles(parsed.profiles || []);
        setAppSettings(loadedSettings);
        setTempApiKey(loadedSettings.customApiKey || '');
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

  const filteredUKSCs = useMemo(() => {
    if (!activeProfile) return [];
    if (!searchQuery) return activeProfile.ukscs;
    const q = searchQuery.toLowerCase();
    return activeProfile.ukscs.filter(u => 
      (u.number || '').toLowerCase().includes(q) || 
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.tenantName || '').toLowerCase().includes(q)
    );
  }, [activeProfile, searchQuery]);

  // Helper to check for global uniqueness of UKSC Number
  const isDuplicateUKSC = (number: string, excludeId: string | null = null) => {
    return profiles.some(profile => 
      profile.ukscs.some(uksc => uksc.number === number && uksc.id !== excludeId)
    );
  };

  const fetchBillDetails = async (uksc: UKSCNumber) => {
    const apiKeyToUse = appSettings.customApiKey;
    
    if (!apiKeyToUse) {
      setErrorLog("Settings API Key is missing. Please configure it.");
      setIsSettingsModalOpen(true);
      return;
    }

    setLoading(uksc.id);
    setProgress(5);
    setErrorLog(null);
    try {
      const finalUrl = (uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number);
      setProgress(25);
      const rawHtml = await robustFetch(finalUrl);
      setProgress(50);

      const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
      // Switched to 'gemini-3-flash-preview' for higher rate limits and speed
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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
      console.error(err);
      setErrorLog("AI Analysis Failed. Check Quota.");
    } finally {
      setTimeout(() => {
        setLoading(null);
        setProgress(0);
      }, 800);
    }
  };

  // Background Refresh Logic
  useEffect(() => {
    if (!appSettings.refreshConfig.enabled) return;

    const intervalMs = calculateMilliseconds(appSettings.refreshConfig.value, appSettings.refreshConfig.unit);
    if (intervalMs <= 0) return;

    const timer = setInterval(async () => {
      for (const p of profiles) {
        for (const u of p.ukscs) {
          await fetchBillDetails(u);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [appSettings.refreshConfig, profiles]);

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
    
    // Global Uniqueness Check
    const duplicates: string[] = [];
    const newUKSCs: UKSCNumber[] = [];
    
    numbers.forEach(num => {
      if (isDuplicateUKSC(num)) {
        duplicates.push(num);
      } else {
        const u: UKSCNumber = {
          id: crypto.randomUUID(), number: num, nickname: `Unit ${num.slice(-3)}`,
          tenantName: '', address: '', phone: '', customUrl: `${DEFAULT_URL_TEMPLATE}${num}`
        };
        newUKSCs.push(u);
      }
    });

    if (newUKSCs.length > 0) {
      setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, ukscs: [...p.ukscs, ...newUKSCs] } : p));
      newUKSCs.forEach(u => fetchBillDetails(u));
    }
    
    if (duplicates.length > 0) {
      alert(`Skipped ${duplicates.length} duplicate UKSC numbers: ${duplicates.join(', ')}`);
    }
    
    setIsBulkAddModalOpen(false);
  };

  const handleUpdateUKSC = (updated: UKSCNumber) => {
    if (isDuplicateUKSC(updated.number, updated.id)) {
      alert(`UKSC Number ${updated.number} already exists in the system. Uniqueness is required.`);
      return;
    }

    setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, ukscs: p.ukscs.map(u => u.id === updated.id ? updated : u) } : p));
    setEditingUKSC(null);
  };

  const handleDeleteUKSC = (id: string) => {
    if (confirm("Are you sure you want to delete this unit?")) {
      setProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, ukscs: p.ukscs.filter(u => u.id !== id) } : p));
    }
  };

  const handleSaveApiKey = () => {
    setIsSavingKey(true);
    setSaveSuccess(false);
    setTimeout(() => {
      setAppSettings(prev => ({ ...prev, customApiKey: tempApiKey }));
      setIsSavingKey(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1200);
  };

  const generatePDFDoc = (uksc: UKSCNumber) => {
    const doc = new jsPDF();
    const finalUrl = (uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number);

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 50, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(255, 255, 255);
    doc.text("POWERBILL SUMMARY", 20, 28);
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text(`Service ID: ${uksc.number}`, 20, 38);

    autoTable(doc, {
      startY: 70,
      head: [['Metadata', 'Details']],
      body: [
        ['Alias/Unit Name', uksc.nickname],
        ['Occupant', uksc.tenantName || 'N/A'],
        ['Plot/Flat Number', uksc.address || 'N/A']
      ],
      headStyles: { fillColor: [79, 70, 229] },
      theme: 'grid'
    });

    if (uksc.billData) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Bill Details', 'Value']],
        body: [
          ['Name on Portal', uksc.billData.consumerName],
          ['Billing Month', uksc.billData.billMonth],
          ['Payable Amount', uksc.billData.amount],
          ['Due Date', uksc.billData.dueDate],
          ['Units Used', uksc.billData.units]
        ],
        headStyles: { fillColor: [30, 41, 59] },
        theme: 'striped'
      });
    }

    const finalY = (doc as any).lastAutoTable.finalY + 35;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text("OFFICIAL PORTAL ACCESS:", 20, finalY);
    
    // Hyperlink to avoid text cutoff
    const linkText = `Bill for ${uksc.number}`;
    doc.setFontSize(18); 
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text(linkText, 20, finalY + 15);
    doc.link(20, finalY + 8, 80, 10, { url: finalUrl });
    
    // Underline
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.5);
    doc.line(20, finalY + 16, 20 + doc.getTextWidth(linkText), finalY + 16);

    const arrowY = finalY + 28;
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(1.5);
    doc.line(30, arrowY + 15, 30, arrowY); 
    doc.line(25, arrowY + 5, 30, arrowY); 
    doc.line(35, arrowY + 5, 30, arrowY); 
    
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text("CLICK THE TEXT ABOVE TO OPEN PORTAL", 40, arrowY + 8);
    
    return doc;
  }

  const handleDownloadPDF = async (uksc: UKSCNumber) => {
    setExportingId(uksc.id);
    setProgress(5);
    const doc = generatePDFDoc(uksc);
    setProgress(95);
    doc.save(`PowerBill_${uksc.number}.pdf`);
    setProgress(100);
    setTimeout(() => { setExportingId(null); setProgress(0); }, 800);
  };

  const handleShareWhatsApp = async (uksc: UKSCNumber) => {
    if (!uksc.phone) return alert("Please set a WhatsApp number for this unit.");
    
    setExportingId(uksc.id);
    setProgress(10);

    // Try sharing the actual PDF file via Web Share API (Mobile)
    try {
      if (navigator.canShare && navigator.share) {
         const doc = generatePDFDoc(uksc);
         const pdfBlob = doc.output('blob');
         const file = new File([pdfBlob], `Bill_${uksc.number}.pdf`, { type: 'application/pdf' });
         if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Bill Report - ${uksc.nickname}`,
              text: `Here is the electricity bill summary for ${uksc.nickname}.`
            });
            setExportingId(null);
            setProgress(0);
            return;
         }
      }
    } catch (e) {
      console.log("File share not supported or cancelled, falling back to text link.");
    }

    // Fallback to Text Link sharing
    const text = `*POWERBILL SUMMARY REPORT*\n---------------------------\n*Property:* ${activeProfile?.name}\n*Unit Alias:* ${uksc.nickname}\n*UKSC ID:* ${uksc.number}\n*Occupant:* ${uksc.tenantName || 'N/A'}\n*Address:* ${uksc.address || 'N/A'}\n\n*BILL DETAILS*\n*Month:* ${uksc.billData?.billMonth || 'N/A'}\n*Amount:* ${uksc.billData?.amount || 'N/A'}\n*Due Date:* ${uksc.billData?.dueDate || 'N/A'}\n*Status:* ${uksc.billData?.status || 'N/A'}\n\n_Official Portal Access:_\n${(uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number)}`;

    let phone = uksc.phone.replace(/\D/g, '');
    phone = phone.startsWith('91') ? phone : `91${phone}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    
    setExportingId(null);
    setProgress(0);
  };

  if (previewUrl) {
    return <PortalPreview url={previewUrl} onClose={() => setPreviewUrl(null)} />;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#fcfdfe] relative">
      <style>{`
        @keyframes blink-arrow { 0%, 100% { opacity: 1; transform: translateX(0); } 50% { opacity: 0.2; transform: translateX(6px); } }
        .blinking-arrow { animation: blink-arrow 0.6s infinite ease-in-out; }
      `}</style>

      <button onClick={() => setIsSettingsModalOpen(true)} className={`fixed top-6 right-6 z-50 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl text-slate-400 hover:text-indigo-600 transition-all hover:scale-105 active:scale-95 ${!hasApiKey ? 'ring-4 ring-red-100' : ''}`}>
        <Settings className="w-6 h-6" />
        {!hasApiKey && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />}
      </button>

      <aside className="w-full md:w-80 bg-white border-r border-slate-100 flex flex-col h-auto md:h-screen sticky top-0 z-30 shadow-sm">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg rotate-3"><LayoutGrid className="w-7 h-7" /></div>
            <div><h1 className="text-xl font-black text-slate-900 tracking-tight">PowerBill</h1><p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Manager</p></div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-4 px-2"><span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Property Vaults</span><button onClick={() => setIsNewProfileModalOpen(true)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-xl transition-colors"><PlusCircle className="w-5 h-5" /></button></div>
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
            {!hasApiKey && (
              <div className="bg-red-50 border border-red-100 rounded-3xl p-6 flex items-center gap-4 animate-in slide-in-from-top-4 duration-500">
                <div className="p-3 bg-red-100 rounded-2xl text-red-600"><AlertTriangle className="w-6 h-6" /></div>
                <div className="flex-1">
                  <h4 className="text-sm font-black text-red-900">AI Features Disabled</h4>
                  <p className="text-xs font-bold text-red-600/70">Please configure your Google GenAI API Key in Settings to enable automated bill extraction.</p>
                </div>
                <button onClick={() => setIsSettingsModalOpen(true)} className="px-5 py-2.5 bg-red-600 text-white text-xs font-black rounded-xl hover:bg-red-700 transition-colors">Setup Now</button>
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex-1">
                <nav className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2"><span>ACTIVE VAULT</span><ChevronRight className="w-3 h-3" /><span className="text-indigo-600">{activeProfile.name}</span></nav>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none mb-6">{activeProfile.name}</h2>
                <div className="relative w-full max-w-md">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search UKSC, Nickname or Tenant..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-14 pr-6 py-5 bg-white border border-slate-100 rounded-[1.8rem] shadow-sm focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all"
                  />
                </div>
              </div>
              <button onClick={() => setIsBulkAddModalOpen(true)} className="px-8 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl hover:bg-indigo-700 flex items-center gap-3 transition-all hover:-translate-y-1"><Plus className="w-5 h-5" />Add/Import UKSC IDs</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
              {filteredUKSCs.map(uksc => (
                <div key={uksc.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col group hover:shadow-2xl transition-all relative">
                  <div className="p-8 flex-1 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="w-14 h-14 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors"><FileText className="w-7 h-7" /></div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button onClick={() => setEditingUKSC(uksc)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors"><Edit3 className="w-5 h-5" /></button>
                        <button onClick={() => handleDeleteUKSC(uksc.id)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">{uksc.nickname}</h4>
                      <p className="text-xs font-mono font-bold text-slate-400 mt-1 uppercase">UKSC: {uksc.number}</p>
                    </div>
                    {uksc.billData ? (
                      <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100/30 space-y-4">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-indigo-400">
                          <span>Month: {uksc.billData.billMonth}</span>
                          <div className={`px-3 py-1 rounded-full ${uksc.billData.status.toLowerCase().includes('paid') && !uksc.billData.status.toLowerCase().includes('unpaid') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{uksc.billData.status}</div>
                        </div>
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Due Amount</p>
                            <p className="text-3xl font-black text-slate-900 tracking-tight leading-none">{uksc.billData.amount}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Due Date</p>
                            <p className="text-sm font-bold text-slate-700">{uksc.billData.dueDate}</p>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2 italic uppercase pt-2 border-t border-indigo-100"><Clock className="w-3 h-3 text-indigo-300" /> Fetched: {uksc.billData.lastFetched}</p>
                      </div>
                    ) : (
                      <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2.2rem] flex flex-col items-center justify-center opacity-40">
                        <Search className="w-8 h-8 text-slate-300 mb-3" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Awaiting Analysis</p>
                      </div>
                    )}
                    {(loading === uksc.id || exportingId === uksc.id) && <ProgressBar progress={progress} label={loading === uksc.id ? "Analyzing Portal..." : "Generating Report..."} />}
                    {errorLog && loading === uksc.id && <div className="mt-4 p-3 bg-red-50 rounded-xl flex items-center gap-2 text-[10px] font-bold text-red-600 animate-pulse"><AlertCircle className="w-4 h-4" />{errorLog}</div>}
                  </div>
                  <div className="p-6 pt-0 flex gap-2">
                    <button onClick={() => fetchBillDetails(uksc)} disabled={!!loading || !!exportingId} className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black bg-white text-indigo-600 border border-slate-100 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"><Search className="w-4 h-4" />Check</button>
                    <button onClick={() => setPreviewUrl((uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`).replace('<ukscnum>', uksc.number))} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-1 group relative overflow-hidden">
                      <Eye className="w-5 h-5" />
                      <ArrowRight className="w-4 h-4 blinking-arrow hidden group-hover:block" />
                    </button>
                    <button onClick={() => handleDownloadPDF(uksc)} disabled={!!loading || !!exportingId} className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-lg"><Download className="w-5 h-5" /></button>
                    <button onClick={() => handleShareWhatsApp(uksc)} className="p-4 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg"><Share2 className="w-5 h-5" /></button>
                  </div>
                </div>
              ))}
            </div>
            {filteredUKSCs.length === 0 && searchQuery && (
              <div className="py-20 text-center text-slate-400">
                <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-bold">No results found for "{searchQuery}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 bg-white shadow-2xl rounded-[2.5rem] flex items-center justify-center text-indigo-600 mb-10 rotate-3 transition-transform hover:rotate-0"><Plus className="w-12 h-12" /></div>
            <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tighter">Vault Empty</h2>
            <button onClick={() => setIsNewProfileModalOpen(true)} className="px-16 py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-indigo-700 transition-all hover:-translate-y-2 active:scale-95">Initialize Vault</button>
          </div>
        )}
      </main>

      {/* --- Modals --- */}
      <Modal isOpen={isNewProfileModalOpen} onClose={() => setIsNewProfileModalOpen(false)} title="Initialize Vault">
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleCreateProfile(fd.get('name') as string, fd.get('type') as ProfileType); }} className="space-y-8">
          <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vault Label</label><input name="name" required placeholder="Skyline Complex" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-bold" /></div>
          <div className="grid grid-cols-2 gap-4">
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.HOME} defaultChecked className="hidden peer" /><div className="flex flex-col items-center p-8 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm"><Home className="w-10 h-10 text-slate-300 peer-checked:text-indigo-600 mb-4" /><span className="text-sm font-black text-slate-600">Home</span></div></label>
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.APARTMENT} className="hidden peer" /><div className="flex flex-col items-center p-8 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm"><Building2 className="w-10 h-10 text-slate-300 peer-checked:text-indigo-600 mb-4" /><span className="text-sm font-black text-slate-600">Apartment</span></div></label>
          </div>
          <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all">Create Vault</button>
        </form>
      </Modal>

      <Modal isOpen={isBulkAddModalOpen} onClose={() => setIsBulkAddModalOpen(false)} title="Add/Import UKSC IDs">
        <div className="space-y-8">
          <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">UKSC Numbers (New line or comma)</label><textarea id="bulkInput" rows={6} placeholder="110390320, 110390321..." className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-mono text-sm font-bold text-slate-700" /></div>
          <button onClick={() => handleBulkAdd((document.getElementById('bulkInput') as HTMLTextAreaElement).value)} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-indigo-700 transition-all">Import & Auto-Check</button>
        </div>
      </Modal>

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Platform Settings">
        <div className="space-y-10 pb-8">
          {/* API KEY CONFIG */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><Key className="w-4 h-4" />Google GenAI API Key</div>
            <div className="space-y-3">
              <div className="relative group">
                <input 
                  type={showApiKey ? "text" : "password"}
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="Enter AI API Key..."
                  className={`w-full pl-6 pr-14 py-5 bg-slate-50 border-2 rounded-[1.5rem] focus:border-indigo-500 outline-none font-mono text-sm font-bold transition-all ${!tempApiKey && !appSettings.customApiKey ? 'border-red-100' : 'border-slate-100'}`}
                />
                <button 
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-indigo-600 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <button 
                onClick={handleSaveApiKey}
                disabled={isSavingKey}
                className={`w-full py-4 rounded-2xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 ${saveSuccess ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                {isSavingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : (saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />)}
                {isSavingKey ? 'Verifying & Saving...' : (saveSuccess ? 'API Key Saved!' : 'Save API Key')}
              </button>
            </div>
            {!hasApiKey && (
              <div className="px-3 py-2 bg-red-50 rounded-xl flex items-center gap-2 text-[9px] font-bold text-red-600 animate-pulse">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Extraction will fail without an API key.</span>
              </div>
            )}
          </div>

          {/* AI ENGINE STATUS */}
          <div className="p-8 bg-indigo-600 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full group-hover:scale-110 transition-transform duration-700" />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3"><ShieldCheck className="w-8 h-8 text-indigo-200" /><h4 className="text-xl font-black tracking-tight">AI Status</h4></div>
              <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-xl w-fit">
                <div className={`w-2 h-2 rounded-full animate-pulse ${hasApiKey ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="text-[10px] font-black uppercase tracking-widest">{hasApiKey ? 'Engine Ready' : 'Key Required'}</span>
              </div>
            </div>
          </div>

          {/* AUTO REFRESH CONFIG */}
          <div className="space-y-5 p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"><RefreshCw className="w-4 h-4" />Auto-Sync Frequency</div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={appSettings.refreshConfig.enabled} onChange={(e) => setAppSettings(prev => ({...prev, refreshConfig: {...prev.refreshConfig, enabled: e.target.checked}}))} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            
            {appSettings.refreshConfig.enabled && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <div className="flex gap-4 items-center">
                   <div className="flex-1">
                     <input 
                       type="number" 
                       min="1"
                       value={appSettings.refreshConfig.value}
                       onChange={(e) => setAppSettings(prev => ({...prev, refreshConfig: {...prev.refreshConfig, value: Math.max(1, parseInt(e.target.value) || 1)}}))}
                       className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-slate-700 focus:border-indigo-500 outline-none text-center"
                     />
                   </div>
                   <div className="flex-[2]">
                     <select 
                       value={appSettings.refreshConfig.unit} 
                       onChange={(e) => setAppSettings(prev => ({...prev, refreshConfig: {...prev.refreshConfig, unit: e.target.value as TimeUnit}}))}
                       className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-slate-700 focus:border-indigo-500 outline-none appearance-none"
                     >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                     </select>
                   </div>
                </div>
                <p className="mt-3 text-[10px] font-bold text-slate-400 text-center flex items-center justify-center gap-1">
                  <CalendarClock className="w-3 h-3" />
                  Applies globally to all vaults and UKSC numbers.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => { const blob = new Blob([JSON.stringify({profiles, settings: appSettings}, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'PowerBill_Backup.json'; link.click(); }} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-indigo-50 transition-all shadow-sm"><Download className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Export Vault</span></button>
            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-emerald-50 transition-all shadow-sm"><Upload className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Import Vault</span></button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
             const file = e.target.files?.[0];
             if (!file) return;
             const reader = new FileReader();
             reader.onload = (event) => { try { const p = JSON.parse(event.target?.result as string); setProfiles(p.profiles || []); setAppSettings({ customApiKey: p.settings?.customApiKey || '', refreshConfig: p.settings?.refreshConfig || { enabled: false, value: 6, unit: 'hours' } }); setTempApiKey(p.settings?.customApiKey || ''); alert("Vault Restored."); } catch (err) { alert("Invalid backup file."); } };
             reader.readAsText(file);
          }} />
        </div>
      </Modal>

      <Modal isOpen={!!editingUKSC} onClose={() => setEditingUKSC(null)} title="Unit Metadata Panel">
        {editingUKSC && (
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); handleUpdateUKSC({ ...editingUKSC, nickname: fd.get('nickname') as string, number: fd.get('number') as string, tenantName: fd.get('tenantName') as string, address: fd.get('address') as string, phone: fd.get('phone') as string, customUrl: fd.get('customUrl') as string }); }} className="space-y-6">
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alias Name</label><input name="nickname" defaultValue={editingUKSC.nickname} required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">UKSC Number</label><input name="number" defaultValue={editingUKSC.number} required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tenant Name</label><input name="tenantName" defaultValue={editingUKSC.tenantName} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Plot/Flat No</label><input name="address" defaultValue={editingUKSC.address} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp No</label><input name="phone" defaultValue={editingUKSC.phone} placeholder="91XXXXXXXXXX" className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-all" /></div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custom Portal URL (Optional)</label>
              <input 
                name="customUrl" 
                defaultValue={editingUKSC.customUrl} 
                placeholder={DEFAULT_URL_TEMPLATE + editingUKSC.number}
                className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-xs font-bold focus:border-indigo-500 outline-none transition-all text-slate-600" 
              />
              <p className="text-[10px] text-slate-400 ml-2 font-medium">Use &lt;ukscnum&gt; as placeholder for dynamic ID insertion.</p>
            </div>

            <div className="pt-8 flex gap-4">
              <button type="button" onClick={() => setEditingUKSC(null)} className="flex-1 py-4 text-slate-400 font-black hover:text-slate-600 transition-colors">Cancel</button>
              <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">Save Changes</button>
            </div>
            <button type="button" onClick={() => { handleDeleteUKSC(editingUKSC.id); setEditingUKSC(null); }} className="w-full py-4 text-red-400 font-bold hover:bg-red-50 rounded-2xl transition-all flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Delete Unit</button>
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

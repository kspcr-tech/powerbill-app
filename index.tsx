
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
  Users, 
  Phone, 
  MapPin, 
  Info,
  X,
  PlusCircle,
  LayoutGrid,
  Menu,
  ChevronRight,
  FileText,
  Clock,
  Settings,
  Upload,
  Eye,
  EyeOff,
  ArrowLeft,
  ExternalLink,
  Save,
  Link as LinkIcon
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
  portalSummary?: string; // New: Descriptive summary of what was seen on the portal
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

const STORAGE_KEY = 'powervault_data';
const API_KEY_KEY = 'powervault_api_key';
const DEFAULT_URL_TEMPLATE = 'https://tgsouthernpower.org/billinginfo?ukscno=';
const CORS_PROXY = 'https://api.allorigins.win/get?url=';

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

// --- App Root Component ---

const App = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  // API Key State
  const [apiKeyInput, setApiKeyInput] = useState<string>(localStorage.getItem(API_KEY_KEY) || '');
  const [showApiKey, setShowApiKey] = useState(false);
  
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingUKSC, setEditingUKSC] = useState<UKSCNumber | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const [loading, setLoading] = useState<string | null>(null);
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

  const handleSaveApiKey = () => {
    localStorage.setItem(API_KEY_KEY, apiKeyInput);
    alert("API Key saved locally.");
  };

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
    if (confirm("Delete this entire property vault?")) {
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

    if (duplicates.length > 0) {
      alert(`The following UKSC numbers already exist and were skipped: ${duplicates.join(', ')}`);
    }

    if (newUKSCs.length > 0) {
      setProfiles(prev => prev.map(p => 
        p.id === activeProfileId ? { ...p, ukscs: [...p.ukscs, ...newUKSCs] } : p
      ));
    }
    setIsBulkAddModalOpen(false);
  };

  const handleUpdateUKSC = (updated: UKSCNumber) => {
    setProfiles(prev => prev.map(p => ({
      ...p,
      ukscs: p.ukscs.map(u => u.id === updated.id ? updated : u)
    })));
    setEditingUKSC(null);
  };

  const handleDeleteUKSC = (id: string) => {
    if (confirm("Remove this service number?")) {
      setProfiles(prev => prev.map(p => ({
        ...p,
        ukscs: p.ukscs.filter(u => u.id !== id)
      })));
    }
  };

  const fetchBillDetails = async (uksc: UKSCNumber) => {
    const apiKey = localStorage.getItem(API_KEY_KEY) || process.env.API_KEY;
    if (!apiKey) {
      alert("Please set your Gemini API key in Settings first.");
      setIsSettingsModalOpen(true);
      return;
    }

    setLoading(uksc.id);
    try {
      const finalUrl = (uksc.customUrl || `${DEFAULT_URL_TEMPLATE}${uksc.number}`)
        .replace('<ukscnum>', uksc.number);

      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(finalUrl)}`;
      const proxyResponse = await fetch(proxyUrl);
      if (!proxyResponse.ok) throw new Error("CORS Proxy failed to fetch.");
      
      const proxyData = await proxyResponse.json();
      const rawHtml = proxyData.contents;

      if (!rawHtml || rawHtml.length < 100) {
        throw new Error("Received insufficient HTML content from proxy.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          { text: `I have fetched the HTML content from the power billing portal for UKSC Number: ${uksc.number}.` },
          { text: `TASK: Analyze this HTML and extract the latest billing details. 
            - Find "Total Amount Payable" or "Net Amount Due".
            - Find "Due Date" or "Payment Deadline".
            - Find "Consumer Name".
            - Find "Bill Month".
            - Find "Units Consumed".
            - Identify if the status is "Paid" or "Unpaid".
            - Provide a brief "portalSummary" describing the main layout findings (e.g., "The portal shows a pending amount of X for consumer Y with a due date of Z").
            
            HTML CONTENT SNIPPET:\n${rawHtml.substring(0, 80000)}` 
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              consumerName: { type: Type.STRING },
              billMonth: { type: Type.STRING },
              dueDate: { type: Type.STRING, description: "Payment Due Date" },
              amount: { type: Type.STRING, description: "Total Amount Payable" },
              units: { type: Type.STRING },
              status: { type: Type.STRING },
              portalSummary: { type: Type.STRING, description: "A summary of the portal view for report generation" },
            },
            required: ["consumerName", "billMonth", "dueDate", "amount", "units", "status", "portalSummary"]
          }
        }
      });

      const textOutput = response.text || '{}';
      const data = JSON.parse(textOutput);
      const billData: BillData = { ...data, lastFetched: new Date().toLocaleString() };

      setProfiles(prev => prev.map(p => ({
        ...p,
        ukscs: p.ukscs.map(u => u.id === uksc.id ? { ...u, billData } : u)
      })));
    } catch (err) {
      console.error(err);
      alert("Failed to fetch bill details. This portal might be blocking the proxy, or the HTML is too complex for basic parsing.");
    } finally {
      setLoading(null);
    }
  };

  const constructPDF = (uksc: UKSCNumber) => {
    const doc = new jsPDF();
    const finalUrl = uksc.customUrl.replace('<ukscnum>', uksc.number);
    
    // --- Header Section ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(79, 70, 229);
    doc.text("PowerVault Property Statement", 20, 30);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Digital Verification ID: ${uksc.id.split('-')[0].toUpperCase()}`, 20, 38);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 44);

    // --- Table 1: Property & Occupant Details ---
    autoTable(doc, {
      startY: 55,
      head: [['Property Profile', 'Official Information']],
      body: [
        ['UKSC Service Number', uksc.number],
        ['Property Alias', uksc.nickname],
        ['Address / Plot', uksc.address || 'N/A'],
        ['Occupant / Tenant', uksc.tenantName || 'N/A'],
        ['Contact Mobile', uksc.phone || 'N/A'],
        ['Official Portal Link', finalUrl],
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], fontSize: 11 },
      styles: { fontSize: 10, cellPadding: 5 }
    });

    // --- Table 2: Billing Data Snapshot ---
    if (uksc.billData) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['Billing Component', 'Current Status']],
        body: [
          ['Consumer Name', uksc.billData.consumerName],
          ['Billing Cycle', uksc.billData.billMonth],
          ['Payment Due Date', uksc.billData.dueDate],
          ['Consumption (Units)', `${uksc.billData.units} Units`],
          ['Total Amount Payable', uksc.billData.amount],
          ['Settlement Status', uksc.billData.status.toUpperCase()],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 11 },
        styles: { fontSize: 10, cellPadding: 5 }
      });

      // --- New Section: Portal Preview / AI Analysis Summary ---
      const finalY = (doc as any).lastAutoTable.finalY;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text("Portal Analysis Snapshot", 20, finalY + 15);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      
      const summaryText = uksc.billData.portalSummary || "Digital scan complete. The billing portal confirms the above extracted values for this service number. Please verify at the official link provided in Section 1.";
      const splitText = doc.splitTextToSize(summaryText, 170);
      doc.text(splitText, 20, finalY + 23);

      // --- Verification Note ---
      const noteY = finalY + 23 + (splitText.length * 5) + 10;
      doc.setDrawColor(226, 232, 240);
      doc.line(20, noteY, 190, noteY);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Note: This document is generated based on automated portal extraction. For official records, please refer to the electricity department's physical bill or their official online portal directly.", 20, noteY + 8);
    } else {
      const finalY = (doc as any).lastAutoTable.finalY;
      doc.setFont("helvetica", "italic");
      doc.setTextColor(148, 163, 184);
      doc.text("No billing data currently available. Perform a 'Check Bill' to populate this section.", 20, finalY + 15);
    }

    return doc;
  };

  const handleDownloadPDF = (uksc: UKSCNumber) => {
    const doc = constructPDF(uksc);
    doc.save(`PowerVault_Bill_${uksc.number}.pdf`);
  };

  const handleShareWhatsApp = async (uksc: UKSCNumber) => {
    if (!uksc.phone) return alert("Add tenant phone number first.");
    
    const doc = constructPDF(uksc);
    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], `Statement_${uksc.number}.pdf`, { type: 'application/pdf' });

    let phone = uksc.phone.trim();
    if (!phone.startsWith('+')) {
      const cleanPhone = phone.replace(/\D/g, '');
      phone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    } else {
      const plusPrefix = phone.startsWith('+') ? '+' : '';
      const rest = phone.replace(/\D/g, '');
      phone = `${plusPrefix}${rest}`;
    }

    const shareText = `Hello ${uksc.tenantName || 'Resident'},\n\nYour power bill status for ${uksc.address || 'Property ' + uksc.number} is updated.\n\nSummary:\n- Amount: ${uksc.billData?.amount || 'Fetch Pending'}\n- Due Date: ${uksc.billData?.dueDate || 'N/A'}\n- Status: ${uksc.billData?.status || 'N/A'}\n\nPlease find the attached Digital Statement for detailed information.`;

    if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: `Power Statement - ${uksc.number}`,
          text: shareText
        });
      } catch (e) {
        window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(shareText + "\n\nLink: " + uksc.customUrl.replace('<ukscnum>', uksc.number))}`, '_blank');
      }
    } else {
      window.open(`https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(shareText + "\n\nLink: " + uksc.customUrl.replace('<ukscnum>', uksc.number))}`, '_blank');
    }
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify(profiles, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PowerVault_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setProfiles(json);
          if (json.length > 0) setActiveProfileId(json[0].id);
          alert("Data imported successfully.");
        } else {
          throw new Error("Invalid format");
        }
      } catch (err) {
        alert("Failed to import data.");
      }
    };
    reader.readAsText(file);
  };

  if (previewUrl) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col">
        <header className="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setPreviewUrl(null)}
              className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-slate-800">Portal Preview</h2>
          </div>
          <div className="text-xs text-slate-400 font-mono truncate max-w-md hidden md:block">
            {previewUrl}
          </div>
        </header>
        <div className="flex-1 relative bg-slate-100 flex items-center justify-center">
          <iframe 
            src={previewUrl} 
            className="w-full h-full border-none bg-white shadow-inner"
            title="Service Preview"
          />
          <div className="absolute bottom-10 right-10 bg-white/90 backdrop-blur p-4 rounded-2xl shadow-xl border border-slate-200 max-w-sm">
            <p className="text-xs text-slate-500 leading-relaxed">
              <strong>Note:</strong> Some portals block embedding. Use the button below if the screen is blank.
            </p>
            <button 
              onClick={() => window.open(previewUrl, '_blank')}
              className="mt-3 text-indigo-600 font-bold text-xs flex items-center gap-2 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open Portal in New Tab
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen relative">
      {/* Global Settings Trigger - Top Right */}
      <button 
        onClick={() => setIsSettingsModalOpen(true)} 
        className="fixed top-6 right-6 z-50 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all text-slate-500 hover:text-indigo-600"
      >
        <Settings className="w-6 h-6" />
      </button>

      <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-auto md:h-screen sticky top-0 z-30">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 rotate-3">
              <LayoutGrid className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">PowerVault</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Asset Manager</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vaults</span>
              <button onClick={() => setIsNewProfileModalOpen(true)} className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-all">
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>
            {profiles.map(p => (
              <div key={p.id} className="group relative">
                <button
                  onClick={() => setActiveProfileId(p.id)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold ${activeProfileId === p.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {p.type === ProfileType.HOME ? <Home className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                  <span className="truncate">{p.name}</span>
                </button>
                <button onClick={() => handleDeleteProfile(p.id)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-slate-50/50 p-6 md:p-12 overflow-y-auto">
        {activeProfile ? (
          <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest">
                  <span>Directory</span>
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-indigo-600">{activeProfile.name}</span>
                </nav>
                <div className="flex items-center gap-5">
                  <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">{activeProfile.name}</h2>
                  <div className="px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wider">
                    {activeProfile.type}
                  </div>
                </div>
              </div>
              <button onClick={() => setIsBulkAddModalOpen(true)} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-extrabold shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-1 flex items-center gap-3">
                <Plus className="w-5 h-5" />
                Bulk Import
              </button>
            </div>

            {activeProfile.ukscs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {activeProfile.ukscs.map(uksc => (
                  <div key={uksc.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300">
                    <div className="p-8 flex-1 space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-14 h-14 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 transition-colors">
                          <FileText className="w-7 h-7" />
                        </div>
                        <button onClick={() => setEditingUKSC(uksc)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all">
                          <Edit3 className="w-5 h-5" />
                        </button>
                      </div>
                      <div>
                        <h4 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{uksc.nickname}</h4>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service ID</span>
                          <span className="text-xs font-mono font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">{uksc.number}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                        <div className="space-y-1 text-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Resident</span>
                          <span className="font-bold text-slate-700 truncate block">{uksc.tenantName || 'Unassigned'}</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Address</span>
                          <span className="font-bold text-slate-700 truncate block">{uksc.address || 'Not Set'}</span>
                        </div>
                      </div>
                      {uksc.billData ? (
                        <div className="p-5 bg-indigo-50 rounded-3xl border border-indigo-100 space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Status</span>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${uksc.billData.status.toLowerCase().includes('paid') && !uksc.billData.status.toLowerCase().includes('unpaid') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {uksc.billData.status}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Total Amount Payable</p>
                            <p className="text-3xl font-black text-slate-900">{uksc.billData.amount}</p>
                          </div>
                          <p className="text-[11px] font-bold text-indigo-600/70 flex items-center gap-1"><Clock className="w-3 h-3" /> Due: {uksc.billData.dueDate}</p>
                        </div>
                      ) : (
                        <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center opacity-60">
                          <Search className="w-8 h-8 text-slate-200 mb-3" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fetch Bill Data</p>
                        </div>
                      )}
                    </div>
                    <div className="p-6 pt-0 flex gap-2">
                      <button onClick={() => fetchBillDetails(uksc)} disabled={loading === uksc.id} className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black bg-white text-indigo-600 border border-slate-100 hover:bg-slate-50 transition-all">
                        {loading === uksc.id ? <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                        {loading === uksc.id ? 'Fetching...' : 'Check Bill'}
                      </button>
                      <button onClick={() => setPreviewUrl(uksc.customUrl.replace('<ukscnum>', uksc.number))} className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all" title="Preview Portal"><Eye className="w-5 h-5" /></button>
                      <button onClick={() => handleDownloadPDF(uksc)} className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all" title="Export Pro Statement"><Download className="w-5 h-5" /></button>
                      <button onClick={() => handleShareWhatsApp(uksc)} className="p-4 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-100 transition-all" title="Share Official PDF"><Share2 className="w-5 h-5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-[3rem] p-24 text-center border-2 border-dashed border-slate-100 max-w-2xl mx-auto shadow-2xl">
                <LayoutGrid className="w-20 h-20 text-indigo-600 mb-8 mx-auto" />
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Vault Empty</h3>
                <button onClick={() => setIsBulkAddModalOpen(true)} className="mt-10 px-12 py-5 bg-indigo-600 text-white rounded-3xl font-extrabold shadow-xl transition-all active:scale-95">Import Units</button>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Plus className="w-14 h-14 text-indigo-600 mb-10" />
            <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tighter">Welcome to PowerVault</h2>
            <button onClick={() => setIsNewProfileModalOpen(true)} className="px-14 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-2xl transition-all hover:-translate-y-2">Start New Vault</button>
          </div>
        )}
      </main>

      {/* --- Modals --- */}

      <Modal isOpen={isNewProfileModalOpen} onClose={() => setIsNewProfileModalOpen(false)} title="New Property Vault">
        <form onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          handleCreateProfile(fd.get('name') as string, fd.get('type') as ProfileType);
        }} className="space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vault Name</label>
            <input name="name" required placeholder="e.g. My Residency" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-bold" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.HOME} defaultChecked className="hidden peer" /><div className="flex flex-col items-center p-6 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all"><Home className="w-8 h-8 text-slate-300 peer-checked:text-indigo-600 mb-3" /><span className="text-sm font-black text-slate-600">Home</span></div></label>
            <label className="cursor-pointer group"><input type="radio" name="type" value={ProfileType.APARTMENT} className="hidden peer" /><div className="flex flex-col items-center p-6 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all"><Building2 className="w-8 h-8 text-slate-300 peer-checked:text-indigo-600 mb-3" /><span className="text-sm font-black text-slate-600">Apartment</span></div></label>
          </div>
          <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl shadow-indigo-100 active:scale-95 transition-all">Secure Vault</button>
        </form>
      </Modal>

      <Modal isOpen={isBulkAddModalOpen} onClose={() => setIsBulkAddModalOpen(false)} title="Bulk Import Service IDs">
        <div className="space-y-8">
          <textarea id="bulkInput" rows={6} placeholder="110390320&#10;110390321" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 outline-none font-mono text-sm font-bold text-slate-700" />
          <button onClick={() => handleBulkAdd((document.getElementById('bulkInput') as HTMLTextAreaElement).value)} className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl shadow-indigo-100 active:scale-95 transition-all">Import Units</button>
        </div>
      </Modal>

      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="App Settings">
        <div className="space-y-10">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Google Gemini API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input 
                  type={showApiKey ? "text" : "password"} 
                  value={apiKeyInput} 
                  onChange={(e) => setApiKeyInput(e.target.value)} 
                  placeholder="Paste your API key here..." 
                  className="w-full pl-5 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-mono text-sm" 
                />
                <button 
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600"
                >
                  {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <button 
                onClick={handleSaveApiKey}
                className="px-6 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"
              >
                <Save className="w-5 h-5" />
                Save
              </button>
            </div>
            <p className="text-[10px] text-slate-400 italic">Key stored locally only. This is required for bill data extraction via Gemini-3 Pro.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={handleExportData} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-indigo-50 transition-all"><Download className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Export JSON</span></button>
            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-3 p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:bg-emerald-50 transition-all"><Upload className="w-6 h-6 text-slate-400" /><span className="text-sm font-black text-slate-600">Import JSON</span></button>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportData} />
          <div className="pt-6 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">PowerVault v3.5 • PDF Enhancement Active</div>
        </div>
      </Modal>

      <Modal isOpen={!!editingUKSC} onClose={() => setEditingUKSC(null)} title="Unit Settings">
        {editingUKSC && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            handleUpdateUKSC({
              ...editingUKSC,
              nickname: fd.get('nickname') as string,
              number: fd.get('number') as string,
              tenantName: fd.get('tenantName') as string,
              address: fd.get('address') as string,
              phone: fd.get('phone') as string,
              customUrl: fd.get('customUrl') as string,
            });
          }} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">UKSC Nickname</label>
              <input name="nickname" defaultValue={editingUKSC.nickname} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service ID (UKSC)</label>
              <input name="number" defaultValue={editingUKSC.number} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-mono font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resident Name</label>
              <input name="tenantName" defaultValue={editingUKSC.tenantName} placeholder="Full name" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Address</label><input name="address" defaultValue={editingUKSC.address} placeholder="e.g. Plot 45" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contact (WhatsApp)</label><input name="phone" defaultValue={editingUKSC.phone} placeholder="+91..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" /></div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Portal Override URL</label>
              <input name="customUrl" defaultValue={editingUKSC.customUrl} placeholder="Portal URL..." className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-mono text-xs font-bold" />
              <p className="text-[10px] text-slate-400 italic">Template: Use '&lt;ukscnum&gt;' to auto-inject the UKSC ID.</p>
            </div>
            <div className="pt-6 flex gap-4">
              <button type="button" onClick={() => setEditingUKSC(null)} className="flex-1 py-4 text-slate-500 font-black hover:bg-slate-50 rounded-2xl transition-all">Discard</button>
              <button type="submit" className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl active:scale-95 transition-all">Apply Changes</button>
            </div>
            <button type="button" onClick={() => { handleDeleteUKSC(editingUKSC.id); setEditingUKSC(null); }} className="w-full py-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Delete Property Connection</button>
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

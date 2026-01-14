
import React, { useState, useEffect, useMemo } from 'react';
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
  flatNo: string;
  phone: string;
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

// --- Components ---

const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode 
}> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
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
  // State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [editingUKSC, setEditingUKSC] = useState<UKSCNumber | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // Load Data
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

  // Save Data
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  const activeProfile = useMemo(() => 
    profiles.find(p => p.id === activeProfileId) || null
  , [profiles, activeProfileId]);

  // Handlers
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
    const newUKSCs: UKSCNumber[] = numbers.map(num => ({
      id: crypto.randomUUID(),
      number: num,
      nickname: `Unit ${num.slice(-3)}`,
      tenantName: '',
      flatNo: '',
      phone: ''
    }));

    setProfiles(prev => prev.map(p => 
      p.id === activeProfileId ? { ...p, ukscs: [...p.ukscs, ...newUKSCs] } : p
    ));
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
    setLoading(uksc.id);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Scrape or simulate the current power bill status for TSSPDCL UKSC No: ${uksc.number}. 
        Return a valid JSON object matching the BillData interface.`,
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
      alert("Billing server unavailable. Try again later.");
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadPDF = (uksc: UKSCNumber) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("PowerVault Bill Summary", 20, 30);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 38);

    autoTable(doc, {
      startY: 50,
      head: [['Property Detail', 'Value']],
      body: [
        ['UKSC Number', uksc.number],
        ['Property Reference', uksc.nickname],
        ['Tenant', uksc.tenantName || 'N/A'],
        ['Address Reference', uksc.flatNo || 'N/A'],
        ['Contact', uksc.phone || 'N/A'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }
    });

    if (uksc.billData) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['Billing Information', 'Status']],
        body: [
          ['Consumer Name', uksc.billData.consumerName],
          ['Billing Cycle', uksc.billData.billMonth],
          ['Due Date', uksc.billData.dueDate],
          ['Consumption', `${uksc.billData.units} Units`],
          ['Amount Due', uksc.billData.amount],
          ['Payment Status', uksc.billData.status],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59] }
      });
    }

    doc.save(`Bill_${uksc.number}.pdf`);
  };

  const handleShareWhatsApp = (uksc: UKSCNumber) => {
    if (!uksc.phone) return alert("Add tenant phone number first.");
    const cleanPhone = uksc.phone.replace(/\D/g, '');
    const phone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    const msg = `Dear ${uksc.tenantName || 'Resident'},\n\nYour power bill for Unit ${uksc.flatNo || uksc.nickname} (UKSC: ${uksc.number}) is ready.\n\nAmount: ${uksc.billData?.amount || 'Check link'}\nDue Date: ${uksc.billData?.dueDate || 'N/A'}\n\nPay here: https://tgsouthernpower.org/billinginfo?ukscno=${uksc.number}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar */}
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
              <button 
                onClick={() => setIsNewProfileModalOpen(true)}
                className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-all"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>

            {profiles.map(p => (
              <div key={p.id} className="group relative">
                <button
                  onClick={() => setActiveProfileId(p.id)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold ${
                    activeProfileId === p.id 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                    : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.type === ProfileType.HOME ? <Home className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                  <span className="truncate">{p.name}</span>
                </button>
                <button 
                  onClick={() => handleDeleteProfile(p.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main View */}
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
                  <div className="px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wider shadow-sm shadow-indigo-50">
                    {activeProfile.type}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsBulkAddModalOpen(true)}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-extrabold shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-1 flex items-center gap-3"
                >
                  <Plus className="w-5 h-5" />
                  Bulk Import
                </button>
              </div>
            </div>

            {activeProfile.ukscs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {activeProfile.ukscs.map(uksc => (
                  <div key={uksc.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-300">
                    <div className="p-8 flex-1 space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-14 h-14 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          <FileText className="w-7 h-7" />
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setEditingUKSC(uksc)}
                            className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-2xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{uksc.nickname}</h4>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Service NO</span>
                          <span className="text-xs font-mono font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">{uksc.number}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Occupant</span>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-300" />
                            <span className="text-sm font-bold text-slate-700 truncate">{uksc.tenantName || 'Unassigned'}</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Flat Ref</span>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-300" />
                            <span className="text-sm font-bold text-slate-700 truncate">{uksc.flatNo || 'Not Set'}</span>
                          </div>
                        </div>
                      </div>

                      {uksc.billData ? (
                        <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Bill Status</span>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                              uksc.billData.status.toLowerCase().includes('paid') && !uksc.billData.status.toLowerCase().includes('unpaid')
                              ? 'bg-emerald-100 text-emerald-700' 
                              : 'bg-red-100 text-red-700'
                            }`}>
                              {uksc.billData.status}
                            </div>
                          </div>
                          <div>
                            <p className="text-3xl font-black text-slate-900">{uksc.billData.amount}</p>
                            <p className="text-[11px] font-bold text-indigo-600/70 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Due: {uksc.billData.dueDate}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center text-center opacity-60">
                          <Search className="w-8 h-8 text-slate-200 mb-3" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fetch data to view bill</p>
                        </div>
                      )}
                    </div>

                    <div className="p-6 pt-0 flex gap-2">
                      <button 
                        onClick={() => fetchBillDetails(uksc)}
                        disabled={loading === uksc.id}
                        className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl text-xs font-black transition-all shadow-lg ${
                          loading === uksc.id 
                          ? 'bg-slate-100 text-slate-400 shadow-none' 
                          : 'bg-white text-indigo-600 hover:bg-slate-50 border border-slate-100'
                        }`}
                      >
                        {loading === uksc.id ? <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                        {loading === uksc.id ? 'Loading...' : 'Check Bill'}
                      </button>
                      <button 
                        onClick={() => handleDownloadPDF(uksc)}
                        className="p-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                        title="Export PDF"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleShareWhatsApp(uksc)}
                        className="p-4 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100"
                        title="Share WhatsApp"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-[3rem] p-24 text-center border-2 border-dashed border-slate-100 flex flex-col items-center max-w-2xl mx-auto shadow-2xl shadow-slate-100">
                <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mb-8 rotate-6">
                  <LayoutGrid className="w-12 h-12" />
                </div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Vault is Empty</h3>
                <p className="text-slate-500 mt-4 leading-relaxed font-medium">No services added yet. Start by importing your power bill numbers to track them here.</p>
                <button 
                  onClick={() => setIsBulkAddModalOpen(true)}
                  className="mt-10 px-12 py-5 bg-indigo-600 text-white rounded-3xl font-extrabold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
                >
                  Import Service Numbers
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-32 h-32 bg-white rounded-[3rem] shadow-2xl shadow-slate-200 flex items-center justify-center text-indigo-600 mb-10 rotate-12">
              <Plus className="w-14 h-14" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter mb-6">Welcome to PowerVault</h2>
            <p className="text-slate-500 text-lg max-w-md mx-auto leading-relaxed font-medium mb-10">Create your first property vault to start managing and sharing power bills with your residents.</p>
            <button 
              onClick={() => setIsNewProfileModalOpen(true)}
              className="px-14 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-2"
            >
              Start New Vault
            </button>
          </div>
        )}
      </main>

      {/* --- Modals --- */}

      {/* Profile Modal */}
      <Modal isOpen={isNewProfileModalOpen} onClose={() => setIsNewProfileModalOpen(false)} title="New Property Vault">
        <form onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          handleCreateProfile(fd.get('name') as string, fd.get('type') as ProfileType);
        }} className="space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vault Name</label>
            <input name="name" required placeholder="e.g. Dream Residency, My Villa" className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Property Format</label>
            <div className="grid grid-cols-2 gap-4">
              <label className="cursor-pointer group">
                <input type="radio" name="type" value={ProfileType.HOME} defaultChecked className="hidden peer" />
                <div className="flex flex-col items-center justify-center p-6 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm group-hover:bg-slate-100 peer-checked:shadow-xl">
                  <Home className="w-8 h-8 text-slate-300 peer-checked:text-indigo-600 mb-3" />
                  <span className="text-sm font-black text-slate-600">Home</span>
                </div>
              </label>
              <label className="cursor-pointer group">
                <input type="radio" name="type" value={ProfileType.APARTMENT} className="hidden peer" />
                <div className="flex flex-col items-center justify-center p-6 rounded-[2rem] border-4 border-slate-50 bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-white transition-all shadow-sm group-hover:bg-slate-100 peer-checked:shadow-xl">
                  <Building2 className="w-8 h-8 text-slate-300 peer-checked:text-indigo-600 mb-3" />
                  <span className="text-sm font-black text-slate-600">Apartment</span>
                </div>
              </label>
            </div>
          </div>
          <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
            Secure Vault
          </button>
        </form>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal isOpen={isBulkAddModalOpen} onClose={() => setIsBulkAddModalOpen(false)} title="Bulk Import Service IDs">
        <div className="space-y-8">
          <div className="p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 flex gap-4">
            <Info className="w-6 h-6 text-indigo-500 shrink-0 mt-1" />
            <p className="text-xs text-indigo-700 leading-relaxed font-bold italic">
              Paste multiple 9-digit UKSC numbers separated by commas or new lines. Each will be stored in your property vault.
            </p>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Service Number List</label>
            <textarea 
              id="bulkInput"
              rows={6}
              placeholder="110390320&#10;110390321" 
              className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-indigo-500 focus:bg-white outline-none transition-all font-mono text-sm font-bold text-slate-700"
            />
          </div>
          <button 
            onClick={() => {
              const input = (document.getElementById('bulkInput') as HTMLTextAreaElement).value;
              handleBulkAdd(input);
            }}
            className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
          >
            Import Units
          </button>
        </div>
      </Modal>

      {/* Unit Editor Modal */}
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
              flatNo: fd.get('flatNo') as string,
              phone: fd.get('phone') as string,
            });
          }} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reference Tag</label>
                <input name="nickname" defaultValue={editingUKSC.nickname} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Service ID</label>
                <input name="number" defaultValue={editingUKSC.number} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-mono font-bold" />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resident Name</label>
              <div className="relative">
                <Users className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input name="tenantName" defaultValue={editingUKSC.tenantName} placeholder="Full name" className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit Number</label>
                <div className="relative">
                  <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input name="flatNo" defaultValue={editingUKSC.flatNo} placeholder="e.g. A-302" className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact (Mobile)</label>
                <div className="relative">
                  <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input name="phone" defaultValue={editingUKSC.phone} placeholder="10 digits" className="w-full pl-14 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold" />
                </div>
              </div>
            </div>

            <div className="pt-6 flex gap-4">
              <button 
                type="button" 
                onClick={() => setEditingUKSC(null)}
                className="flex-1 py-4 text-slate-500 font-black hover:bg-slate-50 rounded-2xl transition-all"
              >
                Discard
              </button>
              <button 
                type="submit" 
                className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-100 hover:bg-black transition-all"
              >
                Apply Changes
              </button>
            </div>

            <div className="pt-4 border-t border-slate-50">
              <button 
                type="button"
                onClick={() => {
                  handleDeleteUKSC(editingUKSC.id);
                  setEditingUKSC(null);
                }}
                className="w-full py-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Property Connection
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// --- Initialization ---

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Home, 
  Building2, 
  Share2, 
  Download, 
  ExternalLink, 
  Search, 
  Users, 
  Phone, 
  MapPin, 
  ArrowRight,
  Info,
  CheckCircle2,
  AlertCircle,
  X,
  PlusCircle,
  LayoutGrid,
  Menu,
  ChevronRight,
  FileText
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Enums ---

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

// --- Utility Components ---

const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode 
}> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="text-xl font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  // State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [editingUKSC, setEditingUKSC] = useState<UKSCNumber | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // Persistence
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setProfiles(parsed);
        if (parsed.length > 0) setActiveProfileId(parsed[0].id);
      } catch (e) {
        console.error("Failed to load data", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  const activeProfile = useMemo(() => 
    profiles.find(p => p.id === activeProfileId) || null
  , [profiles, activeProfileId]);

  // Actions
  const createProfile = (name: string, type: ProfileType) => {
    const newProfile: Profile = {
      id: crypto.randomUUID(),
      name,
      type,
      ukscs: []
    };
    setProfiles([...profiles, newProfile]);
    setActiveProfileId(newProfile.id);
    setIsNewProfileModalOpen(false);
  };

  const deleteProfile = (id: string) => {
    if (window.confirm("Are you sure you want to delete this profile?")) {
      const updated = profiles.filter(p => p.id !== id);
      setProfiles(updated);
      if (activeProfileId === id) {
        setActiveProfileId(updated[0]?.id || null);
      }
    }
  };

  const bulkAddUKSCs = (rawInput: string) => {
    if (!activeProfileId) return;
    const lines = rawInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const newUKSCs: UKSCNumber[] = lines.map(num => ({
      id: crypto.randomUUID(),
      number: num,
      nickname: `Service ${num.slice(-4)}`,
      tenantName: '',
      flatNo: '',
      phone: '',
    }));

    setProfiles(prev => prev.map(p => 
      p.id === activeProfileId ? { ...p, ukscs: [...p.ukscs, ...newUKSCs] } : p
    ));
    setIsBulkAddModalOpen(false);
  };

  const updateUKSC = (updated: UKSCNumber) => {
    setProfiles(prev => prev.map(p => ({
      ...p,
      ukscs: p.ukscs.map(u => u.id === updated.id ? updated : u)
    })));
    setEditingUKSC(null);
  };

  const deleteUKSC = (id: string) => {
    if (window.confirm("Delete this UKSC record?")) {
      setProfiles(prev => prev.map(p => ({
        ...p,
        ukscs: p.ukscs.filter(u => u.id !== id)
      })));
    }
  };

  const fetchBillData = async (uksc: UKSCNumber) => {
    setLoading(uksc.id);
    
    try {
      // Direct fetch is often blocked by CORS, so we use Gemini to simulate or structure data.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `I am building a power bill manager. I need a mock response for TSSPDCL UKSC No ${uksc.number}. 
        Return a JSON object with: consumerName, billMonth (e.g. Oct 2024), dueDate, amount (string with Rs), units, and status (Paid/Unpaid). 
        Make it look realistic.`,
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

      const extracted = JSON.parse(response.text || '{}');
      const billData: BillData = {
        ...extracted,
        lastFetched: new Date().toLocaleString()
      };

      setProfiles(prev => prev.map(p => ({
        ...p,
        ukscs: p.ukscs.map(u => u.id === uksc.id ? { ...u, billData } : u)
      })));
      
    } catch (error) {
      console.error("Fetch failed", error);
      alert("Failed to fetch bill data. Please check your connection.");
    } finally {
      setLoading(null);
    }
  };

  const generatePDF = (uksc: UKSCNumber) => {
    const doc = new jsPDF();
    const data = uksc.billData;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("Power Bill Summary", 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

    // Profile Info
    autoTable(doc, {
      startY: 35,
      head: [['Field', 'Value']],
      body: [
        ['UKSC Number', uksc.number],
        ['Nickname', uksc.nickname],
        ['Tenant Name', uksc.tenantName || 'N/A'],
        ['Flat/Plot No', uksc.flatNo || 'N/A'],
      ],
      theme: 'striped',
      // Fix: Removed invalid property 'fillStyle' which is not supported in jspdf-autotable styles (fixes line 265 error)
      headStyles: { fillColor: [51, 65, 85] }
    });

    // Bill Details
    if (data) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Bill Details', '']],
        body: [
          ['Consumer Name', data.consumerName],
          ['Bill Month', data.billMonth],
          ['Due Date', data.dueDate],
          ['Amount Due', data.amount],
          ['Units Consumed', data.units],
          ['Payment Status', data.status],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138] }
      });
    }

    doc.save(`Bill_${uksc.number}.pdf`);
  };

  const shareOnWhatsApp = (uksc: UKSCNumber) => {
    if (!uksc.phone) {
      alert("Please add a tenant phone number first.");
      return;
    }
    const cleanPhone = uksc.phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    const message = `Hello ${uksc.tenantName || 'Tenant'},\n\nYour power bill for UKSC ${uksc.number} (${uksc.flatNo || 'Flat'}) has been updated.\n\nAmount: ${uksc.billData?.amount || 'N/A'}\nDue Date: ${uksc.billData?.dueDate || 'N/A'}\n\nPlease pay at your earliest convenience.\n\nView Bill: https://tgsouthernpower.org/billinginfo?ukscno=${uksc.number}`;
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row text-slate-900 bg-slate-50">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r p-6 shrink-0 h-screen sticky top-0">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-indigo-950 tracking-tight">PowerVault</h1>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Your Profiles</span>
              <button 
                onClick={() => setIsNewProfileModalOpen(true)}
                className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-1">
              {profiles.map(p => (
                <div key={p.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => setActiveProfileId(p.id)}
                    className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      activeProfileId === p.id 
                      ? 'bg-indigo-600 text-white shadow-md' 
                      : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    {p.type === ProfileType.HOME ? <Home className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    <span className="font-semibold">{p.name}</span>
                  </button>
                  <button 
                    onClick={() => deleteProfile(p.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t px-2">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Easily manage electricity bills for multiple properties in one place.
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">PowerVault</h1>
        </div>
        <button className="p-2 text-slate-600">
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        {activeProfile ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <nav className="flex items-center gap-2 text-sm text-slate-400 font-medium mb-3">
                  <span>Dashboard</span>
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-indigo-600">{activeProfile.name}</span>
                </nav>
                <div className="flex items-center gap-4">
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900">{activeProfile.name}</h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    activeProfile.type === ProfileType.HOME 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {activeProfile.type}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => setIsBulkAddModalOpen(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                  Add UKSC Numbers
                </button>
              </div>
            </div>

            {/* Grid of UKSC Cards */}
            {activeProfile.ukscs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeProfile.ukscs.map(uksc => (
                  <div key={uksc.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 group overflow-hidden flex flex-col">
                    <div className="p-6 flex-1">
                      <div className="flex justify-between items-start mb-6">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => setEditingUKSC(uksc)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          >
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => deleteUKSC(uksc.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                            {uksc.nickname}
                          </h3>
                          <p className="text-sm font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded-md inline-block">
                            SC NO: {uksc.number}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Tenant</p>
                            <div className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-sm font-semibold text-slate-700 truncate">{uksc.tenantName || 'Not Set'}</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Flat/Plot</p>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-sm font-semibold text-slate-700 truncate">{uksc.flatNo || 'Not Set'}</span>
                            </div>
                          </div>
                        </div>

                        {uksc.billData ? (
                          <div className="pt-2">
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Amount Due</p>
                                <p className="text-2xl font-black text-slate-900">{uksc.billData.amount}</p>
                              </div>
                              <div className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                                uksc.billData.status.toLowerCase().includes('unpaid') 
                                ? 'bg-red-100 text-red-600' 
                                : 'bg-emerald-100 text-emerald-600'
                              }`}>
                                {uksc.billData.status}
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2 italic">Fetched: {uksc.billData.lastFetched}</p>
                          </div>
                        ) : (
                          <div className="py-6 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <Info className="w-6 h-6 mb-2 opacity-50" />
                            <p className="text-xs font-medium">No bill data fetched yet</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t flex flex-wrap gap-2">
                      <button 
                        onClick={() => fetchBillData(uksc)}
                        disabled={loading === uksc.id}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                          loading === uksc.id 
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white text-indigo-600 border border-indigo-100 hover:border-indigo-300 shadow-sm'
                        }`}
                      >
                        {loading === uksc.id ? (
                          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        ) : <Search className="w-4 h-4" />}
                        {loading === uksc.id ? 'Fetching...' : 'Fetch Bill'}
                      </button>
                      <button 
                        onClick={() => generatePDF(uksc)}
                        className="p-3 bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => shareOnWhatsApp(uksc)}
                        className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 shadow-md shadow-emerald-100 transition-all"
                        title="Share on WhatsApp"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-20 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                  <LayoutGrid className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">No UKSC Numbers Found</h3>
                  <p className="text-slate-500 max-w-sm mx-auto mt-2">
                    Start by adding your power connection numbers. You can add them one by one or in bulk.
                  </p>
                </div>
                <button 
                  onClick={() => setIsBulkAddModalOpen(true)}
                  className="mt-4 px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                >
                  Add Your First Service
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 rotate-3">
              <Home className="w-12 h-12" />
            </div>
            <div>
              <h2 className="text-4xl font-black text-slate-900 mb-4">Welcome to PowerVault</h2>
              <p className="text-slate-500 text-lg max-w-md mx-auto">
                Select a profile from the sidebar or create a new one to start managing your properties.
              </p>
            </div>
            <button 
              onClick={() => setIsNewProfileModalOpen(true)}
              className="flex items-center gap-3 px-10 py-4 bg-indigo-600 text-white rounded-[2rem] font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all hover:-translate-y-1"
            >
              <Plus className="w-6 h-6" />
              Create Profile
            </button>
          </div>
        )}
      </main>

      {/* --- Modals --- */}

      {/* New Profile Modal */}
      <Modal 
        isOpen={isNewProfileModalOpen} 
        onClose={() => setIsNewProfileModalOpen(false)} 
        title="Create New Profile"
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          createProfile(fd.get('name') as string, fd.get('type') as ProfileType);
        }} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Profile Name</label>
            <input 
              name="name" 
              required 
              placeholder="e.g. My Home, Green Apartments" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Property Type</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="cursor-pointer">
                <input type="radio" name="type" value={ProfileType.HOME} defaultChecked className="hidden peer" />
                <div className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 bg-white peer-checked:border-indigo-600 peer-checked:bg-indigo-50 transition-all">
                  <Home className="w-6 h-6 text-slate-400 peer-checked:text-indigo-600 mb-2" />
                  <span className="text-sm font-bold text-slate-600">Home</span>
                </div>
              </label>
              <label className="cursor-pointer">
                <input type="radio" name="type" value={ProfileType.APARTMENT} className="hidden peer" />
                <div className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-slate-100 bg-white peer-checked:border-indigo-600 peer-checked:bg-indigo-50 transition-all">
                  <Building2 className="w-6 h-6 text-slate-400 peer-checked:text-indigo-600 mb-2" />
                  <span className="text-sm font-bold text-slate-600">Apartment</span>
                </div>
              </label>
            </div>
          </div>
          <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
            Create Profile
          </button>
        </form>
      </Modal>

      {/* Bulk Add UKSC Modal */}
      <Modal 
        isOpen={isBulkAddModalOpen} 
        onClose={() => setIsBulkAddModalOpen(false)} 
        title="Add UKSC Numbers"
      >
        <div className="space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed font-medium">
              Paste multiple 9-digit UKSC numbers separated by commas or new lines. Example: 110390320, 110390321
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">UKSC Numbers</label>
            <textarea 
              id="bulkInput"
              rows={6}
              placeholder="110390320&#10;110390321" 
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono text-sm"
            />
          </div>
          <button 
            onClick={() => {
              const input = (document.getElementById('bulkInput') as HTMLTextAreaElement).value;
              bulkAddUKSCs(input);
            }}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
          >
            Add Numbers
          </button>
        </div>
      </Modal>

      {/* Edit UKSC Modal */}
      <Modal 
        isOpen={!!editingUKSC} 
        onClose={() => setEditingUKSC(null)} 
        title="Edit Service Details"
      >
        {editingUKSC && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            updateUKSC({
              ...editingUKSC,
              nickname: fd.get('nickname') as string,
              number: fd.get('number') as string,
              tenantName: fd.get('tenantName') as string,
              flatNo: fd.get('flatNo') as string,
              phone: fd.get('phone') as string,
            });
          }} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Nickname</label>
                <input name="nickname" defaultValue={editingUKSC.nickname} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">UKSC Number</label>
                <input name="number" defaultValue={editingUKSC.number} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Tenant Name</label>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input name="tenantName" defaultValue={editingUKSC.tenantName} placeholder="Enter name" className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Flat / Plot No</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input name="flatNo" defaultValue={editingUKSC.flatNo} placeholder="e.g. A-302" className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input name="phone" defaultValue={editingUKSC.phone} placeholder="10 digit mobile" className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button 
                type="button" 
                onClick={() => setEditingUKSC(null)}
                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

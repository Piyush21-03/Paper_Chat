import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { Upload, Search, FileText, Trash2, RefreshCw, Edit2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Dashboard = () => {
  const { isDark } = useTheme();
  const [documents, setDocuments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const fetchDocuments = async () => {
    try {
      const url = searchTerm ? `/api/documents?search=${encodeURIComponent(searchTerm)}` : '/api/documents';
      const response = await api.get(url);
      if (response.data.success) setDocuments(response.data.documents);
    } catch (error) { console.error("Failed to fetch documents", error); }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchDocuments(), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const isProcessing = documents.some(d => d.status === 'uploaded' || d.status === 'processing');
    if (isProcessing) {
      const timer = setInterval(fetchDocuments, 3000);
      return () => clearInterval(timer);
    }
  }, [documents]);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    const newUploads = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9), file, progress: 0, status: 'uploading'
    }));
    setUploadingFiles(prev => [...prev, ...newUploads]);
    for (const upload of newUploads) {
      const formData = new FormData();
      formData.append('file', upload.file);
      try {
        await api.post('/api/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadingFiles(prev => prev.map(u => u.id === upload.id ? { ...u, progress: pct } : u));
          }
        });
        toast.success(`${upload.file.name} uploaded successfully`);
        setUploadingFiles(prev => prev.filter(u => u.id !== upload.id));
        fetchDocuments();
      } catch (error) {
        const msg = error.response?.data?.message || 'Upload failed';
        toast.error(`Failed: ${msg}`);
        setUploadingFiles(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'error', error: msg } : u));
      }
    }
  };

  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files); };
  const deleteDocument = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await api.delete(`/api/documents/${id}`); toast.success(`Deleted ${name}`); fetchDocuments(); } catch { toast.error('Delete failed'); }
  };
  const retryDocument = async (id) => {
    try { await api.post(`/api/documents/${id}/retry`); toast.success('Queued for processing'); fetchDocuments(); } catch { toast.error('Retry failed'); }
  };
  const renameDocument = async (id, oldName) => {
    const newName = window.prompt("Rename document:", oldName);
    if (!newName || newName === oldName) return;
    try { await api.patch(`/api/documents/${id}`, { filename: newName }); fetchDocuments(); } catch { toast.error('Rename failed'); }
  };

  const filteredDocs = documents.filter(doc => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'processing') return doc.status === 'uploaded' || doc.status === 'processing';
    return doc.status === activeFilter;
  });

  return (
    <div
      className={`-m-6 p-6 min-h-full relative overflow-hidden font-inter selection:bg-[#ef233c] selection:text-white transition-colors duration-200 ${
        isDark ? 'bg-black text-white' : 'bg-[#f8fafc] text-[#0f172a]'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDrop={handleDrop}
    >
      {/* ── Background Ambient Lighting & Grid (Cohesive Full-Canvas Aesthetic) ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {isDark ? (
          <>
            {/* Rich dark atmospheric gradient across full canvas */}
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 50% 0%, #1e0609 0%, #120406 35%, #0a0a0d 70%, #030304 100%)',
              }}
            />
            
            {/* Star field layers */}
            <div className="stars-layer-1 opacity-60" />
            <div className="stars-layer-2 opacity-60" />

            {/* Ambient core glow — upper center */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] bg-red-600/[0.08] rounded-full blur-[150px]" />
            
            {/* Ambient secondary glow — mid-lower left */}
            <div className="absolute top-2/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-red-600/[0.05] rounded-full blur-[140px]" />
            
            {/* Ambient tertiary glow — bottom right */}
            <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-red-700/[0.04] rounded-full blur-[130px]" />

            {/* Subtle grid pattern smoothly covering full viewport */}
            <div
              className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]"
              style={{
                maskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 50%, transparent 95%)',
                WebkitMaskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 50%, transparent 95%)',
              }}
            />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-red-50/50 via-white to-slate-50" />
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-[120px]" />
            <div
              className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:48px_48px]"
              style={{
                maskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 50%, transparent 95%)',
                WebkitMaskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 50%, transparent 95%)',
              }}
            />
          </>
        )}
      </div>

      {/* ── Drag & Drop Visual Glow Overlay ── */}
      {isDragging && (
        <div className="absolute inset-4 z-50 rounded-3xl border-2 border-dashed border-[#ef233c] bg-red-600/[0.08] backdrop-blur-xl flex flex-col items-center justify-center pointer-events-none shadow-[0_0_80px_rgba(239,35,60,0.25)] animate-fade-in">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-red-500/15 border border-red-500/30 text-[#ef233c] shadow-[0_0_25px_rgba(239,35,60,0.4)]">
            <Upload size={32} strokeWidth={2.5} className="animate-bounce" />
          </div>
          <h3 className="text-xl font-bold font-manrope text-white">Drop PDFs to Ingest</h3>
          <p className="text-xs text-zinc-400 mt-1">Files will be parsed, chunked, and embedded into Qdrant</p>
        </div>
      )}

      {/* ── Content Container ── */}
      <div className={`max-w-6xl mx-auto space-y-6 relative z-10 transition-opacity duration-200 ${isDragging ? 'opacity-30' : ''}`}>
        
        {/* Header */}
        <div
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b transition-colors"
          style={{ borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)' }}
        >
          <div>
            {/* Eyebrow badge matching landing page */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 border backdrop-blur-md"
              style={{
                background: 'var(--accent-red-tint)',
                borderColor: 'var(--border-red)',
                color: 'var(--accent-red)',
                boxShadow: isDark ? '0 0 12px rgba(239, 35, 60, 0.15)' : 'none',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#ef233c] animate-pulse" />
              <span>Scholar Corpus</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-manrope" style={{ color: 'var(--text-primary)' }}>
              Research Library
            </h1>
            <p className="text-xs sm:text-sm mt-1 font-light" style={{ color: 'var(--text-secondary)' }}>
              Indexed publications, monographs, and technical specifications for grounded synthesis.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Glassmorphic Search Bar with glowing focus */}
            <div className="relative w-full sm:w-72">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200"
                size={15}
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder="Search literature..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs backdrop-blur-xl focus:outline-none transition-all duration-300"
                style={{
                  background: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.85)',
                  color: 'var(--text-primary)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.12)',
                  boxShadow: isDark ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)' : '0 1px 2px rgba(0, 0, 0, 0.04)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent-red)';
                  e.target.style.boxShadow = isDark ? '0 0 20px rgba(239, 35, 60, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)' : '0 0 15px rgba(225, 29, 72, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.12)';
                  e.target.style.boxShadow = isDark ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)' : '0 1px 2px rgba(0, 0, 0, 0.04)';
                }}
              />
            </div>

            <input
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => handleFileUpload(e.target.files)}
            />

            {/* Glowing Red CTA Button matching Landing page */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto relative group overflow-hidden flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase text-white transition-all duration-300 whitespace-nowrap cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, #ef233c 0%, #d90429 100%)',
                boxShadow: isDark ? '0 0 24px rgba(239, 35, 60, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.25)' : '0 4px 14px rgba(225, 29, 72, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = isDark ? '0 0 32px rgba(239, 35, 60, 0.55), inset 0 1px 0 0 rgba(255, 255, 255, 0.35)' : '0 6px 20px rgba(225, 29, 72, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = isDark ? '0 0 24px rgba(239, 35, 60, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.25)' : '0 4px 14px rgba(225, 29, 72, 0.3)';
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              <Upload size={14} strokeWidth={2.5} className="relative z-10" />
              <span className="relative z-10">Upload PDFs</span>
            </button>
          </div>
        </div>

        {/* ── Filter Pills with Counts ── */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all', label: 'All Documents', count: documents.length },
            { key: 'ready', label: 'Ready', count: documents.filter(d => d.status === 'ready').length },
            { key: 'processing', label: 'Processing', count: documents.filter(d => d.status === 'uploaded' || d.status === 'processing').length },
            { key: 'failed', label: 'Failed', count: documents.filter(d => d.status === 'failed').length },
          ].map(({ key, label, count }) => {
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl transition-all duration-300 flex items-center gap-2 cursor-pointer"
                style={isActive ? {
                  background: 'var(--accent-red-tint)',
                  color: 'var(--accent-red)',
                  border: '1px solid var(--border-red)',
                  boxShadow: isDark ? '0 0 16px rgba(239, 35, 60, 0.25)' : '0 2px 8px rgba(225, 29, 72, 0.12)',
                } : {
                  background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.7)',
                  color: 'var(--text-secondary)',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(15, 23, 42, 0.08)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(15, 23, 42, 0.18)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <span>{label}</span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: isActive ? (isDark ? 'rgba(239, 35, 60, 0.25)' : 'rgba(225, 29, 72, 0.15)') : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'),
                    color: isActive ? 'var(--accent-red)' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Uploading Progress Cards ── */}
        {uploadingFiles.length > 0 && (
          <div className="space-y-3">
            {uploadingFiles.map(file => (
              <div
                key={file.id}
                className="p-4 rounded-2xl backdrop-blur-xl border transition-all duration-300"
                style={{
                  background: isDark ? 'rgba(17, 17, 17, 0.7)' : 'rgba(255, 255, 255, 0.9)',
                  border: file.status === 'error' ? '1px solid var(--border-red)' : (isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)'),
                  boxShadow: isDark ? '0 0 25px rgba(239, 35, 60, 0.1)' : '0 4px 12px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div className="flex items-center justify-between mb-2 text-xs">
                  <div className="flex items-center gap-2.5 truncate">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'var(--accent-red-tint)', color: 'var(--accent-red)' }}
                    >
                      <FileText size={14} />
                    </div>
                    <span className="font-semibold truncate font-manrope" style={{ color: 'var(--text-primary)' }}>
                      {file.file.name}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-bold" style={{ color: file.status === 'error' ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                    {file.status === 'error' ? 'Failed' : `${file.progress}%`}
                  </span>
                </div>
                <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)' }}>
                  <div
                    className="h-full transition-all duration-300 rounded-full"
                    style={{
                      width: `${file.progress}%`,
                      background: 'linear-gradient(90deg, #ef233c 0%, #ff4d6d 100%)',
                      boxShadow: isDark ? '0 0 10px rgba(239, 35, 60, 0.5)' : 'none',
                    }}
                  />
                </div>
                {file.status === 'error' && (
                  <p className="mt-2 text-xs flex items-center gap-1.5" style={{ color: 'var(--accent-red)' }}>
                    <XCircle size={13} /> {file.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Documents Grid ── */}
        {documents.length === 0 ? (
          <div
            className="relative overflow-hidden flex flex-col items-center justify-center py-20 px-6 rounded-2xl backdrop-blur-xl border border-dashed transition-all duration-300"
            style={{
              background: isDark ? 'rgba(10, 10, 10, 0.5)' : 'rgba(255, 255, 255, 0.7)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.15)',
              boxShadow: isDark ? '0 0 40px rgba(239, 35, 60, 0.06)' : 'none',
            }}
          >
            {/* Ambient core glow in center of empty state */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border transition-transform duration-300 hover:scale-110 relative z-10"
              style={{
                background: 'var(--accent-red-tint)',
                borderColor: 'var(--border-red)',
                color: 'var(--accent-red)',
                boxShadow: isDark ? '0 0 30px rgba(239, 35, 60, 0.25)' : 'none',
              }}
            >
              <FileText size={28} />
            </div>
            <h3 className="text-xl font-bold font-manrope relative z-10" style={{ color: 'var(--text-primary)' }}>
              Empty Repository
            </h3>
            <p className="text-xs sm:text-sm mt-1.5 max-w-sm text-center font-light relative z-10" style={{ color: 'var(--text-secondary)' }}>
              Drag and drop research publications or monographs anywhere to begin neural extraction, vector indexing, and grounded reading.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase text-white cursor-pointer relative z-10 transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, #ef233c 0%, #d90429 100%)',
                boxShadow: isDark ? '0 0 20px rgba(239, 35, 60, 0.35)' : '0 4px 12px rgba(225, 29, 72, 0.25)',
              }}
            >
              <Upload size={14} strokeWidth={2.5} /> Browse Files
            </button>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl backdrop-blur-xl border"
            style={{
              background: isDark ? 'rgba(10, 10, 10, 0.4)' : 'rgba(255, 255, 255, 0.6)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
            }}
          >
            <Search size={28} className="mb-3 opacity-40 text-[#ef233c]" />
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>No documents match the active filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocs.map(doc => (
              <div
                key={doc.id}
                className="group relative overflow-hidden p-4 rounded-2xl backdrop-blur-xl border flex flex-col justify-between transition-all duration-300"
                style={{
                  background: isDark ? 'rgba(10, 10, 10, 0.65)' : 'rgba(255, 255, 255, 0.85)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
                  boxShadow: isDark
                    ? '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)'
                    : '0 2px 8px rgba(0, 0, 0, 0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-red)';
                  e.currentTarget.style.boxShadow = isDark
                    ? '0 0 30px rgba(239, 35, 60, 0.18), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)'
                    : '0 8px 24px rgba(225, 29, 72, 0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
                  e.currentTarget.style.boxShadow = isDark
                    ? '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)'
                    : '0 2px 8px rgba(0, 0, 0, 0.04)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Subtle ambient corner glow on hover */}
                <div
                  className="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-2xl pointer-events-none transition-opacity duration-500 opacity-0 group-hover:opacity-100"
                  style={{ background: 'rgba(239, 35, 60, 0.15)' }}
                />

                {/* Status + Actions */}
                <div className="flex items-start justify-between mb-3 relative z-10">
                  <div
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 uppercase tracking-wider font-mono border backdrop-blur-md ${
                      doc.status === 'ready' ? 'chip-ready' :
                      doc.status === 'failed' ? 'chip-failed' : 'chip-processing'
                    }`}
                    style={
                      doc.status === 'ready'
                        ? {
                            background: 'rgba(16, 185, 129, 0.10)',
                            color: '#34d399',
                            borderColor: 'rgba(16, 185, 129, 0.3)',
                            boxShadow: isDark ? '0 0 12px rgba(16, 185, 129, 0.15)' : 'none',
                          }
                        : doc.status === 'failed'
                        ? {
                            background: 'rgba(239, 35, 60, 0.10)',
                            color: '#ef233c',
                            borderColor: 'rgba(239, 35, 60, 0.3)',
                            boxShadow: isDark ? '0 0 12px rgba(239, 35, 60, 0.15)' : 'none',
                          }
                        : {
                            background: 'rgba(251, 191, 36, 0.10)',
                            color: '#fbbf24',
                            borderColor: 'rgba(251, 191, 36, 0.3)',
                            boxShadow: isDark ? '0 0 12px rgba(251, 191, 36, 0.15)' : 'none',
                          }
                    }
                  >
                    {doc.status === 'ready' ? <CheckCircle2 size={11} strokeWidth={2.5} /> :
                     doc.status === 'failed' ? <XCircle size={11} strokeWidth={2.5} /> :
                     <RefreshCw size={11} className="animate-spin" strokeWidth={2.5} />}
                    <span>{doc.status}</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => renameDocument(doc.id, doc.original_filename)}
                      className="p-1.5 rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      title="Rename"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => deleteDocument(doc.id, doc.original_filename)}
                      className="p-1.5 rounded-lg border border-transparent hover:border-red-500/20 hover:bg-red-500/10 transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#ef233c'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Title & Document Icon */}
                <div className="flex items-start gap-3 mb-2 relative z-10">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors duration-200 group-hover:border-red-500/30 group-hover:bg-red-500/10 group-hover:text-[#ef233c]"
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.04)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <FileText size={15} />
                  </div>
                  <h3
                    className="font-semibold text-sm line-clamp-2 leading-snug cursor-pointer transition-colors font-manrope pt-0.5"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--accent-red)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--text-primary)'}
                    title={doc.original_filename}
                    onClick={() => doc.status === 'ready' && navigate(`/chat?doc=${doc.id}`)}
                  >
                    {doc.original_filename}
                  </h3>
                </div>

                {/* Meta */}
                <div
                  className="text-[11px] flex items-center gap-1.5 mb-4 font-mono relative z-10 pl-11"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>{formatBytes(doc.file_size_bytes)}</span>
                  <span className="opacity-40">•</span>
                  <span>{doc.page_count ? `${doc.page_count} pgs` : 'PDF'}</span>
                  <span className="opacity-40">•</span>
                  <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                </div>

                {/* Action footer */}
                <div
                  className="mt-auto pt-3 border-t relative z-10 transition-colors"
                  style={{ borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)' }}
                >
                  {doc.status === 'failed' ? (
                    <>
                      <p
                        className="text-[11px] p-2.5 rounded-xl mb-2 line-clamp-2 border backdrop-blur-md"
                        style={{
                          background: 'var(--accent-red-tint)',
                          color: 'var(--accent-red)',
                          borderColor: 'var(--border-red)',
                        }}
                        title={doc.error_message}
                      >
                        {doc.error_message || 'Indexing failed'}
                      </p>
                      <button
                        onClick={() => retryDocument(doc.id)}
                        className="w-full py-2 text-xs font-bold rounded-xl transition-all border cursor-pointer"
                        style={{
                          background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
                          color: 'var(--text-secondary)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-red)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                      >
                        Retry Processing
                      </button>
                    </>
                  ) : doc.status === 'ready' ? (
                    <button
                      onClick={() => navigate(`/chat?doc=${doc.id}`)}
                      className="w-full py-2.5 px-4 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group/btn cursor-pointer border"
                      style={{
                        background: 'var(--accent-red-tint)',
                        color: 'var(--accent-red)',
                        borderColor: 'var(--border-red)',
                        boxShadow: isDark ? '0 0 15px rgba(239, 35, 60, 0.12)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #ef233c 0%, #d90429 100%)';
                        e.currentTarget.style.color = '#ffffff';
                        e.currentTarget.style.borderColor = '#ef233c';
                        e.currentTarget.style.boxShadow = isDark ? '0 0 20px rgba(239, 35, 60, 0.4)' : '0 4px 12px rgba(225, 29, 72, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--accent-red-tint)';
                        e.currentTarget.style.color = 'var(--accent-red)';
                        e.currentTarget.style.borderColor = 'var(--border-red)';
                        e.currentTarget.style.boxShadow = isDark ? '0 0 15px rgba(239, 35, 60, 0.12)' : 'none';
                      }}
                    >
                      <span>Open in Reader</span>
                      <ArrowRight size={13} className="transition-transform duration-200 group-hover/btn:translate-x-1" />
                    </button>
                  ) : (
                    <div
                      className="text-xs font-mono p-2.5 rounded-xl text-center capitalize border flex items-center justify-center gap-2"
                      style={{
                        background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.03)',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <RefreshCw size={11} className="animate-spin text-amber-500" />
                      <span>{doc.processing_stage ? doc.processing_stage.replace('_', ' ') : 'Processing...'}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

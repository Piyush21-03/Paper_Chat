import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Upload, Search, FileText, Trash2, RefreshCw, Edit2, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Dashboard = () => {
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
      className={`max-w-6xl mx-auto space-y-6 ${isDragging ? 'opacity-60' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h1 className="text-xl font-bold tracking-tight font-manrope" style={{ color: 'var(--text-primary)' }}>Research Library</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Indexed publications, monographs, and technical specifications.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
            <input
              type="text" placeholder="Search literature..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-lg text-xs focus:outline-none transition-all"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
            />
          </div>
          <input type="file" accept=".pdf" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFileUpload(e.target.files)} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-wider uppercase text-white transition-all whitespace-nowrap"
            style={{ background: 'var(--accent-red)' }}
            onMouseEnter={(e) => e.target.style.background = 'var(--accent-red-dim)'}
            onMouseLeave={(e) => e.target.style.background = 'var(--accent-red)'}
          >
            <Upload size={14} strokeWidth={2.5} /> Upload PDFs
          </button>
        </div>
      </div>

      {/* Filter Badges */}
      <div className="flex flex-wrap gap-2">
        {['all', 'processing', 'ready', 'failed'].map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
              activeFilter === filter
                ? ''
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            style={activeFilter === filter ? {
              background: 'var(--accent-red-tint)',
              color: 'var(--accent-red)',
              border: '1px solid var(--border-red)',
            } : {
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Uploading bars */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2.5">
          {uploadingFiles.map(file => (
            <div key={file.id} className="rouge-card p-3.5">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{file.file.name}</span>
                <span className="font-mono text-zinc-500">{file.status === 'error' ? 'Failed' : `${file.progress}%`}</span>
              </div>
              <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${file.progress}%`, background: file.status === 'error' ? 'var(--accent-red)' : 'var(--accent-red)' }}
                />
              </div>
              {file.status === 'error' && <p className="mt-1.5 text-xs" style={{ color: 'var(--accent-red)' }}>{file.error}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Documents Grid */}
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rouge-card border-dashed">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center mb-4" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <FileText size={26} className="text-zinc-500" />
          </div>
          <h3 className="text-lg font-bold font-manrope" style={{ color: 'var(--text-primary)' }}>Empty Repository</h3>
          <p className="text-xs text-zinc-500 mt-1.5 max-w-xs text-center">
            Upload your first research paper to begin extraction and reading.
          </p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <Search size={28} className="mb-3 opacity-40" />
          <p className="text-xs">No documents match the active filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="rouge-card p-4 flex flex-col group">
              {/* Status + actions */}
              <div className="flex items-start justify-between mb-3">
                <div className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wider ${
                  doc.status === 'ready' ? 'chip-ready' :
                  doc.status === 'failed' ? 'chip-failed' : 'chip-processing'
                }`}>
                  {doc.status === 'ready' ? <CheckCircle2 size={12} /> :
                   doc.status === 'failed' ? <XCircle size={12} /> :
                   <RefreshCw size={12} className="animate-spin" />}
                  {doc.status}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => renameDocument(doc.id, doc.original_filename)} className="p-1.5 text-zinc-600 hover:text-zinc-200 rounded-md hover:bg-white/5 transition-colors" title="Rename">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => deleteDocument(doc.id, doc.original_filename)} className="p-1.5 text-zinc-600 hover:text-red-400 rounded-md hover:bg-white/5 transition-colors" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Title */}
              <h3
                className="font-semibold text-sm line-clamp-2 mb-1.5 leading-snug cursor-pointer transition-colors font-manrope"
                style={{ color: 'var(--text-primary)' }}
                onMouseEnter={(e) => e.target.style.color = 'var(--accent-red)'}
                onMouseLeave={(e) => e.target.style.color = 'var(--text-primary)'}
                title={doc.original_filename}
                onClick={() => doc.status === 'ready' && navigate(`/chat?doc=${doc.id}`)}
              >
                {doc.original_filename}
              </h3>

              {/* Meta */}
              <div className="text-[11px] flex items-center gap-1.5 mb-4 font-mono" style={{ color: 'var(--text-muted)' }}>
                <span>{formatBytes(doc.file_size_bytes)}</span>
                <span className="text-zinc-700">•</span>
                <span>{doc.page_count ? `${doc.page_count} pgs` : 'PDF'}</span>
                <span className="text-zinc-700">•</span>
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>

              {/* Action footer */}
              <div className="mt-auto pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {doc.status === 'failed' ? (
                  <>
                    <p className="text-[11px] p-2 rounded-md mb-2 line-clamp-2" style={{ background: 'var(--accent-red-tint)', color: 'var(--accent-red)', border: '1px solid var(--border-red)' }} title={doc.error_message}>
                      {doc.error_message || 'Indexing failed'}
                    </p>
                    <button onClick={() => retryDocument(doc.id)} className="w-full py-1.5 text-xs font-bold rounded-md transition-colors" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      Retry Processing
                    </button>
                  </>
                ) : doc.status === 'ready' ? (
                  <button
                    onClick={() => navigate(`/chat?doc=${doc.id}`)}
                    className="w-full py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 group/btn"
                    style={{ background: 'var(--accent-red-tint)', color: 'var(--accent-red)', border: '1px solid var(--border-red)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-red)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-red-tint)'; e.currentTarget.style.color = 'var(--accent-red)'; }}
                  >
                    Open in Reader <ArrowRight size={13} />
                  </button>
                ) : (
                  <div className="text-xs font-mono text-zinc-500 p-2 rounded-md text-center capitalize" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                    {doc.processing_stage ? doc.processing_stage.replace('_', ' ') : 'Processing...'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;

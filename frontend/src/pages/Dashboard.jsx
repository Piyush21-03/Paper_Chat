import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Upload, Search, FileText, Trash2, RefreshCw, BarChart2, Edit2, CheckCircle2, XCircle, Clock } from 'lucide-react';
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
      if (response.data.success) {
        setDocuments(response.data.documents);
      }
    } catch (error) {
      console.error("Failed to fetch documents", error);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Poll for updates if any document is processing
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
      id: Math.random().toString(36).substr(2, 9),
      file,
      progress: 0,
      status: 'uploading'
    }));

    setUploadingFiles(prev => [...prev, ...newUploads]);

    for (const upload of newUploads) {
      const formData = new FormData();
      formData.append('file', upload.file);

      try {
        await api.post('/api/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadingFiles(prev => prev.map(u => u.id === upload.id ? { ...u, progress: percentCompleted } : u));
          }
        });
        toast.success(`${upload.file.name} uploaded successfully`);
        setUploadingFiles(prev => prev.filter(u => u.id !== upload.id));
        fetchDocuments();
      } catch (error) {
        console.error("Upload failed", error);
        const msg = error.response?.data?.message || 'Upload failed';
        toast.error(`Failed to upload ${upload.file.name}: ${msg}`);
        setUploadingFiles(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'error', error: msg } : u));
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const deleteDocument = async (id, name) => {
    if (!window.confirm(`Delete document "${name}"?`)) return;
    try {
      await api.delete(`/api/documents/${id}`);
      toast.success(`Deleted ${name}`);
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  const retryDocument = async (id) => {
    try {
      await api.post(`/api/documents/${id}/retry`);
      toast.success('Queued for processing');
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to retry processing');
    }
  };

  const renameDocument = async (id, oldName) => {
    const newName = window.prompt("Rename document:", oldName);
    if (!newName || newName === oldName) return;
    try {
      await api.patch(`/api/documents/${id}`, { filename: newName });
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to rename document');
    }
  };

  const filteredDocs = documents.filter(doc => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'processing') return doc.status === 'uploaded' || doc.status === 'processing';
    return doc.status === activeFilter;
  });

  return (
    <div 
      className={`max-w-6xl mx-auto space-y-6 ${isDragging ? 'opacity-50' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDrop={handleDrop}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Documents</h1>
          <p className="text-slate-500 dark:text-slate-400">Upload PDFs, track processing, and open them to chat.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
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
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            <Upload size={18} />
            Upload PDFs
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'processing', 'ready', 'failed'].map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
              activeFilter === filter 
                ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900' 
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-3">
          {uploadingFiles.map(file => (
            <div key={file.id} className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium truncate">{file.file.name}</span>
                <span className="text-sm text-slate-500">{file.status === 'error' ? 'Failed' : `${file.progress}%`}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full ${file.status === 'error' ? 'bg-red-500' : 'bg-blue-500'} transition-all duration-300`} 
                  style={{ width: `${file.progress}%` }}
                />
              </div>
              {file.status === 'error' && (
                <p className="mt-2 text-sm text-red-500">{file.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl border-dashed">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 text-slate-400 rounded-full flex items-center justify-center mb-4">
            <FileText size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">No documents yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm text-center">Upload your first research paper to get started with PaperChat.</p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <Search size={32} className="mb-4 opacity-50" />
          <p>No documents found matching the current filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${
                  doc.status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  doc.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  {doc.status === 'ready' ? <CheckCircle2 size={20} /> :
                   doc.status === 'failed' ? <XCircle size={20} /> :
                   <RefreshCw size={20} className="animate-spin" />}
                </div>
                
                <div className="flex gap-1">
                  <button onClick={() => renameDocument(doc.id, doc.original_filename)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="Rename">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => deleteDocument(doc.id, doc.original_filename)} className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-slate-900 dark:text-white line-clamp-2 mb-1" title={doc.original_filename}>
                {doc.original_filename}
              </h3>
              
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-4">
                <span>{formatBytes(doc.file_size_bytes)}</span>
                <span>•</span>
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>

              <div className="mt-auto space-y-2">
                {doc.status === 'failed' ? (
                  <>
                    <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/10 p-2 rounded line-clamp-2" title={doc.error_message}>
                      Error: {doc.error_message || 'Unknown error'}
                    </p>
                    <button 
                      onClick={() => retryDocument(doc.id)}
                      className="w-full py-2 text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 rounded-lg transition-colors"
                    >
                      Retry Processing
                    </button>
                  </>
                ) : doc.status === 'ready' ? (
                  <button 
                    onClick={() => navigate(`/chat?doc=${doc.id}`)}
                    className="w-full py-2 text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                  >
                    Open Chat
                  </button>
                ) : (
                  <div className="text-sm font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg text-center capitalize">
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

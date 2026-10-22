import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Folder, Plus, FileText, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const Research = () => {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const response = await api.get('/api/research/collections');
      if (response.data.success) {
        setWorkspaces(response.data.collections);
      }
    } catch (err) {
      toast.error('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspace = async (id) => {
    try {
      const response = await api.get(`/api/research/collections/${id}`);
      if (response.data.success) {
        setActiveWorkspace(response.data.collection);
      }
    } catch (err) {
      toast.error('Failed to load workspace details');
    }
  };

  const handleCreateWorkspace = async () => {
    const name = window.prompt("Workspace name:");
    if (!name?.trim()) return;
    const desc = window.prompt("Description (optional):") || "";
    
    try {
      const response = await api.post('/api/research/collections', {
        name: name.trim(),
        description: desc
      });
      if (response.data.success) {
        toast.success('Workspace created');
        await loadWorkspaces();
        loadWorkspace(response.data.collection.id);
      }
    } catch (err) {
      toast.error('Failed to create workspace');
    }
  };

  const handleAddDocument = async (docId) => {
    if (!activeWorkspace) return;
    try {
      await api.post(`/api/research/collections/${activeWorkspace.id}/documents`, {
        document_ids: [docId]
      });
      toast.success('Document added');
      loadWorkspace(activeWorkspace.id);
    } catch (err) {
      toast.error('Failed to add document');
    }
  };

  return (
    <div className="flex h-full -m-6 bg-white dark:bg-slate-900">
      
      {/* Sidebar: Workspaces */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <button 
            onClick={handleCreateWorkspace}
            className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus size={18} /> New Workspace
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="text-center p-4 text-sm text-slate-500">Loading...</div>
          ) : workspaces.length === 0 ? (
            <div className="text-center p-4 text-sm text-slate-500">No workspaces yet</div>
          ) : (
            workspaces.map(ws => (
              <div 
                key={ws.id}
                onClick={() => loadWorkspace(ws.id)}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                  activeWorkspace?.id === ws.id 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                    : 'hover:bg-slate-200 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Folder size={18} className="shrink-0 text-blue-500 dark:text-blue-400" />
                  <div className="truncate">
                    <div className="text-sm font-medium truncate">{ws.name}</div>
                    <div className="text-xs opacity-70">{ws.document_count} doc{ws.document_count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 overflow-hidden relative p-6">
        {!activeWorkspace ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl m-4">
            <Folder size={48} className="mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">Select a workspace</h3>
            <p className="mt-2 text-center max-w-sm">
              Workspaces let you group multiple documents together to analyze and compare them.
            </p>
          </div>
        ) : (
          <div className="h-full flex flex-col max-w-5xl mx-auto w-full">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                {activeWorkspace.name}
              </h2>
              {activeWorkspace.description && (
                <p className="text-slate-500 dark:text-slate-400">{activeWorkspace.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
              
              <div className="flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/50">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText size={18} /> Documents
                  </h3>
                  <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                    {activeWorkspace.documents?.length || 0}
                  </span>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {activeWorkspace.documents?.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                      <p className="mb-4">No documents in this workspace yet.</p>
                      <button 
                        onClick={() => {
                          const docId = window.prompt("Enter a Document ID to add (temp logic):");
                          if (docId) handleAddDocument(docId);
                        }}
                        className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                      >
                        Add Document (Debug)
                      </button>
                      <p className="text-xs mt-4 text-slate-400">Normally you'd select documents from a picker here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeWorkspace.documents?.map(doc => (
                        <div key={doc.id} className="p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
                          <span className="text-sm font-medium truncate">{doc.original_filename}</span>
                          <CheckCircle2 size={16} className="text-green-500" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
                 <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                   <h3 className="font-semibold">Synthesis & Comparison</h3>
                 </div>
                 <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg m-4">
                   <p className="mb-4 max-w-xs">Select multiple documents and ask questions across all of them.</p>
                   <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm">
                     Start Analysis
                   </button>
                 </div>
              </div>

            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default Research;

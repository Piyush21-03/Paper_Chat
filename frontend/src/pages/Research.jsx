import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import {
  Folder,
  Plus,
  FileText,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Layers,
  Trash2,
  Search,
  Scale,
  Compass,
  Loader2,
  X,
  BookOpen
} from 'lucide-react';
import toast from 'react-hot-toast';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const Research = () => {
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [allUserDocuments, setAllUserDocuments] = useState([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [loading, setLoading] = useState(true);

  // Synthesis & Analysis State
  const [activeTab, setActiveTab] = useState('synthesize'); // 'synthesize' | 'compare' | 'gaps'
  const [synthesisQuery, setSynthesisQuery] = useState('');
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState(null);

  // Compare & Gaps State
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsResult, setGapsResult] = useState(null);

  useEffect(() => {
    loadWorkspaces();
    loadAllUserDocuments();
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

  const loadAllUserDocuments = async () => {
    try {
      const response = await api.get('/api/documents');
      if (response.data.success) {
        setAllUserDocuments(response.data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch user documents', err);
    }
  };

  const loadWorkspace = async (id) => {
    try {
      const response = await api.get(`/api/research/collections/${id}`);
      if (response.data.success) {
        setActiveWorkspace(response.data.collection);
        setSynthesisResult(null);
        setCompareResult(null);
        setGapsResult(null);
      }
    } catch (err) {
      toast.error('Failed to load workspace details');
    }
  };

  const handleCreateWorkspace = async () => {
    const name = window.prompt('Workspace name:');
    if (!name?.trim()) return;
    const desc = window.prompt('Description (optional):') || '';

    try {
      const response = await api.post('/api/research/collections', {
        name: name.trim(),
        description: desc,
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
        document_ids: [docId],
      });
      toast.success('Paper added to workspace');
      await loadWorkspace(activeWorkspace.id);
      await loadWorkspaces();
    } catch (err) {
      toast.error('Failed to add document');
    }
  };

  const handleRemoveDocument = async (docId) => {
    if (!activeWorkspace) return;
    try {
      await api.delete(`/api/research/collections/${activeWorkspace.id}/documents/${docId}`);
      toast.success('Document unlinked');
      await loadWorkspace(activeWorkspace.id);
      await loadWorkspaces();
    } catch (err) {
      toast.error('Failed to unlink document');
    }
  };

  // ── Execute Synthesis Question ──
  const handleSynthesize = async (e) => {
    if (e) e.preventDefault();
    if (!synthesisQuery.trim() || !activeWorkspace) return;

    if (!activeWorkspace.documents || activeWorkspace.documents.length === 0) {
      toast.error('Please add at least one document to this workspace first.');
      return;
    }

    setSynthesisLoading(true);
    setSynthesisResult(null);

    try {
      const response = await api.post('/api/research/synthesize', {
        question: synthesisQuery.trim(),
        collection_id: activeWorkspace.id,
      });
      if (response.data.success) {
        setSynthesisResult(response.data);
      } else {
        toast.error(response.data.message || 'Unable to synthesize response');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to answer question in research section';
      toast.error(msg);
    } finally {
      setSynthesisLoading(false);
    }
  };

  // ── Execute Document Comparison ──
  const handleCompare = async () => {
    if (!activeWorkspace || !activeWorkspace.documents || activeWorkspace.documents.length < 2) {
      toast.error('Need at least 2 papers in this workspace to compare.');
      return;
    }

    setCompareLoading(true);
    try {
      const response = await api.post('/api/research/compare', {
        collection_id: activeWorkspace.id,
      });
      if (response.data.success) {
        setCompareResult(response.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Comparison failed');
    } finally {
      setCompareLoading(false);
    }
  };

  // ── Execute Gap Detection ──
  const handleGaps = async () => {
    if (!activeWorkspace || !activeWorkspace.documents || activeWorkspace.documents.length === 0) {
      toast.error('Add papers to the workspace first.');
      return;
    }

    setGapsLoading(true);
    try {
      const response = await api.post('/api/research/gaps', {
        collection_id: activeWorkspace.id,
      });
      if (response.data.success) {
        setGapsResult(response.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gap detection failed');
    } finally {
      setGapsLoading(false);
    }
  };

  const renderMarkdown = (text) => {
    if (!text) return '';
    const raw = marked.parse(text, { breaks: true });
    return DOMPurify.sanitize(raw);
  };

  const linkedIds = new Set((activeWorkspace?.documents || []).map((d) => d.id));
  const availableToAdd = allUserDocuments.filter((d) => !linkedIds.has(d.id));

  return (
    <div className="flex h-full -m-6" style={{ background: 'var(--bg-void)', color: 'var(--text-primary)', borderTop: '1px solid var(--border-subtle)' }}>
      {/* ── Sidebar: Research Corpora Workspaces ── */}
      <div
        className="w-64 flex flex-col hidden md:flex shrink-0"
        style={{ background: 'var(--bg-deep)', borderRight: '1px solid var(--border-subtle)' }}
      >
        <div className="p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={handleCreateWorkspace}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-white rounded-lg text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer"
            style={{ background: 'var(--accent-red)' }}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>New Corpus</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest font-mono" style={{ color: 'var(--accent-red)' }}>
            Research Corpora
          </div>

          {loading ? (
            <div className="text-center py-8 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>Loading corpora...</div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs font-light" style={{ color: 'var(--text-muted)' }}>
              No corpora created yet. Click above to create your first research workspace.
            </div>
          ) : (
            workspaces.map((ws) => {
              const isActive = activeWorkspace?.id === ws.id;
              return (
                <div
                  key={ws.id}
                  onClick={() => loadWorkspace(ws.id)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all border"
                  style={isActive ? {
                    background: 'var(--sidebar-active-bg)',
                    color: 'var(--accent-red)',
                    border: '1px solid var(--border-red)',
                  } : {
                    color: 'var(--text-secondary)',
                    border: '1px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <Folder
                      size={15}
                      className="shrink-0"
                      style={{ color: isActive ? 'var(--accent-red)' : 'var(--text-muted)' }}
                    />
                    <div className="truncate">
                      <div className="text-xs font-semibold truncate leading-tight font-manrope">{ws.name}</div>
                      <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {ws.document_count} paper{ws.document_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Canvas Area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative p-6" style={{ background: 'var(--bg-void)' }}>
        {!activeWorkspace ? (
          <div
            className="h-full flex flex-col items-center justify-center text-center p-8 rounded-2xl m-4"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
            >
              <Layers size={26} />
            </div>
            <h3 className="text-base font-bold font-manrope" style={{ color: 'var(--text-primary)' }}>Select or Create a Research Corpus</h3>
            <p className="text-xs mt-2 max-w-md leading-relaxed font-light" style={{ color: 'var(--text-muted)' }}>
              Bundle multiple preprints and journal articles into a unified workspace. Perform cross-paper synthesis, compare experimental methodologies, and query across all documents simultaneously.
            </p>
            <button
              onClick={handleCreateWorkspace}
              className="mt-6 px-5 py-2.5 rounded-full text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <Plus size={14} style={{ color: 'var(--accent-red)' }} />
              Create New Corpus
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col max-w-6xl mx-auto w-full">
            {/* ── Header ── */}
            <div className="mb-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
                >
                  <Folder size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold font-manrope tracking-tight leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {activeWorkspace.name}
                  </h2>
                  {activeWorkspace.description && (
                    <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>{activeWorkspace.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDocPicker(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
                >
                  <Plus size={14} /> Add Papers
                </button>
                <span
                  className="text-xs font-mono px-3 py-1 rounded-full"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  {activeWorkspace.documents?.length || 0} Papers
                </span>
              </div>
            </div>

            {/* ── Main Layout: Split between Papers and Synthesis Workspace ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
              {/* Left Column: Linked Papers (4 cols) */}
              <div
                className="lg:col-span-4 flex flex-col rounded-2xl overflow-hidden shadow-sm"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-deep)' }}
                >
                  <h3 className="text-xs font-semibold flex items-center gap-2 font-manrope" style={{ color: 'var(--text-primary)' }}>
                    <FileText size={14} style={{ color: 'var(--accent-red)' }} /> Corpus Publications
                  </h3>
                  <button
                    onClick={() => setShowDocPicker(true)}
                    className="text-[11px] font-semibold cursor-pointer"
                    style={{ color: 'var(--accent-red)' }}
                  >
                    + Link
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-3 space-y-2">
                  {!activeWorkspace.documents || activeWorkspace.documents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center" style={{ color: 'var(--text-muted)' }}>
                      <BookOpen size={28} className="mb-2 opacity-50" />
                      <p className="text-xs mb-3 font-light">No papers in this workspace.</p>
                      <button
                        onClick={() => setShowDocPicker(true)}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                      >
                        Select from Library
                      </button>
                    </div>
                  ) : (
                    activeWorkspace.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-2.5 rounded-xl transition-all flex items-center justify-between group"
                        style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <FileText size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                          <span className="text-xs font-medium truncate font-mono" style={{ color: 'var(--text-primary)' }}>
                            {doc.original_filename}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 transition-opacity cursor-pointer rounded"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                          title="Unlink paper"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Synthesis, Comparison & Gaps (8 cols) */}
              <div
                className="lg:col-span-8 flex flex-col rounded-2xl overflow-hidden shadow-sm"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                {/* Module Tabs Header */}
                <div
                  className="px-4 py-2 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-deep)' }}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab('synthesize')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      style={activeTab === 'synthesize' ? {
                        background: 'var(--sidebar-active-bg)',
                        color: 'var(--accent-red)',
                        border: '1px solid var(--border-red)',
                      } : {
                        color: 'var(--text-secondary)',
                        border: '1px solid transparent',
                      }}
                    >
                      <Sparkles size={13} /> Synthesis Q&A
                    </button>
                    <button
                      onClick={() => setActiveTab('compare')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      style={activeTab === 'compare' ? {
                        background: 'var(--sidebar-active-bg)',
                        color: 'var(--accent-red)',
                        border: '1px solid var(--border-red)',
                      } : {
                        color: 'var(--text-secondary)',
                        border: '1px solid transparent',
                      }}
                    >
                      <Scale size={13} /> Paper Comparison
                    </button>
                    <button
                      onClick={() => setActiveTab('gaps')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      style={activeTab === 'gaps' ? {
                        background: 'var(--sidebar-active-bg)',
                        color: 'var(--accent-red)',
                        border: '1px solid var(--border-red)',
                      } : {
                        color: 'var(--text-secondary)',
                        border: '1px solid transparent',
                      }}
                    >
                      <Compass size={13} /> Research Gaps
                    </button>
                  </div>

                  <span className="text-[10px] font-mono uppercase tracking-widest hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                    Corpus Intelligence
                  </span>
                </div>

                {/* Tab 1: Synthesis Question Answering */}
                {activeTab === 'synthesize' && (
                  <div className="flex-1 flex flex-col min-h-0 p-4">
                    {/* Input Form */}
                    <form onSubmit={handleSynthesize} className="space-y-3 mb-4">
                      <div className="relative">
                        <textarea
                          rows={2}
                          value={synthesisQuery}
                          onChange={(e) => setSynthesisQuery(e.target.value)}
                          placeholder="Ask a research question across all papers in this corpus..."
                          className="w-full px-4 py-3 rounded-xl text-xs focus:outline-none transition-all resize-none font-sans"
                          style={{
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                          onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
                          onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                        />
                        <button
                          type="submit"
                          disabled={synthesisLoading || !synthesisQuery.trim()}
                          className="absolute right-2.5 bottom-3.5 px-3 py-1.5 text-white font-semibold text-xs rounded-lg disabled:opacity-40 flex items-center gap-1.5 transition-colors cursor-pointer"
                          style={{ background: 'var(--accent-red)' }}
                        >
                          {synthesisLoading ? (
                            <>
                              <Loader2 size={13} className="animate-spin" /> Synthesizing…
                            </>
                          ) : (
                            <>
                              <span>Ask Corpus</span>
                              <ArrowRight size={13} />
                            </>
                          )}
                        </button>
                      </div>

                      {/* Suggestion Chips */}
                      <div className="flex gap-2 flex-wrap text-[11px]">
                        {[
                          'What common methodologies do these papers employ?',
                          'Summarize conflicting findings or trade-offs',
                          'Compare the datasets and evaluation metrics used',
                        ].map((prompt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSynthesisQuery(prompt)}
                            className="px-2.5 py-1 rounded-md transition-colors font-mono text-[10px] cursor-pointer"
                            style={{
                              background: 'var(--bg-deep)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            + {prompt}
                          </button>
                        ))}
                      </div>
                    </form>

                    {/* Results Area */}
                    <div
                      className="flex-1 overflow-auto rounded-xl p-4"
                      style={{ background: 'var(--bg-void)', border: '1px solid var(--border-subtle)' }}
                    >
                      {synthesisLoading ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          <Loader2 size={24} className="animate-spin mb-2" style={{ color: 'var(--accent-red)' }} />
                          <p className="text-xs font-mono">Retrieving evidence & synthesizing answers…</p>
                        </div>
                      ) : synthesisResult ? (
                        <div className="space-y-4">
                          {synthesisResult.low_evidence && (
                            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-300 text-xs">
                              ⚠️ Low evidence score: limited direct overlap was found across the corpus.
                            </div>
                          )}

                          <div
                            className="academic-prose text-xs leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: renderMarkdown(synthesisResult.answer),
                            }}
                          />

                          {/* Sources list */}
                          {synthesisResult.sources && synthesisResult.sources.length > 0 && (
                            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                              <h5 className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                                Cited Passages
                              </h5>
                              <div className="flex flex-wrap gap-2">
                                {synthesisResult.sources.map((src, i) => (
                                  <span key={i} className="citation-badge">
                                    {src.filename || 'Doc'} · p.{src.page_number}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8" style={{ color: 'var(--text-muted)' }}>
                          <Sparkles size={28} className="mb-2 opacity-50" />
                          <p className="text-xs font-manrope font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Multi-Paper Synthesis
                          </p>
                          <p className="text-xs font-light max-w-sm mt-1">
                            Type a question above to interrogate all papers in this corpus. The synthesis engine merges dense vector retrieval with cross-encoder ranking.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Document Comparison */}
                {activeTab === 'compare' && (
                  <div className="flex-1 flex flex-col min-h-0 p-4">
                    <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <h4 className="text-xs font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>
                          Cross-Document Aspect Matrix
                        </h4>
                        <p className="text-[11px] font-light" style={{ color: 'var(--text-muted)' }}>
                          Compares Objective, Methodology, Dataset, Results, Limitations, and Conclusions across papers.
                        </p>
                      </div>
                      <button
                        onClick={handleCompare}
                        disabled={compareLoading}
                        className="px-3 py-1.5 text-xs text-white font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                        style={{ background: 'var(--accent-red)' }}
                      >
                        {compareLoading ? 'Generating…' : 'Run Aspect Comparison'}
                      </button>
                    </div>

                    <div
                      className="flex-1 overflow-auto rounded-xl p-4"
                      style={{ background: 'var(--bg-void)', border: '1px solid var(--border-subtle)' }}
                    >
                      {compareLoading ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          <Loader2 size={24} className="animate-spin mb-2" style={{ color: 'var(--accent-red)' }} />
                          <p className="text-xs font-mono">Analyzing aspects across corpus documents…</p>
                        </div>
                      ) : compareResult ? (
                        <div
                          className="academic-prose text-xs leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(compareResult.comparison_markdown),
                          }}
                        />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8" style={{ color: 'var(--text-muted)' }}>
                          <Scale size={28} className="mb-2 opacity-50" />
                          <p className="text-xs font-manrope font-semibold" style={{ color: 'var(--text-primary)' }}>
                            No Comparison Generated Yet
                          </p>
                          <p className="text-xs font-light max-w-sm mt-1">
                            Click 'Run Aspect Comparison' to automatically compare methodologies, empirical datasets, and findings across the papers in this corpus.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 3: Research Gaps */}
                {activeTab === 'gaps' && (
                  <div className="flex-1 flex flex-col min-h-0 p-4">
                    <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <h4 className="text-xs font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>
                          Gap Analysis & Open Challenges
                        </h4>
                        <p className="text-[11px] font-light" style={{ color: 'var(--text-muted)' }}>
                          Extracts explicit author-stated limitations alongside inferred research gaps.
                        </p>
                      </div>
                      <button
                        onClick={handleGaps}
                        disabled={gapsLoading}
                        className="px-3 py-1.5 text-xs text-white font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                        style={{ background: 'var(--accent-red)' }}
                      >
                        {gapsLoading ? 'Detecting…' : 'Detect Research Gaps'}
                      </button>
                    </div>

                    <div
                      className="flex-1 overflow-auto rounded-xl p-4"
                      style={{ background: 'var(--bg-void)', border: '1px solid var(--border-subtle)' }}
                    >
                      {gapsLoading ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                          <Loader2 size={24} className="animate-spin mb-2" style={{ color: 'var(--accent-red)' }} />
                          <p className="text-xs font-mono">Scanning papers for limitations and open challenges…</p>
                        </div>
                      ) : gapsResult ? (
                        <div className="space-y-4">
                          {/* Explicit gaps */}
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-wider font-mono mb-2" style={{ color: 'var(--text-primary)' }}>
                              Explicit Author-Stated Limitations
                            </h5>
                            <div className="space-y-2">
                              {gapsResult.explicit_gaps?.map((gap, i) => (
                                <div
                                  key={i}
                                  className="p-3 rounded-lg text-xs"
                                  style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
                                >
                                  <div className="font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>{gap.gap}</div>
                                  <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
                                    {gap.document} {gap.page ? `· Page ${gap.page}` : ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Inferred gaps */}
                          <div className="pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                            <h5 className="text-xs font-bold uppercase tracking-wider font-mono mb-2" style={{ color: 'var(--accent-red)' }}>
                              Inferred Cross-Literature Gaps
                            </h5>
                            <div className="space-y-2">
                              {gapsResult.inferred_gaps?.map((gap, i) => (
                                <div
                                  key={i}
                                  className="p-3 rounded-lg text-xs"
                                  style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)' }}
                                >
                                  <div className="font-semibold font-manrope" style={{ color: 'var(--accent-red)' }}>{gap.gap}</div>
                                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>{gap.reasoning}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8" style={{ color: 'var(--text-muted)' }}>
                          <Compass size={28} className="mb-2 opacity-50" />
                          <p className="text-xs font-manrope font-semibold" style={{ color: 'var(--text-primary)' }}>
                            No Gaps Detected Yet
                          </p>
                          <p className="text-xs font-light max-w-sm mt-1">
                            Click 'Detect Research Gaps' to scan all papers for future research directions and unaddressed limitations.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Document Picker Modal ── */}
      {showDocPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-fade-in"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <h3 className="text-sm font-bold font-manrope" style={{ color: 'var(--text-primary)' }}>
                Add Papers from Library
              </h3>
              <button
                onClick={() => setShowDocPicker(false)}
                className="p-1 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-2">
              {availableToAdd.length === 0 ? (
                <div className="text-center py-8 text-xs font-light" style={{ color: 'var(--text-muted)' }}>
                  {allUserDocuments.length === 0
                    ? 'No documents in your library yet. Upload PDFs in the Documents dashboard first.'
                    : 'All documents from your library are already in this workspace.'}
                </div>
              ) : (
                availableToAdd.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 rounded-xl flex items-center justify-between transition-colors"
                    style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="truncate pr-3">
                      <div className="text-xs font-medium truncate font-mono" style={{ color: 'var(--text-primary)' }}>
                        {doc.original_filename}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Status: {doc.status}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddDocument(doc.id)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer"
                      style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Research;

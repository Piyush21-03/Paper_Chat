import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Save, Settings2, Sliders, CheckCircle, Info } from 'lucide-react';

const Settings = () => {
  const [settings, setSettings] = useState({
    dense_top_k: 5,
    bm25_top_k: 5,
    rerank_top_k: 3,
    final_chunks: 3,
    reranker_enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxContext, setMaxContext] = useState(0);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get('/api/settings');
      setSettings(response.data);
      setMaxContext(response.data.max_context_chars || 0);
    } catch (err) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/api/settings', settings);
      toast.success('Hyperparameters updated successfully');
      await loadSettings();
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : parseInt(value) || 0
    }));
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-zinc-500 font-mono text-xs flex items-center justify-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#ef233c] animate-ping" />
        Loading hyperparameters...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
          >
            <Settings2 size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold font-manrope tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Retrieval Hyperparameters
            </h1>
            <p className="text-xs mt-0.5 font-light" style={{ color: 'var(--text-muted)' }}>
              Fine-tune dense vector search, BM25 lexical keyword ranking, and neural cross-encoder reranking.
            </p>
          </div>
        </div>
      </div>

      {/* Main Settings Card */}
      <div
        className="overflow-hidden rounded-2xl shadow-sm"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-deep)' }}
        >
          <h2 className="text-sm font-semibold flex items-center gap-2 font-manrope" style={{ color: 'var(--text-primary)' }}>
            <Sliders size={16} style={{ color: 'var(--accent-red)' }} /> Hybrid Retrieval Pipeline Parameters
          </h2>
          <span
            className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-md"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
          >
            Production Tuning
          </span>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Dense Top-K */}
            <div
              className="space-y-1.5 p-4 rounded-xl"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>
                  Dense Vector Top-K
                </label>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent-red)' }}>{settings.dense_top_k}</span>
              </div>
              <input
                type="number"
                name="dense_top_k"
                min="1"
                max="20"
                value={settings.dense_top_k}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-lg text-xs font-mono focus:outline-none transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
              <p className="text-[11px] font-light" style={{ color: 'var(--text-muted)' }}>
                Nearest neighbor chunks retrieved from Qdrant dense vector space.
              </p>
            </div>

            {/* BM25 Top-K */}
            <div
              className="space-y-1.5 p-4 rounded-xl"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>
                  BM25 Keyword Top-K
                </label>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent-red)' }}>{settings.bm25_top_k}</span>
              </div>
              <input
                type="number"
                name="bm25_top_k"
                min="1"
                max="20"
                value={settings.bm25_top_k}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-lg text-xs font-mono focus:outline-none transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
              <p className="text-[11px] font-light" style={{ color: 'var(--text-muted)' }}>
                Term-frequency passages retrieved through exact BM25 keyword matching.
              </p>
            </div>

            {/* Rerank Top-K */}
            <div
              className="space-y-1.5 p-4 rounded-xl"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>
                  Rerank Pool Candidates
                </label>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent-red)' }}>{settings.rerank_top_k}</span>
              </div>
              <input
                type="number"
                name="rerank_top_k"
                min="1"
                max="20"
                value={settings.rerank_top_k}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-lg text-xs font-mono focus:outline-none transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
              <p className="text-[11px] font-light" style={{ color: 'var(--text-muted)' }}>
                Merged candidate pool passed to the cross-encoder neural model.
              </p>
            </div>

            {/* Final Chunks */}
            <div
              className="space-y-1.5 p-4 rounded-xl"
              style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>
                  Final Injected Chunks
                </label>
                <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent-red)' }}>{settings.final_chunks}</span>
              </div>
              <input
                type="number"
                name="final_chunks"
                min="1"
                max="10"
                value={settings.final_chunks}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-lg text-xs font-mono focus:outline-none transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-red)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
              <p className="text-[11px] font-light" style={{ color: 'var(--text-muted)' }}>
                Highest scoring passages injected into LLM reader generation prompt.
              </p>
            </div>
          </div>

          {/* Cross-Encoder Toggle */}
          <div
            className="p-4 rounded-xl flex items-start gap-3"
            style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
          >
            <input
              type="checkbox"
              id="reranker_enabled"
              name="reranker_enabled"
              checked={settings.reranker_enabled}
              onChange={handleChange}
              className="mt-1 w-4 h-4 rounded cursor-pointer accent-[#ef233c]"
            />
            <div>
              <label htmlFor="reranker_enabled" className="text-xs font-semibold cursor-pointer font-manrope" style={{ color: 'var(--text-primary)' }}>
                Enable Cross-Encoder Neural Reranking
              </label>
              <p className="text-[11px] font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Applies cross-attention scoring between the query and candidate passages to prioritize relevance over simple vector proximity.
              </p>
            </div>
          </div>

          {/* Context Window Notice */}
          <div
            className="p-4 rounded-xl flex items-center justify-between text-xs"
            style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)' }}
          >
            <div className="flex items-center gap-2.5" style={{ color: 'var(--text-secondary)' }}>
              <Info size={16} className="shrink-0" style={{ color: 'var(--accent-red)' }} />
              <span>
                <strong className="font-manrope" style={{ color: 'var(--text-primary)' }}>Context Window Allocation:</strong> ~
                {maxContext.toLocaleString()} maximum characters per retrieval prompt
              </span>
            </div>
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
            >
              Optimal
            </span>
          </div>

          {/* Submit Action */}
          <div className="flex justify-end pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 text-white font-semibold text-xs tracking-wider uppercase px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
              style={{ background: 'var(--accent-red)' }}
            >
              <Save size={14} />
              {saving ? 'Updating…' : 'Save Parameters'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;

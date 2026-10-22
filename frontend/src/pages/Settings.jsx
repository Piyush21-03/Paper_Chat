import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Save, Settings2, Sliders } from 'lucide-react';

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
      toast.success('Settings saved successfully');
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
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
          <Settings2 size={24} /> Settings
        </h1>
        <p className="text-slate-500 dark:text-slate-400">Configure retrieval pipeline parameters.</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <Sliders size={20} /> Retrieval Pipeline
          </h2>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dense Top-K</label>
              <input 
                type="number" 
                name="dense_top_k" 
                min="1" max="20"
                value={settings.dense_top_k} 
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Number of chunks to retrieve via vector search.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">BM25 Top-K</label>
              <input 
                type="number" 
                name="bm25_top_k" 
                min="1" max="20"
                value={settings.bm25_top_k} 
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Number of chunks to retrieve via keyword search.</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rerank Top-K</label>
              <input 
                type="number" 
                name="rerank_top_k" 
                min="1" max="20"
                value={settings.rerank_top_k} 
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Chunks passed to the cross-encoder (if enabled).</p>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Final Chunks</label>
              <input 
                type="number" 
                name="final_chunks" 
                min="1" max="10"
                value={settings.final_chunks} 
                onChange={handleChange}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Final chunks sent to the LLM as context.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                name="reranker_enabled"
                checked={settings.reranker_enabled}
                onChange={handleChange}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Cross-Encoder Reranker</span>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 ml-8 mt-1">
              Improves context relevance by doing a second-pass rank of the combined Dense + BM25 results.
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-center justify-between">
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-semibold">Context Budget:</span> ~{maxContext.toLocaleString()} characters max sent to LLM
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <button 
              type="submit" 
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;

import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Plus, FolderOpen, Play, Trash2, Link as LinkIcon, ExternalLink, BarChart2 } from 'lucide-react';

const Eval = () => {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    try {
      const response = await api.get('/api/eval/runs');
      if (response.data.success) {
        setRuns(response.data.runs);
      }
    } catch (err) {
      toast.error('Failed to load evaluation runs');
    } finally {
      setLoading(false);
    }
  };

  const handleRunEval = async () => {
    if (!window.confirm("Start an evaluation run? This tests retrieval and LLM grading against the 'eval_cases' table. This will consume LLM tokens and take a minute or two.")) return;
    
    setEvaluating(true);
    const toastId = toast.loading('Running evaluation pipeline...');
    
    try {
      const response = await api.post('/api/eval/run');
      if (response.data.success) {
        toast.success(`Evaluation complete! Scored ${response.data.run.num_questions} questions.`, { id: toastId });
        await loadRuns();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to run evaluation';
      toast.error(msg, { id: toastId });
    } finally {
      setEvaluating(false);
    }
  };

  const pct = (v) => v == null ? "—" : `${v}%`;
  const ms = (v) => v == null ? "—" : (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`);

  const latest = runs.length > 0 ? runs[0] : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Evaluation Pipeline</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {latest 
              ? `${runs.length} runs · last run ${new Date(latest.created_at).toLocaleString()} · ${latest.num_questions} questions`
              : 'No evaluation runs yet.'
            }
          </p>
        </div>

        <button 
          onClick={handleRunEval}
          disabled={evaluating}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {evaluating ? <Play className="animate-spin" size={18} /> : <Play size={18} />}
          Run Evaluation
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading...</div>
      ) : latest ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Retrieval Precision", value: pct(latest.metrics.retrieval_precision), note: "exact match" },
              { label: "Retrieval Recall", value: pct(latest.metrics.retrieval_recall), note: "exact match" },
              { label: "Answer Relevance", value: pct(latest.metrics.answer_relevance), note: "LLM judge" },
              { label: "Faithfulness", value: pct(latest.metrics.faithfulness), note: "LLM judge" },
              { label: "Total Latency", value: ms(latest.metrics.total_latency_ms), note: "avg time" },
            ].map((metric, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{metric.label}</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{metric.value}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{metric.note}</div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Run History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Q's</th>
                    <th className="px-6 py-3">Precision</th>
                    <th className="px-6 py-3">Recall</th>
                    <th className="px-6 py-3">Relevance</th>
                    <th className="px-6 py-3">Faithfulness</th>
                    <th className="px-6 py-3">Latency</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-800 dark:text-slate-300">
                  {runs.map(run => (
                    <tr key={run.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3 whitespace-nowrap">{new Date(run.created_at).toLocaleString()}</td>
                      <td className="px-6 py-3">{run.num_questions}</td>
                      <td className="px-6 py-3">{pct(run.metrics.retrieval_precision)}</td>
                      <td className="px-6 py-3">{pct(run.metrics.retrieval_recall)}</td>
                      <td className="px-6 py-3">{pct(run.metrics.answer_relevance)}</td>
                      <td className="px-6 py-3">{pct(run.metrics.faithfulness)}</td>
                      <td className="px-6 py-3">{ms(run.metrics.total_latency_ms)}</td>
                      <td className="px-6 py-3">
                        <button 
                          onClick={() => setShowDetail(run)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                        >
                          View Results
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl border-dashed">
          <BarChart2 size={48} className="text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-50">No data available</h3>
          <p className="text-slate-500 mt-2 max-w-sm text-center">Run the evaluation pipeline to test the retrieval and generation performance.</p>
        </div>
      )}

      {/* Modal for detailed results */}
      {showDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold">Results: {new Date(showDetail.created_at).toLocaleString()}</h2>
              <button 
                onClick={() => setShowDetail(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {showDetail.results?.map((res, i) => (
                <div key={res.id || i} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className={`px-4 py-2 font-medium ${res.passed ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'}`}>
                    Q: {res.question}
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Expected Answer</h4>
                      <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                        {res.expected_answer || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Generated Answer</h4>
                      <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                        {res.generated_answer || 'N/A'}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Metrics & Reasoning</h4>
                      <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                        <div className="flex gap-4 mb-2 font-mono text-xs">
                          <span>Relevance: {res.answer_relevance}%</span>
                          <span>Faithfulness: {res.faithfulness}%</span>
                          <span>Precision: {res.retrieval_precision}%</span>
                          <span>Recall: {res.retrieval_recall}%</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono text-xs">
                          {res.judge_reasoning || 'No reasoning provided.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Eval;

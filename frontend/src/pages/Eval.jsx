import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Play, BarChart2, X, CheckCircle2, XCircle, ArrowUpRight, Activity } from 'lucide-react';

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
    if (
      !window.confirm(
        "Execute automated RAG evaluation? This runs synthetic test queries across Qdrant and grades factual faithfulness and precision. This consumes inference tokens."
      )
    )
      return;

    setEvaluating(true);
    const toastId = toast.loading('Running evaluation pipeline...');

    try {
      const response = await api.post('/api/eval/run');
      if (response.data.success) {
        toast.success(
          `Evaluation complete! Scored ${response.data.run.num_questions} academic queries.`,
          { id: toastId }
        );
        await loadRuns();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to run evaluation';
      toast.error(msg, { id: toastId });
    } finally {
      setEvaluating(false);
    }
  };

  const pct = (v) => (v == null ? '—' : `${v}%`);
  const ms = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`);

  const latest = runs.length > 0 ? runs[0] : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8" style={{ color: 'var(--text-primary)' }}>
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
          >
            <Activity size={18} />
          </div>
          <div>
            <h1 className="text-xl font-bold font-manrope tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Retrieval & LLM Benchmark Suite
            </h1>
            <p className="text-xs mt-0.5 font-light" style={{ color: 'var(--text-muted)' }}>
              {latest
                ? `${runs.length} benchmark executions · latest on ${new Date(
                    latest.created_at
                  ).toLocaleString()} · ${latest.num_questions} test queries evaluated`
                : 'Benchmark dense retrieval precision and factual faithfulness against ground-truth corpora.'}
            </p>
          </div>
        </div>

        <button
          onClick={handleRunEval}
          disabled={evaluating}
          className="flex items-center justify-center gap-2 text-white font-semibold text-xs tracking-wider uppercase px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
          style={{ background: 'var(--accent-red)' }}
        >
          <Play size={13} className={evaluating ? 'animate-spin' : 'fill-white'} />
          <span>{evaluating ? 'Evaluating…' : 'Execute Benchmark'}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs font-mono flex items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <div className="w-2 h-2 rounded-full animate-ping" style={{ background: 'var(--accent-red)' }} />
          Loading benchmark runs…
        </div>
      ) : latest ? (
        <>
          {/* ── Top Metric Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              {
                label: 'Retrieval Precision',
                value: pct(latest.metrics.retrieval_precision),
                note: 'Exact chunk overlap',
              },
              {
                label: 'Retrieval Recall',
                value: pct(latest.metrics.retrieval_recall),
                note: 'Relevant context coverage',
              },
              {
                label: 'Answer Relevance',
                value: pct(latest.metrics.answer_relevance),
                note: 'Query alignment score',
              },
              {
                label: 'Factual Faithfulness',
                value: pct(latest.metrics.faithfulness),
                note: 'Hallucination-free score',
              },
              {
                label: 'Average Latency',
                value: ms(latest.metrics.total_latency_ms),
                note: 'End-to-end response time',
              },
            ].map((metric, i) => (
              <div
                key={i}
                className="rouge-card p-5 rounded-2xl relative overflow-hidden group shadow-sm"
              >
                <div className="text-[10px] font-bold font-mono uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  {metric.label}
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight group-hover:text-[#ef233c] transition-colors" style={{ color: 'var(--text-primary)' }}>
                  {metric.value}
                </div>
                <div className="text-[11px] font-light mt-1.5" style={{ color: 'var(--text-muted)' }}>{metric.note}</div>
                <div
                  className="absolute top-0 right-0 w-24 h-24 bg-red-600/5 rounded-full blur-xl pointer-events-none group-hover:bg-red-600/10 transition-colors"
                />
              </div>
            ))}
          </div>

          {/* ── Historical Runs Table ── */}
          <div
            className="overflow-hidden rounded-2xl shadow-sm"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-deep)' }}
            >
              <h2 className="text-sm font-semibold font-manrope flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <BarChart2 size={16} style={{ color: 'var(--accent-red)' }} /> Historical Evaluation Runs
              </h2>
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Ground Truth Verified
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className="font-semibold font-mono uppercase tracking-wider text-[10px]"
                  style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                >
                  <tr>
                    <th className="px-6 py-3 font-normal">Timestamp</th>
                    <th className="px-6 py-3 font-normal">Cases</th>
                    <th className="px-6 py-3 font-normal">Precision</th>
                    <th className="px-6 py-3 font-normal">Recall</th>
                    <th className="px-6 py-3 font-normal">Relevance</th>
                    <th className="px-6 py-3 font-normal">Faithfulness</th>
                    <th className="px-6 py-3 font-normal">Latency</th>
                    <th className="px-6 py-3 text-right font-normal">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-red-500/[0.03] transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap font-sans text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(run.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5" style={{ color: 'var(--text-secondary)' }}>{run.num_questions}</td>
                      <td className="px-6 py-3.5 font-bold" style={{ color: 'var(--text-primary)' }}>{pct(run.metrics.retrieval_precision)}</td>
                      <td className="px-6 py-3.5 font-bold" style={{ color: 'var(--text-primary)' }}>{pct(run.metrics.retrieval_recall)}</td>
                      <td className="px-6 py-3.5 font-bold" style={{ color: 'var(--text-primary)' }}>{pct(run.metrics.answer_relevance)}</td>
                      <td className="px-6 py-3.5 font-bold" style={{ color: 'var(--accent-red)' }}>{pct(run.metrics.faithfulness)}</td>
                      <td className="px-6 py-3.5" style={{ color: 'var(--text-muted)' }}>{ms(run.metrics.total_latency_ms)}</td>
                      <td className="px-6 py-3.5 text-right font-sans">
                        <button
                          onClick={() => setShowDetail(run)}
                          className="hover:underline font-semibold text-xs flex items-center gap-1 justify-end ml-auto cursor-pointer"
                          style={{ color: 'var(--accent-red)' }}
                        >
                          <span>Breakdown</span>
                          <ArrowUpRight size={13} />
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
        <div
          className="flex flex-col items-center justify-center py-20 rounded-2xl border-dashed"
          style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)' }}
        >
          <BarChart2 size={40} className="mb-3 opacity-40" style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-base font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>No benchmark data available</h3>
          <p className="mt-1 max-w-sm text-center text-xs font-light" style={{ color: 'var(--text-muted)' }}>
            Click 'Execute Benchmark' to run our test suite across your papers and quantify RAG precision.
          </p>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div>
                <h2 className="text-base font-bold font-manrope" style={{ color: 'var(--text-primary)' }}>
                  Evaluation Run Breakdown
                </h2>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Executed: {new Date(showDetail.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setShowDetail(null)}
                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">
              {showDetail.results?.map((res, i) => (
                <div
                  key={res.id || i}
                  className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)' }}
                >
                  <div
                    className={`px-4 py-2.5 font-semibold text-xs flex items-center justify-between border-b ${
                      res.passed
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20'
                    }`}
                  >
                    <span className="truncate pr-4">Q: {res.question}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider shrink-0 font-bold">
                      {res.passed ? 'PASSED' : 'FLAGGED'}
                    </span>
                  </div>

                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        Expected Ground Truth
                      </h4>
                      <div
                        className="p-3 rounded-lg font-light leading-relaxed"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                      >
                        {res.expected_answer || 'N/A'}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-mono text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        Generated Response
                      </h4>
                      <div
                        className="p-3 rounded-lg font-light leading-relaxed"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                      >
                        {res.generated_answer || 'N/A'}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <h4 className="font-mono text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                        Automated Judge Evaluation
                      </h4>
                      <div
                        className="p-3.5 rounded-lg space-y-2"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                      >
                        <div
                          className="flex flex-wrap gap-4 font-mono text-[11px] pb-2"
                          style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                        >
                          <span>Relevance: <strong style={{ color: 'var(--text-primary)' }}>{res.answer_relevance}%</strong></span>
                          <span>Faithfulness: <strong style={{ color: 'var(--accent-red)' }}>{res.faithfulness}%</strong></span>
                          <span>Precision: <strong style={{ color: 'var(--text-primary)' }}>{res.retrieval_precision}%</strong></span>
                          <span>Recall: <strong style={{ color: 'var(--text-primary)' }}>{res.retrieval_recall}%</strong></span>
                        </div>
                        <p className="font-mono text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
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

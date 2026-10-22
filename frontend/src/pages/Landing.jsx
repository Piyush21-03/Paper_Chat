import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Search, BarChart2, FlaskConical, ArrowRight, Zap,
  Shield, MessageSquare, FileText, ChevronRight, Brain,
  Layers, Target, CheckCircle
} from 'lucide-react';

const Feature = ({ icon: Icon, title, desc, color }) => (
  <div className="group relative bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 backdrop-blur-sm">
    <div className={`inline-flex p-3 rounded-xl mb-4 ${color}`}>
      <Icon size={22} />
    </div>
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
  </div>
);

const Step = ({ num, title, desc }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-blue-600/30">
      {num}
    </div>
    <div className="pt-1">
      <h4 className="font-semibold text-slate-900 dark:text-white mb-1">{title}</h4>
      <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

const Landing = () => {
  const heroRef = useRef(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    el.classList.add('animate-fade-in-up');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-40 border-b border-white/5 backdrop-blur-xl bg-slate-950/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <BookOpen size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">PaperChat</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-600/20"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-24 pb-20 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-20 w-72 h-72 bg-purple-600/8 rounded-full blur-3xl pointer-events-none" />

        <div ref={heroRef} className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-600/15 border border-blue-500/20 text-blue-400 text-sm font-medium mb-8">
            <Zap size={13} />
            <span>RAG-powered document intelligence</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            Chat with your
            <span className="block bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-400 bg-clip-text text-transparent">
              research papers
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Upload PDFs, ask questions in natural language, and instantly surface
            answers grounded in your documents — with source citations.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
            >
              Start for free
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all hover:-translate-y-0.5"
            >
              Sign in
              <ChevronRight size={16} className="opacity-60" />
            </Link>
          </div>
        </div>

        {/* Hero "app preview" card */}
        <div className="relative max-w-3xl mx-auto mt-16">
          <div className="rounded-2xl border border-white/10 bg-slate-800/50 backdrop-blur-sm shadow-2xl shadow-slate-950/60 overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-slate-900/60">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-3 text-xs text-slate-500 font-mono">PaperChat — Chat</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-end">
                <div className="max-w-xs px-4 py-3 bg-blue-600 rounded-2xl rounded-br-sm text-sm text-white">
                  What is the main contribution of this paper?
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-sm px-4 py-3 bg-slate-700/60 border border-white/5 rounded-2xl rounded-bl-sm text-sm text-slate-200 leading-relaxed">
                  The main contribution is a novel retrieval-augmented generation framework that combines dense and sparse retrieval with a cross-encoder reranker…
                  <div className="mt-3 pt-2 border-t border-white/10">
                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Sources</span>
                    <div className="mt-1.5 flex gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-slate-300">
                        <BookOpen size={10} className="text-blue-400" /> paper.pdf · p.3
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 px-4 py-2.5 bg-slate-900/60 border border-white/5 rounded-xl text-sm text-slate-500">
                  Ask a follow-up question…
                </div>
                <button className="p-2.5 bg-blue-600 rounded-lg text-white">
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Everything you need for research
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              From instant document Q&A to evaluation pipelines — PaperChat is purpose-built for serious research workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Feature
              icon={MessageSquare}
              title="Grounded Q&A"
              desc="Ask any question and get answers cited directly from your PDFs, with page-level source attribution."
              color="bg-blue-500/10 text-blue-400"
            />
            <Feature
              icon={Brain}
              title="Hybrid Retrieval"
              desc="Combines dense vector search with BM25 keyword search and a cross-encoder reranker for maximum accuracy."
              color="bg-purple-500/10 text-purple-400"
            />
            <Feature
              icon={Layers}
              title="Multi-doc Research"
              desc="Group papers into workspaces and synthesize findings across multiple documents in one session."
              color="bg-cyan-500/10 text-cyan-400"
            />
            <Feature
              icon={BarChart2}
              title="Evaluation Pipeline"
              desc="Run automated evaluation runs to benchmark retrieval precision, recall, answer relevance, and faithfulness."
              color="bg-green-500/10 text-green-400"
            />
            <Feature
              icon={Target}
              title="Calculator Mode"
              desc="Numeric questions are answered with a deterministic calculator — cheaper, faster, and more reliable than LLM math."
              color="bg-orange-500/10 text-orange-400"
            />
            <Feature
              icon={Shield}
              title="Secure & Private"
              desc="JWT authentication, per-user document isolation, and rate limiting keep your data secure."
              color="bg-red-500/10 text-red-400"
            />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6 bg-slate-900/40 border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                From upload to insight
                <span className="block text-blue-400">in seconds</span>
              </h2>
              <p className="text-slate-400 mb-10 leading-relaxed">
                PaperChat handles all the heavy lifting — chunking, embedding, indexing — so you can focus on research.
              </p>
              <div className="space-y-8">
                <Step num="1" title="Upload your PDFs" desc="Drag and drop research papers. PaperChat processes and indexes them automatically in the background." />
                <Step num="2" title="Ask anything" desc="Type questions in plain English. The hybrid retrieval pipeline finds the most relevant passages instantly." />
                <Step num="3" title="Get grounded answers" desc="Receive answers with exact source citations. Click any citation to jump to the page in the PDF." />
                <Step num="4" title="Compare & synthesize" desc="Group documents, run cross-paper comparisons, and generate research summaries across your entire library." />
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-blue-600/5 rounded-3xl blur-2xl" />
              <div className="relative space-y-3">
                {[
                  { label: 'Dense Retrieval (Vector)', pct: 92 },
                  { label: 'BM25 Keyword Search', pct: 78 },
                  { label: 'Cross-Encoder Rerank', pct: 97 },
                  { label: 'Answer Faithfulness', pct: 94 },
                ].map(({ label, pct }) => (
                  <div key={label} className="bg-slate-800/60 border border-white/5 rounded-xl p-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-300 font-medium">{label}</span>
                      <span className="text-blue-400 font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/15 border border-blue-500/20 flex items-center justify-center mx-auto mb-6">
            <Zap size={28} className="text-blue-400" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to accelerate your research?
          </h2>
          <p className="text-slate-400 mb-8">
            Create a free account and start chatting with your papers in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:-translate-y-0.5"
            >
              Create free account
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all hover:-translate-y-0.5"
            >
              Sign in to existing account
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <BookOpen size={14} className="text-blue-400" />
            </div>
            <span className="font-semibold text-slate-300">PaperChat</span>
          </div>
          <p className="text-sm text-slate-600">
            Built with FastAPI · React · Qdrant · Google Gemini
          </p>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <Link to="/login" className="hover:text-slate-300 transition-colors">Sign in</Link>
            <Link to="/register" className="hover:text-slate-300 transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

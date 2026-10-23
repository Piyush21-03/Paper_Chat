import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  FileText,
  Search,
  BarChart2,
  FlaskConical,
  ArrowRight,
  Layers,
  Check,
  BookOpen,
  Sparkles,
  Sun,
  Moon,
  ShieldCheck,
  Zap,
  Target,
  ArrowUpRight
} from 'lucide-react';

const Landing = () => {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <div
      className={`min-h-screen font-inter relative overflow-x-hidden selection:bg-[#ef233c] selection:text-white transition-colors duration-200 ${
        isDark ? 'bg-black text-white' : 'bg-[#f8fafc] text-[#0f172a]'
      }`}
    >
      {/* ── Global Background ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        {isDark ? (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-[#180507] via-black to-black" />
            <div className="stars-layer-1" />
            <div className="stars-layer-2" />
            {/* Red ambient core glow */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-red-600/10 rounded-full blur-[140px]" />
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_30%,transparent_80%)]" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-red-50/40 via-white to-slate-50" />
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-[120px]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_30%,transparent_80%)]" />
          </>
        )}
      </div>

      {/* ── Fixed Blur Navbar ── */}
      <header className="fixed top-0 left-0 w-full z-50 pt-5 px-4">
        <nav
          className={`max-w-6xl mx-auto flex items-center justify-between backdrop-blur-xl border rounded-full px-6 py-3 shadow-2xl transition-colors duration-200 ${
            isDark
              ? 'bg-black/60 border-white/10'
              : 'bg-white/80 border-slate-200 shadow-slate-200/50'
          }`}
        >
          <Link to="/" className="flex items-center gap-2.5 group">
            <div
              className="w-5 h-5 rounded-sm transition-transform group-hover:rotate-90 duration-300"
              style={{ background: 'var(--accent-red)', transform: 'rotate(45deg)' }}
            />
            <span
              className={`text-lg font-bold font-manrope tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              PaperChat
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-red-500/10 text-[#ef233c] border border-red-500/20 hidden sm:inline-block">
              Scholar
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className={`text-sm font-medium transition-colors ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Capabilities
            </a>
            <a
              href="#transformation"
              className={`text-sm font-medium transition-colors ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              What Changes
            </a>
            <a
              href="#workspaces"
              className={`text-sm font-medium transition-colors ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Corpora Workspaces
            </a>
            <a
              href="#eval"
              className={`text-sm font-medium transition-colors ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Benchmarking
            </a>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-full border transition-all ${
                isDark
                  ? 'border-white/10 hover:border-white/20 bg-white/5 text-zinc-300 hover:text-white'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-100 text-slate-700 hover:text-slate-900 shadow-xs'
              }`}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-[#ef233c]" />}
            </button>

            <Link
              to="/login"
              className={`text-sm font-medium px-3 py-1.5 transition-colors ${
                isDark ? 'text-zinc-300 hover:text-white' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Sign In
            </Link>

            <Link
              to="/register"
              className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white/5 px-5 py-2 transition-transform active:scale-95"
            >
              <span className={`absolute inset-0 border rounded-full ${isDark ? 'border-white/10' : 'border-red-500/20'}`} />
              <span className="absolute inset-[-100%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_75%,#ef233c_100%)] opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className={`absolute inset-[1px] rounded-full ${isDark ? 'bg-black' : 'bg-white'}`} />
              <span className={`relative z-10 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Launch App <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform text-[#ef233c]" />
              </span>
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Main Content ── */}
      <main className="relative z-10">
        {/* ── Hero Section ── */}
        <section className="min-h-screen flex flex-col items-center justify-center pt-36 pb-20 px-6">
          <div className="text-center max-w-5xl mx-auto">
            {/* Live Release Badge */}
            <div
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border backdrop-blur-md mb-8 animate-fade-up ${
                isDark
                  ? 'bg-white/5 border-white/10'
                  : 'bg-red-50 border-red-200/60 shadow-xs'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ef233c]" />
              </span>
              <span
                className={`text-xs font-medium tracking-wide font-manrope ${
                  isDark ? 'text-red-200/90' : 'text-red-700'
                }`}
              >
                PaperChat 2.0 with Hybrid RAG & Visual Grounding is live
              </span>
              <ArrowRight size={13} className="text-[#ef233c]" />
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl sm:text-7xl md:text-8xl font-semibold tracking-tighter font-manrope leading-[1.08] mb-8 animate-fade-up">
              <span
                className={`block text-transparent bg-clip-text ${
                  isDark
                    ? 'bg-gradient-to-b from-white via-white to-white/40'
                    : 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-700'
                }`}
              >
                Research Intelligence
              </span>
              <span
                className={`block text-transparent bg-clip-text ${
                  isDark
                    ? 'bg-gradient-to-b from-white via-white to-white/40'
                    : 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-700'
                }`}
              >
                for the{' '}
                <span className="text-[#ef233c] inline-block relative">
                  Future
                  <svg
                    className="absolute w-full h-3 -bottom-2 left-0 text-[#ef233c] opacity-60"
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                  >
                    <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="2.5" fill="none" />
                  </svg>
                </span>
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className={`text-lg sm:text-xl md:text-2xl max-w-3xl mx-auto mb-12 leading-relaxed animate-fade-up font-light ${
                isDark ? 'text-zinc-400' : 'text-slate-600'
              }`}
            >
              Interrogate complex research papers, synthesize multi-document literature, and verify claims with
              high-precision{' '}
              <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                grounded page citations
              </span>{' '}
              powered by hybrid dense-sparse RAG.
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 animate-fade-up">
              <Link
                to="/register"
                className="shiny-cta group flex items-center gap-2.5 text-white font-semibold text-sm"
              >
                <span>Start Reading Free</span>
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>

              <Link
                to="/dashboard"
                className={`group px-8 py-3.5 rounded-full border font-medium transition-all flex items-center gap-2 text-sm ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-xs'
                }`}
              >
                <BookOpen size={16} className="text-[#ef233c]" />
                Explore Document Library
              </Link>
            </div>
          </div>
        </section>

        {/* ── Capabilities Bento Grid ── */}
        <section id="features" className="py-28 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-20 text-center max-w-3xl mx-auto animate-fade-up">
              <h2
                className={`text-4xl md:text-5xl font-semibold tracking-tight font-manrope mb-6 ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                The Operating System for <br />
                <span className="text-[#ef233c]">Academic Discovery</span>
              </h2>
              <p className={`text-lg font-light ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Leave sluggish PDF readers and hallucinating chatbots behind. Get mathematically grounded answers with pinpoint citations.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-auto lg:h-[650px]">
              {/* Main Feature Card */}
              <div
                className={`lg:col-span-2 lg:row-span-2 group relative overflow-hidden p-8 border rounded-2xl flex flex-col justify-between transition-all ${
                  isDark
                    ? 'border-white/10 bg-gradient-to-b from-zinc-900/60 to-black hover:border-red-500/40'
                    : 'border-slate-200 bg-gradient-to-b from-white to-slate-50 hover:border-red-500/40 shadow-sm'
                }`}
              >
                <div>
                  <div
                    className={`mb-6 inline-flex p-3 rounded-xl border text-[#ef233c] ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-red-50 border-red-100'
                    }`}
                  >
                    <Search size={24} />
                  </div>
                  <h3
                    className={`text-3xl font-semibold font-manrope mb-4 tracking-tight ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Hybrid Dense & Sparse Search
                  </h3>
                  <p
                    className={`text-base sm:text-lg leading-relaxed mb-6 font-light ${
                      isDark ? 'text-zinc-400' : 'text-slate-600'
                    }`}
                  >
                    Every query triggers parallel vector distance scoring in Qdrant combined with BM25 lexical keyword matching. A cross-encoder neural model reranks the results to eliminate false positives and retain pure academic signal.
                  </p>
                  <div
                    className={`p-4 rounded-xl border space-y-2 font-mono text-xs ${
                      isDark
                        ? 'bg-black/60 border-white/5 text-zinc-400'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>Dense Vector K</span>
                      <span className="text-[#ef233c] font-semibold">Qdrant Cosine Similarity</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>BM25 Sparse K</span>
                      <span className="text-amber-500 font-semibold">Exact Keyword Term Frequency</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Cross-Encoder Top-K</span>
                      <span className="text-emerald-500 font-semibold">Deep Passage Re-ranking</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between text-xs font-mono text-[#ef233c] tracking-widest uppercase">
                  <span>HYBRID RETRIEVAL PIPELINE</span>
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Feature 2: Page Citations */}
              <div
                className={`lg:col-span-2 group relative overflow-hidden p-8 border rounded-2xl flex flex-col justify-between transition-all ${
                  isDark
                    ? 'border-white/10 bg-black hover:border-white/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                }`}
              >
                <div>
                  <div
                    className={`mb-4 inline-flex p-3 rounded-xl border text-[#ef233c] ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-red-50 border-red-100'
                    }`}
                  >
                    <FileText size={22} />
                  </div>
                  <h3
                    className={`text-2xl font-semibold font-manrope mb-2 ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Direct Page-Grounded Citations
                  </h3>
                  <p
                    className={`text-sm leading-relaxed ${
                      isDark ? 'text-zinc-400' : 'text-slate-600'
                    }`}
                  >
                    Click any citation badge in an AI response to immediately navigate the built-in PDF viewer to that exact page number, verifying the original claims in context.
                  </p>
                </div>
                <div className="mt-4 flex gap-2 flex-wrap">
                  <span className="citation-badge">p. 4 § Methodology</span>
                  <span className="citation-badge">p. 11 § Figure 3</span>
                  <span className="citation-badge">p. 18 § Ablation Study</span>
                </div>
              </div>

              {/* Feature 3: Research Corpora */}
              <div
                id="workspaces"
                className={`group relative overflow-hidden p-7 border rounded-2xl flex flex-col justify-between transition-all ${
                  isDark
                    ? 'border-white/10 bg-black hover:border-white/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                }`}
              >
                <div>
                  <div
                    className={`mb-4 inline-flex p-3 rounded-xl border text-amber-500 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-amber-50 border-amber-100'
                    }`}
                  >
                    <FlaskConical size={20} />
                  </div>
                  <h3
                    className={`text-xl font-semibold font-manrope mb-2 ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Corpora Workspaces
                  </h3>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDark ? 'text-zinc-400' : 'text-slate-600'
                    }`}
                  >
                    Bundle dozens of related papers into specialized corpora to interrogate entire subfields at once.
                  </p>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500 font-bold">
                  Cross-Paper Synthesis
                </span>
              </div>

              {/* Feature 4: Eval & Metrics */}
              <div
                id="eval"
                className={`group relative overflow-hidden p-7 border rounded-2xl flex flex-col justify-between transition-all ${
                  isDark
                    ? 'border-white/10 bg-black hover:border-white/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                }`}
              >
                <div>
                  <div
                    className={`mb-4 inline-flex p-3 rounded-xl border text-emerald-500 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-emerald-50 border-emerald-100'
                    }`}
                  >
                    <BarChart2 size={20} />
                  </div>
                  <h3
                    className={`text-xl font-semibold font-manrope mb-2 ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Automated Eval
                  </h3>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDark ? 'text-zinc-400' : 'text-slate-600'
                    }`}
                  >
                    Quantify retrieval precision, context recall, and factual faithfulness against benchmark datasets.
                  </p>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 font-bold">
                  Zero Hallucinations
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── WHAT PAPERCHAT CHANGES (Replaces fake reviews with real workflow shifts) ── */}
        <section id="transformation" className="py-24 px-6 border-y border-red-500/10 relative">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <span className="text-xs font-bold uppercase tracking-widest text-[#ef233c] font-mono">
                The Research Paradigm Shift
              </span>
              <h2
                className={`text-4xl md:text-5xl font-semibold font-manrope mt-2 mb-4 tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                What Changes When You Read With PaperChat
              </h2>
              <p
                className={`max-w-2xl mx-auto text-sm sm:text-base font-light ${
                  isDark ? 'text-zinc-400' : 'text-slate-600'
                }`}
              >
                Generic chatbots hallucinate quotes and manual PDF reading wastes days. Here is the concrete transformation PaperChat brings to your literature workflow:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Shift 1 */}
              <div
                className={`p-7 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-[#0d0d0d] border-white/10 hover:border-red-500/30'
                    : 'bg-white border-slate-200 shadow-sm hover:border-red-400/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#ef233c] shrink-0 mt-1">
                    <Target size={18} />
                  </div>
                  <div className="space-y-2">
                    <h3
                      className={`text-lg font-bold font-manrope ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Pinpoint Grounding Instead of Ctrl+F Blind Spots
                    </h3>
                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <p className="text-zinc-500 font-mono">
                        <span className="text-red-400 font-bold">Without PaperChat:</span> Manually skimming 40-page papers, missing nuanced hyperparameter choices and equations hidden in appendices.
                      </p>
                      <p className={isDark ? 'text-zinc-300' : 'text-slate-700'}>
                        <span className="text-emerald-400 font-bold">With PaperChat:</span> Hybrid dense embeddings combined with BM25 keyword matching retrieve the exact formula or setup with mathematical precision in milliseconds.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shift 2 */}
              <div
                className={`p-7 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-[#0d0d0d] border-white/10 hover:border-red-500/30'
                    : 'bg-white border-slate-200 shadow-sm hover:border-red-400/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#ef233c] shrink-0 mt-1">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="space-y-2">
                    <h3
                      className={`text-lg font-bold font-manrope ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Zero Hallucinations with Instant Visual Page Verification
                    </h3>
                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <p className="text-zinc-500 font-mono">
                        <span className="text-red-400 font-bold">Without PaperChat:</span> Chatbots confidently inventing citations, quoting non-existent text, and forcing you to fact-check every sentence.
                      </p>
                      <p className={isDark ? 'text-zinc-300' : 'text-slate-700'}>
                        <span className="text-emerald-400 font-bold">With PaperChat:</span> Every claim is backed by an interactive citation badge that immediately synchronizes the live PDF viewport to that exact page number.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shift 3 */}
              <div
                className={`p-7 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-[#0d0d0d] border-white/10 hover:border-red-500/30'
                    : 'bg-white border-slate-200 shadow-sm hover:border-red-400/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#ef233c] shrink-0 mt-1">
                    <Layers size={18} />
                  </div>
                  <div className="space-y-2">
                    <h3
                      className={`text-lg font-bold font-manrope ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Cross-Corpus Synthesis Across Dozens of Papers
                    </h3>
                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <p className="text-zinc-500 font-mono">
                        <span className="text-red-400 font-bold">Without PaperChat:</span> Chatting with one PDF in a silo, closing it, and trying to remember contrasting findings from three other articles.
                      </p>
                      <p className={isDark ? 'text-zinc-300' : 'text-slate-700'}>
                        <span className="text-emerald-400 font-bold">With PaperChat:</span> Bundle entire libraries into unified corpora. Interrogate conflicting conclusions, compare datasets, and synthesize consensus across all papers at once.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shift 4 */}
              <div
                className={`p-7 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-[#0d0d0d] border-white/10 hover:border-red-500/30'
                    : 'bg-white border-slate-200 shadow-sm hover:border-red-400/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#ef233c] shrink-0 mt-1">
                    <Zap size={18} />
                  </div>
                  <div className="space-y-2">
                    <h3
                      className={`text-lg font-bold font-manrope ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Automated Gap Detection & Research Opportunities
                    </h3>
                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <p className="text-zinc-500 font-mono">
                        <span className="text-red-400 font-bold">Without PaperChat:</span> Manually scouring limitation sections and missing unaddressed contradictions across opposing methodologies.
                      </p>
                      <p className={isDark ? 'text-zinc-300' : 'text-slate-700'}>
                        <span className="text-emerald-400 font-bold">With PaperChat:</span> Automated gap detection maps explicit author limitations alongside inferred cross-literature opportunities to fast-track your next novel publication.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Call To Action ── */}
        <section
          className={`py-28 px-6 text-center border-t relative ${
            isDark ? 'bg-zinc-950/60 border-white/5' : 'bg-slate-100/60 border-slate-200'
          }`}
        >
          <div className="max-w-3xl mx-auto relative z-10">
            <h2
              className={`text-5xl md:text-7xl font-bold font-manrope mb-8 tracking-tighter ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Ready to <span className="text-[#ef233c]">Accelerate</span> Research?
            </h2>
            <p
              className={`text-lg sm:text-xl mb-10 font-light ${
                isDark ? 'text-zinc-400' : 'text-slate-600'
              }`}
            >
              Upload your first arXiv preprint or journal publication and query it in seconds.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
              <Link
                to="/register"
                className="w-full sm:w-auto shiny-cta flex items-center justify-center gap-2 text-white font-bold text-sm tracking-wide"
              >
                <span>Create Free Account</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/login"
                className={`w-full sm:w-auto px-6 py-3 rounded-full border text-sm font-semibold transition-all text-center ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/10'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                }`}
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer
        className={`border-t pt-20 pb-10 relative overflow-hidden ${
          isDark ? 'bg-black border-zinc-900' : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-20 relative z-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-6">
              <div
                className="w-5 h-5 rounded-sm"
                style={{ background: 'var(--accent-red)', transform: 'rotate(45deg)' }}
              />
              <span
                className={`text-2xl font-bold font-manrope tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                PaperChat
              </span>
            </div>
            <p
              className={`max-w-sm text-sm leading-relaxed ${
                isDark ? 'text-zinc-500' : 'text-slate-500'
              }`}
            >
              Empowering researchers, scientists, and students with high-accuracy document intelligence and grounded page citations.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-[#ef233c] uppercase tracking-widest mb-6 font-mono">
              Platform
            </h4>
            <ul
              className={`space-y-3.5 text-sm ${
                isDark ? 'text-zinc-400' : 'text-slate-600'
              }`}
            >
              <li>
                <Link to="/dashboard" className="hover:text-[#ef233c] transition-colors">
                  Library
                </Link>
              </li>
              <li>
                <Link to="/research" className="hover:text-[#ef233c] transition-colors">
                  Workspaces
                </Link>
              </li>
              <li>
                <Link to="/eval" className="hover:text-[#ef233c] transition-colors">
                  Evaluation Suite
                </Link>
              </li>
              <li>
                <Link to="/settings" className="hover:text-[#ef233c] transition-colors">
                  Hyperparameters
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-[#ef233c] uppercase tracking-widest mb-6 font-mono">
              Security & Stack
            </h4>
            <ul
              className={`space-y-3.5 text-sm ${
                isDark ? 'text-zinc-400' : 'text-slate-600'
              }`}
            >
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#ef233c]" /> Local Qdrant Vectors
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#ef233c]" /> JWT Authentication
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#ef233c]" /> SQLite / Postgres Metadata
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#ef233c]" /> 120B Open Source Models
              </li>
            </ul>
          </div>
        </div>

        {/* Large Watermark Typography */}
        <div className="flex justify-center items-center py-6 opacity-20 pointer-events-none select-none">
          <h1 className="text-[14vw] leading-none font-bold font-manrope tracking-tighter text-stroke">
            PAPERCHAT
          </h1>
        </div>

        <div
          className={`max-w-6xl mx-auto px-6 border-t pt-8 flex flex-col sm:flex-row items-center justify-between text-xs tracking-wider ${
            isDark ? 'border-zinc-900 text-zinc-600' : 'border-slate-200 text-slate-500'
          }`}
        >
          <p>&copy; {new Date().getFullYear()} PaperChat AI. Built for researchers.</p>
          <div className="flex gap-6 mt-4 sm:mt-0">
            <span className="hover:text-[#ef233c] cursor-pointer">Privacy Policy</span>
            <span className="hover:text-[#ef233c] cursor-pointer">Terms of Service</span>
            <span className="hover:text-[#ef233c] cursor-pointer">Documentation</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

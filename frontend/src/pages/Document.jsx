import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PdfViewer from '../components/PdfViewer';
import { ArrowLeft, BookOpen } from 'lucide-react';

const Document = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const docId = searchParams.get('doc');

  if (!docId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center" style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
          style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
        >
          <BookOpen size={20} />
        </div>
        <h2 className="text-base font-bold font-manrope mb-1.5" style={{ color: 'var(--text-primary)' }}>No Document Selected</h2>
        <p className="text-xs mb-5 font-light" style={{ color: 'var(--text-muted)' }}>
          Please select an academic paper from your library to view.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 rounded-lg text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
          style={{ background: 'var(--accent-red)' }}
        >
          Return to Library
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col -m-6" style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
      {/* Top Bar */}
      <div
        className="h-14 flex items-center px-4 shrink-0 z-10 justify-between"
        style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeft size={14} />
            <span>Library</span>
          </button>
          <div className="h-4 w-px" style={{ background: 'var(--border-subtle)' }} />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-red)' }} />
            <h2 className="font-semibold text-xs font-manrope" style={{ color: 'var(--text-primary)' }}>
              Academic Reading Viewport
            </h2>
          </div>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 overflow-hidden relative" style={{ background: 'var(--bg-void)' }}>
        <PdfViewer documentId={docId} />
      </div>
    </div>
  );
};

export default Document;

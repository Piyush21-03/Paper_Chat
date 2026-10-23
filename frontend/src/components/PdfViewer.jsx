import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Ensure worker is configured
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const PdfViewer = forwardRef(({ documentId }, ref) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [pendingPage, setPendingPage] = useState(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    goToPage: (num) => {
      const pageIndex = Number(num);
      if (pdfDoc && pageIndex >= 1 && pageIndex <= pdfDoc.numPages) {
        setPageNum(pageIndex);
      } else if (!pdfDoc) {
        // PDF hasn't loaded yet, store the page request
        setPendingPage(pageIndex);
      }
    },
    zoomIn: () => setZoom(z => z + 0.2),
    zoomOut: () => setZoom(z => Math.max(0.5, z - 0.2)),
    currentPage: pageNum,
    totalPages: pdfDoc?.numPages || 0
  }));

  useEffect(() => {
    if (!documentId) {
      setPdfDoc(null);
      return;
    }

    setPdfDoc(null);
    let isMounted = true;
    const loadPdf = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('paperchat-token');
        const url = `/api/documents/${documentId}/file`;
          
        const loadingTask = pdfjsLib.getDocument({
          url,
          httpHeaders: { Authorization: `Bearer ${token}` }
        });
        const doc = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(doc);
          if (pendingPage && pendingPage >= 1 && pendingPage <= doc.numPages) {
            setPageNum(pendingPage);
            setPendingPage(null);
          } else {
            setPageNum(1);
          }
        }
      } catch (err) {
        console.error("PDF Load Error", err);
        if (isMounted) setError('Failed to load PDF');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [documentId]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let renderTask = null;
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: zoom });
        
        const canvas = canvasRef.current;
        if (!canvas) return; // Unmounted during await
        
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error("Render error", err);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, pageNum, zoom]);

  if (!documentId) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--bg-void)' }}>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
          style={{ background: 'var(--accent-red-tint)', border: '1px solid var(--border-red)', color: 'var(--accent-red)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <p className="text-sm font-semibold font-manrope" style={{ color: 'var(--text-primary)' }}>No Document Selected</p>
        <p className="text-xs mt-1 max-w-xs font-light" style={{ color: 'var(--text-muted)' }}>Select a paper from the conversation or upload a PDF to view in full resolution.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col pdf-canvas-container" style={{ background: 'var(--bg-void)' }}>
      {/* PDF Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        {/* Page Nav */}
        <div className="flex items-center gap-1.5">
          <button 
            disabled={pageNum <= 1}
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            className="px-2.5 py-1 disabled:opacity-30 rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Previous Page"
          >
            Prev
          </button>
          <span className="text-xs font-semibold min-w-[4.25rem] text-center font-mono" style={{ color: 'var(--text-secondary)' }}>
            p. {pageNum} / {pdfDoc ? pdfDoc.numPages : '—'}
          </span>
          <button 
            disabled={!pdfDoc || pageNum >= pdfDoc.numPages}
            onClick={() => setPageNum(p => Math.min(pdfDoc?.numPages || p, p + 1))}
            className="px-2.5 py-1 disabled:opacity-30 rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Next Page"
          >
            Next
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => setZoom(z => Math.max(0.6, parseFloat((z - 0.15).toFixed(2))))}
            className="w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Zoom Out"
          >
            -
          </button>
          <span className="text-xs font-medium w-11 text-center font-mono" style={{ color: 'var(--text-secondary)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => setZoom(z => Math.min(2.5, parseFloat((z + 0.15).toFixed(2))))}
            className="w-7 h-7 flex items-center justify-center rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Zoom In"
          >
            +
          </button>
        </div>
      </div>
      
      {/* High-Contrast Canvas Viewport */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto relative flex justify-center p-6 pdf-viewport"
        style={{ background: 'var(--bg-void)' }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs z-10">
            <div
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl shadow-lg text-xs font-medium"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#ef233c] border-t-transparent"></div>
              <span>Rendering Page...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-[#ef233c] text-sm font-medium">
            {error}
          </div>
        )}
        <canvas 
          ref={canvasRef} 
          className="bg-white rounded-xs transition-all shadow-[0_4px_30px_rgba(0,0,0,0.25)]" 
          style={{ 
            maxWidth: 'none',
            display: (loading || error) ? 'none' : 'block'
          }} 
        />
      </div>
    </div>
  );
});

export default PdfViewer;

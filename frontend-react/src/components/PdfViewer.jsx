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
      <div className="h-full flex items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-900">
        Select a document or conversation to view PDF
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-100 dark:bg-slate-950">
      <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2">
          <button 
            disabled={pageNum <= 1}
            onClick={() => setPageNum(p => p - 1)}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 rounded text-sm font-medium transition-colors text-slate-700 dark:text-slate-300"
          >
            Prev
          </button>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400 min-w-[4rem] text-center">
            {pageNum} / {pdfDoc ? pdfDoc.numPages : '?'}
          </span>
          <button 
            disabled={!pdfDoc || pageNum >= pdfDoc.numPages}
            onClick={() => setPageNum(p => p + 1)}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 rounded text-sm font-medium transition-colors text-slate-700 dark:text-slate-300"
          >
            Next
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded text-sm font-medium transition-colors text-slate-700 dark:text-slate-300"
          >
            -
          </button>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => setZoom(z => z + 0.2)}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded text-sm font-medium transition-colors text-slate-700 dark:text-slate-300"
          >
            +
          </button>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto relative flex justify-center p-4 bg-slate-200/50 dark:bg-slate-900/50"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500">
            {error}
          </div>
        )}
        <canvas 
          ref={canvasRef} 
          className="shadow-lg bg-white" 
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

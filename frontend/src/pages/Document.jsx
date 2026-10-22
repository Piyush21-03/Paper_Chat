import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PdfViewer from '../components/PdfViewer';
import { ArrowLeft } from 'lucide-react';

const Document = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const docId = searchParams.get('doc');

  if (!docId) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <h2 className="text-xl font-bold mb-4">No document selected</h2>
        <button 
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Go back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col -m-6 bg-slate-100 dark:bg-slate-950">
      <div className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 shrink-0 shadow-sm z-10">
        <button 
          onClick={() => navigate('/dashboard')}
          className="mr-4 p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <ArrowLeft size={18} />
          <span className="font-medium text-sm">Dashboard</span>
        </button>
        <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-2"></div>
        <h2 className="font-semibold text-slate-800 dark:text-slate-200 ml-2">
          PDF Viewer
        </h2>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <PdfViewer documentId={docId} />
      </div>
    </div>
  );
};

export default Document;

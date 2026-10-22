import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import PdfViewer from '../components/PdfViewer';
import { MessageSquare, Plus, Send, StopCircle, Trash2, ArrowLeft, Loader2, BookOpen } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import toast from 'react-hot-toast';

marked.setOptions({ breaks: true });

const Chat = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initDocId = searchParams.get('doc');

  const [conversations, setConversations] = useState([]);
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeDocId, setActiveDocId] = useState(initDocId || null);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const pdfRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (initDocId && !currentConv) {
      setActiveDocId(initDocId);
    }
  }, [initDocId, currentConv]);

  const loadConversations = async () => {
    try {
      const response = await api.get('/api/conversations');
      if (response.data.success) {
        setConversations(response.data.conversations);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadConversation = async (id) => {
    try {
      const response = await api.get(`/api/conversations/${id}`);
      if (response.data.success) {
        const conv = response.data.conversation;
        setCurrentConv(conv);
        setMessages(conv.messages || []);
        
        // Auto-select document if conversation only has one, or keep current if valid
        if (conv.document_ids?.length === 1) {
          setActiveDocId(conv.document_ids[0]);
        } else if (conv.document_ids?.length > 0 && !conv.document_ids.includes(activeDocId)) {
          setActiveDocId(conv.document_ids[0]);
        } else if (!conv.document_ids || conv.document_ids.length === 0) {
          setActiveDocId(null);
        }
      }
    } catch (err) {
      toast.error('Failed to load conversation');
    }
  };

  const handleNewChat = () => {
    setCurrentConv(null);
    setMessages([]);
    if (initDocId) setActiveDocId(initDocId);
  };

  const handleDeleteConv = async (id) => {
    if (!window.confirm('Delete this conversation?')) return;
    try {
      await api.delete(`/api/conversations/${id}`);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConv?.id === id) {
        handleNewChat();
      }
      toast.success('Conversation deleted');
    } catch (err) {
      toast.error('Failed to delete conversation');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const handleSourceClick = (docId, pageNum) => {
    setActiveDocId(docId);
    if (pageNum && pdfRef.current) {
      // Delay navigation slightly to allow PDF to load if docId changed
      setTimeout(() => {
        pdfRef.current.goToPage(pageNum);
      }, 500);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim() || isStreaming) return;

    const userMsg = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    
    // Placeholder for assistant
    setMessages(prev => [...prev, { role: 'assistant', content: '', sources: null, _streaming: true }]);
    
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      const payload = {
        question: userMsg,
        mode: 'auto'
      };

      if (currentConv) {
        payload.conversation_id = currentConv.id;
      } else if (activeDocId) {
        payload.document_ids = [activeDocId];
      }

      const token = localStorage.getItem('paperchat-token');
      
      const response = await fetch('/ask/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let fullText = '';
      let sources = null;
      let buffer = '';
      let newConvId = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (let line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              
              if (data.type === 'chunk') {
                fullText += data.text;
                setMessages(prev => {
                  const newArr = [...prev];
                  newArr[newArr.length - 1] = { ...newArr[newArr.length - 1], content: fullText };
                  return newArr;
                });
              } else if (data.type === 'sources') {
                sources = data.sources;
                setMessages(prev => {
                  const newArr = [...prev];
                  newArr[newArr.length - 1] = { ...newArr[newArr.length - 1], sources };
                  return newArr;
                });
              } else if (data.type === 'done') {
                if (data.conversation_id && (!currentConv || currentConv.id !== data.conversation_id)) {
                  newConvId = data.conversation_id;
                }
              } else if (data.type === 'error') {
                setMessages(prev => {
                  const newArr = [...prev];
                  newArr[newArr.length - 1] = { ...newArr[newArr.length - 1], content: `Error: ${data.message || 'Server error'}` };
                  return newArr;
                });
              }
            } catch (e) {
              console.warn("SSE Parse Error", dataStr);
            }
          }
        }
      }
      
      // Cleanup streaming flag
      setMessages(prev => {
        const newArr = [...prev];
        const last = newArr[newArr.length - 1];
        delete last._streaming;
        return newArr;
      });

      if (newConvId) {
        await loadConversations();
        await loadConversation(newConvId);
      } else if (currentConv) {
        // Refresh conversation history to get DB IDs for messages
        await loadConversation(currentConv.id);
      }

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Chat error", err);
        setMessages(prev => {
          const newArr = [...prev];
          newArr[newArr.length - 1] = { ...newArr[newArr.length - 1], content: 'Error: Failed to get response.', _streaming: false };
          return newArr;
        });
        toast.error('Failed to get response');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
      
      {/* Sidebar: Conversations */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus size={18} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center p-4 text-sm text-slate-500">No conversations yet</div>
          ) : (
            conversations.map(conv => (
              <div 
                key={conv.id}
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  currentConv?.id === conv.id 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' 
                    : 'hover:bg-slate-200 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                }`}
                onClick={() => loadConversation(conv.id)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare size={16} className="shrink-0 opacity-70" />
                  <span className="truncate text-sm font-medium">{conv.title || 'New Conversation'}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeleteConv(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
        
        {/* Header */}
        <div className="h-14 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 shrink-0 bg-white dark:bg-slate-900">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 truncate">
            {currentConv ? currentConv.title : 'New Chat'}
          </h2>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
              <MessageSquare size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Ask anything about your documents.</p>
              <p className="text-sm mt-2 max-w-md text-center">
                Select a document first or just start typing. PaperChat will find the relevant context.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none border border-slate-200 dark:border-slate-700'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words"
                         dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.content || '')) }} />
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                  
                  {msg._streaming && (
                    <span className="inline-block w-2 h-4 bg-slate-400 dark:bg-slate-500 animate-pulse ml-1 align-middle"></span>
                  )}
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Sources</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.sources.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSourceClick(s.document_id, s.page_number)}
                            className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 rounded text-xs text-slate-600 dark:text-slate-300 transition-colors"
                          >
                            <BookOpen size={12} className="text-blue-500" />
                          <span className="truncate max-w-[150px]">{s.filename || s.document_name || 'Source'}</span>
                            {s.page_number && <span className="opacity-60 text-[10px]">p.{s.page_number}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
          <form onSubmit={handleAsk} className="relative max-w-4xl mx-auto">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk(e);
                }
              }}
              placeholder="Ask a question..."
              className="w-full pl-4 pr-14 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none dark:text-white"
              rows={1}
              style={{ minHeight: '52px', maxHeight: '200px' }}
            />
            {isStreaming ? (
              <button 
                type="button"
                onClick={handleStop}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                title="Stop generation"
              >
                <StopCircle size={20} />
              </button>
            ) : (
              <button 
                type="submit"
                disabled={!question.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:bg-slate-300 dark:disabled:bg-slate-700 transition-colors"
              >
                <Send size={18} />
              </button>
            )}
          </form>
        </div>

      </div>

      {/* Right side: PDF Viewer */}
      <div className="w-1/3 border-l border-slate-200 dark:border-slate-700 hidden lg:block bg-slate-100 dark:bg-slate-950">
        <PdfViewer ref={pdfRef} documentId={activeDocId} />
      </div>

    </div>
  );
};

export default Chat;

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import PdfViewer from '../components/PdfViewer';
import { useTheme } from '../context/ThemeContext';
import { MessageSquare, Plus, Send, StopCircle, Trash2, BookOpen, FileText } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import toast from 'react-hot-toast';

marked.setOptions({ breaks: true });

const Chat = () => {
  const [searchParams] = useSearchParams();
  const initDocId = searchParams.get('doc');
  const { isDark } = useTheme();

  const [conversations, setConversations] = useState([]);
  const [currentConv, setCurrentConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeDocId, setActiveDocId] = useState(initDocId || null);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const pdfRef = useRef(null);

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

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (initDocId && !currentConv) {
      setActiveDocId(initDocId);
    }
  }, [initDocId, currentConv]);

  const loadConversation = async (id) => {
    try {
      const response = await api.get(`/api/conversations/${id}`);
      if (response.data.success) {
        const conv = response.data.conversation;
        setCurrentConv(conv);
        setMessages(conv.messages || []);
        
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
      setTimeout(() => {
        pdfRef.current.goToPage(pageNum);
      }, 350);
    }
  };

  const renderMessageContent = (content) => {
    if (!content) return '';
    const rawHtml = marked.parse(content);
    const badgeHtml = rawHtml.replace(
      /\[(?:Page|p\.|pp\.)\s*(\d+)\]/gi,
      '<button type="button" class="citation-badge" data-page="$1" title="Jump to Page $1">📄 Page $1</button>'
    );
    return DOMPurify.sanitize(badgeHtml, {
      ADD_TAGS: ['button'],
      ADD_ATTR: ['data-page', 'target', 'title', 'class']
    });
  };

  const handleMessageContainerClick = (e) => {
    const badge = e.target.closest('[data-page]');
    if (badge) {
      e.preventDefault();
      const p = parseInt(badge.getAttribute('data-page'), 10);
      if (!isNaN(p) && pdfRef.current) {
        pdfRef.current.goToPage(p);
        toast.success(`Jumped to Page ${p}`);
      }
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim() || isStreaming) return;

    const userMsg = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '', sources: null, _streaming: true }]);
    
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      const payload = { question: userMsg, mode: 'auto' };

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

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
        const lines = buffer.split('\n');
        buffer = lines.pop();

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

  /* ── Shared glassmorphism styles ── */
  const glassPanel = isDark ? {
    background: 'rgba(10,10,12,0.72)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(239,35,60,0.12)',
  } : {
    background: 'rgba(255,255,255,0.75)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(239,35,60,0.15)',
  };

  const glassSurface = isDark ? {
    background: 'rgba(15,15,18,0.65)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  } : {
    background: 'rgba(255,255,255,0.80)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  };

  return (
    <div
      className="flex h-[calc(100vh-4rem)] -m-6 relative overflow-hidden"
      style={{ borderTop: '1px solid rgba(239,35,60,0.1)' }}
    >
      {/* ── Background layer (dark: deep gradient + glows; light: soft) ── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {isDark ? (
          <>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(160deg, #180507 0%, #0a0a0c 50%, #000000 100%)',
            }} />
            {/* Primary glow — top center */}
            <div style={{
              position: 'absolute', top: '-15%', left: '30%', width: '55%', height: '55%',
              background: 'radial-gradient(ellipse, rgba(239,35,60,0.09) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }} />
            {/* Secondary glow — bottom right */}
            <div style={{
              position: 'absolute', bottom: '-10%', right: '-5%', width: '40%', height: '40%',
              background: 'radial-gradient(ellipse, rgba(185,28,28,0.07) 0%, transparent 65%)',
              filter: 'blur(50px)',
            }} />
            {/* Subtle grid */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 40%, transparent 100%)',
              WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black 40%, transparent 100%)',
            }} />
          </>
        ) : (
          <>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(160deg, #fff5f5 0%, #ffffff 50%, #f8fafc 100%)',
            }} />
            <div style={{
              position: 'absolute', top: '-10%', left: '20%', width: '60%', height: '50%',
              background: 'radial-gradient(ellipse, rgba(239,35,60,0.06) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }} />
          </>
        )}
      </div>

      {/* ── Sidebar: Conversations ── */}
      <div
        className="w-64 flex flex-col hidden md:flex shrink-0 relative z-10"
        style={glassPanel}
      >
        <div className="p-3.5" style={{ borderBottom: '1px solid rgba(239,35,60,0.12)' }}>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-all"
            style={{
              background: 'linear-gradient(135deg, #ef233c, #d90429)',
              boxShadow: '0 4px 15px rgba(239,35,60,0.35)',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(239,35,60,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 15px rgba(239,35,60,0.35)'}
          >
            <Plus size={16} strokeWidth={2.2} /> New Query
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-red)' }}>
            Recent Inquiries
          </div>
          {conversations.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              No past conversations yet
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className="group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all"
                style={currentConv?.id === conv.id ? {
                  background: 'rgba(239,35,60,0.12)',
                  color: 'var(--accent-red)',
                  border: '1px solid rgba(239,35,60,0.25)',
                  fontWeight: 600,
                  boxShadow: '0 2px 12px rgba(239,35,60,0.1)',
                } : {
                  color: 'var(--text-secondary)',
                  border: '1px solid transparent',
                }}
                onClick={() => loadConversation(conv.id)}
                onMouseEnter={e => {
                  if (currentConv?.id !== conv.id) {
                    e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
                    e.currentTarget.style.border = '1px solid rgba(239,35,60,0.1)';
                  }
                }}
                onMouseLeave={e => {
                  if (currentConv?.id !== conv.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.border = '1px solid transparent';
                  }
                }}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare size={15} className="shrink-0" style={{ color: currentConv?.id === conv.id ? 'var(--accent-red)' : 'var(--text-muted)' }} />
                  <span className="truncate text-xs">{conv.title || 'Untitled Query'}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteConv(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 transition-all rounded"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Center: Interactive Chat Panel ── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        
        {/* Header */}
        <div
          className="h-14 flex items-center justify-between px-5 shrink-0"
          style={{
            borderBottom: '1px solid rgba(239,35,60,0.12)',
            ...glassSurface,
          }}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <h2 className="text-sm font-semibold truncate font-manrope" style={{ color: 'var(--text-primary)' }}>
              {currentConv ? currentConv.title : 'Scholarly Reader & QA'}
            </h2>
          </div>
          {activeDocId && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
              style={{
                background: 'rgba(239,35,60,0.1)',
                border: '1px solid rgba(239,35,60,0.25)',
                color: 'var(--accent-red)',
                boxShadow: '0 0 10px rgba(239,35,60,0.1)',
              }}
            >
              <FileText size={12} />
              <span>Context Linked</span>
            </div>
          )}
        </div>

        {/* Message Feed */}
        <div
          onClick={handleMessageContainerClick}
          className="flex-1 overflow-y-auto p-5 space-y-5"
          style={{ background: 'transparent' }}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              {/* Central glow */}
              <div className="relative mb-4">
                <div style={{
                  position: 'absolute', inset: '-20px',
                  background: 'radial-gradient(ellipse, rgba(239,35,60,0.12) 0%, transparent 70%)',
                  filter: 'blur(20px)',
                  pointerEvents: 'none',
                }} />
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
                  style={{
                    background: isDark ? 'rgba(239,35,60,0.12)' : 'rgba(239,35,60,0.08)',
                    border: '1px solid rgba(239,35,60,0.25)',
                    color: 'var(--accent-red)',
                    boxShadow: '0 4px 20px rgba(239,35,60,0.15)',
                  }}
                >
                  <BookOpen size={24} strokeWidth={2} />
                </div>
              </div>
              <h3 className="text-lg font-bold font-manrope" style={{ color: 'var(--text-primary)' }}>Document Inquiry</h3>
              <p className="text-xs mt-2 max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Pose specific technical questions or request syntheses. Citations will link directly to exact document pages.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: isDark ? 'rgba(239,35,60,0.1)' : 'rgba(239,35,60,0.06)',
                      color: 'var(--text-primary)',
                      border: '1px solid rgba(239,35,60,0.2)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                    }}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ) : (
                  /* Assistant Card — glassmorphic */
                  <div
                    className="max-w-[92%] rounded-2xl px-5 py-4"
                    style={{
                      background: isDark ? 'rgba(15,15,18,0.70)' : 'rgba(255,255,255,0.80)',
                      border: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.08)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      boxShadow: isDark
                        ? '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)'
                        : '0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
                    }}
                  >
                    <div
                      className="academic-prose"
                      dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content || '') }}
                    />
                    
                    {msg._streaming && (
                      <span className="inline-block w-2 h-4 animate-pulse ml-1 align-middle rounded-xs" style={{ background: 'var(--accent-red)' }}></span>
                    )}
                    
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(239,35,60,0.12)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-red)' }}>
                          Evidence & Citations
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {msg.sources.map((s, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSourceClick(s.document_id, s.page_number)}
                              className="citation-badge"
                              title={`Jump to ${s.filename || 'source'} Page ${s.page_number || ''}`}
                            >
                              <BookOpen size={11} />
                              <span className="truncate max-w-[160px]">{s.filename || s.document_name || 'Source'}</span>
                              {s.page_number && (
                                <span className="font-mono text-[10px] opacity-85 ml-0.5">p.{s.page_number}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar — glassmorphic */}
        <div
          className="p-4 shrink-0"
          style={{
            borderTop: '1px solid rgba(239,35,60,0.12)',
            ...glassSurface,
          }}
        >
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
              placeholder="Query paper findings, methodology, formulas, or conclusions..."
              className="w-full pl-4 pr-14 py-3 rounded-xl text-sm focus:outline-none transition-all resize-none leading-relaxed"
              style={{
                minHeight: '52px',
                maxHeight: '180px',
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(239,35,60,0.15)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(239,35,60,0.5)';
                e.target.style.boxShadow = '0 0 0 3px rgba(239,35,60,0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(239,35,60,0.15)';
                e.target.style.boxShadow = 'none';
              }}
              rows={1}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors"
                style={{ color: 'var(--accent-red)' }}
                title="Halt Generation"
              >
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!question.trim()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 text-white rounded-lg disabled:opacity-30 transition-all cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #ef233c, #d90429)',
                  boxShadow: question.trim() ? '0 2px 10px rgba(239,35,60,0.4)' : 'none',
                }}
                title="Send Inquiry"
              >
                <Send size={16} />
              </button>
            )}
          </form>
          <div className="text-[11px] text-center mt-2 font-medium" style={{ color: 'var(--text-muted)' }}>
            Responses extract verified passages with grounded citations.
          </div>
        </div>
      </div>

      {/* ── Right: PDF Viewer ── */}
      <div
        className="w-1/2 hidden lg:block relative z-10"
        style={{
          borderLeft: '1px solid rgba(239,35,60,0.12)',
          background: isDark ? 'rgba(5,5,8,0.85)' : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <PdfViewer ref={pdfRef} documentId={activeDocId} />
      </div>
    </div>
  );
};

export default Chat;

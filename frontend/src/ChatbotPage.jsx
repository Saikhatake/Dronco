import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send, Bot, User, Plus, Trash2, Brain, MessageSquare,
  Edit2, Check, X, Sparkles, Clock, AlertCircle, Menu, RefreshCw
} from 'lucide-react';

import { API_URL } from "./utils/api";

const SUGGESTED = [
  "What do my latest biomarkers mean?",
  "Explain my risk level simply",
  "What lifestyle changes help most?",
  "What is HOMA-IR?",
  "How does high glucose affect risk?",
  "What should I ask my doctor?",
];

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('access_token')}` };
}

function TypingDots() {
  return (
    <div className="flex items-start space-x-3">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex space-x-1 items-center h-4">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
              style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
        isUser
          ? 'bg-gradient-to-br from-blue-400 to-blue-600'
          : 'bg-gradient-to-br from-pink-500 to-purple-600'
      }`}>
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>

      <div className={`max-w-[76%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? 'bg-gradient-to-br from-pink-600 to-purple-600 text-white rounded-br-sm'
            : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm'
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <ReactMarkdown
              components={{
                p:      ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
                em:     ({ node, ...props }) => <em className="italic text-gray-700" {...props} />,
                ul:     ({ node, ...props }) => <ul className="list-disc list-outside pl-4 space-y-1 my-2" {...props} />,
                ol:     ({ node, ...props }) => <ol className="list-decimal list-outside pl-4 space-y-1 my-2" {...props} />,
                li:     ({ node, ...props }) => <li className="text-gray-700 leading-relaxed" {...props} />,
                h1:     ({ node, ...props }) => <h1 className="text-base font-bold text-gray-900 mt-3 mb-1 border-b border-gray-100 pb-1" {...props} />,
                h2:     ({ node, ...props }) => <h2 className="text-sm font-bold text-gray-900 mt-3 mb-1" {...props} />,
                h3:     ({ node, ...props }) => <h3 className="text-sm font-semibold text-purple-700 mt-2 mb-0.5" {...props} />,
                code:   ({ node, inline, ...props }) =>
                  inline
                    ? <code className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono" {...props} />
                    : <code className="block bg-gray-50 text-gray-800 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-4 border-purple-300 pl-3 my-2 text-gray-600 italic" {...props} />
                ),
                hr: ({ node, ...props }) => <hr className="border-gray-200 my-3" {...props} />,
                a:  ({ node, ...props }) => <a className="text-purple-600 underline hover:text-purple-800" target="_blank" rel="noreferrer" {...props} />,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
        {msg.timestamp && (
          <p className="text-[10px] text-gray-400 mt-0.5 px-1">
            {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

function SessionItem({ session, active, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const confirmRename = () => {
    if (title.trim()) onRename(session.session_id, title.trim());
    setEditing(false);
  };

  const lastMsg = session.messages?.[0];
  const preview = lastMsg?.content
    ? (lastMsg.content.length > 52 ? lastMsg.content.slice(0, 49) + '...' : lastMsg.content)
    : 'No messages yet';

  return (
    <div
      onClick={() => !editing && onSelect(session.session_id)}
      className={`group flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
        active
          ? 'bg-gradient-to-r from-pink-50 to-purple-50 border border-purple-200'
          : 'hover:bg-gray-50 border border-transparent'
      }`}
    >
      <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? 'text-purple-600' : 'text-gray-400'}`} />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditing(false); }}
              className="flex-1 text-xs border border-purple-300 rounded px-1.5 py-0.5 outline-none" />
            <button onClick={confirmRename} className="text-green-600"><Check className="w-3 h-3" /></button>
            <button onClick={() => setEditing(false)} className="text-gray-400"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <p className={`text-xs font-semibold truncate ${active ? 'text-purple-800' : 'text-gray-700'}`}>
            {session.title || 'New Conversation'}
          </p>
        )}
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{preview}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-gray-300 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />{timeAgo(session.last_active)}
          </span>
          {session.message_count > 0 && (
            <span className="text-[10px] text-gray-300">{session.message_count} msgs</span>
          )}
        </div>
      </div>
      {!editing && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
          onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditing(true)}
            className="p-1 rounded hover:bg-purple-100 text-gray-400 hover:text-purple-600 transition">
            <Edit2 className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(session.session_id)}
            className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatbotPage() {
  const [sessions, setSessions]               = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession]     = useState(null);
  const [messages, setMessages]               = useState([]);
  const [input, setInput]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingSession, setLoadingSession]   = useState(false);
  const [sidebarOpen, setSidebarOpen]         = useState(true);
  const [stats, setStats]                     = useState(null);
  const [error, setError]                     = useState('');
  const [deleteConfirm, setDeleteConfirm]     = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { fetchSessions(); }, []);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res  = await fetch(`${API_URL}/api/chat/sessions`, { headers: authHeader() });
      const data = await res.json();
      if (res.ok) { setSessions(data.sessions || []); setStats(data.stats); }
    } catch (e) {}
    finally { setLoadingSessions(false); }
  };

  const loadSession = async (sessionId) => {
    if (activeSessionId === sessionId) return;
    setLoadingSession(true);
    setActiveSessionId(sessionId);
    setMessages([]);
    setError('');
    try {
      const res  = await fetch(`${API_URL}/api/chat/sessions/${sessionId}`, { headers: authHeader() });
      const data = await res.json();
      if (res.ok) { setActiveSession(data.session); setMessages(data.session.messages || []); }
    } catch (e) { setError('Failed to load session.'); }
    finally { setLoadingSession(false); }
  };

  const createNewSession = async () => {
    try {
      const res  = await fetch(`${API_URL}/api/chat/sessions`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (res.ok) {
        setSessions(prev => [data.session, ...prev]);
        setActiveSessionId(data.session.session_id);
        setActiveSession(data.session);
        setMessages([]);
        setError('');
      }
    } catch (e) { setError('Failed to create session.'); }
  };

  const deleteSession = async (sessionId) => {
    try {
      await fetch(`${API_URL}/api/chat/sessions/${sessionId}`, { method: 'DELETE', headers: authHeader() });
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      if (activeSessionId === sessionId) { setActiveSessionId(null); setActiveSession(null); setMessages([]); }
      setDeleteConfirm(null);
    } catch (e) { setError('Failed to delete session.'); }
  };

  const renameSession = async (sessionId, newTitle) => {
    try {
      await fetch(`${API_URL}/api/chat/sessions/${sessionId}/rename`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      setSessions(prev => prev.map(s => s.session_id === sessionId ? { ...s, title: newTitle } : s));
    } catch (e) {}
  };

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading || !activeSessionId) return;

    setMessages(prev => [...prev, { role: 'user', content: userText, timestamp: new Date().toISOString() }]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/chat/message`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, session_id: activeSessionId }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() }]);
        if (data.session_title) {
          setSessions(prev => prev.map(s =>
            s.session_id === activeSessionId
              ? { ...s, title: data.session_title, message_count: data.message_count, last_active: new Date().toISOString() }
              : s
          ));
        }
      } else {
        setError(data.detail || 'Something went wrong.');
      }
    } catch (e) {
      setError('Connection error. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-xl hover:bg-gray-100 transition text-gray-500">
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Dr. Onco AI</h1>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            LangChain · Session Memory · MongoDB
          </p>
        </div>
        {stats && (
          <div className="ml-auto hidden md:flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />{stats.total_sessions} sessions
            </span>
            <span className="flex items-center gap-1">
              <Brain className="w-3.5 h-3.5" />{stats.total_messages} messages
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-4 h-[600px]">

        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <div className="w-64 flex-shrink-0 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <button onClick={createNewSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm">
                <Plus className="w-4 h-4" /> New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loadingSessions ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 px-3">
                  <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No sessions yet.<br />Click New Chat to start.</p>
                </div>
              ) : sessions.map(s => (
                <SessionItem key={s.session_id} session={s} active={s.session_id === activeSessionId}
                  onSelect={loadSession} onDelete={id => setDeleteConfirm(id)} onRename={renameSession} />
              ))}
            </div>
            {deleteConfirm && (
              <div className="p-3 border-t border-red-100 bg-red-50 text-xs">
                <p className="text-red-700 font-medium mb-2">Delete this session permanently?</p>
                <div className="flex gap-2">
                  <button onClick={() => deleteSession(deleteConfirm)}
                    className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-xs">Delete</button>
                  <button onClick={() => setDeleteConfirm(null)}
                    className="flex-1 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Chat Window ── */}
        <div className="flex-1 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">

          {/* No session selected */}
          {!activeSessionId && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center shadow-lg mb-4">
                <Bot className="w-9 h-9 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Dr. Onco AI Assistant</h2>
              <p className="text-gray-400 text-sm max-w-sm mb-6">
                Each conversation is a separate session saved in MongoDB. Select one or start a new chat.
              </p>
              <button onClick={createNewSession}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition shadow-md">
                <Plus className="w-4 h-4" /> Start New Chat
              </button>
            </div>
          )}

          {/* Loading session */}
          {activeSessionId && loadingSession && (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-7 h-7 text-purple-400 animate-spin" />
            </div>
          )}

          {/* Active session */}
          {activeSessionId && !loadingSession && (
            <>
              {/* Session title bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-pink-50 to-purple-50">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-semibold text-gray-700">
                    {activeSession?.title || 'New Conversation'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {activeSession?.summary && (
                    <span className="flex items-center gap-1 bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                      <Brain className="w-3 h-3" /> Memory compressed
                    </span>
                  )}
                  <span>{messages.length} messages</span>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-slate-50 to-white">
                {messages.length === 0 && (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm max-w-[80%]">
                        <p className="text-sm text-gray-800 leading-relaxed">
                          Hello! I'm <strong>Dr. Onco AI</strong> 👩‍⚕️ — This is a fresh session with its own memory.
                          I have access to your latest predictions and reports. What would you like to know?
                        </p>
                      </div>
                    </div>
                    <div className="pl-11">
                      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Try asking:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {SUGGESTED.map((q, i) => (
                          <button key={i} onClick={() => sendMessage(q)}
                            className="text-xs px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-full hover:bg-purple-50 transition shadow-sm">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
                {loading && <TypingDots />}

                {error && (
                  <div className="flex justify-center">
                    <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-4 py-2 flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="px-4 py-3 border-t border-gray-100 bg-white">
                <div className="flex items-end gap-3">
                  <textarea ref={textareaRef} value={input}
                    onChange={handleInputChange} onKeyDown={handleKeyDown}
                    placeholder="Ask about your results, biomarkers, or health tips..."
                    rows={1}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400 outline-none resize-none text-sm transition"
                    style={{ minHeight: '46px', maxHeight: '120px' }} />
                  <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
                    className="w-11 h-11 bg-gradient-to-br from-pink-600 to-purple-600 text-white rounded-xl flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 shadow-md flex-shrink-0">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-gray-300 text-center mt-2">
                  ⚠️ AI only — consult a doctor for medical decisions
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

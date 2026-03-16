'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { apiFetch } from '../lib/api';

interface Message {
    role: 'user' | 'model';
    text: string;
}

export default function ProjectCoachChat({ projectId }: { projectId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsLoading(true);

        try {
            const response = await apiFetch(`/projects/${projectId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMsg,
                    history: messages.map(m => ({
                        role: m.role,
                        parts: [{ text: m.text }]
                    }))
                })
            });

            if (!response.ok) throw new Error('Failed to send message');

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No reader available');

            let assistantMsg = '';
            setMessages(prev => [...prev, { role: 'model', text: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = new TextDecoder().decode(value);
                assistantMsg += chunk;
                
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    const others = prev.slice(0, -1);
                    return [...others, { ...last, text: assistantMsg }];
                });
            }
        } catch (err) {
            console.error('Chat error:', err);
            setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please try again.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-8 right-8 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all z-50 animate-in fade-in duration-500 ${
                    isOpen ? 'bg-white text-neutral-900 rotate-90 border border-neutral-200' : 'bg-google-blue text-white hover:scale-110 active:scale-95'
                }`}
            >
                {isOpen ? <X className="w-8 h-8" /> : <MessageSquare className="w-8 h-8" />}
                {!isOpen && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-google-blue opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-google-blue border-2 border-white"></span>
                    </span>
                )}
            </button>

            {/* Chat Panel */}
            <div className={`fixed bottom-32 right-8 w-96 max-w-[calc(100vw-4rem)] bg-white rounded-3xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden transition-all duration-300 transform z-50 ${
                isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95 pointer-events-none'
            } h-[600px] max-h-[calc(100vh-12rem)]`}>
                
                {/* Header */}
                <div className="bg-neutral-900 p-6 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-google-blue to-purple-600 rounded-xl flex items-center justify-center">
                            <Bot className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="font-black text-sm tracking-tight">Project Coach</h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 bg-google-green rounded-full animate-pulse"></span>
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Active Insight</span>
                            </div>
                        </div>
                    </div>
                    <Sparkles className="w-5 h-5 text-google-yellow opacity-50" />
                </div>

                {/* Messages Area */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 bg-neutral-50/30 scroll-smooth"
                >
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-neutral-100 mb-4">
                                <Sparkles className="w-8 h-8 text-google-blue" />
                            </div>
                            <h4 className="text-sm font-black text-neutral-900 mb-2">How can I help you today?</h4>
                            <p className="text-xs text-neutral-400 leading-relaxed">
                                I have access to your slides, notes, and past session reports. Ask me anything about your pitch strategy or content.
                            </p>
                            <div className="grid grid-cols-1 gap-2 mt-8 w-full">
                                {["Review my slides", "How was my last session?", "Help me with the intro"].map(suggestion => (
                                    <button
                                        key={suggestion}
                                        onClick={() => {
                                            setInput(suggestion);
                                            // Optional: automatically send
                                        }}
                                        className="px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-[10px] font-bold text-neutral-600 hover:border-google-blue hover:text-google-blue transition-all"
                                    >
                                        "{suggestion}"
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center shadow-sm border ${
                                    m.role === 'user' ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800'
                                }`}>
                                    {m.role === 'user' ? <User className="w-4 h-4 text-neutral-400" /> : <Bot className="w-4 h-4 text-white" />}
                                </div>
                                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                                    m.role === 'user' ? 'bg-google-blue text-white font-medium shadow-lg shadow-google-blue/10' : 'bg-white border border-neutral-200 text-neutral-700 shadow-sm'
                                } prose prose-sm max-w-none`}>
                                    {m.text ? (
                                        <ReactMarkdown 
                                            components={{
                                                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                                ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                                ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                                                li: ({node, ...props}) => <li className="mb-1" {...props} />,
                                                strong: ({node, ...props}) => <strong className="font-black" {...props} />,
                                                code: ({node, ...props}) => <code className="bg-neutral-100 px-1 rounded text-xs font-mono" {...props} />
                                            }}
                                        >
                                            {m.text}
                                        </ReactMarkdown>
                                    ) : (isLoading && i === messages.length - 1 ? (
                                        <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                                    ) : '')}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Input Area */}
                <div className="p-6 bg-white border-t border-neutral-100">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="Type a message..."
                            className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-3 pl-4 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-google-blue/20 focus:border-google-blue transition-all resize-none h-12 no-scrollbar"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className={`absolute right-2 top-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                !input.trim() || isLoading ? 'bg-neutral-100 text-neutral-300' : 'bg-google-blue text-white shadow-lg shadow-google-blue/20 hover:scale-105 active:scale-95'
                            }`}
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

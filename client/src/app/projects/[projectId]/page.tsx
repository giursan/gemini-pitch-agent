'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    ChevronLeft,
    Upload,
    FileText,
    Video,
    CheckCircle2,
    Circle,
    Trash2,
    Calendar,
    Clock,
    Trophy,
    ArrowRight,
    Search,
    Check,
    Sparkles,
    ChevronRight,
    Plus,
    ChevronDown,
    ChevronUp,
    Loader2,
    AlertCircle,
    X,
    Folder,
    Target,
    Download
} from 'lucide-react';
import ProjectCoachChat from '../../ProjectCoachChat';

// Aura Logo path: /images/aura-ai-logo-dark.svg

interface Project {
    projectId: string;
    title: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    sessionCount: number;
    latestScore: number | null;
    bestScore: number | null;
}

interface Material {
    materialId: string;
    filename: string;
    mimeType: string;
    extractedText: string;
    uploadedAt: number;
    sizeBytes: number;
    previewUrl?: string;
}

interface ImprovementTask {
    taskId: string;
    description: string;
    category: string;
    status: 'open' | 'improved' | 'dismissed';
    createdAt: number;
}

interface Session {
    sessionId: string;
    startedAt: number;
    durationMs: number;
    overallScore: number;
    title: string;
}

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.projectId as string;

    const [project, setProject] = useState<Project | null>(null);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [tasks, setTasks] = useState<ImprovementTask[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedReport, setSelectedReport] = useState<Record<string, any> | null>(null);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'materials'>('dashboard');

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (projectId) {
            fetchData();
        }
    }, [projectId]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [projRes, matRes, taskRes, sessRes] = await Promise.all([
                fetch(`http://localhost:8080/projects/${projectId}`),
                fetch(`http://localhost:8080/projects/${projectId}/materials`),
                fetch(`http://localhost:8080/projects/${projectId}/tasks`),
                fetch(`http://localhost:8080/projects/${projectId}/sessions`)
            ]);

            if (projRes.ok) setProject(await projRes.json());
            if (matRes.ok) setMaterials(await matRes.json());
            if (taskRes.ok) setTasks(await taskRes.json());
            if (sessRes.ok) setSessions(await sessRes.json());
        } catch (err) {
            console.error('Failed to fetch project data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const viewReport = async (sessionId: string) => {
        try {
            const res = await fetch(`http://localhost:8080/projects/${projectId}/sessions/${sessionId}`);
            const data = await res.json();
            setSelectedReport(data);
        } catch (err) {
            console.error('Failed to fetch session report:', err);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`http://localhost:8080/projects/${projectId}/materials`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const newMaterial = await res.json();
                setMaterials(prev => [newMaterial, ...prev]);
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDownloadMaterial = (material: any) => {
        if (!material.previewUrl && !material.filename) return;
        
        // If we have a previewUrl (base64 thumbnail) we use that for demo/small image download
        // In a real app, this would be a signed URL to the original file in storage
        const link = document.createElement('a');
        link.href = material.previewUrl || '#';
        link.download = material.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeleteMaterial = async (materialId: string) => {
        if (!confirm('Delete this material?')) return;
        try {
            const res = await fetch(`http://localhost:8080/projects/${projectId}/materials/${materialId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setMaterials(prev => prev.filter(m => m.materialId !== materialId));
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!confirm('Delete this session and all its data? This cannot be undone.')) return;
        try {
            const res = await fetch(`http://localhost:8080/projects/${projectId}/sessions/${sessionId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
                // Optionally update project summary stats
                if (project) {
                    setProject({
                        ...project,
                        sessionCount: Math.max(0, project.sessionCount - 1)
                    });
                }
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handleTaskStatusChange = async (taskId: string, newStatus: 'improved' | 'dismissed' | 'open') => {
        try {
            const res = await fetch(`http://localhost:8080/projects/${projectId}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (res.ok) {
                setTasks(prev => prev.map(t =>
                    t.taskId === taskId ? { ...t, status: newStatus } : t
                ));
            }
        } catch (err) {
            console.error('Task update failed:', err);
        }
    };

    const formatBytes = (bytes: number, decimals: number = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const formatDuration = (ms: number) => {
        const totalSeconds = Math.max(0, Math.round(ms / 1000));
        // Handle legacy bugged data where durationMs was mistakenly saved as a timestamp
        if (totalSeconds > 1000000) return '0min, 0sec';

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h, ${minutes}min, ${seconds}sec`;
        }
        return `${minutes}min, ${seconds}sec`;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center gap-6">
                <div className="relative">
                    <div className="absolute inset-0 bg-neutral-900/10 blur-2xl rounded-full scale-150 animate-pulse"></div>
                    <img 
                        src="/images/aura-ai-logo-dark.svg" 
                        alt="Aura Logo" 
                        className="w-20 h-20 rounded-2xl shadow-xl relative z-10 animate-pulse" 
                    />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-900 ml-1">Distilling Intelligence</span>
                    <div className="w-48 h-1 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="w-1/3 h-full bg-neutral-900 rounded-full animate-[loading_1.5s_infinite_ease-in-out]"></div>
                    </div>
                </div>
                <style jsx>{`
                    @keyframes loading {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(200%); }
                    }
                `}</style>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] p-8 flex flex-col items-center justify-center">
                <AlertCircle className="w-16 h-16 text-neutral-300 mb-4" />
                <h2 className="text-xl font-bold text-neutral-900">Project not found</h2>
                <Link href="/projects" className="text-google-blue font-bold mt-4 hover:underline">Back to Projects</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-20">
            {/* Project Header Area */}
            <div className="bg-white border-b border-neutral-200 pt-10 pb-12 shadow-sm">
                <div className="max-w-6xl mx-auto px-8">
                    <nav className="flex items-center gap-3 text-neutral-400 mb-8">
                        <Link href="/projects" className="flex items-center gap-2.5 hover:text-neutral-900 transition-colors group">
                            <img 
                                src="/images/aura-ai-logo-dark.svg" 
                                alt="Aura Logo" 
                                className="w-5 h-5 rounded-md opacity-80 group-hover:opacity-100 transition-opacity" 
                            />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 group-hover:text-neutral-900">Aura</span>
                        </Link>
                        <ChevronRight className="w-3 h-3 opacity-30" />
                        <Link href="/projects" className="text-[10px] font-black uppercase tracking-widest hover:text-neutral-900 flex items-center gap-1 transition-colors pt-0.5">
                            Projects
                        </Link>
                    </nav>

                    <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                        <div className="flex-1">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-xl overflow-hidden shadow-xl shadow-neutral-900/10 border border-neutral-800 relative group shrink-0">
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none"></div>
                                    <img 
                                        src="/images/aura-ai-logo-dark.svg" 
                                        alt="Aura Logo" 
                                        className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-500" 
                                    />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-black text-neutral-900 tracking-tight">{project.title}</h1>
                                    <p className="text-neutral-500 mt-1 max-w-2xl">{project.description || 'Manage your pitch preparation materials and practice sessions.'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="bg-neutral-50 border border-neutral-200 rounded-[24px] p-4 flex flex-col items-center min-w-[100px]">
                                <span className="text-[10px] font-black uppercase text-neutral-400 mb-1">Sessions</span>
                                <span className="text-2xl font-black text-neutral-600 leading-none">{project.sessionCount}</span>
                            </div>
                            <div className={`${project.bestScore ? (project.bestScore >= 80 ? 'bg-google-green/5 border-google-green/10' : project.bestScore >= 60 ? 'bg-google-blue/5 border-google-blue/10' : 'bg-google-red/5 border-google-red/10') : 'bg-neutral-50 border-neutral-200'} rounded-xl p-4 flex flex-col items-center min-w-[100px] transition-colors border`}>
                                <span className={`text-[10px] font-black uppercase mb-1 ${project.bestScore ? (project.bestScore >= 80 ? 'text-google-green' : project.bestScore >= 60 ? 'text-google-blue' : 'text-google-red') : 'text-neutral-400'}`}>Best Score</span>
                                <span className={`text-2xl font-black leading-none ${project.bestScore ? (project.bestScore >= 80 ? 'text-google-green' : project.bestScore >= 60 ? 'text-google-blue' : 'text-google-red') : 'text-neutral-900'}`}>{project.bestScore || '—'}</span>
                            </div>
                            <Link
                                href={`/practice?projectId=${projectId}`}
                                className="h-14 flex items-center gap-3 px-8 bg-neutral-900 text-white rounded-2xl text-sm font-black shadow-xl shadow-neutral-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all ml-2"
                            >
                                <Video className="w-5 h-5" />
                                START PRACTICE
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-8 mt-10">
                {/* Tabs */}
                <div className="flex border-b border-neutral-200 mb-10 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-8 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all min-w-fit ${activeTab === 'dashboard' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                    >
                        Overview Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('materials')}
                        className={`px-8 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all min-w-fit ${activeTab === 'materials' ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                    >
                        Context Materials ({materials.length})
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Primary Column: Sessions */}
                        <div className="lg:col-span-12 xl:col-span-8">
                            <div className="flex items-center justify-between h-8 mb-2">
                                <h3 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] flex items-center gap-2">
                                    <Video className="w-3.5 h-3.5 text-neutral-900" /> Practice sessions
                                </h3>
                                {sessions.length > 0 && (
                                    <span className="text-[10px] font-bold text-neutral-400">{sessions.length} RECORDED</span>
                                )}
                            </div>

                            {sessions.length === 0 ? (
                                <div className="bg-white rounded-[32px] border border-neutral-200 p-16 text-center shadow-sm">
                                    <Video className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
                                    <h3 className="text-lg font-bold text-neutral-900 mb-1">No sessions yet</h3>
                                    <p className="text-sm text-neutral-400 mb-8">Click "Start Practice" to begin your first session for this project.</p>
                                    <Link
                                        href={`/practice?projectId=${projectId}`}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-neutral-900 text-white rounded-xl text-xs font-black hover:bg-neutral-800 transition-colors"
                                    >
                                        NEW PRACTICE
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {sessions.map(session => (
                                        <div
                                            key={session.sessionId}
                                            onClick={() => viewReport(session.sessionId)}
                                            className="bg-white/60 backdrop-blur-sm rounded-xl border border-neutral-200 p-4 shadow-sm hover:border-neutral-900/40 hover:bg-white/80 transition-all group flex items-center gap-5 cursor-pointer relative"
                                        >
                                            <div className={`p-4 rounded-xl flex flex-col items-center min-w-[100px] border shadow-sm transition-all ${session.overallScore >= 80 ? 'bg-google-green/5 border-google-green/10' : session.overallScore >= 60 ? 'bg-google-blue/5 border-google-blue/10' : 'bg-google-red/5 border-google-red/10'} group-hover:scale-105`}>
                                                <span className={`text-[10px] font-black uppercase mb-1 ${session.overallScore >= 80 ? 'text-google-green' : session.overallScore >= 60 ? 'text-google-blue' : 'text-google-red'}`}>Score</span>
                                                <span className={`text-2xl font-black leading-none ${session.overallScore >= 80 ? 'text-google-green' : session.overallScore >= 60 ? 'text-google-blue' : 'text-google-red'}`}>
                                                    {session.overallScore}
                                                </span>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-base text-neutral-800 mb-1 group-hover:text-neutral-900 transition-colors truncate tracking-tight">
                                                    {session.title}
                                                </h4>
                                                <div className="flex items-center gap-4 text-neutral-400">
                                                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.05em]">
                                                        <Calendar className="w-3 h-3 opacity-60" />
                                                        {new Date(session.startedAt || (session.durationMs > 1000000 ? session.durationMs : 0) || Date.now()).toLocaleDateString('de-DE')}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.05em] border-l border-neutral-100 pl-4">
                                                        <Clock className="w-3 h-3 opacity-60" />
                                                        {formatDuration(session.durationMs)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 pr-2">
                                                <div
                                                    className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 group-hover:bg-neutral-900 group-hover:text-white transition-all shadow-sm"
                                                    title="View Insights"
                                                >
                                                    <Sparkles className="w-4 h-4" />
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteSession(session.sessionId);
                                                    }}
                                                    className="p-3 text-neutral-300 hover:text-google-red hover:bg-google-red/5 rounded-2xl transition-all active:scale-95"
                                                    title="Delete Session"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Secondary Column: Improvement Tasks */}
                        <div className="lg:col-span-12 xl:col-span-4">
                            <div className="flex items-center justify-between h-8 mb-2">
                                <h3 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] flex items-center gap-2">
                                    <Target className="w-3.5 h-3.5 text-google-red" /> Development roadmap
                                </h3>
                                {tasks.filter(t => t.status === 'open').length > 0 && (
                                    <span className="px-2.5 py-1 rounded-full bg-google-red/10 text-google-red text-[9px] font-black uppercase">
                                        {tasks.filter(t => t.status === 'open').length} Focus Areas
                                    </span>
                                )}
                            </div>

                            {tasks.length === 0 ? (
                                <div className="bg-white rounded-[32px] border border-neutral-200 p-10 text-center shadow-sm">
                                    <div className="w-12 h-12 bg-google-green/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle2 className="w-6 h-6 text-google-green/30" />
                                    </div>
                                    <p className="text-[11px] font-bold text-neutral-400 leading-relaxed uppercase tracking-wider">Analysis complete. No critical improvements needed yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {tasks.filter(t => t.status === 'open').map(task => (
                                        <div key={task.taskId} className="bg-white rounded-[28px] border border-neutral-200 p-6 shadow-sm group hover:border-google-blue/20 transition-all relative overflow-hidden">
                                            <div className="flex items-start justify-between gap-6">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-google-blue/5 text-google-blue rounded">
                                                            {task.category}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-neutral-300">
                                                            {new Date(task.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-bold text-neutral-800 leading-snug tracking-tight">{task.description}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleTaskStatusChange(task.taskId, 'improved')}
                                                    className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-300 hover:text-google-green hover:border-google-green hover:bg-google-green/5 transition-all active:scale-90 shrink-0"
                                                    title="Mark as improved"
                                                >
                                                    <Check className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {tasks.filter(t => t.status !== 'open').length > 0 && (
                                        <div className="pt-8">
                                            <h4 className="text-[10px] font-black uppercase text-neutral-300 tracking-[0.2em] mb-4 flex items-center gap-2">
                                                <CheckCircle2 className="w-3 h-3" /> Growth Log
                                            </h4>
                                            <div className="space-y-3 opacity-50 hover:opacity-80 transition-opacity">
                                                {tasks.filter(t => t.status !== 'open').slice(0, 3).map(task => (
                                                    <div key={task.taskId} className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex items-center justify-between group">
                                                        <div className="min-w-0 pr-4">
                                                            <p className="text-xs font-semibold text-neutral-500 truncate line-through decoration-neutral-300">{task.description}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => handleTaskStatusChange(task.taskId, 'open')}
                                                                className="opacity-0 group-hover:opacity-100 text-[9px] font-black text-google-blue uppercase tracking-widest hover:underline transition-opacity"
                                                            >
                                                                Restore
                                                            </button>
                                                            <Check className="w-4 h-4 text-google-green shrink-0" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'materials' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
                            <div>
                                <h3 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] mb-1">Context Library</h3>
                                <p className="text-[11px] text-neutral-500 font-medium">Add materials to help Aura analyze your pitch content accuracy.</p>
                            </div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="w-12 h-12 flex items-center justify-center bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-[18px] hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-all active:scale-95 group/upload shadow-sm"
                                title="Upload Material"
                            >
                                {isUploading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Plus className="w-5 h-5 group-hover/upload:scale-110 transition-transform" />
                                )}
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                accept=".pdf,.doc,.docx,.txt,image/*"
                            />
                        </div>                        {materials.length === 0 ? (
                            <div className="bg-white/40 backdrop-blur-md rounded-[48px] border-2 border-dashed border-neutral-200 p-20 text-center shadow-xl shadow-google-blue/5 flex flex-col items-center group relative overflow-hidden">

                                <div className="relative z-10 w-full flex flex-col items-center">
                                    <div className="w-32 h-32 mb-12 relative flex items-center justify-center group/icon">
                                        {/* Outer Glows */}
                                        <div className="absolute inset-0 bg-google-blue/10 blur-[40px] rounded-full scale-75 group-hover/icon:scale-125 transition-transform duration-700 opacity-60"></div>
                                        <div className="absolute inset-0 bg-google-red/5 blur-[30px] rounded-full translate-x-4 -translate-y-4 animate-pulse"></div>
                                        
                                        {/* The Core */}
                                        <div className="relative w-24 h-24 rounded-[32px] shadow-2xl shadow-neutral-900/40 transform group-hover/icon:rotate-[15deg] transition-transform duration-500 overflow-hidden border border-neutral-800">
                                            <img 
                                                src="/images/aura-ai-logo-dark.svg" 
                                                alt="Aura Core" 
                                                className="w-full h-full object-cover" 
                                            />
                                        </div>

                                        {/* Orbiting Elements */}
                                        <div className="absolute -top-3 -right-3 w-10 h-10 bg-white rounded-2xl shadow-xl border border-neutral-50 flex items-center justify-center text-google-red -rotate-12 group-hover/icon:-rotate-[25deg] transition-transform duration-500 cursor-default">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div className="absolute -bottom-5 -left-5 w-11 h-11 bg-white rounded-2xl shadow-xl border border-neutral-50 flex items-center justify-center text-google-green rotate-12 group-hover/icon:rotate-[30deg] transition-transform duration-500 animate-pulse cursor-default">
                                            <Video className="w-6 h-6" />
                                        </div>
                                        <div className="absolute top-2 -left-8 w-9 h-9 bg-white rounded-xl shadow-lg border border-neutral-50 flex items-center justify-center text-google-blue rotate-[15deg] group-hover/icon:rotate-0 transition-transform duration-700 cursor-default">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div className="absolute -bottom-2 -right-8 w-11 h-11 bg-white rounded-xl shadow-xl border border-neutral-50 flex items-center justify-center text-google-yellow -rotate-6 group-hover/icon:rotate-6 transition-transform duration-700 cursor-default">
                                            <Folder className="w-6 h-6" />
                                        </div>
                                    </div>

                                    <h3 className="text-2xl font-black text-neutral-900 mb-3 tracking-tight">Context Engine</h3>
                                    <p className="text-[13px] font-medium text-neutral-500 mb-10 max-w-sm mx-auto leading-relaxed">
                                        Upload your pitch materials to help Aura understand the specific industry nuances of your project.
                                    </p>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-neutral-100 text-neutral-600 border border-neutral-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-900 hover:text-white hover:border-neutral-900 transition-all cursor-pointer active:scale-95 group/btn"
                                    >
                                        <Upload className="w-3.5 h-3.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                                        Upload Material
                                    </div>

                                </div>
                            </div>
                        ) : (
                            <div className="w-full space-y-3">
                                {materials.map(material => (
                                    <div 
                                        key={material.materialId} 
                                        onClick={() => handleDownloadMaterial(material)}
                                        className="bg-white/60 backdrop-blur-sm rounded-xl border border-neutral-200 p-3.5 flex items-center gap-5 shadow-sm hover:border-neutral-900/40 hover:bg-white/80 transition-all group cursor-pointer relative overflow-hidden"
                                        title="Click to download original file"
                                    >
                                        <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center text-google-blue border border-neutral-100 overflow-hidden relative shadow-sm transition-transform duration-300">
                                            {material.previewUrl ? (
                                                <img 
                                                    src={material.previewUrl} 
                                                    alt={material.filename} 
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    {material.mimeType.includes('pdf') ? (
                                                        <FileText className="w-7 h-7 text-google-red" />
                                                    ) : (
                                                        <FileText className="w-7 h-7 text-google-blue" />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-base text-neutral-800 truncate tracking-tight">{material.filename}</h4>
                                                <Download className="w-3 h-3 text-neutral-300 group-hover:text-neutral-900 transition-colors" />
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{formatBytes(material.sizeBytes)}</span>
                                                <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full leading-none ${material.extractedText.includes('[Text extraction failed') ? 'bg-google-red/10 text-google-red' : 'bg-google-green/10 text-google-green'}`}>
                                                    {material.extractedText.includes('[Text extraction failed') ? 'FAILED' : 'EXTRACTED'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 pr-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteMaterial(material.materialId);
                                                }}
                                                className="w-10 h-10 flex items-center justify-center text-neutral-300 hover:text-google-red hover:bg-google-red/5 rounded-xl transition-all"
                                                title="Remove Asset"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            <ProjectCoachChat projectId={projectId} />

            {/* Session Report Overlay */}
            {selectedReport && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-md z-50 overflow-y-auto animate-in fade-in duration-300">
                    <div className="max-w-5xl mx-auto px-8 py-10">
                        <div className="flex justify-between items-center mb-6">
                            <button
                                onClick={() => setSelectedReport(null)}
                                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black bg-white text-neutral-900 shadow-sm border border-neutral-200 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 active:scale-95 transition-all uppercase tracking-widest"
                            >
                                <ChevronLeft className="w-4 h-4" /> Close Report
                            </button>
                        </div>

                        <div className="bg-white rounded-[40px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500 border border-white/20">
                            {selectedReport.report && (
                                <div className="p-0">
                                    <div className="bg-google-blue/10 p-16 border-b border-neutral-100/50">
                                        <div className="flex flex-col md:flex-row items-center justify-between gap-12">
                                            <div className="text-center md:text-left">
                                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-google-blue text-white text-[9px] font-black uppercase tracking-widest mb-4">
                                                    Performance Report
                                                </div>
                                                <h2 className="text-5xl font-black text-neutral-900 tracking-tight mb-3">Pitch Audit</h2>
                                                <p className="text-neutral-500 font-bold uppercase tracking-[0.2em] text-xs opacity-70">
                                                    Session {selectedReport.sessionId.slice(0, 8)} • {new Date(selectedReport.startedAt || (selectedReport.durationMs > 1000000 ? selectedReport.durationMs : 0) || Date.now()).toLocaleDateString('de-DE')}
                                                </p>
                                            </div>
                                            <div className="bg-white p-8 rounded-[32px] shadow-2xl shadow-google-blue/10 border border-neutral-100 flex flex-col items-center min-w-[160px] transform hover:scale-105 transition-transform">
                                                <span className={`text-6xl font-black ${selectedReport.report.overallScore >= 70 ? 'text-google-green' : 'text-google-blue'}`}>
                                                    {selectedReport.report.overallScore}
                                                </span>
                                                <span className="text-[11px] font-black text-neutral-400 uppercase tracking-widest mt-2">Overall Score</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-16 space-y-16">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            {Object.entries(selectedReport.report.categories || {}).map(([key, cat]: [string, any]) => (
                                                <div key={key} className="p-10 rounded-[40px] bg-neutral-50/80 border border-neutral-200/50 hover:border-google-blue/30 transition-all group relative overflow-hidden">
                                                    <div className="flex justify-between items-center mb-6">
                                                        <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-neutral-400">
                                                            {key.replace(/([A-Z])/g, ' $1')}
                                                        </h4>
                                                        <span className={`font-black text-2xl ${cat.score >= 70 ? 'text-google-green' : 'text-neutral-900'}`}>
                                                            {cat.score}
                                                        </span>
                                                    </div>
                                                    <p className="text-base font-medium text-neutral-600 leading-relaxed mb-8">{cat.summary}</p>
                                                    {cat.tips && cat.tips.length > 0 && (
                                                        <div className="flex items-start gap-4 p-6 rounded-[24px] bg-white border border-neutral-100 text-sm font-bold text-neutral-900 shadow-sm group-hover:shadow-md transition-shadow">
                                                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                                                            {cat.tips[0]}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {selectedReport.report.coachNote && (
                                            <div className="p-12 rounded-[40px] bg-neutral-900 text-white relative overflow-hidden group shadow-2xl">
                                                <div className="relative z-10">
                                                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40 mb-6">Executive Coach Post-Notes</h4>
                                                    <p className="text-2xl font-medium text-white/95 leading-relaxed italic tracking-tight">
                                                        &quot;{selectedReport.report.coachNote}&quot;
                                                    </p>
                                                </div>
                                                <div className="absolute -bottom-10 -right-10 text-white/5 text-[200px] font-black pointer-events-none group-hover:scale-110 transition-transform duration-700">&quot;</div>
                                                <div className="absolute top-0 right-0 w-64 h-64 bg-google-blue/10 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

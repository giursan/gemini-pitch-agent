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
    AlertCircle,
    X,
    Folder
} from 'lucide-react';
import ProjectCoachChat from '../../ProjectCoachChat';

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
    const [activeTab, setActiveTab] = useState<'sessions' | 'materials' | 'tasks'>('sessions');

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

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (isLoading && !project) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-google-blue"></div>
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
                    <nav className="flex items-center gap-2 text-neutral-400 mb-6">
                        <Link href="/projects" className="text-xs font-black uppercase tracking-widest hover:text-google-blue flex items-center gap-1">
                            <ChevronLeft className="w-3 h-3" /> Projects
                        </Link>
                    </nav>

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                        <div className="flex-1">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-16 h-16 bg-google-blue/5 rounded-2xl flex items-center justify-center text-google-blue border border-google-blue/10">
                                    <Folder className="w-8 h-8" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-black text-neutral-900 tracking-tight">{project.title}</h1>
                                    <p className="text-neutral-500 mt-1 max-w-2xl">{project.description || 'Manage your pitch preparation materials and practice sessions.'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 flex flex-col items-center min-w-[100px]">
                                <span className="text-[10px] font-black uppercase text-neutral-400 mb-1">Sessions</span>
                                <span className="text-2xl font-black text-neutral-900 leading-none">{project.sessionCount}</span>
                            </div>
                            <div className="bg-google-blue/5 border border-google-blue/10 rounded-2xl p-4 flex flex-col items-center min-w-[100px]">
                                <span className="text-[10px] font-black uppercase text-google-blue mb-1">Best Score</span>
                                <span className="text-2xl font-black text-google-blue leading-none">{project.bestScore || '—'}</span>
                            </div>
                            <Link
                                href={`/practice?projectId=${projectId}`}
                                className="h-14 flex items-center gap-3 px-8 bg-google-blue text-white rounded-2xl text-sm font-black shadow-xl shadow-google-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all ml-2"
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
                        onClick={() => setActiveTab('sessions')}
                        className={`px-8 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all min-w-fit ${activeTab === 'sessions' ? 'border-google-blue text-google-blue' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                    >
                        Sessions ({sessions.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('materials')}
                        className={`px-8 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all min-w-fit ${activeTab === 'materials' ? 'border-google-blue text-google-blue' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                    >
                        Context Materials ({materials.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('tasks')}
                        className={`px-8 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all min-w-fit ${activeTab === 'tasks' ? 'border-google-blue text-google-blue' : 'border-transparent text-neutral-400 hover:text-neutral-600'}`}
                    >
                        Improvement Tasks ({tasks.filter(t => t.status === 'open').length})
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'sessions' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {sessions.length === 0 ? (
                            <div className="bg-white rounded-3xl border border-neutral-200 p-16 text-center shadow-sm">
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {sessions.map(session => (
                                    <div key={session.sessionId} className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm hover:border-google-blue transition-all group">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h4 className="font-black text-neutral-900 mb-1 group-hover:text-google-blue transition-colors truncate max-w-[200px]">
                                                    {session.title}
                                                </h4>
                                                <div className="flex items-center gap-3 text-neutral-400">
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                                        <Calendar className="w-3 h-3" />
                                                        {new Date(session.startedAt).toLocaleDateString()}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border-l border-neutral-200 pl-3">
                                                        <Clock className="w-3 h-3" />
                                                        {Math.round(session.durationMs / 1000)}s
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-neutral-50 px-4 py-3 rounded-2xl flex flex-col items-center">
                                                <span className="text-[8px] font-black uppercase text-neutral-400 mb-0.5">Score</span>
                                                <span className={`text-xl font-black ${session.overallScore >= 80 ? 'text-google-green' : session.overallScore >= 60 ? 'text-google-blue' : 'text-google-red'}`}>
                                                    {session.overallScore}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Link
                                                href={`/history`} // Need specific session detail Link eventually
                                                className="flex-1 flex items-center justify-between px-5 py-3 bg-neutral-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-600 hover:bg-google-blue hover:text-white transition-all"
                                            >
                                                View Report
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </Link>
                                            <button
                                                onClick={() => handleDeleteSession(session.sessionId)}
                                                className="p-3 bg-neutral-50 text-neutral-300 hover:text-google-red hover:bg-google-red/5 rounded-2xl transition-all"
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
                )}

                {activeTab === 'materials' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Upload Zone */}
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-white border-2 border-dashed border-neutral-200 rounded-3xl p-12 mb-10 text-center cursor-pointer hover:border-google-blue hover:bg-google-blue/5 transition-all group"
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                                accept=".pdf,.txt,.ppt,.pptx,.doc,.docx"
                            />
                            {isUploading ? (
                                <div className="flex flex-col items-center">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-google-blue mb-4"></div>
                                    <p className="text-sm font-bold text-google-blue">Processing & Extracting Text...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                        <Upload className="w-8 h-8 text-neutral-400 group-hover:text-google-blue transition-colors" />
                                    </div>
                                    <h3 className="text-lg font-bold text-neutral-900 mb-1">Add Reference Materials</h3>
                                    <p className="text-sm text-neutral-400 max-w-sm mx-auto">
                                        Upload PDFs, slides, or notes. Aura will evaluate your pitch against this content.
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Materials List */}
                        <div className="space-y-4">
                            {materials.map(material => (
                                <div key={material.materialId} className="bg-white rounded-2xl border border-neutral-200 p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400">
                                            <FileText className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-neutral-900 truncate max-w-[300px]">{material.filename}</h4>
                                            <div className="flex items-center gap-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider mt-1">
                                                <span>{formatBytes(material.sizeBytes)}</span>
                                                <span className="border-l border-neutral-200 pl-4">{new Date(material.uploadedAt).toLocaleDateString()}</span>
                                                <span className={`px-2 py-0.5 rounded ${material.extractedText.includes('[Text extraction failed') ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                                                    {material.extractedText.includes('[Text extraction failed') ? 'Extraction Failed' : 'Text Extracted'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDeleteMaterial(material.materialId)}
                                        className="p-2.5 text-neutral-300 hover:text-google-red hover:bg-google-red/5 rounded-xl transition-all"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {tasks.length === 0 ? (
                            <div className="bg-white rounded-3xl border border-neutral-200 p-16 text-center shadow-sm">
                                <CheckCircle2 className="w-12 h-12 text-google-green/20 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-neutral-900 mb-1">No pending tasks</h3>
                                <p className="text-sm text-neutral-400">Improvement tasks will appear here after your first analyzed session.</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-black uppercase text-neutral-400 tracking-widest">Active Focus Areas</h3>
                                </div>

                                {tasks.filter(t => t.status === 'open').map(task => (
                                    <div key={task.taskId} className="bg-white rounded-2xl border-l-4 border-google-blue border-y border-r border-neutral-200 p-5 flex items-center justify-between shadow-sm group">
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={() => handleTaskStatusChange(task.taskId, 'improved')}
                                                className="w-8 h-8 rounded-full border-2 border-neutral-200 flex items-center justify-center text-transparent hover:text-google-green hover:border-google-green transition-all"
                                            >
                                                <CheckCircle2 className="w-5 h-5" />
                                            </button>
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-google-blue/5 text-google-blue rounded">
                                                        {task.category}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-neutral-300">{new Date(task.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <p className="font-bold text-neutral-800">{task.description}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleTaskStatusChange(task.taskId, 'dismissed')}
                                                className="p-2 text-neutral-300 hover:text-neutral-500 rounded-lg hover:bg-neutral-50"
                                                title="Dismiss"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {tasks.filter(t => t.status !== 'open').length > 0 && (
                                    <div className="pt-8">
                                        <h3 className="text-xs font-black uppercase text-neutral-400 tracking-widest mb-4">Completed</h3>
                                        <div className="space-y-3">
                                            {tasks.filter(t => t.status !== 'open').map(task => (
                                                <div key={task.taskId} className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 flex items-center justify-between opacity-60">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-8 h-8 text-google-green flex items-center justify-center">
                                                            {task.status === 'improved' ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5 text-neutral-400" />}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-neutral-500 line-through decoration-neutral-300">{task.description}</p>
                                                            <span className="text-[8px] font-black uppercase text-neutral-400">{task.status === 'improved' ? 'Improved' : 'Dismissed'}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleTaskStatusChange(task.taskId, 'open')}
                                                        className="text-[10px] font-bold text-google-blue hover:underline"
                                                    >
                                                        REOPEN
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
            
            <ProjectCoachChat projectId={projectId} />
        </div>
    );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Video, History, Activity, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Sidebar() {
    const pathname = usePathname();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const navItems = [
        { name: 'Dashboard', href: '/', icon: Home },
        { name: 'Practice Space', href: '/practice', icon: Video },
        { name: 'Session History', href: '/history', icon: History },
    ];

    return (
        <aside 
            className={`h-full bg-surface border-r border-neutral-200 flex flex-col flex-shrink-0 z-50 transition-all duration-500 ease-in-out relative group/sidebar ${
                isCollapsed ? 'w-20' : 'w-64'
            }`}
        >
            {/* Collapse Toggle Button */}
            <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-10 w-6 h-6 bg-white border border-neutral-200 rounded-full flex items-center justify-center shadow-sm text-neutral-400 hover:text-neutral-900 hover:border-neutral-900 transition-all z-[60] opacity-0 group-hover/sidebar:opacity-100"
            >
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>

            {/* Header / Logo */}
            <div className={`h-24 flex items-center border-b border-neutral-200 overflow-hidden transition-all duration-500 ${isCollapsed ? 'px-4' : 'px-6'}`}>
                <Link href="/" className="flex items-center gap-3 min-w-max cursor-pointer">
                    <div className="w-10 h-10 rounded-[12px] overflow-hidden shrink-0 shadow-sm border border-neutral-200/50">
                        <img src="/images/aura-ai-logo-dark.svg?v=2" alt="Aura Logo" className="w-full h-full object-cover" />
                    </div>
                    <div className={`flex flex-col transition-all duration-500 ${isCollapsed ? 'opacity-0 -translate-x-4 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
                        <h1 className="text-[12px] font-black tracking-[0.25em] text-neutral-950 uppercase leading-none">
                            AURA
                        </h1>
                        <span className="text-[9px] font-black text-neutral-400 uppercase tracking-[0.15em] mt-1 whitespace-nowrap">
                            Your AI Mentor
                        </span>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center transition-all duration-300 rounded-xl group/nav overflow-hidden ${
                                isCollapsed 
                                    ? 'w-12 h-12 justify-center mx-auto' 
                                    : 'px-3 py-3 gap-4 w-full'
                            } ${isActive
                                ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-900/10'
                                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                                }`}
                            title={isCollapsed ? item.name : ''}
                        >
                            <Icon className={`w-5 h-5 shrink-0 transition-transform ${isActive ? 'text-white' : 'text-neutral-500'} ${!isCollapsed ? 'group-hover/nav:scale-110' : ''}`} />
                            <span className={`transition-all duration-500 origin-left font-medium text-sm ${isCollapsed ? 'opacity-0 scale-95 w-0 overflow-hidden' : 'opacity-100 scale-100 w-auto'}`}>
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className={`p-6 border-t border-neutral-200 text-xs text-neutral-400 transition-all duration-500 whitespace-nowrap overflow-hidden ${isCollapsed ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                Aura Pitch Mentor v2.0<br />
                Google Cloud UI
            </div>
        </aside>
    );
}

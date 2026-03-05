'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Video, History, Activity } from 'lucide-react';

export default function Sidebar() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: Home },
        { name: 'Practice Space', href: '/practice', icon: Video },
        { name: 'Session History', href: '/history', icon: History },
        { name: 'TED Benchmarks', href: '/profiler', icon: Activity },
    ];

    return (
        <aside className="w-64 h-full bg-surface border-r border-neutral-200 flex flex-col flex-shrink-0 z-50">
            {/* Header / Logo */}
            <div className="h-20 flex items-center px-6 border-b border-neutral-200">
                <div className="w-8 h-8 rounded bg-google-blue flex items-center justify-center">
                    <span className="text-white font-bold text-lg">A</span>
                </div>
                <div className="ml-3 flex flex-col">
                    <h1 className="text-lg font-bold tracking-tight text-neutral-900 leading-none">
                        Aura <span className="text-google-blue">Mentor</span>
                    </h1>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive
                                    ? 'bg-google-blue/10 text-google-blue'
                                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                                }`}
                        >
                            <Icon className={`w-5 h-5 ${isActive ? 'text-google-blue' : 'text-neutral-500'}`} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-6 border-t border-neutral-200 text-xs text-neutral-400">
                Aura Pitch Mentor v2.0<br />
                Google Cloud UI
            </div>
        </aside>
    );
}

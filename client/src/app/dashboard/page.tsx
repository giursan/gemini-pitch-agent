'use client';

export default function Dashboard() {
    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 font-[family-name:var(--font-geist-sans)]">
            <header className="mb-10">
                <h1 className="text-3xl font-bold tracking-tight text-white/90">Session Highlights</h1>
                <p className="text-neutral-400 mt-2">Review your pitch performance from the latest session.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-neutral-900 border border-white/5 p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center">
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-500 mb-2">Overall Score</h3>
                    <span className="text-5xl font-bold text-emerald-400">82<span className="text-xl text-neutral-500">/100</span></span>
                </div>
                <div className="bg-neutral-900 border border-white/5 p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center">
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-500 mb-2">Avg. Pacing</h3>
                    <span className="text-4xl font-bold text-white">142 <span className="text-xl text-neutral-500 font-normal">WPM</span></span>
                    <span className="text-xs text-emerald-400 mt-2">Perfect Range</span>
                </div>
                <div className="bg-neutral-900 border border-white/5 p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center">
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-500 mb-2">Eye Contact</h3>
                    <span className="text-4xl font-bold text-white">68%</span>
                    <span className="text-xs text-amber-400 mt-2">Needs Improvement</span>
                </div>
            </div>

            <div className="bg-neutral-900 border border-white/5 p-8 rounded-2xl shadow-lg mb-8">
                <h2 className="text-xl font-semibold mb-6">Timeline Analysis</h2>
                {/* Placeholder for Recharts timeline graph */}
                <div className="h-64 w-full bg-neutral-800 rounded-xl border border-white/5 flex items-center justify-center">
                    <p className="text-neutral-500">Multimodal Telemetry Graph (WPM vs Time) renders here</p>
                </div>
            </div>

            <div className="bg-neutral-900 border border-white/5 p-8 rounded-2xl shadow-lg">
                <h2 className="text-xl font-semibold mb-6">The Shark's Feedback (Content Coach)</h2>
                <ul className="space-y-4">
                    <li className="flex gap-4">
                        <span className="text-emerald-400 text-xl">✓</span>
                        <div>
                            <h4 className="font-semibold">Strong Hook</h4>
                            <p className="text-sm text-neutral-400">Your opening 30 seconds clearly defined the problem space. Excellent hook.</p>
                        </div>
                    </li>
                    <li className="flex gap-4">
                        <span className="text-amber-400 text-xl">!</span>
                        <div>
                            <h4 className="font-semibold">Weak Defense of TAM</h4>
                            <p className="text-sm text-neutral-400">When I interrupted you about your market size (Total Addressable Market), you hesitated and dropped eye contact. Practice defending this metric.</p>
                            <button className="mt-2 text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-white transition">Review Clip (02:14)</button>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
}

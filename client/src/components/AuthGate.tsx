'use client';

import { useState } from 'react';
import { useAuth } from '../lib/auth';

export default function AuthGate({ children }: { children: React.ReactNode }) {
    const { user, loading, signInWithGoogle } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);

    const handleSignIn = async () => {
        setError(null);
        setIsSigningIn(true);
        try {
            await signInWithGoogle();
        } catch (err) {
            setError('Sign-in failed. Please try again.');
            console.error('Sign-in failed:', err);
        } finally {
            setIsSigningIn(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FA]">
                <div className="flex flex-col items-center gap-4 text-neutral-500">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 shadow-sm animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Loading</span>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FA] px-6">
                <div className="w-full max-w-md bg-white border border-neutral-200 rounded-[32px] p-10 shadow-xl">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 rounded-[18px] overflow-hidden border border-neutral-200/60 shadow-sm mb-6">
                            <img src="/images/aura-ai-logo-dark.svg?v=2" alt="Aura Logo" className="w-full h-full object-cover" />
                        </div>
                        <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Welcome to Aura</h1>
                        <p className="text-sm text-neutral-500 mt-2">Sign in with Google to access your projects and sessions.</p>
                    </div>

                    <button
                        onClick={handleSignIn}
                        disabled={isSigningIn}
                        className="mt-8 w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl border border-neutral-200 bg-white text-neutral-900 text-[11px] font-black uppercase tracking-[0.2em] shadow-sm hover:shadow-md hover:border-neutral-300 transition-all disabled:opacity-60"
                    >
                        <span className="w-5 h-5">
                            <svg viewBox="0 0 48 48" className="w-full h-full">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.22l6.9-6.9C35.88 2.14 30.3 0 24 0 14.64 0 6.4 5.38 2.32 13.22l8.06 6.26C12.3 12.62 17.7 9.5 24 9.5z"/>
                                <path fill="#4285F4" d="M46.5 24.5c0-1.64-.14-3.22-.4-4.76H24v9.02h12.7c-.54 2.92-2.18 5.4-4.62 7.06l7.06 5.48C43.76 36.86 46.5 31.12 46.5 24.5z"/>
                                <path fill="#FBBC05" d="M10.38 28.1c-1.02-2.92-1.02-6.08 0-9l-8.06-6.26C-.34 17.66-.34 30.34 2.32 35.16l8.06-6.26z"/>
                                <path fill="#34A853" d="M24 48c6.3 0 11.58-2.08 15.44-5.64l-7.06-5.48c-2.02 1.36-4.62 2.16-8.38 2.16-6.3 0-11.7-3.12-13.62-7.6l-8.06 6.26C6.4 42.62 14.64 48 24 48z"/>
                                <path fill="none" d="M0 0h48v48H0z"/>
                            </svg>
                        </span>
                        {isSigningIn ? 'Signing In...' : 'Continue With Google'}
                    </button>

                    {error && (
                        <p className="mt-4 text-xs text-google-red font-bold text-center">{error}</p>
                    )}
                </div>
            </div>
        );
    }

    return <>{children}</>;
}

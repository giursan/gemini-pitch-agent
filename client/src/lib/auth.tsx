'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOutUser: () => Promise<void>;
    getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        return onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            setLoading(false);
        });
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        user,
        loading,
        signInWithGoogle: async () => {
            try {
                await signInWithPopup(auth, googleProvider);
            } catch (err: any) {
                if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
                    await signInWithRedirect(auth, googleProvider);
                    return;
                }
                throw err;
            }
        },
        signOutUser: async () => {
            await signOut(auth);
        },
        getIdToken: async () => {
            if (!auth.currentUser) return null;
            return auth.currentUser.getIdToken();
        },
    }), [user, loading]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

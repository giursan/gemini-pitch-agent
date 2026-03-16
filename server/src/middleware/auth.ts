import type { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';

export interface AuthedRequest extends Request {
    user?: {
        uid: string;
        email?: string;
    };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
    if (req.method === 'OPTIONS') return next();

    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer (.+)$/i);
    if (!match) {
        return res.status(401).json({ error: 'Missing auth token' });
    }

    try {
        const decoded = await admin.auth().verifyIdToken(match[1]);
        req.user = {
            uid: decoded.uid,
            email: decoded.email,
        };
        return next();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[auth] verifyIdToken failed:', message);
        return res.status(401).json({ error: 'Invalid auth token' });
    }
}

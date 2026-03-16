import { auth } from './firebase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL || 'ws://localhost:8080';

export async function apiFetch(path: string, options: RequestInit = {}) {
    const token = await auth.currentUser?.getIdToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);

    return fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
    });
}

export async function getWsUrl() {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return WS_BASE_URL;

    const url = new URL(WS_BASE_URL);
    url.searchParams.set('token', token);
    return url.toString();
}

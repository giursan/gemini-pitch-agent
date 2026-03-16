'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, AlertTriangle, ShieldAlert, X } from 'lucide-react';

export interface Alert {
    id: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: number;
}

interface FeedbackOverlayProps {
    alerts: Alert[];
    onDismiss: (id: string) => void;
}

const SEVERITY_STYLES = {
    info: {
        bg: 'bg-white border-neutral-200',
        accent: 'bg-google-blue',
        icon: <Lightbulb className="w-5 h-5 text-google-blue" />,
        text: 'text-neutral-800',
    },
    warning: {
        bg: 'bg-white border-neutral-200',
        accent: 'bg-google-yellow',
        icon: <AlertTriangle className="w-5 h-5 text-google-yellow" />,
        text: 'text-neutral-800',
    },
    critical: {
        bg: 'bg-white border-neutral-200',
        accent: 'bg-google-red',
        icon: <ShieldAlert className="w-5 h-5 text-google-red" />,
        text: 'text-neutral-800',
    },
};

export default function FeedbackOverlay({ alerts, onDismiss }: FeedbackOverlayProps) {
    return (
        <div className="absolute top-20 left-6 right-6 z-50 flex flex-col gap-3 pointer-events-none items-center">
            {alerts.slice(-3).map((alert) => (
                <AlertToast key={alert.id} alert={alert} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function AlertToast({ alert, onDismiss }: { alert: Alert; onDismiss: (id: string) => void }) {
    const [visible, setVisible] = useState(false);
    const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;

    useEffect(() => {
        // Animate in
        const entryTimer = setTimeout(() => setVisible(true), 10);

        // Auto-dismiss after 4.5 seconds
        const dismissTimer = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onDismiss(alert.id), 400);
        }, 4500);

        return () => {
            clearTimeout(entryTimer);
            clearTimeout(dismissTimer);
        };
    }, [alert.id, onDismiss]);

    return (
        <div
            className={`
                ${style.bg} border rounded-lg px-5 py-3.5 shadow-sm
                flex items-center gap-4 pointer-events-auto w-full max-w-lg
                transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)
                ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'}
            `}
        >
            <div className={`w-1 h-8 rounded-full ${style.accent}`} />
            <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-full bg-neutral-50 border border-neutral-100">{style.icon}</div>
            <div className="flex flex-col flex-1">
                <p className={`${style.text} text-[13px] font-bold leading-snug`}>
                    {alert.message}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Real-time Coaching</span>
                </div>
            </div>
            <button
                onClick={() => {
                    setVisible(false);
                    setTimeout(() => onDismiss(alert.id), 300);
                }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

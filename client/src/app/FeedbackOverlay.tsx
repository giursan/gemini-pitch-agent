'use client';

import { useEffect, useState } from 'react';

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
        bg: 'bg-blue-500/15 border-blue-500/30',
        icon: '💡',
        text: 'text-blue-300',
    },
    warning: {
        bg: 'bg-amber-500/15 border-amber-500/30',
        icon: '⚠️',
        text: 'text-amber-300',
    },
    critical: {
        bg: 'bg-red-500/15 border-red-500/30',
        icon: '🚨',
        text: 'text-red-300',
    },
};

export default function FeedbackOverlay({ alerts, onDismiss }: FeedbackOverlayProps) {
    return (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-col gap-2 pointer-events-none">
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
        requestAnimationFrame(() => setVisible(true));

        // Auto-dismiss after 4 seconds
        const timer = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onDismiss(alert.id), 300);
        }, 4000);

        return () => clearTimeout(timer);
    }, [alert.id, onDismiss]);

    return (
        <div
            className={`
                ${style.bg} border backdrop-blur-md rounded-xl px-4 py-3
                flex items-center gap-3 pointer-events-auto
                transition-all duration-300 ease-out
                ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}
        >
            <span className="text-lg">{style.icon}</span>
            <span className={`${style.text} text-sm font-semibold tracking-wide`}>
                {alert.message}
            </span>
        </div>
    );
}

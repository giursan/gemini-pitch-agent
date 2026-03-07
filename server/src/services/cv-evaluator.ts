/**
 * CV Evaluator — deterministic threshold-based analysis of client-side
 * MediaPipe telemetry. No LLM calls, pure TypeScript logic.
 */

// ── Types ───────────────────────────────────────────────────────────────────────

export interface CvTelemetry {
    eyeContact: number;         // 0-100 percentage
    postureAngle: number;       // degrees
    isGoodPosture: boolean;
    shoulderSymmetry?: number;  // 0-1
    bodyStability?: number;     // 0-1
    gesturesPerMin: number;
    handVisibility: number;     // 0-1
    smileScore: number;         // 0-1
    overallScore: number;       // 0-100
    currentGestures: string[];
    openGestureRatio: number;   // 0-1
}

export interface OrchestratorSignal {
    source: 'eye_contact' | 'posture' | 'gesture' | 'delivery' | 'content' | 'orchestrator';
    severity: 'info' | 'warning' | 'critical';
    message: string;
}

// ── Thresholds (calibrated to TED benchmark ranges) ─────────────────────────

const EYE_CONTACT_CRITICAL = 30;
const EYE_CONTACT_WARNING = 50;
const EYE_CONTACT_GOOD = 70;

const GESTURE_LOW_WARN = 8;     // gestures/min — too stiff
const GESTURE_HIGH_WARN = 50;   // gestures/min — too fidgety
const GESTURE_TED_TARGET = 26;  // TED average

const POSTURE_BAD_THRESHOLD_MS = 5000; // alert after 5s of bad posture
const STABILITY_WARNING = 0.5;  // excessive swaying

// ── Evaluator ───────────────────────────────────────────────────────────────────

export class CvEvaluator {
    private badPostureSince: number | null = null;
    private lastEyeAlertTs = 0;
    private lastPostureAlertTs = 0;
    private lastGestureAlertTs = 0;

    /**
     * Evaluate a CV telemetry snapshot and return any triggered signals.
     * Called every ~1 second from the orchestrator.
     */
    evaluate(telemetry: CvTelemetry): OrchestratorSignal[] {
        const signals: OrchestratorSignal[] = [];
        const now = Date.now();

        // ── Eye Contact ─────────────────────────────────────────────────
        if (now - this.lastEyeAlertTs > 15000) { // max 1 eye alert per 15s
            if (telemetry.eyeContact < EYE_CONTACT_CRITICAL) {
                signals.push({ source: 'eye_contact', severity: 'critical', message: 'Look at the camera' });
                this.lastEyeAlertTs = now;
            } else if (telemetry.eyeContact < EYE_CONTACT_WARNING) {
                signals.push({ source: 'eye_contact', severity: 'warning', message: 'More eye contact' });
                this.lastEyeAlertTs = now;
            }
        }

        // ── Posture ─────────────────────────────────────────────────────
        if (!telemetry.isGoodPosture) {
            if (!this.badPostureSince) {
                this.badPostureSince = now;
            } else if (now - this.badPostureSince > POSTURE_BAD_THRESHOLD_MS && now - this.lastPostureAlertTs > 20000) {
                signals.push({ source: 'posture', severity: 'warning', message: 'Straighten your posture' });
                this.lastPostureAlertTs = now;
                this.badPostureSince = null; // reset so we don't spam
            }
        } else {
            this.badPostureSince = null;
        }

        // Body stability
        if (telemetry.bodyStability !== undefined && telemetry.bodyStability < STABILITY_WARNING && now - this.lastPostureAlertTs > 20000) {
            signals.push({ source: 'posture', severity: 'info', message: 'Reduce swaying' });
            this.lastPostureAlertTs = now;
        }

        // ── Gestures ────────────────────────────────────────────────────
        if (now - this.lastGestureAlertTs > 30000) { // max 1 gesture alert per 30s
            if (telemetry.gesturesPerMin > 0 && telemetry.gesturesPerMin < GESTURE_LOW_WARN) {
                signals.push({ source: 'gesture', severity: 'info', message: 'Use more hand gestures' });
                this.lastGestureAlertTs = now;
            } else if (telemetry.gesturesPerMin > GESTURE_HIGH_WARN) {
                signals.push({ source: 'gesture', severity: 'warning', message: 'Too many gestures' });
                this.lastGestureAlertTs = now;
            }
        }

        return signals;
    }

    /** Reset state for a new session */
    reset(): void {
        this.badPostureSince = null;
        this.lastEyeAlertTs = 0;
        this.lastPostureAlertTs = 0;
        this.lastGestureAlertTs = 0;
    }
}

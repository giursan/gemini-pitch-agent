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
    neckStability?: number;     // 0-1.2 relative to baseline
    shoulderExpansion?: number; // 0-1.2 relative to baseline
    gesturesPerMin: number;
    handEnergy?: number;
    handsHidden?: boolean;
    handsDetected?: number;
    gestureVariety?: number;
    totalGestures?: number;
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

// ── Thresholds (calibrated to internal benchmark ranges) ───────────────────

const EYE_CONTACT_CRITICAL = 30;
const EYE_CONTACT_WARNING = 50;
const EYE_CONTACT_GOOD = 70;

const GESTURE_LOW_WARN = 8;     // gestures/min — too stiff
const GESTURE_HIGH_WARN = 50;   // gestures/min — too fidgety
const GESTURE_ENERGY_HIGH = 2; // Increased sensitivity
const GESTURE_VARIETY_LOW = 3; 
const GESTURE_MIN_FOR_VARIETY = 10;
const GESTURE_TARGET_RPM = 26;  // Calibrated target average

const POSTURE_BAD_THRESHOLD_MS = 2000; // alert after 2s of bad posture
const SHRIMP_BAD_THRESHOLD_MS = 2500;  // alert after 2.5s of rounding/shrimping
const EYE_BAD_THRESHOLD_MS = 2500;     // alert after 2.5s of low contact
const GLOBAL_COOLDOWN_MS = 1000;       // 1s cooldown for all agent-specific alerts
const STABILITY_WARNING = 0.5;  // excessive swaying
const SHRIMP_NECK_WARNING = 0.98; // <95% of baseline neck ratio
const SHRIMP_SHOULDER_WARNING = 0.90; // <90% of baseline shoulder breadth

// ── Evaluator ───────────────────────────────────────────────────────────────────

export class CvEvaluator {
    private badPostureSince: number | null = null;
    private badShrimpSince: number | null = null;
    private badEyeSince: number | null = null;
    private highEnergySince: number | null = null;
    private lastEyeAlertTs = 0;
    private lastPostureAlertTs = 0;
    private lastGestureAlertTs = 0;

    /**
     * Evaluate a CV telemetry snapshot and return any triggered signals.
     * Called every ~1 second from the orchestrator.
     * When agents is provided, only evaluates signals for enabled agents.
     */
    evaluate(telemetry: CvTelemetry, agents?: { eyeContact: boolean; posture: boolean; gestures: boolean; speech: boolean }): OrchestratorSignal[] {
        const signals: OrchestratorSignal[] = [];
        const now = Date.now();

        // ── Eye Contact ─────────────────────────────────────────────────
        if (!agents || agents.eyeContact) {
            const isLowContact = telemetry.eyeContact < EYE_CONTACT_WARNING;
            
            if (isLowContact) {
                if (!this.badEyeSince) {
                    this.badEyeSince = now;
                } else if (now - this.badEyeSince > EYE_BAD_THRESHOLD_MS && now - this.lastEyeAlertTs > GLOBAL_COOLDOWN_MS) {
                    const severity = telemetry.eyeContact < EYE_CONTACT_CRITICAL ? 'critical' : 'warning';
                    const message = severity === 'critical' ? 'Look at the camera' : 'More eye contact';
                    
                    signals.push({ source: 'eye_contact', severity, message });
                    this.lastEyeAlertTs = now;
                    this.badEyeSince = null; // Reset after alert
                }
            } else {
                this.badEyeSince = null;
            }
        }

        // ── Posture ─────────────────────────────────────────────────────
        if (!agents || agents.posture) {
            if (!telemetry.isGoodPosture) {
                if (!this.badPostureSince) {
                    this.badPostureSince = now;
                } else if (now - this.badPostureSince > POSTURE_BAD_THRESHOLD_MS && now - this.lastPostureAlertTs > GLOBAL_COOLDOWN_MS) {
                    signals.push({ source: 'posture', severity: 'warning', message: 'Straighten your posture' });
                    this.lastPostureAlertTs = now;
                    this.badPostureSince = null;
                }
            } else {
                this.badPostureSince = null;
            }

            // Shrimp detection
            const isShrimping = (telemetry.neckStability !== undefined && telemetry.neckStability < SHRIMP_NECK_WARNING) ||
                (telemetry.shoulderExpansion !== undefined && telemetry.shoulderExpansion < SHRIMP_SHOULDER_WARNING);

            if (isShrimping) {
                if (!this.badShrimpSince) {
                    this.badShrimpSince = now;
                } else if (now - this.badShrimpSince > SHRIMP_BAD_THRESHOLD_MS && now - this.lastPostureAlertTs > GLOBAL_COOLDOWN_MS) {
                    const msg = telemetry.neckStability! < SHRIMP_NECK_WARNING
                        ? 'Keep your head up, neck is collapsing forward'
                        : 'Roll your shoulders back, they are collapsing inward';
                    signals.push({ source: 'posture', severity: 'warning', message: msg });
                    this.lastPostureAlertTs = now;
                    this.badShrimpSince = null;
                }
            } else {
                this.badShrimpSince = null;
            }

            // Body stability
            if (telemetry.bodyStability !== undefined && telemetry.bodyStability < STABILITY_WARNING && now - this.lastPostureAlertTs > GLOBAL_COOLDOWN_MS) {
                signals.push({ source: 'posture', severity: 'info', message: 'Reduce swaying' });
                this.lastPostureAlertTs = now;
            }
        }

        // ── Gestures ────────────────────────────────────────────────────
        if ((!agents || agents.gestures) && now - this.lastGestureAlertTs > GLOBAL_COOLDOWN_MS) {
            
            // Priority 1: Hidden hands (Now immediate check)
            const noHandsVisible = telemetry.handsDetected === 0 || telemetry.handsHidden;
            if (noHandsVisible) {
                signals.push({ source: 'gesture', severity: 'warning', message: 'Show your hands' });
                this.lastGestureAlertTs = now;
                return signals; // Bail out - nothing else to analyze if hands are gone
            }

            // Priority 2: Erratic movement (Persistence check)
            if (telemetry.handEnergy && telemetry.handEnergy > GESTURE_ENERGY_HIGH) {
                if (!this.highEnergySince) {
                    this.highEnergySince = now;
                } else if (now - this.highEnergySince > 1000) { // 1 second persistence
                    signals.push({ source: 'gesture', severity: 'info', message: 'Calm your movements' });
                    this.lastGestureAlertTs = now;
                    this.highEnergySince = null;
                }
            } else {
                this.highEnergySince = null;
            }

            // Priority 3: Variety & Frequency
            const total = telemetry.totalGestures || 0;
            const variety = telemetry.gestureVariety || 0;
            
            if (total >= GESTURE_MIN_FOR_VARIETY && variety < GESTURE_VARIETY_LOW) {
                signals.push({ source: 'gesture', severity: 'info', message: 'Vary your hand gestures' });
                this.lastGestureAlertTs = now;
            } else if (telemetry.gesturesPerMin > 0 && telemetry.gesturesPerMin < GESTURE_LOW_WARN) {
                signals.push({ source: 'gesture', severity: 'info', message: 'Use more hand gestures' });
                this.lastGestureAlertTs = now;
            }
        }

        return signals;
    }

    /** Reset state for a new session */
    reset(): void {
        this.badPostureSince = null;
        this.badShrimpSince = null;
        this.badEyeSince = null;
        this.highEnergySince = null;
        this.lastEyeAlertTs = 0;
        this.lastPostureAlertTs = 0;
        this.lastGestureAlertTs = 0;
    }
}

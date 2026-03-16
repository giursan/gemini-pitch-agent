"use strict";
/**
 * CV Evaluator — deterministic threshold-based analysis of client-side
 * MediaPipe telemetry. No LLM calls, pure TypeScript logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CvEvaluator = void 0;
// ── Thresholds (calibrated to TED benchmark ranges) ─────────────────────────
const EYE_CONTACT_CRITICAL = 30;
const EYE_CONTACT_WARNING = 50;
const EYE_CONTACT_GOOD = 70;
const GESTURE_LOW_WARN = 8; // gestures/min — too stiff
const GESTURE_HIGH_WARN = 50; // gestures/min — too fidgety
const GESTURE_TED_TARGET = 26; // TED average
const POSTURE_BAD_THRESHOLD_MS = 2000; // alert after 2s of bad posture
const SHRIMP_BAD_THRESHOLD_MS = 2500; // alert after 2.5s of rounding/shrimping
const POSTURE_COOLDOWN_MS = 8000; // 8s cooldown before next posture alert
const STABILITY_WARNING = 0.5; // excessive swaying
const SHRIMP_NECK_WARNING = 0.98; // <95% of baseline neck ratio
const SHRIMP_SHOULDER_WARNING = 0.90; // <90% of baseline shoulder breadth
// ── Evaluator ───────────────────────────────────────────────────────────────────
class CvEvaluator {
    badPostureSince = null;
    badShrimpSince = null;
    lastEyeAlertTs = 0;
    lastPostureAlertTs = 0;
    lastGestureAlertTs = 0;
    /**
     * Evaluate a CV telemetry snapshot and return any triggered signals.
     * Called every ~1 second from the orchestrator.
     * When agents is provided, only evaluates signals for enabled agents.
     */
    evaluate(telemetry, agents) {
        const signals = [];
        const now = Date.now();
        // ── Eye Contact ─────────────────────────────────────────────────
        if ((!agents || agents.eyeContact) && now - this.lastEyeAlertTs > 15000) {
            if (telemetry.eyeContact < EYE_CONTACT_CRITICAL) {
                signals.push({ source: 'eye_contact', severity: 'critical', message: 'Look at the camera' });
                this.lastEyeAlertTs = now;
            }
            else if (telemetry.eyeContact < EYE_CONTACT_WARNING) {
                signals.push({ source: 'eye_contact', severity: 'warning', message: 'More eye contact' });
                this.lastEyeAlertTs = now;
            }
        }
        // ── Posture ─────────────────────────────────────────────────────
        if (!agents || agents.posture) {
            if (!telemetry.isGoodPosture) {
                if (!this.badPostureSince) {
                    this.badPostureSince = now;
                }
                else if (now - this.badPostureSince > POSTURE_BAD_THRESHOLD_MS && now - this.lastPostureAlertTs > POSTURE_COOLDOWN_MS) {
                    signals.push({ source: 'posture', severity: 'warning', message: 'Straighten your posture' });
                    this.lastPostureAlertTs = now;
                    this.badPostureSince = null;
                }
            }
            else {
                this.badPostureSince = null;
            }
            // Shrimp detection
            const isShrimping = (telemetry.neckStability !== undefined && telemetry.neckStability < SHRIMP_NECK_WARNING) ||
                (telemetry.shoulderExpansion !== undefined && telemetry.shoulderExpansion < SHRIMP_SHOULDER_WARNING);
            if (isShrimping) {
                if (!this.badShrimpSince) {
                    this.badShrimpSince = now;
                }
                else if (now - this.badShrimpSince > SHRIMP_BAD_THRESHOLD_MS && now - this.lastPostureAlertTs > POSTURE_COOLDOWN_MS) {
                    const msg = telemetry.neckStability < SHRIMP_NECK_WARNING
                        ? 'Keep your head up, neck is collapsing forward'
                        : 'Roll your shoulders back, they are collapsing inward';
                    signals.push({ source: 'posture', severity: 'warning', message: msg });
                    this.lastPostureAlertTs = now;
                    this.badShrimpSince = null;
                }
            }
            else {
                this.badShrimpSince = null;
            }
            // Body stability
            if (telemetry.bodyStability !== undefined && telemetry.bodyStability < STABILITY_WARNING && now - this.lastPostureAlertTs > POSTURE_COOLDOWN_MS) {
                signals.push({ source: 'posture', severity: 'info', message: 'Reduce swaying' });
                this.lastPostureAlertTs = now;
            }
        }
        // ── Gestures ────────────────────────────────────────────────────
        if ((!agents || agents.gestures) && now - this.lastGestureAlertTs > 30000) {
            if (telemetry.gesturesPerMin > 0 && telemetry.gesturesPerMin < GESTURE_LOW_WARN) {
                signals.push({ source: 'gesture', severity: 'info', message: 'Use more hand gestures' });
                this.lastGestureAlertTs = now;
            }
            else if (telemetry.gesturesPerMin > GESTURE_HIGH_WARN) {
                signals.push({ source: 'gesture', severity: 'warning', message: 'Too many gestures' });
                this.lastGestureAlertTs = now;
            }
        }
        return signals;
    }
    /** Reset state for a new session */
    reset() {
        this.badPostureSince = null;
        this.badShrimpSince = null;
        this.lastEyeAlertTs = 0;
        this.lastPostureAlertTs = 0;
        this.lastGestureAlertTs = 0;
    }
}
exports.CvEvaluator = CvEvaluator;

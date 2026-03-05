/**
 * TED Benchmark Engine
 *
 * Computes statistical distributions (mean, std, percentiles) from
 * profiled TED talks processed through our CV pipeline.
 * Used to compute z-scores and percentile rankings for live sessions.
 */

// ── Types ───────────────────────────────────────────────────────────────────────

export interface MetricDistribution {
    mean: number;
    std: number;
    min: number;
    max: number;
    p25: number;   // 25th percentile
    p50: number;   // median
    p75: number;   // 75th percentile
    count: number; // number of data points
}

export interface TEDBenchmarkProfile {
    source: string;
    generatedAt: string;
    videosAnalyzed: string[];
    totalSamples: number;
    distributions: {
        postureAngle: MetricDistribution;
        shoulderSymmetry: MetricDistribution;
        bodyStability: MetricDistribution;
        gesturesPerMin: MetricDistribution;
        handVisibility: MetricDistribution;
        smileScore: MetricDistribution;
        expressiveness: MetricDistribution;
        overallScore: MetricDistribution;
    };
}

export interface PercentileResult {
    value: number;
    percentile: number;  // 0-100, where 100 = you're better than all TED speakers
    zScore: number;      // standard deviations from mean
    rating: 'elite' | 'good' | 'average' | 'below_average' | 'needs_work';
}

// ── Storage ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'aura_ted_benchmarks';

export function saveBenchmarkProfile(profile: TEDBenchmarkProfile): void {
    if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
}

export function loadBenchmarkProfile(): TEDBenchmarkProfile | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function hasBenchmarks(): boolean {
    return loadBenchmarkProfile() !== null;
}

// ── Statistical Computations ────────────────────────────────────────────────────

function computeDistribution(values: number[]): MetricDistribution {
    if (values.length === 0) {
        return { mean: 0, std: 0, min: 0, max: 0, p25: 0, p50: 0, p75: 0, count: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);

    return {
        mean: round(mean),
        std: round(std),
        min: round(sorted[0]),
        max: round(sorted[n - 1]),
        p25: round(percentile(sorted, 25)),
        p50: round(percentile(sorted, 50)),
        p75: round(percentile(sorted, 75)),
        count: n,
    };
}

function percentile(sorted: number[], p: number): number {
    const idx = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function round(v: number): number {
    return Math.round(v * 100) / 100;
}

// ── Build Profile from Profiled Videos ──────────────────────────────────────────

interface ProfiledVideo {
    name: string;
    samples: Array<{
        postureAngle: number;
        shoulderSymmetry: number;
        bodyStability: number;
        gesturesPerMin: number;
        handVisibility: number;
        smileScore: number;
        expressiveness: number;
        overallScore: number;
    }>;
}

/**
 * Build a benchmark profile from multiple profiled TED talk videos.
 * Each video contributes its per-frame samples to the overall distributions.
 */
export function buildBenchmarkProfile(videos: ProfiledVideo[]): TEDBenchmarkProfile {
    // Flatten all samples from all videos
    const allSamples = videos.flatMap(v => v.samples);

    const profile: TEDBenchmarkProfile = {
        source: 'Aura TED Profiler - Empirical CV Analysis',
        generatedAt: new Date().toISOString(),
        videosAnalyzed: videos.map(v => v.name),
        totalSamples: allSamples.length,
        distributions: {
            postureAngle: computeDistribution(allSamples.map(s => s.postureAngle)),
            shoulderSymmetry: computeDistribution(allSamples.map(s => s.shoulderSymmetry)),
            bodyStability: computeDistribution(allSamples.map(s => s.bodyStability)),
            gesturesPerMin: computeDistribution(allSamples.map(s => s.gesturesPerMin)),
            handVisibility: computeDistribution(allSamples.map(s => s.handVisibility)),
            smileScore: computeDistribution(allSamples.map(s => s.smileScore)),
            expressiveness: computeDistribution(allSamples.map(s => s.expressiveness)),
            overallScore: computeDistribution(allSamples.map(s => s.overallScore)),
        },
    };

    return profile;
}

// ── Scoring Against Benchmarks ──────────────────────────────────────────────────

/**
 * Score a single metric value against its TED benchmark distribution.
 * Returns z-score, percentile, and a human-readable rating.
 */
export function scoreAgainstBenchmark(
    value: number,
    dist: MetricDistribution,
): PercentileResult {
    if (dist.std === 0 || dist.count === 0) {
        return { value, percentile: 50, zScore: 0, rating: 'average' };
    }

    const zScore = round((value - dist.mean) / dist.std);

    // Approximate percentile from z-score using normal distribution CDF
    const percentileValue = Math.round(normalCDF(zScore) * 100);
    const clampedPercentile = Math.max(0, Math.min(100, percentileValue));

    let rating: PercentileResult['rating'];
    if (clampedPercentile >= 80) rating = 'elite';
    else if (clampedPercentile >= 60) rating = 'good';
    else if (clampedPercentile >= 40) rating = 'average';
    else if (clampedPercentile >= 20) rating = 'below_average';
    else rating = 'needs_work';

    return {
        value: round(value),
        percentile: clampedPercentile,
        zScore,
        rating,
    };
}

/**
 * Score all metrics from a live session against TED benchmarks.
 */
export function scoreSession(
    metrics: {
        postureAngle: number;
        shoulderSymmetry: number;
        bodyStability: number;
        gesturesPerMin: number;
        handVisibility: number;
        smileScore: number;
        expressiveness: number;
        overallScore: number;
    },
    profile: TEDBenchmarkProfile,
): Record<string, PercentileResult> {
    return {
        postureAngle: scoreAgainstBenchmark(metrics.postureAngle, profile.distributions.postureAngle),
        shoulderSymmetry: scoreAgainstBenchmark(metrics.shoulderSymmetry, profile.distributions.shoulderSymmetry),
        bodyStability: scoreAgainstBenchmark(metrics.bodyStability, profile.distributions.bodyStability),
        gesturesPerMin: scoreAgainstBenchmark(metrics.gesturesPerMin, profile.distributions.gesturesPerMin),
        handVisibility: scoreAgainstBenchmark(metrics.handVisibility, profile.distributions.handVisibility),
        smileScore: scoreAgainstBenchmark(metrics.smileScore, profile.distributions.smileScore),
        expressiveness: scoreAgainstBenchmark(metrics.expressiveness, profile.distributions.expressiveness),
        overallScore: scoreAgainstBenchmark(metrics.overallScore, profile.distributions.overallScore),
    };
}

// ── Normal CDF Approximation ────────────────────────────────────────────────────

/**
 * Approximation of the standard normal CDF using the Abramowitz & Stegun formula.
 */
function normalCDF(z: number): number {
    if (z < -6) return 0;
    if (z > 6) return 1;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    const absZ = Math.abs(z);
    const t = 1 / (1 + p * absZ);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);

    return 0.5 * (1 + sign * y);
}

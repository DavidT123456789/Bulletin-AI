/**
 * @fileoverview TrombiGridDetector — Détection automatique de grille par analyse de variance de luminance sur canvas
 * Extrait de TrombinoscopeManager.js (Lot 12 — Découpage God Object #2)
 * @module managers/trombinoscope/TrombiGridDetector
 */

export const TrombiGridDetector = {
    createDefaultGrid(manager) {
        const students = manager._getStudentsForImport();
        const count = students.length || 8;

        // Smart column distribution: aim for ~4-6 columns, scale up for large classes
        let cols;
        if (count <= 4) cols = count;
        else if (count <= 12) cols = 4;
        else if (count <= 24) cols = 6;
        else cols = Math.min(8, Math.ceil(Math.sqrt(count)));

        let rows = Math.ceil(count / cols);

        // Try automatic grid detection from image
        const detected = manager._detectGridFromImage();
        if (detected) {
            cols = detected.cols;
            rows = detected.rows;
        } else if (manager._imageNaturalWidth && manager._imageNaturalHeight) {
            // FALLBACK GEOMETRIC ESTIMATE (based on image aspect ratio, not class size)
            cols = 4; // default columns count
            const ratio = manager._imageNaturalWidth / manager._imageNaturalHeight;
            const cellRatio = ratio > 1.1 ? 1.05 : 0.95;
            rows = Math.round(cols * (manager._imageNaturalHeight / manager._imageNaturalWidth) * cellRatio);
            rows = Math.max(2, Math.min(12, rows));
        }

        manager._gridCols = cols;
        manager._gridRows = rows;
        manager._gapH = detected?.gapH ?? 0;
        manager._gapV = detected?.gapV ?? 0;

        manager._zones = [];
        manager._createGridSilent(cols, rows, detected);
        manager._syncSlidersToState();
    },

    detectGridFromImage(manager) {
        try {
            const img = document.getElementById('trombiStep2Image');
            if (!img || !img.complete || img.naturalWidth === 0) return null;

            // Use a small canvas for fast pixel analysis without overhead
            const canvas = document.createElement('canvas');
            const size = 150;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            // Draw image on canvas
            ctx.drawImage(img, 0, 0, size, size);

            let imgData;
            try {
                imgData = ctx.getImageData(0, 0, size, size).data;
            } catch (canvasErr) {
                // Occurs if image is tainted (CORS) or other canvas context issues
                console.warn('[Trombinoscope] Unable to read image data (CORS or canvas issue):', canvasErr);
                return null;
            }

            // Convert to 2D grayscale array
            const gray = new Uint8Array(size * size);
            for (let i = 0; i < size * size; i++) {
                const r = imgData[i * 4];
                const g = imgData[i * 4 + 1];
                const b = imgData[i * 4 + 2];
                // Standard luma formula
                gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            }

            // Analyze X projection variance to find grid columns
            const xSegments = manager._analyzeProjection(gray, size, 'x');
            const cols = xSegments.length;

            // Sanity check for columns
            if (cols >= 2 && cols <= 12) {
                const avgSegWidth = xSegments.reduce((sum, s) => sum + s.width, 0) / cols;
                const xFillRatio = avgSegWidth / (size / cols);

                // Classify layout orientation and cell aspect ratio:
                // Only treat wide images (ratio > 1.5) as compact multi-column lists when the
                // detected avatar segments are narrow (< 35% of column width); otherwise it is a photo grid.
                const ratio = img.naturalWidth / img.naturalHeight;
                const isCompactList = ratio > 1.5 && xFillRatio < 0.35;
                let cellRatio = 0.95; // portrait default
                if (isCompactList) {
                    cellRatio = 4.25; // wide multi-column list layout
                } else if (ratio > 1.1) {
                    cellRatio = 1.05; // landscape photo grid
                }

                // Geometrically calculate rows (immune to horizontal text interference)
                const rows = Math.round(cols * (img.naturalHeight / img.naturalWidth) * cellRatio);
                const ySegments = !isCompactList ? manager._analyzeProjection(gray, size, 'y') : [];

                if (rows >= 2 && rows <= 12) {
                    const xCalib = manager._calibrateAxisFromSegments(xSegments, cols, size, img.naturalWidth);
                    const yCalib = manager._calibrateAxisFromSegments(ySegments, rows, size, img.naturalHeight);
                    return {
                        cols,
                        rows,
                        refCx: xCalib?.refCenter ?? null,
                        gapH: xCalib?.gap ?? 0,
                        refCy: yCalib?.refCenter ?? null,
                        gapV: yCalib?.gap ?? 0
                    };
                }
            }
        } catch (e) {
            console.warn('[Trombinoscope] Error during auto-grid detection:', e);
        }
        return null;
    },

    calibrateAxisFromSegments(segments, count, size, naturalSpan) {
        if (!segments || segments.length !== count || count < 2 || !naturalSpan) return null;
        const avgPitch = (segments[count - 1].center - segments[0].center) / (count - 1);
        if (avgPitch * count < size * 0.45) return null;

        for (let i = 0; i < count - 1; i++) {
            const pitch = segments[i + 1].center - segments[i].center;
            if (Math.abs(pitch - avgPitch) > avgPitch * 0.35) return null;
        }

        const pitchPx = (avgPitch / size) * naturalSpan;
        const baseCell = naturalSpan / count;
        const rawGap = ((pitchPx - baseCell) / baseCell) * 100;
        const gap = Math.max(-50, Math.min(50, Math.round(rawGap * 2) / 2));

        // Center the grid on the mean of all detected segments so gap rounding never drifts toward one edge
        const meanSegCenter = segments.reduce((sum, s) => sum + s.center, 0) / count;
        const meanCenterPx = (meanSegCenter / size) * naturalSpan;
        const effectivePitch = baseCell * (1 + gap / 100);
        const refCenter = meanCenterPx - ((count - 1) / 2) * effectivePitch;

        return { refCenter, gap };
    },

    analyzeProjection(gray, size, axis) {
        const variances = new Float32Array(size);

        for (let i = 0; i < size; i++) {
            let sum = 0;
            let sumSq = 0;
            for (let j = 0; j < size; j++) {
                // If axis is 'x', we look at columns (index is column i, j-th row pixel)
                // If axis is 'y', we look at rows (index is row i, j-th column pixel)
                const val = (axis === 'x') ? gray[j * size + i] : gray[i * size + j];
                sum += val;
                sumSq += val * val;
            }
            const mean = sum / size;
            // Variance: E[X^2] - E[X]^2
            variances[i] = (sumSq / size) - (mean * mean);
        }

        // Apply a simple 5-tap moving average filter to smooth noise
        const smooth = new Float32Array(size);
        const halfWin = 2;
        for (let i = 0; i < size; i++) {
            let valSum = 0;
            let count = 0;
            for (let w = -halfWin; w <= halfWin; w++) {
                const idx = i + w;
                if (idx >= 0 && idx < size) {
                    valSum += variances[idx];
                    count++;
                }
            }
            smooth[i] = valSum / count;
        }

        // Find min and max to determine threshold
        let minVar = Infinity;
        let maxVar = -Infinity;
        for (let i = 0; i < size; i++) {
            if (smooth[i] < minVar) minVar = smooth[i];
            if (smooth[i] > maxVar) maxVar = smooth[i];
        }

        const range = maxVar - minVar;
        if (range < 10) return []; // Very low contrast or solid image

        // Threshold to distinguish "student photo area" from "gutter/margin area"
        // Since gutters have low variance, threshold is set at 35% of the range above min
        const threshold = minVar + range * 0.35;

        // Collect raw high-variance segments
        const rawSegments = [];
        let inSegment = false;
        let segStart = 0;

        for (let i = 0; i < size; i++) {
            if (smooth[i] > threshold) {
                if (!inSegment) {
                    inSegment = true;
                    segStart = i;
                }
            } else if (inSegment) {
                rawSegments.push({ start: segStart, end: i - 1 });
                inSegment = false;
            }
        }
        if (inSegment) {
            rawSegments.push({ start: segStart, end: size - 1 });
        }

        // Bridge internal micro-dips (<= 4px on 150px grid, e.g. uniform face center)
        // without merging distinct columns/rows
        const maxMicroGap = Math.max(2, Math.round(size * 0.028));
        const maxMergedSpan = Math.round(size * 0.45);
        const mergedSegments = [];

        for (const seg of rawSegments) {
            const prev = mergedSegments[mergedSegments.length - 1];
            if (
                prev &&
                (seg.start - prev.end - 1) <= maxMicroGap &&
                (seg.end - prev.start + 1) <= maxMergedSpan
            ) {
                prev.end = seg.end;
            } else {
                mergedSegments.push({ start: seg.start, end: seg.end });
            }
        }

        const minSegmentWidth = Math.max(3, Math.round(size * 0.03)); // ignore tiny noise spikes
        const candidates = [];
        let maxWidth = 0;
        for (const s of mergedSegments) {
            const width = s.end - s.start + 1;
            if (width >= minSegmentWidth) {
                if (width > maxWidth) maxWidth = width;
                // Pixel i spans [i, i + 1], so the continuous midpoint of [start, end] is (start + end + 1) / 2
                candidates.push({ start: s.start, end: s.end, width, center: (s.start + s.end + 1) / 2 });
            }
        }

        // Discard thin secondary bands (e.g. horizontal text caption rows ~9px vs 44px photo rows)
        return candidates.filter(s => s.width >= maxWidth * 0.5);
    }
};

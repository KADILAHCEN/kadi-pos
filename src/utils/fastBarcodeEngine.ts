import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource
} from '@zxing/library';

export type ScanFormatMode = 'all' | 'barcode' | 'qr';

export interface FastDetectedBarcode {
  text: string;
  format?: BarcodeFormat | string;
  engine: 'native' | 'zxing-roi' | 'zxing-macro' | 'zxing-full';
}

export interface CameraHardwareCapabilities {
  torch: boolean;
  zoomMin: number;
  zoomMax: number;
  zoomStep: number;
  supportsZoom: boolean;
  supportsContinuousFocus: boolean;
}

interface NativeDetectedBarcode {
  rawValue?: string;
  format?: string;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<NativeDetectedBarcode[]>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const LINEAR_ZXING_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED
];

const QR_ZXING_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417
];

const LINEAR_NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar'
];

const QR_NATIVE_FORMATS = ['qr_code', 'data_matrix', 'aztec', 'pdf417'];

export function getZxingFormats(mode: ScanFormatMode): BarcodeFormat[] {
  if (mode === 'barcode') return LINEAR_ZXING_FORMATS;
  if (mode === 'qr') return QR_ZXING_FORMATS;
  return [...LINEAR_ZXING_FORMATS, ...QR_ZXING_FORMATS];
}

export function getNativeFormats(mode: ScanFormatMode): string[] {
  if (mode === 'barcode') return LINEAR_NATIVE_FORMATS;
  if (mode === 'qr') return QR_NATIVE_FORMATS;
  return [...LINEAR_NATIVE_FORMATS, ...QR_NATIVE_FORMATS];
}

export function isTwoDimensionalFormat(format?: BarcodeFormat | string, mode?: ScanFormatMode): boolean {
  const fmtStr = typeof format === 'string' ? format.toLowerCase() : '';
  return (
    format === BarcodeFormat.QR_CODE ||
    format === BarcodeFormat.DATA_MATRIX ||
    format === BarcodeFormat.AZTEC ||
    format === BarcodeFormat.PDF_417 ||
    fmtStr === 'qr_code' ||
    fmtStr === 'data_matrix' ||
    fmtStr === 'aztec' ||
    fmtStr === 'pdf417' ||
    mode === 'qr'
  );
}

/**
 * Queries track hardware capabilities (torch, hardware optical/sensor zoom, continuous focus).
 */
export function inspectTrackCapabilities(track?: MediaStreamTrack | null): CameraHardwareCapabilities {
  const fallback: CameraHardwareCapabilities = {
    torch: false,
    zoomMin: 1,
    zoomMax: 1,
    zoomStep: 0.1,
    supportsZoom: false,
    supportsContinuousFocus: false
  };
  if (!track || typeof track.getCapabilities !== 'function') return fallback;

  try {
    const caps = track.getCapabilities() as MediaTrackCapabilities & {
      torch?: boolean;
      zoom?: { min?: number; max?: number; step?: number };
      focusMode?: string[];
    };
    const zoomMin = typeof caps.zoom?.min === 'number' ? caps.zoom.min : 1;
    const zoomMax = typeof caps.zoom?.max === 'number' ? caps.zoom.max : 1;
    const zoomStep = typeof caps.zoom?.step === 'number' && caps.zoom.step > 0 ? caps.zoom.step : 0.1;
    const focusModes = Array.isArray(caps.focusMode) ? caps.focusMode : [];

    return {
      torch: Boolean(caps.torch),
      zoomMin,
      zoomMax,
      zoomStep,
      supportsZoom: zoomMax > zoomMin + 0.1,
      supportsContinuousFocus: focusModes.includes('continuous')
    };
  } catch {
    return fallback;
  }
}

/**
 * Opens the rear camera at Full HD (1920x1080 ideal, graceful fallback) for crisp tiny-barcode bars.
 */
export async function openHighResCameraStream(deviceId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('CAMERA_UNAVAILABLE');
  }

  const baseVideo: MediaTrackConstraints = deviceId
    ? {
        deviceId: { exact: deviceId },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 30, min: 15 }
      }
    : {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 30, min: 15 }
      };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: baseVideo, audio: false });
    const track = stream.getVideoTracks()[0];
    if (track?.applyConstraints) {
      await track
        .applyConstraints({
          advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
        })
        .catch(() => {});
    }
    return stream;
  } catch {
    // Graceful fallback without 1080p ideal constraints for older webcams/devices
    const fallbackVideo: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: 'environment' } };
    return navigator.mediaDevices.getUserMedia({ video: fallbackVideo, audio: false });
  }
}

export async function applyHardwareZoomConstraint(
  track: MediaStreamTrack | null | undefined,
  desiredMultiplier: number
): Promise<boolean> {
  if (!track || typeof track.applyConstraints !== 'function') return false;
  const caps = inspectTrackCapabilities(track);
  if (!caps.supportsZoom) return false;

  const clamped = Math.min(caps.zoomMax, Math.max(caps.zoomMin, desiredMultiplier));
  try {
    await track.applyConstraints({
      advanced: [{ zoom: clamped } as unknown as MediaTrackConstraintSet]
    });
    return true;
  } catch {
    return false;
  }
}

export async function triggerTrackSingleShotFocus(
  track: MediaStreamTrack | null | undefined
): Promise<void> {
  if (!track || typeof track.applyConstraints !== 'function') return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'single-shot' } as unknown as MediaTrackConstraintSet]
    });
    window.setTimeout(() => {
      track
        .applyConstraints?.({
          advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet]
        })
        .catch(() => {});
    }, 550);
  } catch {
    // Ignore on cameras without programmatic focus
  }
}

export async function applyTrackTorchConstraint(
  track: MediaStreamTrack | null | undefined,
  enabled: boolean
): Promise<boolean> {
  if (!track || typeof track.applyConstraints !== 'function') return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: enabled } as unknown as MediaTrackConstraintSet]
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes average luminance of a video frame for auto-flash detection in dim shops.
 */
export function sampleVideoAmbientLuminance(
  video: HTMLVideoElement | null,
  scratchCanvas?: HTMLCanvasElement | null
): { ready: boolean; meanLuminance: number } {
  if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return { ready: false, meanLuminance: 255 };
  }
  const canvas = scratchCanvas || document.createElement('canvas');
  const w = 64;
  const h = 48;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ready: false, meanLuminance: 255 };

  ctx.drawImage(video, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let sumLum = 0;
  let maxChannel = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r > maxChannel) maxChannel = r;
    if (g > maxChannel) maxChannel = g;
    if (b > maxChannel) maxChannel = b;
    sumLum += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  if (maxChannel === 0) {
    return { ready: false, meanLuminance: 255 };
  }
  return { ready: true, meanLuminance: sumLum / (w * h) };
}

/**
 * Converts RGBA pixels into a fast Uint8ClampedArray grayscale buffer,
 * optionally applying min/max contrast stretching + mild bar-edge enhancement for tiny/faded barcodes.
 */
function rgbaToGrayscaleBuffer(
  rgba: Uint8ClampedArray,
  pixelCount: number,
  outBuf: Uint8ClampedArray,
  stretchContrast: boolean
): Uint8ClampedArray {
  let minL = 255;
  let maxL = 0;

  for (let i = 0, p = 0; p < pixelCount; i += 4, p++) {
    const luma = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8;
    outBuf[p] = luma;
    if (stretchContrast) {
      if (luma < minL) minL = luma;
      if (luma > maxL) maxL = luma;
    }
  }

  if (stretchContrast && maxL - minL > 18 && maxL - minL < 220) {
    const span = maxL - minL;
    const scale = 255 / span;
    for (let p = 0; p < pixelCount; p++) {
      const normalized = (outBuf[p] - minL) * scale;
      // Gentle S-curve push around midpoint to crispen tiny barcode bar boundaries
      const centered = normalized - 128;
      const boosted = 128 + centered * 1.18;
      outBuf[p] = boosted <= 0 ? 0 : boosted >= 255 ? 255 : boosted | 0;
    }
  }

  return outBuf;
}

function tryDecodeGrayBuffer(
  reader: MultiFormatReader,
  grayBuffer: Uint8ClampedArray,
  width: number,
  height: number,
  tryHarder: boolean,
  formats: BarcodeFormat[]
): { text: string; format?: BarcodeFormat } | null {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
  if (tryHarder) {
    hints.set(DecodeHintType.TRY_HARDER, true);
  }

  const source = new RGBLuminanceSource(grayBuffer, width, height);

  // Attempt 1: HybridBinarizer (fast & accurate under uneven store lighting)
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const res = reader.decode(bitmap, hints);
    const text = res.getText();
    if (text) return { text, format: res.getBarcodeFormat?.() };
  } catch {
    // Not found in this binarizer
  } finally {
    reader.reset();
  }

  // Attempt 2: GlobalHistogramBinarizer (excels on low-contrast/tiny 1D thermal labels)
  if (tryHarder) {
    try {
      const bitmapGlobal = new BinaryBitmap(new GlobalHistogramBinarizer(source));
      const res = reader.decode(bitmapGlobal, hints);
      const text = res.getText();
      if (text) return { text, format: res.getBarcodeFormat?.() };
    } catch {
      // Not found
    } finally {
      reader.reset();
    }
  }

  return null;
}

export interface FastBarcodeLoopOptions {
  video: HTMLVideoElement;
  scanFormatMode: ScanFormatMode;
  macroZoomRef: { readonly current: number };
  onDetected: (result: FastDetectedBarcode) => void;
}

/**
 * Starts an ultra-fast, zero-allocation multi-scale barcode loop combining:
 * 1) Hardware/OS BarcodeDetector API (full frame + zoomed center macro crop)
 * 2) Custom ZXing MultiFormatReader running interleaved ROI, 2.2x contrast-stretched micro-macro crop,
 *    and TRY_HARDER full/rotated sweeps.
 */
export function startFastBarcodeLoop(options: FastBarcodeLoopOptions): () => void {
  const { video, scanFormatMode, macroZoomRef, onDetected } = options;

  let stopped = false;
  let timerId: number | null = null;
  let frameCounter = 0;

  const formats = getZxingFormats(scanFormatMode);
  const reader = new MultiFormatReader();

  // Reusable canvases and grayscale buffer to avoid garbage collection stalls
  const workCanvas = document.createElement('canvas');
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  let grayScratch = new Uint8ClampedArray(800 * 600);

  const nativeCanvas = document.createElement('canvas');
  const nativeCtx = nativeCanvas.getContext('2d');

  let nativeDetector: NativeBarcodeDetector | null = null;
  let nativeInitStarted = false;

  const initNativeDetector = async () => {
    if (nativeInitStarted) return;
    nativeInitStarted = true;
    const DetectorCtor = (
      window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!DetectorCtor) return;

    const requested = getNativeFormats(scanFormatMode);
    try {
      let usable = requested;
      if (DetectorCtor.getSupportedFormats) {
        const supported = await DetectorCtor.getSupportedFormats();
        usable = requested.filter((f) => supported.includes(f));
        if (usable.length === 0) return;
      }
      if (!stopped) {
        nativeDetector = new DetectorCtor({ formats: usable });
      }
    } catch {
      nativeDetector = null;
    }
  };

  void initNativeDetector();

  const ensureGrayBuffer = (size: number): Uint8ClampedArray => {
    if (grayScratch.length < size) {
      grayScratch = new Uint8ClampedArray(size);
    }
    return grayScratch;
  };

  const scanCroppedRegion = (
    vw: number,
    vh: number,
    cropFracW: number,
    cropFracH: number,
    targetMaxW: number,
    targetMaxH: number,
    stretchContrast: boolean,
    tryHarder: boolean,
    rotate90 = false
  ): { text: string; format?: BarcodeFormat } | null => {
    if (!workCtx) return null;

    const sx = Math.max(0, Math.round((vw * (1 - cropFracW)) / 2));
    const sy = Math.max(0, Math.round((vh * (1 - cropFracH)) / 2));
    const sw = Math.max(32, Math.round(vw * cropFracW));
    const sh = Math.max(32, Math.round(vh * cropFracH));

    // Preserve aspect ratio while capping work canvas for <8ms decode budget
    const scale = Math.min(targetMaxW / sw, targetMaxH / sh, 2.6);
    const dw = Math.max(32, Math.round(sw * scale));
    const dh = Math.max(32, Math.round(sh * scale));

    const outW = rotate90 ? dh : dw;
    const outH = rotate90 ? dw : dh;

    if (workCanvas.width !== outW || workCanvas.height !== outH) {
      workCanvas.width = outW;
      workCanvas.height = outH;
    }

    workCtx.save();
    workCtx.imageSmoothingEnabled = true;
    workCtx.imageSmoothingQuality = 'high';
    if (rotate90) {
      workCtx.translate(outW / 2, outH / 2);
      workCtx.rotate(Math.PI / 2);
      workCtx.drawImage(video, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    } else {
      workCtx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
    }
    workCtx.restore();

    const imgData = workCtx.getImageData(0, 0, outW, outH);
    const pixelCount = outW * outH;
    const buf = ensureGrayBuffer(pixelCount);
    rgbaToGrayscaleBuffer(imgData.data, pixelCount, buf, stretchContrast);

    return tryDecodeGrayBuffer(reader, buf, outW, outH, tryHarder, formats);
  };

  const runTick = async () => {
    if (stopped) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (video.readyState >= 2 && vw > 0 && vh > 0) {
      frameCounter++;
      const zoomLevel = macroZoomRef.current || 1;
      const isTinyMode = zoomLevel >= 1.8;

      // 1. Native hardware-accelerated BarcodeDetector fast pass (~5-15ms)
      if (nativeDetector) {
        try {
          // Alternate between full frame and center zoomed crop so tiny barcodes get full pixel density
          const runCropNative = isTinyMode || frameCounter % 2 === 0;
          let nativeFound: NativeDetectedBarcode[] = [];

          if (runCropNative && nativeCtx) {
            const cropFrac = zoomLevel >= 2.5 ? 0.36 : isTinyMode ? 0.46 : 0.56;
            const sx = Math.round((vw * (1 - cropFrac)) / 2);
            const sy = Math.round((vh * (1 - cropFrac)) / 2);
            const sw = Math.max(40, Math.round(vw * cropFrac));
            const sh = Math.max(40, Math.round(vh * cropFrac));
            const upW = Math.min(960, Math.round(sw * 1.8));
            const upH = Math.min(720, Math.round(sh * 1.8));
            if (nativeCanvas.width !== upW || nativeCanvas.height !== upH) {
              nativeCanvas.width = upW;
              nativeCanvas.height = upH;
            }
            nativeCtx.imageSmoothingEnabled = true;
            nativeCtx.imageSmoothingQuality = 'high';
            nativeCtx.drawImage(video, sx, sy, sw, sh, 0, 0, upW, upH);
            nativeFound = await nativeDetector.detect(nativeCanvas);
          } else {
            nativeFound = await nativeDetector.detect(video);
          }

          if (!stopped && nativeFound && nativeFound.length > 0) {
            for (let i = 0; i < nativeFound.length; i++) {
              const raw = nativeFound[i]?.rawValue?.trim();
              if (raw) {
                onDetected({ text: raw, format: nativeFound[i]?.format, engine: 'native' });
                if (!stopped) {
                  timerId = window.setTimeout(() => void runTick(), 30);
                }
                return;
              }
            }
          }
        } catch {
          // Transient video frame error; continue to ZXing pass
        }
      }

      if (stopped) return;

      // 2. Interleaved ZXing CPU passes (always fast ROI + micro-macro tiny barcode magnification)
      const phase = frameCounter % 4;
      let hit: { text: string; format?: BarcodeFormat } | null = null;
      let engineTag: FastDetectedBarcode['engine'] = 'zxing-roi';

      if (isTinyMode || phase === 1) {
        // Small-barcode Macro Micro-Crop with contrast boost & 2.2x digital upscale
        const cropW = zoomLevel >= 2.6 ? 0.28 : 0.38;
        const cropH = scanFormatMode === 'qr' ? cropW : zoomLevel >= 2.6 ? 0.22 : 0.30;
        hit = scanCroppedRegion(
          vw,
          vh,
          cropW,
          cropH,
          760,
          scanFormatMode === 'qr' ? 560 : 340,
          true,
          true,
          false
        );
        engineTag = 'zxing-macro';
      } else if (phase === 0 || phase === 2) {
        // Center ROI fast pass (covers normal handheld aiming)
        const cropH = scanFormatMode === 'barcode' ? 0.44 : 0.62;
        hit = scanCroppedRegion(vw, vh, 0.68, cropH, 760, 460, phase === 2, phase === 2, false);
        engineTag = 'zxing-roi';
      } else {
        // Full frame OR 90-degree rotated center pass (catches vertical barcodes on boxes/bottles)
        const doRotate = frameCounter % 8 === 7;
        hit = scanCroppedRegion(
          vw,
          vh,
          doRotate ? 0.65 : 0.94,
          doRotate ? 0.65 : 0.94,
          840,
          600,
          true,
          true,
          doRotate
        );
        engineTag = 'zxing-full';
      }

      if (!stopped && hit?.text) {
        onDetected({ text: hit.text, format: hit.format, engine: engineTag });
      }
    }

    if (!stopped) {
      // Non-overlapping cadence: ~35fps when native detector exists, ~28fps software scan without lag
      const nextDelay = nativeDetector ? 26 : 34;
      timerId = window.setTimeout(() => void runTick(), nextDelay);
    }
  };

  timerId = window.setTimeout(() => void runTick(), 20);

  return () => {
    stopped = true;
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    workCanvas.width = 0;
    workCanvas.height = 0;
    nativeCanvas.width = 0;
    nativeCanvas.height = 0;
  };
}

/**
 * Multi-pass decoder for uploaded photos / WhatsApp images / gallery pictures containing
 * regular OR very small/tilted barcodes.
 */
export async function decodeBarcodeFromImageFile(
  file: Blob,
  scanFormatMode: ScanFormatMode = 'all'
): Promise<{ text: string; format?: BarcodeFormat | string } | null> {
  const formats = getZxingFormats(scanFormatMode);
  const reader = new MultiFormatReader();

  let source: CanvasImageSource | null = null;
  let srcW = 0;
  let srcH = 0;
  let closeBitmap: (() => void) | null = null;
  let revokeUrl: (() => void) | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      source = bitmap;
      srcW = bitmap.width;
      srcH = bitmap.height;
      closeBitmap = () => bitmap.close();
    } catch {
      // Fallback below
    }
  }

  if (!source) {
    const objectUrl = URL.createObjectURL(file);
    revokeUrl = () => URL.revokeObjectURL(objectUrl);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('IMAGE_LOAD_ERROR'));
      el.src = objectUrl;
    });
    source = img;
    srcW = img.naturalWidth || img.width;
    srcH = img.naturalHeight || img.height;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || srcW <= 0 || srcH <= 0) {
    closeBitmap?.();
    revokeUrl?.();
    return null;
  }

  try {
    // Pass 1: Native BarcodeDetector if available
    const DetectorCtor = (
      window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (DetectorCtor) {
      try {
        const detector = new DetectorCtor({ formats: getNativeFormats(scanFormatMode) });
        const maxNative = 1600;
        const nScale = Math.min(1, maxNative / Math.max(srcW, srcH));
        canvas.width = Math.max(32, Math.round(srcW * nScale));
        canvas.height = Math.max(32, Math.round(srcH * nScale));
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const found = await detector.detect(canvas);
        const hit = found.find((f) => f.rawValue?.trim());
        if (hit?.rawValue) {
          return { text: hit.rawValue.trim(), format: hit.format };
        }
      } catch {
        // Continue to ZXing passes
      }
    }

    const attemptCanvasPass = (
      cropFrac: number,
      targetMaxDim: number,
      rotateDeg: 0 | 90,
      stretchContrast: boolean
    ): { text: string; format?: BarcodeFormat } | null => {
      const sx = Math.round((srcW * (1 - cropFrac)) / 2);
      const sy = Math.round((srcH * (1 - cropFrac)) / 2);
      const sw = Math.max(32, Math.round(srcW * cropFrac));
      const sh = Math.max(32, Math.round(srcH * cropFrac));

      const scale = Math.min(2.5, targetMaxDim / Math.max(sw, sh));
      const dw = Math.max(32, Math.round(sw * scale));
      const dh = Math.max(32, Math.round(sh * scale));
      const outW = rotateDeg === 90 ? dh : dw;
      const outH = rotateDeg === 90 ? dw : dh;

      canvas.width = outW;
      canvas.height = outH;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (rotateDeg === 90) {
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(source!, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
      } else {
        ctx.drawImage(source!, sx, sy, sw, sh, 0, 0, dw, dh);
      }
      ctx.restore();

      const data = ctx.getImageData(0, 0, outW, outH).data;
      const buf = new Uint8ClampedArray(outW * outH);
      rgbaToGrayscaleBuffer(data, outW * outH, buf, stretchContrast);
      return tryDecodeGrayBuffer(reader, buf, outW, outH, true, formats);
    };

    // Pass 2..5: Full, Contrast-stretched Full, Center 50% Macro 2x, 90-deg Rotated
    return (
      attemptCanvasPass(1, 1400, 0, false) ||
      attemptCanvasPass(1, 1400, 0, true) ||
      attemptCanvasPass(0.5, 1100, 0, true) ||
      attemptCanvasPass(1, 1200, 90, true)
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    closeBitmap?.();
    revokeUrl?.();
  }
}

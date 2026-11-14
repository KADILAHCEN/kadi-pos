import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, X, Check, SwitchCamera, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { playSound } from '../../utils/audio';
import { compressImageFile } from '../../utils/imageUtils';

interface ProductCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
  isAr?: boolean;
  title?: string;
}

export const ProductCameraModal: React.FC<ProductCameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  isAr = true,
  title
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check available video devices
  useEffect(() => {
    if (!isOpen) return;

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Start video stream
  useEffect(() => {
    if (!isOpen || capturedImage) return;

    let activeStream: MediaStream | null = null;
    setIsLoading(true);
    setCameraError(null);

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('متصفحك لا يدعم الوصول المباشر للكاميرا');
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }
        setIsLoading(false);
      } catch (err: any) {
        console.warn('Camera error:', err);
        setIsLoading(false);
        setCameraError(
          err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? (isAr ? 'يرجى منح إذن استخدام الكاميرا لالتقاط صورة المنتج' : 'Camera permission denied')
            : (isAr ? 'تعذر تشغيل الكاميرا مباشرة. يمكنك التقاط صورة عبر زر ملفات الهاتف أدناه.' : 'Cannot start camera directly. Please use file picker below.')
        );
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen, facingMode, capturedImage, isAr]);

  // Stop camera when closing
  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCapturedImage(null);
    onClose();
  };

  // Flip camera (back / front)
  const toggleFacingMode = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Snap photo
  const handleSnap = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Get square dimensions from center
    const size = Math.min(video.videoWidth || 640, video.videoHeight || 480);
    const startX = ((video.videoWidth || 640) - size) / 2;
    const startY = ((video.videoHeight || 480) - size) / 2;

    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw square cropped image
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 600, 600);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedImage(dataUrl);

    // Stop live stream while reviewing
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }

    playSound('beep');
  };

  // Retake
  const handleRetake = () => {
    setCapturedImage(null);
  };

  // Confirm photo
  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      handleClose();
      playSound('success');
    }
  };

  // Mobile native camera file input fallback
  const handleNativeFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImageFile(file, 800, 800, 0.82);
      setCapturedImage(compressed);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        setStream(null);
      }
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setCapturedImage(result);
          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            setStream(null);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                {title || (isAr ? 'التقاط صورة بالكاميرا' : 'Capture Photo')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isAr ? 'وجه الكاميرا نحو الصنف أو المنتج ثم اضغط زر الالتقاط' : 'Frame item and press capture'}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Preview Body */}
        <div className="relative aspect-square w-full bg-black flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            /* Review captured photo */
            <div className="relative w-full h-full">
              <img
                src={capturedImage}
                alt="Captured product"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3 px-3 py-1 rounded-full bg-emerald-600/90 text-white text-xs font-bold shadow-md flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>{isAr ? 'تم التقاط الصورة' : 'Photo Captured'}</span>
              </div>
            </div>
          ) : cameraError ? (
            /* Error / Permission fallback screen */
            <div className="p-6 text-center text-slate-300 space-y-4">
              <AlertCircle className="w-12 h-12 mx-auto text-amber-500 opacity-90" />
              <p className="text-xs leading-relaxed max-w-xs mx-auto text-slate-200">
                {cameraError}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 inline-flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>{isAr ? 'فتح كاميرا الهاتف لالتقاط صورة' : 'Open Mobile Camera'}</span>
              </button>
            </div>
          ) : (
            /* Live Camera Stream */
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />

              {/* Viewfinder framing overlay */}
              <div className="absolute inset-8 border-2 border-white/60 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                <div className="flex justify-between">
                  <span className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                  <span className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                </div>
                <div className="flex justify-between">
                  <span className="w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                  <span className="w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                </div>
              </div>

              {isLoading && (
                <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <span className="text-xs">{isAr ? 'جاري تشغيل الكاميرا...' : 'Starting camera...'}</span>
                </div>
              )}
            </>
          )}

          {/* Hidden Canvas for snapshot processing */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Hidden File Input for mobile capture */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleNativeFileInput}
            accept="image/*"
            capture="environment"
            className="hidden"
          />
        </div>

        {/* Controls Bar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          {capturedImage ? (
            /* Review Actions */
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isAr ? 'إعادة التقاط' : 'Retake'}</span>
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isAr ? 'استخدام هذه الصورة' : 'Use this Photo'}</span>
              </button>
            </>
          ) : (
            /* Live Camera Controls */
            <>
              {/* Native Mobile Camera / Gallery Fallback */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors"
                title={isAr ? 'التقاط عبر تطبيق كاميرا الهاتف أو المعرض' : 'Open device camera or gallery'}
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={handleSnap}
                disabled={isLoading || !!cameraError}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg hover:shadow-emerald-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <div className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                </div>
                <span>{isAr ? 'التقاط الصورة الآن' : 'Snap Photo'}</span>
              </button>

              {/* Flip Camera Button (if multiple cameras) */}
              <button
                type="button"
                onClick={toggleFacingMode}
                className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors"
                title={isAr ? 'تبديل الكاميرا (الأمامية / الخلفية)' : 'Flip camera'}
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

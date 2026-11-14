import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Upload, X, RefreshCw } from 'lucide-react';
import { usePos } from '../../context/PosContext';

interface VoiceCameraModalProps {
  isOpen: boolean;
  initialProductName?: string;
  onClose: () => void;
  onSaved: (productName: string) => void;
}

export const VoiceCameraModal: React.FC<VoiceCameraModalProps> = ({
  isOpen,
  initialProductName,
  onClose,
  onSaved
}) => {
  const { products, categories, addProduct, updateProduct, language } = usePos();
  const isAr = language === 'ar';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>(initialProductName || '');

  useEffect(() => {
    setTargetName(initialProductName || '');
    setCapturedDataUrl(null);
    setCameraError(null);
  }, [initialProductName, isOpen]);

  const matchedProduct = useMemo(() => {
    const clean = targetName.trim().toLowerCase();
    if (!clean) return null;
    return (
      products.find((p) => p.name.trim().toLowerCase() === clean) ||
      products.find((p) => p.name.toLowerCase().includes(clean) || clean.includes(p.name.trim().toLowerCase())) ||
      null
    );
  }, [targetName, products]);

  useEffect(() => {
    if (!isOpen || capturedDataUrl) return;
    let active = true;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(isAr ? 'الكاميرا غير مدعومة في هذا المتصفح' : 'Camera API unsupported');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraError(null);
      } catch {
        setCameraError(
          isAr
            ? 'تعذر فتح الكاميرا مباشرة. يمكنك التقاط أو اختيار صورة من الجهاز أدناه.'
            : 'Could not access live camera. You can upload or take a photo from device storage below.'
        );
      }
    })();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, capturedDataUrl, isAr]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.84));
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 320;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.84));
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSavePhoto = () => {
    if (!capturedDataUrl) return;
    const cleanName = targetName.trim() || matchedProduct?.name || 'سلعة جديدة';
    if (matchedProduct) {
      updateProduct(matchedProduct.id, { image: capturedDataUrl });
      onSaved(matchedProduct.name);
    } else {
      addProduct({
        name: cleanName,
        nameEn: cleanName,
        sku: `VC-${Date.now().toString().slice(-5)}`,
        barcode: '',
        categoryId: categories[0]?.id || 'cat-1',
        price: 10,
        costPrice: 0,
        stock: 20,
        lowStockThreshold: 5,
        unitType: 'piece',
        image: capturedDataUrl
      });
      onSaved(cleanName);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Camera className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-black">
              {isAr ? 'التقاط صورة للسلعة بالكاميرا' : 'Capture Product Photo'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              {isAr ? 'اسم السلعة المقصودة' : 'Product Name'}
            </label>
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              list="voice-camera-products-list"
              placeholder={isAr ? 'مثال: التيد، السكر، أتاي...' : 'e.g. Tea, Sugar...'}
              className="w-full px-3.5 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
            />
            <datalist id="voice-camera-products-list">
              {products.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
            <p className="text-[11px] mt-1 font-bold text-emerald-600">
              {matchedProduct
                ? isAr
                  ? `✓ تم التعرف على المنتج: "${matchedProduct.name}" (${matchedProduct.price} د.م)`
                  : `✓ Matched: ${matchedProduct.name}`
                : targetName.trim()
                ? isAr
                  ? `+ سيتم إنشاء منتج جديد باسم "${targetName.trim()}" مع الصورة`
                  : `+ Will create new product "${targetName.trim()}"`
                : ''}
            </p>
          </div>

          <div className="aspect-video w-full rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative">
            {capturedDataUrl ? (
              <img src={capturedDataUrl} alt="Captured" className="w-full h-full object-contain" />
            ) : cameraError ? (
              <div className="p-4 text-center space-y-2">
                <ImagePlus className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-300">{cameraError}</p>
              </div>
            ) : (
              <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {!capturedDataUrl ? (
              <>
                {!cameraError && (
                  <button
                    type="button"
                    onClick={handleCaptureFrame}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isAr ? 'التقاط الصورة الآن' : 'Snap Photo'}</span>
                  </button>
                )}
                <label className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>{isAr ? 'اختر صورة / كاميرا الهاتف' : 'Upload / Device Camera'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFilePick}
                    className="hidden"
                  />
                </label>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCapturedDataUrl(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إعادة التصوير' : 'Retake'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSavePhoto}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{isAr ? 'حفظ الصورة على السلعة' : 'Save Photo to Product'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

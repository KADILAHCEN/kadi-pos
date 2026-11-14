/**
 * Bluetooth Barcode Scanner Integration Engine (HID Keyboard Wedge Mode)
 * Supports all external Bluetooth barcode scanners (Eyoyo, Netum, Tera, Zebra, Inateck, Datalogic, etc.)
 */

export interface ScannedBarcodePayload {
  barcode: string;
  charCount: number;
  durationMs: number;
  speedMsPerChar: number;
  timestamp: string;
  source: 'bluetooth_hid' | 'web_bluetooth' | 'camera_scanner' | 'manual';
}

export interface BluetoothScannerConfig {
  enabled: boolean;
  maxInterKeyDelayMs: number; // e.g. 60ms - hardware scanners type under 40ms/char
  minBarcodeLength: number; // e.g. 3 chars
  suffixKey: 'Enter' | 'Tab' | 'Any';
  preventInputPollution: boolean; // Clears active input if burst was a scanner
}

const DEFAULT_CONFIG: BluetoothScannerConfig = {
  enabled: true,
  maxInterKeyDelayMs: 65,
  minBarcodeLength: 3,
  suffixKey: 'Enter',
  preventInputPollution: true
};

class BluetoothScannerManager {
  private config: BluetoothScannerConfig = { ...DEFAULT_CONFIG };
  private buffer: string = '';
  private firstCharTime: number = 0;
  private lastCharTime: number = 0;
  private listeners: Set<(payload: ScannedBarcodePayload) => void> = new Set();
  private isListening: boolean = false;
  private lastScannedCode: string = '';

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  public init(customConfig?: Partial<BluetoothScannerConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
    if (typeof window !== 'undefined' && !this.isListening) {
      window.addEventListener('keydown', this.handleKeyDown, { capture: true });
      this.isListening = true;
    }
  }

  public updateConfig(newConfig: Partial<BluetoothScannerConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public onScan(callback: (payload: ScannedBarcodePayload) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.config.enabled) return;

    const now = Date.now();
    const timeSinceLast = now - this.lastCharTime;

    // Suffix Detection (Barcode transmission completed)
    const isSuffix =
      (this.config.suffixKey === 'Enter' && e.key === 'Enter') ||
      (this.config.suffixKey === 'Tab' && e.key === 'Tab') ||
      (this.config.suffixKey === 'Any' && (e.key === 'Enter' || e.key === 'Tab'));

    if (isSuffix) {
      if (this.buffer.length >= this.config.minBarcodeLength) {
        const totalDuration = now - this.firstCharTime;
        const avgSpeed = this.buffer.length > 0 ? totalDuration / this.buffer.length : 0;

        // A barcode scanner types fast (< 65ms per char). Human typing is > 120ms.
        const isHardwareBurst = avgSpeed <= this.config.maxInterKeyDelayMs || this.buffer.length >= 8;

        if (isHardwareBurst) {
          // Prevent default form submits or newlines
          e.preventDefault();
          e.stopPropagation();

          const code = this.buffer.trim();
          this.lastScannedCode = code;

          const payload: ScannedBarcodePayload = {
            barcode: code,
            charCount: code.length,
            durationMs: totalDuration,
            speedMsPerChar: Number(avgSpeed.toFixed(1)),
            timestamp: new Date().toLocaleTimeString(),
            source: 'bluetooth_hid'
          };

          // Dispatch to listeners
          this.listeners.forEach((fn) => fn(payload));

          // Also dispatch global window event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('pos:bluetooth_barcode_scanned', { detail: payload })
            );
          }
        }
      }

      // Reset buffer after terminator
      this.buffer = '';
      this.firstCharTime = 0;
      this.lastCharTime = 0;
      return;
    }

    // Single character collection
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // If delay between keys is too long, reset buffer (user took a pause or started typing manually)
      if (this.buffer.length > 0 && timeSinceLast > this.config.maxInterKeyDelayMs * 2.5) {
        this.buffer = '';
        this.firstCharTime = 0;
      }

      if (this.buffer.length === 0) {
        this.firstCharTime = now;
      }

      this.buffer += e.key;
      this.lastCharTime = now;
    }
  }

  public getLastScannedCode(): string {
    return this.lastScannedCode;
  }

  public destroy() {
    if (typeof window !== 'undefined' && this.isListening) {
      window.removeEventListener('keydown', this.handleKeyDown, { capture: true });
      this.isListening = false;
    }
    this.listeners.clear();
  }
}

export const bluetoothScanner = new BluetoothScannerManager();

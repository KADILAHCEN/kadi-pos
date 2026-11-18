/**
 * Bluetooth Barcode Scanner Integration Engine (HID Keyboard Wedge + Web Bluetooth)
 * 100% Offline-ready — supports Eyoyo, Netum, Tera, Zebra, Inateck, Datalogic, etc.
 */

export interface ScannedBarcodePayload {
  barcode: string;
  charCount: number;
  durationMs: number;
  speedMsPerChar: number;
  timestamp: string;
  source: 'bluetooth_hid' | 'web_bluetooth' | 'camera_scanner' | 'manual';
}

export interface PairedBluetoothScannerInfo {
  id?: string;
  name: string;
  mode: 'hid' | 'web_bluetooth';
  pairedAt: string;
}

export interface BluetoothScannerConfig {
  enabled: boolean;
  maxInterKeyDelayMs: number; // Hardware HID scanners usually send < 40ms/char (default 85ms for mobile jitter)
  minBarcodeLength: number; // Minimum valid barcode length (e.g. 3)
  suffixKey: 'Enter' | 'Tab' | 'Any';
  preventInputPollution: boolean; // Rolls back stray characters typed into non-barcode inputs during a burst
}

export interface BluetoothScannerStatus {
  listening: boolean;
  enabled: boolean;
  pairedDevice: PairedBluetoothScannerInfo | null;
  bleConnectedName: string | null;
  lastScan: ScannedBarcodePayload | null;
  scanCount: number;
}

const PAIRED_STORAGE_KEY = 'kadi_paired_bt_scanner';

const DEFAULT_CONFIG: BluetoothScannerConfig = {
  enabled: true,
  maxInterKeyDelayMs: 85,
  minBarcodeLength: 3,
  suffixKey: 'Any',
  preventInputPollution: true
};

// Common BLE GATT Serial / HID service UUIDs used by Bluetooth barcode scanners in BLE/SPP mode
const BLE_SCANNER_SERVICES = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / Netum / Eyoyo BLE Serial
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip / ISSC Transparent UART
  '00001812-0000-1000-8000-00805f9b34fb', // Bluetooth HID over GATT
  'generic_access',
  'battery_service',
  'device_information'
];

function loadPairedDeviceFromStorage(): PairedBluetoothScannerInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PAIRED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PairedBluetoothScannerInfo;
    if (parsed && parsed.name) return parsed;
    return null;
  } catch {
    return null;
  }
}

function savePairedDeviceToStorage(info: PairedBluetoothScannerInfo | null) {
  if (typeof window === 'undefined') return;
  try {
    if (info) {
      window.localStorage.setItem(PAIRED_STORAGE_KEY, JSON.stringify(info));
    } else {
      window.localStorage.removeItem(PAIRED_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

class BluetoothScannerManager {
  private config: BluetoothScannerConfig = { ...DEFAULT_CONFIG };
  private buffer: string = '';
  private firstCharTime: number = 0;
  private lastCharTime: number = 0;
  private autoFlushTimer: number | null = null;
  private listeners: Set<(payload: ScannedBarcodePayload) => void> = new Set();
  private statusListeners: Set<(status: BluetoothScannerStatus) => void> = new Set();
  private isListening: boolean = false;
  private lastScannedCode: string = '';
  private lastScanPayload: ScannedBarcodePayload | null = null;
  private scanCount: number = 0;
  private pairedDevice: PairedBluetoothScannerInfo | null = loadPairedDeviceFromStorage();
  private bleConnectedName: string | null = null;
  private activeBleDevice: { gatt?: { connected?: boolean; disconnect?: () => void } } | null = null;
  private bleTextBuffer: string = '';
  private scopeStack: string[] = [];
  private activeInputAtBurstStart: {
    el: HTMLInputElement | HTMLTextAreaElement;
    initialValue: string;
  } | null = null;

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
      this.notifyStatus();
    }
  }

  public updateConfig(newConfig: Partial<BluetoothScannerConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.notifyStatus();
  }

  public pushScope(scope: string) {
    this.scopeStack = [...this.scopeStack.filter((s) => s !== scope), scope];
  }

  public popScope(scope: string) {
    this.scopeStack = this.scopeStack.filter((s) => s !== scope);
  }

  public getActiveScope(): string | null {
    return this.scopeStack.length > 0 ? this.scopeStack[this.scopeStack.length - 1] : null;
  }

  public onScan(callback: (payload: ScannedBarcodePayload) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public getStatus(): BluetoothScannerStatus {
    return {
      listening: this.isListening,
      enabled: this.config.enabled,
      pairedDevice: this.pairedDevice,
      bleConnectedName: this.bleConnectedName,
      lastScan: this.lastScanPayload,
      scanCount: this.scanCount
    };
  }

  public subscribeStatus(callback: (status: BluetoothScannerStatus) => void) {
    this.statusListeners.add(callback);
    callback(this.getStatus());
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private notifyStatus() {
    const snap = this.getStatus();
    this.statusListeners.forEach((fn) => fn(snap));
  }

  private clearAutoFlushTimer() {
    if (this.autoFlushTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.autoFlushTimer);
      this.autoFlushTimer = null;
    }
  }

  private rollbackPollutedInput(code: string) {
    if (!this.config.preventInputPollution || !this.activeInputAtBurstStart) return;
    const { el, initialValue } = this.activeInputAtBurstStart;
    this.activeInputAtBurstStart = null;

    if (!el || !document.contains(el)) return;
    if (el.dataset.barcodeAllowInput === 'true') return;

    // Only rollback if the current value picked up the barcode burst
    if (el.value !== initialValue && (el.value.endsWith(code) || el.value.includes(code))) {
      try {
        setNativeInputValue(el, initialValue);
      } catch {
        el.value = initialValue;
      }
    }
  }

  private emitScan(
    rawCode: string,
    source: ScannedBarcodePayload['source'],
    durationMs: number,
    speedMsPerChar: number
  ) {
    const code = rawCode.trim();
    if (code.length < this.config.minBarcodeLength) return;

    this.lastScannedCode = code;
    this.scanCount += 1;

    const payload: ScannedBarcodePayload = {
      barcode: code,
      charCount: code.length,
      durationMs: Math.max(1, Math.round(durationMs)),
      speedMsPerChar: Number(speedMsPerChar.toFixed(1)),
      timestamp: new Date().toLocaleTimeString(),
      source
    };
    this.lastScanPayload = payload;

    // If hardware HID auto-detected without explicit paired entry yet, save a friendly paired indicator
    if (source === 'bluetooth_hid' && !this.pairedDevice) {
      this.pairedDevice = {
        name: 'Bluetooth Scanner (HID)',
        mode: 'hid',
        pairedAt: new Date().toISOString()
      };
      savePairedDeviceToStorage(this.pairedDevice);
    }

    this.listeners.forEach((fn) => fn(payload));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('pos:bluetooth_barcode_scanned', { detail: payload })
      );
    }

    this.notifyStatus();
  }

  private resetBuffer() {
    this.clearAutoFlushTimer();
    this.buffer = '';
    this.firstCharTime = 0;
    this.lastCharTime = 0;
    this.activeInputAtBurstStart = null;
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

        // Hardware HID scanners burst very quickly (< 85ms/char) or send >= 6 chars rapidly
        const isHardwareBurst = avgSpeed <= this.config.maxInterKeyDelayMs || this.buffer.length >= 8;

        if (isHardwareBurst) {
          e.preventDefault();
          e.stopPropagation();

          const code = this.buffer.trim();
          this.rollbackPollutedInput(code);
          this.resetBuffer();
          this.emitScan(code, 'bluetooth_hid', totalDuration, avgSpeed);
          return;
        }
      }

      this.resetBuffer();
      return;
    }

    // Single printable character collection
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // If pause between keystrokes was long, assume new sequence
      if (this.buffer.length > 0 && timeSinceLast > this.config.maxInterKeyDelayMs * 2.5) {
        this.resetBuffer();
      }

      if (this.buffer.length === 0) {
        this.firstCharTime = now;
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          this.activeInputAtBurstStart = {
            el: active,
            initialValue: active.value
          };
        } else {
          this.activeInputAtBurstStart = null;
        }
      }

      this.buffer += e.key;
      this.lastCharTime = now;

      // Fallback auto-flush for Bluetooth scanners configured WITHOUT Enter/Tab suffix
      this.clearAutoFlushTimer();
      if (typeof window !== 'undefined' && this.buffer.length >= 6) {
        this.autoFlushTimer = window.setTimeout(() => {
          const code = this.buffer.trim();
          const duration = this.lastCharTime - this.firstCharTime;
          const avg = code.length > 0 ? duration / code.length : 999;
          if (code.length >= 8 && avg <= 45 && /^[A-Za-z0-9\-_.]+$/.test(code)) {
            this.rollbackPollutedInput(code);
            this.resetBuffer();
            this.emitScan(code, 'bluetooth_hid', duration, avg);
          } else {
            this.resetBuffer();
          }
        }, 160);
      }
    }
  }

  /**
   * Mark any external HID Bluetooth scanner (already paired in OS Bluetooth settings) as paired in Kadi POS
   */
  public pairHidScanner(name = 'قارئ باركود بلوتوث (HID)'): PairedBluetoothScannerInfo {
    const info: PairedBluetoothScannerInfo = {
      name: name.trim() || 'قارئ باركود بلوتوث (HID)',
      mode: 'hid',
      pairedAt: new Date().toISOString()
    };
    this.pairedDevice = info;
    savePairedDeviceToStorage(info);
    this.init();
    this.notifyStatus();
    return info;
  }

  /**
   * Direct pairing via Web Bluetooth API (works on Chrome Android / Desktop for BLE GATT scanners)
   */
  public async pairWebBluetoothDevice(): Promise<{
    success: boolean;
    deviceName?: string;
    errorCode?: 'unsupported' | 'cancelled' | 'failed';
    errorMessage?: string;
  }> {
    type BleChar = {
      properties?: { notify?: boolean; indicate?: boolean };
      startNotifications: () => Promise<BleChar>;
      addEventListener: (evt: string, cb: (e: Event) => void) => void;
    };
    type BleService = {
      getCharacteristics: () => Promise<BleChar[]>;
    };
    type BleServer = {
      connected?: boolean;
      disconnect?: () => void;
      getPrimaryServices: () => Promise<BleService[]>;
    };
    type BleDevice = {
      id?: string;
      name?: string;
      gatt?: {
        connected?: boolean;
        connect: () => Promise<BleServer>;
        disconnect?: () => void;
      };
      addEventListener?: (evt: string, cb: () => void) => void;
    };

    const navBle = (
      typeof navigator !== 'undefined'
        ? (navigator as unknown as {
            bluetooth?: { requestDevice: (opts: unknown) => Promise<BleDevice> };
          }).bluetooth
        : undefined
    );

    if (!navBle) {
      return {
        success: false,
        errorCode: 'unsupported',
        errorMessage: 'Web Bluetooth not supported in this browser'
      };
    }

    try {
      const device = await navBle.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_SCANNER_SERVICES
      });

      const deviceName = device.name || 'Bluetooth Scanner';
      this.activeBleDevice = device;

      // Try connecting GATT & subscribing to barcode notifications if scanner supports BLE SPP/UART
      if (device.gatt) {
        try {
          const server = await device.gatt.connect();
          const services = await server.getPrimaryServices().catch(() => []);
          for (const service of services) {
            const chars = await service.getCharacteristics().catch(() => []);
            for (const ch of chars) {
              if (ch.properties?.notify || ch.properties?.indicate) {
                try {
                  await ch.startNotifications();
                  ch.addEventListener('characteristicvaluechanged', (ev: Event) => {
                    const target = ev.target as { value?: DataView } | null;
                    const dv = target?.value;
                    if (!dv) return;
                    const chunk = new TextDecoder().decode(dv.buffer);
                    this.bleTextBuffer += chunk;
                    if (this.bleTextBuffer.includes('\n') || this.bleTextBuffer.includes('\r')) {
                      const lines = this.bleTextBuffer.split(/[\r\n]+/);
                      this.bleTextBuffer = lines.pop() || '';
                      for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.length >= this.config.minBarcodeLength) {
                          this.emitScan(trimmed, 'web_bluetooth', 18, 2);
                        }
                      }
                    }
                  });
                } catch {
                  // Ignore characteristic if notification blocked
                }
              }
            }
          }
          device.addEventListener?.('gattserverdisconnected', () => {
            this.bleConnectedName = null;
            this.notifyStatus();
          });
        } catch {
          // Device may still operate as standard OS HID keyboard even if GATT fails
        }
      }

      this.bleConnectedName = deviceName;
      this.pairedDevice = {
        id: device.id,
        name: deviceName,
        mode: 'web_bluetooth',
        pairedAt: new Date().toISOString()
      };
      savePairedDeviceToStorage(this.pairedDevice);
      this.init();
      this.notifyStatus();

      return { success: true, deviceName };
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'NotFoundError') {
        return { success: false, errorCode: 'cancelled' };
      }
      return {
        success: false,
        errorCode: 'failed',
        errorMessage: e?.message || 'Bluetooth connection failed'
      };
    }
  }

  public unpairScanner() {
    try {
      if (this.activeBleDevice?.gatt?.connected) {
        this.activeBleDevice.gatt.disconnect?.();
      }
    } catch {
      // ignore
    }
    this.activeBleDevice = null;
    this.bleConnectedName = null;
    this.pairedDevice = null;
    savePairedDeviceToStorage(null);
    this.notifyStatus();
  }

  /**
   * Simulate a hardware barcode scan (for offline testing in Settings)
   */
  public simulateScan(barcode: string) {
    const clean = barcode.trim();
    if (!clean) return;
    this.emitScan(clean, 'manual', Math.max(12, clean.length * 4), 4);
  }

  public getLastScannedCode(): string {
    return this.lastScannedCode;
  }

  public destroy() {
    this.resetBuffer();
    if (typeof window !== 'undefined' && this.isListening) {
      window.removeEventListener('keydown', this.handleKeyDown, { capture: true });
      this.isListening = false;
    }
    this.listeners.clear();
    this.statusListeners.clear();
  }
}

export const bluetoothScanner = new BluetoothScannerManager();

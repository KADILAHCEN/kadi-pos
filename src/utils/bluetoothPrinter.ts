import { Order, StoreSettings } from '../types';
import { generateQRMatrix } from './zatca';
import { CustomerDebtInvoiceData } from './debtInvoice';

// Common BLE Thermal Printer GATT Service & Characteristic UUIDs
const KNOWN_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic BLE Thermal Printer (Xprinter, Rongta, Zjiang, Goojprt)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / Microchip BLE UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Star / Bixolon / Sunmi BLE
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / Serial BLE
  '0000ff00-0000-1000-8000-00805f9b34fb', // Generic Printer BLE
  '0000ae30-0000-1000-8000-00805f9b34fb', // Mini Thermal Printer BLE
  '0000fee7-0000-1000-8000-00805f9b34fb',
  'generic_access'
];

export type BluetoothPrinterStatus = 'disconnected' | 'connecting' | 'connected' | 'printing';

export interface BluetoothPrinterState {
  status: BluetoothPrinterStatus;
  deviceName: string | null;
  error: string | null;
}

type PrinterListener = (state: BluetoothPrinterState) => void;

interface BleDevice {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<BleServer>;
    disconnect: () => void;
  };
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

interface BleServer {
  connected: boolean;
  getPrimaryServices: () => Promise<BleService[]>;
}

interface BleService {
  uuid: string;
  getCharacteristics: () => Promise<BleCharacteristic[]>;
}

interface BleCharacteristic {
  uuid: string;
  properties: {
    write: boolean;
    writeWithoutResponse: boolean;
  };
  writeValue: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
}

class BluetoothPrinterManager {
  private device: BleDevice | null = null;
  private characteristic: BleCharacteristic | null = null;
  private listeners: Set<PrinterListener> = new Set();

  private state: BluetoothPrinterState = {
    status: 'disconnected',
    deviceName: null,
    error: null
  };

  private setState(partial: Partial<BluetoothPrinterState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((cb) => cb(this.state));
  }

  public getState(): BluetoothPrinterState {
    return this.state;
  }

  public subscribe(listener: PrinterListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isWebBluetoothSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public isConnected(): boolean {
    return Boolean(this.device?.gatt?.connected && this.characteristic);
  }

  private handleDisconnected = () => {
    this.characteristic = null;
    this.setState({
      status: 'disconnected',
      error: null
    });
  };

  public async connect(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isWebBluetoothSupported()) {
      const msg =
        'متصفحك الحالي لا يدعم Web Bluetooth API مباشرة. استخدم متصفح Chrome أو Edge على أندرويد/الكمبيوتر، أو استخدم طباعة النظام.';
      this.setState({ status: 'disconnected', error: msg });
      return { success: false, error: msg };
    }

    try {
      this.setState({ status: 'connecting', error: null });

      const navBle = (
        navigator as unknown as {
          bluetooth: { requestDevice: (opts: unknown) => Promise<BleDevice> };
        }
      ).bluetooth;

      const device = await navBle.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PRINTER_SERVICES
      });

      if (!device.gatt) {
        throw new Error('GATT server not available on this Bluetooth device.');
      }

      if (this.device) {
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
      }

      this.device = device;
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();

      let foundChar: BleCharacteristic | null = null;

      // Prefer characteristic with writeWithoutResponse or write
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.writeWithoutResponse || char.properties.write) {
              foundChar = char;
              break;
            }
          }
          if (foundChar) break;
        } catch {
          // Some protected GAP/GATT services cannot be queried; skip them
        }
      }

      if (!foundChar) {
        device.gatt.disconnect();
        throw new Error(
          'لم يتم العثور على قناة كتابة ESC/POS صالحة في هذا الجهاز. تأكد من أن الجهاز طابعة حرارية تدعم BLE.'
        );
      }

      this.characteristic = foundChar;
      const name = device.name || 'Bluetooth Thermal Printer';
      this.setState({
        status: 'connected',
        deviceName: name,
        error: null
      });

      return { success: true, deviceName: name };
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      // User cancelled picker
      if (errorObj?.name === 'NotFoundError') {
        this.setState({ status: this.isConnected() ? 'connected' : 'disconnected', error: null });
        return { success: false };
      }

      const msg = errorObj?.message || 'فشل الاتصال بطابعة البلوتوث';
      this.setState({ status: 'disconnected', error: msg });
      return { success: false, error: msg };
    }
  }

  public disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.characteristic = null;
    this.setState({
      status: 'disconnected',
      deviceName: null,
      error: null
    });
  }

  public async sendRawBytes(bytes: Uint8Array): Promise<void> {
    if (!this.characteristic || !this.device?.gatt?.connected) {
      throw new Error('طابعة البلوتوث غير متصلة');
    }

    const chunkSize = 100;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const slice = bytes.slice(offset, offset + chunkSize);
      if (this.characteristic.properties.writeWithoutResponse && this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(slice);
      } else {
        await this.characteristic.writeValue(slice);
      }
      // Small delay so thermal printer BLE buffer stays clear
      await new Promise((res) => setTimeout(res, 12));
    }
  }

  // Convert an HTML5 Canvas into ESC/POS GS v 0 monochrome raster bitmap + feed + cut
  private canvasToEscPosBytes(canvas: HTMLCanvasElement): Uint8Array {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array(0);

    const width = canvas.width;
    const height = canvas.height;
    const widthBytes = Math.ceil(width / 8);
    const imgData = ctx.getImageData(0, 0, width, height).data;

    // Header: ESC @ (Initialize), ESC a 1 (Center align)
    const initCmd = [0x1b, 0x40, 0x1b, 0x61, 0x01];
    // GS v 0 m xL xH yL yH
    const rasterHeader = [
      0x1d,
      0x76,
      0x30,
      0x00,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff
    ];

    const bitmapSize = widthBytes * height;
    const feedAndCut = [
      0x1b, 0x64, 0x04, // ESC d 4 (Feed 4 lines)
      0x1d, 0x56, 0x42, 0x00 // GS V 66 0 (Feed & Cut)
    ];

    const buffer = new Uint8Array(
      initCmd.length + rasterHeader.length + bitmapSize + feedAndCut.length
    );

    let offset = 0;
    buffer.set(initCmd, offset);
    offset += initCmd.length;
    buffer.set(rasterHeader, offset);
    offset += rasterHeader.length;

    for (let y = 0; y < height; y++) {
      for (let byteX = 0; byteX < widthBytes; byteX++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteX * 8 + bit;
          if (x < width) {
            const idx = (y * width + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // Black dot if darker than threshold
            if (lum < 160) {
              byteVal |= 1 << (7 - bit);
            }
          }
        }
        buffer[offset++] = byteVal;
      }
    }

    buffer.set(feedAndCut, offset);
    return buffer;
  }

  public async printTestPage(
    storeName: string,
    paperWidth: '80mm' | '58mm',
    language: 'ar' | 'fr' | 'en'
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected()) {
      return { success: false, error: 'الرجاء ربط طابعة البلوتوث أولاً' };
    }

    try {
      this.setState({ status: 'printing', error: null });
      const isAr = language === 'ar';
      const width = paperWidth === '58mm' ? 384 : 576;
      const height = 340;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.direction = isAr ? 'rtl' : 'ltr';

      ctx.font = `bold ${paperWidth === '58mm' ? 24 : 30}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
      ctx.fillText(storeName || 'KADI POS', width / 2, 46);

      ctx.font = `bold ${paperWidth === '58mm' ? 18 : 22}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
      ctx.fillText(
        isAr ? 'اختبار طابعة البلوتوث الحرارية' : 'Bluetooth Thermal Printer Test',
        width / 2,
        88
      );

      // Dashed separator
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(16, 110);
      ctx.lineTo(width - 16, 110);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `${paperWidth === '58mm' ? 16 : 19}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
      ctx.fillText(
        isAr ? `مقاس الورق: ${paperWidth} · الاتصال ناجح` : `Paper: ${paperWidth} · Connected OK`,
        width / 2,
        150
      );

      ctx.font = `bold ${paperWidth === '58mm' ? 15 : 18}px monospace`;
      ctx.fillText(new Date().toLocaleString('en-GB'), width / 2, 190);

      ctx.font = `bold ${paperWidth === '58mm' ? 18 : 22}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
      ctx.fillText(
        isAr ? 'جاهز لطباعة الفواتير العربية و QR' : 'Ready for Receipts & QR Codes',
        width / 2,
        245
      );

      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(16, 275);
      ctx.lineTo(width - 16, 275);
      ctx.stroke();

      const bytes = this.canvasToEscPosBytes(canvas);
      await this.sendRawBytes(bytes);

      this.setState({ status: 'connected', error: null });
      return { success: true };
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'فشل الطباعة عبر البلوتوث';
      this.setState({ status: this.isConnected() ? 'connected' : 'disconnected', error: msg });
      return { success: false, error: msg };
    }
  }

  public async printOrderReceipt(
    order: Order,
    settings: StoreSettings,
    currencySymbol: string,
    language: 'ar' | 'fr' | 'en'
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected()) {
      return { success: false, error: 'طابعة البلوتوث غير متصلة' };
    }

    try {
      this.setState({ status: 'printing', error: null });

      const isAr = language === 'ar';
      const paperWidth = settings.receiptPaperWidth || '80mm';
      const width = paperWidth === '58mm' ? 384 : 576;
      const isNarrow = paperWidth === '58mm';
      const pad = isNarrow ? 12 : 18;
      const fontBase = isNarrow ? 16 : 20;
      const lineH = isNarrow ? 26 : 32;

      // Pre-calculate total height accurately
      const itemsHeight = order.items.length * (lineH + 6);
      const qrSize = isNarrow ? 150 : 180;
      const extraLines =
        (order.discountTotal > 0 ? 1 : 0) +
        (order.customerName ? 1 : 0) +
        (order.amountTendered && order.amountTendered > order.grandTotal ? 2 : 0);
      const totalHeight = 360 + itemsHeight + extraLines * lineH + qrSize + 120;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, totalHeight);
      ctx.fillStyle = '#000000';

      let y = 36;
      const drawCentered = (txt: string, size: number, bold = false) => {
        ctx.save();
        ctx.font = `${bold ? 'bold ' : ''}${size}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
        ctx.textAlign = 'center';
        ctx.direction = isAr ? 'rtl' : 'ltr';
        ctx.fillText(txt, width / 2, y, width - pad * 2);
        ctx.restore();
      };

      const drawRow = (label: string, val: string, bold = false, size = fontBase) => {
        ctx.save();
        ctx.font = `${bold ? 'bold ' : ''}${size}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
        if (isAr) {
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillText(label, width - pad, y, width * 0.58);
          ctx.direction = 'ltr';
          ctx.textAlign = 'left';
          ctx.fillText(val, pad, y, width * 0.38);
        } else {
          ctx.direction = 'ltr';
          ctx.textAlign = 'left';
          ctx.fillText(label, pad, y, width * 0.58);
          ctx.textAlign = 'right';
          ctx.fillText(val, width - pad, y, width * 0.38);
        }
        ctx.restore();
      };

      const drawDash = () => {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(width - pad, y);
        ctx.stroke();
        ctx.restore();
      };

      // Header
      drawCentered(settings.storeName || 'KADI POS', isNarrow ? 24 : 30, true);
      y += isNarrow ? 26 : 32;
      if (settings.address) {
        drawCentered(settings.address, isNarrow ? 14 : 17, false);
        y += isNarrow ? 22 : 26;
      }
      if (settings.phone) {
        drawCentered(settings.phone, isNarrow ? 15 : 18, true);
        y += isNarrow ? 22 : 26;
      }

      drawCentered(isAr ? 'فاتورة ضريبية مبسطة' : 'SIMPLIFIED TAX INVOICE', isNarrow ? 15 : 18, true);
      y += 14;
      drawDash();
      y += lineH;

      // Metadata
      drawRow(isAr ? 'رقم الفاتورة:' : 'Invoice #:', order.orderNumber, true);
      y += lineH;
      drawRow(
        isAr ? 'التاريخ:' : 'Date:',
        `${new Date(order.date).toLocaleDateString()} ${new Date(order.date).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })}`
      );
      y += lineH;
      drawRow(isAr ? 'الكاشير:' : 'Cashier:', order.cashierName || '-');
      y += lineH;
      if (settings.taxNumber) {
        drawRow(isAr ? 'الرقم الضريبي:' : 'Tax ID:', settings.taxNumber);
        y += lineH;
      }
      if (order.customerName) {
        drawRow(isAr ? 'العميل:' : 'Customer:', order.customerName, true);
        y += lineH;
      }

      y -= 6;
      drawDash();
      y += lineH;

      // Items header
      drawRow(isAr ? 'السلعة × الكمية' : 'Item × Qty', isAr ? 'المجموع' : 'Total', true);
      y += lineH - 4;
      drawDash();
      y += lineH;

      // Items
      order.items.forEach((it) => {
        const leftTxt = `${it.productName} (${it.quantity})`;
        const rightTxt = `${it.total.toFixed(2)} ${currencySymbol}`;
        drawRow(leftTxt, rightTxt, false);
        y += lineH + 4;
      });

      drawDash();
      y += lineH;

      // Totals
      drawRow(
        isAr ? 'المجموع الفرعي:' : 'Subtotal:',
        `${order.subtotal.toFixed(2)} ${currencySymbol}`
      );
      y += lineH;

      if (order.discountTotal > 0) {
        drawRow(
          isAr ? 'الخصم:' : 'Discount:',
          `-${order.discountTotal.toFixed(2)} ${currencySymbol}`,
          true
        );
        y += lineH;
      }

      drawRow(
        isAr ? 'الضريبة:' : 'Tax:',
        `${order.taxTotal.toFixed(2)} ${currencySymbol}`
      );
      y += lineH;

      drawRow(
        isAr ? 'الإجمالي النهائي:' : 'TOTAL:',
        `${order.grandTotal.toFixed(2)} ${currencySymbol}`,
        true,
        isNarrow ? 20 : 25
      );
      y += lineH + 6;

      drawDash();
      y += lineH;

      drawRow(isAr ? 'طريقة الدفع:' : 'Payment:', order.paymentMethod.toUpperCase(), true);
      y += lineH;

      if (order.amountTendered && order.amountTendered > order.grandTotal) {
        drawRow(
          isAr ? 'المدفوع:' : 'Paid:',
          `${order.amountTendered.toFixed(2)} ${currencySymbol}`
        );
        y += lineH;
        drawRow(
          isAr ? 'الباقي:' : 'Change:',
          `${(order.changeAmount || 0).toFixed(2)} ${currencySymbol}`,
          true
        );
        y += lineH;
      }

      // QR Code
      y += 10;
      const qrMatrix = generateQRMatrix(order.zatcaQrString || order.orderNumber, 25);
      const cellSize = Math.floor(qrSize / qrMatrix.length);
      const actualQrPx = cellSize * qrMatrix.length;
      const qrStartX = Math.floor((width - actualQrPx) / 2);

      qrMatrix.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          if (cell) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(qrStartX + cIdx * cellSize, y + rIdx * cellSize, cellSize, cellSize);
          }
        });
      });

      y += actualQrPx + 30;
      drawCentered(
        settings.receiptFooterMsg || (isAr ? 'شكراً لتسوقكم معنا' : 'Thank you!'),
        isNarrow ? 15 : 18,
        true
      );
      y += 28;

      // Crop canvas tightly to used height
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = width;
      finalCanvas.height = Math.min(totalHeight, y + 10);
      finalCanvas.getContext('2d')!.drawImage(canvas, 0, 0);

      const escPosBytes = this.canvasToEscPosBytes(finalCanvas);
      await this.sendRawBytes(escPosBytes);

      this.setState({ status: 'connected', error: null });
      return { success: true };
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'فشل إرسال الفاتورة للطابعة';
      this.setState({ status: this.isConnected() ? 'connected' : 'disconnected', error: msg });
      return { success: false, error: msg };
    }
  }

  public async printCustomerDebtInvoice(
    data: CustomerDebtInvoiceData,
    settings: StoreSettings,
    currencySymbol: string,
    language: 'ar' | 'fr' | 'en'
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected()) {
      return { success: false, error: 'طابعة البلوتوث غير متصلة' };
    }

    try {
      this.setState({ status: 'printing', error: null });

      const { customer, purchaseItems, paymentItems, totalPurchasesDebt, totalPayments, remainingDebt } =
        data;
      const isAr = language === 'ar';
      const paperWidth = settings.receiptPaperWidth || '80mm';
      const width = paperWidth === '58mm' ? 384 : 576;
      const isNarrow = paperWidth === '58mm';
      const pad = isNarrow ? 12 : 18;
      const fontBase = isNarrow ? 15 : 19;
      const lineH = isNarrow ? 25 : 31;

      const rowsCount =
        purchaseItems.length + (paymentItems.length > 0 ? paymentItems.length + 2 : 0);
      const totalHeight = 360 + rowsCount * (lineH + 10) + 180;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, totalHeight);
      ctx.fillStyle = '#000000';

      let y = 36;
      const drawCentered = (txt: string, size: number, bold = false) => {
        ctx.save();
        ctx.font = `${bold ? 'bold ' : ''}${size}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
        ctx.textAlign = 'center';
        ctx.direction = isAr ? 'rtl' : 'ltr';
        ctx.fillText(txt, width / 2, y, width - pad * 2);
        ctx.restore();
      };

      const drawRow = (label: string, val: string, bold = false, size = fontBase) => {
        ctx.save();
        ctx.font = `${bold ? 'bold ' : ''}${size}px "Cairo", "Segoe UI", Tahoma, sans-serif`;
        if (isAr) {
          ctx.direction = 'rtl';
          ctx.textAlign = 'right';
          ctx.fillText(label, width - pad, y, width * 0.62);
          ctx.direction = 'ltr';
          ctx.textAlign = 'left';
          ctx.fillText(val, pad, y, width * 0.34);
        } else {
          ctx.direction = 'ltr';
          ctx.textAlign = 'left';
          ctx.fillText(label, pad, y, width * 0.62);
          ctx.textAlign = 'right';
          ctx.fillText(val, width - pad, y, width * 0.34);
        }
        ctx.restore();
      };

      const drawDash = () => {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(width - pad, y);
        ctx.stroke();
        ctx.restore();
      };

      drawCentered(settings.storeName || 'KADI POS', isNarrow ? 24 : 28, true);
      y += isNarrow ? 26 : 30;
      if (settings.phone) {
        drawCentered(settings.phone, isNarrow ? 15 : 17, true);
        y += isNarrow ? 22 : 26;
      }

      drawCentered(
        isAr ? 'فاتورة الدين بتفاصيل المشتريات' : 'CUSTOMER DEBT INVOICE',
        isNarrow ? 15 : 18,
        true
      );
      y += 14;
      drawDash();
      y += lineH;

      drawRow(isAr ? 'الزبون:' : 'Customer:', customer.name, true);
      y += lineH;
      drawRow(isAr ? 'الهاتف:' : 'Phone:', customer.phone);
      y += lineH;
      drawRow(
        isAr ? 'التاريخ:' : 'Date:',
        new Date().toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR')
      );
      y += lineH;

      drawDash();
      y += lineH;

      drawRow(isAr ? 'السلعة × الكمية' : 'Item × Qty', isAr ? 'المجموع' : 'Total', true);
      y += lineH - 4;
      drawDash();
      y += lineH;

      purchaseItems.forEach((it) => {
        const title = `${it.description} (${it.quantity} × ${it.unitPrice.toFixed(2)})`;
        drawRow(title, `${it.total.toFixed(2)} ${currencySymbol}`, false);
        y += lineH + 4;
      });

      if (paymentItems.length > 0) {
        drawDash();
        y += lineH;
        drawRow(isAr ? 'الدفعات المسددة:' : 'Payments:', '', true);
        y += lineH;
        paymentItems.forEach((pay) => {
          const dStr = new Date(pay.date).toLocaleDateString(isAr ? 'ar-MA' : 'fr-FR', {
            month: 'numeric',
            day: 'numeric'
          });
          drawRow(`${dStr} · ${pay.notes}`, `-${pay.amount.toFixed(2)} ${currencySymbol}`, false);
          y += lineH + 2;
        });
      }

      drawDash();
      y += lineH;

      drawRow(
        isAr ? 'إجمالي المشتريات:' : 'Total Purchases:',
        `${totalPurchasesDebt.toFixed(2)} ${currencySymbol}`
      );
      y += lineH;
      drawRow(
        isAr ? '(-) مجموع المدفوع:' : '(-) Total Paid:',
        `-${totalPayments.toFixed(2)} ${currencySymbol}`
      );
      y += lineH;
      drawRow(
        isAr ? 'الباقي المستحق:' : 'BALANCE DUE:',
        `${remainingDebt.toFixed(2)} ${currencySymbol}`,
        true,
        isNarrow ? 19 : 24
      );
      y += lineH + 16;

      drawCentered(
        settings.receiptFooterMsg || (isAr ? 'شكراً لتعاملكم وثقتكم' : 'Thank you!'),
        isNarrow ? 14 : 17,
        true
      );
      y += 28;

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = width;
      finalCanvas.height = Math.min(totalHeight, y + 10);
      finalCanvas.getContext('2d')!.drawImage(canvas, 0, 0);

      const escPosBytes = this.canvasToEscPosBytes(finalCanvas);
      await this.sendRawBytes(escPosBytes);

      this.setState({ status: 'connected', error: null });
      return { success: true };
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'فشل إرسال فاتورة الدين للطابعة';
      this.setState({ status: this.isConnected() ? 'connected' : 'disconnected', error: msg });
      return { success: false, error: msg };
    }
  }
}

export const bluetoothPrinter = new BluetoothPrinterManager();

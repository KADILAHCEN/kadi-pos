import { Category, Product, StoreSettings } from '../types';

export interface ExportableCatalogItem {
  id: string;
  name: string;
  nameEn: string;
  sku: string;
  barcode: string;
  categoryId: string;
  categoryName: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  unitType: string;
  imageDataUrl?: string;
}

export function utf8StringToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

async function compressImageUrlToDataUrl(src: string, maxDim = 180): Promise<string | undefined> {
  if (!src) return undefined;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => {
      resolve(src.startsWith('data:') ? src : undefined);
    }, 3500);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const w0 = img.naturalWidth || img.width || 120;
        const h0 = img.naturalHeight || img.height || 120;
        const scale = Math.min(1, maxDim / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src.startsWith('data:') ? src : undefined);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      } catch {
        resolve(src.startsWith('data:') ? src : undefined);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(src.startsWith('data:') ? src : undefined);
    };

    img.src = src;
  });
}

export async function prepareCatalogExportItems(
  products: Product[],
  categories: Category[],
  includeImages = true
): Promise<ExportableCatalogItem[]> {
  const catMap = new Map<string, string>();
  categories.forEach((c) => catMap.set(c.id, c.name));

  const items: ExportableCatalogItem[] = [];
  for (const p of products) {
    let imageDataUrl: string | undefined;
    if (includeImages && p.image) {
      imageDataUrl = await compressImageUrlToDataUrl(p.image, 160);
    }

    items.push({
      id: p.id,
      name: p.name,
      nameEn: p.nameEn || p.name,
      sku: p.sku || '',
      barcode: p.barcode || '',
      categoryId: p.categoryId,
      categoryName: catMap.get(p.categoryId) || 'عام',
      price: Number((p.price || 0).toFixed(2)),
      costPrice: Number((p.costPrice || 0).toFixed(2)),
      stock: Number((p.stock || 0).toFixed(2)),
      lowStockThreshold: Number(p.lowStockThreshold || 5),
      unitType: p.unitType || 'piece',
      imageDataUrl
    });
  }
  return items;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPortableCatalogHtml(params: {
  items: ExportableCatalogItem[];
  settings: StoreSettings;
  currencySymbol: string;
  note?: string;
}): string {
  const { items, settings, currencySymbol, note } = params;
  const totalRetail = items.reduce((s, it) => s + it.price * Math.max(0, it.stock), 0);
  const totalCost = items.reduce((s, it) => s + it.costPrice * Math.max(0, it.stock), 0);
  const withPhotosCount = items.filter((it) => Boolean(it.imageDataUrl)).length;
  const dateLabel = new Date().toLocaleString('ar-MA');

  const rowsHtml = items
    .map((item, idx) => {
      const thumb = item.imageDataUrl
        ? `<img src="${item.imageDataUrl}" alt="${escapeHtml(item.name)}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;border:1px solid #e2e8f0;background:#fff;" />`
        : `<div style="width:56px;height:56px;border-radius:10px;background:#ecfdf5;color:#059669;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;border:1px solid #a7f3d0;">${escapeHtml(
            item.name.slice(0, 2)
          )}</div>`;

      return `
        <tr data-search="${escapeHtml(`${item.name} ${item.nameEn} ${item.sku} ${item.barcode} ${item.categoryName}`.toLowerCase())}" style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px;text-align:center;color:#64748b;font-weight:700;">${idx + 1}</td>
          <td style="padding:10px;">${thumb}</td>
          <td style="padding:10px;">
            <div style="font-weight:800;color:#0f172a;font-size:14px;">${escapeHtml(item.name)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(item.categoryName)}${
              item.sku ? ` · SKU: ${escapeHtml(item.sku)}` : ''
            }${item.barcode ? ` · ${escapeHtml(item.barcode)}` : ''}</div>
          </td>
          <td style="padding:10px;font-weight:900;color:#059669;font-size:15px;white-space:nowrap;">${item.price.toFixed(
            2
          )} ${escapeHtml(currencySymbol)}</td>
          <td style="padding:10px;color:#475569;font-weight:700;white-space:nowrap;">${item.costPrice.toFixed(
            2
          )} ${escapeHtml(currencySymbol)}</td>
          <td style="padding:10px;font-weight:800;color:${item.stock <= item.lowStockThreshold ? '#e11d48' : '#0f172a'};">${
            item.stock
          } ${escapeHtml(item.unitType)}</td>
        </tr>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>كتالوج السلع والصور والأثمان - ${escapeHtml(settings.storeName)}</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; background:#f8fafc; color:#0f172a; margin:0; padding:20px; }
    .container { max-width:1050px; margin:0 auto; background:#fff; border-radius:20px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06); }
    .header { background:linear-gradient(135deg,#064e3b,#0f172a); color:#fff; padding:22px 24px; }
    .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; padding:16px 24px; background:#f1f5f9; border-bottom:1px solid #e2e8f0; }
    .kpi { background:#fff; border-radius:14px; padding:12px 14px; border:1px solid #e2e8f0; }
    .kpi-label { font-size:11px; color:#64748b; font-weight:700; }
    .kpi-val { font-size:18px; font-weight:900; margin-top:4px; color:#0f172a; }
    .toolbar { padding:14px 24px; display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; border-bottom:1px solid #e2e8f0; }
    .search { flex:1; min-width:220px; padding:10px 14px; border-radius:12px; border:1px solid #cbd5e1; font-size:13px; }
    .btn { padding:10px 16px; border-radius:12px; border:none; background:#059669; color:#fff; font-weight:800; font-size:12px; cursor:pointer; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#f8fafc; text-align:right; padding:12px 10px; font-size:12px; color:#475569; border-bottom:2px solid #e2e8f0; }
    @media print { .toolbar { display:none; } body { padding:0; background:#fff; } .container { border:none; box-shadow:none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="margin:0;font-size:20px;">📦 سجل السلع بالصور والأثمان — ${escapeHtml(settings.storeName)}</h1>
          <div style="font-size:12px;color:#a7f3d0;margin-top:4px;">تاريخ التصدير: ${escapeHtml(dateLabel)}</div>
        </div>
        ${settings.phone ? `<div style="font-size:12px;color:#e2e8f0;">📞 ${escapeHtml(settings.phone)}</div>` : ''}
      </div>
      ${note ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(255,255,255,0.12);border-radius:10px;font-size:12px;">📝 ${escapeHtml(note)}</div>` : ''}
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-label">عدد السلع المسجلة</div><div class="kpi-val">${items.length}</div></div>
      <div class="kpi"><div class="kpi-label">سلع مرفقة بصور</div><div class="kpi-val" style="color:#059669;">${withPhotosCount}</div></div>
      <div class="kpi"><div class="kpi-label">قيمة البيع الإجمالية</div><div class="kpi-val" style="color:#059669;">${totalRetail.toFixed(2)} ${escapeHtml(currencySymbol)}</div></div>
      <div class="kpi"><div class="kpi-label">قيمة الشراء الإجمالية</div><div class="kpi-val">${totalCost.toFixed(2)} ${escapeHtml(currencySymbol)}</div></div>
    </div>

    <div class="toolbar">
      <input class="search" type="text" placeholder="ابحث باسم السلعة، الفئة أو الباركود..." oninput="filterRows(this.value)" />
      <button class="btn" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
    </div>

    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th style="text-align:center;">#</th>
            <th>الصورة</th>
            <th>السلعة والتصنيف</th>
            <th>ثمن البيع</th>
            <th>ثمن الشراء</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody id="catalog-body">${rowsHtml}</tbody>
      </table>
    </div>
  </div>
  <script>
    function filterRows(q) {
      var val = (q || '').trim().toLowerCase();
      var rows = document.querySelectorAll('#catalog-body tr');
      for (var i = 0; i < rows.length; i++) {
        var hay = rows[i].getAttribute('data-search') || '';
        rows[i].style.display = !val || hay.indexOf(val) !== -1 ? '' : 'none';
      }
    }
  </script>
</body>
</html>`;
}

export function buildPortableCatalogJson(params: {
  items: ExportableCatalogItem[];
  settings: StoreSettings;
  currencySymbol: string;
}): string {
  return JSON.stringify(
    {
      format: 'KadiPOS_Catalog_With_Images_v1',
      exportedAt: new Date().toISOString(),
      storeName: params.settings.storeName,
      currencySymbol: params.currencySymbol,
      count: params.items.length,
      products: params.items
    },
    null,
    2
  );
}

export function buildCatalogEmailSummaryHtml(params: {
  items: ExportableCatalogItem[];
  settings: StoreSettings;
  currencySymbol: string;
  note?: string;
}): string {
  const previewRows = params.items
    .slice(0, 25)
    .map(
      (it) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">${escapeHtml(it.name)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">${escapeHtml(it.categoryName)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#059669;font-weight:800;">${it.price.toFixed(
          2
        )} ${escapeHtml(params.currencySymbol)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.stock} ${escapeHtml(it.unitType)}</td>
      </tr>`
    )
    .join('');

  return `
  <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="background:#065f46;color:#ffffff;padding:18px 20px;">
      <h2 style="margin:0;font-size:18px;">📦 ملف السلع والصور والأثمان — ${escapeHtml(params.settings.storeName)}</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#d1fae5;">تم إرفاق الملف الكامل (${params.items.length} سلعة مع الصور والأثمان) في المرفقات أدناه.</p>
    </div>
    <div style="padding:18px 20px;font-size:13px;color:#1e293b;">
      ${params.note ? `<p style="background:#f1f5f9;padding:10px 12px;border-radius:10px;margin-top:0;">📝 <strong>ملاحظة:</strong> ${escapeHtml(params.note)}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;text-align:right;">
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">السلعة</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">الفئة</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">ثمن البيع</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">الكمية</th>
          </tr>
        </thead>
        <tbody>${previewRows}</tbody>
      </table>
      ${
        params.items.length > 25
          ? `<p style="font-size:11px;color:#64748b;margin-top:10px;">... والمزيد (${params.items.length - 25} سلعة أخرى موجودة كاملة مع صورها في الملف المرفق).</p>`
          : ''
      }
    </div>
  </div>`;
}

export function triggerTextFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.dispatchEvent(new CustomEvent('kadi:pdf-ready', { detail: { blobUrl: url, filename } }));
}

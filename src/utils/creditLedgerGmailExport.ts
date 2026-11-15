import { CreditTransaction, Customer, StoreSettings } from '../types';

export type CreditLedgerExportScope = 'all' | 'debtors';

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface CreditCustomerSummaryRow {
  customer: Customer;
  totalDebtTaken: number;
  totalPaid: number;
  txCount: number;
  latestTxDate?: string;
  isOverLimit: boolean;
}

export function computeCreditLedgerAnalytics(
  customers: Customer[],
  creditTransactions: CreditTransaction[],
  scope: CreditLedgerExportScope = 'all'
) {
  const txByCustomer = new Map<string, CreditTransaction[]>();
  for (const tx of creditTransactions) {
    const arr = txByCustomer.get(tx.customerId) || [];
    arr.push(tx);
    txByCustomer.set(tx.customerId, arr);
  }

  const scopedCustomers =
    scope === 'debtors' ? customers.filter((c) => c.balance > 0) : [...customers];

  const scopedCustomerIds = new Set(scopedCustomers.map((c) => c.id));
  const scopedTransactions = creditTransactions
    .filter((tx) => scopedCustomerIds.has(tx.customerId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const customerRows: CreditCustomerSummaryRow[] = scopedCustomers
    .map((c) => {
      const list = txByCustomer.get(c.id) || [];
      let totalDebtTaken = 0;
      let totalPaid = 0;
      let latestTxDate: string | undefined;

      for (const tx of list) {
        if (tx.type === 'debt') totalDebtTaken += tx.amount;
        else totalPaid += tx.amount;
        if (!latestTxDate || new Date(tx.date) > new Date(latestTxDate)) {
          latestTxDate = tx.date;
        }
      }

      const isOverLimit = Boolean(c.creditLimit && c.creditLimit > 0 && c.balance > c.creditLimit);
      return {
        customer: c,
        totalDebtTaken,
        totalPaid,
        txCount: list.length,
        latestTxDate,
        isOverLimit
      };
    })
    .sort((a, b) => b.customer.balance - a.customer.balance || a.customer.name.localeCompare(b.customer.name));

  const totalOutstandingDebt = customerRows.reduce((s, r) => s + Math.max(0, r.customer.balance), 0);
  const debtorsCount = customerRows.filter((r) => r.customer.balance > 0).length;
  const overLimitCount = customerRows.filter((r) => r.isOverLimit).length;
  const totalDebtsRecorded = scopedTransactions
    .filter((tx) => tx.type === 'debt')
    .reduce((s, tx) => s + tx.amount, 0);
  const totalPaymentsReceived = scopedTransactions
    .filter((tx) => tx.type === 'payment')
    .reduce((s, tx) => s + tx.amount, 0);
  const collectionRatePct =
    totalDebtsRecorded > 0
      ? Math.min(100, Math.round((totalPaymentsReceived / totalDebtsRecorded) * 100))
      : totalOutstandingDebt === 0
      ? 100
      : 0;

  return {
    customerRows,
    scopedCustomers,
    scopedTransactions,
    totalOutstandingDebt,
    debtorsCount,
    overLimitCount,
    totalDebtsRecorded,
    totalPaymentsReceived,
    collectionRatePct
  };
}

export function buildPortableCreditLedgerHtml(params: {
  customers: Customer[];
  creditTransactions: CreditTransaction[];
  settings: StoreSettings;
  currencySymbol: string;
  scope?: CreditLedgerExportScope;
  note?: string;
}): string {
  const { customers, creditTransactions, settings, currencySymbol, scope = 'all', note } = params;
  const analytics = computeCreditLedgerAnalytics(customers, creditTransactions, scope);
  const dateLabel = new Date().toLocaleString('ar-MA');

  const customerTableRows = analytics.customerRows
    .map((row, idx) => {
      const c = row.customer;
      const statusBadge = row.isOverLimit
        ? `<span style="background:#ffe4e6;color:#be123c;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:800;">تجاوز السقف</span>`
        : c.balance > 0
        ? `<span style="background:#fef3c7;color:#b45309;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:800;">عليه كريدي</span>`
        : `<span style="background:#d1fae5;color:#047857;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:800;">خالص</span>`;

      const lastDateText = row.latestTxDate
        ? new Date(row.latestTxDate).toLocaleDateString('ar-MA')
        : '—';

      return `
        <tr data-kind="${row.isOverLimit ? 'over' : c.balance > 0 ? 'debtor' : 'settled'}" data-search="${escapeHtml(
        `${c.name} ${c.phone} ${c.notes || ''}`.toLowerCase()
      )}" style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px;text-align:center;color:#64748b;font-weight:700;">${idx + 1}</td>
          <td style="padding:10px;">
            <div style="font-weight:800;color:#0f172a;font-size:14px;">${escapeHtml(c.name)}</div>
            ${c.notes ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(c.notes)}</div>` : ''}
          </td>
          <td style="padding:10px;font-family:monospace;color:#334155;" dir="ltr">${escapeHtml(c.phone || '—')}</td>
          <td style="padding:10px;color:#b45309;font-weight:700;white-space:nowrap;">${row.totalDebtTaken.toFixed(
            2
          )} ${escapeHtml(currencySymbol)}</td>
          <td style="padding:10px;color:#059669;font-weight:700;white-space:nowrap;">${row.totalPaid.toFixed(
            2
          )} ${escapeHtml(currencySymbol)}</td>
          <td style="padding:10px;font-weight:900;font-size:14px;color:${
            c.balance > 0 ? '#d97706' : '#059669'
          };white-space:nowrap;">${c.balance.toFixed(2)} ${escapeHtml(currencySymbol)}</td>
          <td style="padding:10px;color:#64748b;font-size:12px;">${
            c.creditLimit ? `${c.creditLimit.toFixed(2)} ${escapeHtml(currencySymbol)}` : 'مفتوح'
          }</td>
          <td style="padding:10px;color:#64748b;font-size:12px;">${escapeHtml(lastDateText)} (${row.txCount})</td>
          <td style="padding:10px;">${statusBadge}</td>
        </tr>`;
    })
    .join('');

  const txTableRows = analytics.scopedTransactions
    .map((tx, idx) => {
      const isDebt = tx.type === 'debt';
      return `
        <tr data-search="${escapeHtml(
          `${tx.customerName} ${tx.notes || ''} ${tx.receiptNumber || ''}`.toLowerCase()
        )}" style="border-bottom:1px solid #e2e8f0;">
          <td style="padding:9px;text-align:center;color:#64748b;font-size:12px;">${idx + 1}</td>
          <td style="padding:9px;font-size:12px;color:#334155;white-space:nowrap;">${escapeHtml(
            new Date(tx.date).toLocaleString('ar-MA')
          )}</td>
          <td style="padding:9px;font-weight:800;color:#0f172a;">${escapeHtml(tx.customerName)}</td>
          <td style="padding:9px;">
            <span style="padding:3px 8px;border-radius:8px;font-size:11px;font-weight:800;background:${
              isDebt ? '#fef3c7' : '#d1fae5'
            };color:${isDebt ? '#b45309' : '#047857'};">
              ${isDebt ? 'تقييد كريدي (+)' : 'تسديد دفعة (-)'}
            </span>
          </td>
          <td style="padding:9px;font-weight:900;color:${
            isDebt ? '#d97706' : '#059669'
          };white-space:nowrap;">${isDebt ? '+' : '-'}${tx.amount.toFixed(2)} ${escapeHtml(currencySymbol)}</td>
          <td style="padding:9px;font-size:12px;color:#64748b;white-space:nowrap;">${tx.previousBalance.toFixed(
            2
          )} ➔ <strong>${tx.newBalance.toFixed(2)}</strong> ${escapeHtml(currencySymbol)}</td>
          <td style="padding:9px;font-size:12px;color:#475569;">${escapeHtml(
            [tx.receiptNumber, tx.notes].filter(Boolean).join(' · ') || '—'
          )}</td>
        </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>كناش الكريدي — ${escapeHtml(settings.storeName)}</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; background:#f8fafc; color:#0f172a; margin:0; padding:20px; }
    .container { max-width:1100px; margin:0 auto; background:#fff; border-radius:20px; border:1px solid #e2e8f0; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06); }
    .header { background:linear-gradient(135deg,#92400e,#0f172a); color:#fff; padding:22px 24px; }
    .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(175px,1fr)); gap:12px; padding:16px 24px; background:#fffbeb; border-bottom:1px solid #fde68a; }
    .kpi { background:#fff; border-radius:14px; padding:12px 14px; border:1px solid #fde68a; }
    .kpi-label { font-size:11px; color:#64748b; font-weight:700; }
    .kpi-val { font-size:18px; font-weight:900; margin-top:4px; color:#0f172a; }
    .toolbar { padding:14px 24px; display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; border-bottom:1px solid #e2e8f0; }
    .search { flex:1; min-width:220px; padding:10px 14px; border-radius:12px; border:1px solid #cbd5e1; font-size:13px; }
    .btn { padding:9px 14px; border-radius:12px; border:1px solid #cbd5e1; background:#fff; color:#0f172a; font-weight:800; font-size:12px; cursor:pointer; }
    .btn-primary { background:#d97706; color:#fff; border-color:#d97706; }
    .section-title { padding:14px 24px 8px; font-size:15px; font-weight:900; color:#0f172a; border-top:1px solid #e2e8f0; background:#f8fafc; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#f8fafc; text-align:right; padding:11px 10px; font-size:12px; color:#475569; border-bottom:2px solid #e2e8f0; }
    @media print { .toolbar { display:none; } body { padding:0; background:#fff; } .container { border:none; box-shadow:none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="margin:0;font-size:20px;">📒 كناش الكريدي وحسابات الزبناء — ${escapeHtml(settings.storeName)}</h1>
          <div style="font-size:12px;color:#fde68a;margin-top:4px;">تاريخ التصدير: ${escapeHtml(dateLabel)} · النطاق: ${
            scope === 'debtors' ? 'المدينون فقط (الرصيد > 0)' : 'كافة الزبناء وسجل الحركات'
          }</div>
        </div>
        ${settings.phone ? `<div style="font-size:12px;color:#e2e8f0;">📞 ${escapeHtml(settings.phone)}</div>` : ''}
      </div>
      ${note ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(255,255,255,0.12);border-radius:10px;font-size:12px;">📝 ${escapeHtml(note)}</div>` : ''}
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-label">إجمالي الكريدي المعلق بالمحل</div><div class="kpi-val" style="color:#d97706;">${analytics.totalOutstandingDebt.toFixed(2)} ${escapeHtml(currencySymbol)}</div></div>
      <div class="kpi"><div class="kpi-label">عدد الزبناء المدينين</div><div class="kpi-val">${analytics.debtorsCount} <span style="font-size:12px;color:#64748b;">من ${analytics.scopedCustomers.length}</span></div></div>
      <div class="kpi"><div class="kpi-label">إجمالي الديون المقيدة</div><div class="kpi-val">${analytics.totalDebtsRecorded.toFixed(2)} ${escapeHtml(currencySymbol)}</div></div>
      <div class="kpi"><div class="kpi-label">المحصّل (نسبة الاستخلاص)</div><div class="kpi-val" style="color:#059669;">${analytics.totalPaymentsReceived.toFixed(2)} ${escapeHtml(currencySymbol)} <span style="font-size:12px;">(${analytics.collectionRatePct}%)</span></div></div>
    </div>

    <div class="toolbar">
      <input id="qInput" class="search" type="text" placeholder="ابحث باسم الزبون، الهاتف أو الملاحظة..." oninput="applyFilters()" />
      <button class="btn" onclick="setKind('all')">الكل</button>
      <button class="btn" onclick="setKind('debtor')">المدينون فقط</button>
      <button class="btn" onclick="setKind('over')">تجاوزوا السقف (${analytics.overLimitCount})</button>
      <button class="btn btn-primary" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
    </div>

    <div class="section-title">👥 قائمة حسابات الزبناء في كناش الكريدي (${analytics.customerRows.length})</div>
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th style="text-align:center;">#</th>
            <th>الزبون</th>
            <th>الهاتف</th>
            <th>مجموع الديون</th>
            <th>مجموع الدفعات</th>
            <th>الباقي بذمته</th>
            <th>سقف الكريدي</th>
            <th>آخر حركة</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody id="customers-body">${customerTableRows}</tbody>
      </table>
    </div>

    <div class="section-title">🧾 سجل حركات الكريدي والأداء (${analytics.scopedTransactions.length} عملية)</div>
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th style="text-align:center;">#</th>
            <th>التاريخ والوقت</th>
            <th>الزبون</th>
            <th>نوع العملية</th>
            <th>المبلغ</th>
            <th>تطور الرصيد</th>
            <th>الوصل / ملاحظات</th>
          </tr>
        </thead>
        <tbody id="tx-body">${txTableRows}</tbody>
      </table>
    </div>
  </div>
  <script>
    var activeKind = 'all';
    function setKind(k) { activeKind = k; applyFilters(); }
    function applyFilters() {
      var val = (document.getElementById('qInput').value || '').trim().toLowerCase();
      var cRows = document.querySelectorAll('#customers-body tr');
      for (var i = 0; i < cRows.length; i++) {
        var hay = cRows[i].getAttribute('data-search') || '';
        var kind = cRows[i].getAttribute('data-kind') || '';
        var matchText = !val || hay.indexOf(val) !== -1;
        var matchKind = activeKind === 'all' || (activeKind === 'debtor' && (kind === 'debtor' || kind === 'over')) || kind === activeKind;
        cRows[i].style.display = (matchText && matchKind) ? '' : 'none';
      }
      var tRows = document.querySelectorAll('#tx-body tr');
      for (var j = 0; j < tRows.length; j++) {
        var tHay = tRows[j].getAttribute('data-search') || '';
        tRows[j].style.display = !val || tHay.indexOf(val) !== -1 ? '' : 'none';
      }
    }
  </script>
</body>
</html>`;
}

export function buildPortableCreditLedgerJson(params: {
  customers: Customer[];
  creditTransactions: CreditTransaction[];
  settings: StoreSettings;
  currencySymbol: string;
  scope?: CreditLedgerExportScope;
}): string {
  const { customers, creditTransactions, settings, currencySymbol, scope = 'all' } = params;
  const analytics = computeCreditLedgerAnalytics(customers, creditTransactions, scope);

  return JSON.stringify(
    {
      format: 'KadiPOS_CreditLedger_v1',
      exportedAt: new Date().toISOString(),
      storeName: settings.storeName,
      currencySymbol,
      scope,
      summary: {
        totalOutstandingDebt: Number(analytics.totalOutstandingDebt.toFixed(2)),
        debtorsCount: analytics.debtorsCount,
        totalCustomers: analytics.scopedCustomers.length,
        overLimitCount: analytics.overLimitCount,
        totalDebtsRecorded: Number(analytics.totalDebtsRecorded.toFixed(2)),
        totalPaymentsReceived: Number(analytics.totalPaymentsReceived.toFixed(2)),
        collectionRatePct: analytics.collectionRatePct
      },
      customers: analytics.scopedCustomers,
      creditTransactions: analytics.scopedTransactions
    },
    null,
    2
  );
}

export function buildCreditLedgerEmailSummaryHtml(params: {
  customers: Customer[];
  creditTransactions: CreditTransaction[];
  settings: StoreSettings;
  currencySymbol: string;
  scope?: CreditLedgerExportScope;
  note?: string;
}): string {
  const { customers, creditTransactions, settings, currencySymbol, scope = 'all', note } = params;
  const analytics = computeCreditLedgerAnalytics(customers, creditTransactions, scope);

  const topRows = analytics.customerRows
    .slice(0, 30)
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">${escapeHtml(r.customer.name)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;" dir="ltr">${escapeHtml(r.customer.phone || '—')}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#059669;">${r.totalPaid.toFixed(
          2
        )} ${escapeHtml(currencySymbol)}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:900;color:${
          r.customer.balance > 0 ? '#d97706' : '#059669'
        };">${r.customer.balance.toFixed(2)} ${escapeHtml(currencySymbol)}</td>
      </tr>`
    )
    .join('');

  return `
  <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="background:#92400e;color:#ffffff;padding:18px 20px;">
      <h2 style="margin:0;font-size:18px;">📒 كناش الكريدي — ${escapeHtml(settings.storeName)}</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#fef3c7;">مرفق ملف كناش الكريدي الكامل (${analytics.scopedCustomers.length} زبون · ${analytics.scopedTransactions.length} حركة دين/أداء).</p>
    </div>
    <div style="padding:18px 20px;font-size:13px;color:#1e293b;">
      ${note ? `<p style="background:#f8fafc;padding:10px 12px;border-radius:10px;margin-top:0;">📝 <strong>ملاحظة:</strong> ${escapeHtml(note)}</p>` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
        <div style="flex:1;min-width:140px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:10px;">
          <div style="font-size:11px;color:#92400e;">إجمالي الكريدي المعلق</div>
          <div style="font-size:17px;font-weight:900;color:#d97706;">${analytics.totalOutstandingDebt.toFixed(
            2
          )} ${escapeHtml(currencySymbol)}</div>
        </div>
        <div style="flex:1;min-width:140px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:10px;">
          <div style="font-size:11px;color:#065f46;">إجمالي المحصّل (${analytics.collectionRatePct}%)</div>
          <div style="font-size:17px;font-weight:900;color:#059669;">${analytics.totalPaymentsReceived.toFixed(
            2
          )} ${escapeHtml(currencySymbol)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;text-align:right;">
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">الزبون</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">الهاتف</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">المسدد</th>
            <th style="padding:8px;border-bottom:2px solid #cbd5e1;">الباقي بذمته</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>
      ${
        analytics.customerRows.length > 30
          ? `<p style="font-size:11px;color:#64748b;margin-top:10px;">... وبقية الزبناء (${analytics.customerRows.length - 30} زبون) وسجل كل الحركات موجودة بالكامل في الملفات المرفقة.</p>`
          : ''
      }
    </div>
  </div>`;
}

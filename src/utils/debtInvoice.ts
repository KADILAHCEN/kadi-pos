import { Customer, CreditTransaction, Order } from '../types';

export interface DebtPurchaseLineItem {
  id: string;
  date: string;
  sourceLabel: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  isLinkedOrderItem?: boolean;
}

export interface DebtPaymentLineItem {
  id: string;
  date: string;
  amount: number;
  notes: string;
  recordedBy: string;
}

export interface CustomerDebtInvoiceData {
  customer: Customer;
  purchaseItems: DebtPurchaseLineItem[];
  paymentItems: DebtPaymentLineItem[];
  totalPurchasesDebt: number;
  totalPayments: number;
  remainingDebt: number;
  ordersCount: number;
}

export function buildCustomerDebtInvoiceData(
  customer: Customer,
  creditTransactions: CreditTransaction[],
  orders: Order[],
  language: 'ar' | 'fr' | 'en' = 'ar'
): CustomerDebtInvoiceData {
  const isAr = language === 'ar';

  const custTxs = creditTransactions
    .filter((tx) => tx.customerId === customer.id)
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const debtTxs = custTxs.filter((tx) => tx.type === 'debt');
  const paymentTxs = custTxs.filter((tx) => tx.type === 'payment');

  const purchaseItems: DebtPurchaseLineItem[] = [];
  const linkedOrderIds = new Set<string>();

  debtTxs.forEach((tx) => {
    const linkedOrder = tx.receiptNumber
      ? orders.find((o) => o.orderNumber === tx.receiptNumber && o.status === 'completed')
      : undefined;

    if (linkedOrder && linkedOrder.items.length > 0) {
      linkedOrderIds.add(linkedOrder.id);

      // Expand all purchased items from the linked POS credit order
      const itemsSubtotalSum = linkedOrder.items.reduce((sum, it) => sum + it.total, 0);
      linkedOrder.items.forEach((it, idx) => {
        const desc = [
          it.productName,
          it.variantName ? `(${it.variantName})` : '',
          it.modifiers && it.modifiers.length > 0 ? `[${it.modifiers.join('، ')}]` : ''
        ]
          .filter(Boolean)
          .join(' ');

        purchaseItems.push({
          id: `${tx.id}-ord-${idx}`,
          date: tx.date,
          sourceLabel: linkedOrder.orderNumber,
          description: desc,
          quantity: it.quantity,
          unitPrice: it.price,
          discount: it.discount || 0,
          total: it.total,
          isLinkedOrderItem: true
        });
      });

      // Account for order-level extra tax/discount difference if order grandTotal differs from sum of line totals
      const taxOrAdjDiff = Number((linkedOrder.grandTotal - itemsSubtotalSum).toFixed(2));
      if (Math.abs(taxOrAdjDiff) >= 0.01) {
        purchaseItems.push({
          id: `${tx.id}-ord-adj`,
          date: tx.date,
          sourceLabel: linkedOrder.orderNumber,
          description:
            taxOrAdjDiff > 0
              ? isAr
                ? `الضريبة المضافة (${linkedOrder.orderNumber})`
                : `Tax Adjustment (${linkedOrder.orderNumber})`
              : isAr
              ? `خصم إضافي على الفاتورة (${linkedOrder.orderNumber})`
              : `Order Discount (${linkedOrder.orderNumber})`,
          quantity: 1,
          unitPrice: taxOrAdjDiff,
          discount: 0,
          total: taxOrAdjDiff,
          isLinkedOrderItem: true
        });
      }
    } else {
      purchaseItems.push({
        id: tx.id,
        date: tx.date,
        sourceLabel: tx.receiptNumber || (isAr ? 'تقييد يدوي' : 'Ledger'),
        description:
          tx.notes ||
          (isAr ? 'مشتريات سلع على الحساب (كناش الكريدي)' : 'Credit merchandise purchase'),
        quantity: 1,
        unitPrice: tx.amount,
        discount: 0,
        total: tx.amount,
        isLinkedOrderItem: false
      });
    }
  });

  // Also include any completed credit orders belonging to this customer that didn't match a tx.receiptNumber
  const extraCreditOrders = orders.filter(
    (o) =>
      o.status === 'completed' &&
      o.paymentMethod === 'credit' &&
      !linkedOrderIds.has(o.id) &&
      (o.customerId === customer.id || (o.customerName && o.customerName === customer.name))
  );

  extraCreditOrders.forEach((ord) => {
    linkedOrderIds.add(ord.id);
    const itemsSum = ord.items.reduce((s, it) => s + it.total, 0);
    ord.items.forEach((it, idx) => {
      const desc = [
        it.productName,
        it.variantName ? `(${it.variantName})` : '',
        it.modifiers && it.modifiers.length > 0 ? `[${it.modifiers.join('، ')}]` : ''
      ]
        .filter(Boolean)
        .join(' ');

      purchaseItems.push({
        id: `${ord.id}-extra-${idx}`,
        date: ord.date,
        sourceLabel: ord.orderNumber,
        description: desc,
        quantity: it.quantity,
        unitPrice: it.price,
        discount: it.discount || 0,
        total: it.total,
        isLinkedOrderItem: true
      });
    });

    const diff = Number((ord.grandTotal - itemsSum).toFixed(2));
    if (Math.abs(diff) >= 0.01) {
      purchaseItems.push({
        id: `${ord.id}-extra-adj`,
        date: ord.date,
        sourceLabel: ord.orderNumber,
        description:
          diff > 0
            ? isAr
              ? `الضريبة المضافة (${ord.orderNumber})`
              : `Tax Adjustment (${ord.orderNumber})`
            : isAr
            ? `خصم إضافي على الفاتورة (${ord.orderNumber})`
            : `Order Discount (${ord.orderNumber})`,
        quantity: 1,
        unitPrice: diff,
        discount: 0,
        total: diff,
        isLinkedOrderItem: true
      });
    }
  });

  const paymentItems: DebtPaymentLineItem[] = paymentTxs.map((tx) => ({
    id: tx.id,
    date: tx.date,
    amount: tx.amount,
    notes: tx.notes || (isAr ? 'دفعة سداد دين' : 'Debt repayment'),
    recordedBy: tx.recordedBy || (isAr ? 'الكاشير' : 'Cashier')
  }));

  const recordedPurchasesTotal = Number(
    purchaseItems.reduce((sum, it) => sum + it.total, 0).toFixed(2)
  );
  const totalPayments = Number(
    paymentItems.reduce((sum, it) => sum + it.amount, 0).toFixed(2)
  );

  // Reconcile with customer's live balance if an unitemized opening balance exists
  const expectedGrossDebt = Number((customer.balance + totalPayments).toFixed(2));
  const missingPriorBalance = Number((expectedGrossDebt - recordedPurchasesTotal).toFixed(2));

  if (missingPriorBalance > 0.01) {
    purchaseItems.unshift({
      id: `prior-bal-${customer.id}`,
      date: customer.createdAt || new Date().toISOString(),
      sourceLabel: isAr ? 'رصيد سابق' : 'Prior Bal.',
      description: isAr
        ? 'رصيد دين افتتاحي سابق ومشتريات سابقة غير مفصلة'
        : 'Opening / prior unitemized credit balance',
      quantity: 1,
      unitPrice: missingPriorBalance,
      discount: 0,
      total: missingPriorBalance,
      isLinkedOrderItem: false
    });
  }

  const totalPurchasesDebt = Number(
    purchaseItems.reduce((sum, it) => sum + it.total, 0).toFixed(2)
  );

  return {
    customer,
    purchaseItems,
    paymentItems,
    totalPurchasesDebt,
    totalPayments,
    remainingDebt: Number(Math.max(0, customer.balance).toFixed(2)),
    ordersCount: linkedOrderIds.size + debtTxs.filter((tx) => !tx.receiptNumber).length
  };
}

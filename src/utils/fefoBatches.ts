import { ProductBatch } from '../types';

/**
 * Sorts active product batches in FEFO order (First Expired, First Out).
 */
export function sortBatchesFefo(batches: ProductBatch[]): ProductBatch[] {
  return [...batches]
    .filter((b) => Number(b.quantity) > 0.0001)
    .sort((a, b) => {
      const aExp = a.expiryDate || '9999-12-31';
      const bExp = b.expiryDate || '9999-12-31';
      if (aExp !== bExp) return aExp.localeCompare(bExp);
      return (a.receivedAt || '').localeCompare(b.receivedAt || '');
    });
}

/**
 * Returns the earliest expiryDate among active (non-empty) FEFO batches.
 */
export function getEarliestExpiryFromBatches(batches?: ProductBatch[]): string | undefined {
  if (!batches || batches.length === 0) return undefined;
  const sorted = sortBatchesFefo(batches);
  return sorted[0]?.expiryDate || undefined;
}

/**
 * Deducts a sold/wasted quantity from batches starting with the earliest expiry date (FEFO).
 */
export function deductStockFefo(
  batches: ProductBatch[] | undefined,
  deductQty: number
): { nextBatches: ProductBatch[] | undefined; nextExpiryDate: string | undefined } {
  if (!batches || batches.length === 0) {
    return { nextBatches: batches, nextExpiryDate: undefined };
  }
  let remaining = Math.max(0, Number(deductQty) || 0);
  if (remaining <= 0) {
    const sorted = sortBatchesFefo(batches);
    return { nextBatches: sorted, nextExpiryDate: sorted[0]?.expiryDate };
  }

  const sorted = sortBatchesFefo(batches);
  const nextBatches: ProductBatch[] = [];

  for (const batch of sorted) {
    const qty = Math.max(0, Number(batch.quantity) || 0);
    if (remaining <= 0.0001) {
      if (qty > 0.0001) nextBatches.push(batch);
      continue;
    }
    if (qty <= remaining) {
      remaining = Number((remaining - qty).toFixed(3));
      // Batch fully depleted -> omit
    } else {
      const left = Number((qty - remaining).toFixed(3));
      remaining = 0;
      if (left > 0.0001) {
        nextBatches.push({ ...batch, quantity: left });
      }
    }
  }

  return {
    nextBatches,
    nextExpiryDate: nextBatches[0]?.expiryDate
  };
}

/**
 * Adds a newly received batch (merging with an existing batch if expiryDate + lotNumber match)
 * and re-sorts in FEFO order.
 */
export function addBatchFefo(
  existingBatches: ProductBatch[] | undefined,
  newBatchInput: Omit<ProductBatch, 'id' | 'receivedAt'>
): { nextBatches: ProductBatch[]; nextExpiryDate: string | undefined } {
  const cleanQty = Math.max(0, Number(newBatchInput.quantity) || 0);
  const cleanExp = (newBatchInput.expiryDate || '').trim();
  const baseList = Array.isArray(existingBatches) ? existingBatches.filter((b) => b.quantity > 0.0001) : [];

  if (cleanQty <= 0 || !cleanExp) {
    const sorted = sortBatchesFefo(baseList);
    return { nextBatches: sorted, nextExpiryDate: sorted[0]?.expiryDate };
  }

  const cleanLot = (newBatchInput.lotNumber || '').trim();
  const nowIso = new Date().toISOString();
  const matchIdx = baseList.findIndex(
    (b) => b.expiryDate === cleanExp && (b.lotNumber || '').trim() === cleanLot
  );

  let updated: ProductBatch[];
  if (matchIdx !== -1) {
    updated = baseList.map((b, i) =>
      i === matchIdx
        ? {
            ...b,
            quantity: Number((b.quantity + cleanQty).toFixed(3)),
            costPrice: newBatchInput.costPrice ?? b.costPrice,
            supplierName: newBatchInput.supplierName || b.supplierName
          }
        : b
    );
  } else {
    updated = [
      ...baseList,
      {
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        lotNumber: cleanLot || undefined,
        quantity: Number(cleanQty.toFixed(3)),
        expiryDate: cleanExp,
        costPrice: newBatchInput.costPrice,
        receivedAt: nowIso,
        supplierName: newBatchInput.supplierName
      }
    ];
  }

  const sorted = sortBatchesFefo(updated);
  return {
    nextBatches: sorted,
    nextExpiryDate: sorted[0]?.expiryDate
  };
}

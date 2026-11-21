export interface ParsedXmlInvoiceItem {
  barcode?: string;
  nom: string;
  quantite: number;
  prix: number;
  total: number;
}

export interface ParsedXmlInvoiceResult {
  supplierName: string;
  supplierIce: string;
  supplierPhone: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalHt: number;
  tvaAmount: number;
  totalTtc: number;
  items: ParsedXmlInvoiceItem[];
}

const getLocalTagName = (el: Element): string => {
  const raw = el.localName || el.tagName || '';
  const idx = raw.indexOf(':');
  return (idx >= 0 ? raw.slice(idx + 1) : raw).toLowerCase();
};

const parseXmlNumber = (raw: string | null | undefined): number => {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const normalizeXmlDate = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return '';
};

const findFirstChildText = (parent: Element, candidateNames: string[]): string => {
  const candidates = new Set(candidateNames.map((n) => n.toLowerCase()));
  const queue: Element[] = Array.from(parent.children);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (candidates.has(getLocalTagName(node))) {
      // Only take direct/leaf text when it does not wrap sub-elements
      if (node.children.length === 0) {
        const text = (node.textContent || '').trim();
        if (text) return text;
      }
    }
    if (node.children.length > 0) {
      queue.push(...Array.from(node.children));
    }
  }
  return '';
};

const findDirectChildText = (parent: Element, candidateNames: string[]): string => {
  const candidates = new Set(candidateNames.map((n) => n.toLowerCase()));
  for (const child of Array.from(parent.children)) {
    if (candidates.has(getLocalTagName(child)) && child.children.length === 0) {
      const val = (child.textContent || '').trim();
      if (val) return val;
    }
  }
  return '';
};

const findSubtreeByTags = (root: Element, candidateNames: string[]): Element | null => {
  const candidates = new Set(candidateNames.map((n) => n.toLowerCase()));
  const queue: Element[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (candidates.has(getLocalTagName(node))) {
      return node;
    }
    queue.push(...Array.from(node.children));
  }
  return null;
};

const LINE_CONTAINER_TAGS = new Set([
  'invoiceline',
  'ligne',
  'lignefacture',
  'ligne_facture',
  'article',
  'produit',
  'product',
  'item',
  'line',
  'detail',
  'row',
  'orderline',
  'creditnoteline'
]);

const collectLineItemElements = (root: Element): Element[] => {
  const matched: Element[] = [];
  const walk = (el: Element) => {
    const tag = getLocalTagName(el);
    // Avoid picking UBL's nested <cac:Item> inside <cac:InvoiceLine> twice:
    // if current element is <InvoiceLine> / <Ligne> / <Article> / <Produit>, consume it cleanly
    if (LINE_CONTAINER_TAGS.has(tag)) {
      const hasQtyOrPriceOrName =
        findFirstChildText(el, [
          'nom',
          'name',
          'designation',
          'libelle',
          'description',
          'title',
          'label',
          'produit',
          'article'
        ]).length > 0;
      if (hasQtyOrPriceOrName) {
        matched.push(el);
        return;
      }
    }
    for (const child of Array.from(el.children)) {
      walk(child);
    }
  };
  walk(root);
  return matched;
};

export const parsePurchaseInvoiceXml = (xmlText: string): ParsedXmlInvoiceResult => {
  const cleanXml = (xmlText || '').replace(/^\uFEFF/, '').trim();
  if (!cleanXml) {
    throw new Error('ملف XML خاوي.');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXml, 'application/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr || !doc.documentElement) {
    throw new Error('ملف XML غير صالح أو فيه خطأ في البنية.');
  }

  const root = doc.documentElement;

  // 1. Supplier metadata (UBL AccountingSupplierParty or generic supplier block)
  const supplierBlock =
    findSubtreeByTags(root, [
      'accountingsupplierparty',
      'fournisseur',
      'supplier',
      'vendor',
      'vendeur',
      'emetteur',
      'seller',
      'societe'
    ]) || root;

  const supplierName =
    (supplierBlock !== root && supplierBlock.children.length === 0
      ? (supplierBlock.textContent || '').trim()
      : '') ||
    findFirstChildText(supplierBlock, [
      'registrationname',
      'partyname',
      'name',
      'nom',
      'nom_fournisseur',
      'suppliername',
      'raison_sociale',
      'raisonsociale',
      'companyname',
      'fournisseur',
      'vendor',
      'seller'
    ]) ||
    findDirectChildText(root, [
      'fournisseur',
      'supplier',
      'suppliername',
      'nom_fournisseur',
      'vendeur',
      'seller'
    ]);

  const rawIceCandidate =
    findFirstChildText(supplierBlock, [
      'ice',
      'supplierice',
      'numero_ice',
      'identifiant_commun',
      'companyid',
      'endpointid',
      'taxid',
      'identifiant'
    ]) ||
    findFirstChildText(root, ['ice', 'supplierice', 'numero_ice', 'identifiant_commun']);

  let supplierIce = rawIceCandidate.replace(/[^0-9]/g, '').slice(0, 15);
  if (supplierIce.length !== 15) {
    // Fallback: look for any exact 15-digit ICE inside supplier text content
    const iceMatches = (supplierBlock.textContent || '').match(/\b\d{15}\b/);
    if (iceMatches) {
      supplierIce = iceMatches[0];
    }
  }

  const supplierPhone =
    findFirstChildText(supplierBlock, [
      'telephone',
      'tel',
      'phone',
      'supplierphone',
      'gsm',
      'mobile'
    ]) || findDirectChildText(root, ['telephone', 'tel', 'phone', 'supplierphone']);

  // 2. Invoice header & date
  const invoiceNumber =
    findDirectChildText(root, [
      'id',
      'numero',
      'numero_facture',
      'invoicenumber',
      'num_facture',
      'num',
      'reference',
      'ref',
      'code'
    ]) ||
    findFirstChildText(root, ['numero_facture', 'invoicenumber', 'num_facture', 'facture_id']);

  const rawDate =
    findDirectChildText(root, [
      'issuedate',
      'date',
      'date_facture',
      'invoicedate',
      'date_emission',
      'created_at'
    ]) || findFirstChildText(root, ['issuedate', 'date_facture', 'invoicedate', 'date_emission']);
  const invoiceDate = normalizeXmlDate(rawDate);

  // 3. Tax & Totals (HT / TVA / TTC)
  const monetaryBlock =
    findSubtreeByTags(root, ['legalmonetarytotal', 'totaux', 'totals', 'resume', 'summary']) ||
    root;

  const totalHt = parseXmlNumber(
    findFirstChildText(monetaryBlock, [
      'taxexclusiveamount',
      'lineextensionamount',
      'total_ht',
      'totalht',
      'montant_ht',
      'sous_total',
      'subtotal',
      'ht'
    ])
  );

  const tvaAmount = parseXmlNumber(
    findFirstChildText(root, ['taxamount', 'total_tva', 'tvaamount', 'montant_tva', 'tva'])
  );

  const rawTtc = parseXmlNumber(
    findFirstChildText(monetaryBlock, [
      'payableamount',
      'taxinclusiveamount',
      'total_ttc',
      'totalttc',
      'montant_ttc',
      'net_a_payer',
      'netapayer',
      'totalamount',
      'total',
      'ttc'
    ])
  );

  // 4. Line items
  const lineElements = collectLineItemElements(root);
  const items: ParsedXmlInvoiceItem[] = [];

  for (const el of lineElements) {
    const nom = findFirstChildText(el, [
      'nom',
      'name',
      'designation',
      'libelle',
      'description',
      'title',
      'label',
      'produit',
      'article'
    ]).trim();
    if (!nom) continue;

    // Barcode / SKU (check StandardItemIdentification first in UBL, or generic barcode tags)
    const stdIdBlock = findSubtreeByTags(el, [
      'standarditemidentification',
      'sellersitemidentification'
    ]);
    const rawBarcode = stdIdBlock
      ? findFirstChildText(stdIdBlock, ['id'])
      : findFirstChildText(el, [
          'barcode',
          'code_barre',
          'codebarre',
          'ean',
          'ean13',
          'gtin',
          'sku',
          'code',
          'reference'
        ]);
    const barcode = rawBarcode
      .replace(/[^0-9A-Za-z-]/g, '')
      .trim()
      .slice(0, 32);

    const rawQty = parseXmlNumber(
      findFirstChildText(el, ['invoicedquantity', 'quantite', 'qte', 'qty', 'quantity', 'nombre'])
    );
    const quantite = rawQty > 0 ? Number(rawQty.toFixed(3)) : 1;

    const priceBlock = findSubtreeByTags(el, ['price']);
    let prix = priceBlock
      ? parseXmlNumber(findFirstChildText(priceBlock, ['priceamount', 'amount']))
      : 0;
    if (prix <= 0) {
      prix = parseXmlNumber(
        findFirstChildText(el, [
          'prix',
          'prix_unitaire',
          'pu',
          'price',
          'priceamount',
          'unitprice',
          'prix_achat',
          'cost',
          'tarif'
        ])
      );
    }

    let total = parseXmlNumber(
      findFirstChildText(el, [
        'lineextensionamount',
        'total',
        'montant',
        'montant_ht',
        'montant_ttc',
        'linetotal',
        'sous_total'
      ])
    );

    if (prix <= 0 && total > 0 && quantite > 0) {
      prix = Number((total / quantite).toFixed(2));
    } else if (total <= 0 && prix > 0) {
      total = Number((quantite * prix).toFixed(2));
    } else {
      prix = Number(Math.max(0, prix).toFixed(2));
      total = Number(Math.max(0, total).toFixed(2));
    }

    items.push({
      ...(barcode ? { barcode } : {}),
      nom,
      quantite,
      prix,
      total
    });
  }

  const itemsSum = Number(
    items.reduce((sum, it) => sum + (it.total || it.quantite * it.prix), 0).toFixed(2)
  );
  const totalTtc = rawTtc > 0 ? Number(rawTtc.toFixed(2)) : itemsSum;

  return {
    supplierName: supplierName.trim(),
    supplierIce,
    supplierPhone: supplierPhone.trim(),
    invoiceNumber: invoiceNumber.trim(),
    invoiceDate,
    totalHt: totalHt > 0 ? Number(totalHt.toFixed(2)) : 0,
    tvaAmount: tvaAmount > 0 ? Number(tvaAmount.toFixed(2)) : 0,
    totalTtc,
    items
  };
};

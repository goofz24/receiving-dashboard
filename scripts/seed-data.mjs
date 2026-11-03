// Builds the MADE-UP sample data for the Receiving Dashboard.
//
// Every name, SKU, price and quantity here is invented. The random
// numbers come from a fixed "seed", so the data is the same every time
// you run it (that is what lets the tests check exact totals).
//
// Dates are stored as "days from today" (dayOffset). The SQL file turns
// them into  current_date - N  so the dashboard always looks recent, no
// matter what day you load it.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUPPLIERS = [
  { name: "Coqui Paper Goods", city: "Ponce, PR", lead: 4 },
  { name: "Isla Clean Supply", city: "San Juan, PR", lead: 6 },
  { name: "Brisa Beverage Co.", city: "Mayaguez, PR", lead: 3 },
  { name: "Palmar Snacks", city: "Caguas, PR", lead: 5 },
  { name: "Faro Packaging", city: "Miami, FL", lead: 10 },
  { name: "Ceiba Office Supply", city: "Houston, TX", lead: 8 },
];

const PRODUCTS = [
  // [supplierIndex, category, unit, name, unitCost]
  [0, "Paper", "case", "Paper towels, 12 rolls", 18.5],
  [0, "Paper", "case", "Bath tissue, 48 rolls", 31.0],
  [0, "Paper", "case", "Napkins, 500 count", 12.75],
  [0, "Paper", "case", "Paper plates, 9 in", 22.4],
  [0, "Paper", "box", "Paper cups, 12 oz", 15.9],
  [0, "Paper", "box", "Facial tissue, 36 boxes", 27.3],
  [1, "Cleaning", "case", "All-purpose cleaner, 6 x 1 gal", 24.0],
  [1, "Cleaning", "case", "Bleach, 6 x 1 gal", 16.8],
  [1, "Cleaning", "case", "Dish soap, 12 x 24 oz", 21.6],
  [1, "Cleaning", "box", "Trash bags, 33 gal", 19.2],
  [1, "Cleaning", "box", "Nitrile gloves, 100", 9.95],
  [1, "Cleaning", "case", "Floor cleaner, 4 x 1 gal", 28.4],
  [2, "Beverages", "case", "Bottled water, 24 x 16 oz", 4.8],
  [2, "Beverages", "case", "Sparkling water, 24 cans", 9.6],
  [2, "Beverages", "case", "Orange juice, 12 x 1 L", 21.0],
  [2, "Beverages", "case", "Iced coffee, 12 cans", 18.0],
  [2, "Beverages", "case", "Sports drink, 24 x 20 oz", 17.5],
  [2, "Beverages", "case", "Malta, 24 bottles", 16.2],
  [3, "Snacks", "case", "Plantain chips, 24 bags", 19.4],
  [3, "Snacks", "case", "Mixed nuts, 12 cans", 38.0],
  [3, "Snacks", "case", "Granola bars, 48 count", 14.5],
  [3, "Snacks", "case", "Crackers, 12 boxes", 15.6],
  [3, "Snacks", "case", "Guava pastries, 24 count", 21.0],
  [3, "Snacks", "case", "Popcorn, 24 bags", 12.9],
  [4, "Packaging", "pack", "Shipping boxes, small, 25", 13.5],
  [4, "Packaging", "pack", "Shipping boxes, large, 20", 24.75],
  [4, "Packaging", "roll", "Packing tape, 6 rolls", 11.2],
  [4, "Packaging", "roll", "Stretch wrap, 18 in", 26.0],
  [4, "Packaging", "box", "Bubble mailers, 50", 17.4],
  [4, "Packaging", "box", "Shelf labels, 1000", 8.6],
  [5, "Office", "box", "Copy paper, 10 reams", 44.0],
  [5, "Office", "box", "Ballpoint pens, 60", 10.5],
  [5, "Office", "pack", "Receipt rolls, 50", 32.0],
  [5, "Office", "pack", "Label printer tape, 6", 29.9],
  [5, "Office", "box", "Clipboards, 12", 18.0],
  [5, "Office", "box", "Box cutters, 12", 21.5],
];

const STAFF = ["M. Rivera", "J. Torres", "L. Santiago", "A. Colon"];

export function generateSeed(seed = 20261103) {
  const rand = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const suppliers = SUPPLIERS.map((s, i) => ({
    supplier_id: i + 1,
    name: s.name,
    city: s.city,
    lead_time_days: s.lead,
  }));

  const products = PRODUCTS.map(([si, category, unit, name, cost], i) => ({
    product_id: i + 1,
    sku: `${category.slice(0, 3).toUpperCase()}-${String(1001 + i)}`,
    name,
    category,
    unit,
    unit_cost: cost,
    supplier_id: si + 1,
  }));

  const purchaseOrders = [];
  const poLines = [];
  const receipts = [];
  const receiptLines = [];

  // Each supplier gets an order roughly every 1 to 2 weeks for 12 weeks.
  for (const s of suppliers) {
    let day = -84 + int(0, 4);
    while (day <= -2) {
      const po_id = purchaseOrders.length + 1;
      const ordered = day;
      const expected = ordered + s.lead_time_days;
      purchaseOrders.push({
        po_id,
        po_number: `PO-${String(5000 + po_id)}`,
        supplier_id: s.supplier_id,
        ordered_offset: ordered,
        expected_offset: expected,
      });

      const own = products.filter((p) => p.supplier_id === s.supplier_id);
      const count = int(3, Math.min(6, own.length));
      const chosen = [...own].sort(() => rand() - 0.5).slice(0, count);
      const lines = chosen.map((p) => {
        const line = {
          po_line_id: poLines.length + 1,
          po_id,
          product_id: p.product_id,
          qty_ordered: int(2, 40),
          unit_cost: p.unit_cost,
        };
        poLines.push(line);
        return line;
      });

      // Has the delivery arrived yet?
      const due = expected <= -1;
      const arrives = due && rand() < 0.93;
      if (arrives) {
        const delay = pick([-1, 0, 0, 0, 0, 1, 1, 2, 3, 5]);
        const firstDay = Math.min(-1, Math.max(ordered + 1, expected + delay));
        const split = rand() < 0.12 && firstDay <= -3;

        // decide the final count for each line
        const outcomes = lines.map((l) => {
          const r = rand();
          let received = l.qty_ordered;
          if (r < 0.11) received = Math.max(0, l.qty_ordered - int(1, Math.min(6, l.qty_ordered)));
          else if (r < 0.14) received = l.qty_ordered + int(1, 3);
          const damaged = rand() < 0.05 && received > 0 ? Math.min(received, int(1, 2)) : 0;
          return { line: l, received, damaged };
        });

        const r1 = {
          receipt_id: receipts.length + 1,
          po_id,
          received_offset: firstDay,
          received_by: pick(STAFF),
          packing_slip_no: `PS-${int(10000, 99999)}`,
        };
        receipts.push(r1);
        let r2 = null;
        if (split) {
          r2 = {
            receipt_id: receipts.length + 1,
            po_id,
            received_offset: Math.min(-1, firstDay + int(2, 4)),
            received_by: pick(STAFF),
            packing_slip_no: `PS-${int(10000, 99999)}`,
          };
          receipts.push(r2);
        }

        for (const o of outcomes) {
          if (r2 && o.received >= 2) {
            // part comes on the first truck, the rest on the second
            const first = Math.floor(o.received / 2);
            receiptLines.push({ receipt_id: r1.receipt_id, po_line_id: o.line.po_line_id, qty_received: first, qty_damaged: 0 });
            receiptLines.push({ receipt_id: r2.receipt_id, po_line_id: o.line.po_line_id, qty_received: o.received - first, qty_damaged: Math.min(o.damaged, o.received - first) });
          } else {
            receiptLines.push({ receipt_id: r1.receipt_id, po_line_id: o.line.po_line_id, qty_received: o.received, qty_damaged: o.damaged });
          }
        }
      }

      day += int(6, 13);
    }
  }

  // One more order per supplier placed in the last two days, still on the way.
  for (const s of suppliers) {
    const po_id = purchaseOrders.length + 1;
    const ordered = -int(0, 1);
    purchaseOrders.push({
      po_id,
      po_number: `PO-${String(5000 + po_id)}`,
      supplier_id: s.supplier_id,
      ordered_offset: ordered,
      expected_offset: ordered + s.lead_time_days,
    });
    const own = products.filter((p) => p.supplier_id === s.supplier_id);
    for (const p of [...own].sort(() => rand() - 0.5).slice(0, int(2, 4))) {
      poLines.push({ po_line_id: poLines.length + 1, po_id, product_id: p.product_id, qty_ordered: int(2, 40), unit_cost: p.unit_cost });
    }
  }

  return { suppliers, products, purchaseOrders, poLines, receipts, receiptLines };
}

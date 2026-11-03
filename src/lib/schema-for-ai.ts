// The description of the database that we give to Claude, so it knows
// which tables and columns exist. Keep this in step with sql/01_schema.sql.
export const SCHEMA_FOR_AI = `
Postgres database for a store's stock receiving. All tables are in schema "receiving" (already on the search_path).

suppliers(supplier_id int pk, name text, city text, lead_time_days int)
products(product_id int pk, sku text, name text, category text, unit text, unit_cost numeric, supplier_id int -> suppliers)
purchase_orders(po_id int pk, po_number text, supplier_id int -> suppliers, ordered_on date, expected_on date)
po_lines(po_line_id int pk, po_id int -> purchase_orders, product_id int -> products, qty_ordered int, unit_cost numeric)
receipts(receipt_id int pk, po_id int -> purchase_orders, received_on date, received_by text, packing_slip_no text, source text)
receipt_lines(receipt_line_id int pk, receipt_id int -> receipts, po_line_id int -> po_lines, qty_received int, qty_damaged int)

View po_line_status: one row per order line with po_line_id, po_id, po_number, supplier_id, supplier, sku, product, category,
ordered_on, expected_on, qty_ordered, qty_received, qty_damaged, qty_difference (received minus ordered), unit_cost,
last_received_on, status ('awaiting' | 'overdue' | 'short' | 'over' | 'complete').

Notes: one order can arrive in several receipts. Money = quantity * po_lines.unit_cost. Use current_date for "today".
`.trim();

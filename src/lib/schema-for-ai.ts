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

IT asset tracker, schema "itam" (always write itam.table_name):
itam.locations(location_id int pk, name text, city text)
itam.employees(employee_id int pk, full_name text, email text, department text, title text, location_id int -> locations, started_on date, left_on date null = still employed)
itam.models(model_id int pk, category text ('laptop'|'desktop'|'monitor'|'phone'|'tablet'|'dock'|'printer'), manufacturer text, model_name text, warranty_months int, useful_life_months int)
itam.assets(asset_id int pk, asset_tag text, serial_number text, model_id int -> models, vendor text, invoice_number text, purchased_on date, purchase_cost numeric, warranty_ends_on date, location_id int -> locations, source text)
itam.asset_events(event_id int pk, asset_id int -> assets, event_on date, event_type text ('ordered'|'received'|'deployed'|'returned'|'repair_out'|'repair_back'|'lost'|'retired'|'disposed'), employee_id int -> employees null, done_by text, note text)
itam.device_checks(check_id int pk, asset_id int -> assets, checked_on date, os_version text, bitlocker_on boolean, disk_free_pct numeric, pending_updates int)
itam.licenses(license_id int pk, product text, vendor text, seats_owned int, cost_per_seat_year numeric, renews_on date)
itam.license_seats(license_id int -> licenses, employee_id int -> employees, assigned_on date)

View itam.asset_current: one row per asset with asset_id, asset_tag, serial_number, category, manufacturer, model_name, vendor, invoice_number,
purchased_on, purchase_cost, warranty_ends_on, warranty_days_left, age_months, useful_life_months, refresh_due_on, location,
status ('ordered' | 'in_stock' | 'deployed' | 'in_repair' | 'lost' | 'retired' | 'disposed', from the latest event), status_since,
employee_id, assigned_to, department, owner_left_on (set when the person it is assigned to has left), source.
View itam.device_health: newest check per deployed laptop/desktop: asset_id, asset_tag, category, manufacturer, model_name, status,
assigned_to, department, checked_on (null = never checked), days_since_check, os_version, bitlocker_on, disk_free_pct, pending_updates.

Notes: prefer the two views for status and owner questions. A deployed asset with no employee is a shared device.
`.trim();

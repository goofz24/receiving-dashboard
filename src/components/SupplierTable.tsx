import type { SupplierRow } from "@/lib/data";
import { fmtInt, fmtMoney, fmtPct } from "@/lib/format";

export function SupplierTable({ rows }: { rows: SupplierRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Supplier</th><th className="num">Orders</th><th className="num">Units ordered</th>
            <th className="num">Units received</th><th className="num">Fill rate</th><th className="num">Value received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.supplier}>
              <td>{r.supplier}</td><td className="num">{fmtInt(r.orders)}</td><td className="num">{fmtInt(r.unitsOrdered)}</td>
              <td className="num">{fmtInt(r.unitsReceived)}</td><td className="num">{fmtPct(r.fillRatePct)}</td>
              <td className="num">{fmtMoney(r.valueReceived)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

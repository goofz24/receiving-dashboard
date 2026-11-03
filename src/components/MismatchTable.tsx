import type { MismatchRow } from "@/lib/data";
import { fmtDay, fmtInt } from "@/lib/format";

const STATUS_LABEL: Record<string, { text: string; cls: string; icon: string }> = {
  short: { text: "Short", cls: "badge-bad", icon: "▼" },
  over: { text: "Over", cls: "badge-warn", icon: "▲" },
  complete: { text: "Damaged only", cls: "badge-warn", icon: "!" },
};

export function MismatchTable({ rows }: { rows: MismatchRow[] }) {
  if (rows.length === 0) return <p className="empty">No mismatches. Every delivery matched its order.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Received</th><th>Order</th><th>Supplier</th><th>Product</th>
            <th className="num">Ordered</th><th className="num">Received</th><th className="num">Diff.</th>
            <th className="num">Damaged</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = STATUS_LABEL[r.status] ?? { text: r.status, cls: "", icon: "" };
            return (
              <tr key={`${r.poNumber}-${r.sku}`}>
                <td>{fmtDay(r.lastReceivedOn)}</td><td>{r.poNumber}</td><td>{r.supplier}</td>
                <td><span className="sku">{r.sku}</span> {r.product}</td>
                <td className="num">{fmtInt(r.qtyOrdered)}</td><td className="num">{fmtInt(r.qtyReceived)}</td>
                <td className="num">{r.qtyDifference > 0 ? "+" : ""}{fmtInt(r.qtyDifference)}</td>
                <td className="num">{r.qtyDamaged ? fmtInt(r.qtyDamaged) : ""}</td>
                <td><span className={`badge ${s.cls}`}><span aria-hidden>{s.icon}</span> {s.text}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

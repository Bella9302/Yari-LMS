import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { STATE_LABELS, type getComplianceRows } from "@/server/tracking/company";
import { BRAND } from "@/lib/brand";

type Rows = Awaited<ReturnType<typeof getComplianceRows>>["rows"];

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#0B0B0C" },
  brand: { fontSize: 8, letterSpacing: 2, color: "#5C5A54" },
  title: { fontSize: 18, fontFamily: "Times-Roman", marginTop: 4 },
  meta: { fontSize: 8, color: "#5C5A54", marginTop: 2, marginBottom: 14 },
  head: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#0B0B0C",
    paddingBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#CFCAC0", paddingVertical: 4 },
  name: { width: 120 },
  course: { flex: 1, paddingRight: 6 },
  cell: { width: 62 },
  note: { marginTop: 16, fontSize: 7, color: "#5C5A54" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#5C5A54",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

const d = (x: Date | null) =>
  x
    ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" }).format(x)
    : "—";

export function renderCompliancePdf(orgName: string, rows: Rows) {
  const completed = rows.filter((r) => r.state === "completed").length;
  const overdue = rows.filter((r) => r.state === "overdue").length;
  return renderToBuffer(
    <Document title={`${orgName} — training compliance`} author={BRAND.companyName}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.brand}>{BRAND.academyName.toUpperCase()}</Text>
        <Text style={s.title}>{orgName} — training compliance</Text>
        <Text style={s.meta}>
          Generated {d(new Date())} · {rows.length} enrolments · {completed} completed · {overdue} overdue ·
          contains personal information: handle under POPIA
        </Text>
        <View style={s.head} fixed>
          <Text style={s.name}>Name</Text>
          <Text style={s.course}>Course</Text>
          <Text style={s.cell}>Status</Text>
          <Text style={s.cell}>Progress</Text>
          <Text style={s.cell}>Due</Text>
          <Text style={s.cell}>Completed</Text>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={s.row} wrap={false}>
            <View style={s.name}>
              <Text>{r.name}</Text>
              {r.department ? <Text style={{ color: "#5C5A54", fontSize: 7 }}>{r.department}</Text> : null}
            </View>
            <Text style={s.course}>{r.course}</Text>
            <Text style={s.cell}>{STATE_LABELS[r.state]}</Text>
            <Text style={s.cell}>{r.progressPct}%</Text>
            <Text style={s.cell}>{d(r.dueAt)}</Text>
            <Text style={s.cell}>{d(r.completedAt)}</Text>
          </View>
        ))}
        <Text style={s.note}>{BRAND.nonAccreditationStatement}</Text>
        <View style={s.footer} fixed>
          <Text>{BRAND.companyName}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}

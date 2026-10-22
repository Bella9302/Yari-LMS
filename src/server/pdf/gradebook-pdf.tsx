import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Gradebook } from "@/server/assessment/gradebook";
import { gradeLabel } from "@/server/assessment/gradebook";
import { BRAND } from "@/lib/brand";

// Built-in PDF fonts keep the file small and avoid fetching fonts at runtime.
const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#0B0B0C" },
  brand: { fontSize: 8, letterSpacing: 2, color: "#5C5A54" },
  title: { fontSize: 16, fontFamily: "Times-Roman", marginTop: 4 },
  meta: { fontSize: 8, color: "#5C5A54", marginTop: 2, marginBottom: 12 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#CFCAC0", paddingVertical: 4 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0B0B0C", paddingBottom: 4 },
  name: { width: 130, paddingRight: 6 },
  cell: { flex: 1, paddingRight: 4 },
  small: { color: "#5C5A54", fontSize: 7 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#5C5A54",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function renderGradebookPdf(courseTitle: string, gb: Gradebook, generatedFor: string) {
  const when = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date());
  return renderToBuffer(
    <Document title={`${courseTitle} — gradebook`} author={BRAND.companyName}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.brand}>{BRAND.academyName.toUpperCase()}</Text>
        <Text style={s.title}>{courseTitle} — gradebook</Text>
        <Text style={s.meta}>
          {gb.rows.length} learners · generated {when} for {generatedFor} · contains personal information:
          handle under POPIA
        </Text>
        <View style={s.head} fixed>
          <Text style={s.name}>Learner</Text>
          <Text style={s.cell}>Progress</Text>
          {gb.columns.map((c) => (
            <Text key={c.itemId} style={s.cell}>
              {c.title} (pass {c.passPct}%)
            </Text>
          ))}
        </View>
        {gb.rows.map((r) => (
          <View key={r.enrolmentId} style={s.row} wrap={false}>
            <View style={s.name}>
              <Text>{r.name}</Text>
              <Text style={s.small}>{r.organization ?? "Individual"}</Text>
            </View>
            <Text style={s.cell}>
              {r.progressPct}%{r.status === "COMPLETED" ? " (complete)" : ""}
            </Text>
            {gb.columns.map((c) => {
              const g = r.grades[c.itemId]!;
              const verdict = g.state === "graded" && g.passed !== null ? (g.passed ? " pass" : " fail") : "";
              return (
                <Text key={c.itemId} style={s.cell}>
                  {gradeLabel(g)}
                  {verdict}
                  {g.overridden ? "*" : ""}
                  {g.late ? " (late)" : ""}
                </Text>
              );
            })}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>* overridden by a trainer</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}

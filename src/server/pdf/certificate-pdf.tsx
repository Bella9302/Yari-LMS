import "server-only";
import path from "node:path";
import QRCode from "qrcode";
import {
  Document,
  Font,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { BRAND } from "@/lib/brand";
import { formatDuration } from "@/lib/certificates";
import { MONOGRAM_PATH } from "@/ui/monogram";
import type { CertificateDocument } from "@/server/certificates/service";

// The brand fonts (SIL Open Font License, see fonts/OFL.txt), bundled so certificates look the
// same everywhere and never depend on a font CDN.
const fontDir = path.join(process.cwd(), "src/server/pdf/fonts");
Font.register({ family: "Gloock", src: path.join(fontDir, "Gloock-Regular.ttf") });
Font.register({
  family: "Bricolage",
  fonts: [
    { src: path.join(fontDir, "bricolage-grotesque-latin-400-normal.woff") },
    { src: path.join(fontDir, "bricolage-grotesque-latin-600-normal.woff"), fontWeight: 600 },
  ],
});
Font.register({ family: "Martian", src: path.join(fontDir, "martian-mono-latin-400-normal.woff") });
// Long course titles break between words, never mid-word with a hyphen.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#0B0B0C";
const PAPER = "#FFFFFF";
const MUTED = "#5A5852";
const ACCENT = { HEALTH_SAFETY: "#E8A33D", AI_DIGITAL: "#2FD3B5" } as const;
const ACCENT_TEXT = { HEALTH_SAFETY: "#8A5A0B", AI_DIGITAL: "#0A6B59" } as const;
const CATEGORY = { HEALTH_SAFETY: "Health & Safety", AI_DIGITAL: "AI & Digital" } as const;

const s = StyleSheet.create({
  page: { backgroundColor: PAPER, color: INK, fontFamily: "Bricolage", fontSize: 10, padding: 0 },
  frame: {
    position: "absolute",
    top: 22,
    left: 22,
    right: 22,
    bottom: 22,
    borderWidth: 0.75,
    borderColor: INK,
  },
  body: { flex: 1, paddingTop: 48, paddingHorizontal: 64, paddingBottom: 44 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brand: { fontFamily: "Martian", fontSize: 7.5, letterSpacing: 2.4, marginLeft: 10 },
  category: {
    flexDirection: "row",
    alignItems: "center",
    fontFamily: "Martian",
    fontSize: 7.5,
    letterSpacing: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  eyebrow: { fontFamily: "Martian", fontSize: 8.5, letterSpacing: 3, marginTop: 40 },
  lead: { fontSize: 11, color: MUTED, marginTop: 18 },
  name: { fontFamily: "Gloock", fontSize: 44, lineHeight: 1.1, marginTop: 6 },
  course: { fontFamily: "Gloock", fontSize: 22, lineHeight: 1.2, marginTop: 4, maxWidth: 560 },
  rule: { borderTopWidth: 0.75, borderTopColor: INK, marginTop: 26 },
  facts: { flexDirection: "row", marginTop: 12 },
  fact: { marginRight: 36 },
  factLabel: { fontFamily: "Martian", fontSize: 6.5, letterSpacing: 1.6, color: MUTED },
  factValue: { fontSize: 10.5, marginTop: 4 },
  bottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: "auto",
  },
  statement: { width: 420, borderLeftWidth: 2, borderLeftColor: INK, paddingLeft: 10, paddingVertical: 2 },
  statementText: { fontSize: 10, fontWeight: 600, lineHeight: 1.4 },
  detail: { fontSize: 8, color: MUTED, marginTop: 3 },
  issuer: { fontSize: 8, color: MUTED, marginTop: 10 },
  verify: { alignItems: "flex-end" },
  qr: { width: 74, height: 74 },
  verifyText: { fontFamily: "Martian", fontSize: 6.5, color: MUTED, marginTop: 4, textAlign: "right" },
  code: { fontFamily: "Martian", fontSize: 10, letterSpacing: 1, marginTop: 2 },
});

const date = (d: Date) =>
  new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(d);

export async function renderCertificatePdf(c: CertificateDocument) {
  const qr = await QRCode.toDataURL(c.verifyUrl, { margin: 0, width: 300, errorCorrectionLevel: "M" });
  const duration = formatDuration(c.durationMinutes);
  const verifyHost = c.verifyUrl.replace(/^https?:\/\//, "").replace(/\/verify\/.*$/, "/verify");
  const nameSize = c.learnerName.length > 30 ? 34 : 44;

  return renderToBuffer(
    <Document
      title={`${c.wording.heading} — ${c.courseTitle}`}
      author={BRAND.companyName}
      subject={c.wording.statement}
      creator={c.academyName}
    >
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame} fixed />
        {/* Category accent along the top edge of the frame. */}
        <View
          style={{
            position: "absolute",
            top: 22,
            left: 22,
            width: 160,
            height: 4,
            backgroundColor: ACCENT[c.category],
          }}
        />
        <View style={s.body}>
          <View style={s.top}>
            <View style={s.brandRow}>
              <Svg viewBox="40 60 1230 1080" style={{ width: 30, height: 26 }}>
                <Path d={MONOGRAM_PATH} fill={INK} />
              </Svg>
              <Text style={s.brand}>{c.academyName.toUpperCase()}</Text>
            </View>
            <View style={s.category}>
              <View style={[s.dot, { backgroundColor: ACCENT[c.category] }]} />
              <Text style={{ color: ACCENT_TEXT[c.category] }}>{CATEGORY[c.category].toUpperCase()}</Text>
            </View>
          </View>

          <Text style={s.eyebrow}>{c.wording.heading.toUpperCase()}</Text>
          <Text style={s.lead}>This certifies that</Text>
          <Text style={[s.name, { fontSize: nameSize }]}>{c.learnerName}</Text>
          <Text style={s.lead}>has completed</Text>
          <Text style={s.course}>{c.courseTitle}</Text>

          <View style={s.rule} />
          <View style={s.facts}>
            <View style={s.fact}>
              <Text style={s.factLabel}>COMPLETED</Text>
              <Text style={s.factValue}>{date(c.completedAt)}</Text>
            </View>
            {duration && (
              <View style={s.fact}>
                <Text style={s.factLabel}>COURSE LENGTH</Text>
                <Text style={s.factValue}>{duration}</Text>
              </View>
            )}
            {c.trainers.length > 0 && (
              <View style={[s.fact, { maxWidth: 260 }]}>
                <Text style={s.factLabel}>{c.trainers.length > 1 ? "TRAINERS" : "TRAINER"}</Text>
                <Text style={s.factValue}>{c.trainers.join(", ")}</Text>
              </View>
            )}
          </View>

          <View style={s.bottom}>
            <View style={s.statement}>
              <Text style={s.statementText}>{c.wording.statement}</Text>
              {c.wording.details.map((d) => (
                <Text key={d} style={s.detail}>
                  {d}
                </Text>
              ))}
              <Text style={s.issuer}>
                Issued by {BRAND.companyName} on {date(c.issuedAt)}
              </Text>
            </View>
            <View style={s.verify}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image src={qr} style={s.qr} />
              <Text style={s.verifyText}>Verify at {verifyHost}</Text>
              <Text style={s.code}>{c.code}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>,
  );
}

import { makeQrMatrix } from "./qr";

const A4 = { width: 595, height: 842 };

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  const value = Number.parseInt(full || "000000", 16);
  if (!Number.isFinite(value)) return [0, 0, 0];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function pdfText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .slice(0, 120);
}

export type QrPdfInput = {
  url: string;
  restaurantName: string;
  reward: string;
  label: string;
  foreground: string;
  background: string;
};

/** Builds a single A4 page with the QR drawn as vector squares. */
export function qrPdf(input: QrPdfInput): Blob {
  return new Blob([new TextEncoder().encode(qrPdfDocument(input))], {
    type: "application/pdf",
  });
}

/** The PDF as text, so the document can be checked without a browser Blob. */
export function qrPdfDocument(input: QrPdfInput): string {
  const [fr, fg, fb] = rgb(input.foreground);
  const [br, bg, bb] = rgb(input.background);
  const matrix = makeQrMatrix(input.url);
  const quiet = 4;
  const modules = matrix.length + quiet * 2;
  const size = 300;
  const scale = size / modules;
  const left = (A4.width - size) / 2;
  const bottom = 430;

  let cells = "";
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix.length; x++) {
      if (!matrix[y]?.[x]) continue;
      const px = left + (x + quiet) * scale;
      const py = bottom + (matrix.length - y - 1 + quiet) * scale;
      cells += `${px.toFixed(2)} ${py.toFixed(2)} ${scale.toFixed(2)} ${scale.toFixed(2)} re f\n`;
    }
  }

  const lines = [
    `BT /F2 26 Tf ${fr} ${fg} ${fb} rg 1 0 0 1 52 390 Tm (${pdfText(input.restaurantName)}) Tj ET`,
    `BT /F1 18 Tf ${fr} ${fg} ${fb} rg 1 0 0 1 52 362 Tm (${pdfText("Join our regulars.")}) Tj ET`,
    `BT /F1 12 Tf ${fr} ${fg} ${fb} rg 1 0 0 1 52 336 Tm (${pdfText(`Scan to collect stamps and enjoy ${input.reward}.`)}) Tj ET`,
    `BT /F2 14 Tf ${fr} ${fg} ${fb} rg 1 0 0 1 52 304 Tm (${pdfText(input.label)}) Tj ET`,
    `BT /F1 9 Tf ${fr} ${fg} ${fb} rg 1 0 0 1 52 60 Tm (${pdfText("Patron loyalty card. No app needed. Ask staff if the code will not scan.")}) Tj ET`,
  ];

  const content = [
    `q ${br} ${bg} ${bb} rg 0 0 ${A4.width} ${A4.height} re f Q`,
    `q ${fr} ${fg} ${fb} rg`,
    cells.trimEnd(),
    "Q",
    ...lines,
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  const encoder = new TextEncoder();
  let text = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(encoder.encode(text).length);
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = encoder.encode(text).length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    text += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return text;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  TableRow,
  TableCell,
  Table,
  WidthType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from "docx";
import type { AiReport } from "@/lib/schemas";

const PRIMARY_COLOR = "1e40af";
const BODY_FONT = "Calibri";
const TITLE_FONT = "Georgia";

function safeFilename(value: string) {
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${ascii || "report"}-${Date.now()}.docx`;
}

function buildTitlePage(report: AiReport): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 3000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: report.title,
          bold: true,
          size: 56,
          font: TITLE_FONT,
          color: PRIMARY_COLOR,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: report.subtitle || "",
          size: 28,
          font: BODY_FONT,
          color: "475569",
          italics: true,
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 800 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: report.author || "AI DocHub", size: 24, font: BODY_FONT, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: report.organization || "", size: 22, font: BODY_FONT, color: "64748b" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: report.date || "", size: 22, font: BODY_FONT, color: "64748b" }),
      ],
    }),
    new Paragraph({
      pageBreakBefore: true,
    }),
  ];
}

function buildAbstract(report: AiReport): Paragraph[] {
  if (!report.abstract) return [];
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({ text: "Tóm tắt", bold: true, size: 32, font: TITLE_FONT, color: PRIMARY_COLOR }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: report.abstract, size: 24, font: BODY_FONT, italics: true, color: "334155" }),
      ],
    }),
    new Paragraph({ spacing: { after: 200 } }),
  ];
}

function buildSections(report: AiReport): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const section of report.sections) {
    const headingLevel =
      section.level === 1
        ? HeadingLevel.HEADING_1
        : section.level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;

    const fontSize = section.level === 1 ? 32 : section.level === 2 ? 28 : 26;

    paragraphs.push(
      new Paragraph({
        heading: headingLevel,
        spacing: { before: 300, after: 120 },
        children: [
          new TextRun({
            text: section.heading,
            bold: true,
            size: fontSize,
            font: TITLE_FONT,
            color: PRIMARY_COLOR,
          }),
        ],
      }),
    );

    for (const para of section.paragraphs) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 160, line: 360 },
          children: [
            new TextRun({ text: para, size: 24, font: BODY_FONT }),
          ],
        }),
      );
    }

    if (section.bullets && section.bullets.length > 0) {
      for (const bullet of section.bullets) {
        paragraphs.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80, line: 340 },
            children: [
              new TextRun({ text: bullet, size: 24, font: BODY_FONT }),
            ],
          }),
        );
      }
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
    }

    if (section.tableData && section.tableData.headers.length > 0) {
      const headerRow = new TableRow({
        tableHeader: true,
        children: section.tableData.headers.map(
          (h) =>
            new TableCell({
              shading: { fill: PRIMARY_COLOR },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: h, bold: true, size: 22, font: BODY_FONT, color: "ffffff" }),
                  ],
                }),
              ],
            }),
        ),
      });

      const dataRows = section.tableData.rows.map(
        (row, rowIdx) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  shading: { fill: rowIdx % 2 === 0 ? "f1f5f9" : "ffffff" },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: String(cell), size: 22, font: BODY_FONT }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
      );

      paragraphs.push(new Paragraph({ spacing: { before: 100 } }));

      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
        },
        rows: [headerRow, ...dataRows],
      });

      paragraphs.push(table as unknown as Paragraph);
      paragraphs.push(new Paragraph({ spacing: { after: 200 } }));
    }
  }

  return paragraphs;
}

function buildConclusion(report: AiReport): Paragraph[] {
  if (!report.conclusion) return [];
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 120 },
      children: [
        new TextRun({ text: "Kết luận", bold: true, size: 32, font: TITLE_FONT, color: PRIMARY_COLOR }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200, line: 360 },
      children: [
        new TextRun({ text: report.conclusion, size: 24, font: BODY_FONT }),
      ],
    }),
  ];
}

function buildReferences(report: AiReport): Paragraph[] {
  if (!report.references.length) return [];

  const paragraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 120 },
      children: [
        new TextRun({ text: "Tài liệu tham khảo", bold: true, size: 32, font: TITLE_FONT, color: PRIMARY_COLOR }),
      ],
    }),
  ];

  report.references.forEach((ref, idx) => {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `[${idx + 1}] `, bold: true, size: 22, font: BODY_FONT, color: PRIMARY_COLOR }),
          new TextRun({ text: ref, size: 22, font: BODY_FONT }),
        ],
      }),
    );
  });

  return paragraphs;
}

export async function renderReportToBuffer(report: AiReport) {
  const children: Paragraph[] = [
    ...buildTitlePage(report),
    ...buildAbstract(report),
    ...buildSections(report),
    ...buildConclusion(report),
    ...buildReferences(report),
  ];

  // Tables are mixed into children array; docx allows it
  // Filter to ensure correct types
  const doc = new Document({
    creator: report.author || "AI DocHub",
    title: report.title,
    description: report.subtitle || report.title,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
            pageNumbers: {
              start: 1,
              formatType: NumberFormat.DECIMAL,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: report.title.slice(0, 60), size: 18, font: BODY_FONT, color: "94a3b8", italics: true }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], size: 20, font: BODY_FONT, color: "64748b" }),
                  new TextRun({ text: " / ", size: 20, font: BODY_FONT, color: "64748b" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20, font: BODY_FONT, color: "64748b" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return {
    buffer: Buffer.from(buffer),
    fileName: safeFilename(report.title),
  };
}

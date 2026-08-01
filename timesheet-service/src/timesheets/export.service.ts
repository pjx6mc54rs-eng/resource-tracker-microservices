import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Timesheet } from '../entities/timesheet.entity';
import { TimesheetPeriodStatus } from '../entities/timesheet-period.entity';
import { HOURS_PER_DAY, PeriodView } from './periods.service';
import { monthLabel, pad2 } from './month-range';

export interface ExportPayload {
  period: PeriodView;
  entries: Timesheet[];
  projectNames: Map<string, string>;
}

interface ExportRow {
  date: string;
  dayName: string;
  type: string;
  project: string;
  note: string;
  hours: number;
  days: number;
}

const DAY_NAMES_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const STATUS_LABELS: Record<TimesheetPeriodStatus, string> = {
  [TimesheetPeriodStatus.NOT_VALIDATED]: 'Non validée',
  [TimesheetPeriodStatus.PENDING]: 'En attente de validation',
  [TimesheetPeriodStatus.APPROVED]: 'Validée',
  [TimesheetPeriodStatus.REJECTED]: 'Refusée',
};

const BRAND = '5C9032';

function formatDateTime(value: Date | string | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class TimesheetExportService {
  fileBaseName({ period }: ExportPayload): string {
    const owner = period.owner.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `feuille-de-temps-${owner || 'collaborateur'}-${period.year}-${pad2(period.month)}`;
  }

  private toRows({ entries, projectNames }: ExportPayload): ExportRow[] {
    return entries
      .map((entry) => {
        const date = String(entry.date).split('T')[0];
        const [y, m, d] = date.split('-').map((part) => parseInt(part, 10));
        const hours = round2(Number(entry.hoursSpent) || 0);
        return {
          date,
          dayName: DAY_NAMES_FR[new Date(y, m - 1, d).getDay()] ?? '',
          type: entry.isHoliday ? 'Congé / Absence' : 'Projet',
          project: entry.isHoliday
            ? '—'
            : (projectNames.get(entry.projectId ?? '') ?? entry.projectId ?? '—'),
          note: entry.note ?? '',
          hours,
          days: round2(hours / HOURS_PER_DAY),
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /** Hours per project (plus a single "Congé / Absence" bucket). */
  private toProjectTotals(rows: ExportRow[]): Array<{ label: string; hours: number; days: number }> {
    const totals = new Map<string, number>();
    rows.forEach((row) => {
      const label = row.type === 'Projet' ? row.project : 'Congé / Absence';
      totals.set(label, (totals.get(label) ?? 0) + row.hours);
    });
    return Array.from(totals.entries())
      .map(([label, hours]) => ({
        label,
        hours: round2(hours),
        days: round2(hours / HOURS_PER_DAY),
      }))
      .sort((a, b) => b.hours - a.hours);
  }

  private metaLines(period: PeriodView): Array<[string, string]> {
    return [
      ['Collaborateur', period.owner.name],
      ['Email', period.owner.email ?? '—'],
      ['Période', monthLabel(period.year, period.month)],
      ['Statut', STATUS_LABELS[period.status]],
      ['Envoyée le', formatDateTime(period.submittedAt)],
      ['Validée par', period.reviewer?.name ?? '—'],
      ['Validée le', formatDateTime(period.reviewedAt)],
      [
        'Total',
        `${round2(period.totalHours)} h — ${round2(period.totalDays)} j (dont ${period.holidayDays} j de congé)`,
      ],
    ];
  }

  // ── Excel ────────────────────────────────────────────────────────────────

  async toExcel(payload: ExportPayload): Promise<Buffer> {
    const rows = this.toRows(payload);
    const { period } = payload;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Norsys Resource Tracker';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`${period.year}-${pad2(period.month)}`, {
      views: [{ state: 'frozen', ySplit: 12 }],
    });
    sheet.columns = [
      { key: 'date', width: 14 },
      { key: 'dayName', width: 14 },
      { key: 'type', width: 18 },
      { key: 'project', width: 32 },
      { key: 'note', width: 42 },
      { key: 'hours', width: 12 },
      { key: 'days', width: 12 },
    ];

    const title = sheet.addRow([`Feuille de temps — ${monthLabel(period.year, period.month)}`]);
    title.font = { size: 16, bold: true, color: { argb: `FF${BRAND}` } };
    sheet.mergeCells(title.number, 1, title.number, 7);
    sheet.addRow([]);

    this.metaLines(period).forEach(([label, value]) => {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true };
      sheet.mergeCells(row.number, 2, row.number, 7);
    });
    sheet.addRow([]);

    const header = sheet.addRow(['Date', 'Jour', 'Type', 'Projet', 'Note', 'Heures', 'Jours']);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCFD8E3' } } };
    });

    rows.forEach((row, index) => {
      const excelRow = sheet.addRow([
        row.date,
        row.dayName,
        row.type,
        row.project,
        row.note,
        row.hours,
        row.days,
      ]);
      if (index % 2 === 1) {
        excelRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        });
      }
      excelRow.getCell(6).numFmt = '0.00';
      excelRow.getCell(7).numFmt = '0.00';
    });

    const totalRow = sheet.addRow([
      'TOTAL',
      '',
      '',
      '',
      '',
      round2(period.totalHours),
      round2(period.totalDays),
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(6).numFmt = '0.00';
    totalRow.getCell(7).numFmt = '0.00';
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: 'medium', color: { argb: `FF${BRAND}` } } };
    });

    // Recap sheet — hours per project over the month.
    const recap = workbook.addWorksheet('Récapitulatif');
    recap.columns = [
      { key: 'label', width: 40 },
      { key: 'hours', width: 14 },
      { key: 'days', width: 14 },
    ];
    const recapHeader = recap.addRow(['Projet / Type', 'Heures', 'Jours']);
    recapHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
      cell.alignment = { horizontal: 'center' };
    });
    this.toProjectTotals(rows).forEach((entry) => {
      const row = recap.addRow([entry.label, entry.hours, entry.days]);
      row.getCell(2).numFmt = '0.00';
      row.getCell(3).numFmt = '0.00';
    });
    const recapTotal = recap.addRow([
      'TOTAL',
      round2(period.totalHours),
      round2(period.totalDays),
    ]);
    recapTotal.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  async toPdf(payload: ExportPayload): Promise<Buffer> {
    const rows = this.toRows(payload);
    const { period } = payload;

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    doc
      .fillColor(`#${BRAND}`)
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Feuille de temps', left, doc.y)
      .fillColor('#0f172a')
      .fontSize(13)
      .text(monthLabel(period.year, period.month));

    doc.moveDown(0.8);

    // Meta block, two columns.
    const meta = this.metaLines(period);
    const colWidth = width / 2;
    const metaTop = doc.y;
    meta.forEach(([label, value], index) => {
      const column = index % 2;
      const line = Math.floor(index / 2);
      const x = left + column * colWidth;
      const y = metaTop + line * 16;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#64748b')
        .text(`${label} : `, x, y, { continued: true, width: colWidth - 10 })
        .font('Helvetica')
        .fillColor('#0f172a')
        .text(value);
    });
    doc.y = metaTop + Math.ceil(meta.length / 2) * 16 + 12;

    if (period.status === TimesheetPeriodStatus.APPROVED) {
      doc
        .roundedRect(left, doc.y, width, 24, 6)
        .fillAndStroke('#f1f8ec', `#${BRAND}`)
        .fillColor(`#${BRAND}`)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(
          `Validée par ${period.reviewer?.name ?? '—'} le ${formatDateTime(period.reviewedAt)}`,
          left + 10,
          doc.y + 7,
          { width: width - 20 },
        );
      doc.y += 34;
    }

    // Table.
    const columns: Array<{ label: string; key: keyof ExportRow; width: number; align: 'left' | 'right' }> = [
      { label: 'Date', key: 'date', width: 62, align: 'left' },
      { label: 'Jour', key: 'dayName', width: 62, align: 'left' },
      { label: 'Type', key: 'type', width: 80, align: 'left' },
      { label: 'Projet', key: 'project', width: 110, align: 'left' },
      { label: 'Note', key: 'note', width: width - 62 - 62 - 80 - 110 - 55 - 46, align: 'left' },
      { label: 'Heures', key: 'hours', width: 55, align: 'right' },
      { label: 'Jours', key: 'days', width: 46, align: 'right' },
    ];

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, width, 20).fill(`#${BRAND}`);
      let x = left + 6;
      columns.forEach((col) => {
        doc
          .fillColor('#ffffff')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(col.label, x, y + 6, { width: col.width - 8, align: col.align });
        x += col.width;
      });
      doc.y = y + 20;
    };

    drawHeader();

    rows.forEach((row, index) => {
      if (doc.y + 20 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      if (index % 2 === 1) {
        doc.rect(left, y, width, 18).fill('#f8fafc');
      }
      let x = left + 6;
      columns.forEach((col) => {
        const raw = row[col.key];
        const value = typeof raw === 'number' ? raw.toFixed(2) : String(raw ?? '');
        doc
          .fillColor('#0f172a')
          .font('Helvetica')
          .fontSize(8.5)
          .text(value, x, y + 5, {
            width: col.width - 8,
            align: col.align,
            ellipsis: true,
            height: 12,
          });
        x += col.width;
      });
      doc
        .moveTo(left, y + 18)
        .lineTo(right, y + 18)
        .strokeColor('#e6ebf1')
        .lineWidth(0.5)
        .stroke();
      doc.y = y + 18;
    });

    // Totals.
    if (doc.y + 26 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const totalY = doc.y;
    doc.rect(left, totalY, width, 22).fill('#eef2f6');
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text('TOTAL', left + 6, totalY + 6)
      .text(
        `${round2(period.totalHours).toFixed(2)} h`,
        right - 101,
        totalY + 6,
        { width: 55 - 8, align: 'right' },
      )
      .text(
        `${round2(period.totalDays).toFixed(2)} j`,
        right - 46,
        totalY + 6,
        { width: 46 - 8, align: 'right' },
      );
    doc.y = totalY + 32;

    // Per-project recap.
    const projectTotals = this.toProjectTotals(rows);
    if (projectTotals.length > 0) {
      if (doc.y + 30 + projectTotals.length * 14 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#0f172a')
        .text('Récapitulatif par projet', left, doc.y);
      doc.moveDown(0.4);
      projectTotals.forEach((entry) => {
        const y = doc.y;
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#0f172a')
          .text(entry.label, left + 6, y, { width: width - 160, ellipsis: true })
          .text(`${entry.hours.toFixed(2)} h`, right - 150, y, { width: 70, align: 'right' })
          .text(`${entry.days.toFixed(2)} j`, right - 70, y, { width: 64, align: 'right' });
        doc.y = y + 14;
      });
    }

    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#94a3b8')
      .text(
        `Document généré le ${formatDateTime(new Date())} — Norsys Resource Tracker`,
        left,
        doc.page.height - doc.page.margins.bottom - 12,
        { width, align: 'center' },
      );

    doc.end();
    return done;
  }
}

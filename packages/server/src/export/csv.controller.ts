import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { Pool } from 'mysql2/promise';
import { DB_POOL } from '../pipeline/run.service';
import { MysqlExecutor } from '../db/mysql-executor';

interface AllocationExportRow {
  ref: string;
  sku: string;
  warehouse: string;
  qty: number;
  unit_cost_cents: number;
}

interface ApplicationExportRow {
  payment_id: number;
  invoice_number: string;
  amount_cents: number;
}

/**
 * Streams the current run's output as CSV. Rows go out as they come off the
 * wire (with backpressure); the export is never assembled in memory, so its
 * size does not affect the process footprint.
 */
@Controller()
export class CsvController {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  @Get('runs/export.csv')
  async export(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="run-export.csv"');

    const db = new MysqlExecutor(this.pool);
    const write = async (line: string): Promise<void> => {
      if (!res.write(line)) {
        await new Promise<void>((resolve) => res.once('drain', () => resolve()));
      }
    };

    await write('record_type,requisition_ref,product_sku,warehouse,payment_id,invoice_number,qty,amount_cents\n');

    const allocations = db.iterate<AllocationExportRow>(
      `SELECT r.ref AS ref, p.sku AS sku, w.code AS warehouse, a.qty AS qty, a.unit_cost_cents AS unit_cost_cents
         FROM allocations a
         JOIN requisition_lines rl ON rl.id = a.requisition_line_id
         JOIN requisitions r ON r.id = rl.requisition_id
         JOIN products p ON p.id = rl.product_id
         JOIN stock s ON s.id = a.stock_id
         JOIN warehouses w ON w.id = s.warehouse_id
        ORDER BY a.id`,
    );
    for await (const row of allocations) {
      await write(
        `allocation,${row.ref},${row.sku},${row.warehouse},,,${row.qty},${row.qty * row.unit_cost_cents}\n`,
      );
    }

    const applications = db.iterate<ApplicationExportRow>(
      `SELECT pa.payment_id AS payment_id, i.number AS invoice_number, pa.amount_cents AS amount_cents
         FROM payment_applications pa
         JOIN invoices i ON i.id = pa.invoice_id
        ORDER BY pa.id`,
    );
    for await (const row of applications) {
      await write(`settlement,,,,${row.payment_id},${row.invoice_number},,${row.amount_cents}\n`);
    }

    res.end();
  }
}

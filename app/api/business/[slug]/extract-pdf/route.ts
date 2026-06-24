// app/api/business/[slug]/extract-pdf/route.ts
// Accepts a PDF upload, runs backend/extract_pdf.py via child_process,
// returns NormalizedTransaction[] as JSON.
// Same bridge pattern as ingest/route.ts — write temp file, run Python,
// read stdout, clean up.

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { requireBusinessMember, UnauthorizedError } from '../../../../lib/authz';

const execAsync = promisify(exec);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    await requireBusinessMember(slug);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'Missing or invalid file.' }, { status: 400 });
  }

  const originalName = (file as File).name ?? 'upload.pdf';
  const backendDir = path.join(process.cwd(), 'backend');
  const tempFileName = `temp_pdf_${slug}_${Date.now()}.pdf`;
  const tempFilePath = path.join(backendDir, tempFileName);

  try {
    // Write PDF bytes to temp file in backend/
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer));

    const { stdout, stderr } = await execAsync(
      `python extract_pdf.py ${tempFileName}`,
      { cwd: backendDir }
    );

    if (!stdout || !stdout.trim()) {
      throw new Error(
        stderr
          ? `Extractor produced no output. Stderr: ${stderr}`
          : 'Extractor produced no output. The PDF may have a non-tabular layout.'
      );
    }

    const transactions = JSON.parse(stdout.trim());

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return Response.json(
        {
          error:
            'No transactions could be extracted from this PDF. ' +
            'Make sure it is a standard M-Pesa or bank statement with a table layout.',
        },
        { status: 422 }
      );
    }

    return Response.json({ success: true, transactions, filename: originalName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[extract-pdf] Error:', message);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    // Always clean up — even on error
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
  }
}
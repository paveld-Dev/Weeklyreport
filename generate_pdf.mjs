import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePDF() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const htmlPath = path.join(__dirname, 'report.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  const outputPath = path.join(__dirname, 'Weekly_Report_Pavel_Dinesh.pdf');

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '15mm',
      bottom: '15mm',
      left: '18mm',
      right: '18mm'
    }
  });

  console.log(`PDF successfully created at: ${outputPath}`);
  await browser.close();
}

generatePDF().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});

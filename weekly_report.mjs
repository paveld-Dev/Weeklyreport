import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { getCentralSession } from './session_extractor.mjs';
import { saveDraftEml } from './email_draft.mjs';
import { openChromeGmailDraft } from './chrome_gmail.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pad = n => String(n).padStart(2, '0');
const fmtDate = dt => `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()}`;
const fmtIso = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

// Wednesday-to-Wednesday reporting period:
// Start Date = previous Wednesday (7 days prior)
// End Date = most recent completed Wednesday
export function getReportingPeriod(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  const day = d.getDay(); // 0 is Sun, 3 is Wed

  const diffToEnd = (day >= 3) ? (day - 3) : (day + 4);
  const endDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToEnd);
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 7);

  return {
    startDate,
    endDate,
    startDateStr: fmtDate(startDate),
    endDateStr: fmtDate(endDate),
    startIso: fmtIso(startDate),
    endIso: fmtIso(endDate)
  };
}

// Map Central project names to clean canonical display names (never vary by task)
function cleanProjectName(project, taskTitle) {
  const p = (project || '').trim();
  const t = (taskTitle || '').trim();
  const combined = `${p} ${t}`.toLowerCase();

  if (combined.includes('webhoster') || combined.includes('web hosting')) {
    return 'Webhosters';
  }
  if (combined.includes('job10') || combined.includes('job 10')) {
    return 'Job10';
  }
  if (combined.includes('tinybits') || combined.includes('tiny bits')) {
    return 'Tinybits';
  }
  if (combined.includes('bcmch')) {
    return 'BCMCH';
  }
  if (combined.includes('descartes')) {
    return 'Descartes';
  }
  if (combined.includes('baristi')) {
    return 'Baristi';
  }
  if (combined.includes('showreel') || combined.includes('show reel')) {
    return 'ShowReel';
  }

  if (p.toLowerCase().includes('internal meeting') || p.toLowerCase().includes('internal session')) {
    return 'Internal Sessions';
  }

  return p || 'General Work';
}

function decodeHtml(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function refineBullet(raw, projectName = '') {
  if (!raw) return '';
  let t = decodeHtml(raw);

  // Strip HTML tags
  t = t.replace(/<[^>]+>/g, ' ');

  // Strip metadata tags & patterns
  t = t.replace(/-\s*pavel\b/gi, '');
  t = t.replace(/\bpavel\s*-\s*/gi, '');
  t = t.replace(/-\s*\d{1,2}\s+[A-Za-z]{3}\b/gi, '');
  t = t.replace(/\b\d{1,2}\s+[A-Za-z]{3}\b/gi, '');
  t = t.replace(/-\s*\[\s*\d{4}-\d{2}-\d{2}\s*\]/g, '');
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  t = t.replace(/https?:\/\/\S+/g, '');
  t = t.replace(/Assigned to\s+[^-\n]+/gi, '');
  t = t.replace(/\[\s*\]/g, '');
  t = t.replace(/-\s*\d+$/, ''); // e.g. - 2 at end of title
  t = t.replace(/\s*-\s*$/, '');

  // Remove leading bullet characters/numbers
  t = t.replace(/^[-*•\d.)]\s*/, '');

  // Strip redundant project prefix if present, e.g. 'Descartes - ' or 'Job10 - '
  if (projectName) {
    const pSepRegex = new RegExp(`^${projectName}\\s*[-:]\\s*`, 'i');
    t = t.replace(pSepRegex, '');
    const pWordRegex = new RegExp(`^${projectName}\\s+(onboarding|design|ui|ux|development|revamp|landing|page|website|app)\\b`, 'i');
    if (pWordRegex.test(t)) {
      t = t.replace(new RegExp(`^${projectName}\\s+`, 'i'), '');
    }
  }

  // Strip trailing punctuation noise (dashes, colons, semicolons, commas, periods)
  t = t.replace(/[\s\-:;,\.]+$/, '');

  // Normalize internal whitespace
  t = t.replace(/\s+/g, ' ').trim();

  // Capitalize first character
  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  return t;
}

// Convert raw task descriptions into concise professional bullet points without changing meaning or details
function cleanTaskToBullets(task, projectName = '') {
  const title = (task.task_title || '').trim();
  const desc = (task.task_description || '').trim();

  // If description has content, use it; otherwise use title
  const source = desc.length > 0 ? desc : title;

  // Split lines if multi-line / bulleted
  const rawLines = source.split(/\r?\n|<br\s*\/?>/i);
  const bullets = [];

  for (const line of rawLines) {
    const cleaned = refineBullet(line, projectName);
    if (cleaned.length > 0 && !bullets.includes(cleaned)) {
      bullets.push(cleaned);
    }
  }

  // If description didn't yield bullets, fall back to title
  if (bullets.length === 0 && title.length > 0) {
    const cleanedTitle = refineBullet(title, projectName);
    if (cleanedTitle.length > 0) {
      bullets.push(cleanedTitle);
    }
  }

  return bullets.length > 0 ? bullets : [refineBullet(source, projectName) || 'General task updates'];
}

// Fetch tasks from Central
async function fetchTasksFromCentral(period) {
  const session = getCentralSession();
  if (!session || !session.PHPSESSID) {
    throw new Error('Unable to find active Central session in browser.');
  }

  console.log('Connecting to Central using active local browser session...');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setCookie(
      { name: 'userid', value: session.userid, domain: 'central.armia.work', path: '/' },
      { name: 'PHPSESSID', value: session.PHPSESSID, domain: 'central.armia.work', path: '/' }
    );

    await page.goto('https://central.armia.work/cms?section=my_tasks', { waitUntil: 'networkidle2' });

    const isLogin = await page.evaluate(() => !!document.querySelector('input[type=password]'));
    if (isLogin) {
      throw new Error('Central session expired or requires interactive login.');
    }

    const tasks = await page.evaluate(async () => {
      const el = document.querySelector('[ng-controller]');
      const injector = window.angular.element(el).injector();
      const taskService = injector.get('taskService');
      const res = await taskService.fetchAllTasks({ offset: 0, limit: 100 });
      return res.data;
    });

    console.log(`Successfully fetched ${tasks.length} total tasks from Central.`);

    // Filter strictly by start/end ISO dates
    const inRange = tasks.filter(t => {
      const d = t.task_starttime || t.task_estimated_completion_date;
      return d >= period.startIso && d <= period.endIso;
    });

    console.log(`Filtered ${inRange.length} task(s) for reporting period: ${period.startDateStr} (${period.startIso}) to ${period.endDateStr} (${period.endIso}).`);
    return inRange;
  } finally {
    await browser.close();
  }
}

// Build HTML matching reference
function buildReportHtml(externalTasks, internalTasks, period, logoDataUri) {
  let externalRowsHtml = '';
  externalTasks.forEach((item, index) => {
    const bulletsHtml = item.bullets.map(b => `          <li>${b}</li>`).join('\n');
    externalRowsHtml += `
    <!-- External Row ${index + 1} -->
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-project">${item.project}</td>
      <td class="col-task">
        <ul class="task-list">
${bulletsHtml}
        </ul>
      </td>
      <td class="col-status">${item.status}</td>
    </tr>`;
  });

  let internalRowsHtml = '';
  internalTasks.forEach((item, index) => {
    const bulletsHtml = item.bullets.map(b => `          <li>${b}</li>`).join('\n');
    internalRowsHtml += `
    <!-- Internal Row ${index + 1} -->
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-project">${item.project}</td>
      <td class="col-task">
        <ul class="task-list">
${bulletsHtml}
        </ul>
      </td>
      <td class="col-status">${item.status}</td>
    </tr>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Weekly Report - Pavel Dinesh</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 16mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      background: #fff;
      font-size: 13.5px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .report-container {
      width: 100%;
      margin: 0 auto;
    }

    .header-logo {
      text-align: center;
      margin-bottom: 6px;
      padding-top: 2px;
    }

    .armia-logo-img {
      height: 44px;
      width: auto;
      display: inline-block;
    }

    .logo-caption {
      font-size: 8px;
      color: #949ca5;
      font-family: Arial, Helvetica, sans-serif;
      margin-top: -6px;
      margin-left: 55px;
      letter-spacing: 0.3px;
    }

    .title {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      margin-top: 8px;
      margin-bottom: 12px;
      color: #000;
    }

    table.report-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #000;
    }

    table.report-table th, 
    table.report-table td {
      border: 1px solid #000;
      padding: 8px 10px;
      font-size: 13px;
      color: #000;
    }

    .meta-label {
      width: 50%;
      font-weight: normal;
    }

    .meta-value {
      width: 50%;
      font-weight: normal;
    }

    .section-title-cell {
      font-weight: bold;
      font-size: 14px;
      padding: 5px 9px;
      text-align: left;
    }

    .header-cell {
      font-weight: bold;
      font-size: 13px;
      text-align: left;
      padding: 5px 9px;
    }

    .col-no {
      width: 5.5%;
      text-align: left;
      vertical-align: top;
      padding-top: 8px;
    }

    .col-project {
      width: 25.5%;
      vertical-align: top;
      padding-top: 8px;
    }

    .col-task {
      width: 49%;
      vertical-align: top;
      padding-top: 6px;
      padding-bottom: 6px;
    }

    .col-status {
      width: 20%;
      vertical-align: top;
      padding-top: 8px;
      font-weight: bold;
      font-style: italic;
    }

    /* Task bullet list */
    ul.task-list {
      margin: 0;
      padding-left: 16px;
      list-style-type: disc;
    }

    ul.task-list li {
      margin-bottom: 4px;
      line-height: 1.35;
    }

    ul.task-list li:last-child {
      margin-bottom: 0;
    }

    /* Print styles */
    @media print {
      body {
        margin: 0;
      }
      tr {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>

<div class="report-container">
  <!-- Header Logo -->
  <div class="header-logo">
    <div style="display: inline-block; text-align: center;">
      <img src="${logoDataUri}" alt="Armia Systems Inc." class="armia-logo-img">
      <div class="logo-caption">systems inc.</div>
    </div>
    <div class="title">Weekly Report</div>
  </div>

  <table class="report-table">
    <!-- Metadata Rows -->
    <tr>
      <td colspan="2" class="meta-label">Staff</td>
      <td colspan="2" class="meta-value">Pavel Dinesh</td>
    </tr>
    <tr>
      <td colspan="2" class="meta-label">Start Date</td>
      <td colspan="2" class="meta-value">${period.startDateStr}</td>
    </tr>
    <tr>
      <td colspan="2" class="meta-label">End Date</td>
      <td colspan="2" class="meta-value">${period.endDateStr}</td>
    </tr>

    <!-- External Works Header -->
    <tr>
      <td colspan="4" class="section-title-cell">External Works</td>
    </tr>
    <tr>
      <td class="col-no header-cell"></td>
      <td class="col-project header-cell">Project</td>
      <td class="col-task header-cell">Task</td>
      <td class="col-status header-cell">Status</td>
    </tr>
${externalRowsHtml}

    <!-- Internal Work Header -->
    <tr>
      <td colspan="4" class="section-title-cell">Internal Work</td>
    </tr>
    <tr>
      <td class="col-no header-cell"></td>
      <td class="col-project header-cell">Project</td>
      <td class="col-task header-cell">Task</td>
      <td class="col-status header-cell">Status</td>
    </tr>
${internalRowsHtml}

  </table>
</div>

</body>
</html>`;
}

// Main execution function
export async function runWeeklyReportGenerator() {
  console.log('=== Starting Weekly Report Generator ===');

  // Mandatory Logo Check (STOP PDF generation if missing)
  const logoPath = path.join(__dirname, 'armialogo.png');
  if (!fs.existsSync(logoPath) || fs.statSync(logoPath).size === 0) {
    const errorMsg = 'MANDATORY LOGO MISSING: Armia Systems Inc. logo (armialogo.png) could not be loaded. Stopping report generation as instructed.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  const logoBuffer = fs.readFileSync(logoPath);
  const logoDataUri = `data:image/png;base64,${logoBuffer.toString('base64')}`;
  console.log('✓ Armia Systems Inc. logo validated and loaded.');

  // Date Calculation
  const period = getReportingPeriod(new Date());
  console.log(`✓ Reporting period calculated: ${period.startDateStr} to ${period.endDateStr}`);

  // Fetch Central Tasks
  const rawTasks = await fetchTasksFromCentral(period);

  // Group tasks by project name so all tasks for the same project share one row
  const externalMap = new Map();
  const internalMap = new Map();
  const seenTaskKeys = new Set();

  for (const t of rawTasks) {
    const key = `${t.task_id}-${t.task_title}`;
    if (seenTaskKeys.has(key)) continue;
    seenTaskKeys.add(key);

    const isInternal = (t.project_name || '').toLowerCase().includes('internal session');
    const projectName = cleanProjectName(t.project_name, t.task_title);
    const bullets = cleanTaskToBullets(t, projectName);

    const targetMap = isInternal ? internalMap : externalMap;

    if (!targetMap.has(projectName)) {
      targetMap.set(projectName, {
        project: projectName,
        bullets: [],
        status: 'Completed'
      });
    }

    const group = targetMap.get(projectName);
    for (const b of bullets) {
      const trimmed = b.trim();
      if (trimmed && !group.bullets.includes(trimmed)) {
        group.bullets.push(trimmed);
      }
    }
  }

  const externalTasks = Array.from(externalMap.values());
  const internalTasks = Array.from(internalMap.values());

  console.log(`✓ Categorized & grouped tasks: ${externalTasks.length} External project(s), ${internalTasks.length} Internal project(s).`);

  // Validation Checks prior to finalization
  if (!logoDataUri) throw new Error('Validation failed: Logo data URI is missing.');
  if (externalTasks.length === 0 && internalTasks.length === 0) {
    console.warn('Warning: No tasks found for the current period.');
  }

  // Build HTML
  const htmlContent = buildReportHtml(externalTasks, internalTasks, period, logoDataUri);
  const generatedHtmlPath = path.join(__dirname, 'report.html');
  fs.writeFileSync(generatedHtmlPath, htmlContent, 'utf8');

  // Generate PDF
  const pdfFilename = `Weekly_Report_Pavel_Dinesh_${period.startDateStr}_to_${period.endDateStr}.pdf`;
  const pdfOutputPath = path.join(__dirname, pdfFilename);

  console.log(`✓ Rendering PDF via Puppeteer: ${pdfFilename}...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(`file://${generatedHtmlPath}`, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: pdfOutputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '14mm',
      bottom: '14mm',
      left: '16mm',
      right: '16mm'
    }
  });

  await browser.close();

  // Validate PDF was generated successfully
  if (!fs.existsSync(pdfOutputPath) || fs.statSync(pdfOutputPath).size === 0) {
    throw new Error('PDF generation failed or output file is empty.');
  }

  // Also maintain canonical Weekly_Report_Pavel_Dinesh.pdf
  fs.copyFileSync(pdfOutputPath, path.join(__dirname, 'Weekly_Report_Pavel_Dinesh.pdf'));
  console.log(`✓ PDF successfully validated: ${pdfOutputPath} (${fs.statSync(pdfOutputPath).size} bytes)`);

  // Create Email Draft (.eml)
  const emlOutputPath = path.join(__dirname, 'Weekly_Report_Draft.eml');
  saveDraftEml(pdfOutputPath, emlOutputPath);

  // Open Chrome with logged-in company Gmail compose draft
  openChromeGmailDraft(pdfOutputPath);

  console.log('=== Weekly Report Generator Completed Successfully ===');
  return {
    pdfPath: pdfOutputPath,
    pdfFilename,
    emlPath: emlOutputPath,
    period,
    externalTasks,
    internalTasks
  };
}

if (process.argv[1] && process.argv[1].endsWith('weekly_report.mjs')) {
  runWeeklyReportGenerator().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}

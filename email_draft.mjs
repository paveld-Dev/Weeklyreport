import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function saveDraftEml(pdfPath, outputPath) {
  const boundaryMixed = '----=_Mixed_' + Date.now() + '_' + Math.random().toString(36).substring(2);
  const boundaryRelated = '----=_Related_' + Date.now() + '_' + Math.random().toString(36).substring(2);
  const boundaryAlt = '----=_Alt_' + Date.now() + '_' + Math.random().toString(36).substring(2);

  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBytes.toString('base64');
  const pdfFilename = path.basename(pdfPath);

  // Load logo for inline CID embedding
  const logoPath = path.join(__dirname, 'armialogo.png');
  const logoExists = fs.existsSync(logoPath);
  const logoBase64 = logoExists ? fs.readFileSync(logoPath).toString('base64') : '';

  const plainTextBody = [
    'Hi, Hemanth',
    '',
    'Please find the attached weekly report.',
    '',
    'Pavel Dinesh',
    'UI/UX Designer',
    '',
    'Mobile: +91 7012798235',
    'www.armia.com | +91-484-2973123 | sales@armia.com',
    'Driving Innovation, Delivering Results'
  ].join('\r\n');

  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #222222; line-height: 1.5; margin: 0; padding: 12px;">
  <p style="margin: 0 0 16px 0;">Hi, Hemanth</p>
  <p style="margin: 0 0 24px 0;">Please find the attached weekly report.</p>
  
  <table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.4;">
    <tr>
      <td style="font-size: 16px; font-weight: bold; color: #245292; padding-bottom: 2px;">
        Pavel Dinesh
      </td>
    </tr>
    <tr>
      <td style="font-size: 13px; color: #245292; padding-bottom: 12px;">
        UI/UX Designer
      </td>
    </tr>
    <tr>
      <td style="padding-bottom: 12px;">
        <img src="cid:armialogo" alt="Armia Systems Inc." width="140" style="display: block; width: 140px; max-width: 140px; height: auto; border: 0;" />
      </td>
    </tr>
    <tr>
      <td style="font-size: 13px; color: #245292; padding-bottom: 4px;">
        Mobile: <a href="tel:+917012798235" style="color: #245292; text-decoration: underline;">+91 7012798235</a>
      </td>
    </tr>
    <tr>
      <td style="font-size: 13px; color: #245292; padding-bottom: 8px;">
        <a href="https://www.armia.com" style="color: #245292; text-decoration: underline;">www.armia.com</a>
        <span style="color: #245292; margin: 0 4px; text-decoration: none;">|</span>
        <a href="tel:+914842973123" style="color: #245292; text-decoration: underline;">+91-484-2973123</a>
        <span style="color: #245292; margin: 0 4px; text-decoration: none;">|</span>
        <a href="mailto:sales@armia.com" style="color: #245292; text-decoration: underline;">sales@armia.com</a>
      </td>
    </tr>
    <tr>
      <td>
        <span style="display: inline-block; background-color: #245292; color: #ffffff; font-weight: bold; font-size: 12px; padding: 2px 6px; letter-spacing: 0.2px;">
          Driving Innovation, Delivering Results
        </span>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const lines = [
    'To: hemanth.m@armiasystems.com',
    'Cc: Aji Abraham <aji.abraham@armia.com>, Anand Selvam <anand.selvam@armiasystems.com>, Mahesh S <mahesh.s@armiasystems.com>, developers <developers@armiasystems.com>',
    'Subject: Weekly Report',
    'X-Unsent: 1',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
    '',
    `--${boundaryMixed}`,
    `Content-Type: multipart/related; boundary="${boundaryRelated}"`,
    '',
    `--${boundaryRelated}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plainTextBody,
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundaryAlt}--`
  ];

  if (logoExists && logoBase64) {
    lines.push(
      '',
      `--${boundaryRelated}`,
      'Content-Type: image/png; name="armialogo.png"',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <armialogo>',
      'Content-Disposition: inline; filename="armialogo.png"',
      '',
      logoBase64.match(/.{1,76}/g).join('\r\n')
    );
  }

  lines.push(
    '',
    `--${boundaryRelated}--`,
    '',
    `--${boundaryMixed}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    '',
    pdfBase64.match(/.{1,76}/g).join('\r\n'),
    '',
    `--${boundaryMixed}--`,
    ''
  );

  const emlContent = lines.join('\r\n');
  fs.writeFileSync(outputPath, emlContent, 'utf8');
  console.log(`✓ Draft email saved (.eml): ${outputPath}`);
}

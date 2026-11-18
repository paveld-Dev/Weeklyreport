import { exec, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export function openChromeGmailDraft(pdfPath) {
  const to = 'hemanth.m@armiasystems.com';
  const cc = 'aji.abraham@armia.com,anand.selvam@armiasystems.com,mahesh.s@armiasystems.com,developers@armiasystems.com';
  const subject = 'Weekly Report';

  // Body text formatted with the requested signature
  const bodyText = [
    'Hi, Hemanth\r\n',
    'Please find the attached weekly report.\r\n',
    'Pavel Dinesh',
    'UI/UX Designer\r\n',
    'Mobile: +91 7012798235',
    'www.armia.com | +91-484-2973123 | sales@armia.com',
    'Driving Innovation, Delivering Results'
  ].join('\r\n');

  const composeUrlWithBody = `https://mail.google.com/mail/u/0/?view=cm&fs=1&to=${encodeURIComponent(to)}&cc=${encodeURIComponent(cc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

  const absPdfPath = path.resolve(pdfPath);
  console.log(`Setting up Gmail draft in Chrome with full recipients and report...`);

  // Copy PDF file to Windows clipboard so user can simply press Ctrl+V directly into Gmail to attach
  try {
    const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetFileDropList([string[]]@('${absPdfPath.replace(/'/g, "''")}'))"`;
    execSync(psCmd, { stdio: 'ignore' });
    console.log('✓ Generated PDF is copied to clipboard (press Ctrl+V in Gmail to attach).');
  } catch (e) {
    // Graceful fallback
  }

  // Launch Chrome
  console.log('Launching Gmail compose window in Google Chrome...');
  try {
    exec(`start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "${composeUrlWithBody}"`, { shell: 'cmd.exe' });
    console.log('✓ Google Chrome Gmail draft opened with:');
    console.log('    From:    Pavel Dinesh <pavel.d@armiasystems.com>');
    console.log('    To:      ' + to);
    console.log('    Cc:      ' + cc);
    console.log('    Subject: ' + subject);
    console.log('    Signature included at the end of the mail.');
    console.log('    Status:  Saved as Draft in Gmail (not sent automatically).');
  } catch (err) {
    console.error('Error launching Chrome:', err.message);
  }
}

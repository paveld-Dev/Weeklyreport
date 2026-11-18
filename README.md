# Weekly Report Generator Automation

An end-to-end automation tool that fetches your weekly tasks from Central, generates a formatted PDF matching the exact Armia Systems Inc. standard template, and creates a ready-to-send email draft.

---

## 📁 Key Files

- [weekly_report.mjs](file:///c:/Pavel/Auto%20Generated/weekly_report.mjs): Main automation engine.
- [session_extractor.mjs](file:///c:/Pavel/Auto%20Generated/session_extractor.mjs): Dynamic browser session extractor for `central.armia.work`.
- [email_draft.mjs](file:///c:/Pavel/Auto%20Generated/email_draft.mjs): RFC-compliant email draft generator (`.eml`).
- [report.html](file:///c:/Pavel/Auto%20Generated/report.html): Pixel-perfect reference template.
- [armialogo.png](file:///c:/Pavel/Auto%20Generated/armialogo.png): Mandatory Armia Systems Inc. logo.
- [run_weekly_report.bat](file:///c:/Pavel/Auto%20Generated/run_weekly_report.bat): One-click runner for Windows.

---

## ⚙️ How It Works

1. **Logo Validation**: Verifies `armialogo.png`. If missing, execution halts immediately.
2. **Date Range**: Calculates current reporting period for any Wednesday report (`previous Wednesday` to `current Tuesday`).
3. **Session & Central Tasks**: Uses your authenticated browser session to query `https://central.armia.work/cms?section=my_tasks`.
4. **Categorization & Cleanup**:
   - `Internal Sessions` -> **Internal Work**
   - Client / product / website tasks -> **External Works**
   - Descriptions formatted into concise professional bullet points without metadata or internal links.
5. **PDF Rendering**: Renders via Puppeteer to `Weekly_Report_Pavel_Dinesh_DD-MM-YYYY_to_DD-MM-YYYY.pdf` and `Weekly_Report_Pavel_Dinesh.pdf`.
6. **Draft Email**: Creates `Weekly_Report_Draft.eml` with the PDF attached, ready in your draft box (never sent automatically).

---

## 🚀 How to Run Manually

From PowerShell or Command Prompt:
```cmd
cd "C:\Pavel\Auto Generated"
node weekly_report.mjs
```
Or double-click `run_weekly_report.bat`.

---

## ⏰ Optional: Schedule Every Wednesday

To trigger every Wednesday at 10:00 AM via Windows Task Scheduler:
```powershell
schtasks /create /tn "Weekly Report Generator" /tr "node.exe \"C:\Pavel\Auto Generated\weekly_report.mjs\"" /sc weekly /d WED /st 10:00 /f
```

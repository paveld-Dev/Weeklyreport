import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Decompresses Mozilla .jsonlz4 / .mozlz4 files.
 * Format: 8 bytes magic ('mozLz40\0') + 4 bytes LE uncompressed size + standard LZ4 block stream.
 */
function decompressMozLz4(buffer) {
  if (buffer.subarray(0, 8).toString('latin1') !== 'mozLz40\0') {
    return buffer.toString('utf8');
  }

  const uncompressedSize = buffer.readUInt32LE(8);
  const output = Buffer.allocUnsafe(uncompressedSize);
  let inPos = 12;
  let outPos = 0;

  while (inPos < buffer.length && outPos < uncompressedSize) {
    const token = buffer[inPos++];
    let literalLen = token >> 4;
    if (literalLen === 15) {
      let b;
      do {
        b = buffer[inPos++];
        literalLen += b;
      } while (b === 255);
    }

    buffer.copy(output, outPos, inPos, inPos + literalLen);
    outPos += literalLen;
    inPos += literalLen;

    if (outPos >= uncompressedSize || inPos >= buffer.length) break;

    const offset = buffer.readUInt16LE(inPos);
    inPos += 2;

    let matchLen = (token & 0x0f) + 4;
    if ((token & 0x0f) === 15) {
      let b;
      do {
        b = buffer[inPos++];
        matchLen += b;
      } while (b === 255);
    }

    for (let i = 0; i < matchLen; i++) {
      output[outPos + i] = output[outPos - offset + i];
    }
    outPos += matchLen;
  }

  return output.subarray(0, outPos).toString('utf8');
}

/**
 * Extract cookies from SQLite database (e.g. cookies.sqlite).
 */
function getCookiesFromSqlite(dbPath) {
  const result = {};
  if (!fs.existsSync(dbPath)) return result;

  // Make a temporary copy in case SQLite database is actively locked by Firefox
  const tmpCopy = path.join(path.dirname(dbPath), `cookies_tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.sqlite`);
  try {
    fs.copyFileSync(dbPath, tmpCopy);
    const db = new DatabaseSync(tmpCopy, { readOnly: true });
    const stmt = db.prepare("SELECT name, value FROM moz_cookies WHERE host LIKE '%armia%'");
    const rows = stmt.all();
    for (const row of rows) {
      result[row.name] = row.value;
    }
    db.close();
  } catch {
    // Ignore errors reading SQLite
  } finally {
    if (fs.existsSync(tmpCopy)) {
      try { fs.unlinkSync(tmpCopy); } catch {}
    }
  }
  return result;
}

/**
 * Extract cookies from Firefox sessionstore JSON/LZ4 file.
 */
function getCookiesFromSessionFile(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const jsonStr = decompressMozLz4(buffer);
    const data = JSON.parse(jsonStr);
    const cookies = [];

    if (Array.isArray(data.cookies)) {
      cookies.push(...data.cookies);
    }
    if (Array.isArray(data.windows)) {
      for (const w of data.windows) {
        if (Array.isArray(w.cookies)) {
          cookies.push(...w.cookies);
        }
      }
    }

    const result = {};
    for (const c of cookies) {
      if (c && c.host && c.host.includes('armia') && c.name && c.value) {
        result[c.name] = c.value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Dynamically extract active Central session tokens (userid and PHPSESSID).
 */
export function getCentralSession() {
  const appData = process.env.APPDATA || 'C:\\Users\\Pavel Dinesh\\AppData\\Roaming';
  const profileDir = path.join(appData, 'Mozilla', 'Firefox', 'Profiles');
  if (!fs.existsSync(profileDir)) return null;

  // Sort profiles by modification time descending (most active first)
  const entries = fs.readdirSync(profileDir)
    .map(name => {
      const fullPath = path.join(profileDir, name);
      try {
        return { name, path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      } catch {
        return { name, path: fullPath, mtime: 0 };
      }
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const { path: profilePath } of entries) {
    let phpSessId = null;
    let userId = null;

    // 1. Check cookies.sqlite (persistent cookies like userid)
    const sqliteCookies = getCookiesFromSqlite(path.join(profilePath, 'cookies.sqlite'));
    if (sqliteCookies.userid) userId = sqliteCookies.userid;
    if (sqliteCookies.PHPSESSID) phpSessId = sqliteCookies.PHPSESSID;

    // 2. Check sessionstore files (session cookies like PHPSESSID)
    const sessionFiles = [
      path.join(profilePath, 'sessionstore-backups', 'recovery.jsonlz4'),
      path.join(profilePath, 'sessionstore-backups', 'recovery.baklz4'),
      path.join(profilePath, 'sessionstore-backups', 'previous.jsonlz4'),
      path.join(profilePath, 'sessionstore.jsonlz4'),
      path.join(profilePath, 'sessionstore.js')
    ];

    for (const file of sessionFiles) {
      if (!fs.existsSync(file)) continue;
      const sessionCookies = getCookiesFromSessionFile(file);
      if (!phpSessId && sessionCookies.PHPSESSID) {
        phpSessId = sessionCookies.PHPSESSID;
      }
      if (!userId && sessionCookies.userid) {
        userId = sessionCookies.userid;
      }
      if (phpSessId) break;
    }

    if (phpSessId) {
      return {
        userid: userId || '1043',
        PHPSESSID: phpSessId
      };
    }
  }

  return null;
}

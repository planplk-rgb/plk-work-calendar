/* gas-mock.js — จำลองบริการ Google Apps Script ให้โค้ดหลังบ้านจริง (backend.js = Code.gs)
 * รันได้ในเบราว์เซอร์ (โหมดทดลอง) และใน Node (tests/smoke.js)
 * ข้อมูลเก็บใน localStorage ของเบราว์เซอร์ (คีย์ plk_cal_demo_db) — ไม่ส่งออกไปที่ใด */
(function (root) {
  'use strict';
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const STORE_KEY = 'plk_cal_demo_db';

  /* ---------- SHA-256 / HMAC (sync) ---------- */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  function sha256(msg) {
    const len = msg.length;
    const padLen = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(padLen);
    buf.set(msg);
    buf[len] = 0x80;
    const bits = len * 8;
    const dv = new DataView(buf.buffer);
    dv.setUint32(padLen - 4, bits >>> 0);
    dv.setUint32(padLen - 8, Math.floor(bits / 0x100000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }
  function concat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64); k.set(key);
    const ip = k.map((x) => x ^ 0x36), op = k.map((x) => x ^ 0x5c);
    return sha256(concat(op, sha256(concat(ip, msg))));
  }
  const toU8 = (x) => (x instanceof Uint8Array ? x : Array.isArray(x) ? Uint8Array.from(x.map((b) => b & 255)) : enc.encode(String(x)));
  const toSigned = (u8) => Array.from(u8, (b) => (b > 127 ? b - 256 : b));
  function b64enc(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(u8).toString('base64');
  }
  function b64dec(str) {
    const clean = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const s = typeof atob !== 'undefined' ? atob(clean) : Buffer.from(clean, 'base64').toString('binary');
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  /* ---------- state ---------- */
  let DB = { sheets: {}, order: [], props: {}, folders: {}, files: {} };
  const cache = new Map();
  const lineLog = [];
  function hasLS() { try { return typeof localStorage !== 'undefined' && localStorage !== null; } catch (e) { return false; } }
  function load() { if (hasLS()) { const s = localStorage.getItem(STORE_KEY); if (s) { try { DB = JSON.parse(s); } catch (e) { /* ignore */ } } } }
  function save() { if (hasLS()) { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { console.warn('gas-mock save failed', e); } } }
  function reset() { DB = { sheets: {}, order: [], props: {}, folders: {}, files: {} }; cache.clear(); lineLog.length = 0; if (hasLS()) localStorage.removeItem(STORE_KEY); }
  const strip = (v) => (typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v);
  const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });

  /* ---------- Spreadsheet ---------- */
  function Range(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.getValues = function () {
    const rows = DB.sheets[this.s.name];
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = rows[this.r - 1 + i] || [];
      const o = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); }
      out.push(o);
    }
    return out;
  };
  Range.prototype.setValues = function (vals) {
    const rows = DB.sheets[this.s.name];
    for (let i = 0; i < vals.length; i++) {
      const ri = this.r - 1 + i;
      while (rows.length <= ri) rows.push([]);
      for (let j = 0; j < vals[i].length; j++) rows[ri][this.c - 1 + j] = strip(vals[i][j]);
    }
    return this;
  };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  ['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setWrap', 'setHorizontalAlignment'].forEach((m) => { Range.prototype[m] = function () { return this; }; });

  function Sheet(name) { this.name = name; }
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getLastRow = function () { return DB.sheets[this.name].length; };
  Sheet.prototype.getLastColumn = function () { return DB.sheets[this.name].reduce((m, r) => Math.max(m, r.length), 0); };
  Sheet.prototype.getMaxRows = function () { return Math.max(1000, this.getLastRow()); };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
  Sheet.prototype.appendRow = function (arr) { DB.sheets[this.name].push(arr.map(strip)); return this; };
  Sheet.prototype.deleteRow = function (r) { DB.sheets[this.name].splice(r - 1, 1); };
  Sheet.prototype.setFrozenRows = function () { return this; };
  Sheet.prototype.setColumnWidth = function () { return this; };
  Sheet.prototype.clear = function () { DB.sheets[this.name] = []; return this; };

  const ss = {
    getSheetByName(n) { return DB.sheets[n] ? new Sheet(n) : null; },
    insertSheet(n) { if (!DB.sheets[n]) { DB.sheets[n] = []; DB.order.push(n); } return new Sheet(n); },
    getSheets() { return DB.order.map((n) => new Sheet(n)); },
    getUrl() { return '#demo-spreadsheet'; }
  };

  /* ---------- Drive (เก็บเฉพาะข้อมูลไฟล์ ไม่เก็บเนื้อไฟล์) ---------- */
  function Folder(id) { this.id = id; }
  Folder.prototype.getId = function () { return this.id; };
  Folder.prototype.getName = function () { return DB.folders[this.id].name; };
  Folder.prototype.getUrl = function () { return '#demo-folder-' + this.id; };
  Folder.prototype.createFolder = function (name) { const id = 'F' + uid().slice(0, 8); DB.folders[id] = { name, parent: this.id }; return new Folder(id); };
  Folder.prototype.getFoldersByName = function (name) {
    const ids = Object.keys(DB.folders).filter((k) => DB.folders[k].parent === this.id && DB.folders[k].name === name);
    let i = 0;
    return { hasNext: () => i < ids.length, next: () => new Folder(ids[i++]) };
  };
  Folder.prototype.createFile = function (blob) {
    const id = 'D' + uid().slice(0, 12);
    DB.files[id] = { name: blob.getName(), size: blob.getBytes().length, folder: this.id };
    return { getId: () => id, getUrl: () => '#demo-file-' + id, getName: () => blob.getName(), getSize: () => blob.getBytes().length };
  };
  const DriveApp = {
    createFolder(name) { const id = 'F' + uid().slice(0, 8); DB.folders[id] = { name, parent: 'root' }; return new Folder(id); },
    getFolderById(id) { if (!DB.folders[id]) throw new Error('ไม่พบโฟลเดอร์ ' + id); return new Folder(id); }
  };

  /* ---------- Blob / Utilities ---------- */
  function Blob(bytes, type, name) { this.b = bytes; this.t = type || 'application/octet-stream'; this.n = name || 'file'; }
  Blob.prototype.getBytes = function () { return toSigned(this.b); };
  Blob.prototype.getDataAsString = function () { return dec.decode(this.b); };
  Blob.prototype.getContentType = function () { return this.t; };
  Blob.prototype.getName = function () { return this.n; };
  Blob.prototype.setName = function (n) { this.n = n; return this; };

  function fmtDate(date, tz, fmt) {
    const off = /Bangkok|GMT\+7/.test(String(tz)) ? 7 : 0;
    const d = new Date(date.getTime() + off * 3600000);
    const p = (n, l) => String(n).padStart(l || 2, '0');
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const map = { yyyy: d.getUTCFullYear(), yy: p(d.getUTCFullYear() % 100), MM: p(d.getUTCMonth() + 1), dd: p(d.getUTCDate()), HH: p(d.getUTCHours()), mm: p(d.getUTCMinutes()), ss: p(d.getUTCSeconds()), u: wd };
    return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss|u/g, (t) => map[t]);
  }
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(alg, value) { return toSigned(sha256(toU8(value))); },
    computeHmacSha256Signature(value, key) { return toSigned(hmac(toU8(key), toU8(value))); },
    base64Encode(data) { return b64enc(toU8(data)); },
    base64EncodeWebSafe(data) { return b64enc(toU8(data)).replace(/\+/g, '-').replace(/\//g, '_'); },
    base64Decode(s) { return toSigned(b64dec(s)); },
    base64DecodeWebSafe(s) { return toSigned(b64dec(s)); },
    newBlob(data, type, name) { return new Blob(toU8(data), type, name); },
    getUuid: uid,
    formatDate: fmtDate,
    sleep() {}
  };

  /* ---------- UrlFetch (บันทึกการเรียก LINE API) ---------- */
  const UrlFetchApp = {
    fetch(url, opt) {
      opt = opt || {};
      let payload = null;
      try { payload = opt.payload ? JSON.parse(opt.payload) : null; } catch (e) { payload = opt.payload; }
      const rec = { at: new Date().toISOString(), url, method: (opt.method || 'get').toLowerCase(), payload };
      let body = {};
      if (/\/profile\//.test(url)) body = { displayName: 'ผู้ใช้ทดสอบ ' + url.slice(-4) };
      else if (/\/group\/.+\/summary/.test(url)) body = { groupName: 'กลุ่ม LINE ทดสอบ ' + url.split('/group/')[1].slice(0, 6) };
      else if (/quota\/consumption/.test(url)) body = { totalUsage: lineLog.filter((r) => /push/.test(r.url)).length };
      else if (/message\/quota/.test(url)) body = { type: 'limited', value: 300 };
      if (/message\/(push|reply)/.test(url)) { lineLog.push(rec); if (typeof api.onLine === 'function') api.onLine(rec); }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
    }
  };

  const api = { load, save, reset, lineLog, onLine: null, get db() { return DB; } };

  const G = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in DB.props ? DB.props[k] : null),
        setProperty(k, v) { DB.props[k] = String(v); return this; },
        deleteProperty(k) { delete DB.props[k]; return this; },
        getProperties: () => Object.assign({}, DB.props)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get(k) { const e = cache.get(k); if (!e) return null; if (e.x < Date.now()) { cache.delete(k); return null; } return e.v; },
        put(k, v, sec) { cache.set(k, { v: String(v), x: Date.now() + (sec || 600) * 1000 }); },
        remove(k) { cache.delete(k); }
      })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } })
    },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok', getActiveUser: () => ({ getEmail: () => '' }) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger() {},
      newTrigger() { const c = { timeBased: () => c, everyDays: () => c, atHour: () => c, inTimezone: () => c, nearMinute: () => c, create: () => ({}) }; return c; }
    },
    Logger: { log: function () { console.log.apply(console, arguments); } },
    DriveApp,
    Utilities,
    UrlFetchApp,
    GASMOCK: api
  };
  Object.keys(G).forEach((k) => { root[k] = G[k]; });
  load();
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ปฏิทินระบบงาน — ฟังก์ชันร่วม: เรียก API (หรือโหมดทดลอง), วันที่ภาษาไทย, สถานะ */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.API_URL;
  let demoReady = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('โหลดไฟล์ ' + src + ' ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }
  function ensureDemo() {
    if (!demoReady) {
      demoReady = loadScript('demo/gas-mock.js').then(function () { return loadScript('demo/backend.js'); }).then(function () {
        if (!window.GASMOCK.db.sheets.Groups) {
          const base = location.href.split('#')[0].replace(/[^/]*$/, '');
          window.seedDemo_(/^https:\/\//.test(base) ? base : '');
          window.GASMOCK.save();
        }
      });
    }
    return demoReady;
  }

  async function api(action, data) {
    const body = Object.assign({ action: action }, data || {});
    let res;
    if (DEMO) {
      await ensureDemo();
      const out = window.doPost({ parameter: {}, postData: { contents: JSON.stringify(body) } });
      window.GASMOCK.save();
      res = JSON.parse(out.getContent());
    } else {
      let r;
      try {
        r = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      } catch (e) {
        throw new Error('เชื่อมต่อระบบไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
      }
      if (!r.ok) throw new Error('เชื่อมต่อระบบไม่สำเร็จ (HTTP ' + r.status + ')');
      res = await r.json();
    }
    if (!res.ok) { const e = new Error(res.error || 'เกิดข้อผิดพลาด'); e.code = res.error; throw e; }
    return res.data;
  }

  /* line webhook simulator (demo only) */
  async function demoHook(events) {
    await ensureDemo();
    const out = window.doPost({ parameter: { hook: 'demo-hook' }, postData: { contents: JSON.stringify({ events: events }) } });
    window.GASMOCK.save();
    return JSON.parse(out.getContent());
  }

  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const dnum = (s) => { const p = String(s).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; };
  const fromNum = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const diffDays = (from, to) => Math.round(dnum(to) - dnum(from));
  const addDays = (s, n) => fromNum(dnum(s) + n);
  function thDate(s, opt) {
    if (!isDate(s)) return String(s || '');
    const p = String(s).split('-').map(Number);
    if (opt === 'full') return p[2] + ' ' + MONTHS[p[1] - 1] + ' ' + (p[0] + 543);
    return p[2] + ' ' + MON[p[1] - 1] + ' ' + String(p[0] + 543).slice(2);
  }
  function thDateTime(s) {
    const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? thDate(m[1]) + ' ' + m[2] + ' น.' : thDate(s);
  }
  function rangeText(a, b) {
    if (!b || a === b) return thDate(a, 'full');
    const pa = a.split('-'), pb = b.split('-');
    if (pa[0] === pb[0] && pa[1] === pb[1]) return Number(pa[2]) + '–' + thDate(b, 'full');
    return thDate(a) + ' – ' + thDate(b);
  }
  function monthLabel(ym) { const p = ym.split('-').map(Number); return MONTHS[p[1] - 1] + ' ' + (p[0] + 543); }
  function shiftMonth(ym, n) { const p = ym.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); return d.toISOString().slice(0, 7); }

  const S = { TODO: 'รอดำเนินการ', DOING: 'กำลังดำเนินการ', SENT: 'ส่งแล้ว (รอตรวจ)', DONE: 'เสร็จสิ้น', RETURN: 'ส่งกลับแก้ไข', POSTPONE: 'เลื่อน', CANCEL: 'ยกเลิก', OVER: 'เกินกำหนด' };
  const ST_CLASS = {};
  ST_CLASS[S.TODO] = 'st-todo'; ST_CLASS[S.DOING] = 'st-doing'; ST_CLASS[S.SENT] = 'st-sent'; ST_CLASS[S.DONE] = 'st-done';
  ST_CLASS[S.RETURN] = 'st-return'; ST_CLASS[S.POSTPONE] = 'st-postpone'; ST_CLASS[S.CANCEL] = 'st-cancel'; ST_CLASS[S.OVER] = 'st-over';
  const isOpen = (a) => [S.DONE, S.SENT, S.CANCEL].indexOf(a.status) < 0;
  const effStatus = (a, today) => (isOpen(a) && a.due < today ? S.OVER : a.status);
  const badge = (status) => '<span class="badge ' + (ST_CLASS[status] || 'st-todo') + '">' + esc(status) + '</span>';
  function dueText(today, due) {
    const d = diffDays(today, due);
    if (d < 0) return 'เกิน ' + (-d) + ' วัน';
    if (d === 0) return 'วันนี้';
    return 'อีก ' + d + ' วัน';
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : '#'; }

  const store = {
    get(k) { try { return localStorage.getItem('plk_cal_' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('plk_cal_' + k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem('plk_cal_' + k); } catch (e) { /* ignore */ } }
  };

  function toast(msg, isErr) {
    let box = document.querySelector('.toast-box');
    if (!box) { box = document.createElement('div'); box.className = 'toast-box'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, isErr ? 7000 : 4000);
  }

  function demoBanner(text) {
    if (!DEMO) return;
    const d = document.createElement('div');
    d.className = 'demo-banner';
    d.textContent = text;
    document.body.insertBefore(d, document.body.firstChild);
  }

  function readFileB64(file) {
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(new Error('อ่านไฟล์ ' + file.name + ' ไม่สำเร็จ')); };
      r.readAsDataURL(file);
    });
  }

  window.UI = {
    CFG: CFG, DEMO: DEMO, api: api, demoHook: demoHook, ensureDemo: ensureDemo,
    MONTHS: MONTHS, DOW: DOW, isDate: isDate, diffDays: diffDays, addDays: addDays, dnum: dnum, fromNum: fromNum,
    thDate: thDate, thDateTime: thDateTime, rangeText: rangeText, monthLabel: monthLabel, shiftMonth: shiftMonth,
    S: S, ST_CLASS: ST_CLASS, isOpen: isOpen, effStatus: effStatus, badge: badge, dueText: dueText,
    esc: esc, safeUrl: safeUrl, store: store, toast: toast, demoBanner: demoBanner, readFileB64: readFileB64
  };
})();

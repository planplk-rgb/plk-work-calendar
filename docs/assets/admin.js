/* ปฏิทินระบบงาน — หน้าฝั่งยุทธ์ (ผู้ดูแล) */
(function () {
  'use strict';
  const U = window.UI;
  const esc = U.esc;
  const view = document.getElementById('view');
  const dlg = document.getElementById('dlg');
  const SKEY = 'plk_cal_admin';

  const A = { tok: null, d: null, tab: 'events', trackEvent: null, trackMode: 'event', f: { q: '', ym: '', type: '', cancelled: false }, sel: {} };
  let M = {};
  let ED = null;

  U.demoBanner('โหมดทดลอง: ผู้ดูแล admin / admin1234 · PIN ทุกกลุ่ม 1234 · ข้อความ LINE ไม่ได้ส่งจริง ดูได้ที่แท็บ LINE');

  /* ---------------- auth ---------------- */
  function getTok() {
    try { const v = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); if (v && v.exp > Date.now()) return v.token; } catch (e) { /* ignore */ }
    return null;
  }
  async function call(action, payload) {
    try { return await U.api(action, Object.assign({ token: A.tok }, payload || {})); }
    catch (e) { if (e.code === 'AUTH_REQUIRED') { logout('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่'); } throw e; }
  }
  function logout(msg) { sessionStorage.removeItem(SKEY); A.tok = null; renderLogin(msg); }

  function renderLogin(msg) {
    document.getElementById('who').textContent = 'กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข สำนักงานสาธารณสุขจังหวัดพิษณุโลก';
    view.innerHTML = '<section class="card" style="max-width:420px;margin:30px auto;width:100%"><h1 style="margin-bottom:12px">เข้าสู่ระบบฝั่งยุทธ์</h1>' +
      '<form data-form="login" class="asg-list" novalidate><label class="field">ชื่อผู้ใช้<input type="text" name="u" autocomplete="username" required></label>' +
      '<label class="field">รหัสผ่าน<input type="password" name="p" autocomplete="current-password" required></label>' +
      '<div class="err" role="alert">' + esc(msg || '') + '</div><button class="btn btn-navy" type="submit">เข้าสู่ระบบ</button></form></section>';
    view.querySelector('input[name=u]').focus();
  }
  async function doLogin(f) {
    const err = f.querySelector('.err');
    if (!f.u.value.trim() || !f.p.value) { err.textContent = 'กรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
    const b = f.querySelector('button'); b.disabled = true;
    try {
      const r = await U.api('admin.login', { username: f.u.value, password: f.p.value });
      sessionStorage.setItem(SKEY, JSON.stringify({ token: r.token, exp: r.exp }));
      A.tok = r.token;
      await loadAll();
    } catch (e) { err.textContent = e.message; b.disabled = false; }
  }

  /* ---------------- data ---------------- */
  async function loadAll() {
    A.d = await call('admin.boot');
    const d = A.d;
    M = { group: {}, event: {}, asg: {}, byEvent: {}, subsByAsg: {} };
    d.groups.forEach(function (g) { M.group[g.id] = g; });
    d.events.forEach(function (e) { M.event[e.id] = e; M.byEvent[e.id] = []; });
    d.assignments.forEach(function (a) { M.asg[a.id] = a; if (M.byEvent[a.event_id]) M.byEvent[a.event_id].push(a); });
    d.submissions.forEach(function (s) { (M.subsByAsg[s.asg_id] = M.subsByAsg[s.asg_id] || []).push(s); });
    document.getElementById('who').textContent = 'ผู้ดูแลระบบ · ' + d.me.name + ' (' + d.me.username + ')';
    render();
  }
  const gname = (id) => (id === '__admin__' ? 'ทีมยุทธ์' : (M.group[id] || {}).name || id || '–');
  const today = () => A.d.today;
  const latestSub = (asgId) => { const l = M.subsByAsg[asgId] || []; return l[l.length - 1]; };

  /* ---------------- layout ---------------- */
  const TABS = [['events', 'งานทั้งหมด'], ['track', 'ติดตามสถานะ'], ['queue', 'คิวรอตรวจ'], ['groups', 'กลุ่มงานและ PIN'], ['line', 'LINE OA'], ['settings', 'ตั้งค่า']];
  function render() {
    const pending = A.d.submissions.filter(function (s) { return s.review === 'pending'; }).length;
    const tabs = '<div class="tabs" role="tablist">' + TABS.map(function (t) {
      return '<button role="tab" data-act="tab" data-v="' + t[0] + '" aria-selected="' + (A.tab === t[0]) + '">' + t[1] + (t[0] === 'queue' && pending ? '<span class="count">' + pending + '</span>' : '') + '</button>';
    }).join('') + '<button data-act="logout" style="margin-left:auto">ออกจากระบบ</button></div>';
    const fn = { events: eventsTab, track: trackTab, queue: queueTab, groups: groupsTab, line: lineTab, settings: settingsTab }[A.tab];
    view.innerHTML = tabs + fn();
    if (A.tab === 'line' && U.DEMO) paintLineLog();
  }

  /* ---------------- events tab ---------------- */
  function eventsTab() {
    const f = A.f;
    let evs = A.d.events.slice().sort(function (a, b) { return a.start > b.start ? -1 : a.start < b.start ? 1 : 0; });
    if (!f.cancelled) evs = evs.filter(function (e) { return e.status !== 'cancelled'; });
    if (f.ym) evs = evs.filter(function (e) { return e.start.slice(0, 7) <= f.ym && e.end.slice(0, 7) >= f.ym; });
    if (f.type) evs = evs.filter(function (e) { return e.type === f.type; });
    if (f.q) evs = evs.filter(function (e) { return e.title.toLowerCase().indexOf(f.q.toLowerCase()) >= 0; });
    const t = today();
    const typeOpts = '<option value="">ทุกประเภท</option>' + Object.keys(A.d.types).map(function (k) { return '<option value="' + k + '"' + (f.type === k ? ' selected' : '') + '>' + esc(A.d.types[k]) + '</option>'; }).join('');
    return '<section class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px">' +
      '<div class="row" style="gap:8px"><input type="search" data-f="q" placeholder="ค้นหาชื่องาน" value="' + esc(f.q) + '" aria-label="ค้นหาชื่องาน">' +
      '<input type="month" data-f="ym" value="' + esc(f.ym) + '" aria-label="เดือน"><select data-f="type" aria-label="ประเภท">' + typeOpts + '</select>' +
      '<label class="check"><input type="checkbox" data-f="cancelled"' + (f.cancelled ? ' checked' : '') + '> แสดงงานที่ยกเลิก</label></div>' +
      '<button class="btn btn-primary" data-act="new">+ สร้างงานใหม่</button></div>' +
      (evs.length ? '<div class="tbl-wrap"><table class="tbl min-900"><thead><tr><th>วันที่</th><th>ชื่องาน</th><th>ประเภท</th><th>ความคืบหน้า</th><th>มองเห็น</th><th>การดำเนินการ</th></tr></thead><tbody>' +
        evs.map(function (e) {
          const list = M.byEvent[e.id] || [];
          const done = list.filter(function (a) { return a.status === U.S.DONE; }).length;
          const over = list.filter(function (a) { return U.effStatus(a, t) === U.S.OVER; }).length;
          const sent = list.filter(function (a) { return a.status === U.S.SENT; }).length;
          return '<tr><td class="nowrap">' + esc(U.rangeText(e.start, e.end)) + '</td><td><strong>' + esc(e.title) + '</strong>' + (e.status === 'cancelled' ? ' ' + U.badge('ยกเลิก') : '') +
            (e.place ? '<div class="small muted">' + esc(e.place) + '</div>' : '') + '</td>' +
            '<td><span class="badge type-tag t-' + esc(e.type) + '">' + esc(A.d.types[e.type] || e.type) + '</span></td>' +
            '<td class="small">' + list.length + ' กลุ่ม · เสร็จ ' + done + (sent ? ' · รอตรวจ ' + sent : '') + (over ? ' · <strong style="color:var(--over)">เกินกำหนด ' + over + '</strong>' : '') + '</td>' +
            '<td class="small">' + (e.visibility === 'admin' ? 'เฉพาะทีมยุทธ์' : 'ทุกกลุ่มงาน') + '</td>' +
            '<td><div class="row" style="gap:6px"><button class="btn btn-sm" data-act="edit" data-id="' + esc(e.id) + '">แก้ไข</button>' +
            '<button class="btn btn-sm" data-act="track" data-id="' + esc(e.id) + '">ติดตาม</button>' +
            '<button class="btn btn-sm" data-act="dup" data-id="' + esc(e.id) + '">ทำซ้ำ</button>' +
            (e.status === 'cancelled' ? '<button class="btn btn-sm" data-act="evstatus" data-v="active" data-id="' + esc(e.id) + '">เปิดอีกครั้ง</button>' : '<button class="btn btn-sm btn-warn" data-act="evstatus" data-v="cancelled" data-id="' + esc(e.id) + '">ยกเลิกงาน</button>') +
            '</div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ไม่พบงานตามเงื่อนไข · กด “สร้างงานใหม่” เพื่อเพิ่มงานแรก</div>') + '</section>';
  }

  /* ---------------- event editor ---------------- */
  function openEditor(id, dup) {
    const e = id ? M.event[id] : null;
    ED = {
      id: e && !dup ? e.id : null,
      title: e ? e.title + (dup ? ' (สำเนา)' : '') : '',
      type: e ? e.type : 'due',
      start: e ? e.start : today(),
      end: e ? e.end : today(),
      place: e ? e.place : '', detail: e ? e.detail : '', link: e ? e.link : '',
      visibility: e ? e.visibility : 'all',
      notify: !e || dup,
      rows: e ? (M.byEvent[e.id] || []).map(function (a) { return { group_id: a.group_id, role: a.role, task: a.task, due: a.due, status: dup ? '' : a.status, existing: !dup }; }) : []
    };
    renderEditor();
    if (!dlg.open) dlg.showModal();
  }

  function renderEditor(err) {
    const d = A.d;
    const typeOpts = Object.keys(d.types).map(function (k) { return '<option value="' + k + '"' + (ED.type === k ? ' selected' : '') + '>' + esc(d.types[k]) + '</option>'; }).join('');
    const used = {};
    ED.rows.forEach(function (r) { used[r.group_id] = true; });
    const rows = ED.rows.map(function (r, i) {
      const gopts = d.groups.filter(function (g) { return g.active || g.id === r.group_id; }).map(function (g) { return '<option value="' + g.id + '"' + (g.id === r.group_id ? ' selected' : '') + (used[g.id] && g.id !== r.group_id ? ' disabled' : '') + '>' + esc(g.name) + '</option>'; }).join('');
      const sopts = '<option value="">' + (r.existing ? 'คงเดิม' : 'รอดำเนินการ') + '</option>' + d.statuses.map(function (s) { return '<option' + (s === r.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
      return '<tr><td><select data-r="' + i + '" data-k="group_id" aria-label="กลุ่มงาน">' + gopts + '</select></td>' +
        '<td><select data-r="' + i + '" data-k="role" aria-label="บทบาท"><option' + (r.role !== 'ร่วม' ? ' selected' : '') + '>หลัก</option><option' + (r.role === 'ร่วม' ? ' selected' : '') + '>ร่วม</option></select></td>' +
        '<td><input type="text" data-r="' + i + '" data-k="task" value="' + esc(r.task) + '" aria-label="สิ่งที่ต้องทำ" style="width:100%"></td>' +
        '<td><input type="date" data-r="' + i + '" data-k="due" value="' + esc(r.due) + '" aria-label="กำหนดส่ง"></td>' +
        '<td><select data-r="' + i + '" data-k="status" aria-label="สถานะ">' + sopts + '</select></td>' +
        '<td><button type="button" class="btn btn-sm" data-act="rmrow" data-i="' + i + '" aria-label="นำกลุ่มออก">ลบ</button></td></tr>';
    }).join('');
    dlg.style.width = 'min(1100px, calc(100vw - 24px))';
    dlg.innerHTML = '<div class="dlg-head"><h2 id="dlg-title" style="color:var(--navy)">' + (ED.id ? 'แก้ไขงาน' : 'สร้างงานใหม่') + '</h2><button class="btn icon-btn" data-act="close" aria-label="ปิด">×</button></div>' +
      '<form class="dlg-body" data-form="event" novalidate>' +
      '<div class="grid-4"><label class="field span-2">ชื่องาน <span class="req">(จำเป็น)</span><input type="text" data-e="title" value="' + esc(ED.title) + '"></label>' +
      '<label class="field">ประเภท<select data-e="type">' + typeOpts + '</select></label>' +
      '<label class="field">การมองเห็น<select data-e="visibility"><option value="all"' + (ED.visibility !== 'admin' ? ' selected' : '') + '>ทุกกลุ่มงาน</option><option value="admin"' + (ED.visibility === 'admin' ? ' selected' : '') + '>เฉพาะทีมยุทธ์</option></select></label>' +
      '<label class="field">วันเริ่ม<input type="date" data-e="start" value="' + esc(ED.start) + '"></label>' +
      '<label class="field">วันสิ้นสุด<input type="date" data-e="end" value="' + esc(ED.end) + '"></label>' +
      '<label class="field span-2">สถานที่<input type="text" data-e="place" value="' + esc(ED.place) + '"></label>' +
      '<label class="field span-2">รายละเอียด<textarea data-e="detail" rows="2">' + esc(ED.detail) + '</textarea></label>' +
      '<label class="field span-2">ลิงก์เอกสารประกอบ (ถ้ามี)<input type="url" data-e="link" value="' + esc(ED.link) + '" placeholder="https://"></label></div>' +
      '<div class="row" style="justify-content:space-between"><h3 style="color:var(--green)">มอบหมายกลุ่มงาน (' + ED.rows.length + ' กลุ่ม)</h3>' +
      '<div class="row" style="gap:6px"><button type="button" class="btn btn-sm btn-outline" data-act="addrow">+ เพิ่มกลุ่มงาน</button>' +
      '<button type="button" class="btn btn-sm" data-act="addall">+ เพิ่มทุกกลุ่มที่เหลือ (ร่วม)</button>' +
      '<button type="button" class="btn btn-sm" data-act="filldown"' + (ED.rows.length < 2 ? ' disabled' : '') + '>ใช้สิ่งที่ต้องทำ/กำหนดส่งแถวแรกกับทุกแถวที่ว่าง</button></div></div>' +
      (ED.rows.length ? '<div class="tbl-wrap"><table class="tbl min-900"><thead><tr><th>กลุ่มงาน</th><th>บทบาท</th><th style="width:40%">สิ่งที่ต้องทำ</th><th>กำหนดส่ง</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty">ยังไม่ได้มอบหมายกลุ่มงาน</div>') +
      '<label class="check"><input type="checkbox" data-e="notify"' + (ED.notify ? ' checked' : '') + '> แจ้งกลุ่มงานที่เพิ่มใหม่ทาง LINE ทันที</label>' +
      '<div class="err" role="alert">' + esc(err || '') + '</div>' +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกงาน</button></div></form>';
  }

  function edSync(el) {
    if (el.hasAttribute('data-e')) {
      const k = el.getAttribute('data-e');
      ED[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'start' && (!ED.end || ED.end < ED.start)) { ED.end = ED.start; const e2 = dlg.querySelector('[data-e=end]'); if (e2) e2.value = ED.end; }
    } else if (el.hasAttribute('data-r')) {
      ED.rows[Number(el.getAttribute('data-r'))][el.getAttribute('data-k')] = el.value;
      if (el.getAttribute('data-k') === 'group_id') renderEditor();
    }
  }
  function addRow(role) {
    const used = {};
    ED.rows.forEach(function (r) { used[r.group_id] = true; });
    const free = A.d.groups.filter(function (g) { return g.active && !used[g.id]; });
    if (!free.length) { U.toast('มอบหมายครบทุกกลุ่มแล้ว'); return false; }
    ED.rows.push({ group_id: free[0].id, role: role || 'หลัก', task: '', due: ED.end || ED.start, status: '' });
    return true;
  }

  async function saveEvent(form) {
    const btn = form.querySelector('button[type=submit]');
    if (!ED.title.trim()) { renderEditor('กรุณากรอกชื่องาน'); return; }
    const bad = ED.rows.filter(function (r) { return !r.task.trim() || !r.due; });
    if (bad.length) { renderEditor('กรอกสิ่งที่ต้องทำและกำหนดส่งให้ครบทุกกลุ่ม (' + bad.map(function (r) { return gname(r.group_id); }).join(', ') + ')'); return; }
    btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    try {
      const r = await call('admin.saveEvent', {
        notify: !!ED.notify,
        event: { id: ED.id, title: ED.title, type: ED.type, start: ED.start, end: ED.end || ED.start, place: ED.place, detail: ED.detail, link: ED.link, visibility: ED.visibility },
        assignments: ED.rows.map(function (x) { return { group_id: x.group_id, role: x.role, task: x.task, due: x.due, status: x.status || undefined }; })
      });
      dlg.close();
      U.toast('บันทึกงานแล้ว' + (r.added ? ' · มอบหมายใหม่ ' + r.added + ' กลุ่ม' : '') + (r.removed ? ' · นำออก ' + r.removed + ' กลุ่ม' : '') + (r.notified ? ' · แจ้ง LINE ' + r.notified + ' ปลายทาง' : ''));
      await loadAll();
    } catch (e) { renderEditor(e.message); }
  }

  /* ---------------- track tab ---------------- */
  function trackTab() {
    const t = today();
    const evs = A.d.events.filter(function (e) { return e.status !== 'cancelled'; }).sort(function (a, b) { return a.start > b.start ? -1 : 1; });
    if (!A.trackEvent || !M.event[A.trackEvent]) {
      const up = evs.slice().reverse().filter(function (e) { return e.end >= t; })[0];
      A.trackEvent = (up || evs[0] || {}).id;
    }
    let rows;
    if (A.trackMode === 'over') {
      rows = A.d.assignments.filter(function (a) { return M.event[a.event_id] && M.event[a.event_id].status !== 'cancelled' && U.effStatus(a, t) === U.S.OVER; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    } else {
      rows = (M.byEvent[A.trackEvent] || []).slice().sort(function (a, b) { return gname(a.group_id).localeCompare(gname(b.group_id), 'th'); });
    }
    const evOpts = evs.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === A.trackEvent ? ' selected' : '') + '>' + esc(U.thDate(e.start)) + ' · ' + esc(e.title) + '</option>'; }).join('');
    const sOpts = A.d.statuses.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    const counts = {};
    rows.forEach(function (a) { const s = U.effStatus(a, t); counts[s] = (counts[s] || 0) + 1; });
    return '<section class="card"><div class="row" style="margin-bottom:10px">' +
      '<div class="seg" role="group"><button data-act="tmode" data-v="event" aria-pressed="' + (A.trackMode === 'event') + '">ทีละงาน</button><button data-act="tmode" data-v="over" aria-pressed="' + (A.trackMode === 'over') + '">เกินกำหนดทุกงาน</button></div>' +
      (A.trackMode === 'event' ? '<select data-act="tevent" aria-label="เลือกงาน" style="max-width:520px">' + evOpts + '</select>' : '') + '</div>' +
      '<div class="row" style="gap:6px;margin-bottom:10px">' + Object.keys(counts).map(function (k) { return '<span class="badge ' + (U.ST_CLASS[k] || '') + '">' + esc(k) + ' ' + counts[k] + '</span>'; }).join('') + '</div>' +
      (rows.length ? '<div class="row no-print" style="margin-bottom:10px;gap:8px"><label class="check"><input type="checkbox" data-act="selall"> เลือกทั้งหมด</label>' +
        '<select data-act="bulkstatus" aria-label="สถานะที่จะปรับ">' + sOpts + '</select><button class="btn btn-sm btn-navy" data-act="bulkapply">ปรับสถานะรายการที่เลือก</button></div>' +
        '<div class="tbl-wrap"><table class="tbl min-900"><thead><tr><th></th><th>กลุ่มงาน</th>' + (A.trackMode === 'over' ? '<th>งาน</th>' : '') + '<th>บทบาท</th><th style="width:28%">สิ่งที่ต้องทำ</th><th>กำหนดส่ง</th><th>การแจ้งส่งล่าสุด</th><th>สถานะ</th></tr></thead><tbody>' +
        rows.map(function (a) {
          const s = latestSub(a.id);
          const eff = U.effStatus(a, t);
          return '<tr><td><input type="checkbox" data-sel="' + esc(a.id) + '"' + (A.sel[a.id] ? ' checked' : '') + ' aria-label="เลือก ' + esc(gname(a.group_id)) + '"></td>' +
            '<td><strong>' + esc(gname(a.group_id)) + '</strong></td>' + (A.trackMode === 'over' ? '<td>' + esc(M.event[a.event_id].title) + '</td>' : '') +
            '<td>' + esc(a.role) + '</td><td>' + esc(a.task) + (a.note ? '<div class="small" style="color:#7A3A00">หมายเหตุ: ' + esc(a.note) + '</div>' : '') + '</td>' +
            '<td class="nowrap">' + esc(U.thDate(a.due)) + '<div class="small muted">' + esc(U.dueText(t, a.due)) + '</div></td>' +
            '<td class="small">' + (s ? subInfo(s) : '<span class="muted">–</span>') + '</td>' +
            '<td>' + (eff === U.S.OVER ? U.badge(eff) + '<br>' : '') + '<select data-act="setone" data-id="' + esc(a.id) + '" aria-label="สถานะ" class="badge ' + (U.ST_CLASS[a.status] || '') + '" style="min-height:36px;border-radius:6px">' +
            A.d.statuses.map(function (x) { return '<option' + (x === a.status ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">' + (A.trackMode === 'over' ? 'ไม่มีงานเกินกำหนด' : 'งานนี้ยังไม่ได้มอบหมายกลุ่มงาน') + '</div>') + '</section>';
  }

  function subInfo(s) {
    const files = (s.files || []).map(function (f) { return '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a>'; }).join(', ');
    return (s.kind === 'submit' ? 'แจ้งส่ง' : 'แนบงาน') + ' · ' + esc(s.channel_label) + (s.channel_detail ? ' (' + esc(s.channel_detail) + ')' : '') +
      (s.link ? ' · <a href="' + esc(U.safeUrl(s.link)) + '" target="_blank" rel="noopener">เปิดลิงก์</a>' : '') + (files ? '<br>ไฟล์: ' + files : '') +
      '<br><span class="muted">' + esc(s.reporter) + ' · ' + esc(U.thDateTime(s.created_at)) + '</span>';
  }

  /* ---------------- queue tab ---------------- */
  function queueTab() {
    const pend = A.d.submissions.filter(function (s) { return s.review === 'pending'; }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
    const done = A.d.submissions.filter(function (s) { return s.review === 'approved' || s.review === 'returned'; }).sort(function (a, b) { return a.reviewed_at > b.reviewed_at ? -1 : 1; }).slice(0, 20);
    const card = function (s) {
      const a = M.asg[s.asg_id] || {};
      const e = M.event[a.event_id] || {};
      return '<div class="queue-item"><div class="small muted">' + esc(gname(s.group_id)) + ' · แจ้งเมื่อ ' + esc(U.thDateTime(s.created_at)) + '</div>' +
        '<div><strong>' + esc(e.title || '-') + '</strong></div><div class="small">' + esc(a.task || '') + ' · กำหนดส่ง ' + esc(U.thDate(a.due)) + '</div>' +
        '<div class="small">' + subInfo(s) + '</div>' + (s.note ? '<div class="small">หมายเหตุ: ' + esc(s.note) + '</div>' : '') +
        '<div class="row" style="gap:6px;margin-top:4px"><button class="btn btn-sm btn-warn" data-act="return" data-id="' + esc(s.sub_id) + '">ส่งกลับแก้ไข</button>' +
        '<button class="btn btn-sm btn-primary" data-act="approve" data-id="' + esc(s.sub_id) + '">ตรวจผ่าน</button></div></div>';
    };
    return '<section class="card"><h2 style="margin-bottom:10px">คิวรอตรวจ (' + pend.length + ' รายการ)</h2>' +
      (pend.length ? '<div class="asg-list">' + pend.map(card).join('') + '</div>' : '<div class="empty">ไม่มีรายการรอตรวจ</div>') + '</section>' +
      '<section class="card"><h3 style="margin-bottom:10px">ตรวจแล้วล่าสุด</h3>' +
      (done.length ? '<div class="tbl-wrap"><table class="tbl min-760"><thead><tr><th>เมื่อ</th><th>กลุ่มงาน</th><th>งาน</th><th>ผล</th><th>หมายเหตุ</th></tr></thead><tbody>' +
        done.map(function (s) {
          const a = M.asg[s.asg_id] || {};
          return '<tr><td class="nowrap small">' + esc(U.thDateTime(s.reviewed_at)) + '</td><td>' + esc(gname(s.group_id)) + '</td><td>' + esc((M.event[a.event_id] || {}).title || '-') + '</td>' +
            '<td>' + U.badge(s.review === 'approved' ? U.S.DONE : U.S.RETURN) + '</td><td class="small">' + esc(s.review_note) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีประวัติการตรวจ</div>') + '</section>';
  }

  function openReturn(subId) {
    dlg.style.width = '';
    dlg.innerHTML = '<div class="dlg-head"><h2 id="dlg-title" style="color:#7A3A00">ส่งกลับแก้ไข</h2><button class="btn icon-btn" data-act="close" aria-label="ปิด">×</button></div>' +
      '<form class="dlg-body" data-form="return" data-id="' + esc(subId) + '" novalidate><label class="field">เหตุผล / สิ่งที่ต้องแก้ <span class="req">(จำเป็น · กลุ่มงานจะได้รับข้อความนี้ทาง LINE)</span><textarea name="note" rows="4"></textarea></label>' +
      '<div class="err" role="alert"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">ยกเลิก</button><button type="submit" class="btn btn-warn">ส่งกลับแก้ไข</button></div></form>';
    dlg.showModal();
    dlg.querySelector('textarea').focus();
  }

  async function review(subId, decision, note) {
    try {
      await call('admin.review', { sub_id: subId, decision: decision, note: note || '' });
      if (dlg.open) dlg.close();
      U.toast(decision === 'approve' ? 'ตรวจผ่านแล้ว สถานะเป็น “เสร็จสิ้น”' : 'ส่งกลับแก้ไขแล้ว');
      await loadAll();
    } catch (e) {
      const err = dlg.open ? dlg.querySelector('.err') : null;
      if (err) err.textContent = e.message; else U.toast(e.message, true);
    }
  }

  /* ---------------- groups tab ---------------- */
  function groupsTab() {
    const tcount = {};
    A.d.targets.forEach(function (t) { if (t.group_id && String(t.active).toUpperCase() === 'TRUE') tcount[t.group_id] = (tcount[t.group_id] || 0) + 1; });
    return '<section class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h2>กลุ่มงานและ PIN</h2><button class="btn btn-outline" data-act="newgroup">+ เพิ่มกลุ่มงาน</button></div>' +
      '<p class="small muted" style="margin:0 0 10px">PIN ใช้ยืนยันตัวกลุ่มงานเมื่อแนบงาน/แจ้งส่งงาน และใช้ลงทะเบียนรับแจ้งเตือน LINE เมื่อตั้ง PIN ใหม่ เครื่องที่จำ PIN เดิมไว้ต้องยืนยันใหม่</p>' +
      '<div class="tbl-wrap"><table class="tbl min-900"><thead><tr><th>รหัส</th><th>กลุ่มงาน</th><th>ผู้ประสานงานหลัก</th><th>ลำดับ</th><th>สถานะ</th><th>PIN</th><th>LINE</th><th>การดำเนินการ</th></tr></thead><tbody>' +
      A.d.groups.map(function (g) {
        return '<tr><td class="mono">' + esc(g.id) + '</td><td><strong>' + esc(g.name) + '</strong></td><td>' + esc(g.coordinator || '–') + '</td><td>' + esc(g.order) + '</td>' +
          '<td>' + (g.active ? 'ใช้งาน' : '<span class="muted">ปิด</span>') + '</td>' +
          '<td class="small">' + (g.has_pin ? 'ตั้งแล้ว<div class="muted">' + esc(U.thDateTime(g.pin_updated.split('#')[0])) + '</div>' : '<strong style="color:#B3261E">ยังไม่ตั้ง</strong>') + '</td>' +
          '<td>' + (tcount[g.id] || 0) + ' ปลายทาง</td>' +
          '<td><div class="row" style="gap:6px"><button class="btn btn-sm" data-act="editgroup" data-id="' + esc(g.id) + '">แก้ไข</button>' +
          '<button class="btn btn-sm btn-outline" data-act="pinrand" data-id="' + esc(g.id) + '">สุ่ม PIN ใหม่</button>' +
          '<button class="btn btn-sm" data-act="pinset" data-id="' + esc(g.id) + '">กำหนด PIN เอง</button></div></td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  function openGroup(id) {
    const g = id ? M.group[id] : { id: '', name: '', coordinator: '', order: A.d.groups.length + 1, active: true };
    dlg.style.width = '';
    dlg.innerHTML = '<div class="dlg-head"><h2 id="dlg-title" style="color:var(--navy)">' + (id ? 'แก้ไขกลุ่มงาน' : 'เพิ่มกลุ่มงาน') + '</h2><button class="btn icon-btn" data-act="close" aria-label="ปิด">×</button></div>' +
      '<form class="dlg-body" data-form="group" data-id="' + esc(id || '') + '" novalidate><div class="grid-2">' +
      '<label class="field">รหัสกลุ่ม (a-z, 0-9)<input type="text" name="gid" value="' + esc(g.id) + '"' + (id ? ' readonly' : '') + '></label>' +
      '<label class="field">ชื่อกลุ่มงาน<input type="text" name="gname" value="' + esc(g.name) + '"></label>' +
      '<label class="field">ผู้ประสานงานหลัก<input type="text" name="coordinator" value="' + esc(g.coordinator) + '"></label>' +
      '<label class="field">ลำดับการแสดง<input type="number" name="order" value="' + esc(g.order) + '" min="1"></label></div>' +
      '<label class="check"><input type="checkbox" name="active"' + (g.active ? ' checked' : '') + '> ใช้งาน</label>' +
      '<div class="err" role="alert"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึก</button></div></form>';
    dlg.showModal();
  }

  function openPinSet(id) {
    dlg.style.width = '';
    dlg.innerHTML = '<div class="dlg-head"><h2 id="dlg-title" style="color:var(--navy)">กำหนด PIN กลุ่มงาน' + esc(gname(id)) + '</h2><button class="btn icon-btn" data-act="close" aria-label="ปิด">×</button></div>' +
      '<form class="dlg-body" data-form="pin" data-id="' + esc(id) + '" novalidate><label class="field">PIN 4 หลัก<input class="pin-input" name="pin" inputmode="numeric" maxlength="4" pattern="[0-9]{4}"></label>' +
      '<div class="err" role="alert"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึก PIN</button></div></form>';
    dlg.showModal();
  }

  async function setPin(id, pin) {
    try {
      const r = await call('admin.setPin', { group_id: id, pin: pin || '' });
      const msg = 'กลุ่มงาน' + gname(id) + '\nPIN: ' + r.pin + '\n\nใช้ยืนยันเมื่อแนบงาน/แจ้งส่งงานในปฏิทินระบบงาน\nลงทะเบียนรับแจ้งเตือน LINE: พิมพ์ "ลงทะเบียน ' + id + ' ' + r.pin + '" ในแชท OA หรือกลุ่ม LINE ที่มี OA อยู่';
      dlg.style.width = '';
      dlg.innerHTML = '<div class="dlg-head"><h2 id="dlg-title" style="color:var(--green)">ตั้ง PIN ใหม่แล้ว</h2><button class="btn icon-btn" data-act="close" aria-label="ปิด">×</button></div>' +
        '<div class="dlg-body"><div style="font-size:44px;font-weight:700;letter-spacing:12px;text-align:center;color:var(--navy)">' + esc(r.pin) + '</div>' +
        '<p class="small muted" style="margin:0">PIN จะแสดงครั้งนี้ครั้งเดียว ระบบเก็บเฉพาะค่าที่เข้ารหัสแล้ว คัดลอกข้อความด้านล่างส่งให้ผู้ประสานงานหลักแบบรายบุคคล</p>' +
        '<textarea readonly rows="6" id="pinmsg">' + esc(msg) + '</textarea><div class="row" style="justify-content:flex-end"><button class="btn btn-outline" data-act="copypin">คัดลอกข้อความ</button><button class="btn btn-navy" data-act="close">เสร็จ</button></div></div>';
      if (!dlg.open) dlg.showModal();
      await loadAll();
    } catch (e) { const err = dlg.open && dlg.querySelector('.err'); if (err) err.textContent = e.message; else U.toast(e.message, true); }
  }

  /* ---------------- LINE tab ---------------- */
  function lineTab() {
    const d = A.d;
    const gopts = function (sel) {
      return '<option value=""' + (!sel ? ' selected' : '') + '>— ยังไม่ผูก —</option><option value="__admin__"' + (sel === '__admin__' ? ' selected' : '') + '>ทีมยุทธ์ (รับแจ้งเมื่อมีการแจ้งส่ง)</option>' +
        d.groups.map(function (g) { return '<option value="' + g.id + '"' + (sel === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('');
    };
    const tname = {};
    d.targets.forEach(function (t) { tname[t.target_id] = t.display; });
    const demo = U.DEMO ? '<section class="card"><h3 style="margin-bottom:10px">จำลองข้อความจาก LINE (โหมดทดลอง)</h3><form data-form="sim" class="row" novalidate>' +
      '<select name="tgt" aria-label="ปลายทาง">' + d.targets.map(function (t) { return '<option value="' + esc(t.target_id) + '|' + esc(t.type) + '">' + esc(t.display) + '</option>'; }).join('') +
      '<option value="Cnew' + Date.now().toString(36) + '|group">กลุ่ม LINE ใหม่</option><option value="Unew' + Date.now().toString(36) + '|user">ผู้ใช้ใหม่ (เพิ่มเพื่อน)</option></select>' +
      '<select name="type" aria-label="เหตุการณ์"><option value="message">พิมพ์ข้อความ</option><option value="join">OA ถูกเชิญเข้ากลุ่ม / เพิ่มเพื่อน</option></select>' +
      '<input type="text" name="text" value="งานของฉัน" aria-label="ข้อความ" style="min-width:240px"><button class="btn btn-navy" type="submit">ส่ง</button></form>' +
      '<p class="small muted">ลองพิมพ์: ลงทะเบียน hp 1234 · งานของฉัน · สัปดาห์นี้ · ปฏิทิน · ช่วยเหลือ</p><h3 style="margin:8px 0">ข้อความที่ระบบส่งออก (ล่าสุดอยู่บน)</h3><div class="line-log" id="linelog"></div></section>' : '';
    return '<section class="card"><h2 style="margin-bottom:8px">สถานะการเชื่อมต่อ</h2><div class="row small">' +
      '<span>LINE_TOKEN: ' + (d.lineReady ? '<strong style="color:var(--green)">ตั้งค่าแล้ว</strong>' : '<strong style="color:#B3261E">ยังไม่ตั้งค่า</strong>') + '</span>' +
      '<span>Webhook: ' + (d.hookReady ? '<strong style="color:var(--green)">พร้อม</strong>' : '<strong style="color:#B3261E">ยังไม่พร้อม</strong>') + '</span>' +
      '<button class="btn btn-sm" data-act="quota">ตรวจโควตาข้อความ</button><span id="quota"></span></div>' +
      '<div class="row" style="margin-top:12px"><select id="dg" aria-label="กลุ่มที่จะส่ง"><option value="">ทุกกลุ่มที่ผูก LINE แล้ว + ทีมยุทธ์</option>' + d.groups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-outline" data-act="digest">ส่งสรุปงานทาง LINE ตอนนี้</button></div>' +
      '<p class="small muted" style="margin:8px 0 0">ข้อความ push ใช้โควตารายเดือนของ OA (นับตามจำนวนผู้รับในกลุ่ม) ส่วนการตอบกลับคำสั่งในแชท (reply) ไม่ใช้โควตา</p></section>' +
      '<section class="card"><h2 style="margin-bottom:8px">ปลายทาง LINE</h2><p class="small muted" style="margin:0 0 10px">เมื่อเชิญ OA เข้ากลุ่ม LINE หรือมีผู้ใช้เพิ่มเพื่อน ระบบจะบันทึกปลายทางให้อัตโนมัติ ผูกกับกลุ่มงานได้ที่นี่ หรือให้ผู้ใช้พิมพ์ “ลงทะเบียน &lt;รหัสกลุ่ม&gt; &lt;PIN&gt;”</p>' +
      (d.targets.length ? '<div class="tbl-wrap"><table class="tbl min-900"><thead><tr><th>ชื่อ</th><th>ประเภท</th><th>ผูกกับ</th><th>รับแจ้งเตือน</th><th>ผูกเมื่อ</th><th>รหัส LINE</th></tr></thead><tbody>' +
        d.targets.map(function (t) {
          return '<tr><td><strong>' + esc(t.display) + '</strong></td><td>' + (t.type === 'user' ? 'บุคคล' : 'กลุ่ม LINE') + '</td>' +
            '<td><select data-act="bind" data-id="' + esc(t.target_id) + '" aria-label="ผูกกับกลุ่มงาน">' + gopts(t.group_id) + '</select></td>' +
            '<td><input type="checkbox" data-act="tactive" data-id="' + esc(t.target_id) + '"' + (String(t.active).toUpperCase() === 'TRUE' ? ' checked' : '') + ' aria-label="รับแจ้งเตือน"></td>' +
            '<td class="small">' + esc(U.thDateTime(t.bound_at)) + '</td><td class="mono">' + esc(t.target_id) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีปลายทาง · เชิญ OA เข้ากลุ่ม LINE ของกลุ่มงาน หรือให้ผู้ประสานงานหลักเพิ่ม OA เป็นเพื่อน</div>') + '</section>' +
      demo +
      '<section class="card"><h3 style="margin-bottom:10px">ประวัติการส่งแจ้งเตือน (150 รายการล่าสุด)</h3>' +
      (d.notifyLog.length ? '<div class="tbl-wrap"><table class="tbl min-760"><thead><tr><th>เวลา</th><th>ปลายทาง</th><th>กลุ่มงาน</th><th>ประเภท</th><th>ผล</th></tr></thead><tbody>' +
        d.notifyLog.map(function (l) {
          const kind = { daily: 'ประจำวัน/สัปดาห์', new: 'งานใหม่', 'return': 'ส่งกลับแก้ไข', submit: 'แจ้งส่ง (ทีมยุทธ์)' }[l.kind] || l.kind;
          return '<tr><td class="small nowrap">' + esc(U.thDateTime(l.ts)) + '</td><td>' + esc(tname[l.target_id] || l.target_id) + '</td><td>' + esc(gname(l.group_id)) + '</td><td>' + esc(kind) + '</td>' +
            '<td>' + (String(l.ok).toUpperCase() === 'TRUE' ? '<span class="badge st-done">สำเร็จ</span>' : '<span class="badge st-over">ไม่สำเร็จ</span> <span class="small">' + esc(l.error) + '</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">ยังไม่มีการส่ง</div>') + '</section>';
  }

  function paintLineLog() {
    const el = document.getElementById('linelog');
    if (!el || !window.GASMOCK) return;
    el.innerHTML = window.GASMOCK.lineLog.slice().reverse().slice(0, 20).map(function (r) {
      const p = r.payload || {};
      const msg = (p.messages || [])[0] || {};
      const kind = /reply/.test(r.url) ? 'ตอบกลับ (reply)' : 'ส่ง (push) ถึง ' + esc(p.to);
      return '<div><strong>' + kind + '</strong><br>' + esc(msg.altText || msg.text || '').replace(/\n/g, '<br>') + '</div>';
    }).join('') || '<div class="muted">ยังไม่มีข้อความ</div>';
  }

  /* ---------------- settings tab ---------------- */
  function settingsTab() {
    const d = A.d;
    return '<section class="card"><h2 style="margin-bottom:10px">ตั้งค่าระบบ</h2><form data-form="settings" class="asg-list" novalidate>' +
      d.settings.map(function (s) {
        const ro = s.key === 'DRIVE_FOLDER_ID';
        return '<label class="field"><span><strong>' + esc(s.key) + '</strong> <span class="small muted">' + esc(s.note) + '</span></span><input type="text" name="' + esc(s.key) + '" value="' + esc(s.value) + '"' + (ro ? ' readonly' : '') + '></label>';
      }).join('') +
      '<div class="err" role="alert"></div><div><button class="btn btn-primary" type="submit">บันทึกการตั้งค่า</button></div></form></section>' +
      '<div class="split"><section class="card main"><h2 style="margin-bottom:10px">ผู้ดูแลระบบ</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
      d.users.map(function (x) {
        return '<tr><td class="mono">' + esc(x.username) + '</td><td>' + esc(x.name) + '</td><td>' + (x.active ? 'ใช้งาน' : 'ปิด') + '</td><td>' +
          (x.username !== d.me.username ? '<button class="btn btn-sm" data-act="toggleuser" data-id="' + esc(x.username) + '" data-v="' + (x.active ? '0' : '1') + '">' + (x.active ? 'ปิดบัญชี' : 'เปิดบัญชี') + '</button>' : '<span class="small muted">บัญชีของคุณ</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<h3 style="margin:14px 0 8px">เพิ่มผู้ดูแล</h3><form data-form="user" class="grid-4" novalidate><label class="field">ชื่อผู้ใช้<input type="text" name="username" autocomplete="off"></label>' +
      '<label class="field">ชื่อ–สกุล<input type="text" name="uname"></label><label class="field">รหัสผ่าน (≥ 8 ตัว)<input type="password" name="password" autocomplete="new-password"></label>' +
      '<div style="align-self:end"><button class="btn btn-outline" type="submit">เพิ่มผู้ดูแล</button></div><div class="err span-2" role="alert"></div></form></section>' +
      '<section class="card side"><h2 style="margin-bottom:10px">เปลี่ยนรหัสผ่าน</h2><form data-form="pw" class="asg-list" novalidate>' +
      '<label class="field">รหัสผ่านเดิม<input type="password" name="old" autocomplete="current-password"></label>' +
      '<label class="field">รหัสผ่านใหม่ (≥ 8 ตัว)<input type="password" name="nw" autocomplete="new-password"></label>' +
      '<div class="err" role="alert"></div><div><button class="btn btn-navy" type="submit">เปลี่ยนรหัสผ่าน</button></div></form></section></div>';
  }

  /* ---------------- event wiring ---------------- */
  document.addEventListener('click', async function (ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return;
    const act = el.getAttribute('data-act');
    const id = el.getAttribute('data-id');
    try {
      if (act === 'tab') { A.tab = el.getAttribute('data-v'); history.replaceState(null, '', '#' + A.tab); render(); }
      else if (act === 'logout') logout();
      else if (act === 'close') dlg.close();
      else if (act === 'new') openEditor(null);
      else if (act === 'edit') openEditor(id);
      else if (act === 'dup') openEditor(id, true);
      else if (act === 'track') { A.tab = 'track'; A.trackMode = 'event'; A.trackEvent = id; A.sel = {}; render(); }
      else if (act === 'evstatus') {
        const v = el.getAttribute('data-v');
        if (v === 'cancelled' && !confirm('ยกเลิกงานนี้? งานจะไม่แสดงในปฏิทินของกลุ่มงาน (เปิดอีกครั้งได้)')) return;
        await call('admin.setEventStatus', { event_id: id, status: v }); U.toast(v === 'cancelled' ? 'ยกเลิกงานแล้ว' : 'เปิดงานอีกครั้งแล้ว'); await loadAll();
      }
      else if (act === 'addrow') { if (addRow('หลัก')) renderEditor(); }
      else if (act === 'addall') { while (addRow('ร่วม')) { /* add */ } renderEditor(); }
      else if (act === 'rmrow') { ED.rows.splice(Number(el.getAttribute('data-i')), 1); renderEditor(); }
      else if (act === 'filldown') { const f = ED.rows[0]; ED.rows.forEach(function (r) { if (!r.task) r.task = f.task; if (!r.due) r.due = f.due; }); renderEditor(); }
      else if (act === 'tmode') { A.trackMode = el.getAttribute('data-v'); A.sel = {}; render(); }
      else if (act === 'bulkapply') {
        const ids = Object.keys(A.sel).filter(function (k) { return A.sel[k]; });
        if (!ids.length) { U.toast('ยังไม่ได้เลือกรายการ', true); return; }
        const s = view.querySelector('[data-act=bulkstatus]').value;
        await call('admin.setStatus', { asg_ids: ids, status: s }); A.sel = {}; U.toast('ปรับสถานะ ' + ids.length + ' รายการแล้ว'); await loadAll();
      }
      else if (act === 'approve') await review(id, 'approve');
      else if (act === 'return') openReturn(id);
      else if (act === 'newgroup') openGroup(null);
      else if (act === 'editgroup') openGroup(id);
      else if (act === 'pinrand') { if (confirm('สุ่ม PIN ใหม่ให้กลุ่มงาน' + gname(id) + '? PIN เดิมจะใช้ไม่ได้ทันที')) await setPin(id, ''); }
      else if (act === 'pinset') openPinSet(id);
      else if (act === 'copypin') { const t = document.getElementById('pinmsg'); t.select(); try { await navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); } U.toast('คัดลอกแล้ว'); }
      else if (act === 'quota') { const q = await call('admin.lineQuota'); document.getElementById('quota').textContent = q.ok ? 'ใช้ไป ' + q.used + ' จาก ' + (q.type === 'limited' ? q.limit : 'ไม่จำกัด') + ' ข้อความในเดือนนี้' : 'ตรวจไม่สำเร็จ: ' + q.error; }
      else if (act === 'digest') { const g = document.getElementById('dg').value; const r = await call('admin.sendDigest', { group_id: g }); U.toast('ส่งแล้ว ' + r.pushes + ' ปลายทาง' + (r.failed ? ' · ไม่สำเร็จ ' + r.failed : '') + (r.pushes === 0 ? ' (ไม่มีกลุ่มที่ผูก LINE และมีงานค้าง)' : '')); await loadAll(); }
      else if (act === 'toggleuser') { const u = A.d.users.filter(function (x) { return x.username === id; })[0]; await call('admin.saveUser', { user: { username: id, name: u.name, active: el.getAttribute('data-v') === '1' } }); await loadAll(); }
    } catch (e) { U.toast(e.message, true); }
  });

  document.addEventListener('change', async function (ev) {
    const el = ev.target;
    if (dlg.contains(el) && ED && dlg.querySelector('form[data-form=event]')) { edSync(el); return; }
    const act = el.getAttribute('data-act');
    const f = el.getAttribute('data-f');
    try {
      if (f) { A.f[f] = el.type === 'checkbox' ? el.checked : el.value; render(); }
      else if (act === 'tevent') { A.trackEvent = el.value; A.sel = {}; render(); }
      else if (el.hasAttribute('data-sel')) { A.sel[el.getAttribute('data-sel')] = el.checked; }
      else if (act === 'selall') { view.querySelectorAll('[data-sel]').forEach(function (c) { c.checked = el.checked; A.sel[c.getAttribute('data-sel')] = el.checked; }); }
      else if (act === 'setone') { await call('admin.setStatus', { asg_ids: [el.getAttribute('data-id')], status: el.value }); U.toast('ปรับสถานะแล้ว'); await loadAll(); }
      else if (act === 'bind') { await call('admin.bindLine', { target_id: el.getAttribute('data-id'), group_id: el.value }); U.toast(el.value ? 'ผูกกับ' + gname(el.value) + 'แล้ว' : 'ยกเลิกการผูกแล้ว'); await loadAll(); }
      else if (act === 'tactive') { const t = A.d.targets.filter(function (x) { return x.target_id === el.getAttribute('data-id'); })[0]; await call('admin.bindLine', { target_id: t.target_id, group_id: t.group_id, active: el.checked }); await loadAll(); }
    } catch (e) { U.toast(e.message, true); }
  });

  document.addEventListener('input', function (ev) {
    const el = ev.target;
    if (dlg.contains(el) && ED && (el.hasAttribute('data-e') || el.hasAttribute('data-r')) && el.tagName !== 'SELECT' && el.type !== 'checkbox') {
      if (el.hasAttribute('data-e')) ED[el.getAttribute('data-e')] = el.value;
      else ED.rows[Number(el.getAttribute('data-r'))][el.getAttribute('data-k')] = el.value;
    }
    if (el.getAttribute('data-f') === 'q') { A.f.q = el.value; clearTimeout(A._qt); A._qt = setTimeout(function () { render(); const q = view.querySelector('[data-f=q]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 300); }
  });

  document.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const f = ev.target;
    const kind = f.getAttribute('data-form');
    const err = f.querySelector('.err');
    try {
      if (kind === 'login') await doLogin(f);
      else if (kind === 'event') await saveEvent(f);
      else if (kind === 'return') { const n = f.note.value.trim(); if (!n) { err.textContent = 'กรุณาระบุเหตุผล'; f.note.classList.add('input-err'); return; } await review(f.getAttribute('data-id'), 'return', n); }
      else if (kind === 'group') {
        await call('admin.saveGroup', { group: { id: f.gid.value.trim(), name: f.gname.value, coordinator: f.coordinator.value, order: f.order.value, active: f.active.checked } });
        dlg.close(); U.toast('บันทึกกลุ่มงานแล้ว'); await loadAll();
      }
      else if (kind === 'pin') { const p = f.pin.value.trim(); if (!/^\d{4}$/.test(p)) { err.textContent = 'PIN ต้องเป็นตัวเลข 4 หลัก'; return; } await setPin(f.getAttribute('data-id'), p); }
      else if (kind === 'settings') { const s = {}; A.d.settings.forEach(function (x) { if (f[x.key]) s[x.key] = f[x.key].value; }); await call('admin.saveSettings', { settings: s }); U.toast('บันทึกการตั้งค่าแล้ว'); await loadAll(); }
      else if (kind === 'pw') { await call('admin.changePassword', { old_password: f.old.value, new_password: f.nw.value }); f.reset(); U.toast('เปลี่ยนรหัสผ่านแล้ว'); }
      else if (kind === 'user') { await call('admin.saveUser', { user: { username: f.username.value, name: f.uname.value, password: f.password.value, active: true } }); U.toast('เพิ่มผู้ดูแลแล้ว'); await loadAll(); }
      else if (kind === 'sim') {
        const tg = f.tgt.value.split('|');
        const src = tg[1] === 'user' ? { type: 'user', userId: tg[0] } : { type: 'group', groupId: tg[0] };
        const evt = f.type.value === 'join' ? { type: tg[1] === 'user' ? 'follow' : 'join', replyToken: 'demo', source: src } : { type: 'message', replyToken: 'demo', source: src, message: { type: 'text', text: f.text.value } };
        await U.demoHook([evt]);
        await loadAll();
      }
    } catch (e) { if (err) err.textContent = e.message; else U.toast(e.message, true); }
  });

  /* ---------------- start ---------------- */
  const h = location.hash.replace('#', '');
  if (TABS.some(function (t) { return t[0] === h; })) A.tab = h;
  A.tok = getTok();
  if (A.tok) loadAll().catch(function (e) { renderLogin(e.message); });
  else renderLogin();
})();

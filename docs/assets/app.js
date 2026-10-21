/* ปฏิทินระบบงาน — หน้าฝั่งกลุ่มงาน (ปฏิทินรวม, สรุปงานของกลุ่ม, แนบงาน/แจ้งส่งงาน) */
(function () {
  'use strict';
  const U = window.UI;
  const esc = U.esc;
  const view = document.getElementById('view');
  const dlg = document.getElementById('dlg');

  const st = {
    boot: null,
    group: U.store.get('group') || '',
    onlyMine: U.store.get('onlyMine') === '1',
    mode: 'month',
    ym: null,
    picked: null,
    page: 'calendar'
  };
  let M = {}; // lookups

  U.demoBanner('โหมดทดลอง: ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น · PIN ทุกกลุ่ม 1234 · ฝั่งยุทธ์ใช้ admin / admin1234');

  /* ---------------- data ---------------- */
  async function load() {
    st.boot = await U.api('boot');
    const b = st.boot;
    M = { group: {}, event: {}, asg: {}, byEvent: {}, byGroup: {} };
    b.groups.forEach(function (g) { M.group[g.id] = g; });
    b.events.forEach(function (e) { M.event[e.id] = e; M.byEvent[e.id] = []; });
    b.assignments.forEach(function (a) {
      M.asg[a.id] = a;
      if (M.byEvent[a.event_id]) M.byEvent[a.event_id].push(a);
      (M.byGroup[a.group_id] = M.byGroup[a.group_id] || []).push(a);
    });
    if (st.group && !M.group[st.group]) st.group = '';
    if (!st.ym) st.ym = b.today.slice(0, 7);
  }
  const today = () => st.boot.today;
  const mineOf = (evId) => (st.group ? (M.byEvent[evId] || []).filter(function (a) { return a.group_id === st.group; })[0] : null);

  /* ---------------- routing ---------------- */
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    const parts = h.split('/');
    if (parts[0] === 'summary') {
      st.page = 'summary';
      if (parts[1] && M.group[parts[1]]) setGroup(parts[1]);
    } else if (parts[0] === 'task' && M.asg[parts[1]]) {
      const a = M.asg[parts[1]];
      st.page = 'calendar';
      setGroup(a.group_id);
      st.picked = a.event_id;
      st.ym = M.event[a.event_id].start.slice(0, 7);
      render();
      openSubmit(a.id, 'submit');
      history.replaceState(null, '', '#calendar');
      return;
    } else {
      st.page = 'calendar';
    }
    render();
  }
  function setGroup(g) { st.group = g; U.store.set('group', g); }

  function render() {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === st.page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    view.innerHTML = groupBar() + (st.page === 'summary' ? summaryHtml() : calendarHtml());
  }

  function groupBar() {
    const opts = '<option value="">— เลือกกลุ่มงานของฉัน —</option>' + st.boot.groups.map(function (g) {
      return '<option value="' + esc(g.id) + '"' + (g.id === st.group ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    }).join('');
    const types = st.boot.types;
    const legend = '<span><span class="sw main"></span>รับผิดชอบหลัก</span><span><span class="sw joint"></span>ร่วมดำเนินการ</span>' +
      Object.keys(types).filter(function (k) { return k !== 'other'; }).map(function (k) { return '<span class="t-' + k + '"><span class="sq"></span>' + esc(types[k]) + '</span>'; }).join('');
    return '<section class="card row no-print">' +
      '<label class="row" style="gap:10px"><strong style="color:var(--navy)">กลุ่มงานของฉัน</strong>' +
      '<select data-act="group" style="min-width:240px">' + opts + '</select></label>' +
      (st.page === 'calendar' ? '<label class="check"><input type="checkbox" data-act="onlyMine"' + (st.onlyMine ? ' checked' : '') + (st.group ? '' : ' disabled') + '> แสดงเฉพาะงานของกลุ่มฉัน</label>' : '') +
      (st.page === 'calendar' ? '<div class="legend" style="margin-left:auto">' + legend + '</div>' : '') +
      '</section>';
  }

  /* ---------------- calendar ---------------- */
  function visibleEvents() {
    return st.boot.events.filter(function (e) { return !st.onlyMine || !st.group || mineOf(e.id); })
      .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title, 'th'); });
  }

  function calendarHtml() {
    const evs = visibleEvents();
    if (!st.picked || !M.event[st.picked]) st.picked = defaultPick(evs);
    const head = '<div class="row" style="justify-content:space-between;margin-bottom:12px">' +
      '<div class="row" style="gap:8px">' +
      '<button class="btn icon-btn" data-act="prev" aria-label="เดือนก่อนหน้า">‹</button>' +
      '<h1 style="min-width:170px;text-align:center">' + esc(U.monthLabel(st.ym)) + '</h1>' +
      '<button class="btn icon-btn" data-act="next" aria-label="เดือนถัดไป">›</button>' +
      '<button class="btn" data-act="today">วันนี้</button></div>' +
      '<div class="seg" role="group" aria-label="มุมมอง">' +
      '<button data-act="mode" data-v="month" aria-pressed="' + (st.mode === 'month') + '">เดือน</button>' +
      '<button data-act="mode" data-v="list" aria-pressed="' + (st.mode === 'list') + '">รายการ</button></div></div>';
    const body = st.mode === 'list' ? listHtml(evs) : monthHtml(evs);
    return '<div class="split"><section class="card main">' + head + body + '</section>' +
      '<aside class="card side detail" aria-live="polite">' + detailHtml() + '</aside></div>';
  }

  function defaultPick(evs) {
    const t = today();
    const mine = evs.filter(function (e) { return e.end >= t && (!st.group || mineOf(e.id)); });
    const any = evs.filter(function (e) { return e.end >= t; });
    return (mine[0] || any[0] || evs[evs.length - 1] || {}).id || null;
  }

  function chipHtml(e) {
    const a = mineOf(e.id);
    const rel = !st.group ? '' : a ? (a.role === 'หลัก' ? 'main' : 'joint') : 'other';
    const over = a && U.effStatus(a, today()) === U.S.OVER;
    const label = e.title + (a ? ' (กลุ่มฉัน: ' + a.role + ')' : '');
    return '<button class="chip t-' + esc(e.type) + ' ' + rel + (st.picked === e.id ? ' picked' : '') + '" data-act="pick" data-id="' + esc(e.id) + '" aria-label="' + esc(label) + '">' +
      '<span class="ttl">' + esc(e.title) + '</span>' +
      ((a || over) ? '<span class="tags">' + (a ? '<span class="role-tag">' + esc(a.role) + '</span>' : '') + (over ? '<span class="over-tag">! เกินกำหนด</span>' : '') + '</span>' : '') +
      '</button>';
  }

  function monthHtml(evs) {
    const p = st.ym.split('-').map(Number);
    const first = Date.UTC(p[0], p[1] - 1, 1) / 86400000;
    const off = new Date(first * 86400000).getUTCDay();
    const dim = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    const total = Math.ceil((off + dim) / 7) * 7;
    const t = today();
    let html = '<div class="cal-scroll"><div class="cal" role="grid"><div class="cal-head" role="row">' + U.DOW.map(function (d) { return '<div role="columnheader">' + d + '</div>'; }).join('') + '</div>';
    for (let w = 0; w < total / 7; w++) {
      html += '<div class="cal-week" role="row">';
      for (let i = 0; i < 7; i++) {
        const ds = U.fromNum(first - off + w * 7 + i);
        const inMonth = ds.slice(0, 7) === st.ym;
        const dayEvs = evs.filter(function (e) { return e.start <= ds && (e.end || e.start) >= ds; });
        html += '<div class="cal-day' + (inMonth ? '' : ' out') + (ds === t ? ' today' : '') + '" role="gridcell">' +
          '<span class="num">' + Number(ds.slice(8)) + '</span>' + dayEvs.map(chipHtml).join('') + '</div>';
      }
      html += '</div>';
    }
    return html + '</div></div>';
  }

  function listHtml(evs) {
    const inMonth = evs.filter(function (e) { return e.start.slice(0, 7) <= st.ym && e.end.slice(0, 7) >= st.ym; });
    if (!inMonth.length) return '<div class="empty">ไม่มีงานในเดือนนี้</div>';
    return '<div class="tbl-wrap"><table class="tbl min-760"><thead><tr><th>วันที่</th><th>งาน</th><th>ประเภท</th><th>กลุ่มฉัน</th></tr></thead><tbody>' +
      inMonth.map(function (e) {
        const a = mineOf(e.id);
        return '<tr class="' + (a ? 'me' : '') + '"><td class="nowrap">' + esc(U.rangeText(e.start, e.end)) + '</td>' +
          '<td><button class="btn-link" data-act="pick" data-id="' + esc(e.id) + '" style="all:unset;cursor:pointer;color:var(--navy);font-weight:600;text-decoration:underline">' + esc(e.title) + '</button></td>' +
          '<td><span class="badge type-tag t-' + esc(e.type) + '">' + esc(st.boot.types[e.type] || e.type) + '</span></td>' +
          '<td>' + (a ? esc(a.role) + ' · ส่ง ' + esc(U.thDate(a.due)) + ' ' + U.badge(U.effStatus(a, today())) : '<span class="muted">–</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function detailHtml() {
    const e = M.event[st.picked];
    if (!e) return '<div class="empty">คลิกงานในปฏิทินเพื่อดูรายละเอียด</div>';
    const list = (M.byEvent[e.id] || []).slice().sort(function (a, b) { return a.group_id === st.group ? -1 : b.group_id === st.group ? 1 : 0; });
    const done = list.filter(function (a) { return a.status === U.S.DONE; }).length;
    const a = mineOf(e.id);
    const t = today();
    let mine = '';
    if (a) {
      const latest = st.boot.latest[a.id];
      mine = '<div class="mine-box"><div class="who">สิ่งที่กลุ่มงาน' + esc(M.group[st.group].name) + 'ต้องทำ (รับผิดชอบ' + esc(a.role) + ')</div>' +
        '<div>' + esc(a.task) + '</div>' +
        '<div class="small muted">กำหนดส่ง ' + esc(U.thDate(a.due, 'full')) + ' (' + esc(U.dueText(t, a.due)) + ') · ' + U.badge(U.effStatus(a, t)) + '</div>' +
        (a.status === U.S.RETURN && a.note ? '<div class="small" style="color:#7A3A00">ข้อเสนอแนะจากทีมยุทธ์: ' + esc(a.note) + '</div>' : '') +
        (latest ? '<div class="small muted">ล่าสุด: ' + (latest.kind === 'submit' ? 'แจ้งส่ง' : 'แนบงาน') + ' ทาง' + esc(latest.channel_label) + ' · ' + esc(latest.reporter) + ' · ' + esc(U.thDateTime(latest.created_at)) + '</div>' : '') +
        (a.status !== U.S.DONE ? '<div class="row" style="gap:8px;margin-top:4px"><button class="btn btn-outline" data-act="submit" data-asg="' + esc(a.id) + '" data-kind="attach">แนบงาน</button>' +
          '<button class="btn btn-primary" data-act="submit" data-asg="' + esc(a.id) + '" data-kind="submit">แจ้งส่งงาน</button></div>' : '') +
        '</div>';
    }
    return '<div class="row" style="gap:8px"><span class="badge type-tag t-' + esc(e.type) + '">' + esc(st.boot.types[e.type] || e.type) + '</span>' +
      '<span class="small muted">เสร็จสิ้น ' + done + '/' + list.length + ' กลุ่ม</span></div>' +
      '<h2 style="color:var(--navy);margin:8px 0 10px">' + esc(e.title) + '</h2>' +
      '<dl><dt>วันที่</dt><dd>' + esc(U.rangeText(e.start, e.end)) + '</dd>' +
      (e.place ? '<dt>สถานที่</dt><dd>' + esc(e.place) + '</dd>' : '') +
      (e.detail ? '<dt>รายละเอียด</dt><dd>' + esc(e.detail) + '</dd>' : '') +
      (e.link ? '<dt>เอกสาร</dt><dd><a href="' + esc(U.safeUrl(e.link)) + '" target="_blank" rel="noopener">เปิดลิงก์</a></dd>' : '') +
      '<dt>ผู้รับผิดชอบ</dt><dd>กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข</dd></dl>' +
      (mine ? '<div style="margin-top:14px">' + mine + '</div>' : '') +
      '<h3 style="margin:16px 0 8px;color:var(--green)">กลุ่มงานที่เกี่ยวข้อง (' + list.length + ' กลุ่ม)</h3>' +
      '<div class="asg-list">' + list.map(function (x) {
        return '<div class="asg-item' + (x.group_id === st.group ? ' me' : '') + '"><div><strong>' + esc((M.group[x.group_id] || {}).name || x.group_id) + '</strong> <span class="small muted">· ' + esc(x.role) + '</span></div>' +
          U.badge(U.effStatus(x, t)) + '<div class="t">' + esc(x.task) + ' · ส่ง ' + esc(U.thDate(x.due)) + '</div></div>';
      }).join('') + '</div>';
  }

  /* ---------------- summary ---------------- */
  function summaryHtml() {
    if (!st.group) return '<section class="card"><div class="empty">เลือกกลุ่มงานของคุณจากช่องด้านบน เพื่อดูงานที่ต้องทำและกำหนดส่ง</div></section>';
    const g = M.group[st.group];
    const t = today();
    const list = (M.byGroup[st.group] || []).filter(function (a) { return M.event[a.event_id]; });
    const open = list.filter(U.isOpen).sort(function (a, b) { return a.due < b.due ? -1 : 1; });
    const sec = {
      over: open.filter(function (a) { return a.due < t; }),
      in7: open.filter(function (a) { const d = U.diffDays(t, a.due); return d >= 0 && d <= 7; }),
      in30: open.filter(function (a) { const d = U.diffDays(t, a.due); return d > 7 && d <= 30; }),
      later: open.filter(function (a) { return U.diffDays(t, a.due) > 30; }),
      sent: list.filter(function (a) { return a.status === U.S.SENT; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; }),
      done: list.filter(function (a) { return a.status === U.S.DONE; }).sort(function (a, b) { return a.due > b.due ? -1 : 1; })
    };
    const hasTok = !!tokenFor(st.group);
    const stats = [['เกินกำหนด', sec.over.length, 'var(--over)'], ['ครบกำหนดใน 7 วัน', sec.in7.length, 'var(--navy)'], ['ส่งแล้ว รอตรวจ', sec.sent.length, 'var(--green)'], ['เสร็จสิ้น', sec.done.length, '#1E5631']];
    return '<div class="row" style="justify-content:space-between">' +
      '<div><h1>สรุปงานของกลุ่มงาน' + esc(g.name) + '</h1><div class="small muted">' + (g.coordinator ? 'ผู้ประสานงานหลัก: ' + esc(g.coordinator) + ' · ' : '') + 'ข้อมูล ณ ' + esc(U.thDate(t, 'full')) + '</div></div>' +
      '<div class="row no-print" style="gap:8px"><button class="btn" data-act="print">พิมพ์สรุป (A4)</button>' +
      '<button class="btn btn-outline" data-act="ics">ดาวน์โหลดกำหนดส่งเข้าปฏิทินของฉัน (.ics)</button>' +
      (hasTok ? '<button class="btn" data-act="forget">ลืม PIN บนเครื่องนี้</button>' : '') + '</div></div>' +
      '<div class="stats">' + stats.map(function (s) { return '<div class="stat"><div class="small muted">' + s[0] + '</div><div class="n" style="color:' + s[2] + '">' + s[1] + '</div><div class="small muted">รายการ</div></div>'; }).join('') + '</div>' +
      secHtml('เกินกำหนด', 'var(--over)', sec.over, 'เกินมา', true) +
      secHtml('ภายใน 7 วัน', 'var(--navy)', sec.in7, 'เหลือ', true) +
      secHtml('ภายใน 30 วัน', 'var(--navy-2)', sec.in30, 'เหลือ', true) +
      (sec.later.length ? secHtml('มากกว่า 30 วัน', 'var(--navy-2)', sec.later, 'เหลือ', true) : '') +
      secHtml('ส่งแล้ว รอทีมยุทธ์ตรวจ', 'var(--green)', sec.sent, 'ส่งเมื่อ', false) +
      '<details class="card"><summary style="cursor:pointer;font-weight:600;color:#1E5631;min-height:32px">เสร็จสิ้น (' + sec.done.length + ' รายการ)</summary><div style="margin-top:10px">' + tableHtml(sec.done, 'กำหนดส่ง', false) + '</div></details>';
  }

  function secHtml(title, color, rows, dayHead, actions) {
    return '<section class="card"><h2 style="color:' + color + ';margin-bottom:10px">' + esc(title) + ' <span class="small muted" style="font-weight:400">(' + rows.length + ' รายการ)</span></h2>' + tableHtml(rows, dayHead, actions) + '</section>';
  }

  function tableHtml(rows, dayHead, actions) {
    if (!rows.length) return '<div class="empty">ไม่มีรายการ</div>';
    const t = today();
    return '<div class="tbl-wrap"><table class="tbl min-900 resp"><thead><tr><th style="width:26%">งาน</th><th style="width:26%">สิ่งที่ต้องทำ</th><th>บทบาท</th><th>กำหนดส่ง</th><th>' + esc(dayHead) + '</th><th>สถานะ</th><th class="no-print">การดำเนินการ</th></tr></thead><tbody>' +
      rows.map(function (a) {
        const e = M.event[a.event_id];
        const latest = st.boot.latest[a.id];
        let dayCell;
        if (dayHead === 'ส่งเมื่อ') dayCell = latest ? U.thDateTime(latest.created_at) : '–';
        else if (dayHead === 'กำหนดส่ง') dayCell = U.thDate(a.due);
        else dayCell = U.dueText(t, a.due).replace('เกิน ', '');
        const info = latest ? '<div class="small muted">' + (latest.kind === 'submit' ? 'แจ้งส่ง' : 'แนบงาน') + ' ทาง' + esc(latest.channel_label) + (latest.channel_detail ? ' (' + esc(latest.channel_detail) + ')' : '') + (latest.files_count ? ' · ' + latest.files_count + ' ไฟล์' : '') + ' · ' + esc(latest.reporter) + '</div>' : '';
        return '<tr><td data-label="งาน"><strong>' + esc(e.title) + '</strong></td><td data-label="สิ่งที่ต้องทำ">' + esc(a.task) +
          (a.status === U.S.RETURN && a.note ? '<div class="small" style="color:#7A3A00">ข้อเสนอแนะ: ' + esc(a.note) + '</div>' : '') + '</td>' +
          '<td data-label="บทบาท">' + esc(a.role) + '</td><td class="nowrap" data-label="กำหนดส่ง">' + esc(U.thDate(a.due)) + '</td><td class="nowrap" data-label="' + esc(dayHead) + '"><strong>' + esc(dayCell) + '</strong></td>' +
          '<td data-label="สถานะ">' + U.badge(U.effStatus(a, t)) + '</td><td class="no-print">' +
          (actions ? '<div class="row" style="gap:6px"><button class="btn btn-outline btn-sm" data-act="submit" data-asg="' + esc(a.id) + '" data-kind="attach">แนบงาน</button>' +
            '<button class="btn btn-primary btn-sm" data-act="submit" data-asg="' + esc(a.id) + '" data-kind="submit">แจ้งส่งงาน</button></div>' : '') + info + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------------- ICS ---------------- */
  function downloadIcs() {
    const g = M.group[st.group];
    const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PLK Health//Work Calendar//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc('งานกลุ่มงาน' + g.name)];
    (M.byGroup[st.group] || []).forEach(function (a) {
      const e = M.event[a.event_id];
      if (!e || a.status === U.S.CANCEL) return;
      lines.push('BEGIN:VEVENT', 'UID:' + a.id + '@plk-work-calendar', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + a.due.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + U.addDays(a.due, 1).replace(/-/g, ''),
        'SUMMARY:' + icsEsc('[กำหนดส่ง] ' + e.title),
        'DESCRIPTION:' + icsEsc('สิ่งที่ต้องทำ: ' + a.task + '\nบทบาท: ' + a.role + '\nวันจัดงาน: ' + U.rangeText(e.start, e.end) + (location.protocol === 'https:' ? '\n' + location.href.split('#')[0] + '#task/' + a.id : '')),
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'กำหนดส่ง_' + g.name + '.ics';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- PIN token ---------------- */
  function tokenFor(gid) {
    try {
      const v = JSON.parse(U.store.get('tok_' + gid) || 'null');
      if (v && v.exp > Date.now()) return v.token;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------------- submit dialog ---------------- */
  const sub = { asg: null, kind: 'submit', channel: 'file', files: [], busy: false };

  function openSubmit(asgId, kind) {
    const a = M.asg[asgId];
    if (!a) return;
    sub.asg = a; sub.kind = kind || 'submit'; sub.files = []; sub.busy = false;
    sub.channel = 'file';
    if (!tokenFor(a.group_id)) renderPin(); else renderForm();
    if (!dlg.open) dlg.showModal();
  }

  function dlgHead(title, subtitle) {
    return '<div class="dlg-head"><div><div class="small" style="color:var(--frame-ink);font-weight:600">' + esc(subtitle) + '</div><h2 id="dlg-title" style="color:var(--navy)">' + esc(title) + '</h2></div>' +
      '<button class="btn icon-btn" data-act="close" aria-label="ปิด">×</button></div>';
  }

  function renderPin(errMsg) {
    const a = sub.asg, g = M.group[a.group_id];
    dlg.innerHTML = dlgHead('ยืนยัน PIN ของกลุ่มงาน' + g.name, 'ยืนยันตัวตนกลุ่มงาน') +
      '<form class="dlg-body" data-form="pin" novalidate><p style="margin:0">กรอก PIN 4 หลักของกลุ่มงาน' + esc(g.name) + ' (ขอได้จากผู้ประสานงานหลักหรือทีมยุทธ์) ระบบจะจำไว้บนเครื่องนี้ 90 วัน</p>' +
      '<label class="field">PIN 4 หลัก<input class="pin-input' + (errMsg ? ' input-err' : '') + '" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="[0-9]{4}" required></label>' +
      (errMsg ? '<div class="err" role="alert">' + esc(errMsg) + '</div>' : '') +
      '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">ยกเลิก</button><button class="btn btn-navy" type="submit">ยืนยัน PIN</button></div></form>';
    const inp = dlg.querySelector('input[name=pin]');
    setTimeout(function () { inp.focus(); }, 30);
  }

  async function verifyPin(form) {
    const pin = form.pin.value.trim();
    if (!/^\d{4}$/.test(pin)) { renderPin('กรอกตัวเลข 4 หลัก'); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ…';
    try {
      const r = await U.api('group.verifyPin', { group_id: sub.asg.group_id, pin: pin });
      U.store.set('tok_' + sub.asg.group_id, JSON.stringify({ token: r.token, exp: r.exp }));
      renderForm();
    } catch (e) { renderPin(e.message); }
  }

  const CH_FIELDS = {
    file: '',
    link: '<label class="field">ลิงก์เอกสาร<input type="url" name="link" placeholder="https://drive.google.com/…"></label>',
    email: '<div class="grid-2"><label class="field">ส่งถึงอีเมล<input type="text" name="cd1" placeholder="อีเมลกลางที่ส่งไป"></label><label class="field">วันที่ส่ง<input type="date" name="cd2"></label></div>',
    line: '<label class="field">ส่งให้ใคร / กลุ่ม LINE ใด<input type="text" name="cd1" placeholder="เช่น กลุ่ม LINE ผู้ประสานงานยุทธ์"></label>',
    doc: '<div class="grid-2"><label class="field">เลขที่หนังสือ<input type="text" name="cd1" placeholder="พล 0033.0__/____"></label><label class="field">ลงวันที่<input type="date" name="cd2"></label></div>',
    hand: '<label class="field">ผู้รับเอกสาร (ฝั่งยุทธ์)<input type="text" name="cd1" placeholder="ชื่อผู้รับ"></label>',
    other: '<label class="field">ระบุช่องทาง <span class="req">(จำเป็น)</span><input type="text" name="cd1" placeholder="ระบุช่องทางที่ใช้ส่ง"></label>'
  };

  function renderForm(errMsg) {
    const a = sub.asg, e = M.event[a.event_id], g = M.group[a.group_id];
    const t = today();
    const chans = st.boot.channels;
    const reporter = U.store.get('reporter') || '';
    const maxMb = st.boot.maxUploadMb || 10;
    dlg.innerHTML = dlgHead(e.title, 'งานของกลุ่มงาน' + g.name + ' · รับผิดชอบ' + a.role) +
      '<form class="dlg-body" data-form="submit" novalidate>' +
      '<div class="small muted">สิ่งที่ต้องทำ: ' + esc(a.task) + ' · กำหนดส่ง ' + esc(U.thDate(a.due, 'full')) + ' (' + esc(U.dueText(t, a.due)) + ') · สถานะ ' + U.badge(U.effStatus(a, t)) + '</div>' +
      '<fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;color:var(--green);margin-bottom:8px">ต้องการทำอะไร</legend><div class="seg" role="group">' +
      '<button type="button" data-act="kind" data-v="attach" aria-pressed="' + (sub.kind === 'attach') + '">แนบงาน (ยังไม่แจ้งส่ง)</button>' +
      '<button type="button" data-act="kind" data-v="submit" aria-pressed="' + (sub.kind === 'submit') + '">แจ้งส่งงาน</button></div></fieldset>' +
      '<fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;color:var(--green);margin-bottom:8px">ส่งผ่านช่องทางใด</legend><div class="pills">' +
      Object.keys(chans).map(function (k) { return '<button type="button" class="pill-opt" data-act="channel" data-v="' + k + '" aria-pressed="' + (sub.channel === k) + '">' + esc(chans[k]) + '</button>'; }).join('') +
      '</div></fieldset>' +
      (sub.channel === 'file' ? '<div><label class="drop"><strong>คลิกเพื่อเลือกไฟล์</strong> หรือลากไฟล์มาวาง<br><span class="small">รวมไม่เกิน ' + maxMb + ' MB ต่อครั้ง · ไฟล์เก็บใน Google Drive ของกลุ่มงานยุทธ์</span>' +
        '<input type="file" multiple data-act="files" class="sr-only"></label><div class="asg-list" style="margin-top:8px" id="file-list">' + fileListHtml() + '</div></div>' : CH_FIELDS[sub.channel]) +
      '<label class="field">ชื่อ–สกุลผู้แจ้ง <span class="req">(จำเป็น)</span><input type="text" name="reporter" value="' + esc(reporter) + '" autocomplete="name"></label>' +
      '<label class="field">หมายเหตุถึงทีมยุทธ์<textarea name="note" rows="2"></textarea></label>' +
      '<div class="err" role="alert" id="form-err">' + esc(errMsg || '') + '</div>' +
      '<div class="row" style="justify-content:space-between"><button type="button" class="btn btn-sm" data-act="forget-here">เปลี่ยนกลุ่ม/ลืม PIN</button>' +
      '<div class="row" style="gap:8px"><button type="button" class="btn" data-act="close">ยกเลิก</button>' +
      '<button type="submit" class="btn ' + (sub.kind === 'submit' ? 'btn-primary' : 'btn-navy') + '">' + (sub.kind === 'submit' ? 'แจ้งส่งงาน' : 'บันทึกการแนบ') + '</button></div></div>' +
      '</form>';
    const drop = dlg.querySelector('.drop');
    if (drop) {
      drop.addEventListener('dragover', function (ev) { ev.preventDefault(); });
      drop.addEventListener('drop', function (ev) { ev.preventDefault(); addFiles(ev.dataTransfer.files); });
    }
  }

  function fileListHtml() {
    return sub.files.map(function (f, i) {
      return '<div class="file-row"><span>' + esc(f.name) + ' · ' + (f.size / 1024 < 1024 ? Math.ceil(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB') + '</span>' +
        '<button type="button" class="btn btn-sm" data-act="rmfile" data-i="' + i + '" aria-label="นำไฟล์ ' + esc(f.name) + ' ออก">นำออก</button></div>';
    }).join('');
  }
  function addFiles(list) {
    Array.prototype.forEach.call(list || [], function (f) { sub.files.push(f); });
    const el = document.getElementById('file-list');
    if (el) el.innerHTML = fileListHtml();
  }

  async function doSubmit(form) {
    if (sub.busy) return;
    const errEl = document.getElementById('form-err');
    const reporter = form.reporter.value.trim();
    form.reporter.classList.remove('input-err');
    if (!reporter) { form.reporter.classList.add('input-err'); errEl.textContent = 'กรุณากรอกชื่อผู้แจ้ง'; form.reporter.focus(); return; }
    const payload = { token: tokenFor(sub.asg.group_id), asg_id: sub.asg.id, kind: sub.kind, channel: sub.channel, reporter: reporter, note: form.note.value };
    if (sub.channel === 'link') {
      payload.link = (form.link.value || '').trim();
      if (!/^https?:\/\//i.test(payload.link)) { form.link.classList.add('input-err'); errEl.textContent = 'กรุณาใส่ลิงก์ที่ขึ้นต้นด้วย https://'; return; }
    }
    if (form.cd1 || form.cd2) {
      const p1 = form.cd1 ? form.cd1.value.trim() : '';
      const p2 = form.cd2 && form.cd2.value ? U.thDate(form.cd2.value) : '';
      payload.channel_detail = [p1, p2].filter(Boolean).join(' · ');
      if (sub.channel === 'other' && !p1) { form.cd1.classList.add('input-err'); errEl.textContent = 'กรุณาระบุช่องทาง'; return; }
    }
    if (sub.channel === 'file') {
      if (sub.kind === 'attach' && !sub.files.length) { errEl.textContent = 'ยังไม่ได้เลือกไฟล์'; return; }
      const total = sub.files.reduce(function (s, f) { return s + f.size; }, 0);
      const maxMb = st.boot.maxUploadMb || 10;
      if (total > maxMb * 1048576) { errEl.textContent = 'ไฟล์รวมเกิน ' + maxMb + ' MB กรุณาแบ่งส่งหรือใช้ช่องทางลิงก์ Google Drive'; return; }
    }
    U.store.set('reporter', reporter);
    sub.busy = true;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = sub.files.length ? 'กำลังอัปโหลดไฟล์…' : 'กำลังบันทึก…';
    try {
      if (sub.channel === 'file' && sub.files.length) {
        payload.files = await Promise.all(sub.files.map(async function (f) { return { name: f.name, mime: f.type, data: await U.readFileB64(f) }; }));
      }
      await U.api('group.submit', payload);
      const kindText = sub.kind === 'submit' ? 'แจ้งส่งงานแล้ว สถานะเป็น “ส่งแล้ว (รอตรวจ)”' : 'บันทึกการแนบแล้ว';
      dlg.close();
      U.toast(kindText);
      await load();
      render();
    } catch (e) {
      sub.busy = false;
      if (e.code === 'PIN_REQUIRED') { U.store.del('tok_' + sub.asg.group_id); renderPin('PIN ของกลุ่มถูกเปลี่ยนหรือหมดอายุ กรุณายืนยันใหม่'); return; }
      btn.disabled = false; btn.textContent = sub.kind === 'submit' ? 'แจ้งส่งงาน' : 'บันทึกการแนบ';
      errEl.textContent = e.message;
    }
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', function (ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'pick') { st.picked = el.getAttribute('data-id'); render(); const p = document.querySelector('.detail'); if (p && window.innerWidth < 1000) p.scrollIntoView({ behavior: 'smooth' }); }
    else if (act === 'prev' || act === 'next') { st.ym = U.shiftMonth(st.ym, act === 'prev' ? -1 : 1); render(); }
    else if (act === 'today') { st.ym = today().slice(0, 7); render(); }
    else if (act === 'mode') { st.mode = el.getAttribute('data-v'); render(); }
    else if (act === 'submit') { openSubmit(el.getAttribute('data-asg'), el.getAttribute('data-kind')); }
    else if (act === 'close') { dlg.close(); }
    else if (act === 'kind') { sub.kind = el.getAttribute('data-v'); keepAndRerender(); }
    else if (act === 'channel') { sub.channel = el.getAttribute('data-v'); keepAndRerender(); }
    else if (act === 'rmfile') { sub.files.splice(Number(el.getAttribute('data-i')), 1); document.getElementById('file-list').innerHTML = fileListHtml(); }
    else if (act === 'print') { window.print(); }
    else if (act === 'ics') { downloadIcs(); }
    else if (act === 'forget') { U.store.del('tok_' + st.group); U.toast('ลบ PIN ที่จำไว้บนเครื่องนี้แล้ว'); render(); }
    else if (act === 'forget-here') { U.store.del('tok_' + sub.asg.group_id); renderPin(); }
  });
  function keepAndRerender() {
    const f = dlg.querySelector('form[data-form=submit]');
    const keep = f ? { reporter: f.reporter.value, note: f.note.value } : null;
    renderForm();
    const nf = dlg.querySelector('form[data-form=submit]');
    if (keep && nf) { nf.reporter.value = keep.reporter; nf.note.value = keep.note; }
  }
  document.addEventListener('change', function (ev) {
    const el = ev.target;
    const act = el.getAttribute && el.getAttribute('data-act');
    if (act === 'group') { setGroup(el.value); if (!el.value) { st.onlyMine = false; } if (st.page === 'summary') history.replaceState(null, '', el.value ? '#summary/' + el.value : '#summary'); st.picked = null; render(); }
    else if (act === 'onlyMine') { st.onlyMine = el.checked; U.store.set('onlyMine', el.checked ? '1' : '0'); render(); }
    else if (act === 'files') { addFiles(el.files); el.value = ''; }
  });
  dlg.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const f = ev.target;
    if (f.getAttribute('data-form') === 'pin') verifyPin(f);
    else if (f.getAttribute('data-form') === 'submit') doSubmit(f);
  });
  dlg.addEventListener('input', function (ev) { if (ev.target.classList.contains('input-err')) ev.target.classList.remove('input-err'); const fe = document.getElementById('form-err'); if (fe) fe.textContent = ''; });
  window.addEventListener('hashchange', route);

  load().then(route).catch(function (e) {
    view.innerHTML = '<section class="card"><div class="empty">โหลดข้อมูลไม่สำเร็จ: ' + esc(e.message) + '<br><button class="btn" onclick="location.reload()" style="margin-top:10px">ลองอีกครั้ง</button></div></section>';
  });
})();

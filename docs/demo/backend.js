/* สร้างอัตโนมัติจาก apps-script/Code.gs ด้วย tools/build-demo.sh — ห้ามแก้ไฟล์นี้โดยตรง */
/**
 * ปฏิทินระบบงาน — กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข สสจ.พิษณุโลก
 * หลังบ้าน Google Apps Script ผูกกับ Google Sheets (ฐานข้อมูล) + Google Drive (ไฟล์แนบ) + LINE OA Messaging API
 *
 * ติดตั้งครั้งแรก (ดูรายละเอียดใน คู่มือติดตั้ง.md)
 *   1) รัน setup()             สร้างชีต ค่าตั้งต้น กลุ่มงาน 15 กลุ่ม โฟลเดอร์ Drive และรหัสลับ
 *   2) แก้แล้วรัน createFirstAdmin()   สร้างบัญชีผู้ดูแล (ทีมยุทธ์)
 *   3) รัน generateAllPins()   สร้าง PIN 4 หลักให้ทุกกลุ่ม (ดูผลใน Execution log แล้วแจ้งผู้ประสานงานหลัก)
 *   4) Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 *   5) ตั้ง Script Property LINE_TOKEN แล้วรัน showLineWebhookUrl() นำ URL ไปใส่ใน LINE Developers
 *   6) รัน installTriggers()   ตั้งเวลาส่งแจ้งเตือนประจำวัน
 */

const TZ = 'Asia/Bangkok';
const APP_NAME = 'ปฏิทินระบบงาน กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข สสจ.พิษณุโลก';

const STATUS = {
  TODO: 'รอดำเนินการ',
  DOING: 'กำลังดำเนินการ',
  SENT: 'ส่งแล้ว (รอตรวจ)',
  DONE: 'เสร็จสิ้น',
  RETURN: 'ส่งกลับแก้ไข',
  POSTPONE: 'เลื่อน',
  CANCEL: 'ยกเลิก'
};
const STATUS_LIST = [STATUS.TODO, STATUS.DOING, STATUS.SENT, STATUS.DONE, STATUS.RETURN, STATUS.POSTPONE, STATUS.CANCEL];
const ADMIN_GROUP = '__admin__';

const TYPES = { meet: 'ประชุม', due: 'กำหนดส่ง', visit: 'นิเทศ/ตรวจราชการ', train: 'อบรม/พัฒนา', other: 'อื่น ๆ' };
const CHANNELS = {
  file: 'แนบไฟล์ในระบบ',
  link: 'ลิงก์ Google Drive/เว็บไซต์',
  email: 'อีเมลกลาง สสจ.',
  line: 'LINE',
  doc: 'หนังสือราชการ (สารบรรณอิเล็กทรอนิกส์)',
  hand: 'ส่งเอกสารด้วยตนเอง',
  other: 'อื่น ๆ'
};

const DEFAULT_GROUPS = [
  ['str', 'ยุทธศาสตร์'], ['hp', 'ส่งเสริมสุขภาพ'], ['cd', 'ควบคุมโรคติดต่อ'], ['ncd', 'โรคไม่ติดต่อ'],
  ['env', 'อนามัยสิ่งแวดล้อม'], ['cp', 'คุ้มครองผู้บริโภค'], ['dent', 'ทันตสาธารณสุข'], ['ins', 'ประกันสุขภาพ'],
  ['qa', 'พัฒนาคุณภาพ'], ['hr', 'ทรัพยากรบุคคล'], ['law', 'กฎหมาย'], ['adm', 'บริหารทั่วไป'],
  ['wis', 'ภูมิปัญญา'], ['dig', 'สุขภาพดิจิทัล'], ['ttm', 'แพทย์แผนไทย']
];

const SCHEMA = {
  Groups: ['group_id', 'name', 'coordinator', 'order', 'active', 'pin_hash', 'pin_salt', 'pin_updated'],
  Events: ['event_id', 'title', 'type', 'start', 'end', 'place', 'detail', 'link', 'visibility', 'status', 'created_at', 'created_by', 'updated_at'],
  Assignments: ['asg_id', 'event_id', 'group_id', 'role', 'task', 'due', 'status', 'updated_at', 'updated_by', 'note'],
  Submissions: ['sub_id', 'asg_id', 'group_id', 'kind', 'channel', 'channel_detail', 'link', 'files', 'reporter', 'note', 'created_at', 'review', 'reviewer', 'review_note', 'reviewed_at'],
  LineTargets: ['target_id', 'type', 'group_id', 'display', 'bound_at', 'active'],
  NotifyLog: ['ts', 'target_id', 'group_id', 'kind', 'msgs', 'ok', 'error'],
  Users: ['username', 'name', 'pass_hash', 'salt', 'active'],
  Settings: ['key', 'value', 'note'],
  Log: ['ts', 'actor', 'action', 'detail']
};
const TEXT_COLS = {
  Groups: ['group_id', 'pin_hash', 'pin_salt', 'pin_updated'],
  Events: ['start', 'end', 'created_at', 'updated_at'],
  Assignments: ['due', 'updated_at'],
  Submissions: ['created_at', 'reviewed_at'],
  LineTargets: ['target_id', 'bound_at'],
  NotifyLog: ['ts'],
  Settings: ['value'],
  Log: ['ts']
};
const DEFAULT_SETTINGS = [
  ['WEB_URL', '', 'ลิงก์หน้าเว็บ เช่น https://<บัญชี>.github.io/plk-work-calendar/ ใช้สร้างปุ่มในข้อความ LINE'],
  ['REMINDER_DAYS', '7,3,1', 'เตือนล่วงหน้าก่อนครบกำหนดกี่วัน (คั่นด้วยจุลภาค)'],
  ['DIGEST_WEEKDAY', '1', 'วันส่งสรุปประจำสัปดาห์ 1=จันทร์ ... 7=อาทิตย์'],
  ['NOTIFY_HOUR', '8', 'ชั่วโมงที่ส่งแจ้งเตือนประจำวัน (ใช้ตอนรัน installTriggers)'],
  ['NOTIFY_ADMIN_ON_SUBMIT', '1', 'แจ้งทีมยุทธ์ทาง LINE ทันทีเมื่อมีการแจ้งส่งงาน (1=เปิด 0=ปิด)'],
  ['DRIVE_FOLDER_ID', '', 'โฟลเดอร์หลักเก็บไฟล์แนบ (setup สร้างให้อัตโนมัติ)'],
  ['MAX_UPLOAD_MB', '10', 'ขนาดไฟล์แนบรวมสูงสุดต่อครั้ง (MB)']
];

/* ====================================================================== */
/* Entry points                                                           */
/* ====================================================================== */

function doGet() {
  return json_({ ok: true, app: APP_NAME, time: nowStr_() });
}

function doPost(e) {
  __db = {};
  try {
    const p = (e && e.parameter) || {};
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    if (p.hook !== undefined) return handleLineWebhook_(String(p.hook), body);
    return json_({ ok: true, data: route_(body) });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function route_(b) {
  const a = String(b.action || '');
  if (a === 'boot') return publicBoot_();
  if (a === 'group.verifyPin') return groupVerifyPin_(b);
  if (a === 'group.check') return groupCheck_(b);
  if (a === 'group.submit') return groupSubmit_(b);
  if (a === 'admin.login') return adminLogin_(b);

  if (a.indexOf('admin.') === 0) {
    const u = verifyAdmin_(b.token);
    switch (a) {
      case 'admin.boot': return adminBoot_(u);
      case 'admin.saveEvent': return adminSaveEvent_(u, b);
      case 'admin.setEventStatus': return adminSetEventStatus_(u, b);
      case 'admin.setStatus': return adminSetStatus_(u, b);
      case 'admin.review': return adminReview_(u, b);
      case 'admin.saveGroup': return adminSaveGroup_(u, b);
      case 'admin.setPin': return adminSetPin_(u, b);
      case 'admin.bindLine': return adminBindLine_(u, b);
      case 'admin.sendDigest': return adminSendDigest_(u, b);
      case 'admin.lineQuota': return adminLineQuota_();
      case 'admin.saveSettings': return adminSaveSettings_(u, b);
      case 'admin.changePassword': return adminChangePassword_(u, b);
      case 'admin.saveUser': return adminSaveUser_(u, b);
    }
  }
  throw new Error('ไม่รู้จักคำสั่ง ' + a);
}

/* ====================================================================== */
/* Public (ฝั่งกลุ่มงาน)                                                    */
/* ====================================================================== */

function publicBoot_() {
  const groups = activeGroups_().map(function (g) { return { id: g.group_id, name: g.name, coordinator: g.coordinator }; });
  const events = table_('Events').filter(function (e) { return e.status !== 'cancelled' && e.visibility !== 'admin'; });
  const evIds = {};
  events.forEach(function (e) { evIds[e.event_id] = true; });
  const asg = table_('Assignments').filter(function (a) { return evIds[a.event_id] && a.status !== STATUS.CANCEL; });
  const latest = {};
  table_('Submissions').forEach(function (s) {
    const cur = latest[s.asg_id];
    if (!cur || String(s.created_at) >= cur.created_at) {
      latest[s.asg_id] = {
        kind: s.kind, channel: s.channel, channel_label: CHANNELS[s.channel] || s.channel, channel_detail: s.channel_detail,
        created_at: String(s.created_at), reporter: s.reporter, files_count: parseFiles_(s.files).length, review: s.review, review_note: s.review_note
      };
    }
  });
  return {
    today: today_(),
    groups: groups,
    events: events.map(pubEvent_),
    assignments: asg.map(pubAsg_),
    latest: latest,
    types: TYPES,
    channels: CHANNELS,
    statuses: STATUS_LIST,
    maxUploadMb: Number(setting_('MAX_UPLOAD_MB') || 10)
  };
}

function pubEvent_(e) {
  return { id: e.event_id, title: e.title, type: e.type, start: e.start, end: e.end || e.start, place: e.place, detail: e.detail, link: e.link, visibility: e.visibility || 'all', status: e.status || 'active' };
}
function pubAsg_(a) {
  return { id: a.asg_id, event_id: a.event_id, group_id: a.group_id, role: a.role, task: a.task, due: a.due, status: a.status, note: a.note, updated_at: String(a.updated_at || '') };
}

function groupVerifyPin_(b) {
  const gid = String(b.group_id || '');
  const pin = String(b.pin || '');
  const g = findGroup_(gid);
  if (!g || !truthy_(g.active)) throw new Error('ไม่พบกลุ่มงาน');
  if (!g.pin_hash) throw new Error('กลุ่มงานนี้ยังไม่ได้ตั้ง PIN กรุณาติดต่อทีมยุทธ์');
  checkLocked_('pin', gid);
  if (!/^\d{4}$/.test(pin) || hash_(pin, g.pin_salt) !== g.pin_hash) {
    const left = registerFail_('pin', gid);
    throw new Error(left > 0 ? 'PIN ไม่ถูกต้อง (ลองได้อีก ' + left + ' ครั้ง)' : 'PIN ไม่ถูกต้องเกินกำหนด ระบบพักการยืนยันของกลุ่มนี้ 15 นาที');
  }
  clearFail_('pin', gid);
  const exp = Date.now() + 90 * 86400000;
  return { token: sign_({ k: 'g', g: gid, v: String(g.pin_updated), exp: exp }), exp: exp, group_id: gid, name: g.name };
}

function groupCheck_(b) {
  const t = verifyGroupToken_(b.token);
  return { group_id: t.g, exp: t.exp };
}

function verifyGroupToken_(token) {
  const t = unsign_(token);
  if (!t || t.k !== 'g') throw new Error('PIN_REQUIRED');
  const g = findGroup_(t.g);
  if (!g || !truthy_(g.active) || String(g.pin_updated) !== String(t.v)) throw new Error('PIN_REQUIRED');
  return t;
}

function groupSubmit_(b) {
  const t = verifyGroupToken_(b.token);
  const kind = b.kind === 'submit' ? 'submit' : 'attach';
  const channel = String(b.channel || '');
  if (!CHANNELS[channel]) throw new Error('กรุณาเลือกช่องทางการส่ง');
  const reporter = clip_(b.reporter, 120);
  if (!reporter) throw new Error('กรุณากรอกชื่อผู้แจ้ง');
  const files = Array.isArray(b.files) ? b.files : [];
  const link = clip_(b.link, 1000);
  if (link && !/^https?:\/\//i.test(link)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
  if (kind === 'attach' && !files.length && !link) throw new Error('ยังไม่มีไฟล์หรือลิงก์ให้บันทึก');
  const maxMb = Number(setting_('MAX_UPLOAD_MB') || 10);
  const totalBytes = files.reduce(function (s, f) { return s + Math.floor(String(f.data || '').length * 0.75); }, 0);
  if (totalBytes > maxMb * 1024 * 1024) throw new Error('ไฟล์รวมเกิน ' + maxMb + ' MB');
  if (files.length > 10) throw new Error('แนบได้ครั้งละไม่เกิน 10 ไฟล์');

  let notice = null;
  const result = withLock_(function () {
    const a = table_('Assignments').filter(function (x) { return x.asg_id === String(b.asg_id || ''); })[0];
    if (!a) throw new Error('ไม่พบงานที่ระบุ');
    if (a.group_id !== t.g) throw new Error('งานนี้ไม่ใช่งานของกลุ่มงานที่ยืนยัน PIN ไว้');
    if (a.status === STATUS.CANCEL) throw new Error('งานนี้ถูกยกเลิกแล้ว');
    const ev = findEvent_(a.event_id);
    if (!ev || ev.status === 'cancelled') throw new Error('งานนี้ถูกยกเลิกแล้ว');
    if (kind === 'submit' && a.status === STATUS.DONE) throw new Error('งานนี้ทีมยุทธ์ยืนยันเสร็จสิ้นแล้ว');

    const saved = files.map(function (f) { return saveUpload_(a, ev, f); });
    const sub = {
      sub_id: newId_('SB'), asg_id: a.asg_id, group_id: a.group_id, kind: kind, channel: channel,
      channel_detail: clip_(b.channel_detail, 500), link: link, files: JSON.stringify(saved), reporter: reporter,
      note: clip_(b.note, 1000), created_at: nowStr_(), review: kind === 'submit' ? 'pending' : '', reviewer: '', review_note: '', reviewed_at: ''
    };
    insert_('Submissions', sub);
    let status = a.status;
    if (kind === 'submit') status = STATUS.SENT;
    else if (status === STATUS.TODO || status === STATUS.POSTPONE) status = STATUS.DOING;
    a.status = status;
    a.updated_at = nowStr_();
    a.updated_by = 'กลุ่มงาน: ' + reporter;
    update_('Assignments', a);
    log_('กลุ่มงาน ' + a.group_id + ' (' + reporter + ')', kind === 'submit' ? 'แจ้งส่งงาน' : 'แนบงาน', a.asg_id + ' ' + ev.title + ' · ' + CHANNELS[channel]);
    if (kind === 'submit') notice = { a: a, ev: ev, sub: sub };
    return { sub_id: sub.sub_id, status: status, files: saved.length };
  });
  if (notice && String(setting_('NOTIFY_ADMIN_ON_SUBMIT')) === '1') {
    try { notifyAdminSubmit_(notice.a, notice.ev, notice.sub); } catch (err) { log_('system', 'line-error', String(err)); }
  }
  return result;
}

function saveUpload_(a, ev, f) {
  const name = clip_(f.name, 150).replace(/[\\/:*?"<>|]/g, '_') || 'file';
  const blob = Utilities.newBlob(Utilities.base64Decode(String(f.data || '')), String(f.mime || 'application/octet-stream'), today_() + ' ' + name);
  const folder = groupFolder_(a.group_id);
  const file = folder.createFile(blob);
  return { name: name, id: file.getId(), url: file.getUrl(), size: blob.getBytes().length };
}

function groupFolder_(gid) {
  const rootId = setting_('DRIVE_FOLDER_ID');
  if (!rootId) throw new Error('ยังไม่ได้ตั้งค่าโฟลเดอร์เก็บไฟล์ (รัน setup ใหม่)');
  const root = DriveApp.getFolderById(String(rootId));
  const g = findGroup_(gid);
  const name = gid + ' ' + (g ? g.name : '');
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/* ====================================================================== */
/* Admin (ฝั่งยุทธ์)                                                        */
/* ====================================================================== */

function adminLogin_(b) {
  const username = String(b.username || '').trim().toLowerCase();
  checkLocked_('login', username);
  const u = table_('Users').filter(function (x) { return String(x.username).toLowerCase() === username && truthy_(x.active); })[0];
  if (!u || hash_(String(b.password || ''), u.salt) !== u.pass_hash) {
    const left = registerFail_('login', username);
    throw new Error(left > 0 ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบผิดเกินกำหนด พักการเข้าสู่ระบบ 15 นาที');
  }
  clearFail_('login', username);
  const exp = Date.now() + 12 * 3600000;
  log_(u.username, 'เข้าสู่ระบบ', '');
  return { token: sign_({ k: 'a', u: u.username, exp: exp }), exp: exp, username: u.username, name: u.name };
}

function verifyAdmin_(token) {
  const t = unsign_(token);
  if (!t || t.k !== 'a') throw new Error('AUTH_REQUIRED');
  const u = table_('Users').filter(function (x) { return x.username === t.u && truthy_(x.active); })[0];
  if (!u) throw new Error('AUTH_REQUIRED');
  return u;
}

function adminBoot_(u) {
  const subs = table_('Submissions').map(function (s) {
    const o = strip_(s);
    o.files = parseFiles_(s.files);
    o.channel_label = CHANNELS[s.channel] || s.channel;
    return o;
  });
  const log = table_('NotifyLog').slice(-150).reverse().map(strip_);
  return {
    me: { username: u.username, name: u.name },
    today: today_(),
    groups: table_('Groups').slice().sort(byOrder_).map(function (g) {
      return { id: g.group_id, name: g.name, coordinator: g.coordinator, order: g.order, active: truthy_(g.active), has_pin: !!g.pin_hash, pin_updated: String(g.pin_updated || '') };
    }),
    events: table_('Events').map(pubEvent_),
    assignments: table_('Assignments').map(function (a) { const o = pubAsg_(a); o.updated_by = a.updated_by; return o; }),
    submissions: subs,
    targets: table_('LineTargets').map(strip_),
    notifyLog: log,
    settings: table_('Settings').map(strip_),
    users: table_('Users').map(function (x) { return { username: x.username, name: x.name, active: truthy_(x.active) }; }),
    types: TYPES, channels: CHANNELS, statuses: STATUS_LIST,
    lineReady: !!lineToken_(),
    hookReady: !!PropertiesService.getScriptProperties().getProperty('HOOK_SECRET')
  };
}

function adminSaveEvent_(u, b) {
  const e = b.event || {};
  const title = clip_(e.title, 300);
  if (!title) throw new Error('กรุณากรอกชื่องาน');
  if (!TYPES[e.type]) throw new Error('ประเภทงานไม่ถูกต้อง');
  if (!isDate_(e.start)) throw new Error('วันเริ่มไม่ถูกต้อง');
  const end = e.end && isDate_(e.end) ? e.end : e.start;
  if (end < e.start) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  const visibility = e.visibility === 'admin' ? 'admin' : 'all';
  const list = Array.isArray(b.assignments) ? b.assignments : [];
  const seen = {};
  list.forEach(function (x) {
    if (!findGroup_(x.group_id)) throw new Error('ไม่พบกลุ่มงาน ' + x.group_id);
    if (seen[x.group_id]) throw new Error('กลุ่มงาน ' + findGroup_(x.group_id).name + ' ซ้ำในงานเดียวกัน');
    seen[x.group_id] = true;
    if (!clip_(x.task, 500)) throw new Error('กรุณากรอกสิ่งที่ต้องทำของกลุ่ม ' + findGroup_(x.group_id).name);
    if (!isDate_(x.due)) throw new Error('กำหนดส่งของกลุ่ม ' + findGroup_(x.group_id).name + ' ไม่ถูกต้อง');
    if (x.status && STATUS_LIST.indexOf(x.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  });

  const fresh = [];
  const res = withLock_(function () {
    let ev = e.id ? findEvent_(e.id) : null;
    const now = nowStr_();
    if (e.id && !ev) throw new Error('ไม่พบงานที่จะแก้ไข');
    const rec = {
      event_id: ev ? ev.event_id : newId_('EV'), title: title, type: e.type, start: e.start, end: end,
      place: clip_(e.place, 300), detail: clip_(e.detail, 2000), link: clip_(e.link, 1000), visibility: visibility,
      status: e.status === 'cancelled' ? 'cancelled' : 'active',
      created_at: ev ? ev.created_at : now, created_by: ev ? ev.created_by : u.username, updated_at: now
    };
    if (ev) { rec._row = ev._row; update_('Events', rec); } else insert_('Events', rec);

    const existing = table_('Assignments').filter(function (a) { return a.event_id === rec.event_id; });
    const byGroup = {};
    existing.forEach(function (a) { byGroup[a.group_id] = a; });
    list.forEach(function (x) {
      const old = byGroup[x.group_id];
      const data = { role: x.role === 'ร่วม' ? 'ร่วม' : 'หลัก', task: clip_(x.task, 500), due: x.due };
      if (old) {
        const changed = old.role !== data.role || old.task !== data.task || old.due !== data.due || (x.status && x.status !== old.status);
        if (changed) {
          old.role = data.role; old.task = data.task; old.due = data.due;
          if (x.status) old.status = x.status;
          old.updated_at = now; old.updated_by = u.username;
          update_('Assignments', old);
        }
        delete byGroup[x.group_id];
      } else {
        const a = { asg_id: newId_('AS'), event_id: rec.event_id, group_id: x.group_id, role: data.role, task: data.task, due: data.due, status: x.status || STATUS.TODO, updated_at: now, updated_by: u.username, note: '' };
        insert_('Assignments', a);
        fresh.push(a);
      }
    });
    const removed = Object.keys(byGroup).map(function (k) { return byGroup[k]; }).sort(function (p, q) { return q._row - p._row; });
    removed.forEach(function (a) { remove_('Assignments', a); });
    log_(u.username, ev ? 'แก้ไขงาน' : 'สร้างงาน', rec.event_id + ' ' + title + ' (' + list.length + ' กลุ่ม)');
    return { event_id: rec.event_id, added: fresh.length, removed: removed.length, event: rec };
  });
  let notified = 0;
  if (b.notify && res.event.status === 'active' && res.event.visibility === 'all' && fresh.length) {
    notified = notifyNewAssignments_(res.event, fresh);
  }
  return { event_id: res.event_id, added: res.added, removed: res.removed, notified: notified };
}

function adminSetEventStatus_(u, b) {
  return withLock_(function () {
    const ev = findEvent_(b.event_id);
    if (!ev) throw new Error('ไม่พบงาน');
    ev.status = b.status === 'cancelled' ? 'cancelled' : 'active';
    ev.updated_at = nowStr_();
    update_('Events', ev);
    log_(u.username, ev.status === 'cancelled' ? 'ยกเลิกงาน' : 'เปิดงานอีกครั้ง', ev.event_id + ' ' + ev.title);
    return { event_id: ev.event_id, status: ev.status };
  });
}

function adminSetStatus_(u, b) {
  const ids = Array.isArray(b.asg_ids) ? b.asg_ids.map(String) : [];
  if (!ids.length) throw new Error('ยังไม่ได้เลือกรายการ');
  if (STATUS_LIST.indexOf(b.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  return withLock_(function () {
    let n = 0;
    table_('Assignments').forEach(function (a) {
      if (ids.indexOf(a.asg_id) < 0) return;
      a.status = b.status;
      if (b.note !== undefined) a.note = clip_(b.note, 500);
      if (b.due && isDate_(b.due)) a.due = b.due;
      a.updated_at = nowStr_();
      a.updated_by = u.username;
      update_('Assignments', a);
      n++;
    });
    log_(u.username, 'ปรับสถานะ', n + ' รายการ → ' + b.status);
    return { updated: n };
  });
}

function adminReview_(u, b) {
  const decision = b.decision === 'return' ? 'return' : 'approve';
  const note = clip_(b.note, 1000);
  if (decision === 'return' && !note) throw new Error('กรุณาระบุเหตุผลที่ส่งกลับแก้ไข');
  let notice = null;
  const res = withLock_(function () {
    const s = table_('Submissions').filter(function (x) { return x.sub_id === String(b.sub_id || ''); })[0];
    if (!s) throw new Error('ไม่พบรายการแจ้งส่ง');
    const a = table_('Assignments').filter(function (x) { return x.asg_id === s.asg_id; })[0];
    s.review = decision === 'approve' ? 'approved' : 'returned';
    s.reviewer = u.username;
    s.review_note = note;
    s.reviewed_at = nowStr_();
    update_('Submissions', s);
    if (a) {
      a.status = decision === 'approve' ? STATUS.DONE : STATUS.RETURN;
      if (decision === 'return') a.note = note;
      a.updated_at = nowStr_();
      a.updated_by = u.username;
      update_('Assignments', a);
      if (decision === 'return') notice = { a: a, ev: findEvent_(a.event_id), note: note };
    }
    log_(u.username, decision === 'approve' ? 'ตรวจผ่าน' : 'ส่งกลับแก้ไข', s.sub_id + ' ' + s.asg_id);
    return { sub_id: s.sub_id, review: s.review, status: a ? a.status : '' };
  });
  if (notice && notice.ev) {
    try { notifyReturn_(notice.a, notice.ev, notice.note); } catch (err) { log_('system', 'line-error', String(err)); }
  }
  return res;
}

function adminSaveGroup_(u, b) {
  const x = b.group || {};
  return withLock_(function () {
    let g = findGroup_(x.id);
    const isNew = !g;
    if (isNew) {
      const id = String(x.id || '').trim().toLowerCase();
      if (!/^[a-z0-9_]{2,20}$/.test(id) || id === ADMIN_GROUP) throw new Error('รหัสกลุ่มงานใช้ a-z 0-9 _ ยาว 2–20 ตัว');
      g = { group_id: id, pin_hash: '', pin_salt: '', pin_updated: '' };
    }
    g.name = clip_(x.name, 120) || g.name;
    if (!g.name) throw new Error('กรุณากรอกชื่อกลุ่มงาน');
    g.coordinator = clip_(x.coordinator, 200);
    g.order = Number(x.order) || g.order || table_('Groups').length + 1;
    g.active = x.active === false ? 'FALSE' : 'TRUE';
    if (isNew) insert_('Groups', g); else update_('Groups', g);
    log_(u.username, isNew ? 'เพิ่มกลุ่มงาน' : 'แก้ไขกลุ่มงาน', g.group_id + ' ' + g.name);
    return { id: g.group_id };
  });
}

function adminSetPin_(u, b) {
  let pin = String(b.pin || '').trim();
  if (!pin) pin = randomPin_();
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');
  return withLock_(function () {
    const g = findGroup_(b.group_id);
    if (!g) throw new Error('ไม่พบกลุ่มงาน');
    setGroupPin_(g, pin);
    log_(u.username, 'ตั้ง PIN ใหม่', g.group_id);
    return { group_id: g.group_id, pin: pin };
  });
}

function adminBindLine_(u, b) {
  return withLock_(function () {
    const t = table_('LineTargets').filter(function (x) { return x.target_id === String(b.target_id || ''); })[0];
    if (!t) throw new Error('ไม่พบปลายทาง LINE');
    const gid = String(b.group_id || '');
    if (gid && gid !== ADMIN_GROUP && !findGroup_(gid)) throw new Error('ไม่พบกลุ่มงาน');
    t.group_id = gid;
    t.bound_at = gid ? nowStr_() : '';
    if (b.active !== undefined) t.active = b.active ? 'TRUE' : 'FALSE';
    update_('LineTargets', t);
    log_(u.username, gid ? 'ผูก LINE' : 'ยกเลิกผูก LINE', t.target_id + ' → ' + (gid || '-'));
    return { target_id: t.target_id, group_id: gid };
  });
}

function adminSendDigest_(u, b) {
  const r = runDaily_(true, b.group_id ? String(b.group_id) : null);
  log_(u.username, 'ส่งสรุปทาง LINE ทันที', JSON.stringify(r));
  return r;
}

function adminLineQuota_() {
  const q = lineApi_('/v2/bot/message/quota');
  const c = lineApi_('/v2/bot/message/quota/consumption');
  return { ok: q.ok && c.ok, limit: q.body && q.body.value, type: q.body && q.body.type, used: c.body && c.body.totalUsage, error: q.error || c.error };
}

function adminSaveSettings_(u, b) {
  const s = b.settings || {};
  const allowed = DEFAULT_SETTINGS.map(function (x) { return x[0]; });
  return withLock_(function () {
    table_('Settings').forEach(function (r) {
      if (allowed.indexOf(r.key) >= 0 && s[r.key] !== undefined) { r.value = clip_(s[r.key], 500); update_('Settings', r); }
    });
    log_(u.username, 'บันทึกการตั้งค่า', Object.keys(s).join(','));
    return { saved: true };
  });
}

function adminChangePassword_(u, b) {
  if (hash_(String(b.old_password || ''), u.salt) !== u.pass_hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  const pw = String(b.new_password || '');
  if (pw.length < 8) throw new Error('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร');
  return withLock_(function () {
    const salt = Utilities.getUuid();
    u.salt = salt; u.pass_hash = hash_(pw, salt);
    update_('Users', u);
    log_(u.username, 'เปลี่ยนรหัสผ่าน', '');
    return { saved: true };
  });
}

function adminSaveUser_(u, b) {
  const x = b.user || {};
  const username = String(x.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('ชื่อผู้ใช้ใช้ a-z 0-9 . _ - ยาว 3–30 ตัว');
  return withLock_(function () {
    let rec = table_('Users').filter(function (r) { return r.username === username; })[0];
    const isNew = !rec;
    if (isNew) {
      if (String(x.password || '').length < 8) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
      rec = { username: username };
    }
    if (username === u.username && x.active === false) throw new Error('ปิดบัญชีของตนเองไม่ได้');
    rec.name = clip_(x.name, 120) || rec.name || username;
    rec.active = x.active === false ? 'FALSE' : 'TRUE';
    if (x.password) {
      if (String(x.password).length < 8) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
      rec.salt = Utilities.getUuid(); rec.pass_hash = hash_(String(x.password), rec.salt);
    }
    if (isNew) insert_('Users', rec); else update_('Users', rec);
    log_(u.username, isNew ? 'เพิ่มผู้ดูแล' : 'แก้ไขผู้ดูแล', username);
    return { username: username };
  });
}

/* ====================================================================== */
/* LINE OA                                                                */
/* ====================================================================== */

function lineToken_() { return PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || ''; }

function lineApi_(path, payload) {
  const tok = lineToken_();
  if (!tok) return { ok: false, code: 0, body: {}, error: 'ยังไม่ได้ตั้งค่า LINE_TOKEN' };
  const opt = { method: payload ? 'post' : 'get', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true };
  if (payload) opt.payload = JSON.stringify(payload);
  const r = UrlFetchApp.fetch('https://api.line.me' + path, opt);
  const code = r.getResponseCode();
  let body = {};
  try { body = JSON.parse(r.getContentText() || '{}'); } catch (e) { body = {}; }
  return { ok: code >= 200 && code < 300, code: code, body: body, error: code >= 300 ? (body.message || 'HTTP ' + code) : '' };
}

function push_(to, messages, groupId, kind) {
  const r = lineApi_('/v2/bot/message/push', { to: to, messages: messages });
  insert_('NotifyLog', { ts: nowStr_(), target_id: to, group_id: groupId, kind: kind, msgs: messages.length, ok: r.ok ? 'TRUE' : 'FALSE', error: r.error });
  return r.ok;
}

function reply_(token, messages) {
  if (!token) return;
  lineApi_('/v2/bot/message/reply', { replyToken: token, messages: messages });
}

function targetsOf_(gid) {
  return table_('LineTargets').filter(function (t) { return t.group_id === gid && truthy_(t.active); });
}

function handleLineWebhook_(hook, body) {
  const secret = PropertiesService.getScriptProperties().getProperty('HOOK_SECRET');
  if (!secret || hook !== secret) return json_({ ok: false });
  (body.events || []).forEach(function (ev) {
    try { handleLineEvent_(ev); } catch (err) { log_('line', 'error', String((err && err.message) || err)); }
  });
  return json_({ ok: true });
}

function handleLineEvent_(ev) {
  const src = ev.source || {};
  const tid = src.groupId || src.roomId || src.userId;
  const type = src.groupId ? 'group' : src.roomId ? 'room' : 'user';
  if (!tid) return;
  if (ev.type === 'join' || ev.type === 'follow') {
    withLock_(function () { upsertTarget_(tid, type, true); });
    reply_(ev.replyToken, [textMsg_(helpText_())]);
    return;
  }
  if (ev.type === 'leave' || ev.type === 'unfollow') {
    withLock_(function () { const t = findTarget_(tid); if (t) { t.active = 'FALSE'; update_('LineTargets', t); } });
    return;
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const text = String(ev.message.text || '').trim().replace(/^[\/#]/, '');
  const cmd = text.split(/\s+/);
  const word = cmd[0];
  const known = ['ลงทะเบียน', 'งานของฉัน', 'สัปดาห์นี้', 'ปฏิทิน', 'ยกเลิกลงทะเบียน', 'ช่วยเหลือ', 'help'];
  if (known.indexOf(word) < 0) return; // ไม่ตอบข้อความสนทนาทั่วไปในกลุ่ม
  const t = withLock_(function () { return upsertTarget_(tid, type, false); });

  if (word === 'ช่วยเหลือ' || word === 'help') { reply_(ev.replyToken, [textMsg_(helpText_())]); return; }
  if (word === 'ปฏิทิน') { reply_(ev.replyToken, [textMsg_(webUrl_() ? 'เปิดปฏิทินระบบงาน: ' + webUrl_() : 'ยังไม่ได้ตั้งค่าลิงก์หน้าเว็บ (WEB_URL)')]); return; }

  if (word === 'ลงทะเบียน') {
    const code = String(cmd[1] || '').toLowerCase();
    const pin = String(cmd[2] || '');
    const g = findGroup_(code) || table_('Groups').filter(function (x) { return x.name === cmd[1]; })[0];
    if (!g || !truthy_(g.active)) { reply_(ev.replyToken, [textMsg_('ไม่พบรหัสกลุ่มงาน\nพิมพ์: ลงทะเบียน <รหัสกลุ่ม> <PIN 4 หลัก>\nเช่น ลงทะเบียน ncd 1234\n\n' + groupCodesText_())]); return; }
    try { checkLocked_('pin', g.group_id); } catch (err) { reply_(ev.replyToken, [textMsg_(err.message)]); return; }
    if (!g.pin_hash || hash_(pin, g.pin_salt) !== g.pin_hash) {
      const left = registerFail_('pin', g.group_id);
      reply_(ev.replyToken, [textMsg_(left > 0 ? 'PIN ไม่ถูกต้อง (ลองได้อีก ' + left + ' ครั้ง)' : 'PIN ไม่ถูกต้องเกินกำหนด พักการยืนยัน 15 นาที')]);
      return;
    }
    clearFail_('pin', g.group_id);
    withLock_(function () { t.group_id = g.group_id; t.bound_at = nowStr_(); t.active = 'TRUE'; update_('LineTargets', t); });
    log_('line', 'ลงทะเบียน LINE', tid + ' → ' + g.group_id);
    reply_(ev.replyToken, [textMsg_('ลงทะเบียนสำเร็จ: ' + (type === 'user' ? 'บัญชีนี้' : 'กลุ่มนี้') + ' จะได้รับแจ้งเตือนงานของกลุ่มงาน' + g.name + '\nพิมพ์ "งานของฉัน" เพื่อดูงานที่ยังไม่เสร็จ')]);
    return;
  }
  if (word === 'ยกเลิกลงทะเบียน') {
    withLock_(function () { t.group_id = ''; t.bound_at = ''; update_('LineTargets', t); });
    reply_(ev.replyToken, [textMsg_('ยกเลิกการรับแจ้งเตือนแล้ว')]);
    return;
  }
  if (!t.group_id || t.group_id === ADMIN_GROUP) {
    reply_(ev.replyToken, [textMsg_(t.group_id === ADMIN_GROUP ? 'ปลายทางนี้ผูกกับทีมยุทธ์ ใช้หน้าเว็บฝั่งยุทธ์เพื่อดูงานทั้งหมด' : 'ยังไม่ได้ลงทะเบียนกลุ่มงาน\nพิมพ์: ลงทะเบียน <รหัสกลุ่ม> <PIN 4 หลัก>\n\n' + groupCodesText_())]);
    return;
  }
  const g = findGroup_(t.group_id);
  const items = openItems_(t.group_id);
  const today = today_();
  if (word === 'งานของฉัน') {
    reply_(ev.replyToken, [taskCard_('งานที่ยังไม่เสร็จ · กลุ่มงาน' + g.name, 'งานของฉัน', items, today, t.group_id)]);
  } else {
    const week = items.filter(function (x) { return diffDays_(today, x.a.due) <= 7; });
    reply_(ev.replyToken, [taskCard_('งานภายใน 7 วัน · กลุ่มงาน' + g.name, 'สัปดาห์นี้', week, today, t.group_id)]);
  }
}

function upsertTarget_(tid, type, activate) {
  let t = findTarget_(tid);
  if (!t) {
    let display = '';
    try {
      if (type === 'group') { const r = lineApi_('/v2/bot/group/' + tid + '/summary'); display = (r.body && r.body.groupName) || ''; }
      else if (type === 'user') { const r = lineApi_('/v2/bot/profile/' + tid); display = (r.body && r.body.displayName) || ''; }
    } catch (e) { display = ''; }
    t = { target_id: tid, type: type, group_id: '', display: display || (type === 'group' ? 'กลุ่ม LINE' : 'ผู้ใช้ LINE'), bound_at: '', active: 'TRUE' };
    insert_('LineTargets', t);
    t = findTarget_(tid);
    log_('line', 'พบปลายทางใหม่', type + ' ' + tid);
  } else if (activate && !truthy_(t.active)) {
    t.active = 'TRUE';
    update_('LineTargets', t);
  }
  return t;
}

function findTarget_(tid) { return table_('LineTargets').filter(function (x) { return x.target_id === tid; })[0]; }

function helpText_() {
  return 'ปฏิทินระบบงาน กลุ่มงานพัฒนายุทธศาสตร์สาธารณสุข\n\n' +
    'ลงทะเบียนรับแจ้งเตือน: ลงทะเบียน <รหัสกลุ่ม> <PIN 4 หลัก>\nเช่น ลงทะเบียน ncd 1234\n\n' +
    'คำสั่ง\n• งานของฉัน\n• สัปดาห์นี้\n• ปฏิทิน\n• ยกเลิกลงทะเบียน\n\n' + groupCodesText_();
}
function groupCodesText_() {
  return 'รหัสกลุ่มงาน\n' + activeGroups_().map(function (g) { return g.group_id + ' = ' + g.name; }).join('\n');
}
function textMsg_(t) { return { type: 'text', text: String(t).slice(0, 4900) }; }

function openItems_(gid) {
  const evMap = activeEventMap_(false);
  return table_('Assignments').filter(function (a) {
    return a.group_id === gid && evMap[a.event_id] && [STATUS.DONE, STATUS.CANCEL, STATUS.SENT].indexOf(a.status) < 0;
  }).map(function (a) { return { a: a, ev: evMap[a.event_id] }; }).sort(function (p, q) { return p.a.due < q.a.due ? -1 : p.a.due > q.a.due ? 1 : 0; });
}

function activeEventMap_(includeAdminOnly) {
  const m = {};
  table_('Events').forEach(function (e) { if (e.status !== 'cancelled' && (includeAdminOnly || e.visibility !== 'admin')) m[e.event_id] = e; });
  return m;
}

function webUrl_() {
  const u = String(setting_('WEB_URL') || '').trim();
  return /^https:\/\//.test(u) ? u.replace(/\/?$/, '/') : '';
}

function dueLabel_(today, due) {
  const d = diffDays_(today, due);
  if (d < 0) return 'เกินกำหนด ' + (-d) + ' วัน';
  if (d === 0) return 'ครบกำหนดวันนี้';
  return 'อีก ' + d + ' วัน';
}

function taskRows_(items, today, max) {
  const rows = [];
  items.slice(0, max).forEach(function (x) {
    const over = diffDays_(today, x.a.due) < 0;
    rows.push({
      type: 'box', layout: 'vertical', margin: 'md', contents: [
        { type: 'text', text: x.ev.title, size: 'sm', weight: 'bold', wrap: true, color: '#1F2933' },
        { type: 'text', text: x.a.task + ' (' + x.a.role + ')', size: 'xs', wrap: true, color: '#4A5560' },
        { type: 'text', text: 'ส่ง ' + thDate_(x.a.due) + ' · ' + dueLabel_(today, x.a.due) + (x.a.status === STATUS.RETURN ? ' · ส่งกลับแก้ไข' : ''), size: 'xs', wrap: true, color: over ? '#37474F' : '#1A5276', weight: over ? 'bold' : 'regular' }
      ]
    });
  });
  if (items.length > max) rows.push({ type: 'text', text: 'และอีก ' + (items.length - max) + ' รายการ', size: 'xs', color: '#5B6670', margin: 'md' });
  return rows;
}

function card_(alt, subtitle, title, rows, buttons, color) {
  const bubble = {
    type: 'bubble',
    header: { type: 'box', layout: 'vertical', backgroundColor: color || '#1A5276', contents: [
      { type: 'text', text: subtitle, size: 'xs', color: '#D6E6F2' },
      { type: 'text', text: title, size: 'md', weight: 'bold', color: '#FFFFFF', wrap: true }
    ] },
    body: { type: 'box', layout: 'vertical', contents: rows.length ? rows : [{ type: 'text', text: 'ไม่มีรายการ', size: 'sm', color: '#5B6670' }] }
  };
  if (buttons && buttons.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons };
  return { type: 'flex', altText: String(alt).slice(0, 380), contents: bubble };
}

function uriButton_(label, uri, primary) {
  return { type: 'button', style: primary ? 'primary' : 'link', color: primary ? '#1E8449' : '#1A5276', height: 'sm', action: { type: 'uri', label: label, uri: uri } };
}

function summaryButtons_(gid) {
  const u = webUrl_();
  return u ? [uriButton_('เปิดหน้าสรุปงานของกลุ่ม', u + '#summary/' + gid, true)] : [];
}

function taskCard_(title, subtitle, items, today, gid) {
  return card_(title + ' (' + items.length + ' รายการ)', subtitle, title, taskRows_(items, today, 8), summaryButtons_(gid));
}

/** ส่งแจ้งเตือนประจำวัน — ตั้ง trigger ด้วย installTriggers() */
function dailyJob() {
  __db = {};
  const r = runDaily_(false, null);
  Logger.log(JSON.stringify(r));
}

function runDaily_(force, onlyGroup) {
  const today = today_();
  const weekday = Number(Utilities.formatDate(new Date(), TZ, 'u'));
  const digest = force || weekday === Number(setting_('DIGEST_WEEKDAY') || 1);
  const remind = String(setting_('REMINDER_DAYS') || '7,3,1').split(',').map(function (x) { return Number(String(x).trim()); }).filter(function (x) { return x > 0; });
  const sentToday = {};
  if (!force) table_('NotifyLog').forEach(function (l) { if (String(l.ts).indexOf(today) === 0 && l.kind === 'daily') sentToday[l.target_id] = true; });

  const out = { date: today, digest: digest, groups: 0, pushes: 0, failed: 0 };
  activeGroups_().forEach(function (g) {
    if (onlyGroup && g.group_id !== onlyGroup) return;
    const targets = targetsOf_(g.group_id).filter(function (t) { return !sentToday[t.target_id]; });
    if (!targets.length) return;
    const items = openItems_(g.group_id);
    const overdue = items.filter(function (x) { return diffDays_(today, x.a.due) < 0; });
    let pick;
    if (digest) {
      pick = items.filter(function (x) { return diffDays_(today, x.a.due) <= 7; });
    } else {
      pick = items.filter(function (x) {
        const d = diffDays_(today, x.a.due);
        return d === 0 || d === -1 || remind.indexOf(d) >= 0;
      });
    }
    if (!pick.length) return;
    const title = (digest ? 'สรุปงานประจำสัปดาห์' : 'แจ้งเตือนกำหนดส่ง') + ' · กลุ่มงาน' + g.name;
    const sub = digest ? 'เกินกำหนด ' + overdue.length + ' · ภายใน 7 วัน ' + (pick.length - overdue.length) + ' รายการ' : thDate_(today);
    const msg = card_(title, sub, title, taskRows_(pick, today, 8), summaryButtons_(g.group_id), digest ? '#1A5276' : '#1F4D78');
    out.groups++;
    targets.forEach(function (t) { if (push_(t.target_id, [msg], g.group_id, 'daily')) out.pushes++; else out.failed++; });
  });

  if (digest && !onlyGroup) {
    const admins = targetsOf_(ADMIN_GROUP).filter(function (t) { return !sentToday[t.target_id]; });
    if (admins.length) {
      const evMap = activeEventMap_(true);
      const pending = table_('Submissions').filter(function (s) { return s.review === 'pending'; }).length;
      const over = {};
      table_('Assignments').forEach(function (a) {
        if (!evMap[a.event_id] || [STATUS.DONE, STATUS.CANCEL, STATUS.SENT].indexOf(a.status) >= 0) return;
        if (diffDays_(today, a.due) < 0) over[a.group_id] = (over[a.group_id] || 0) + 1;
      });
      const rows = [{ type: 'text', text: 'รอตรวจ ' + pending + ' รายการ', size: 'sm', weight: 'bold', color: '#1E8449' }];
      Object.keys(over).forEach(function (gid) {
        const gg = findGroup_(gid);
        rows.push({ type: 'text', text: (gg ? gg.name : gid) + ': เกินกำหนด ' + over[gid] + ' รายการ', size: 'xs', color: '#37474F', wrap: true });
      });
      if (!Object.keys(over).length) rows.push({ type: 'text', text: 'ไม่มีงานเกินกำหนด', size: 'xs', color: '#4A5560' });
      const u = webUrl_();
      const msg = card_('สรุปสำหรับทีมยุทธ์: รอตรวจ ' + pending + ' รายการ', 'สรุปประจำสัปดาห์', 'ภาพรวมสำหรับทีมยุทธ์', rows, u ? [uriButton_('เปิดหน้าฝั่งยุทธ์', u + 'admin.html', true)] : []);
      admins.forEach(function (t) { if (push_(t.target_id, [msg], ADMIN_GROUP, 'daily')) out.pushes++; else out.failed++; });
    }
  }
  return out;
}

function notifyNewAssignments_(ev, list) {
  let n = 0;
  const byGroup = {};
  list.forEach(function (a) { (byGroup[a.group_id] = byGroup[a.group_id] || []).push(a); });
  const today = today_();
  const u = webUrl_();
  Object.keys(byGroup).forEach(function (gid) {
    const targets = targetsOf_(gid);
    if (!targets.length) return;
    const g = findGroup_(gid);
    const items = byGroup[gid].map(function (a) { return { a: a, ev: ev }; });
    const btn = u ? [uriButton_('ดูรายละเอียด / แจ้งส่งงาน', u + '#task/' + items[0].a.asg_id, true)] : [];
    const msg = card_('งานใหม่สำหรับกลุ่มงาน' + g.name + ': ' + ev.title, 'มอบหมายงานใหม่', 'กลุ่มงาน' + g.name, taskRows_(items, today, 5), btn);
    targets.forEach(function (t) { if (push_(t.target_id, [msg], gid, 'new')) n++; });
  });
  return n;
}

function notifyReturn_(a, ev, note) {
  const targets = targetsOf_(a.group_id);
  if (!targets.length) return 0;
  const u = webUrl_();
  const rows = [
    { type: 'text', text: ev.title, size: 'sm', weight: 'bold', wrap: true },
    { type: 'text', text: a.task, size: 'xs', wrap: true, color: '#4A5560' },
    { type: 'text', text: 'เหตุผล: ' + note, size: 'sm', wrap: true, color: '#7A3A00', margin: 'md' },
    { type: 'text', text: 'กำหนดส่ง ' + thDate_(a.due), size: 'xs', color: '#1A5276' }
  ];
  const btn = u ? [uriButton_('แก้ไขและแจ้งส่งอีกครั้ง', u + '#task/' + a.asg_id, true)] : [];
  const msg = card_('ส่งกลับแก้ไข: ' + ev.title, 'ทีมยุทธ์ส่งกลับแก้ไข', 'กรุณาปรับแก้งาน', rows, btn, '#7A3A00');
  let n = 0;
  targets.forEach(function (t) { if (push_(t.target_id, [msg], a.group_id, 'return')) n++; });
  return n;
}

function notifyAdminSubmit_(a, ev, sub) {
  const targets = targetsOf_(ADMIN_GROUP);
  if (!targets.length) return 0;
  const g = findGroup_(a.group_id);
  const u = webUrl_();
  const rows = [
    { type: 'text', text: ev.title, size: 'sm', weight: 'bold', wrap: true },
    { type: 'text', text: 'กลุ่มงาน' + (g ? g.name : a.group_id) + ' · ' + a.task, size: 'xs', wrap: true, color: '#4A5560' },
    { type: 'text', text: 'ช่องทาง: ' + CHANNELS[sub.channel] + (sub.channel_detail ? ' (' + sub.channel_detail + ')' : ''), size: 'xs', wrap: true, color: '#1F2933', margin: 'md' },
    { type: 'text', text: 'ผู้แจ้ง: ' + sub.reporter, size: 'xs', color: '#1F2933' }
  ];
  const msg = card_('มีการแจ้งส่งงาน: ' + ev.title, 'แจ้งส่งงาน รอตรวจ', 'กลุ่มงาน' + (g ? g.name : a.group_id), rows, u ? [uriButton_('เปิดคิวรอตรวจ', u + 'admin.html#queue', true)] : [], '#1E8449');
  let n = 0;
  targets.forEach(function (t) { if (push_(t.target_id, [msg], ADMIN_GROUP, 'submit')) n++; });
  return n;
}

/* ====================================================================== */
/* Setup & maintenance (รันจาก Editor)                                     */
/* ====================================================================== */

function setup() {
  __db = {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const head = SCHEMA[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#2E74B5').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(function (c) {
      const col = head.indexOf(c) + 1;
      if (col > 0) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
  if (!table_('Groups').length) {
    DEFAULT_GROUPS.forEach(function (g, i) { insert_('Groups', { group_id: g[0], name: g[1], coordinator: '', order: i + 1, active: 'TRUE', pin_hash: '', pin_salt: '', pin_updated: '' }); });
  }
  const have = {};
  table_('Settings').forEach(function (s) { have[s.key] = true; });
  DEFAULT_SETTINGS.forEach(function (s) { if (!have[s[0]]) insert_('Settings', { key: s[0], value: s[1], note: s[2] }); });
  const pr = PropertiesService.getScriptProperties();
  if (!pr.getProperty('TOKEN_SECRET')) pr.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!pr.getProperty('HOOK_SECRET')) pr.setProperty('HOOK_SECRET', Utilities.getUuid().replace(/-/g, ''));
  if (!setting_('DRIVE_FOLDER_ID')) {
    const f = DriveApp.createFolder('ปฏิทินระบบงาน_ไฟล์แนบ');
    setSetting_('DRIVE_FOLDER_ID', f.getId());
  }
  Logger.log('setup เสร็จแล้ว · ขั้นต่อไป: แก้ชื่อผู้ใช้/รหัสผ่านใน createFirstAdmin() แล้วรัน');
}

/** แก้ 3 ค่าในฟังก์ชันนี้ รันครั้งเดียว แล้วลบรหัสผ่านออกจากโค้ด */
function createFirstAdmin() {
  const USERNAME = 'admin';
  const PASSWORD = 'เปลี่ยนรหัสผ่านนี้ก่อนรัน';
  const NAME = 'ผู้ดูแลระบบ กลุ่มงานพัฒนายุทธศาสตร์';
  if (PASSWORD.length < 8 || PASSWORD === 'เปลี่ยนรหัสผ่านนี้ก่อนรัน') throw new Error('กรุณาแก้ PASSWORD ในฟังก์ชันก่อนรัน');
  __db = {};
  createUser_(USERNAME, PASSWORD, NAME);
  Logger.log('สร้างผู้ดูแล ' + USERNAME + ' แล้ว — ลบรหัสผ่านออกจากโค้ดได้เลย');
}

/** สร้าง PIN ใหม่ให้ทุกกลุ่ม (PIN เดิมและเครื่องที่จำ PIN ไว้จะใช้ไม่ได้) */
function generateAllPins() {
  __db = {};
  const lines = [];
  withLock_(function () {
    activeGroups_().forEach(function (g) { const pin = randomPin_(); setGroupPin_(g, pin); lines.push(g.group_id + '\t' + g.name + '\tPIN ' + pin); });
  });
  Logger.log('PIN ของแต่ละกลุ่มงาน (แจ้งผู้ประสานงานหลักแบบรายบุคคล)\n' + lines.join('\n'));
}

/** แสดง URL สำหรับใส่ใน LINE Developers > Messaging API > Webhook URL (ต้อง Deploy เป็น Web app ก่อน) */
function showLineWebhookUrl() {
  const secret = PropertiesService.getScriptProperties().getProperty('HOOK_SECRET');
  let url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = '<URL ของ Web app ที่ลงท้าย /exec>'; }
  Logger.log('Webhook URL: ' + url + '?hook=' + secret);
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t); });
  const hour = Number(setting_('NOTIFY_HOUR') || 8);
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(hour).inTimezone(TZ).create();
  Logger.log('ตั้งเวลา dailyJob ทุกวันช่วง ' + hour + ':00 น. แล้ว');
}

/** ทดสอบส่งแจ้งเตือนประจำวันทันที (บังคับเป็นสรุปประจำสัปดาห์) */
function testDailyNow() {
  __db = {};
  Logger.log(JSON.stringify(runDaily_(true, null)));
}

function createUser_(username, password, name) {
  username = String(username).trim().toLowerCase();
  const salt = Utilities.getUuid();
  const rec = table_('Users').filter(function (r) { return r.username === username; })[0];
  if (rec) { rec.salt = salt; rec.pass_hash = hash_(password, salt); rec.name = name; rec.active = 'TRUE'; update_('Users', rec); }
  else insert_('Users', { username: username, name: name, pass_hash: hash_(password, salt), salt: salt, active: 'TRUE' });
}

function setGroupPin_(g, pin) {
  const salt = Utilities.getUuid();
  g.pin_salt = salt;
  g.pin_hash = hash_(pin, salt);
  g.pin_updated = nowStr_() + '#' + salt.slice(0, 6);
  update_('Groups', g);
}

function randomPin_() {
  let p = '';
  for (let i = 0; i < 4; i++) p += String(Math.floor(Math.random() * 10));
  return /^(\d)\1{3}$/.test(p) || p === '1234' ? randomPin_() : p;
}

/* ====================================================================== */
/* Data layer                                                             */
/* ====================================================================== */

let __db = {};

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' กรุณารัน setup()');
  return sh;
}

function table_(name) {
  if (__db[name]) return __db[name];
  const vals = sheet_(name).getDataRange().getValues();
  const head = SCHEMA[name];
  const rows = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (r.every(function (v) { return v === '' || v === null; })) continue;
    const o = { _row: i + 1 };
    head.forEach(function (h, j) { o[h] = norm_(r[j]); });
    rows.push(o);
  }
  __db[name] = rows;
  return rows;
}

function norm_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    const t = Utilities.formatDate(v, TZ, 'HH:mm:ss');
    return Utilities.formatDate(v, TZ, t === '00:00:00' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
  }
  return v;
}

function cell_(v) {
  if (typeof v === 'string' && v.length > 1 && /^[=+@\-]/.test(v)) return "'" + v;
  return v === undefined || v === null ? '' : v;
}

function insert_(name, obj) {
  sheet_(name).appendRow(SCHEMA[name].map(function (h) { return cell_(obj[h]); }));
  delete __db[name];
}

function update_(name, obj) {
  if (!obj._row) throw new Error('update_ ต้องมี _row');
  const head = SCHEMA[name];
  sheet_(name).getRange(obj._row, 1, 1, head.length).setValues([head.map(function (h) { return cell_(obj[h]); })]);
}

function remove_(name, obj) {
  sheet_(name).deleteRow(obj._row);
  delete __db[name];
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function setting_(key) {
  const r = table_('Settings').filter(function (s) { return s.key === key; })[0];
  return r ? String(r.value) : null;
}
function setSetting_(key, value) {
  const r = table_('Settings').filter(function (s) { return s.key === key; })[0];
  if (r) { r.value = value; update_('Settings', r); } else insert_('Settings', { key: key, value: value, note: '' });
}

function findGroup_(id) { return table_('Groups').filter(function (g) { return g.group_id === String(id || ''); })[0]; }
function findEvent_(id) { return table_('Events').filter(function (e) { return e.event_id === String(id || ''); })[0]; }
function activeGroups_() { return table_('Groups').filter(function (g) { return truthy_(g.active); }).sort(byOrder_); }
function byOrder_(a, b) { return (Number(a.order) || 99) - (Number(b.order) || 99); }

function log_(actor, action, detail) {
  try { insert_('Log', { ts: nowStr_(), actor: actor, action: action, detail: String(detail || '').slice(0, 1000) }); } catch (e) { /* ignore */ }
}

/* ====================================================================== */
/* Security helpers                                                       */
/* ====================================================================== */

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function hash_(text, salt) {
  let h = String(salt) + '|' + String(text);
  for (let i = 0; i < 150; i++) h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8));
  return h;
}
function tokenSecret_() {
  const s = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  if (!s) throw new Error('ยังไม่ได้รัน setup()');
  return s;
}
function sign_(obj) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(obj), Utilities.Charset.UTF_8);
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, tokenSecret_()));
  return body + '.' + sig;
}
function unsign_(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], tokenSecret_()));
  if (sig !== parts[1]) return null;
  try {
    const obj = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0], Utilities.Charset.UTF_8)).getDataAsString());
    if (!obj.exp || obj.exp < Date.now()) return null;
    return obj;
  } catch (e) { return null; }
}
function checkLocked_(kind, id) {
  if (CacheService.getScriptCache().get('lock_' + kind + '_' + id)) throw new Error('ยืนยันผิดหลายครั้ง ระบบพักไว้ 15 นาที กรุณาลองใหม่ภายหลัง');
}
function registerFail_(kind, id) {
  const c = CacheService.getScriptCache();
  const key = 'fail_' + kind + '_' + id;
  const n = Number(c.get(key) || 0) + 1;
  if (n >= 5) { c.put('lock_' + kind + '_' + id, '1', 900); c.remove(key); return 0; }
  c.put(key, String(n), 900);
  return 5 - n;
}
function clearFail_(kind, id) { CacheService.getScriptCache().remove('fail_' + kind + '_' + id); }

/* ====================================================================== */
/* Utils                                                                  */
/* ====================================================================== */

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function dnum_(s) { const p = String(s).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; }
function diffDays_(from, to) { return Math.round(dnum_(to) - dnum_(from)); }
function thDate_(s) {
  if (!isDate_(s)) return String(s || '');
  const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const p = String(s).split('-').map(Number);
  return p[2] + ' ' + m[p[1] - 1] + ' ' + String(p[0] + 543).slice(2);
}
function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; }
function clip_(v, n) { return String(v === undefined || v === null ? '' : v).trim().slice(0, n); }
function newId_(prefix) { return prefix + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); }
function parseFiles_(s) { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function strip_(o) { const c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }

/* ====================================================================== */
/* ข้อมูลตัวอย่าง — ใช้ในโหมดทดลองบนเบราว์เซอร์เท่านั้น (ห้ามรันในระบบจริง)    */
/* ====================================================================== */

function seedDemo_(webUrl) {
  __db = {};
  setup();
  const pr = PropertiesService.getScriptProperties();
  pr.setProperty('LINE_TOKEN', 'demo-token');
  pr.setProperty('HOOK_SECRET', 'demo-hook');
  setSetting_('WEB_URL', webUrl || '');
  createUser_('admin', 'admin1234', 'ผู้ดูแลทดลอง');
  table_('Groups').forEach(function (g) { setGroupPin_(g, '1234'); });
  __db = {};
  const T = today_();
  const d = function (n) { const t = new Date((dnum_(T) + n) * 86400000); return t.toISOString().slice(0, 10); };
  const now = nowStr_();
  const all = DEFAULT_GROUPS.map(function (g) { return g[0]; });
  const E = [
    ['meet', -19, -19, 'ประชุมชี้แจงทิศทางการดำเนินงาน ปีงบประมาณ 2570', 'ห้องประชุม สสจ.พิษณุโลก', [['str', 'หลัก', 'จัดเตรียมวาระและสรุปทิศทาง', -20, STATUS.DONE]].concat(all.filter(function (x) { return x !== 'str'; }).map(function (x) { return [x, 'ร่วม', 'ส่งผู้ประสานงานหลักเข้าร่วมประชุม', -19, STATUS.DONE]; }))],
    ['due', -12, -12, 'ส่งข้อมูลประกอบเอกสารตอบสนองนโยบาย เสาหลักที่ 3–7', 'ส่งทางระบบ', [['str', 'หลัก', 'รวบรวมและเรียบเรียงเอกสาร', -8, STATUS.DOING], ['hp', 'ร่วม', 'ส่งผลงานและแผนด้านส่งเสริมสุขภาพ', -12, STATUS.SENT], ['cd', 'ร่วม', 'ส่งผลงานและแผนด้านโรคติดต่อ', -12, STATUS.DONE], ['ncd', 'ร่วม', 'ส่งผลงานและแผนด้าน NCD', -12, STATUS.DOING]]],
    ['due', -5, -5, 'ส่งข้อมูลสถานการณ์ประเด็นตรวจราชการ รอบที่ 1/2570', 'ส่งทางระบบ', [['ncd', 'หลัก', 'สรุปสถานการณ์ NCD และโรคหลอดเลือด พร้อม Gap', -5, STATUS.SENT], ['cd', 'หลัก', 'สรุปสถานการณ์โรคติดต่อสำคัญ', -5, STATUS.DOING], ['dig', 'ร่วม', 'ตรวจความครบถ้วนข้อมูล HDC ที่ใช้อ้างอิง', -6, STATUS.DONE], ['str', 'หลัก', 'รวบรวมเป็นเล่มเสนอ นพ.สสจ.', 3, STATUS.TODO]]],
    ['meet', 0, 0, 'ประชุมประจำเดือน ประกาศผลและมอบโล่ คปสอ.', 'ห้องประชุม สสจ.พิษณุโลก', [['str', 'หลัก', 'นำเสนอผลการประเมิน', 0, STATUS.DOING], ['adm', 'ร่วม', 'จัดเตรียมโล่และสถานที่', -1, STATUS.DONE]]],
    ['due', 2, 2, 'ส่งร่างแผนปฏิบัติการ ปีงบประมาณ 2570 รายกลุ่มงาน', 'ส่งทางระบบ', [['hp', 'หลัก', 'ส่งร่างแผนตามแบบฟอร์ม House Model', 2, STATUS.SENT], ['cd', 'หลัก', 'ส่งร่างแผนตามแบบฟอร์ม House Model', 2, STATUS.TODO], ['ncd', 'หลัก', 'ส่งร่างแผนตามแบบฟอร์ม พร้อม Quick Win Q1–Q4', 2, STATUS.DOING], ['env', 'หลัก', 'ส่งร่างแผนตามแบบฟอร์ม House Model', 2, STATUS.TODO], ['dent', 'หลัก', 'ส่งร่างแผนตามแบบฟอร์ม House Model', 2, STATUS.RETURN], ['str', 'ร่วม', 'ตรวจความเชื่อมโยงกับ KPI จังหวัด', 6, STATUS.TODO]]],
    ['visit', 5, 7, 'นิเทศงาน คปสอ. รอบที่ 1/2570', '9 อำเภอ (ตามกำหนดการ)', [['str', 'หลัก', 'จัดทีมนิเทศและออกกำหนดการ', 1, STATUS.DOING], ['qa', 'ร่วม', 'ร่วมทีมนิเทศด้านคุณภาพบริการ', 5, STATUS.TODO], ['ncd', 'ร่วม', 'เตรียมประเด็นติดตาม NCD รายอำเภอ', 3, STATUS.TODO]]],
    ['due', 8, 8, 'ตรวจคุณภาพข้อมูล 43 แฟ้ม ก่อนตัดข้อมูลไตรมาส 1', 'HDC', [['dig', 'หลัก', 'ตรวจและแจ้งผลความครบถ้วนรายอำเภอ', 8, STATUS.TODO], ['ins', 'ร่วม', 'ตรวจข้อมูลที่กระทบการเบิกจ่าย', 8, STATUS.TODO]]],
    ['train', 9, 9, 'อบรมการใช้ระบบปฏิทินงาน สำหรับผู้ประสานงานหลัก', 'ห้องประชุม สสจ.พิษณุโลก', [['str', 'หลัก', 'จัดอบรมและจัดทำคู่มือ', 9, STATUS.TODO]].concat(all.filter(function (x) { return x !== 'str'; }).map(function (x) { return [x, 'ร่วม', 'ส่งผู้แทนเข้าร่วมอบรม', 7, STATUS.TODO]; }))],
    ['due', 26, 26, 'ส่งข้อมูลประกอบการตรวจราชการ รอบที่ 1/2570 (ฉบับสมบูรณ์)', 'ส่งทางระบบ', [['ncd', 'หลัก', 'ปรับข้อมูลตามข้อเสนอแนะ และแนบเอกสารอ้างอิง', 26, STATUS.TODO], ['cd', 'หลัก', 'ปรับข้อมูลตามข้อเสนอแนะ และแนบเอกสารอ้างอิง', 26, STATUS.TODO]]]
  ];
  E.forEach(function (e, i) {
    const id = 'EVDEMO' + (i + 1);
    insert_('Events', { event_id: id, title: e[3], type: e[0], start: d(e[1]), end: d(e[2]), place: e[4], detail: '', link: '', visibility: 'all', status: 'active', created_at: now, created_by: 'admin', updated_at: now });
    e[5].forEach(function (x, j) {
      insert_('Assignments', { asg_id: 'ASDEMO' + (i + 1) + '_' + j, event_id: id, group_id: x[0], role: x[1], task: x[2], due: d(x[3]), status: x[4], updated_at: now, updated_by: 'admin', note: x[4] === STATUS.RETURN ? 'ขาดตาราง Quick Win รายไตรมาส' : '' });
      if (x[4] === STATUS.SENT) insert_('Submissions', { sub_id: 'SBDEMO' + i + j, asg_id: 'ASDEMO' + (i + 1) + '_' + j, group_id: x[0], kind: 'submit', channel: 'file', channel_detail: '', link: '', files: JSON.stringify([{ name: 'เอกสารประกอบ.pdf', id: 'demo', url: '#demo-file', size: 120000 }]), reporter: 'ผู้ประสานงานหลัก (ทดลอง)', note: '', created_at: now, review: 'pending', reviewer: '', review_note: '', reviewed_at: '' });
    });
  });
  insert_('LineTargets', { target_id: 'Cdemo_ncd_group', type: 'group', group_id: 'ncd', display: 'กลุ่ม LINE งาน NCD (ทดลอง)', bound_at: now, active: 'TRUE' });
  insert_('LineTargets', { target_id: 'Udemo_ncd_coord', type: 'user', group_id: 'ncd', display: 'ผู้ประสานงานหลัก NCD (ทดลอง)', bound_at: now, active: 'TRUE' });
  insert_('LineTargets', { target_id: 'Cdemo_str_team', type: 'group', group_id: ADMIN_GROUP, display: 'กลุ่ม LINE ทีมยุทธ์ (ทดลอง)', bound_at: now, active: 'TRUE' });
  insert_('LineTargets', { target_id: 'Cdemo_unbound', type: 'group', group_id: '', display: 'กลุ่ม LINE ที่ยังไม่ผูก (ทดลอง)', bound_at: '', active: 'TRUE' });
}

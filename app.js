(function () {
  "use strict";
  var D = window.SBP_DATA, KEY = "sbp-lite-v1";
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var PRI = {}, OC = {}, STAFF = {};
  D.pri.forEach(function (p) { PRI[p.id] = p; }); D.outcomes.forEach(function (o) { OC[o.id] = o; }); D.staff.forEach(function (s) { STAFF[s.id] = s; });

  /* ---------- shared state: embedded in the page, republished when someone ticks ---------- */
  var state = { rev: 0, p: {}, w: {}, own: {}, added: [] };
  try { var emb = JSON.parse(document.getElementById("state").textContent); if (emb && typeof emb === "object") state = Object.assign(state, emb); } catch (e) { /* first run */ }
  try { var loc = JSON.parse(localStorage.getItem(KEY) || "null"); if (loc && loc.dirty && loc.state && loc.state.rev >= state.rev) state = Object.assign(state, loc.state); } catch (e) { /* no storage */ }
  var ui = { staff: "", fpp: "", fstaff: "", fstatus: "", q: "" };
  try { ui = Object.assign(ui, JSON.parse(sessionStorage.getItem(KEY + "-ui") || "{}")); } catch (e) { /* ignore */ }
  var artifact = null, saveMsg = "", timer = null;
  if (window.claude && window.claude.use) window.claude.use("artifact").then(function (a) { artifact = a; }).catch(function () {});

  function buildDoc() {
    var json = JSON.stringify(state).replace(/</g, "\\u003c");
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>SBP Connect Lite</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n<div id="app"></div>\n<script id="state" type="application/json">' + json + '</script>\n<script src="data.js"></script>\n<script src="app.js"></script>\n</body>\n</html>\n';
  }
  function setSave(m) { saveMsg = m; var el = $("#save"); if (el) el.textContent = m; }
  function changed() {
    state.rev += 1;
    try { localStorage.setItem(KEY, JSON.stringify({ dirty: true, state: state })); } catch (e) { /* ignore */ }
    render(); setSave("Saving…");
    clearTimeout(timer); timer = setTimeout(push, 1500);
  }
  function push() {
    try { sessionStorage.setItem(KEY + "-ui", JSON.stringify(ui)); } catch (e) { /* ignore */ }
    if (!artifact) { setSave("Saved on this device"); return; }
    artifact.publish(buildDoc()).then(function () {
      try { localStorage.setItem(KEY, JSON.stringify({ dirty: false, state: state })); } catch (e) { /* ignore */ }
      setSave("Saved for everyone");
    }).catch(function (e) {
      var c = e && e.code;
      setSave(c === "conflict" ? "Someone else saved first. Reloading…" : c === "not_granted" || c === "not_writer" ? "View only: your ticks are kept on this device" : "Saved on this device");
    });
  }

  /* ---------- model ---------- */
  function acts() {
    return D.acts.concat(state.added).map(function (a) { return Object.assign({}, a, { s: state.own[a.id] || a.s, v: Math.max(0, Math.min(100, +(state.p[a.id] || 0))) }); });
  }
  var avg = function (l) { return l.length ? l.reduce(function (x, y) { return x + y; }, 0) / l.length : null; };
  function model() {
    var A = acts(), m = { A: A, oc: {}, pp: {}, staff: {} };
    D.outcomes.forEach(function (o) { var l = A.filter(function (a) { return a.oc === o.id; }); m.oc[o.id] = { list: l, v: avg(l.map(function (a) { return a.v; })), done: l.filter(function (a) { return a.v >= 100; }).length }; });
    D.pri.forEach(function (p) { var os = D.outcomes.filter(function (o) { return o.pp === p.id; }); var l = A.filter(function (a) { return a.pp === p.id; }); m.pp[p.id] = { v: avg(os.map(function (o) { return m.oc[o.id].v || 0; })), done: l.filter(function (a) { return a.v >= 100; }).length, n: l.length }; });
    m.all = avg(D.pri.map(function (p) { return m.pp[p.id].v || 0; }));
    D.staff.forEach(function (s) {
      var l = A.filter(function (a) { return a.s === s.id; }), cw = state.w[s.id], eq = l.length ? 100 / l.length : 0;
      var w = l.map(function (a) { return cw && cw[a.id] != null ? +cw[a.id] : (cw ? 0 : eq); });
      var sum = w.reduce(function (x, y) { return x + y; }, 0), ok = !l.length || Math.abs(sum - 100) < 0.05;
      m.staff[s.id] = { list: l, w: w, sum: sum, ok: ok, custom: !!cw, v: l.length && ok ? l.reduce(function (x, a, i) { return x + a.v * w[i] / 100; }, 0) : null, done: l.filter(function (a) { return a.v >= 100; }).length };
    });
    return m;
  }
  var pc = function (v) { return v == null ? "–" : Math.round(v) + "%"; };
  var n1 = function (v) { return (Math.round(v * 10) / 10).toString(); };
  var bar = function (v, cls) { return '<div class="bar ' + (cls || "") + '"><span style="width:' + (v || 0) + '%"></span></div>'; };
  var ring = function (v, size) {
    var r = 52, c = 2 * Math.PI * r, o = c * (1 - (v || 0) / 100);
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 120 120" role="img" aria-label="' + pc(v) + ' complete"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="11"/><circle cx="60" cy="60" r="52" fill="none" stroke="#35c7bd" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + o + '" transform="rotate(-90 60 60)"/><text x="60" y="67" text-anchor="middle" font-size="26" font-weight="700" fill="#fff" font-family="Plus Jakarta Sans,sans-serif">' + pc(v) + '</text></svg>';
  };
  var sname = function (id) { var s = STAFF[id]; return s ? (s.name ? s.name + " · " : "") + s.label : "Unassigned"; };
  var tgt = function (i) { return '<li><b>' + esc(i.target) + '</b><span>' + esc(i.name.replace(/^[#%]\s*(of\s+)?/i, "")) + '</span></li>'; };
  var check = function (a) { return '<input type="checkbox" class="tick" data-act="' + a.id + '" id="t-' + a.id + '"' + (a.v >= 100 ? " checked" : "") + ' aria-label="Mark done: ' + esc(a.t) + '">'; };

  /* ---------- pages ---------- */
  function overview(m) {
    var h = '<section class="hero"><div><p class="eyebrow">' + esc(D.org.name) + ' · Strategy and Business Plan ' + D.org.period + '</p><h1>Overall SBP progress</h1><p class="lead">' + m.A.filter(function (a) { return a.v >= 100; }).length + ' of ' + m.A.length + ' activities done across 4 Priority Programs and ' + D.outcomes.length + ' outcomes. Total programme budget ' + D.org.budget + '.</p><p class="vision">Vision: “' + esc(D.org.vision) + '”</p></div>' + ring(m.all, 150) + '</section>';
    h += '<div class="flow"><div><b>Activities</b><span>Staff tick what is done</span></div><i>→</i><div><b>Outcome progress</b><span>Average of its activities</span></div><i>→</i><div><b>Priority progress</b><span>Average of its outcomes</span></div><i>→</i><div><b>Overall SBP progress</b><span>Average of the 4 priorities</span></div></div>';
    h += '<div class="grid2">' + D.pri.map(function (p) {
      var os = D.outcomes.filter(function (o) { return o.pp === p.id; });
      var heads = D.inds.filter(function (i) { return i.pp === p.id && i.type === "Output" && i.target && /^\d/.test(i.target); }).slice(0, 4);
      return '<a class="card pcard" href="#' + p.id.toLowerCase() + '"><div class="pc-h"><span class="num">' + p.n + '</span><div><span class="eyebrow">Priority Program ' + p.n + '</span><h3>' + esc(p.name) + '</h3></div><b class="big">' + pc(m.pp[p.id].v) + '</b></div>' + bar(m.pp[p.id].v) +
        '<div class="facts"><span><b>' + p.budget.replace("USD ", "$") + '</b>budget</span><span><b>' + p.reach.replace(" individuals", "") + '</b>people reached</span><span><b>' + m.pp[p.id].done + ' / ' + m.pp[p.id].n + '</b>activities done</span></div>' +
        '<div class="olist">' + os.map(function (o) { return '<div><span>Outcome ' + o.num + '</span>' + bar(m.oc[o.id].v, "thin") + '<b>' + pc(m.oc[o.id].v) + '</b></div>'; }).join("") + '</div>' +
        '<p class="label">Headline targets</p><ul class="targets">' + heads.map(tgt).join("") + '</ul><span class="go">Open one-page summary →</span></a>';
    }).join("") + '</div>';
    h += '<section class="card"><h3>Progress per staff</h3><p class="sub">Weighted by each person’s activity weights. Select a name to open their checklist.</p><div class="sgrid">' + D.staff.filter(function (s) { return m.staff[s.id].list.length; }).map(function (s) { var x = m.staff[s.id]; return '<button class="srow" data-staff="' + s.id + '"><span>' + esc(s.label) + '</span>' + bar(x.v, "thin") + '<b>' + (x.ok ? pc(x.v) : "Fix weights") + '</b></button>'; }).join("") + '</div></section>';
    return h;
  }
  function priority(m, id) {
    var p = PRI[id], os = D.outcomes.filter(function (o) { return o.pp === id; });
    var h = '<section class="hero"><div><p class="eyebrow">Priority Program ' + p.n + ' · One-page summary</p><h1>' + esc(p.name) + '</h1><p class="lead">' + esc(p.goal) + '</p></div>' + ring(m.pp[id].v, 130) + '</section>';
    h += '<div class="facts wide"><span><b>' + p.budget.replace("USD ", "$") + '</b>estimated budget, FY 26-28</span><span><b>' + p.reach.replace(" individuals", "") + '</b>people reached</span><span><b>' + os.length + '</b>outcomes</span><span><b>' + m.pp[id].done + ' / ' + m.pp[id].n + '</b>activities done</span></div>';
    h += '<section class="card"><h3>Where</h3><p>' + esc(p.geo) + '</p><div class="reach">' + p.reachSplit.map(function (r) { return '<span><b>' + r[1].toLocaleString("en-GB") + '</b>' + esc(r[0]) + '</span>'; }).join("") + '</div></section>';
    os.forEach(function (o) {
      var x = m.oc[o.id], ti = D.inds.filter(function (i) { return i.oc === o.id && i.target; });
      var oi = ti.filter(function (i) { return i.type === "Outcome"; }), pi = ti.filter(function (i) { return i.type === "Output"; });
      var groups = {}; x.list.forEach(function (a) { (groups[a.out || "Activities"] = groups[a.out || "Activities"] || []).push(a); });
      h += '<section class="card ocard"><div class="oc-h"><span class="pill">Outcome ' + o.num + '</span><h3>' + esc(o.text) + '</h3><b class="big">' + pc(x.v) + '</b></div>' + bar(x.v) + '<p class="sub">' + x.done + ' of ' + x.list.length + ' activities done</p>' +
        '<div class="cols"><div><p class="label">Outcome targets</p><ul class="targets">' + (oi.map(tgt).join("") || "<li><span>No target stated</span></li>") + '</ul></div><div><p class="label">Output targets</p><ul class="targets">' + pi.slice(0, 6).map(tgt).join("") + '</ul>' + (pi.length > 6 ? '<details><summary>Show ' + (pi.length - 6) + ' more targets</summary><ul class="targets">' + pi.slice(6).map(tgt).join("") + '</ul></details>' : "") + '</div></div>' +
        '<details class="acts"' + (ui["open-" + o.id] ? " open" : "") + ' data-open="' + o.id + '"><summary>Activities and who does them (' + x.list.length + ')</summary>' + Object.keys(groups).map(function (g) { return '<p class="label">' + esc(g) + '</p>' + groups[g].map(function (a) { return '<label class="arow" for="t-' + a.id + '">' + check(a) + '<span class="' + (a.v >= 100 ? "done" : "") + '">' + esc(a.t) + '</span><em>' + esc(STAFF[a.s] ? STAFF[a.s].label : "Unassigned") + '</em><b>' + pc(a.v) + '</b></label>'; }).join(""); }).join("") + '</details></section>';
    });
    return h;
  }
  function staffPage(m) {
    var withActs = D.staff.filter(function (s) { return m.staff[s.id].list.length; }), none = D.staff.filter(function (s) { return !m.staff[s.id].list.length; });
    if (!STAFF[ui.staff]) ui.staff = withActs[0].id;
    var s = STAFF[ui.staff], x = m.staff[s.id];
    var item = function (t) { var y = m.staff[t.id]; return '<button class="sitem' + (t.id === s.id ? " on" : "") + '" data-staff="' + t.id + '"><span><b>' + esc(t.label) + '</b><small>' + (t.name ? esc(t.name) + " · " : "") + esc(t.unit) + ' · ' + y.done + '/' + y.list.length + ' done</small></span><b class="' + (y.ok ? "" : "err") + '">' + (y.list.length ? (y.ok ? pc(y.v) : "!") : "–") + '</b></button>'; };
    var h = '<div class="page-h"><h1>Activity tracking per staff</h1><p>Tick an activity when it is done, or type a percentage for partial progress. Anyone can update. Changes are saved for everyone who opens this page.</p></div>';
    h += '<div class="split"><aside class="slist"><label class="fld" for="staff-sel"><span>Staff member</span><select id="staff-sel">' + D.staff.map(function (t) { return '<option value="' + t.id + '"' + (t.id === s.id ? " selected" : "") + '>' + esc(t.label) + '</option>'; }).join("") + '</select></label><div class="sscroll">' + withActs.map(item).join("") + '<p class="label">No SBP activity assigned yet</p>' + none.map(item).join("") + '</div></aside><div class="spanel">';
    h += '<section class="card"><div class="st-h"><div><p class="eyebrow">' + esc(s.unit) + ' · ' + esc(s.loc) + '</p><h2>' + esc(s.name || s.pos) + '</h2>' + (s.name ? '<p class="sub">' + esc(s.pos) + '</p>' : "") + '</div><div class="st-p"><b>' + (x.list.length ? (x.ok ? pc(x.v) : "–") : "–") + '</b><span>weighted progress</span></div></div>' + bar(x.ok ? x.v : 0);
    if (!x.ok) h += '<div class="error" role="alert"><b>Weights add up to ' + n1(x.sum) + '%.</b> They must add up to 100% before progress can be shown. Adjust the weights below or reset them to equal.</div>';
    if (x.list.length) {
      h += '<div class="tools"><span class="sub">' + x.done + ' of ' + x.list.length + ' activities done · weights ' + (x.custom ? "customised" : "equal") + ' · total <b class="' + (x.ok ? "ok" : "err") + '">' + n1(x.sum) + '%</b></span><button class="btn ghost" data-eq="' + s.id + '">Reset weights to equal</button></div>';
      h += '<div class="tw"><table class="tbl"><thead><tr><th>Done</th><th>Activity</th><th>Priority · Outcome</th><th class="r">Progress %</th><th class="r">Weight %</th></tr></thead><tbody>' + x.list.map(function (a, i) {
        return '<tr class="' + (a.v >= 100 ? "isdone" : "") + '"><td>' + check(a) + '</td><td><label for="t-' + a.id + '">' + esc(a.t) + '</label>' + (a.custom ? ' <button class="x" data-del="' + a.id + '" aria-label="Remove activity">Remove</button>' : "") + '</td><td class="nw"><a href="#' + a.pp.toLowerCase() + '">' + a.pp + '</a> · Outcome ' + OC[a.oc].num + '</td><td class="r"><input class="numin" type="number" min="0" max="100" step="5" value="' + a.v + '" data-pct="' + a.id + '" id="p-' + a.id + '" aria-label="Progress percent"></td><td class="r"><input class="numin' + (x.ok ? "" : " bad") + '" type="number" min="0" max="100" step="0.5" value="' + n1(x.w[i]) + '" data-w="' + a.id + '" id="w-' + a.id + '" aria-label="Weight percent"></td></tr>';
      }).join("") + '</tbody><tfoot><tr><td colspan="3">Total</td><td class="r"><b>' + (x.ok ? pc(x.v) : "–") + '</b></td><td class="r"><b class="' + (x.ok ? "ok" : "err") + '">' + n1(x.sum) + '%</b></td></tr></tfoot></table></div>';
    } else h += '<p class="empty">No SBP activity is assigned to this position yet. Add one below, or assign an existing activity from the Activity list.</p>';
    h += '<form class="add" id="add-form"><label class="fld grow" for="add-t"><span>Add an activity for this staff member</span><input id="add-t" placeholder="Describe the activity" required></label><label class="fld" for="add-o"><span>Contributes to</span><select id="add-o">' + D.outcomes.map(function (o) { return '<option value="' + o.id + '">' + o.pp + ' Outcome ' + o.num + '</option>'; }).join("") + '</select></label><button class="btn" type="submit">Add activity</button></form></section></div></div>';
    return h;
  }
  function listPage(m) {
    var q = ui.q.toLowerCase();
    var l = m.A.filter(function (a) { return (!ui.fpp || a.pp === ui.fpp) && (!ui.fstaff || a.s === ui.fstaff) && (!ui.fstatus || (ui.fstatus === "done" ? a.v >= 100 : ui.fstatus === "part" ? a.v > 0 && a.v < 100 : a.v === 0)) && (!q || a.t.toLowerCase().indexOf(q) >= 0); });
    var opt = function (v, t, cur) { return '<option value="' + v + '"' + (v === cur ? " selected" : "") + '>' + esc(t) + '</option>'; };
    var h = '<div class="page-h"><h1>SBP activity list</h1><p>All ' + m.A.length + ' activities from the four logical frameworks. Tick to mark done, type a percentage for partial progress, or change who is responsible.</p></div>';
    h += '<div class="filters"><label class="fld grow" for="f-q"><span>Search</span><input id="f-q" type="search" value="' + esc(ui.q) + '" placeholder="e.g. training, WASH, policy"></label><label class="fld" for="f-pp"><span>Priority</span><select id="f-pp">' + opt("", "All priorities", ui.fpp) + D.pri.map(function (p) { return opt(p.id, p.id + " " + p.short, ui.fpp); }).join("") + '</select></label><label class="fld" for="f-staff"><span>Staff</span><select id="f-staff">' + opt("", "All staff", ui.fstaff) + D.staff.map(function (s) { return opt(s.id, s.label, ui.fstaff); }).join("") + '</select></label><label class="fld" for="f-status"><span>Status</span><select id="f-status">' + opt("", "All", ui.fstatus) + opt("done", "Done", ui.fstatus) + opt("part", "In progress", ui.fstatus) + opt("todo", "Not started", ui.fstatus) + '</select></label></div>';
    h += '<section class="card"><p class="sub"><b>' + l.length + '</b> activities · ' + l.filter(function (a) { return a.v >= 100; }).length + ' done · average progress ' + pc(avg(l.map(function (a) { return a.v; }))) + '</p><div class="tw"><table class="tbl"><thead><tr><th>Done</th><th>Activity</th><th>Priority · Outcome</th><th>Responsible staff</th><th class="r">Progress %</th></tr></thead><tbody>' + l.map(function (a) {
      return '<tr class="' + (a.v >= 100 ? "isdone" : "") + '"><td>' + check(a) + '</td><td><label for="t-' + a.id + '">' + esc(a.t) + '</label><small>' + esc(a.out) + '</small></td><td class="nw"><a href="#' + a.pp.toLowerCase() + '">' + a.pp + '</a> · Outcome ' + OC[a.oc].num + '</td><td><select class="own" data-own="' + a.id + '" aria-label="Responsible staff">' + D.staff.map(function (s) { return opt(s.id, s.label, a.s); }).join("") + '</select></td><td class="r"><input class="numin" type="number" min="0" max="100" step="5" value="' + a.v + '" data-pct="' + a.id + '" aria-label="Progress percent"></td></tr>';
    }).join("") + '</tbody></table></div>' + (l.length ? "" : '<p class="empty">No activity matches. Clear the search or filters.</p>') + '</section>';
    return h;
  }

  /* ---------- shell ---------- */
  var TABS = [["overview", "SBP Overview"], ["pp1", "Priority 1"], ["pp2", "Priority 2"], ["pp3", "Priority 3"], ["pp4", "Priority 4"], ["staff", "Staff tracking"], ["activities", "Activity list"]];
  function page() { var h = location.hash.replace("#", ""); return TABS.some(function (t) { return t[0] === h; }) ? h : "overview"; }
  function render() {
    var m = model(), pg = page(), main = $("main"), y = main ? main.scrollTop : 0, wy = window.scrollY;
    var body = pg === "overview" ? overview(m) : pg === "staff" ? staffPage(m) : pg === "activities" ? listPage(m) : priority(m, pg.toUpperCase());
    $("#app").innerHTML = '<header class="top"><a class="brand" href="#overview"><span class="logo">SBP</span><span><b>SBP Connect</b><small>' + esc(D.org.name) + ' · ' + D.org.period + '</small></span></a><nav aria-label="Pages">' + TABS.map(function (t) { return '<a href="#' + t[0] + '"' + (t[0] === pg ? ' class="on" aria-current="page"' : "") + '>' + t[1] + '</a>'; }).join("") + '</nav><div class="overall"><span>Overall</span><b>' + pc(m.all) + '</b></div></header><main><div class="wrap">' + body + '<footer><span id="save">' + esc(saveMsg) + '</span><span>Open to everyone, no login. Activities and targets come from the Priority Program concept notes and MEAL Plans. Who does each activity is a first assignment and can be changed in the Activity list.</span></footer></div></main>';
    window.scrollTo(0, wy);
  }
  function setPct(id, v) { v = Math.max(0, Math.min(100, isNaN(v) ? 0 : v)); if (v) state.p[id] = v; else delete state.p[id]; changed(); }
  document.addEventListener("change", function (e) {
    var t = e.target, d = t.dataset;
    if (d.act) return setPct(d.act, t.checked ? 100 : 0);
    if (d.pct) return setPct(d.pct, parseFloat(t.value));
    if (d.own) { state.own[d.own] = t.value; return changed(); }
    if (d.w) {
      var sid = ui.staff, x = model().staff[sid], cw = {};
      x.list.forEach(function (a, i) { cw[a.id] = Math.round(x.w[i] * 10) / 10; });
      cw[d.w] = Math.max(0, parseFloat(t.value) || 0); state.w[sid] = cw; return changed();
    }
    if (t.id === "staff-sel") { ui.staff = t.value; return render(); }
    if (t.id === "f-pp") ui.fpp = t.value; else if (t.id === "f-staff") ui.fstaff = t.value; else if (t.id === "f-status") ui.fstatus = t.value; else if (t.id === "f-q") ui.q = t.value; else return;
    render();
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-staff],[data-eq],[data-del]"); if (!b) return;
    if (b.dataset.staff) { ui.staff = b.dataset.staff; if (page() !== "staff") location.hash = "staff"; else render(); window.scrollTo(0, 0); }
    else if (b.dataset.eq) { delete state.w[b.dataset.eq]; changed(); }
    else if (b.dataset.del) { state.added = state.added.filter(function (a) { return a.id !== b.dataset.del; }); delete state.p[b.dataset.del]; if (state.w[ui.staff]) delete state.w[ui.staff][b.dataset.del]; changed(); }
  });
  document.addEventListener("toggle", function (e) { var d = e.target.dataset; if (d && d.open) ui["open-" + d.open] = e.target.open; }, true);
  document.addEventListener("submit", function (e) {
    e.preventDefault(); if (e.target.id !== "add-form") return;
    var t = $("#add-t").value.trim(); if (!t) return;
    var oc = $("#add-o").value; state.added.push({ id: "X" + Date.now().toString(36), pp: OC[oc].pp, oc: oc, out: "Added activity", code: "", t: t, s: ui.staff, custom: true });
    if (state.w[ui.staff]) delete state.w[ui.staff]; changed();
  });
  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
  render();
})();

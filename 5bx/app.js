/* 5BX — RCAF Five Basic Exercises. No backend; everything lives on the device. */
(function () {
  'use strict';

  var DATA_URL = 'data/5bx-charts.json';
  var K_PREFS = 'fivebx.prefs.v1';
  var K_SESSIONS = 'fivebx.sessions.v1';

  var D = null;              // chart data
  var prefs = null;          // user selections
  var sessions = [];         // logged sessions
  var run = null;            // live workout state
  var pending = null;        // session awaiting save

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /* ============================ storage ============================ */

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { /* private mode / quota — session still works in memory */ }
  }

  /* ============================ helpers ============================ */

  function chartById(id) {
    for (var i = 0; i < D.charts.length; i++) if (D.charts[i].id === id) return D.charts[i];
    return D.charts[0];
  }
  function levelIndex(name) { return D.levelOrder.indexOf(name); }

  // Absolute position across the whole plan: 0 = Chart 1 D-, 71 = Chart 6 A+.
  function globalIndex(chartId, level) {
    return (chartId - 1) * D.levelOrder.length + levelIndex(level);
  }
  function fromGlobal(gi) {
    var n = D.levelOrder.length;
    return { chartId: Math.floor(gi / n) + 1, level: D.levelOrder[gi % n] };
  }
  function maxGlobal() { return D.charts.length * D.levelOrder.length - 1; }

  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function dayKey(iso) { return new Date(iso).toISOString().slice(0, 10); }

  function minDaysForAge(age) {
    if (age == null || age === '' || isNaN(age)) return null;
    var t = D.maxRateOfProgression.table;
    for (var i = 0; i < t.length; i++) {
      if (age >= t[i].ageMin && age <= t[i].ageMax) return t[i].minDaysPerLevel;
    }
    return null;
  }

  /* ============================ cues ============================ */

  var actx = null;
  function initAudio() {
    if (actx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { actx = new AC(); } catch (e) { actx = null; } }
  }
  function beep(times) {
    if (actx && actx.state === 'suspended') actx.resume();
    if (actx) {
      var t0 = actx.currentTime;
      for (var i = 0; i < times; i++) {
        var o = actx.createOscillator(), g = actx.createGain();
        var t = t0 + i * 0.22;
        o.type = 'sine';
        o.frequency.setValueAtTime(i === times - 1 ? 1050 : 780, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.34, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
        o.connect(g); g.connect(actx.destination);
        o.start(t); o.stop(t + 0.2);
      }
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(times > 1 ? [90, 70, 90, 70, 160] : [60]); } catch (e) {}
    }
  }

  // Short, dry tick for each counted step of the stationary run.
  function click(strong) {
    if (!actx) return;
    if (actx.state === 'suspended') actx.resume();
    var t = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(strong ? 1500 : 1150, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(strong ? 0.20 : 0.11, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.06);
  }

  // Lower, rounder pair announcing the jump set.
  function thud() {
    if (actx) {
      if (actx.state === 'suspended') actx.resume();
      var t0 = actx.currentTime;
      for (var i = 0; i < 2; i++) {
        var o = actx.createOscillator(), g = actx.createGain();
        var t = t0 + i * 0.17;
        o.type = 'sine';
        o.frequency.setValueAtTime(392, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(g); g.connect(actx.destination);
        o.start(t); o.stop(t + 0.25);
      }
    }
    if (navigator.vibrate) { try { navigator.vibrate([120, 80, 120]); } catch (e) {} }
  }

  /* ---------- speech ----------
     say() is the only seam that touches a speech engine. To move to
     pre-recorded clips later, swap its body for an <audio> playback keyed on
     the same short phrases; nothing else in the app needs to change.         */

  var Voice = {
    voice: null,
    supported: ('speechSynthesis' in window),

    init: function () {
      if (!Voice.supported) return;
      var pick = function () {
        var vs = window.speechSynthesis.getVoices() || [];
        var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
        // Prefer an on-device voice so cues still work with no network.
        en.sort(function (a, b) { return (b.localService ? 1 : 0) - (a.localService ? 1 : 0); });
        Voice.voice = en[0] || vs[0] || null;
      };
      pick();
      // getVoices() is async on most browsers; it fills in after this event.
      if (window.speechSynthesis.addEventListener) {
        window.speechSynthesis.addEventListener('voiceschanged', pick);
      } else {
        window.speechSynthesis.onvoiceschanged = pick;
      }
    },

    // iOS will not speak unless the first utterance comes from a user gesture.
    unlock: function () {
      if (!Voice.supported) return;
      try {
        var u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    },

    say: function (text, opts) {
      if (!Voice.supported || !prefs || !prefs.voiceCues || !text) return;
      try {
        if (!opts || !opts.queue) window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        if (Voice.voice) u.voice = Voice.voice;
        u.rate = 1.05;
        u.pitch = 1;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    },

    stop: function () {
      if (!Voice.supported) return;
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  };

  var wakeLock = null;
  function keepAwake(on) {
    if (!navigator.wakeLock) return;
    if (on) {
      navigator.wakeLock.request('screen').then(function (l) {
        wakeLock = l;
        l.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () {});
    } else if (wakeLock) {
      try { wakeLock.release(); } catch (e) {}
      wakeLock = null;
    }
  }

  /* ============================ navigation ============================ */

  var SCREENS = ['welcome', 'home', 'picker', 'preview', 'work', 'done', 'history', 'reference', 'settings'];
  function go(name) {
    SCREENS.forEach(function (s) {
      var node = $('screen-' + s);
      if (node) node.hidden = (s !== name);
    });
    var sc = $('screen-' + name);
    var body = sc && sc.querySelector('.scroll');
    if (body) body.scrollTop = 0;
    if (name === 'history') renderHistory();
    if (name === 'reference') renderReference();
    if (name === 'settings') renderSettings();
    if (name === 'picker') renderPicker();
    if (name === 'preview') renderPreview();
    if (name === 'welcome') renderWelcome();
    if (name === 'home') renderHome();
  }

  /* ============================ home ============================ */

  function ex5Modes() {
    var c = chartById(prefs.chartId);
    var lv = c.levels[prefs.level];
    // Charts 5 and 6 print the run target as mins:secs; the others as minutes.
    var unit = function (v) { return String(v).indexOf(':') >= 0 ? v : v + ' min'; };
    var out = [{ id: 'stationary', label: 'Stationary run — ' + lv.steps + ' steps' }];
    if (c.alternatives.runLabel) {
      out.push({ id: 'run', label: c.alternatives.runLabel + ' in ' + unit(lv.runDisplay) });
    }
    if (c.alternatives.walkLabel) {
      out.push({ id: 'walk', label: c.alternatives.walkLabel + ' in ' + unit(lv.walkDisplay) });
    }
    return out;
  }

  function renderTargets() {
    var c = chartById(prefs.chartId);
    var lv = c.levels[prefs.level];
    var list = $('targets');
    list.innerHTML = '';
    c.exercises.forEach(function (ex, i) {
      var li = el('li');
      li.appendChild(el('span', 't-n', String(i + 1)));

      var name = el('span', 't-name');
      name.appendChild(document.createTextNode(ex.name));
      var sub = mmss(D.timing.secondsPerExercise[i]) + ' allotted';
      if (i === 4 && prefs.ex5Mode !== 'stationary') sub = 'substituted';
      name.appendChild(el('span', 't-sub', sub));
      li.appendChild(name);

      var reps = el('span', 't-reps');
      if (i < 4) {
        reps.appendChild(document.createTextNode(String(lv.reps[i])));
        reps.appendChild(el('span', 't-unit', ' reps'));
      } else if (prefs.ex5Mode === 'run') {
        reps.appendChild(el('span', 't-unit', c.alternatives.runLabel));
      } else if (prefs.ex5Mode === 'walk') {
        reps.appendChild(el('span', 't-unit', c.alternatives.walkLabel));
      } else {
        reps.appendChild(document.createTextNode(String(lv.steps)));
        reps.appendChild(el('span', 't-unit', ' steps'));
      }
      li.appendChild(reps);
      list.appendChild(li);
    });
  }

  /* ---------- the journey bar ----------
     72 levels end to end. Seeing where you are, and where your age goal sits,
     is the clearest answer to "why am I doing two toe-touches?".            */

  function renderJourney(host) {
    if (!host) return;
    host.innerHTML = '';
    var total = maxGlobal();
    var here = globalIndex(prefs.chartId, prefs.level);
    var goal = ageGoalGlobal();

    var bar = el('div', 'journey__bar');
    var fill = el('i');
    fill.style.width = (here / total * 100) + '%';
    bar.appendChild(fill);

    if (goal != null) {
      var mark = el('span', 'journey__goal');
      mark.style.left = (goal / total * 100) + '%';
      bar.appendChild(mark);
    }
    host.appendChild(bar);

    var cap = el('p', 'journey__cap');
    cap.appendChild(el('span', null, 'Level ' + (here + 1) + ' of ' + (total + 1)));
    if (goal != null) {
      var g = fromGlobal(goal);
      cap.appendChild(el('span', 'journey__goal-txt',
        here >= goal ? 'Goal reached · Chart ' + g.chartId + ' ' + g.level
                     : 'Goal · Chart ' + g.chartId + ' ' + g.level));
    }
    host.appendChild(cap);
  }

  // The level the booklet sets as this age's goal, as a global index.
  function ageGoalGlobal() {
    if (prefs.age == null) return null;
    var best = null;
    D.charts.forEach(function (c) {
      (c.ageGroups || []).forEach(function (a) {
        if (matchesAge(a.label, prefs.age)) best = globalIndex(c.id, a.level);
      });
    });
    return best;
  }

  /* ---------- today ---------- */

  function renderHome() {
    $('today-level').textContent = 'Chart ' + prefs.chartId + ' · ' + prefs.level;

    var st = progressState();
    var bits = [];
    if (st.daysAtLevel === 0) bits.push('Not started at this level');
    else bits.push(st.daysAtLevel + (st.daysAtLevel === 1 ? ' day' : ' days') + ' at this level');
    if (prefs.ex5Mode !== 'stationary') bits.push('exercise 5 substituted');
    $('today-meta').textContent = bits.join(' · ');

    renderJourney($('today-journey'));
    renderTargets();
    renderLayoff();
    renderSuggestion();
  }

  /* ---------- preview ----------
     Today already lists the five exercises and their targets; what it can't
     show is what the movements look like. This is that, one tap away, so the
     happy path for a returning user is still a single Start.                */

  function renderPreview() {
    var host = $('preview-body');
    host.innerHTML = '';
    var c = chartById(prefs.chartId);
    var lv = c.levels[prefs.level];

    var head = el('p', 'prev-head', 'Chart ' + prefs.chartId + ' · ' + prefs.level +
      ' — five exercises in the same order, 11 minutes.');
    host.appendChild(head);

    c.exercises.forEach(function (ex, i) {
      var card = el('div', 'prev');

      var top = el('div', 'prev__top');
      top.appendChild(el('span', 'prev__n', String(i + 1)));
      var t = el('div', 'prev__t');
      t.appendChild(el('h2', null, ex.name));
      t.appendChild(el('p', null, mmss(D.timing.secondsPerExercise[i]) + ' allotted'));
      top.appendChild(t);

      var target;
      if (i < 4) target = lv.reps[i] + ' reps';
      else if (prefs.ex5Mode === 'run') target = c.alternatives.runLabel;
      else if (prefs.ex5Mode === 'walk') target = c.alternatives.walkLabel;
      else target = lv.steps + ' steps';
      top.appendChild(el('span', 'prev__target', target));
      card.appendChild(top);

      var img = document.createElement('img');
      img.className = 'prev__fig';
      img.src = 'figures/c' + prefs.chartId + 'e' + (i + 1) + '.png';
      img.alt = 'Illustration: ' + ex.name;
      img.loading = 'lazy';
      img.onerror = function () { img.remove(); };
      card.appendChild(img);

      card.appendChild(el('p', 'prev__lead', ex.start));
      card.appendChild(el('p', 'prev__move', ex.movement));
      (ex.notes || []).forEach(function (n) {
        card.appendChild(el('p', 'prev__note', n));
      });

      host.appendChild(card);
    });
  }

  /* ---------- level picker ---------- */

  function renderPicker() {
    var c = chartById(prefs.chartId);

    var cp = $('chart-picker');
    cp.innerHTML = '';
    D.charts.forEach(function (ch) {
      var b = el('button', 'seg__btn', String(ch.id));
      b.setAttribute('aria-pressed', ch.id === prefs.chartId ? 'true' : 'false');
      b.addEventListener('click', function () {
        prefs.chartId = ch.id;
        save(K_PREFS, prefs);
        renderPicker();
      });
      cp.appendChild(b);
    });
    $('chart-note').textContent = c.note || '';

    var lp = $('level-picker');
    lp.innerHTML = '';
    D.levelOrder.slice().reverse().forEach(function (lvl) {
      var b = el('button', 'seg__btn', lvl);
      b.setAttribute('aria-pressed', lvl === prefs.level ? 'true' : 'false');
      b.addEventListener('click', function () {
        prefs.level = lvl;
        save(K_PREFS, prefs);
        renderPicker();
      });
      lp.appendChild(b);
    });

    var modes = ex5Modes();
    if (!modes.some(function (m) { return m.id === prefs.ex5Mode; })) prefs.ex5Mode = 'stationary';
    var mp = $('ex5-picker');
    mp.innerHTML = '';
    modes.forEach(function (m) {
      var b = el('button', 'seg__btn', m.label);
      b.setAttribute('aria-pressed', m.id === prefs.ex5Mode ? 'true' : 'false');
      b.addEventListener('click', function () {
        prefs.ex5Mode = m.id;
        save(K_PREFS, prefs);
        renderPicker();
      });
      mp.appendChild(b);
    });
    $('ex5-note').textContent = prefs.ex5Mode === 'stationary'
      ? 'Every ' + c.exercises[4].jumpEvery + ' steps do ' + c.exercises[4].jumpCount + ' ' + c.exercises[4].jumpName + '.'
      : D.substitutionNote;

    $('picker-caution').textContent = D.rules.caution;
  }

  /* ---------- layoff ----------
     "Do drop back several levels - until you find one you can do without undue
     strain. After a period of inactivity of longer than two months, or one
     month if caused by illness, it is recommended that you start again at
     Chart 1." The app recommends; the user decides.                          */

  var LAYOFF_RESTART_DAYS = 60;
  var LAYOFF_DROP_DAYS = 14;
  var LAYOFF_DROP_LEVELS = 3;

  function lastSessionDate() {
    var t = null;
    sessions.forEach(function (s) {
      var d = new Date(s.date).getTime();
      if (!t || d > t) t = d;
    });
    return t;
  }

  function layoffState() {
    var last = lastSessionDate();
    if (!last) return null;
    var days = Math.floor((Date.now() - last) / 86400000);
    if (days < LAYOFF_DROP_DAYS) return null;

    var here = globalIndex(prefs.chartId, prefs.level);
    if (here === 0) return null;   // already at the very bottom

    // Don't nag once this particular layoff has been answered.
    if (prefs.layoffAck && prefs.layoffAck >= last) return null;

    if (days >= LAYOFF_RESTART_DAYS) {
      return { days: days, to: 0, kind: 'restart' };
    }
    return { days: days, to: Math.max(0, here - LAYOFF_DROP_LEVELS), kind: 'drop' };
  }

  function renderLayoff() {
    var box = $('layoff');
    box.innerHTML = '';
    var st = layoffState();
    if (!st) { box.hidden = true; return; }
    box.hidden = false;

    var target = fromGlobal(st.to);
    var weeks = Math.floor(st.days / 7);
    var since = weeks >= 2 ? weeks + ' weeks' : st.days + ' days';

    box.appendChild(el('h3', null, 'It has been ' + since));
    box.appendChild(el('p', null, st.kind === 'restart'
      ? 'After more than two months off, the plan says start again at Chart 1.'
      : 'After a break the plan says drop back several levels, until you find one you can do without undue strain.'));

    var row = el('div', 'notice__row');
    var accept = el('button', 'btn btn--primary',
      'Go to Chart ' + target.chartId + ' ' + target.level);
    accept.addEventListener('click', function () {
      prefs.chartId = target.chartId;
      prefs.level = target.level;
      prefs.layoffAck = Date.now();
      save(K_PREFS, prefs);
      renderHome();
    });
    var keep = el('button', 'btn btn--ghost', 'Keep my level');
    keep.addEventListener('click', function () {
      prefs.layoffAck = Date.now();
      save(K_PREFS, prefs);
      renderHome();
    });
    row.appendChild(accept);
    row.appendChild(keep);
    box.appendChild(row);
  }

  /* ---------- progression logic ----------
     The plan's rule: move up one level only after you can complete all the
     required movements at the present level within 11 minutes. The booklet
     also caps how fast you may climb, by age. Both must be satisfied.        */

  function progressState() {
    var gi = globalIndex(prefs.chartId, prefs.level);
    var atLevel = sessions.filter(function (s) {
      return s.chartId === prefs.chartId && s.level === prefs.level;
    });
    var days = {};
    atLevel.forEach(function (s) { days[dayKey(s.date)] = 1; });
    var daysAtLevel = Object.keys(days).length;
    var completedDays = {};
    atLevel.forEach(function (s) { if (s.completedInTime) completedDays[dayKey(s.date)] = 1; });

    var need = minDaysForAge(prefs.age);
    return {
      gi: gi,
      atTop: gi >= maxGlobal(),
      daysAtLevel: daysAtLevel,
      hasCompleted: Object.keys(completedDays).length > 0,
      minDays: need,
      daysShort: need == null ? 0 : Math.max(0, need - daysAtLevel)
    };
  }

  function renderSuggestion() {
    var box = $('suggestion');
    var st = progressState();
    box.innerHTML = '';

    if (!st.hasCompleted || st.atTop) { box.hidden = true; return; }

    if (st.daysShort > 0) {
      box.hidden = false;
      box.appendChild(el('h3', null, 'Level cleared'));
      box.appendChild(el('p', null,
        'You completed ' + prefs.level + ' within 11 minutes. At your age the plan asks for at least ' +
        st.minDays + ' days at each level — ' + st.daysShort + ' more ' +
        (st.daysShort === 1 ? 'day' : 'days') + ' to go.'));
      return;
    }

    var nxt = fromGlobal(st.gi + 1);
    box.hidden = false;
    box.appendChild(el('h3', null, 'Ready to move up'));
    box.appendChild(el('p', null,
      'You completed all the required movements at Chart ' + prefs.chartId + ' ' + prefs.level +
      ' within 11 minutes' +
      (st.minDays ? ', and spent ' + st.daysAtLevel + ' days at this level' : '') +
      '. The plan says move up to Chart ' + nxt.chartId + ' ' + nxt.level + '.'));
    var b = el('button', 'btn btn--primary', 'Move to Chart ' + nxt.chartId + ' ' + nxt.level);
    b.addEventListener('click', function () {
      prefs.chartId = nxt.chartId;
      prefs.level = nxt.level;
      save(K_PREFS, prefs);
      renderHome();
    });
    box.appendChild(b);
  }

  /* ============================ workout ============================ */

  function buildSteps() {
    var c = chartById(prefs.chartId);
    var lv = c.levels[prefs.level];
    return c.exercises.map(function (ex, i) {
      var seconds = D.timing.secondsPerExercise[i];
      var target;
      if (i < 4) {
        target = lv.reps[i] + ' reps';
      } else if (prefs.ex5Mode === 'run') {
        seconds = lv.runSeconds;
        target = c.alternatives.runLabel;
      } else if (prefs.ex5Mode === 'walk') {
        seconds = lv.walkSeconds;
        target = c.alternatives.walkLabel;
      } else {
        target = lv.steps + ' steps';
      }
      return { ex: ex, seconds: seconds, target: target, index: i };
    });
  }

  /* ======================= exercise 5 metronome =======================

     The booklet's exercise 5 is a step target, not a pace: "count a step each
     time left foot touches floor ... every 75 steps do 10 jumps, repeat until
     the required number of steps is completed".

     So the metronome paces the steps and STOPS for each jump set — the jumps
     are never raced against a running counter. There is room for that: even at
     Chart 6 A+ (600 steps, the hardest in the plan) pausing for all seven jump
     sets costs 105s and still leaves 255s of stepping.

     Cadence is derived per level rather than fixed, because the targets vary
     enormously: Chart 1 D- needs only 17 steps/min to finish inside the
     allotment, Chart 6 A+ needs 127. Below the jog floor we simply run at the
     floor and finish early, which is what the booklet expects at low levels.  */

  var CADENCE_FLOOR = 70;    // steps/min — a natural jog, never slower
  var CADENCE_CEIL = 200;

  var Metro = {
    on: false,
    phase: 'idle',          // stepping | jumping | leadin | done
    steps: 0, target: 0,
    periodMs: 0, nextAt: 0,
    phaseEndsAt: 0,
    jumpEvery: 75, jumpCount: 10, jumpName: 'jumps', windowMs: 12000,
    timer: null,

    plan: function (chart, level) {
      var ex5 = chart.exercises[4];
      var target = chart.levels[level].steps;
      var every = ex5.jumpEvery || 75;
      var windowSec = prefs.jumpWindow || ex5.jumpWindowSeconds || 12;
      // A jump set follows every full block except the one that finishes the target.
      var sets = Math.max(0, Math.ceil(target / every) - 1);
      var allot = D.timing.secondsPerExercise[4];
      var stepSeconds = Math.max(30, allot - sets * windowSec);
      var needed = target / stepSeconds * 60;
      var cadence = Math.min(CADENCE_CEIL, Math.max(CADENCE_FLOOR, needed));
      return {
        target: target, every: every, count: ex5.jumpCount || 10,
        name: ex5.jumpName || 'jumps', windowSec: windowSec,
        sets: sets, cadence: cadence
      };
    },

    start: function () {
      var chart = chartById(prefs.chartId);
      var p = Metro.plan(chart, prefs.level);
      Metro.on = true;
      Metro.phase = 'stepping';
      Metro.steps = 0;
      Metro.target = p.target;
      Metro.jumpEvery = p.every;
      Metro.jumpCount = p.count;
      Metro.jumpName = p.name;
      Metro.windowMs = p.windowSec * 1000;
      Metro.periodMs = 60000 / p.cadence;
      Metro.nextAt = Date.now() + Metro.periodMs;
      if (!Metro.timer) Metro.timer = setInterval(Metro.tick, 40);
      paintMetro();
    },

    stop: function () {
      Metro.on = false;
      Metro.phase = 'idle';
      if (Metro.timer) { clearInterval(Metro.timer); Metro.timer = null; }
      var j = $('jump');
      if (j) j.hidden = true;
    },

    tick: function () {
      if (!Metro.on || !run || run.paused) {
        // Keep the schedule from firing a burst after a pause.
        Metro.nextAt = Date.now() + Metro.periodMs;
        Metro.phaseEndsAt = Math.max(Metro.phaseEndsAt, Date.now());
        return;
      }
      var now = Date.now();

      if (Metro.phase === 'jumping') {
        if (prefs.jumpResume === 'auto' && now >= Metro.phaseEndsAt) Metro.resume();
        else paintMetro();
        return;
      }

      if (Metro.phase === 'leadin') {
        if (now >= Metro.phaseEndsAt) {
          Metro.phase = 'stepping';
          Metro.nextAt = now + Metro.periodMs;
          $('jump').hidden = true;
        }
        paintMetro();
        return;
      }

      if (Metro.phase !== 'stepping') return;

      // Drift-corrected: catch up, but never machine-gun after a stall.
      if (now - Metro.nextAt > Metro.periodMs * 3) Metro.nextAt = now;
      while (now >= Metro.nextAt) {
        Metro.nextAt += Metro.periodMs;
        Metro.step();
        if (Metro.phase !== 'stepping') break;
      }
      paintMetro();
    },

    step: function () {
      Metro.steps++;
      var atBlock = (Metro.steps % Metro.jumpEvery) === 0;
      click(atBlock);

      if (Metro.steps >= Metro.target) {
        Metro.phase = 'done';
        Metro.on = false;
        beep(2);
        Voice.say('Step target reached');
        return;
      }
      if (atBlock) Metro.beginJumps();
    },

    beginJumps: function () {
      Metro.phase = 'jumping';
      Metro.phaseEndsAt = Date.now() + Metro.windowMs;
      thud();
      Voice.say(Metro.jumpCount + ' ' + Metro.jumpName);
      paintMetro();
    },

    // Called by the auto window expiring, or by the user tapping to resume.
    resume: function () {
      if (Metro.phase !== 'jumping') return;
      Metro.phase = 'leadin';
      Metro.phaseEndsAt = Date.now() + 2200;
      beep(1);
      Voice.say('Resume running');
      paintMetro();
    }
  };

  // Exposed for debugging a timing-sensitive feature from the console.
  window.__metro = Metro;

  function paintMetro() {
    if (!run) return;
    var s = run.steps[run.i];
    if (!s || s.index !== 4 || !Metro.target) return;

    $('target-big').textContent = Metro.steps + ' / ' + Metro.target + ' steps';

    var j = $('jump');
    if (Metro.phase === 'jumping') {
      j.hidden = false;
      var left = Math.max(0, Math.ceil((Metro.phaseEndsAt - Date.now()) / 1000));
      $('jump-title').textContent = Metro.jumpCount + ' ' + Metro.jumpName;
      $('jump-sub').textContent = prefs.jumpResume === 'auto'
        ? 'resuming in ' + left + 's — tap when ready'
        : 'tap anywhere when you are done';
    } else if (Metro.phase === 'leadin') {
      j.hidden = false;
      $('jump-title').textContent = 'Get ready';
      $('jump-sub').textContent = 'running resumes';
    } else if (Metro.phase === 'done') {
      j.hidden = true;
      $('target-big').textContent = 'Target reached · ' + Metro.target + ' steps';
    } else {
      j.hidden = true;
    }
  }

  function metroApplies() {
    return prefs.metronome &&
           run && run.steps[run.i] &&
           run.steps[run.i].index === 4 &&
           prefs.ex5Mode === 'stationary';
  }

  function announceStep() {
    var s = run.steps[run.i];
    if (!s) return;
    var what = 'Exercise ' + (run.i + 1) + '. ' + s.ex.name + '. ' + s.target + '.';
    Voice.say(what);
  }

  function startWorkout() {
    initAudio();
    beep(1);
    run = {
      steps: buildSteps(),
      i: 0,
      remaining: 0,
      paused: false,
      last: Date.now(),
      startedAt: Date.now(),
      elapsed: 0,
      tick: null
    };
    run.remaining = run.steps[0].seconds;
    run.ready = READY_SECONDS;      // a beat before the clock starts
    keepAwake(true);
    Voice.unlock();
    buildPips();
    paintStep();
    paintReady();
    go('work');
    run.tick = setInterval(tick, 200);
  }

  function buildPips() {
    var p = $('pips');
    p.innerHTML = '';
    run.steps.forEach(function () {
      var d = el('div', 'pip');
      d.appendChild(el('i'));
      p.appendChild(d);
    });
  }

  function paintPips() {
    var nodes = $('pips').children;
    for (var i = 0; i < nodes.length; i++) {
      var bar = nodes[i].firstChild;
      if (i < run.i) { nodes[i].className = 'pip done'; bar.style.width = '100%'; }
      else if (i === run.i) {
        nodes[i].className = 'pip';
        var s = run.steps[i];
        bar.style.width = Math.min(100, (1 - run.remaining / s.seconds) * 100) + '%';
      } else { nodes[i].className = 'pip'; bar.style.width = '0'; }
    }
  }

  function paintStep() {
    var s = run.steps[run.i];
    var ex = s.ex;
    $('work-chart').textContent = 'Chart ' + prefs.chartId + ' · ' + prefs.level;
    $('ex-num').textContent = 'Exercise ' + (run.i + 1) + ' of ' + run.steps.length;
    $('ex-name').textContent = ex.name;
    $('target-big').textContent = s.target;

    var box = $('instructions');
    box.innerHTML = '';
    box.appendChild(el('p', 'lead', ex.start));
    box.appendChild(el('p', null, ex.movement));
    (ex.notes || []).forEach(function (n) { box.appendChild(el('p', 'note', n)); });

    // The original booklet's illustration for this exercise, as a reminder.
    var img = $('fig-img');
    img.src = 'figures/c' + prefs.chartId + 'e' + (run.i + 1) + '.png';
    img.alt = 'Illustration: ' + ex.name;
    $('fig').hidden = false;
    img.onerror = function () { $('fig').hidden = true; };

    // The metronome only applies to the stationary run.
    Metro.stop();
    if (metroApplies()) Metro.start();

    paintClock();
    paintPips();
  }

  function paintClock() {
    var c = $('clock');
    c.textContent = mmss(run.remaining);
    c.classList.toggle('is-low', run.remaining <= 5 && !run.paused);
    c.classList.toggle('is-paused', run.paused);
    $('work-elapsed').textContent = mmss(run.elapsed);
  }

  function tick() {
    var now = Date.now();
    var dt = (now - run.last) / 1000;
    run.last = now;
    if (run.paused) return;

    // Hold the clock until the get-ready beat is over.
    if (run.ready > 0) {
      var was = Math.ceil(run.ready);
      run.ready -= dt;
      if (run.ready <= 0) { endReady(); return; }
      if (Math.ceil(run.ready) !== was) click(false);
      paintReady();
      return;
    }

    run.remaining -= dt;
    run.elapsed += dt;

    if (run.remaining <= 0) {
      if (run.i >= run.steps.length - 1) { finishWorkout(); return; }
      beep(3);
      advance(1, true);
      return;
    }
    paintClock();
    paintPips();
  }

  var READY_SECONDS = 5;

  function paintReady() {
    var box = $('ready');
    if (!run || run.ready <= 0) { box.hidden = true; return; }
    var s = run.steps[0];
    box.hidden = false;
    $('ready-name').textContent = s.ex.name;
    $('ready-target').textContent = s.target;
    $('ready-count').textContent = String(Math.ceil(run.ready));
    var img = $('ready-fig');
    var src = 'figures/c' + prefs.chartId + 'e1.png';
    if (img.getAttribute('src') !== src) {
      img.src = src;
      img.onerror = function () { img.hidden = true; };
    }
  }

  function endReady() {
    if (!run) return;
    run.ready = 0;
    run.last = Date.now();
    $('ready').hidden = true;
    beep(1);
    announceStep();
  }

  function advance(dir, auto) {
    if (run.ready > 0) { run.ready = 0; $('ready').hidden = true; }
    var next = run.i + dir;
    if (next < 0) next = 0;
    if (next > run.steps.length - 1) { finishWorkout(); return; }
    run.i = next;
    run.remaining = run.steps[next].seconds;
    run.last = Date.now();
    if (!auto) beep(1);
    paintStep();
    announceStep();
  }

  function stopTimer() {
    if (run && run.tick) { clearInterval(run.tick); run.tick = null; }
    Metro.stop();
    Voice.stop();
    keepAwake(false);
  }

  function finishWorkout() {
    beep(3);
    stopTimer();
    Voice.say('Workout complete');
    var planned = D.timing.totalSeconds;
    pending = {
      id: String(Date.now()),
      date: new Date().toISOString(),
      chartId: prefs.chartId,
      level: prefs.level,
      ex5Mode: prefs.ex5Mode,
      durationSeconds: Math.round(run.elapsed),
      completedInTime: null,
      notes: ''
    };
    var sum = $('done-summary');
    sum.innerHTML = '';
    sum.appendChild(el('div', 'big', 'Chart ' + prefs.chartId + ' · ' + prefs.level));
    sum.appendChild(el('div', 'sub',
      mmss(pending.durationSeconds) + ' elapsed' +
      (prefs.ex5Mode === 'stationary' ? '' : ' · exercise 5 substituted') +
      (prefs.ex5Mode === 'stationary' && pending.durationSeconds <= planned + 2 ? ' · inside 11 minutes' : '')));
    $('notes').value = '';
    setDonePick(null);
    run = null;
    go('done');
  }

  function setDonePick(val) {
    var btns = $('done-picker').querySelectorAll('.seg__btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', btns[i].dataset.done === val ? 'true' : 'false');
    }
    if (pending) pending.completedInTime = val == null ? null : (val === 'yes');
  }

  /* ============================ history ============================ */

  function renderHistory() {
    var stats = $('stats');
    stats.innerHTML = '';

    var total = sessions.length;
    var done = sessions.filter(function (s) { return s.completedInTime; }).length;
    var best = sessions.reduce(function (m, s) {
      var g = globalIndex(s.chartId, s.level);
      return g > m ? g : m;
    }, -1);
    var bestLabel = best < 0 ? '—' : (function () {
      var b = fromGlobal(best);
      return 'Ch' + b.chartId + ' · ' + b.level;
    })();

    [['Sessions', total, false], ['Cleared', done, false], ['Best', bestLabel, true]]
      .forEach(function (p) {
        var d = el('div', 'stat');
        d.appendChild(el('b', p[2] ? 'sm' : null, String(p[1])));
        d.appendChild(el('span', null, p[0]));
        stats.appendChild(d);
      });

    renderProgressChart();

    var log = $('log');
    log.innerHTML = '';
    if (!sessions.length) {
      log.appendChild(el('li', 'empty', 'No sessions logged yet.'));
      return;
    }
    sessions.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
      .forEach(function (s) {
        var li = el('li');
        var mark = el('span', 'mark' + (s.completedInTime ? ' yes' : ''), s.completedInTime ? '✓' : '·');
        li.appendChild(mark);

        var body = el('div', 'body');
        body.appendChild(el('div', 'lvl', 'Chart ' + s.chartId + ' · ' + s.level));
        var meta = fmtDate(s.date) + ' · ' + mmss(s.durationSeconds || 0);
        if (s.ex5Mode && s.ex5Mode !== 'stationary') meta += ' · ' + s.ex5Mode;
        body.appendChild(el('div', 'when', meta));
        if (s.notes) body.appendChild(el('div', 'note', s.notes));
        li.appendChild(body);

        var del = el('button', 'del', '×');
        del.setAttribute('aria-label', 'Delete session');
        del.addEventListener('click', function () {
          if (!confirm('Delete this session?')) return;
          sessions = sessions.filter(function (x) { return x.id !== s.id; });
          save(K_SESSIONS, sessions);
          renderHistory();
        });
        li.appendChild(del);
        log.appendChild(li);
      });
  }

  function renderProgressChart() {
    var host = $('progress-chart');
    host.innerHTML = '';
    var pts = sessions.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    if (pts.length < 2) {
      host.appendChild(el('p', 'empty', 'Log two or more sessions to see your progression.'));
      return;
    }

    var W = 600, H = 220, PL = 44, PR = 10, PT = 12, PB = 28;
    var t0 = new Date(pts[0].date).getTime();
    var t1 = new Date(pts[pts.length - 1].date).getTime();
    var span = Math.max(1, t1 - t0);
    var gs = pts.map(function (s) { return globalIndex(s.chartId, s.level); });
    var lo = Math.max(0, Math.min.apply(null, gs) - 1);
    var hi = Math.min(maxGlobal(), Math.max.apply(null, gs) + 1);
    var range = Math.max(1, hi - lo);

    var x = function (t) { return PL + ((t - t0) / span) * (W - PL - PR); };
    var y = function (g) { return PT + (1 - (g - lo) / range) * (H - PT - PB); };

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Level progression over time');

    function mk(tag, attrs) {
      var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    }

    // gridlines at chart boundaries within range
    var n = D.levelOrder.length;
    for (var ci = 0; ci < D.charts.length; ci++) {
      var g = ci * n;
      if (g < lo || g > hi) continue;
      svg.appendChild(mk('line', {
        x1: PL, x2: W - PR, y1: y(g), y2: y(g),
        stroke: '#2a3644', 'stroke-width': 1
      }));
      var lab = mk('text', { x: 4, y: y(g) + 4, fill: '#93a3b5', 'font-size': 11 });
      lab.textContent = 'Ch ' + (ci + 1);
      svg.appendChild(lab);
    }

    var dpath = pts.map(function (s, i) {
      return (i ? 'L' : 'M') + x(new Date(s.date).getTime()).toFixed(1) + ' ' + y(gs[i]).toFixed(1);
    }).join(' ');
    svg.appendChild(mk('path', {
      d: dpath, fill: 'none', stroke: '#ff6b35',
      'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    pts.forEach(function (s, i) {
      svg.appendChild(mk('circle', {
        cx: x(new Date(s.date).getTime()), cy: y(gs[i]), r: 3.5,
        fill: s.completedInTime ? '#35d07f' : '#ff6b35'
      }));
    });

    [[pts[0].date, 'start'], [pts[pts.length - 1].date, 'end']].forEach(function (p, i) {
      var tx = mk('text', {
        x: i === 0 ? PL : W - PR, y: H - 8,
        fill: '#93a3b5', 'font-size': 11,
        'text-anchor': i === 0 ? 'start' : 'end'
      });
      tx.textContent = fmtDate(p[0]);
      svg.appendChild(tx);
    });

    host.appendChild(svg);
  }

  function exportData() {
    var payload = JSON.stringify({ exported: new Date().toISOString(), prefs: prefs, sessions: sessions }, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(function () {
        alert('Your ' + sessions.length + ' session(s) were copied to the clipboard as JSON.');
      }).catch(function () { window.prompt('Copy your data:', payload); });
    } else {
      window.prompt('Copy your data:', payload);
    }
  }

  /* ============================ welcome ============================
     First run only. Three cards, skippable at any point. Its one job is:
     here is the shape of it, here is your target, press this.               */

  var welCard = 1;
  var WEL_CARDS = 3;

  function renderWelcome() {
    for (var n = 1; n <= WEL_CARDS; n++) {
      var node = document.querySelector('.wel[data-card="' + n + '"]');
      if (node) node.hidden = (n !== welCard);
    }

    var dots = $('wel-dots');
    dots.innerHTML = '';
    for (var k = 1; k <= WEL_CARDS; k++) {
      dots.appendChild(el('span', 'dot' + (k === welCard ? ' is-on' : '')));
    }

    if (welCard === 1 && !$('wel-list').childNodes.length) {
      // Naming the five is more use than five illustrations at thumbnail size.
      D.exerciseShortNames.forEach(function (n) {
        $('wel-list').appendChild(el('li', null, n));
      });
    }
    if (welCard === 2) renderJourney($('wel-journey'));
    if (welCard === 3) renderWelcomeGoal();

    $('wel-skip').textContent = welCard === WEL_CARDS ? 'Not now' : 'Skip';
    $('wel-next').textContent = welCard === WEL_CARDS ? 'Get started' : 'Next';
  }

  // The starting point is the headline; the age goal is a quiet aside. Leading
  // with the goal reads as "the app has set me to that level", which is the
  // opposite of what the plan says.
  function renderWelcomeGoal() {
    var line = $('wel-goal-line');
    var goal = ageGoalGlobal();
    if (goal == null) { line.hidden = true; return; }
    var g = fromGlobal(goal);
    line.hidden = false;
    line.textContent = 'Eventual goal: Chart ' + g.chartId + ' ' + g.level +
      ' — ' + (goal + 1) + ' levels away. Most people take months.';
  }

  function finishWelcome() {
    prefs.seenWelcome = true;
    save(K_PREFS, prefs);
    go('home');
  }

  function wireWelcome() {
    $('wel-next').addEventListener('click', function () {
      if (welCard >= WEL_CARDS) { finishWelcome(); return; }
      welCard++;
      renderWelcome();
    });
    $('wel-skip').addEventListener('click', finishWelcome);

    $('wel-age').addEventListener('input', function () {
      var v = parseInt($('wel-age').value, 10);
      prefs.age = isNaN(v) ? null : v;
      save(K_PREFS, prefs);
      renderWelcomeGoal();
    });
  }

  /* ============================ settings ============================ */

  function renderSettings() {
    $('set-voice').setAttribute('aria-checked', prefs.voiceCues ? 'true' : 'false');
    $('set-metro').setAttribute('aria-checked', prefs.metronome ? 'true' : 'false');
    $('voice-support').hidden = Voice.supported;
    $('metro-opts').hidden = !prefs.metronome;

    var rs = $('set-resume').querySelectorAll('.seg__btn');
    for (var i = 0; i < rs.length; i++) {
      rs[i].setAttribute('aria-pressed', rs[i].dataset.resume === prefs.jumpResume ? 'true' : 'false');
    }
    $('window-field').hidden = (prefs.jumpResume !== 'auto');

    var ws = $('set-window').querySelectorAll('.seg__btn');
    for (var k = 0; k < ws.length; k++) {
      var v = parseInt(ws[k].dataset.window, 10);
      ws[k].setAttribute('aria-pressed', v === (prefs.jumpWindow || 0) ? 'true' : 'false');
    }
    var chart = chartById(prefs.chartId);
    $('window-hint').textContent = 'Auto uses this chart’s default of ' +
      (chart.exercises[4].jumpWindowSeconds || 12) + 's for ' + chart.exercises[4].jumpName + '.';

    renderPacePreview();
  }

  // Shows what the metronome will actually ask of you at the selected level.
  function renderPacePreview() {
    var host = $('pace-preview');
    host.innerHTML = '';
    var chart = chartById(prefs.chartId);
    var p = Metro.plan(chart, prefs.level);
    var stepSeconds = p.target / p.cadence * 60;
    var totalSeconds = stepSeconds + p.sets * p.windowSec;
    var allot = D.timing.secondsPerExercise[4];

    function row(k, v) {
      var d = el('div', 'pace-row');
      d.appendChild(el('span', null, k));
      d.appendChild(el('b', null, v));
      host.appendChild(d);
    }
    row('Chart ' + prefs.chartId + ' · ' + prefs.level, p.target + ' steps');
    row('Jump sets', p.sets + ' × ' + p.count + ' ' + p.name);
    row('Pace', Math.round(p.cadence) + ' steps/min');
    row('Estimated exercise 5', mmss(totalSeconds));

    var note = el('p', 'field__hint');
    if (totalSeconds <= allot - 20) {
      note.textContent = 'Comfortably inside the 6 minute allotment — at this level you finish early, which the plan expects.';
    } else if (p.cadence >= 120) {
      // A longer jump window buys its time from the running, so at the top
      // levels a generous window is what pushes the pace this high.
      note.textContent = 'Demanding: this level needs the whole allotment at a hard pace. ' +
        'Every second of jump window comes out of the running, so shorten the jump window above if you finish the jumps sooner.';
    } else {
      note.textContent = 'This level needs most of the allotment; the pace is set to finish right at 6 minutes.';
    }
    host.appendChild(note);
  }

  function wireSettings() {
    $('set-voice').addEventListener('click', function () {
      prefs.voiceCues = !prefs.voiceCues;
      save(K_PREFS, prefs);
      if (prefs.voiceCues) { initAudio(); Voice.unlock(); Voice.say('Voice cues on'); }
      else Voice.stop();
      renderSettings();
    });

    $('set-metro').addEventListener('click', function () {
      prefs.metronome = !prefs.metronome;
      save(K_PREFS, prefs);
      if (prefs.metronome) { initAudio(); click(true); }
      renderSettings();
    });

    $('set-resume').addEventListener('click', function (e) {
      var b = e.target.closest('.seg__btn');
      if (!b) return;
      prefs.jumpResume = b.dataset.resume;
      save(K_PREFS, prefs);
      renderSettings();
    });

    $('btn-replay-intro').addEventListener('click', function () {
      welCard = 1;
      $('wel-age').value = prefs.age || '';
      go('welcome');
    });

    $('set-window').addEventListener('click', function (e) {
      var b = e.target.closest('.seg__btn');
      if (!b) return;
      var v = parseInt(b.dataset.window, 10);
      prefs.jumpWindow = v || null;
      save(K_PREFS, prefs);
      renderSettings();
    });
  }

  /* ============================ reference ============================ */

  function renderReference() {
    var body = $('reference-body');
    body.innerHTML = '';

    function h(t) { body.appendChild(el('h2', 'ref-h', t)); }
    function p(t, dim) { body.appendChild(el('p', 'ref-p' + (dim ? ' ref-p--dim' : ''), t)); }

    h('How far should you progress?');
    p(D.rules.goalGuidance);

    // Age → chart/level goals, gathered from every chart and sorted by age so
    // the table reads as a ladder rather than chart by chart.
    var goals = [];
    D.charts.forEach(function (c) {
      (c.ageGroups || []).forEach(function (a) {
        goals.push({ label: a.label, chart: c.id, level: a.level });
      });
    });
    goals.sort(function (a, b) { return ageOf(a.label) - ageOf(b.label); });
    var tbl = el('table', 'ref-table');
    var thead = el('thead');
    var hr = el('tr');
    ['Age group', 'Chart', 'Level'].forEach(function (t, i) {
      var th = el('th', i ? 'num' : null, t);
      hr.appendChild(th);
    });
    thead.appendChild(hr); tbl.appendChild(thead);
    var tb = el('tbody');
    goals.forEach(function (g) {
      var tr = el('tr');
      if (prefs.age && matchesAge(g.label, prefs.age)) tr.className = 'is-you';
      tr.appendChild(el('td', null, g.label));
      tr.appendChild(el('td', 'num', String(g.chart)));
      tr.appendChild(el('td', 'num', g.level));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
    p('Chart 6: physical capacities in this chart are usually found only in champion athletes.', true);

    // Flying crew
    var crew = [];
    D.charts.forEach(function (c) {
      (c.flyingCrew || []).forEach(function (a) {
        crew.push({ label: a.label, chart: c.id, level: a.level });
      });
    });
    if (crew.length) {
      h('Flying crew');
      var t2 = el('table', 'ref-table');
      var tb2 = el('tbody');
      crew.forEach(function (g) {
        var tr = el('tr');
        tr.appendChild(el('td', null, g.label));
        tr.appendChild(el('td', 'num', 'Chart ' + g.chart));
        tr.appendChild(el('td', 'num', g.level));
        tb2.appendChild(tr);
      });
      t2.appendChild(tb2);
      body.appendChild(t2);
    }

    h('Your age');
    var wrap = el('div', 'field');
    var inp = document.createElement('input');
    inp.type = 'number'; inp.min = '5'; inp.max = '99'; inp.inputMode = 'numeric';
    inp.placeholder = 'Age (optional)';
    inp.value = prefs.age || '';
    inp.style.cssText = 'width:100%;min-height:56px;background:var(--bg-2);color:var(--fg);border:1px solid var(--line);border-radius:14px;padding:0 14px;font:inherit;font-size:17px;';
    inp.addEventListener('change', function () {
      var v = parseInt(inp.value, 10);
      prefs.age = isNaN(v) ? null : v;
      save(K_PREFS, prefs);
      renderReference();
    });
    wrap.appendChild(inp);
    body.appendChild(wrap);
    var need = minDaysForAge(prefs.age);
    p(need
      ? 'At your age the plan asks for at least ' + need + ' day(s) at each level before moving up. Used for the progression prompt on the home screen.'
      : 'Set your age to get the age-based goal highlighted above and the correct minimum days per level.', true);

    h('How to progress');
    p(D.rules.start);
    p(D.rules.progression);
    p(D.rules.example, true);

    h('Maximum rate of progression by age');
    var t3 = el('table', 'ref-table');
    var tb3 = el('tbody');
    D.maxRateOfProgression.table.forEach(function (r) {
      var tr = el('tr');
      if (prefs.age != null && prefs.age >= r.ageMin && prefs.age <= r.ageMax) tr.className = 'is-you';
      tr.appendChild(el('td', null, r.label));
      tr.appendChild(el('td', 'num', 'at least ' + r.minDaysPerLevel + ' day' + (r.minDaysPerLevel > 1 ? 's' : '') + ' at each level'));
      tb3.appendChild(tr);
    });
    t3.appendChild(tb3);
    body.appendChild(t3);

    h('Timing');
    p('Exercise 1: 2 minutes. Exercises 2, 3 and 4: 1 minute each. Exercise 5: 6 minutes. Total 11 minutes.');
    p(D.timing.note, true);

    h('Substituting exercise 5');
    p(D.substitutionNote);

    h('Counting your steps');
    p(D.tipCountingSteps);

    h('Maintenance');
    p(D.rules.maintenance);

    h('A note of caution');
    p(D.rules.caution);

    h('Coming back after a layoff');
    p(D.rules.layoff);

    var src = el('div', 'source');
    src.appendChild(el('p', null, D.meta.title + ' — ' + D.meta.subtitle + '. ' + D.meta.author + ', ' + D.meta.publisher + '.'));
    src.appendChild(el('p', null, 'All rep counts, step counts and times transcribed from ' + D.meta.sourceEdition + '.'));
    src.appendChild(el('p', null, 'This app stores everything on this device. Not medical advice.'));
    body.appendChild(src);
  }

  // Lowest age mentioned in a label like "8 yrs", "45-49 yrs", "Under 25 yrs".
  function ageOf(label) {
    var m = label.match(/(\d+)/);
    return m ? +m[1] : 999;
  }

  function matchesAge(label, age) {
    var m = label.match(/^(\d+)\s*-\s*(\d+)/);
    if (m) return age >= +m[1] && age <= +m[2];
    m = label.match(/^(\d+)\s*yrs/);
    if (m) return age === +m[1];
    m = label.match(/Under\s*(\d+)/i);
    if (m) return age < +m[1];
    return false;
  }

  /* ============================ wiring ============================ */

  function wire() {
    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.go); });
    });

    $('btn-start').addEventListener('click', startWorkout);
    $('btn-start-preview').addEventListener('click', startWorkout);

    // Tap the get-ready overlay to begin immediately.
    $('ready').addEventListener('click', endReady);
    $('ready').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); endReady(); }
    });

    $('btn-pause').addEventListener('click', function () {
      if (!run) return;
      run.paused = !run.paused;
      run.last = Date.now();
      $('btn-pause').textContent = run.paused ? 'Resume' : 'Pause';
      keepAwake(!run.paused);
      paintClock();
    });
    $('btn-next').addEventListener('click', function () { if (run) advance(1, false); });
    $('btn-prev').addEventListener('click', function () { if (run) advance(-1, false); });

    // Tap anywhere on the jump overlay to get running again immediately.
    $('jump').addEventListener('click', function () { Metro.resume(); });
    $('jump').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Metro.resume(); }
    });

    wireSettings();
    wireWelcome();

    $('btn-quit').addEventListener('click', function () {
      if (!run) { go('home'); return; }
      if (!confirm('End this workout? It will not be logged.')) return;
      stopTimer();
      run = null;
      $('btn-pause').textContent = 'Pause';
      go('home');
    });

    $('done-picker').addEventListener('click', function (e) {
      var b = e.target.closest('.seg__btn');
      if (b) setDonePick(b.dataset.done);
    });

    $('btn-save').addEventListener('click', function () {
      if (!pending) { go('home'); return; }
      if (pending.completedInTime === null) {
        alert('Please answer whether you completed the movements within 11 minutes — the plan uses it to decide when you move up.');
        return;
      }
      pending.notes = $('notes').value.trim();
      sessions.push(pending);
      save(K_SESSIONS, sessions);
      pending = null;
      $('btn-pause').textContent = 'Pause';
      go('home');
    });

    $('btn-discard').addEventListener('click', function () {
      if (!confirm('Discard this session?')) return;
      pending = null;
      $('btn-pause').textContent = 'Pause';
      go('home');
    });

    $('btn-export').addEventListener('click', exportData);

    // Recover timer drift when the tab is backgrounded and restored.
    document.addEventListener('visibilitychange', function () {
      if (run && !document.hidden) { run.last = Date.now(); keepAwake(true); }
    });

    window.addEventListener('beforeunload', function (e) {
      if (run) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ============================ boot ============================ */

  fetch(DATA_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      D = data;
      prefs = load(K_PREFS, null) || { chartId: 1, level: 'D-', ex5Mode: 'stationary', age: null };
      // Coaching aids default off, so an existing install behaves as before.
      if (prefs.voiceCues === undefined) prefs.voiceCues = false;
      if (prefs.metronome === undefined) prefs.metronome = false;
      if (!prefs.jumpResume) prefs.jumpResume = 'auto';
      if (prefs.jumpWindow === undefined) prefs.jumpWindow = null;
      if (!chartById(prefs.chartId).levels[prefs.level]) { prefs.chartId = 1; prefs.level = 'D-'; }
      if (prefs.seenWelcome === undefined) prefs.seenWelcome = false;
      save(K_PREFS, prefs);   // persist the normalised defaults
      Voice.init();
      sessions = load(K_SESSIONS, []);
      $('boot').hidden = true;
      $('app').hidden = false;
      wire();
      go(prefs.seenWelcome ? 'home' : 'welcome');

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    })
    .catch(function (err) {
      $('boot').textContent = 'Could not load the 5BX chart data (' + err.message + '). Serve this folder over http:// rather than opening the file directly.';
    });
})();

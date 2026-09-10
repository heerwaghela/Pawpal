/* ============================================================
   PawPal — router, gestures, counters, charts, presenter shell
   No dependencies, no modules, no network. Runs from file://
   ============================================================ */
(function () {
'use strict';

var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* the order the arrow keys walk, which is also the demo script */
var ORDER = ['s-signin','s-onboard','s-home','s-assistant','s-emergency','s-profile',
             's-vaccines','s-records','s-feeding','s-growth','s-spending','s-poster',
             's-community','s-settings'];

var SHORT = {
  's-home':'Care thread', 's-assistant':'Assistant', 's-profile':'Bruno',
  's-vaccines':'Vaccinations', 's-records':'Records', 's-feeding':'Feeding',
  's-growth':'Growth', 's-spending':'Spending', 's-poster':'Lost poster',
  's-community':'Community', 's-settings':'Settings'
};

var TAB_ROOTS = ['s-home','s-spending','s-community','s-profile'];

var viewport = $('#viewport');
var tabbar   = $('#tabbar');
var statusbar= $('#statusbar');
var homeInd  = $('#homeIndicator');
var compact  = $('#compactBar');
var toastEl  = $('#toast');

var current = null;
var stack   = [];
var busy    = false;
var pending = null;

/* ------------------------------------------------------------
   fit the phone to the window
   ------------------------------------------------------------ */
function fit() {
  var pad = window.innerHeight > 900 ? 96 : 40;
  var s = Math.min(1, (window.innerHeight - pad) / 872);
  $('#phoneWrap').style.setProperty('--fit', Math.max(0.45, s));
}
window.addEventListener('resize', fit);
fit();

/* ------------------------------------------------------------
   router
   ------------------------------------------------------------ */
function screenEl(id) { return document.getElementById(id); }

function kindFor(to) {
  if (to === 's-emergency') return 'sheet';
  if (current === 's-emergency') return 'unsheet';
  if (TAB_ROOTS.indexOf(to) > -1 && TAB_ROOTS.indexOf(current) > -1) return 'fade';
  if (stack.indexOf(to) > -1) return 'pop';
  return 'push';
}

var CLASSES = {
  push:    ['push-in',  'push-out'],
  pop:     ['pop-in',   'pop-out'],
  sheet:   ['sheet-in', 'under-out'],
  unsheet: ['under-in', 'sheet-out'],
  fade:    ['fade-in',  'fade-out']
};

function go(to, kind) {
  if (to === current || !screenEl(to)) return;
  /* a tap that lands mid-transition waits its turn rather than being dropped */
  if (busy) { pending = to; return; }
  kind = kind || kindFor(to);

  var inEl  = screenEl(to);
  var outEl = current ? screenEl(current) : null;

  /* keep a back stack that mirrors what the user actually did */
  if (kind === 'pop') { stack = stack.slice(0, stack.indexOf(to)); }
  else if (current && kind !== 'unsheet') { stack.push(current); }
  else if (kind === 'unsheet') { stack.pop(); }

  inEl.scrollTop = 0;
  inEl.classList.remove('settled');
  inEl.classList.add('is-active');
  chrome(to);

  if (reduced || !outEl) {
    if (outEl) { outEl.classList.remove('is-active','is-moving'); }
    current = to; settle(inEl); return;
  }

  busy = true;
  var cls = CLASSES[kind];
  outEl.classList.add('is-moving', cls[1]);
  outEl.classList.remove('is-active');
  inEl.classList.add(cls[0]);

  var done = function () {
    inEl.classList.remove(cls[0]);
    outEl.classList.remove('is-moving', cls[1]);
    busy = false;
    settle(inEl);
    if (pending) { var p = pending; pending = null; go(p); }
  };
  var t = setTimeout(done, 700);
  inEl.addEventListener('animationend', function h() {
    inEl.removeEventListener('animationend', h); clearTimeout(t); done();
  });
  current = to;
}

function back() {
  if (stack.length) { go(stack[stack.length - 1], current === 's-emergency' ? 'unsheet' : 'pop'); }
  else { go('s-home', 'pop'); }
}

/* replay entrance animations every time a screen is shown */
function settle(el) {
  void el.offsetWidth;
  el.classList.add('settled');
  countUp(el);
  if (el.id === 's-assistant') runAssistant();
}

/* status bar, tab bar, caption, compact header */
function chrome(id) {
  var el = screenEl(id);
  var dark = el.getAttribute('data-dark') === '1';
  statusbar.classList.toggle('on-dark', dark);
  homeInd.classList.toggle('on-dark', dark);

  var tab = el.getAttribute('data-tab');
  var rootScreen = TAB_ROOTS.indexOf(id) > -1;
  tabbar.classList.toggle('hidden', !rootScreen);
  $$('.tab').forEach(function (t) {
    t.classList.toggle('active', !!tab && t.getAttribute('data-tab-id') === tab);
  });

  compact.textContent = SHORT[id] || '';
  compact.classList.remove('show');

  var i = ORDER.indexOf(id);
  $('#capName').textContent = (el.getAttribute('data-name') || '').replace(/&middot;/g, '·');
  $('#capIdx').textContent = (i + 1) + ' / ' + ORDER.length;
  $$('#jumplist button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-jump') === id);
  });
}

/* ------------------------------------------------------------
   scroll: compact header
   ------------------------------------------------------------ */
$$('.screen').forEach(function (s) {
  s.addEventListener('scroll', function () {
    if (s.id !== current || !SHORT[s.id]) return;
    compact.classList.toggle('show', s.scrollTop > 52);
  }, { passive: true });
});

/* ------------------------------------------------------------
   numbers count up
   ------------------------------------------------------------ */
function countUp(root) {
  $$('[data-count]', root).forEach(function (el) {
    if (el.dataset.done === '1' && el.dataset.replay !== '1') { return; }
    var to  = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    var suf = el.getAttribute('data-suffix') || '';
    var com = el.getAttribute('data-comma') === '1';
    var from = parseFloat(el.dataset.from || '0');
    var dur = reduced ? 0 : 1100, t0 = null;

    var fmt = function (v) {
      var s = v.toFixed(dec);
      if (com) s = Number(s).toLocaleString('en-IN');
      return s + suf;
    };
    if (!dur) { el.textContent = fmt(to); el.dataset.done = '1'; return; }

    var stopped = false;
    function finish() {
      stopped = true;
      el.textContent = fmt(to);
      el.dataset.done = '1';
      el.dataset.from = to;
      el.dataset.replay = '0';
    }
    function step(ts) {
      if (stopped) return;
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else finish();
    }
    requestAnimationFrame(step);
    /* if frames stall — a hidden tab, a laggy projector — never leave a
       half-counted number on screen */
    setTimeout(function () { if (!stopped) finish(); }, dur + 700);
  });
}

/* ------------------------------------------------------------
   charts
   ------------------------------------------------------------ */
$$('.chart .line').forEach(function (p) {
  var len = Math.ceil(p.getTotalLength());
  p.style.setProperty('--len', len);
});

var SPEND = [
  { name: 'Food',      value: 1650, colour: '#23372B' },
  { name: 'Vet',       value:  890, colour: '#E8A33D' },
  { name: 'Medicines', value:  300, colour: '#E7C8BE' },
  { name: 'Grooming',  value:    0, colour: '#C9C2B2' }
];

function drawDonut() {
  var svg = $('.donut');
  if (!svg) return;
  $$('.seg', svg).forEach(function (c) { c.remove(); });

  var R = 68, C = 2 * Math.PI * R;
  var total = SPEND.reduce(function (a, s) { return a + s.value; }, 0) || 1;
  var start = 0, i = 0;

  SPEND.forEach(function (s) {
    if (s.value <= 0) return;
    var frac = s.value / total, len = frac * C;
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', 'seg');
    c.setAttribute('cx', 79); c.setAttribute('cy', 79); c.setAttribute('r', R);
    c.setAttribute('stroke', s.colour);
    c.setAttribute('transform', 'rotate(' + (start * 360) + ' 79 79)');
    c.style.setProperty('--dash', len.toFixed(2) + ' ' + C.toFixed(2));
    c.style.setProperty('--len', len.toFixed(2));
    c.style.setProperty('--d', i++);
    svg.appendChild(c);
    start += frac;
  });

  $$('.donut-key div').forEach(function (row, n) {
    var s = SPEND[n];
    row.querySelector('span').textContent = Math.round(s.value / total * 100) + '%';
  });
}
drawDonut();

/* ------------------------------------------------------------
   toast
   ------------------------------------------------------------ */
var toastT;
function toast(msg) {
  toastEl.innerHTML = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
}

/* ------------------------------------------------------------
   emergency opens with a wash of red from wherever you tapped
   ------------------------------------------------------------ */
function emergency(ev) {
  if (reduced) { go('s-emergency', 'sheet'); return; }
  var r = viewport.getBoundingClientRect();
  var x = ev ? ev.clientX - r.left : 196;
  var y = ev ? ev.clientY - r.top  : 120;
  var far = Math.max(
    Math.hypot(x, y), Math.hypot(r.width - x, y),
    Math.hypot(x, r.height - y), Math.hypot(r.width - x, r.height - y)
  );
  var w = document.createElement('div');
  w.className = 'wash';
  w.style.left = x + 'px'; w.style.top = y + 'px';
  w.style.width = w.style.height = (far * 2) + 'px';
  viewport.appendChild(w);
  setTimeout(function () { go('s-emergency', 'fade'); }, 380);
  setTimeout(function () { w.remove(); }, 900);
}

/* ------------------------------------------------------------
   one delegated click handler for the whole prototype
   ------------------------------------------------------------ */
document.addEventListener('click', function (e) {
  var t;

  if ((t = e.target.closest('[data-emergency]'))) { emergency(e); return; }
  if ((t = e.target.closest('[data-back]')))      { back(); return; }
  if ((t = e.target.closest('[data-go]')))        { go(t.getAttribute('data-go')); return; }
  if ((t = e.target.closest('[data-tab-go]')))    { go(t.getAttribute('data-tab-go')); return; }
  if ((t = e.target.closest('[data-jump]')))      { go(t.getAttribute('data-jump'), 'fade'); return; }

  if ((t = e.target.closest('[data-meal]'))) {
    var on = t.classList.toggle('given');
    t.querySelector('.word').textContent = on ? 'Given' : '7:00 pm';
    toast(on ? 'Dinner logged &middot; 180 g' : 'Dinner unlogged');
    return;
  }
  if ((t = e.target.closest('[data-switch]'))) { t.classList.toggle('on'); return; }

  if ((t = e.target.closest('.pet'))) {
    if (t.hasAttribute('data-pet')) {
      $$('.pet').forEach(function (p) { p.classList.remove('on'); });
      t.classList.add('on');
      toast('Showing ' + t.getAttribute('data-pet') + '&rsquo;s thread');
      return;
    }
  }
  if ((t = e.target.closest('[data-pick]'))) {
    var group = t.getAttribute('data-pick');
    $$('[data-pick="' + group + '"]').forEach(function (c) { c.classList.remove('on'); });
    t.classList.add('on');
    return;
  }
  if ((t = e.target.closest('[data-toggle]'))) { t.classList.toggle('on'); return; }

  if ((t = e.target.closest('[data-toast]'))) { toast(t.getAttribute('data-toast')); return; }
}, false);

/* ripple on filled buttons */
document.addEventListener('pointerdown', function (e) {
  var b = e.target.closest('.btn, .call');
  if (!b || reduced) return;
  var r = b.getBoundingClientRect();
  var s = document.createElement('span');
  s.className = 'ripple';
  var d = Math.max(r.width, r.height) * 2.2;
  s.style.width = s.style.height = d + 'px';
  s.style.left = (e.clientX - r.left) + 'px';
  s.style.top  = (e.clientY - r.top) + 'px';
  b.appendChild(s);
  setTimeout(function () { s.remove(); }, 640);
});

/* ------------------------------------------------------------
   screen-specific behaviour
   ------------------------------------------------------------ */

/* password reveal */
$('#revealPw').addEventListener('click', function () {
  var f = $('#pw'), shown = f.type === 'text';
  f.type = shown ? 'password' : 'text';
  this.textContent = shown ? 'Show' : 'Hide';
  this.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
});

/* sign in: button morphs to a spinner, then a tick, then hands off */
$('#signinForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var b = $('#signinBtn');
  if (b.classList.contains('working')) return;
  var label = b.textContent;
  b.classList.add('working');
  b.innerHTML = '<span class="spinner"></span>';
  setTimeout(function () {
    b.classList.add('done');
    b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.6 4.5L19 7"/></svg>';
  }, 1100);
  setTimeout(function () {
    go('s-onboard');
    b.classList.remove('working', 'done');
    b.textContent = label;
  }, 1750);
});

/* onboarding steps */
var step = 1;
function setStep(n) {
  step = Math.max(1, Math.min(3, n));
  $$('#s-onboard .step').forEach(function (s) {
    s.classList.toggle('on', +s.getAttribute('data-step') === step);
  });
  $$('#s-onboard .steps i').forEach(function (i, n2) { i.classList.toggle('on', n2 < step); });
  $('#onboardNext').textContent = step === 3 ? 'Start the care thread' : 'Continue';
  $('#onboardBack').style.display = step === 1 ? 'none' : '';
}
$('#onboardNext').addEventListener('click', function () {
  if (step === 3) { setStep(1); go('s-home'); toast('Bruno&rsquo;s thread is live'); }
  else setStep(step + 1);
});
$('#onboardBack').addEventListener('click', function () { setStep(step - 1); });

/* assistant: type, then cascade the answer in */
var assistantRan = false, assistantT = [];
function runAssistant(force) {
  if (assistantRan && !force) return;
  assistantRan = true;
  assistantT.forEach(clearTimeout); assistantT = [];
  var typing = $('#typing'), answer = $('#answer'), label = $('#assistantLabel');
  typing.hidden = false; answer.hidden = true; label.hidden = true;
  assistantT.push(setTimeout(function () {
    typing.hidden = true; label.hidden = false; answer.hidden = false;
    $$('#answer .part').forEach(function (p) {
      p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
    });
  }, reduced ? 0 : 1500));
}

/* asking a question replays the answer */
$('#askForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var v = $('#askInput').value.trim();
  if (!v) return;
  var b = document.createElement('div');
  b.className = 'bubble-me';
  b.textContent = v;
  $('#thread-chat').insertBefore(b, $('#assistantLabel'));
  $('#askInput').value = '';
  runAssistant(true);
  setTimeout(function () {
    $('#s-assistant').scrollTop = $('#s-assistant').scrollHeight;
  }, 60);
});

/* spending: adding an expense redraws the donut */
$('#addExpense').addEventListener('click', function () {
  var groom = SPEND[3];
  if (groom.value > 0) { toast('Grooming already logged this month'); return; }
  groom.value = 300;
  var rows = $$('#s-spending .rows .row');
  rows[3].classList.remove('faded');
  rows[3].querySelector('.v').innerHTML = '&#8377;300';
  var total = $('#s-spending [data-count]');
  total.dataset.from = 2840;
  total.setAttribute('data-count', '3140');
  total.dataset.replay = '1';
  countUp($('#s-spending'));
  drawDonut();
  $('#s-spending').classList.remove('settled');
  void $('#s-spending').offsetWidth;
  $('#s-spending').classList.add('settled');
  toast('&#8377;300 logged to Grooming');
});

/* pull to refresh on home */
(function () {
  var home = $('#s-home'), knob = $('#refresh');
  var y0 = null, pull = 0;
  home.addEventListener('pointerdown', function (e) {
    if (home.scrollTop > 0) return;
    y0 = e.clientY; pull = 0;
  });
  home.addEventListener('pointermove', function (e) {
    if (y0 === null) return;
    pull = Math.max(0, e.clientY - y0);
    if (pull > 4) {
      knob.classList.add('pull');
      knob.style.transform = 'translateY(' + Math.min(pull * .45, 46) + 'px) rotate(' + pull + 'deg)';
    }
  });
  home.addEventListener('pointerup', function () {
    if (y0 === null) return;
    if (pull > 70) {
      knob.classList.add('spin');
      knob.style.transform = 'translateY(40px)';
      setTimeout(function () {
        knob.classList.remove('pull', 'spin');
        knob.style.transform = '';
        toast('Care thread up to date');
      }, 1200);
    } else {
      knob.classList.remove('pull');
      knob.style.transform = '';
    }
    y0 = null;
  });
  home.addEventListener('pointercancel', function () { y0 = null; knob.classList.remove('pull'); knob.style.transform = ''; });
})();

/* ------------------------------------------------------------
   presenter shell
   ------------------------------------------------------------ */
var list = $('#jumplist');
ORDER.forEach(function (id) {
  var el = screenEl(id);
  var li = document.createElement('li');
  var b = document.createElement('button');
  b.setAttribute('data-jump', id);
  b.textContent = (el.getAttribute('data-name') || id).replace(/&middot;/g, '·').split('·')[0].trim();
  li.appendChild(b); list.appendChild(li);
});

function togglePresenter(on) {
  var p = $('#presenter');
  var open = on === undefined ? !p.classList.contains('open') : on;
  p.classList.toggle('open', open);
  $('#nudge').style.opacity = open ? 0 : 1;
}

document.addEventListener('keydown', function (e) {
  if (e.target.matches('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  var i = ORDER.indexOf(current);
  if (e.key === 'ArrowRight') { go(ORDER[Math.min(ORDER.length - 1, i + 1)], 'fade'); }
  else if (e.key === 'ArrowLeft') { go(ORDER[Math.max(0, i - 1)], 'fade'); }
  else if (e.key === 'p' || e.key === 'P') { togglePresenter(); }
  else if (e.key === 'g' || e.key === 'G') { $('#gridOverlay').classList.toggle('on'); }
  else if (e.key === 'r' || e.key === 'R') {
    var el = screenEl(current);
    el.classList.remove('settled'); void el.offsetWidth;
    $$('[data-count]', el).forEach(function (n) { n.dataset.done = '0'; n.dataset.from = '0'; });
    if (current === 's-assistant') assistantRan = false;
    settle(el);
  }
  else if (e.key === 'Escape') { togglePresenter(false); }
});

/* hide the keyboard nudge once they have used it */
setTimeout(function () { $('#nudge').style.opacity = .35; }, 9000);

/* ------------------------------------------------------------
   launch
   ------------------------------------------------------------ */
var start = (location.search.match(/screen=([\w-]+)/) || [])[1];
start = start ? ('s-' + start.replace(/^s-/, '')) : 's-signin';
if (!screenEl(start)) start = 's-signin';

setStep(1);

setTimeout(function () {
  $('#boot').classList.add('gone');
  setTimeout(function () { $('#boot').remove(); }, 700);
  var el = screenEl(start);
  el.classList.add('is-active');
  current = start;
  chrome(start);
  settle(el);
}, reduced ? 100 : 1750);

})();

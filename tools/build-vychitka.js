#!/usr/bin/env node
// СБОРКА ФАЙЛА ДЛЯ ВЫЧИТКИ. На выходе — ОДИН автономный html, который можно отправить
// человеку: он открывает его двойным щелчком, читает всё, что видит участник, пишет
// замечания и одной кнопкой сохраняет их одним файлом.
//
// ⚠ ПОЧЕМУ ГЕНЕРАТОР, А НЕ СТРАНИЦА НА СЕРВЕРЕ. Автономный файл обязан нести тексты
// внутри себя — иначе он не откроется без сервера. А копия текстов, набранная руками,
// разошлась бы с платформой на первой же правке реплики. Поэтому тексты не копируются,
// а ВЫНИМАЮТСЯ из тех же файлов, что рисуют экран участника, каждый раз при сборке:
//   scenes.js      — маршрут, реплики, установка дня, S.measures (что меряем)
//   mechanics.js   — названия верстаков
//   mech-fields.js — подписи полей рабочей области (они же подписи на экране,
//                    это держит eval/lint_harness.js)
// В файл вписывается версия маршрута, так что устаревший файл видно сразу.
//
// Запуск из корня платформы:  node tools/build-vychitka.js [куда_положить.html]
// По умолчанию кладёт рядом с папкой платформы: ../Вычитка_текстов_<версия>.html
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'js', 'backlog.js'));
require(path.join(ROOT, 'js', 'mechanics.js'));
require(path.join(ROOT, 'js', 'scenes.js'));
require(path.join(ROOT, 'js', 'mech-fields.js'));

const S = global.window.imp.scenes;
const F = global.window.imp.mechFields;
const TITLES = global.window.imp.mechTitles || {};

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── ЧТО МЕРИМ ────────────────────────────────────────────────────────────────
function measuresHtml(key) {
  const m = key && S.measures ? S.measures[key] : null;
  if (!m) return '';
  const named = (arr) => arr.map((a) => {
    const n = S.abilityNames && S.abilityNames[a];
    return '<b>' + esc(a) + '</b>' + (n ? ' · ' + esc(n) : '');
  }).join('; ');
  const parts = [];
  if (m.main.length) parts.push('меряет: ' + named(m.main));
  if (m.control.length) parts.push('контроль: ' + named(m.control));
  if (m.note) parts.push(esc(m.note));
  if (!parts.length) return '';
  return '<div class="vy-measures' + (m.main.length ? '' : ' is-none') + '">' + parts.join(' &nbsp;·&nbsp; ') + '</div>';
}

// ── РЕПЛИКИ ──────────────────────────────────────────────────────────────────
// Порядок ровно как на экране: before над областью, lead строкой-указателем, bubbles
// монологом, ask под областью, probe после действия, after после фиксации. Подстановки
// {name} и {people}/{money} оставляем видимыми: вычитывается шаблон, а не подстановка.
const FIELD_HINT = {
  before: 'над рабочей областью',
  lead: 'строка-указатель',
  ask: 'под рабочей областью',
  probe: 'после действия участника',
  probeReturn: 'вместо предыдущей, если участник вернулся и ИЗМЕНИЛ разбор',
  after: 'после фиксации ответа',
  silence: 'если участник молчит'
};

function bubbles(act, field, note) {
  const lines = S.speechLines(act, field);
  if (!lines.length) return '';
  const v = act[field];
  let who = '';
  if (field === 'bubbles') who = act.who || '';
  else if (v && v.who) who = v.who;
  else who = act.who || '';
  const hint = FIELD_HINT[field] || '';
  let h = '<div class="vy-who">' + esc(who || 'реплика') +
    (hint ? ' <i>— ' + esc(hint) + '</i>' : '') +
    (note ? ' <i>· ' + esc(note) + '</i>' : '') + '</div>';
  const arr = (field === 'bubbles') ? act.bubbles
    : (field === 'lead' || field === 'silence') ? null
    : (v && v.bubbles) || null;
  if (arr) arr.forEach((b) => { h += '<div class="vy-b">' + esc(b.text) + '</div>'; });
  else lines.forEach((l) => { h += '<div class="vy-b">' + esc(l) + '</div>'; });
  return h;
}

// ── РАБОЧАЯ ОБЛАСТЬ ──────────────────────────────────────────────────────────
function workHtml(act) {
  if (act.kind === 'window') {
    return '<div class="vy-work"><div class="vy-work-h">рабочая область · свободный ответ</div>' +
      '<div class="vy-f"><label>' + esc(act.label || '') + '</label>' +
      '<div class="box tall">' + esc(act.placeholder || 'ваш ответ') + '</div></div>' +
      '<span class="vy-cta">Ответить →</span></div>';
  }
  if (act.kind !== 'mechanic') return '';
  const f = F[act.mech];
  if (!f) return '';
  let h = '<div class="vy-work"><div class="vy-work-h">рабочая область · ' +
    esc(TITLES[act.mech] || act.mech) + '</div>';
  let forms = [['form', '']];
  if (act.mech === 'seal') {
    forms = [['form', 'такт первый — ход'],
             ['formHeld', 'если участник уже возвращался: вернуться второй раз нельзя'],
             ['formPhrase', 'такт второй — одна фраза, спрашивается после подтверждения']];
  }
  forms.forEach(([key, cap]) => {
    const form = f[key];
    if (!form) return;
    if (cap) h += '<div class="vy-rep"><b>' + esc(cap) + '</b></div>';
    Object.keys(form).forEach((k) => {
      const v = form[k];
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        h += '<div class="vy-f"><label>' + esc(k) + '</label>';
        Object.keys(v[0]).forEach((sub) => {
          h += '<div class="vy-f" style="margin-left:14px;"><label>' + esc(sub) + '</label>' +
               '<div class="box">' + esc(String(v[0][sub])) + '</div></div>';
        });
        h += '<div class="vy-rep">карточка повторяется — участник добавляет столько, сколько нужно</div></div>';
      } else if (v && typeof v === 'object') {
        h += '<div class="vy-f"><label>' + esc(k) + '</label>';
        Object.keys(v).forEach((sub) => {
          h += '<div class="vy-f" style="margin-left:14px;"><label>' + esc(sub) + '</label>' +
               '<div class="box">' + esc(String(v[sub])) + '</div></div>';
        });
        h += '</div>';
      } else {
        h += '<div class="vy-f"><label>' + esc(k) + '</label><div class="box">' + esc(String(v)) + '</div></div>';
      }
    });
  });
  if (act.mech === 'list') {
    h += '<div class="vy-rep">двадцать заявок направлений, по каждой одно из трёх: берём / не сейчас / не делаем. ' +
         'Пока участник раскладывает, у стопки «Берём» живьём считается сумма взятого — людей и денег.</div>';
  }
  if (act.mech === 'seal') {
    h += '<div class="vy-rep">две кнопки рядом: «← Вернуться и изменить» и «Подтвердить →». Вернуться можно один раз.</div>';
  }
  return h + '</div>';
}

// ── БЛОКИ ────────────────────────────────────────────────────────────────────
const WHEN = {
  overspend: 'условный шаг: только если участник вышел за 500 человек или 22 млрд',
  severova: 'условный шаг: только если участник выбрал разговор с командой Северовой'
};
const blocks = [];

(function setup() {
  const s = S.system;
  const flat = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean);
  let h = '<div class="vy-who">введение в роль</div>';
  flat(s.lead).forEach((t) => { h += '<div class="vy-b">' + esc(t) + '</div>'; });
  h += '<div class="vy-who">' + esc(s.title) + '</div>';
  flat(s.rules).forEach((t) => { h += '<div class="vy-b">' + esc(t) + '</div>'; });
  flat(s.howItWorks).forEach((t) => { h += '<div class="vy-b">' + esc(t) + '</div>'; });
  h += '<div class="vy-who">' + esc(s.screenTitle) + '</div>';
  flat(s.screen).forEach((t) => { h += '<div class="vy-b">' + esc(t) + '</div>'; });
  if (s.note) h += '<div class="vy-who">приписка под экраном</div><div class="vy-b">' + esc(s.note) + '</div>';
  blocks.push({ id: 'setup', title: 'Установка дня', where: 'до первого вопроса', kind: 'текст', body: h });
})();

blocks.push({
  id: 'case', title: 'Пакет материалов',
  where: 'справка о компании и десять приложений', kind: 'кейс',
  body: '<div class="vy-b">Текст пакета участник читает во вкладке «О компании». В этот файл он не вложен: ' +
    'это отдельный документ (' + esc(S.caseVersion) + '), и вычитывается он отдельно — иначе файл стал бы ' +
    'неподъёмным, а копия текста разошлась бы с оригиналом. Замечания по самому пакету пишите справа.</div>'
});

S.scenes.forEach((sc) => {
  sc.acts.forEach((act, ai) => {
    const id = act.id || (sc.id + '.' + ai);
    const where = sc.name + ', ' + sc.where;
    if (act.kind === 'case') return;

    if (act.kind === 'interlude') {
      const br = sc.bridge || {};
      let body = '';
      if (br.sent) body += '<div class="vy-b">' + esc(br.sent) + '</div>';
      (br.lead || []).forEach((t) => { body += '<div class="vy-b">' + esc(t) + '</div>'; });
      if (!body) return;
      blocks.push({ id, title: 'Переход → ' + sc.name, where: sc.where, kind: 'межсценовый экран', body });
      return;
    }

    if (act.kind === 'speech') {
      let body = bubbles(act, 'bubbles', act.note) + bubbles(act, 'after', '');
      if (!body) return;
      blocks.push({ id, title: 'Реплика · ' + (act.who || sc.name), where, kind: 'реплика', body, when: act.when });
      return;
    }

    let title = (act.kind === 'mechanic') ? (TITLES[act.mech] || act.mech) : (act.label || act.save);
    title = title.charAt(0).toUpperCase() + title.slice(1);
    let body = '';
    ['before', 'lead', 'bubbles'].forEach((fl) => { body += bubbles(act, fl, fl === 'bubbles' ? act.note : ''); });
    body += workHtml(act);
    ['ask', 'probe', 'probeReturn', 'silence', 'after'].forEach((fl) => { body += bubbles(act, fl, ''); });
    blocks.push({
      id, title, where, kind: act.kind === 'mechanic' ? 'верстак' : 'окно',
      body, when: act.when, measuresHtml: measuresHtml(act.save || act.mech),
      measures: S.measures ? S.measures[act.save || act.mech] || null : null
    });
  });
});

// ── ФАЙЛ ─────────────────────────────────────────────────────────────────────
// Шрифт — системный: файл должен читаться и без интернета.
const CSS = `
  :root { --ink:#1a1a1a; --muted:#6b6e73; --hair:#e3e4e6; --soft:#f4f5f6; --paper:#fff;
          --acc:#ff4800; --acc-tint:#fff0eb; --acc-ink:#c43700; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); line-height:1.5;
         font-family:-apple-system,BlinkMacSystemFont,"Inter Tight","Segoe UI",Roboto,Arial,sans-serif; }
  .vy-wrap { max-width:1180px; margin:0 auto; padding:18px 32px 96px; }
  h1 { font-size:26px; margin:14px 0 4px; letter-spacing:-.02em; }
  .vy-sub { font-size:12px; color:var(--muted); margin:0 0 14px; }
  .vy-lead { font-size:14px; color:var(--muted); max-width:74ch; margin:0 0 20px; }
  .vy-warn { margin:0 0 18px; padding:10px 13px; border-radius:6px; background:var(--acc-tint);
             color:var(--acc-ink); font-size:13px; }
  .vy-toc { position:sticky; top:0; z-index:5; background:var(--paper); padding:10px 0 11px;
            border-bottom:1px solid var(--hair); margin:0 0 24px; }
  .vy-toc-row { display:flex; flex-wrap:wrap; gap:5px; }
  .vy-toc a { padding:3px 8px; border:1px solid var(--hair); border-radius:4px; font-size:12px;
              color:var(--muted); text-decoration:none; white-space:nowrap; }
  .vy-toc a:hover { color:var(--ink); border-color:var(--ink); }
  .vy-toc a.has-note { border-color:var(--acc); color:var(--acc-ink); font-weight:600; }
  .vy-step { display:grid; grid-template-columns:1fr 340px; gap:24px; align-items:start;
             padding:0 0 24px; margin:0 0 24px; border-bottom:1px solid var(--hair); }
  @media (max-width:1000px){ .vy-step { grid-template-columns:1fr; } }
  .vy-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:9px; margin:0 0 4px; }
  .vy-num { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .vy-title { margin:0; font-size:17px; font-weight:700; letter-spacing:-.01em; }
  .vy-kind { font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
  .vy-where { font-size:12px; color:var(--muted); }
  .vy-measures { margin:8px 0 13px; padding-left:10px; border-left:2px solid var(--hair);
                 font-size:12.5px; color:var(--muted); }
  .vy-measures b { color:var(--ink); font-weight:600; }
  .vy-measures.is-none { border-left-color:var(--acc); }
  .vy-branch { display:inline-block; margin:0 0 9px; padding:3px 9px; border-radius:4px;
               background:var(--acc-tint); color:var(--acc-ink); font-size:12.5px; font-weight:600; }
  .vy-who { font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
            color:var(--muted); margin:12px 0 5px; }
  .vy-who i { font-weight:400; letter-spacing:0; text-transform:none; }
  .vy-b { margin:0 0 6px; padding:9px 13px; background:var(--soft); border-radius:12px;
          font-size:15px; max-width:62ch; }
  .vy-work { margin:12px 0 0; padding:13px 15px; border:1px solid var(--hair); border-radius:8px; }
  .vy-work-h { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
               color:var(--muted); margin:0 0 9px; }
  .vy-f { margin:0 0 11px; }
  .vy-f label { display:block; font-size:13.5px; margin:0 0 4px; }
  .vy-f .box { border:1px solid var(--hair); border-radius:6px; padding:8px 11px; color:var(--muted); font-size:12.5px; }
  .vy-f .box.tall { min-height:50px; }
  .vy-rep { margin:6px 0 0; font-size:12.5px; color:var(--muted); }
  .vy-cta { display:inline-block; margin-top:6px; padding:6px 14px; border-radius:6px;
            background:var(--acc); color:#fff; font-size:12.5px; font-weight:600; }
  .vy-note { position:sticky; top:62px; }
  .vy-note-h { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
               color:var(--muted); margin:0 0 6px; }
  .vy-note textarea { width:100%; min-height:130px; padding:10px 12px; border:1px solid var(--hair);
                      border-radius:6px; font:inherit; font-size:13px; line-height:1.55; resize:vertical; }
  .vy-note textarea:focus { outline:2px solid var(--acc); outline-offset:-1px; }
  .vy-note textarea.filled { border-color:var(--acc); }
  .vy-foot { position:fixed; left:0; right:0; bottom:0; z-index:10; background:var(--paper);
             border-top:1px solid var(--hair); padding:11px 32px; }
  .vy-foot-in { max-width:1180px; margin:0 auto; display:flex; flex-wrap:wrap; align-items:center; gap:13px; }
  button { font:inherit; font-size:13px; cursor:pointer; border-radius:6px; padding:8px 15px; border:1px solid var(--hair);
           background:#fff; color:var(--ink); }
  button.pri { background:var(--acc); border-color:var(--acc); color:#fff; font-weight:600; }
  .vy-count { font-size:13px; color:var(--muted); }
  .vy-count b { color:var(--ink); }
  .vy-said { font-size:12px; color:var(--muted); }
`;

const RUNTIME = `
(function () {
  'use strict';
  var BLOCKS = __BLOCKS__;
  var META = __META__;
  var KEY = 'imp_vychitka_' + META.version;
  var el = function (id) { return document.getElementById(id); };
  var store = (function () {
    // На file:// localStorage местами запрещён. Тогда работаем в памяти и говорим об
    // этом вслух: замечания живут до закрытия вкладки, значит скачивать надо сразу.
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
    catch (e) { return null; }
  })();
  var notes = {};
  if (store) { try { notes = JSON.parse(store.getItem(KEY) || '{}') || {}; } catch (e) { notes = {}; } }
  else { el('vyWarn').style.display = 'block'; }

  var host = el('vySteps'), toc = el('vyTocRow');
  BLOCKS.forEach(function (b, i) {
    var sec = document.createElement('section');
    sec.className = 'vy-step';
    sec.id = 'st-' + b.id;
    sec.innerHTML =
      '<div><div class="vy-head"><span class="vy-num">' + (i + 1) + ' / ' + BLOCKS.length + '</span>' +
      '<h3 class="vy-title">' + b.title + '</h3><span class="vy-kind">' + b.kind + '</span>' +
      '<span class="vy-where">' + b.where + '</span></div>' +
      (b.branch ? '<div class="vy-branch">' + b.branch + '</div>' : '') +
      (b.measuresHtml || '') + '<div>' + b.body + '</div></div>' +
      '<div class="vy-note"><div class="vy-note-h">замечания к этому шагу</div>' +
      '<textarea data-note="' + b.id + '" placeholder="что поправить в текстах этого шага"></textarea></div>';
    host.appendChild(sec);
    var a = document.createElement('a');
    a.href = '#st-' + b.id;
    a.id = 'toc-' + b.id;
    a.textContent = (i + 1) + '. ' + b.title;
    toc.appendChild(a);
  });

  function paint() {
    var n = 0;
    BLOCKS.forEach(function (b) {
      var filled = !!(notes[b.id] && notes[b.id].trim());
      if (filled) n++;
      var ta = host.querySelector('[data-note="' + b.id + '"]');
      if (ta) ta.className = filled ? 'filled' : '';
      var a = el('toc-' + b.id);
      if (a) a.className = filled ? 'has-note' : '';
    });
    el('vyCount').innerHTML = 'замечаний: <b>' + n + '</b> из ' + BLOCKS.length + ' шагов';
  }
  Array.prototype.forEach.call(host.querySelectorAll('[data-note]'), function (ta) {
    var k = ta.getAttribute('data-note');
    ta.value = notes[k] || '';
    ta.addEventListener('input', function () {
      notes[k] = ta.value;
      if (store) { try { store.setItem(KEY, JSON.stringify(notes)); } catch (e) {} }
      paint();
    });
  });
  paint();

  el('vySave').addEventListener('click', function () {
    var withNote = BLOCKS.filter(function (b) { return notes[b.id] && notes[b.id].trim(); });
    if (!withNote.length) { alert('Пока ни одного замечания — нечего сохранять.'); return; }
    var d = new Date(), pad = function (x) { return (x < 10 ? '0' : '') + x; };
    var stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    var out = [];
    out.push('# Замечания по текстам участника');
    out.push('');
    out.push('Маршрут ' + META.version + ' · кейс ' + META.caseVersion + ' · портфель ' + META.backlogVersion);
    out.push('Файл собран ' + META.built + ', вычитано ' + stamp + '.');
    out.push('Замечаний: ' + withNote.length + ' из ' + BLOCKS.length + ' шагов.');
    out.push('');
    var one = function (t) { return String(t == null ? '' : t).replace(/\\s+/g, ' ').trim(); };
    withNote.forEach(function (b, i) {
      out.push('## ' + (i + 1) + '. ' + b.title + '  (' + b.kind + ' · ' + b.where + ')');
      out.push('');
      if (b.branch) out.push(b.branch);
      if (b.measuresText) out.push('Замер: ' + b.measuresText);
      out.push('');
      out.push('**Текст, как его видит участник:**');
      out.push('');
      // ⚠ НЕ innerText: у узла вне документа переносов между блоками не возникает, и
      // реплики склеиваются в одну строку. Обходим элементы сами.
      var tmp = document.createElement('div');
      tmp.innerHTML = b.body;
      Array.prototype.forEach.call(
        tmp.querySelectorAll('.vy-who, .vy-b, .vy-work-h, .vy-rep, .vy-f > label, .vy-f .box, .vy-cta'),
        function (n2) {
          var t = one(n2.textContent);
          if (!t) return;
          var c = n2.className || '';
          if (c.indexOf('vy-who') >= 0 || c.indexOf('vy-work-h') >= 0) out.push('> **[' + t + ']**');
          else if (c.indexOf('vy-b') >= 0) out.push('> ' + t);
          else if (n2.tagName === 'LABEL') out.push('>   поле: ' + t);
          else if (c.indexOf('box') >= 0) out.push('>     подсказка в поле: ' + t);
          else if (c.indexOf('vy-cta') >= 0) out.push('>   кнопка: ' + t);
          else out.push('>   (' + t + ')');
        }
      );
      out.push('');
      out.push('**Замечание:**');
      out.push('');
      out.push(String(notes[b.id]).trim());
      out.push('');
      out.push('---');
      out.push('');
    });
    var rest = BLOCKS.filter(function (b) { return !(notes[b.id] && notes[b.id].trim()); });
    if (rest.length) {
      out.push('## Шаги без замечаний (' + rest.length + ')');
      out.push('');
      out.push(rest.map(function (b) { return b.title; }).join(' · '));
    }
    var blob = new Blob([out.join('\\n')], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'замечания_' + META.version + '_' + stamp.replace(/[: ]/g, '-') + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    el('vySaid').textContent = 'сохранено замечаний: ' + withNote.length;
  });

  el('vyClear').addEventListener('click', function () {
    if (!confirm('Стереть все замечания? Скачанный файл это не тронет.')) return;
    notes = {};
    if (store) { try { store.removeItem(KEY); } catch (e) {} }
    Array.prototype.forEach.call(host.querySelectorAll('[data-note]'), function (ta) { ta.value = ''; });
    paint();
    el('vySaid').textContent = 'замечания стёрты';
  });
})();
`;

const built = (() => {
  const d = new Date();
  const p = (x) => (x < 10 ? '0' : '') + x;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
})();

const payload = blocks.map((b) => {
  const mm = b.measures;
  let measuresText = '';
  if (mm) {
    const l = [];
    if (mm.main && mm.main.length) l.push('меряет ' + mm.main.join(', '));
    if (mm.control && mm.control.length) l.push('контроль ' + mm.control.join(', '));
    if (mm.note) l.push(mm.note);
    measuresText = l.join('; ');
  }
  return {
    id: b.id, title: esc(b.title), where: esc(b.where), kind: esc(b.kind),
    branch: b.when ? esc(WHEN[b.when] || ('условный шаг: ' + b.when)) : '',
    measuresHtml: b.measuresHtml || '', measuresText, body: b.body
  };
});

const meta = { version: S.version, caseVersion: S.caseVersion, backlogVersion: S.backlogVersion, built };

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Вычитка текстов участника — «Искра» ${esc(S.version)}</title>
<!-- Файл собран автоматически: node tools/build-vychitka.js в папке платформы.
     Тексты вынуты из scenes.js / mechanics.js / mech-fields.js — руками здесь ничего
     не набрано, поэтому разойтись с платформой файл не может. Версия маршрута в
     заголовке: если она отличается от нынешней, файл устарел и его надо собрать заново. -->
<style>${CSS}</style>
</head>
<body>
<div class="vy-wrap">
  <h1>Всё, что читает участник за день</h1>
  <p class="vy-sub">Маршрут ${esc(S.version)} · кейс ${esc(S.caseVersion)} · портфель ${esc(S.backlogVersion)} · файл собран ${esc(built)}</p>
  <p class="vy-lead">Шаги идут в том порядке, в котором их проходит человек. Под заголовком — что этими
    репликами меряется: участник такой строки не видит, она только для вычитки. Условные шаги и разные
    варианты реплик показаны, а не спрятаны: где собеседник спрашивает по-разному, обе реплики стоят рядом
    с условием. Замечания пишите справа от шага. Когда закончите — кнопка внизу сохранит их одним файлом,
    его и пришлите обратно.</p>
  <div class="vy-warn" id="vyWarn" style="display:none;">Браузер не даёт этому файлу ничего запоминать,
    поэтому замечания живут только до закрытия вкладки. Сохраняйте их кнопкой внизу, не откладывая.</div>
  <nav class="vy-toc"><div class="vy-toc-row" id="vyTocRow"></div></nav>
  <div id="vySteps"></div>
</div>
<div class="vy-foot"><div class="vy-foot-in">
  <button type="button" class="pri" id="vySave">Сохранить все замечания одним файлом</button>
  <span class="vy-count" id="vyCount">замечаний: <b>0</b></span>
  <button type="button" id="vyClear">Очистить всё</button>
  <span class="vy-said" id="vySaid"></span>
</div></div>
<script>
${RUNTIME.replace('__BLOCKS__', JSON.stringify(payload)).replace('__META__', JSON.stringify(meta))}
</script>
</body>
</html>
`;

const out = process.argv[2] ||
  path.resolve(ROOT, '..', 'Вычитка_текстов_' + S.version + '.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Собрано: ' + out);
console.log('  блоков: ' + blocks.length +
            ', из них с замером: ' + blocks.filter((b) => b.measuresHtml).length +
            ', условных: ' + blocks.filter((b) => b.when).length);
console.log('  размер: ' + Math.round(html.length / 1024) + ' КБ, всё внутри — ни одного внешнего файла');
console.log('  маршрут: ' + S.version + ' · кейс ' + S.caseVersion + ' · портфель ' + S.backlogVersion);

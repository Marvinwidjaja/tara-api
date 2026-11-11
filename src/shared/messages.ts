// Synced from the Expo app (TARA/src/shared/messages.ts) by `npm run sync-shared`. Edit it there.
/**
 * WhatsApp / SMS message templates in each caregiver's language.
 * Texts can't carry pictures, so plans go out as short numbered steps.
 * Every function returns `{ text, english }` so the parent always sees an English copy.
 */
import { activityById, anchorById, DEFAULT_SONG, GOAL_NAMES } from './library.js';
import type { Activity, Assignment, Caregiver, DevArea, Language, Localized } from './types.js';

const L = (en: string, es: string, zh: string, tl: string): Localized => ({ en, es, zh, tl });

export const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);

export const T = {
  invite: L(
    "Hi {cg}, it's {parent}. I'm using TARA to share simple activity ideas for {child}. It's not to check on you, just to make our days easier. Messages will come here in English. Reply YES if that's okay.",
    'Hola {cg}, soy {parent}. Uso TARA para compartir ideas sencillas de actividades para {child}. No es para vigilarte, solo para hacernos el día más fácil. Los mensajes llegarán aquí en español. Responde SÍ si estás de acuerdo.',
    '{cg}您好，我是{parent}。我在用TARA分享{child}的简单活动建议。不是为了检查您，只是想让大家更轻松。消息会用中文发到这里。同意的话请回复“好”。',
    'Hi {cg}, si {parent} ito. Ginagamit ko ang TARA para magbahagi ng simpleng aktibidad para kay {child}. Hindi ito para bantayan ka, para lang gumaan ang araw natin. Dito darating ang mga mensahe sa Tagalog. Sumagot ng OO kung okay lang.'
  ),
  joined: L(
    "Thank you, {cg}! You'll get {child}'s activities here. Reply DONE, SKIP or CHANGED after each one.",
    '¡Gracias, {cg}! Aquí recibirás las actividades de {child}. Responde HECHO, SALTADO o CAMBIADO después de cada una.',
    '谢谢{cg}！{child}的活动会发到这里。每项做完后回复：完成、跳过 或 改了。',
    'Salamat, {cg}! Dito mo matatanggap ang mga aktibidad ni {child}. Sumagot ng TAPOS, LAKTAW o IBA pagkatapos ng bawat isa.'
  ),
  notJoined: L(
    'Hi {cg}! Please reply YES first so {parent} knows you agreed to get TARA messages.',
    '¡Hola {cg}! Primero responde SÍ para que {parent} sepa que aceptas recibir mensajes de TARA.',
    '{cg}您好！请先回复“好”，让{parent}知道您同意接收TARA消息。',
    'Hi {cg}! Sumagot muna ng OO para malaman ni {parent} na pumapayag kang tumanggap ng mensahe ng TARA.'
  ),
  stopped: L(
    "Okay, you won't get more TARA messages. Reply YES any time to start again.",
    'De acuerdo, no recibirás más mensajes de TARA. Responde SÍ cuando quieras para volver a empezar.',
    '好的，您不会再收到TARA消息。随时回复“好”即可重新开始。',
    'Sige, hindi ka na makakatanggap ng mensahe ng TARA. Sumagot ng OO kahit kailan para magsimula ulit.'
  ),
  planGreeting: L(
    'Hi {cg}! {day} with {child}:',
    '¡Hola {cg}! {day} con {child}:',
    '{cg}您好！{day}和{child}一起：',
    'Hi {cg}! {day} kasama si {child}:'
  ),
  today: L('Today', 'Hoy', '今天', 'Ngayong araw'),
  focus: L(
    'We are working on: {goals}.',
    'Estamos trabajando en: {goals}.',
    '我们的重点：{goals}。',
    'Tinututukan natin: {goals}.'
  ),
  safety: L('Safety', 'Seguridad', '安全', 'Kaligtasan'),
  noteFromParent: L('Note from {parent}', 'Nota de {parent}', '{parent}的备注', 'Paalala mula kay {parent}'),
  planFooterOne: L(
    'When you finish, reply DONE, SKIP or CHANGED. A voice note is fine too.',
    'Al terminar, responde HECHO, SALTADO o CAMBIADO. También puedes mandar un audio.',
    '做完后回复：完成、跳过 或 改了。发语音也可以。',
    'Pagkatapos, sumagot ng TAPOS, LAKTAW o IBA. Puwede rin ang voice note.'
  ),
  planFooterMany: L(
    'After each one, reply with the word and number, e.g. DONE 1 or SKIP 2. A voice note is fine too.',
    'Después de cada una, responde con la palabra y el número, p. ej. HECHO 1 o SALTADO 2. También puedes mandar un audio.',
    '每项做完后回复词语加编号，例如：完成 1 或 跳过 2。发语音也可以。',
    'Pagkatapos ng bawat isa, sumagot ng salita at numero, hal. TAPOS 1 o LAKTAW 2. Puwede rin ang voice note.'
  ),
  nothingToday: L(
    'No activities planned for today. Enjoy your day with {child}!',
    'Hoy no hay actividades. ¡Disfruta el día con {child}!',
    '今天没有活动安排。祝您和{child}玩得开心！',
    'Walang aktibidad ngayon. Mag-enjoy kayo ni {child}!'
  ),
  handoff: L('Earlier today:', 'Más temprano hoy:', '今天早些时候：', 'Kanina:'),
  handoffDone: L('Done: {list}', 'Hicieron: {list}', '做了：{list}', 'Nagawa: {list}'),
  handoffSkipped: L('Not done: {list}', 'No hicieron: {list}', '没做：{list}', 'Hindi nagawa: {list}'),
  napped: L('Napped.', 'Tomó siesta.', '睡了午觉。', 'Nakatulog.'),
  noNap: L('No nap yet.', 'Todavía no toma siesta.', '还没睡午觉。', 'Hindi pa natutulog.'),
  unwell: L(
    'Seems unwell: keep things calm.',
    'Parece que no se siente bien: actividades tranquilas.',
    '好像不太舒服：以安静活动为主。',
    'Mukhang masama ang pakiramdam: dahan-dahan lang.'
  ),
  nudge: L(
    'Quick one: how did "{activity}" go? Just reply DONE or SKIP, or send a voice note.',
    'Rápido: ¿cómo fue "{activity}"? Responde HECHO o SALTADO, o manda un audio.',
    '简单问一下：“{activity}”怎么样？回复 完成 或 跳过，或发语音。',
    'Mabilis lang: kumusta ang "{activity}"? Sumagot ng TAPOS o LAKTAW, o mag-voice note.'
  ),
  appNudge: L(
    'Quick one: how did "{activity}" go? Mark it done or skipped on your Today screen when you can.',
    'Rápido: ¿cómo fue "{activity}"? Márcala como hecha o saltada en tu pantalla de Hoy cuando puedas.',
    '简单问一下：“{activity}”怎么样？方便时在“今天”页面标记完成或跳过。',
    'Mabilis lang: kumusta ang "{activity}"? I-mark ito na tapos o nilaktawan sa Ngayon kapag kaya mo.'
  ),
  parentSays: L('{parent} says: {text}', '{parent} dice: {text}', '{parent}说：{text}', 'Sabi ni {parent}: {text}'),
  gotIt: L('Got it, thank you! ✓ ({activity})', '¡Anotado, gracias! ✓ ({activity})', '收到，谢谢！✓（{activity}）', 'Nakuha ko, salamat! ✓ ({activity})'),
  allDone: L(
    "Thanks! That's everything for today.",
    '¡Gracias! Eso es todo por hoy.',
    '谢谢！今天的都完成了。',
    'Salamat! Iyan na lahat para ngayon.'
  ),
  nothingPending: L(
    "Thanks! I don't see any open activity for today. I've passed your message to {parent}.",
    '¡Gracias! No veo actividades pendientes para hoy. Le pasé tu mensaje a {parent}.',
    '谢谢！今天没有待完成的活动。我已把您的消息转给{parent}。',
    'Salamat! Wala akong nakikitang bukas na aktibidad ngayon. Ipinasa ko na kay {parent} ang mensahe mo.'
  ),
  voiceNoted: L(
    'Thanks for the voice note! {parent} will listen to it.',
    '¡Gracias por el audio! {parent} lo escuchará.',
    '谢谢您的语音！{parent}会听的。',
    'Salamat sa voice note! Pakikinggan ito ni {parent}.'
  ),
  askParent: L(
    "Good question. That one is {parent}'s call, so I've asked them and they'll get back to you.",
    'Buena pregunta. Eso lo decide {parent}; ya le pregunté y te responderá.',
    '好问题。这需要{parent}来决定，我已经转告了，他们会回复您。',
    'Magandang tanong. Si {parent} ang magpapasya diyan, tinanong ko na at babalikan ka nila.'
  ),
  worry: L(
    "Thank you for telling me. I've shared this with {parent} so they can follow up. You're doing great.",
    'Gracias por contarme. Ya se lo pasé a {parent} para que le dé seguimiento. Lo estás haciendo muy bien.',
    '谢谢您告诉我。我已经转告{parent}，由他们跟进。您做得很好。',
    'Salamat sa pagsabi. Ipinaalam ko na kay {parent} para masundan. Ang galing mo.'
  ),
  goalIdea: L(
    "Nice idea! {parent} decides the goals, so I've passed it on.",
    '¡Buena idea! {parent} decide las metas; ya se lo pasé.',
    '好主意！目标由{parent}决定，我已经转告了。',
    'Magandang ideya! Si {parent} ang nagpapasya ng layunin, ipinasa ko na.'
  ),
  napNoted: L('Nap noted, thank you!', 'Siesta anotada, ¡gracias!', '午睡已记录，谢谢！', 'Naitala ang tulog, salamat!'),
  sickNoted: L(
    "Thanks for letting me know. I've told {parent}. Keep things calm today.",
    'Gracias por avisar. Ya le dije a {parent}. Hoy, actividades tranquilas.',
    '谢谢告知，我已经告诉{parent}了。今天以安静活动为主。',
    'Salamat sa pagsabi. Sinabihan ko na si {parent}. Dahan-dahan lang ngayon.'
  ),
  noted: L(
    "Thanks! I've passed this on to {parent}.",
    '¡Gracias! Se lo pasé a {parent}.',
    '谢谢！我已转告{parent}。',
    'Salamat! Ipinasa ko na ito kay {parent}.'
  ),
};

export type TemplateKey = keyof typeof T;

export function render(key: TemplateKey, lang: Language, vars: Record<string, string> = {}) {
  return { text: fill(T[key][lang], vars), english: fill(T[key].en, vars) };
}

export type PlanContext = {
  caregiver: Pick<Caregiver, 'name' | 'language' | 'seesGoals'>;
  parentName: string;
  childName: string;
  /** "Today" or a weekday name; already in the parent's choice of wording. */
  dayLabel: Localized;
  goals: { area: DevArea; title: string }[];
  /** Assignments in the order they happen, paired with their activity. */
  items: { assignment: Pick<Assignment, 'anchor' | 'note'>; activity: Activity }[];
  /** How the day went so far. Only filled in for caregivers the parent allowed to see it. */
  handoff?: { done: Activity[]; skipped: Activity[]; nap: boolean | null; illness: boolean } | null;
};

function handoffLines(lang: Language, h: NonNullable<PlanContext['handoff']>) {
  const title = (a: Activity) => localizedActivity(a, lang).title;
  const lines: string[] = [];
  if (h.done.length) lines.push(`• ${fill(T.handoffDone[lang], { list: h.done.map(title).join(', ') })}`);
  if (h.skipped.length) lines.push(`• ${fill(T.handoffSkipped[lang], { list: h.skipped.map(title).join(', ') })}`);
  if (h.nap !== null) lines.push(`• ${h.nap ? T.napped[lang] : T.noNap[lang]}`);
  if (h.illness) lines.push(`• ${T.unwell[lang]}`);
  return lines.length ? [T.handoff[lang], ...lines] : [];
}

/** Title and steps in the caregiver's language: library activities carry translations. */
export function localizedActivity(activity: Activity, lang: Language) {
  const lib = activity.libraryId ? activityById(activity.libraryId) : undefined;
  const song = DEFAULT_SONG[lang];
  if (lib) {
    return {
      title: lib.title[lang],
      steps: lib.steps.map((s) => fill(s[lang], { song })),
      safety: lib.safetyLabels[0]?.[lang] ?? activity.safetyNote,
    };
  }
  return {
    title: activity.title,
    steps: activity.steps.map((s) => fill(s, { song: DEFAULT_SONG.en })),
    safety: activity.safetyNote,
  };
}

function planText(lang: Language, ctx: PlanContext) {
  const vars = { cg: ctx.caregiver.name, child: ctx.childName, parent: ctx.parentName, day: ctx.dayLabel[lang] };
  if (ctx.items.length === 0) return fill(T.nothingToday[lang], vars);
  const lines = [fill(T.planGreeting[lang], vars)];
  // Consent: goals are only mentioned to caregivers the parent chose to share them with.
  if (ctx.caregiver.seesGoals && ctx.goals.length) {
    const names = ctx.goals.map((g) => (lang === 'en' ? g.title : GOAL_NAMES[g.area][lang]));
    lines.push(fill(T.focus[lang], { goals: [...new Set(names)].join(', ') }));
  }
  if (ctx.handoff) {
    const handoff = handoffLines(lang, ctx.handoff);
    if (handoff.length) lines.push('', ...handoff);
  }
  ctx.items.forEach(({ assignment, activity }, index) => {
    const a = localizedActivity(activity, lang);
    lines.push('');
    lines.push(`${index + 1}. ${a.title} (${anchorById(assignment.anchor).label[lang]})`);
    for (const step of a.steps) lines.push(`   • ${step}`);
    if (a.safety) lines.push(`   ⚠ ${T.safety[lang]}: ${a.safety}`);
    if (assignment.note.trim()) {
      lines.push(`   ✎ ${fill(T.noteFromParent[lang], vars)}: ${assignment.note.trim()}`);
    }
  });
  lines.push('');
  lines.push(ctx.items.length === 1 ? T.planFooterOne[lang] : T.planFooterMany[lang]);
  return lines.join('\n');
}

export function planMessage(ctx: PlanContext) {
  return { text: planText(ctx.caregiver.language, ctx), english: planText('en', ctx) };
}

export const WEEKDAY_LABELS: Record<number, Localized> = {
  0: L('Sunday', 'Domingo', '星期日', 'Linggo'),
  1: L('Monday', 'Lunes', '星期一', 'Lunes'),
  2: L('Tuesday', 'Martes', '星期二', 'Martes'),
  3: L('Wednesday', 'Miércoles', '星期三', 'Miyerkules'),
  4: L('Thursday', 'Jueves', '星期四', 'Huwebes'),
  5: L('Friday', 'Viernes', '星期五', 'Biyernes'),
  6: L('Saturday', 'Sábado', '星期六', 'Sabado'),
};

/** "Today" when the date is today, otherwise the weekday name. Dates are YYYY-MM-DD. */
export function dayLabel(date: string, today: string): Localized {
  if (date === today) return T.today;
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Synced from the Expo app (TARA/src/shared/classify.ts) by `npm run sync-shared`. Edit it there.
/**
 * Reads short caregiver replies from WhatsApp / SMS (English, Spanish, Mandarin, Tagalog) and
 * decides what they mean. The key rule from the workflow: parent-only questions and development
 * worries always go to the parent, and TARA never diagnoses.
 */
import type { AssignmentStatus, DevArea, Reaction } from './types.js';

export type ReportStatus = Extract<AssignmentStatus, 'done' | 'skipped' | 'changed'>;

export type Intent =
  | { kind: 'join' }
  | { kind: 'stop' }
  | { kind: 'report'; status: ReportStatus; item: number | null; reaction: Reaction | null; note: string }
  | { kind: 'parent-only' }
  | { kind: 'worry' }
  | { kind: 'nap' }
  | { kind: 'sick' }
  | { kind: 'goal-request'; area?: DevArea }
  | { kind: 'plan-question' }
  | { kind: 'other' };

const END = String.raw`(?=$|[\s\d.,!:;。，！：])`;

const JOIN = new RegExp(String.raw`^\s*(yes|y|ok|okay|s[ií]|claro|oo|opo|sige|好|好的|同意|可以|是)${END}`, 'i');
const STOP = new RegExp(String.raw`^\s*(stop|unsubscribe|alto|basta|停止|退订|tigil|hinto)${END}`, 'i');

const PARENT_ONLY =
  /medicine|medication|tylenol|motrin|ibuprofen|fever|doctor|hospital|allerg|vaccin|\bpay\b|money|visitor|pick ?up|leave early|day off|screen time|tablet|medicina|fiebre|m[eé]dico|alergia|pago|permiso|医|药|发烧|过敏|请假|gamot|lagnat|doktor|bayad/i;

const WORRY =
  /not talking|doesn'?t talk|no words|not walking|worried|delay|regress|lost words|no habla|no camina|preocup|retraso|不说话|不会走|担心|落后|hindi nagsasalita|hindi naglalakad|nag-aalala|nag aalala/i;

const GOAL = /new goal|work on|start (practi|teach)|potty|toilet|nueva meta|empezar a|baño|新目标|开始练|如厕|bagong layunin|simulan/i;

const PLAN_Q =
  /what.*today|today'?s plan|what('?s| is) the plan|\bplan\b\??$|qu[eé] hacemos|qu[eé] toca|今天做什么|今天的计划|ano.*gagawin|ano.*plano/i;

const keyword = (words: string) => new RegExp(String.raw`^\s*(${words})${END}`, 'i');

const REPORT: { status: ReportStatus; re: RegExp }[] = [
  { status: 'done', re: keyword('done|did it|finished|hecho|listo|terminado|完成|做了|tapos|nagawa') },
  { status: 'skipped', re: keyword('skip|skipped|saltado|salt[eé]|no pudimos|跳过|没做|laktaw|hindi nagawa') },
  { status: 'changed', re: keyword('changed|cambiado|cambi[eé]|改了|iba|binago') },
];

const NAP = new RegExp(String.raw`^\s*(nap|napped|slept|siesta|durmi[oó]|午睡|睡了|tulog|natulog)${END}`, 'i');
const SICK = /^\s*(sick|unwell|ill\b|enferm|malit[oa]|生病|不舒服|may sakit|masama ang pakiramdam)/i;

const LOVED = /lov|❤|😍|🥰|😊|encant|gust[oó] mucho|feliz|喜欢|开心|gustong-gusto|nagustuhan|natuwa/i;
const NOT_TODAY = /not today|didn'?t like|did not like|cried|upset|no quiso|no le gust|llor|不喜欢|哭|不想|ayaw|umiyak/i;

export const WORRY_PATTERN = WORRY;

export function detectWorry(text: string | undefined) {
  return !!text && WORRY.test(text);
}

export function detectReaction(text: string): Reaction | null {
  if (NOT_TODAY.test(text)) return 'not-today';
  if (LOVED.test(text)) return 'loved';
  return null;
}

function guessArea(text: string): DevArea | undefined {
  if (/potty|toilet|spoon|dress|feed|baño|cuchara|如厕|勺|kutsara/i.test(text)) return 'self-care';
  if (/talk|word|speak|habla|palabra|说话|salita/i.test(text)) return 'language';
  if (/walk|climb|run|camina|走|lakad/i.test(text)) return 'motor';
  if (/share|turn|friend|compart|分享|kaibigan/i.test(text)) return 'social';
  return undefined;
}

export function classify(raw: string): Intent {
  const text = raw.trim();
  // Safety-relevant intents win over everything else.
  if (WORRY.test(text)) return { kind: 'worry' };
  if (PARENT_ONLY.test(text)) return { kind: 'parent-only' };
  if (STOP.test(text)) return { kind: 'stop' };

  for (const { status, re } of REPORT) {
    const match = text.match(re);
    if (!match) continue;
    // Optional item number right after the keyword: "DONE 2", "完成2", "SKIP #1 she was tired".
    const rest = text.slice(match[0].length);
    const num = rest.match(/^\s*#?\s*(\d{1,2})(?!\d)/);
    const note = (num ? rest.slice(num[0].length) : rest).replace(/^[\s.,!:;。，！：-]+/, '').trim();
    return {
      kind: 'report',
      status,
      item: num ? Number(num[1]) : null,
      reaction: detectReaction(note),
      note,
    };
  }

  if (NAP.test(text)) return { kind: 'nap' };
  if (SICK.test(text)) return { kind: 'sick' };
  if (JOIN.test(text)) return { kind: 'join' };
  if (GOAL.test(text)) return { kind: 'goal-request', area: guessArea(text) };
  if (PLAN_Q.test(text)) return { kind: 'plan-question' };
  return { kind: 'other' };
}

// Synced from the Expo app (TARA/src/shared/library.ts) by `npm run sync-shared`. Edit it there.
import type { DevArea, Energy, Language, LibraryActivity, Localized, RoutineAnchorId } from './types.js';

const L = (en: string, es: string, zh: string, tl: string): Localized => ({ en, es, zh, tl });

export const LANGUAGES: { id: Language; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'es', label: 'Spanish', native: 'Español' },
  { id: 'zh', label: 'Mandarin', native: '中文' },
  { id: 'tl', label: 'Tagalog', native: 'Tagalog' },
];

export const languageLabel = (id: Language) => LANGUAGES.find((l) => l.id === id)?.label ?? id;

export const GOALS: { id: DevArea; label: string; short: string }[] = [
  { id: 'language', label: 'Talk more and learn new words', short: 'Language' },
  { id: 'motor', label: 'Move, build and use hands', short: 'Motor' },
  { id: 'social', label: 'Take turns and play together', short: 'Social' },
  { id: 'sensory', label: 'Explore textures calmly', short: 'Sensory' },
  { id: 'thinking', label: 'Sort, match and solve', short: 'Thinking' },
  { id: 'self-care', label: 'Feed and dress on their own', short: 'Self-care' },
];

export const goalLabel = (id: DevArea) => GOALS.find((g) => g.id === id)?.short ?? id;

export const GOAL_NAMES: Record<DevArea, Localized> = {
  language: L('talking', 'hablar', '说话', 'pagsasalita'),
  motor: L('moving and building', 'moverse y construir', '动手和运动', 'paggalaw at pagbuo'),
  social: L('taking turns', 'tomar turnos', '轮流玩', 'pagsasalitan'),
  sensory: L('exploring textures', 'explorar texturas', '感受触感', 'paghawak ng iba’t ibang bagay'),
  thinking: L('sorting and matching', 'clasificar y emparejar', '分类配对', 'pag-uuri at pagtutugma'),
  'self-care': L('feeding and dressing', 'comer y vestirse solo', '自己吃饭穿衣', 'pagkain at pagbibihis nang mag-isa'),
};

export const ROUTINE_ANCHORS: { id: RoutineAnchorId; energy: Energy; label: Localized }[] = [
  {
    id: 'after-breakfast',
    energy: 'active',
    label: L('After breakfast', 'Después del desayuno', '早饭后', 'Pagkatapos ng almusal'),
  },
  {
    id: 'mid-morning',
    energy: 'active',
    label: L('Mid-morning', 'A media mañana', '上午', 'Kalagitnaan ng umaga'),
  },
  {
    id: 'before-nap',
    energy: 'calm',
    label: L('Before nap', 'Antes de la siesta', '午睡前', 'Bago matulog sa tanghali'),
  },
  {
    id: 'after-nap',
    energy: 'active',
    label: L('After nap', 'Después de la siesta', '午睡后', 'Pagkagising sa tanghali'),
  },
  {
    id: 'before-dinner',
    energy: 'calm',
    label: L('Before dinner', 'Antes de la cena', '晚饭前', 'Bago maghapunan'),
  },
  {
    id: 'bath-time',
    energy: 'calm',
    label: L('Bath time', 'Hora del baño', '洗澡时间', 'Oras ng paligo'),
  },
];

export const anchorById = (id: RoutineAnchorId) => ROUTINE_ANCHORS.find((a) => a.id === id)!;

export const COMMON_HOME_ITEMS = [
  'blocks',
  'plastic cups',
  'picture book',
  'soft ball',
  'bowl',
  'spoon',
  'scarf',
  'socks',
  'bubbles',
  'play dough',
  'big beads',
];

/** Reviewed safety labels, translated so caregivers read them in their own language. */
const SAFETY = {
  smallParts: L(
    'Small parts: choking hazard under 3 years',
    'Piezas pequeñas: riesgo de asfixia en menores de 3 años',
    '小零件：3岁以下有窒息危险',
    'Maliliit na piraso: panganib na mabulunan sa wala pang 3 taon'
  ),
  scarf: L(
    'Stay close; never leave the scarf with a sleeping child',
    'Quédese cerca; nunca deje el pañuelo con un niño dormido',
    '待在旁边；孩子睡觉时不要留下丝巾',
    'Manatiling malapit; huwag iwan ang panyo sa natutulog na bata'
  ),
  soap: L(
    'Keep soap away from eyes and mouth',
    'Mantenga el jabón lejos de ojos y boca',
    '别让肥皂水进眼睛和嘴巴',
    'Iwasang mapunta ang sabon sa mata at bibig'
  ),
  water: L(
    'Water: stay within arm’s reach, empty the bowl after',
    'Agua: quédese al alcance de la mano y vacíe el tazón al terminar',
    '玩水：随时伸手可及，玩完把碗倒空',
    'Tubig: manatiling abot-kamay, itapon ang tubig pagkatapos'
  ),
  dough: L(
    'Non-toxic dough only; watch for mouthing',
    'Solo plastilina no tóxica; vigile que no se la lleve a la boca',
    '只用无毒彩泥；注意别放进嘴里',
    'Hindi nakalalasong dough lang; bantayan kung isusubo'
  ),
};

/**
 * Reviewed activity library. Every activity and every swap here is assumed to have been
 * checked by a human reviewer; the agent never invents activities outside this list.
 */
export const ACTIVITIES: LibraryActivity[] = [
  {
    id: 'block-tower',
    title: L('Block tower', 'Torre de bloques', '搭积木', 'Tore ng bloke'),
    steps: [
      L('Stack 2 blocks, then hand one over.', 'Apile 2 bloques y dele uno.', '先搭两块，再递给孩子一块。', 'Magpatong ng 2 bloke, iabot ang isa.'),
      L('Cheer when it falls and build again.', 'Celebre cuando se caiga y vuelvan a construir.', '倒了就欢呼，再搭一次。', 'Pumalakpak kapag bumagsak, ulitin.'),
    ],
    area: 'motor',
    minAgeMonths: 12,
    maxAgeMonths: 48,
    safetyLabels: [],
    needsItems: ['blocks'],
    energy: 'active',
    minutes: 10,
    swaps: ['cup-stack', 'bead-string'],
  },
  {
    id: 'cup-stack',
    title: L('Cup stacking', 'Apilar vasos', '叠杯子', 'Pagpapatong ng baso'),
    steps: [
      L('Line up 4 plastic cups.', 'Ponga 4 vasos de plástico en fila.', '摆好4个塑料杯。', 'Ihanay ang 4 na plastik na baso.'),
      L('Take turns stacking: "your turn, my turn".', 'Tomen turnos: "te toca, me toca".', '轮流叠："你来，我来"。', 'Magsalitan: "ikaw naman, ako naman".'),
    ],
    area: 'motor',
    minAgeMonths: 10,
    maxAgeMonths: 36,
    safetyLabels: [],
    needsItems: ['plastic cups'],
    energy: 'active',
    minutes: 10,
    swaps: ['block-tower', 'sock-match', 'bead-string'],
  },
  {
    id: 'bead-string',
    title: L('Big bead stringing', 'Ensartar cuentas grandes', '穿大珠子', 'Pagtuhog ng malalaking beads'),
    steps: [
      L('Thread big beads on a shoelace.', 'Ensarte cuentas grandes en un cordón.', '用鞋带穿大珠子。', 'Itusok ang beads sa sintas.'),
      L('Count each bead out loud.', 'Cuenten cada cuenta en voz alta.', '大声数每一颗。', 'Bilangin nang malakas ang bawat isa.'),
    ],
    area: 'motor',
    minAgeMonths: 36,
    maxAgeMonths: 72,
    safetyLabels: [SAFETY.smallParts],
    needsItems: ['big beads'],
    energy: 'calm',
    minutes: 10,
    swaps: ['cup-stack'],
  },
  {
    id: 'song-point',
    title: L('Sing and point', 'Cantar y señalar', '唱歌指一指', 'Kumanta at tumuro'),
    steps: [
      L('Sing {song}.', 'Cante {song}.', '唱《{song}》。', 'Kantahin ang {song}.'),
      L('Point to eyes, nose, toes as you sing.', 'Señale ojos, nariz y pies al cantar.', '边唱边指眼睛、鼻子、脚趾。', 'Ituro ang mata, ilong, paa habang kumakanta.'),
    ],
    area: 'language',
    minAgeMonths: 6,
    maxAgeMonths: 48,
    safetyLabels: [],
    needsItems: [],
    energy: 'calm',
    minutes: 5,
    usesSong: true,
    swaps: ['picture-talk', 'dance-freeze'],
  },
  {
    id: 'picture-talk',
    title: L('Picture book talk', 'Hablar con un libro', '看图说话', 'Kuwentuhan sa larawan'),
    steps: [
      L('Point at a picture and name it.', 'Señale un dibujo y diga su nombre.', '指着图片说出名字。', 'Ituro ang larawan at sabihin ang pangalan.'),
      L('Wait 5 seconds for a word or sound.', 'Espere 5 segundos a que diga algo.', '等5秒，让孩子回应。', 'Maghintay ng 5 segundo sa sagot.'),
    ],
    area: 'language',
    minAgeMonths: 12,
    maxAgeMonths: 60,
    safetyLabels: [],
    needsItems: ['picture book'],
    energy: 'calm',
    minutes: 10,
    swaps: ['song-point', 'name-food'],
  },
  {
    id: 'name-food',
    title: L('Name the food', 'Nombrar la comida', '说出食物名', 'Pangalanan ang pagkain'),
    steps: [
      L('Hold up each food before giving it.', 'Muestre cada alimento antes de darlo.', '给之前先举起食物。', 'Ipakita ang bawat pagkain bago ibigay.'),
      L('Say its name twice, slowly.', 'Diga su nombre dos veces, despacio.', '慢慢说两遍名字。', 'Sabihin ang pangalan nang dalawang beses.'),
    ],
    area: 'language',
    minAgeMonths: 12,
    maxAgeMonths: 36,
    safetyLabels: [],
    needsItems: [],
    energy: 'calm',
    minutes: 5,
    swaps: ['picture-talk', 'spoon-practice'],
  },
  {
    id: 'ball-roll',
    title: L('Ball roll', 'Rodar la pelota', '滚球', 'Pagulungin ang bola'),
    steps: [
      L('Sit facing each other, legs apart.', 'Siéntense frente a frente.', '面对面坐，腿分开。', 'Umupo nang magkaharap.'),
      L('Roll it back and forth: "to you, to me".', 'Rueden la pelota: "para ti, para mí".', '来回滚："给你，给我"。', 'Pagulungin: "sa iyo, sa akin".'),
    ],
    area: 'social',
    minAgeMonths: 9,
    maxAgeMonths: 36,
    safetyLabels: [],
    needsItems: ['soft ball'],
    energy: 'active',
    minutes: 10,
    swaps: ['bubble-chase', 'scarf-peekaboo'],
  },
  {
    id: 'scarf-peekaboo',
    title: L('Scarf peekaboo', 'Cucú con pañuelo', '丝巾躲猫猫', 'Bulaga gamit ang panyo'),
    steps: [
      L('Hide your face under a light scarf.', 'Cúbrase la cara con un pañuelo ligero.', '用薄丝巾盖住脸。', 'Takpan ang mukha ng manipis na panyo.'),
      L('Pull it off: "peekaboo!" Let them try.', 'Quítelo: "¡cucú!" Deje que lo intente.', '拉开说"躲猫猫！"让孩子试。', 'Alisin: "bulaga!" Hayaan siyang subukan.'),
    ],
    area: 'social',
    minAgeMonths: 6,
    maxAgeMonths: 24,
    safetyLabels: [SAFETY.scarf],
    needsItems: ['scarf'],
    energy: 'calm',
    minutes: 5,
    swaps: ['ball-roll'],
  },
  {
    id: 'bubble-chase',
    title: L('Bubble chase', 'Perseguir burbujas', '追泡泡', 'Habulin ang bula'),
    steps: [
      L('Blow bubbles up high.', 'Haga burbujas hacia arriba.', '往高处吹泡泡。', 'Magpalipad ng bula pataas.'),
      L('Say "pop!" each time they catch one.', 'Diga "¡pop!" cada vez que atrape una.', '抓到就说"啪！"', 'Sabihin "pop!" tuwing makahuli.'),
    ],
    area: 'motor',
    minAgeMonths: 12,
    maxAgeMonths: 48,
    safetyLabels: [SAFETY.soap],
    needsItems: ['bubbles'],
    energy: 'active',
    minutes: 10,
    swaps: ['ball-roll', 'dance-freeze'],
  },
  {
    id: 'dance-freeze',
    title: L('Dance and freeze', 'Bailar y congelarse', '跳舞木头人', 'Sayaw at tigil'),
    steps: [
      L('Dance to {song}.', 'Bailen con {song}.', '跟着《{song}》跳舞。', 'Sumayaw sa {song}.'),
      L('Stop the song: everybody freezes!', 'Pare la canción: ¡todos quietos!', '停歌：大家不许动！', 'Itigil ang kanta: tigil lahat!'),
    ],
    area: 'social',
    minAgeMonths: 18,
    maxAgeMonths: 60,
    safetyLabels: [],
    needsItems: [],
    energy: 'active',
    minutes: 10,
    usesSong: true,
    swaps: ['song-point', 'bubble-chase'],
  },
  {
    id: 'water-pour',
    title: L('Water pouring', 'Verter agua', '倒水游戏', 'Pagbuhos ng tubig'),
    steps: [
      L('Put a little water in a bowl.', 'Ponga un poco de agua en un tazón.', '碗里放一点水。', 'Lagyan ng kaunting tubig ang mangkok.'),
      L('Pour between cups together.', 'Viertan agua entre vasos juntos.', '一起在杯子之间倒水。', 'Magbuhos sa mga baso nang magkasama.'),
    ],
    area: 'sensory',
    minAgeMonths: 18,
    maxAgeMonths: 60,
    safetyLabels: [SAFETY.water],
    needsItems: ['bowl', 'plastic cups'],
    energy: 'active',
    minutes: 10,
    swaps: ['play-dough'],
  },
  {
    id: 'play-dough',
    title: L('Play dough squish', 'Aplastar plastilina', '捏彩泥', 'Pagpisil ng play dough'),
    steps: [
      L('Roll a ball, then squish it flat.', 'Haga una bola y aplástela.', '搓个球，再压扁。', 'Gumawa ng bola, pisilin nang lapad.'),
      L('Name it: "soft", "flat", "round".', 'Diga: "suave", "plano", "redondo".', '说："软的""扁的""圆的"。', 'Sabihin: "malambot", "lapad", "bilog".'),
    ],
    area: 'sensory',
    minAgeMonths: 24,
    maxAgeMonths: 72,
    safetyLabels: [SAFETY.dough],
    needsItems: ['play dough'],
    energy: 'calm',
    minutes: 10,
    swaps: ['water-pour'],
  },
  {
    id: 'sock-match',
    title: L('Sock matching', 'Emparejar calcetines', '配袜子', 'Pagtutugma ng medyas'),
    steps: [
      L('Mix 3 pairs of socks.', 'Mezcle 3 pares de calcetines.', '把3双袜子混在一起。', 'Paghaluin ang 3 pares ng medyas.'),
      L('Find the twins together.', 'Busquen las parejas juntos.', '一起找出一样的。', 'Hanapin ang magkapares nang sabay.'),
    ],
    area: 'thinking',
    minAgeMonths: 20,
    maxAgeMonths: 60,
    safetyLabels: [],
    needsItems: ['socks'],
    energy: 'calm',
    minutes: 5,
    swaps: ['cup-stack'],
  },
  {
    id: 'spoon-practice',
    title: L('Spoon practice', 'Practicar con cuchara', '练习用勺子', 'Pagsasanay sa kutsara'),
    steps: [
      L('Give a spoon and a thick food (yogurt).', 'Dele cuchara y algo espeso (yogur).', '给勺子和稠的食物（酸奶）。', 'Bigyan ng kutsara at malapot na pagkain.'),
      L('Help only after they try 3 times.', 'Ayude solo después de 3 intentos.', '试了3次再帮忙。', 'Tumulong lang pagkatapos ng 3 subok.'),
    ],
    area: 'self-care',
    minAgeMonths: 12,
    maxAgeMonths: 36,
    safetyLabels: [],
    needsItems: ['spoon', 'bowl'],
    energy: 'calm',
    minutes: 10,
    swaps: ['name-food'],
  },
];

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id);

/** Fallback songs when a caregiver hasn't shared their own. */
export const DEFAULT_SONG: Localized = L(
  'Head, Shoulders, Knees and Toes',
  'Cabeza, hombros, rodillas y pies',
  '头和肩膀膝盖脚',
  'Ulo, Balikat, Tuhod, Paa'
);

export function activityTitle(id: string, lang: Language = 'en') {
  return activityById(id)?.title[lang] ?? id;
}

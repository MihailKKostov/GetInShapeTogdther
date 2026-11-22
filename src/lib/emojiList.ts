// Curated standard emoji set. Each entry: "char shortcode alias alias…".
// The first word is the Slack-style shortcode (typed as :shortcode:); aliases help search.
// Custom emojis are stored and written as ":name:".
export interface StdEmoji {
  c: string;
  /** primary shortcode, e.g. "fire" */
  code: string;
  /** shortcode + aliases, space separated (for search) */
  n: string;
}

const RAW: Record<string, string> = {
  fitness: '💪 muscle flex strong|🔥 fire lit hot|🏃 runner running run|🚴 bike bicyclist cycling ride|🏊 swimmer swim|🏋️ weight_lifter lift gym|🧘 yoga lotus_position zen|🤸 cartwheel|⛹️ person_with_ball ball|🥇 first_place_medal gold medal|🥈 second_place_medal silver|🥉 third_place_medal bronze|🏆 trophy win|🎯 dart target bullseye|⏱️ stopwatch time|🏁 checkered_flag finish|👟 athletic_shoe sneaker shoe|💦 sweat_drops sweat|🫀 anatomical_heart|🦵 leg|🧗 climbing climb',
  reactions: '👏 clap applause|🙌 raised_hands praise|👍 +1 thumbsup yes|👎 -1 thumbsdown no|👊 facepunch fist_bump punch|🤝 handshake|✊ fist power|🫡 saluting_face salute|🙏 pray thanks|💯 100 perfect|✅ white_check_mark check done|⚡ zap lightning energy|🚀 rocket launch|📈 chart_with_upwards_trend gains up|📉 chart_with_downwards_trend loss down|⭐ star|🌟 star2 glowing_star|✨ sparkles|🎉 tada party|🎊 confetti_ball confetti|💥 boom|👀 eyes looking|🫶 heart_hands|❤️ heart love red_heart|💚 green_heart|💙 blue_heart|🖤 black_heart',
  faces: '😀 grinning|😃 smiley|😄 smile happy|😁 grin beaming|😂 joy laugh tears|🤣 rofl rolling_on_the_floor_laughing|😅 sweat_smile|😊 blush|😍 heart_eyes|🤩 star_struck starstruck|😎 sunglasses|🥳 partying_face party|😮 open_mouth wow|😲 astonished|🤯 exploding_head mind_blown|😤 triumph huff|😬 grimacing|🥵 hot_face|🥶 cold_face cold|😴 sleeping|🤤 drooling_face drool|🤔 thinking_face thinking|🫠 melting_face melting|😭 sob cry|💀 skull dead|🤡 clown_face clown|👻 ghost|🙈 see_no_evil|😇 innocent angel|😈 smiling_imp devil|🤓 nerd_face nerd|🫨 shaking_face shaking',
  food: '🥗 green_salad salad|🥦 broccoli|🥑 avocado|🍎 apple|🍌 banana|🍓 strawberry|🫐 blueberries|🥕 carrot|🍗 poultry_leg chicken|🥩 cut_of_meat steak meat|🍳 fried_egg egg cooking|🐟 fish|🍚 rice|🥛 glass_of_milk milk|💧 droplet water|🧃 beverage_box juice|☕ coffee|🍵 tea|🍕 pizza|🍔 hamburger burger|🍟 fries|🌮 taco|🍩 doughnut donut|🍰 cake|🍫 chocolate_bar chocolate|🍪 cookie|🍺 beer|🍷 wine_glass wine|🧂 salt',
  misc: '💤 zzz sleep|🌅 sunrise morning|🌙 crescent_moon moon night|☀️ sunny sun|🌧️ rain_cloud rain|❄️ snowflake snow|⛰️ mountain|🌲 evergreen_tree tree|🐐 goat greatest|🦍 gorilla|🐢 turtle slow|🐇 rabbit2 rabbit fast|🦾 mechanical_arm|🧠 brain|📸 camera_with_flash camera photo|🔔 bell|📅 date calendar|🔁 repeat|➕ heavy_plus_sign plus|🆙 up|🆒 cool|🛑 octagonal_sign stop|⚠️ warning|❌ x cross',
};

export const EMOJI_GROUPS: { id: string; items: StdEmoji[] }[] = Object.entries(RAW).map(([id, s]) => ({
  id,
  items: s.split('|').map((x) => {
    const i = x.indexOf(' ');
    const n = x.slice(i + 1);
    return { c: x.slice(0, i), code: n.split(' ')[0], n };
  }),
}));

export const ALL_STD = EMOJI_GROUPS.flatMap((g) => g.items);

const BY_CODE = new Map(ALL_STD.map((e) => [e.code, e]));
const BY_ALIAS = new Map<string, StdEmoji>();
for (const e of ALL_STD) for (const a of e.n.split(' ')) if (!BY_ALIAS.has(a)) BY_ALIAS.set(a, e);

/** Exact shortcode lookup (primary code first, then aliases). */
export function findStd(code: string): StdEmoji | undefined {
  const k = code.toLowerCase();
  return BY_CODE.get(k) ?? BY_ALIAS.get(k);
}

export const QUICK_REACTIONS = ['💪', '🔥', '👏', '💯', '🎉'];

/** Characters allowed in a :shortcode: */
export const CODE_CHARS = 'a-z0-9_+\\-';

export function isCustom(key: string) {
  return key.startsWith(':') && key.endsWith(':') && key.length > 2;
}

export function customName(key: string) {
  return key.slice(1, -1);
}

export interface EmojiSuggestion {
  /** what gets inserted / stored: unicode char or ":custom:" */
  key: string;
  /** shortcode shown to the user, without colons */
  code: string;
  custom: boolean;
}

/**
 * Autocomplete search used by ":" typing and the picker.
 * Order: shortcode prefix matches, then other matches; custom emojis first within each group.
 */
export function searchEmoji(q: string, customNames: string[], limit = 8): EmojiSuggestion[] {
  const t = q.toLowerCase().replace(/:/g, '');
  if (!t) return [];
  const prefix: EmojiSuggestion[] = [];
  const rest: EmojiSuggestion[] = [];
  for (const name of [...customNames].sort()) {
    const s = { key: `:${name}:`, code: name, custom: true };
    if (name.startsWith(t)) prefix.push(s);
    else if (name.includes(t)) rest.push(s);
  }
  for (const e of ALL_STD) {
    const s = { key: e.c, code: e.code, custom: false };
    if (e.code.startsWith(t)) prefix.push(s);
    else if (e.n.split(' ').some((w) => w.startsWith(t)) || e.n.includes(t)) rest.push(s);
  }
  return [...prefix, ...rest].slice(0, limit);
}

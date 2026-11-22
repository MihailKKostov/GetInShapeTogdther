// Curated standard emoji set for reactions. Custom emojis are stored as ":name:".
export interface StdEmoji { c: string; n: string }

const RAW: Record<string, string> = {
  fitness: '💪 muscle flex strong|🔥 fire lit hot|🏃 runner run|🚴 bike cycling ride|🏊 swim swimmer|🏋️ weightlifter lift gym|🧘 yoga zen|🤸 cartwheel|⛹️ ball|🥇 gold medal first|🥈 silver medal|🥉 bronze medal|🏆 trophy win|🎯 target bullseye|⏱️ stopwatch time|🏁 finish flag|👟 shoe sneaker|💦 sweat|🫀 heart anatomical|🦵 leg|🧗 climb',
  reactions: '👏 clap applause|🙌 raised hands praise|👍 thumbs up yes|👎 thumbs down|👊 fist bump|🤝 handshake|✊ fist power|🫡 salute|🙏 pray thanks|💯 hundred perfect|✅ check done|⚡ lightning energy|🚀 rocket launch|📈 chart up gains|📉 chart down loss|⭐ star|🌟 glowing star|✨ sparkles|🎉 party tada|🎊 confetti|💥 boom|👀 eyes looking|🫶 heart hands|❤️ red heart love|💚 green heart|💙 blue heart|🖤 black heart',
  faces: '😀 grin|😃 smile|😄 happy|😁 beaming|😂 joy laugh tears|🤣 rofl|😅 sweat smile|😊 blush|😍 heart eyes|🤩 star struck|😎 cool sunglasses|🥳 party face|😮 wow|😲 astonished|🤯 mind blown|😤 triumph huff|😬 grimace|🥵 hot face|🥶 cold face|😴 sleep|🤤 drool|🤔 thinking|🫠 melting|😭 sob cry|💀 skull dead|🤡 clown|👻 ghost|🙈 see no evil|😇 angel|😈 devil|🤓 nerd|🫨 shaking',
  food: '🥗 salad|🥦 broccoli|🥑 avocado|🍎 apple|🍌 banana|🍓 strawberry|🫐 blueberries|🥕 carrot|🍗 chicken leg|🥩 steak meat|🍳 egg cooking|🐟 fish|🍚 rice|🥛 milk|💧 water drop|🧃 juice|☕ coffee|🍵 tea|🍕 pizza|🍔 burger|🍟 fries|🌮 taco|🍩 donut|🍰 cake|🍫 chocolate|🍪 cookie|🍺 beer|🍷 wine|🧂 salt',
  misc: '💤 zzz sleep|🌅 sunrise morning|🌙 night moon|☀️ sun|🌧️ rain|❄️ snow|⛰️ mountain|🌲 tree forest|🐐 goat greatest|🦍 gorilla|🐢 turtle slow|🐇 rabbit fast|🦾 mechanical arm|🧠 brain|📸 camera photo|🔔 bell|📅 calendar|🔁 repeat|➕ plus|🆙 up|🆒 cool|🛑 stop|⚠️ warning|❌ cross no',
};

export const EMOJI_GROUPS: { id: string; items: StdEmoji[] }[] = Object.entries(RAW).map(([id, s]) => ({
  id,
  items: s.split('|').map((x) => {
    const i = x.indexOf(' ');
    return { c: x.slice(0, i), n: x.slice(i + 1) };
  }),
}));

export const ALL_STD = EMOJI_GROUPS.flatMap((g) => g.items);

export const QUICK_REACTIONS = ['💪', '🔥', '👏', '💯', '🎉'];

export function isCustom(key: string) {
  return key.startsWith(':') && key.endsWith(':') && key.length > 2;
}

export function customName(key: string) {
  return key.slice(1, -1);
}

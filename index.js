import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

// === Keep-alive Server ===
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("Bot Running"));
app.listen(PORT, () => console.log(`Server on ${PORT}`));

// === 환경 설정 ===
const MAIN_GUILD_ID = "1412427204117401673";
const VERIFY_CHANNEL_ID = "1433902681511952465";
const VERIFY_MESSAGE_ID = "1434239630248513546";
const VERIFY_ROLE_ID = "1431223559690260520";
const JOIN_LOG_CHANNEL = "1433902671005487275";
const LEAVE_LOG_CHANNEL = "1433902689430802442";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// === 닉네임 접두사 우선순위 ===
const ROLE_PRIORITY = [
  "1431223211785195663",
  "1431223251572494453",
  "1431223290269274225",
  "1431223359693389944",
  "1431223412533235753",
  "1431223468271206513",
  "1431223559690260520",
];

// === 클라이언트 ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// === 상태 메시지 ===
function updateDefaultStatus() {
  const total = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  client.user.setPresence({
    activities: [{ name: `🛰️ ${total}명 보호 중`, type: 0 }],
    status: "online",
  });
}

function updatePeperoStatus() {
  client.user.setPresence({
    activities: [{ name: `💝 11월 11일은 빼빼로데이`, type: 0 }],
    status: "online",
  });
}

// === 봇 준비 ===
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  updateDefaultStatus();

  let toggle = false;
  setInterval(() => {
    toggle = !toggle;
    toggle ? updatePeperoStatus() : updateDefaultStatus();
  }, 30000);

  console.log("Reaction watcher activated.");

  // === 인증 반응 감시 ===
  let previousReactors = new Set();

  async function checkVerifyReactions() {
    try {
      const guild = client.guilds.cache.get(MAIN_GUILD_ID);
      if (!guild) return;

      const channel = guild.channels.cache.get(VERIFY_CHANNEL_ID);
      if (!channel) return;

      const message = await channel.messages.fetch(VERIFY_MESSAGE_ID);
      if (!message) return;

      const reaction = message.reactions.cache.get("✅");
      if (!reaction) return;

      const users = await reaction.users.fetch();
      const currentSet = new Set(users.filter(u => !u.bot).map(u => u.id));

      const newlyReacted = [...currentSet].filter(id => !previousReactors.has(id));

      for (const userId of newlyReacted) {
        try {
          const member = await guild.members.fetch(userId);
          const role = guild.roles.cache.get(VERIFY_ROLE_ID);
          if (!role) continue;

          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            console.log(`역할 지급: ${member.user.tag}`);

            await updateNickname(member);
          }
        } catch (err) {
          console.warn(`⚠️ ${userId} 처리 실패: ${err.message}`);
        }
      }

      previousReactors = currentSet;
    } catch (err) {
      console.error("Reaction watcher error:", err.message);
    }
  }

  setInterval(checkVerifyReactions, 3000);
});

// === 닉네임 자동 업데이트 함수 ===
async function updateNickname(member) {
  try {
    const roles = member.roles.cache
      .filter(r => ROLE_PRIORITY.includes(r.id))
      .sort((a, b) => ROLE_PRIORITY.indexOf(a.id) - ROLE_PRIORITY.indexOf(b.id));

    if (roles.size === 0) return;

    const topRole = roles.first();
    const base =
      member.user.globalName ||
      member.displayName ||
      member.nickname ||
      member.user.username;

    const clean = base.replace(/^𝕾𝕻𝕿\[.*?\]\s*/g, "").trim();

    const newNick = `𝕾𝕻𝕿[${topRole.name}] ${clean}`;

    if (member.nickname !== newNick) {
      await member.setNickname(newNick);
      console.log(`닉네임 변경: ${member.user.tag} → ${newNick}`);
    }
  } catch (err) {
    if (err.code === 50013) {
      console.warn(`권한 부족: ${member.user.tag}`);
    }
  }
}

// === 감사 로그 기반 역할 감지 ===
client.on("guildAuditLogEntryCreate", async (entry, guild) => {
  try {
    if (guild.id !== MAIN_GUILD_ID) return;
    if (entry.action !== 25 && entry.action !== 26) return;

    const target = entry.target;
    if (!target?.id) return;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return;

    await updateNickname(member);
    console.log(`감사로그 감지 → ${member.user.tag} 업데이트 완료`);
  } catch (err) {
    console.error("AuditLog Error:", err);
  }
});

// === 역할 변경 감지 ===
client.on("guildMemberUpdate", async (oldM, newM) => {
  try {
    if (newM.guild.id !== MAIN_GUILD_ID) return;

    const oldR = oldM.roles.cache.map(r => r.id);
    const newR = newM.roles.cache.map(r => r.id);

    const changed =
      oldR.length !== newR.length ||
      !oldR.every(r => newR.includes(r));

    if (changed) {
      await updateNickname(newM);
      console.log(`역할 변경 감지 → ${newM.user.tag}`);
    }
  } catch (err) {
    console.error("guildMemberUpdate error:", err);
  }
});

// === 메시지 처리 ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // === 전체 업데이트 ===
  if (content === "!업데이트") {
    const guild = client.guilds.cache.get(MAIN_GUILD_ID);
    if (!guild) return message.reply("서버를 찾을 수 없어요.");

    const loading = await message.reply("🔍 전체 멤버 검사 중...");

    const members = await guild.members.fetch();
    let updated = 0;
    let skipped = 0;

    for (const member of members.values()) {
      try {
        const before = member.nickname;
        await updateNickname(member);
        if (before !== member.nickname) updated++;
        else skipped++;
      } catch {}
    }

    await loading.edit(
      `✅ 완료!\n변경됨: **${updated}명**\n변경 없음: **${skipped}명**`
    );
    return;
  }

  // === 멘션이 아니면 무시 ===
  if (!message.mentions.has(client.user)) return;
  if (message.mentions.everyone) return;

  const trimmed = content.replace(`<@${client.user.id}>`, "").trim();
  if (!trimmed) return message.reply("내용도 좀 말해줘 :D");

  const wait = await message.reply("<a:Loading:1433912890649215006> 답변 준비중...");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `너는 내 친구야. 강한 말투로 대답해. 질문: ${trimmed}` }] }],
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message);

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "답변을 만들 수 없어요.";

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setTitle("일런봇의 답변")
      .setDescription(answer)
      .setColor("#3e22a3")
      .setTimestamp();

    await wait.edit({ content: "", embeds: [embed] });
  } catch (err) {
    console.error("Gemini Error:", err);
    await wait.edit("⚠️ 오류가 발생했습니다.");
  }
});

// === 퇴장 로그 ===
client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== MAIN_GUILD_ID) return;
  const channel = member.guild.channels.cache.get(LEAVE_LOG_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("멤버 퇴장")
    .setColor("#d91e18")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "유저", value: `${member.user}`, inline: true },
      { name: "시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
    );

  channel.send({ embeds: [embed] });
});

client.login(process.env.DISCORD_TOKEN);

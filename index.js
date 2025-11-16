import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

// === ✅ Keep-alive 서버 (Render용) ===
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("✅ Discord bot is running!"));
app.listen(PORT, () => console.log(`🌐 Keep-alive server running on port ${PORT}`));

// === 환경 설정 ===
const MAIN_GUILD_ID = "1412427204117401673";
const VERIFY_CHANNEL_ID = "1433902681511952465";
const VERIFY_MESSAGE_ID = "1434239630248513546";
const VERIFY_ROLE_ID = "1431223559690260520";
const JOIN_LOG_CHANNEL = "1433902671005487275";
const LEAVE_LOG_CHANNEL = "1433902689430802442";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// === 닉네임 접두사용 역할 우선순위 ===
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
  partials: ["MESSAGE", "CHANNEL", "REACTION", "GUILD_MEMBER", "USER"],
});

// === 🛰️ 상태 메시지 ===
function updateDefaultStatus() {
  const totalMembers = client.guilds.cache.reduce(
    (acc, guild) => acc + guild.memberCount,
    0
  );
  client.user.setPresence({
    activities: [{ name: `🛰️ ${totalMembers}명 보호하는 중`, type: 0 }],
    status: "online",
  });
}
function updatePeperoStatus() {
  client.user.setPresence({
    activities: [{ name: `💝 11월 11일은 빼빼로데이인거 알지?`, type: 0 }],
    status: "online",
  });
}

// === 봇 준비 ===
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} 로그인 완료!`);
  updateDefaultStatus();

  // 🌀 30초마다 상태 교체
  let toggle = false;
  setInterval(() => {
    toggle = !toggle;
    toggle ? updatePeperoStatus() : updateDefaultStatus();
  }, 30000);

  console.log("✅ 반응 감시 시스템 활성화됨");

  // ✅ 인증 반응 감시 (3초 간격)
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
      const currentReactors = new Set(users.filter(u => !u.bot).map(u => u.id));
      const newReactors = [...currentReactors].filter(id => !previousReactors.has(id));

      if (newReactors.length > 0) {
        for (const userId of newReactors) {
          try {
            const member = await guild.members.fetch(userId);
            const role = guild.roles.cache.get(VERIFY_ROLE_ID);
            if (!role) continue;

            if (!member.roles.cache.has(role.id)) {
              await member.roles.add(role);
              console.log(`🎉 ${member.user.tag} 님에게 '${role.name}' 역할 지급 완료`);

              // ✅ 역할명 기반 닉네임 변경
              await updateNickname(member);
            }
          } catch (err) {
            console.warn(`⚠️ ${userId} 처리 실패: ${err.message}`);
          }
        }
      }

      previousReactors = currentReactors;
    } catch (err) {
      console.error("❌ 인증 반응 감시 오류:", err.message);
    }
  }

  setInterval(checkVerifyReactions, 3000);
});

// === 💫 닉네임 업데이트 ===
async function updateNickname(member) {
  try {
    const roles = member.roles.cache
      .filter((r) => ROLE_PRIORITY.includes(r.id))
      .sort((a, b) => ROLE_PRIORITY.indexOf(a.id) - ROLE_PRIORITY.indexOf(b.id));

    if (roles.size === 0) return;
    const topRole = roles.first();

    const baseName =
      member.user.globalName ||
      member.displayName ||
      member.nickname ||
      member.user.username;

    const cleanBase = baseName.replace(/^ん\[.*?\]\s*/g, "").trim();
    const newNick = `ん[${topRole.name}] ${cleanBase}`;

    if (member.nickname !== newNick) {
      await member.setNickname(newNick);
      console.log(`✅ ${member.user.tag} → ${newNick}`);
    }
  } catch (err) {
    if (err.code === 50013)
      console.warn(`⚠️ ${member.user.tag} 닉네임 변경 권한 부족`);
  }
}

// === ✅ 역할 추가/제거 시 닉네임 자동 업데이트 (감사로그 기반) ===
client.on("guildAuditLogEntryCreate", async (entry, guild) => {
  try {
    if (guild.id !== MAIN_GUILD_ID) return; // 메인 서버만

    // 역할 추가 또는 제거만 감지
    if (entry.action !== 25 && entry.action !== 26) return; 
    // 25 = ROLE_UPDATE_MEMBER, 26 = ROLE_REMOVE_MEMBER

    const target = entry.target; // 유저 객체
    if (!target || !target.id) return;

    const member = await guild.members.fetch(target.id).catch(() => null);
    if (!member) return;

    // 역할 변경 감지 시 닉네임 업데이트
    await updateNickname(member);
    console.log(`🔁 ${member.user.tag} 역할 변경 감지 → 닉네임 재설정 완료`);
  } catch (err) {
    console.error("❌ 역할 감사로그 감시 중 오류:", err);
  }
});

// === ✅ 기존 이벤트와 함께 작동 ===
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (newMember.guild.id !== MAIN_GUILD_ID) return;
    const oldRoles = oldMember.roles.cache.map(r => r.id);
    const newRoles = newMember.roles.cache.map(r => r.id);

    const changed =
      oldRoles.length !== newRoles.length ||
      !oldRoles.every((r) => newRoles.includes(r));

    if (changed) {
      await updateNickname(newMember);
      console.log(`🔁 ${newMember.user.tag} 역할 업데이트 감지 → 닉네임 변경`);
    }
  } catch (err) {
    console.error("❌ guildMemberUpdate 처리 오류:", err);
  }
});

// === 🧠 Gemini + 채팅 개수 ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const content = message.content.replace(`<@${client.user.id}>`, "").trim();

  // === 📊 오늘 채팅 개수 ===
  if (content.includes("오늘 채팅친 개수")) {
    const loading = await message.reply("<a:Loading:1433912890649215006> 오늘 채팅 기록을 조회중입니다...");
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0));
    const end = new Date(now.setHours(23, 59, 59, 999));
    let count = 0, lastId;
    while (true) {
      const msgs = await message.channel.messages.fetch({ limit: 100, before: lastId });
      if (msgs.size === 0) break;
      const filtered = msgs.filter(m => m.createdTimestamp >= start.getTime() && m.createdTimestamp <= end.getTime());
      count += filtered.size;
      lastId = msgs.last()?.id;
      if (!lastId || msgs.last().createdTimestamp < start.getTime()) break;
    }
    await loading.edit(`💬 오늘 채팅이 오고 간 개수는 **${count.toLocaleString()}개** 입니다.`);
    return;
  }

  // === 📊 어제 채팅 개수 ===
  if (content.includes("어제 채팅친 개수")) {
    const loading = await message.reply("<a:Loading:1433912890649215006> 어제 채팅 기록을 조회중입니다...");
    const now = new Date();
    const start = new Date(now.setDate(now.getDate() - 1));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    let count = 0, lastId;
    while (true) {
      const msgs = await message.channel.messages.fetch({ limit: 100, before: lastId });
      if (msgs.size === 0) break;
      const filtered = msgs.filter(m => m.createdTimestamp >= start.getTime() && m.createdTimestamp <= end.getTime());
      count += filtered.size;
      lastId = msgs.last()?.id;
      if (!lastId || msgs.last().createdTimestamp < start.getTime()) break;
    }
    await loading.edit(`💬 어제 채팅이 오고 간 개수는 **${count.toLocaleString()}개** 입니다.`);
    return;
  }

  // === 💬 Gemini 응답 ===
  client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  // === ❌ @everyone / @here 멘션 시 완전 무시 ===
  if (message.mentions.everyone) return;

  const content = message.content.replace(`<@${client.user.id}>`, "").trim();

  // === 📊 오늘 채팅 개수 ===
  if (content.includes("오늘 채팅친 개수")) {
    ...
    return;
  }

  // === 📊 어제 채팅 개수 ===
  if (content.includes("어제 채팅친 개수")) {
    ...
    return;
  }

  // === 💬 Gemini 응답 ===
  if (!content) return await message.reply("내용이랑 같이 해줄 수 있어? :D");

  const waitMsg = await message.reply("<a:Loading:1433912890649215006> 좋은 답변 생성 중...");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `너는 내 친구야. 싸가지 없고 강한 친구같은 한국어로 대화해줘. 내가 묻는 건 이거야: ${content}` }] }],
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "API 오류");

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      || "⚠️ 답변을 생성할 수 없어요.";

    const embed = new EmbedBuilder()
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setTitle("일런봇의 답변")
      .setDescription(answer)
      .setColor("#3e22a3")
      .setTimestamp();

    await waitMsg.edit({ content: "", embeds: [embed] });

  } catch (err) {
    console.error("❌ Gemini 오류:", err);
    await waitMsg.edit("⚠️ 오류가 발생했습니다.");
  }
});

// === 🚪 퇴장 로그 ===
client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== MAIN_GUILD_ID) return;
  const channel = member.guild.channels.cache.get(LEAVE_LOG_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("멤버가 퇴장했습니다.")
    .setColor("#d91e18")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "유저", value: `${member.user}`, inline: true },
      { name: "퇴장 시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
    );
  channel.send({ embeds: [embed] });
});

client.login(process.env.DISCORD_TOKEN);



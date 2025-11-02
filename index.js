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
      if (!guild) return console.warn("⚠️ 메인 서버를 찾을 수 없습니다.");

      const channel = guild.channels.cache.get(VERIFY_CHANNEL_ID);
      if (!channel) return console.warn("⚠️ 인증 채널을 찾을 수 없습니다.");

      const message = await channel.messages.fetch(VERIFY_MESSAGE_ID);
      if (!message) return console.warn("⚠️ 인증 메시지를 찾을 수 없습니다.");

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

  setInterval(checkVerifyReactions, 1000);
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
      lastId = msgs.last().id;
      if (msgs.last().createdTimestamp < start.getTime()) break;
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
      lastId = msgs.last().id;
      if (msgs.last().createdTimestamp < start.getTime()) break;
    }
    await loading.edit(`💬 어제 채팅이 오고 간 개수는 **${count.toLocaleString()}개** 입니다.`);
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
          contents: [{ parts: [{ text: `너는 내 친구야. 따뜻하고 자연스러운 한국어로 대화해줘. 내가 묻는 건 이거야: ${content}` }] }],
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "API 오류");

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "⚠️ 답변을 생성할 수 없어요.";
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

// === ✅ 초대 추적 시스템 ===
const invitesCache = new Map();
const inviteStats = new Map();

client.once("ready", async () => {
  console.log("📨 초대 추적 시스템 활성화됨");
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const guildInvites = await guild.invites.fetch();
      invitesCache.set(guildId, guildInvites);
    } catch (err) {
      console.warn(`⚠️ ${guild.name} 초대 정보를 가져올 수 없습니다: ${err.message}`);
    }
  }
});

client.on("inviteCreate", async (invite) => {
  const guildInvites = await invite.guild.invites.fetch();
  invitesCache.set(invite.guild.id, guildInvites);
});
client.on("inviteDelete", async (invite) => {
  const guildInvites = await invite.guild.invites.fetch();
  invitesCache.set(invite.guild.id, guildInvites);
});

// === 입장 추적 ===
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== MAIN_GUILD_ID) return;
  const joinChannel = member.guild.channels.cache.get(JOIN_LOG_CHANNEL);
  if (!joinChannel) return;

  let inviter = "❓ 알 수 없음";
  let inviteCode = "❓ 불명";

  try {
    const cachedInvites = invitesCache.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    const usedInvite = newInvites.find(
      (inv) => cachedInvites?.get(inv.code)?.uses < inv.uses
    );

    if (usedInvite) {
      inviter = usedInvite.inviter ? `${usedInvite.inviter.tag}` : "❓ 시스템 초대 또는 만료된 링크";
      inviteCode = usedInvite.code;
      const inviterId = usedInvite.inviter?.id;
      if (inviterId) {
        const stats = inviteStats.get(inviterId) || { joins: 0, leaves: 0 };
        stats.joins += 1;
        inviteStats.set(inviterId, stats);
      }
    }
    invitesCache.set(member.guild.id, newInvites);
  } catch (err) {
    console.error("❌ 초대 추적 오류:", err.message);
  }

  const embed = new EmbedBuilder()
    .setTitle("멤버가 입장했습니다!")
    .setColor("#00bcd4")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "유저", value: `${member.user.tag}`, inline: true },
      { name: "초대자", value: inviter, inline: true },
      { name: "초대 링크", value: `https://discord.gg/${inviteCode}`, inline: false },
      { name: "가입 시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
    );

  joinChannel.send({ embeds: [embed] });
});

// === 퇴장 추적 ===
client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== MAIN_GUILD_ID) return;
  const leaveChannel = member.guild.channels.cache.get(LEAVE_LOG_CHANNEL);
  if (!leaveChannel) return;

  let inviter = "❓ 알 수 없음";
  for (const [inviterId, stats] of inviteStats) {
    if (stats.joins > stats.leaves) {
      inviter = `<@${inviterId}>`;
      stats.leaves += 1;
      inviteStats.set(inviterId, stats);
      break;
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("멤버가 퇴장했습니다.")
    .setColor("#d91e18")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "유저", value: `${member.user.tag}`, inline: true },
      { name: "추정 초대자", value: inviter, inline: true },
      { name: "퇴장 시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
    );

  leaveChannel.send({ embeds: [embed] });
});

// === !초대랭킹 명령어 ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild?.id !== MAIN_GUILD_ID) return;
  if (message.content === "!초대랭킹") {
    if (inviteStats.size === 0)
      return message.reply("아직 초대 기록이 없습니다 😢");

    const sorted = [...inviteStats.entries()].sort(
      (a, b) => b[1].joins - a[1].joins
    );
    const top = sorted
      .slice(0, 10)
      .map(([id, stats], i) =>
        `**${i + 1}.** <@${id}> — ✅ ${stats.joins}명 초대, 🚪 ${stats.leaves}명 퇴장`
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🏆 초대 랭킹 TOP 10")
      .setColor("#f1c40f")
      .setDescription(top)
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);

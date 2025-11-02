import express from "express";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from "discord.js";
import dotenv from "dotenv";
dotenv.config();

// === ✅ Keep-alive 서버 (Render용) ===
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("✅ Discord bot is running!"));
app.listen(PORT, () => console.log(`🌐 Keep-alive server running on port ${PORT}`));

// === 환경 설정 ===
const MAIN_GUILD_ID = "1412427204117401673"; // ✅ 메인 서버 ID
const VERIFY_CHANNEL_ID = "1433902681511952465";
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
  partials: ["MESSAGE", "CHANNEL", "REACTION"],
});

const invites = new Map();

// === 🛰️ 상태 메시지 설정 ===
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

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} 로그인 완료!`);
  updateDefaultStatus();

  // 🌀 30초마다 상태 교체
  let toggle = false;
  setInterval(() => {
    toggle = !toggle;
    toggle ? updatePeperoStatus() : updateDefaultStatus();
  }, 30000);

  // 초대 캐싱
  for (const [id, guild] of client.guilds.cache) {
    try {
      const guildInvites = await guild.invites.fetch();
      invites.set(id, guildInvites);
    } catch {
      // 메인 서버 외에는 무시
    }
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
  if (!content) {
    await message.reply("내용이랑 같이 해줄 수 있어? :D");
    return;
  }

  const waitMsg = await message.reply("<a:Loading:1433912890649215006> 좋은 답변 생성 중...");
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `너는 내 친구야. 따뜻하고 자연스러운 한국어로 대화해줘. 내가 묻는 건 이거야: ${content}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "API 오류");

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "⚠️ 답변을 생성할 수 없어요.";

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

// === 🧾 인증 / 입퇴장 로그 (메인 서버만) ===

// 인증설정
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild?.id !== MAIN_GUILD_ID) return;
  if (message.content === "!인증설정") {
    if (!message.member.permissions.has("Administrator"))
      return message.reply("⛔ 관리자만 사용할 수 있습니다.");

    const embed = new EmbedBuilder()
      .setTitle("아래 이모티콘을 누르고 인증하세요.")
      .setDescription("이모티콘을 누르면 **사원** 역할이 지급됩니다.")
      .setColor("#3a872e");

    const verifyChannel = message.guild.channels.cache.get(VERIFY_CHANNEL_ID);
    if (!verifyChannel)
      return message.reply("⚠️ 인증 채널을 찾을 수 없습니다.");

    const sent = await verifyChannel.send({ embeds: [embed] });
    await sent.react("✅");
    message.reply("✅ 인증 메시지를 전송했습니다!");
  }
});

// ✅ 인증 반응 시 역할 지급
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  const guild = reaction.message.guild;
  if (!guild || guild.id !== MAIN_GUILD_ID) return;

  if (reaction.emoji.name !== "✅") return;
  const role = guild.roles.cache.get(VERIFY_ROLE_ID);
  if (!role) return;

  try {
    const member = await guild.members.fetch(user.id);
    if (!member.roles.cache.has(role.id)) await member.roles.add(role);
  } catch (err) {
    console.warn(`⚠️ ${user.username} 역할 추가 실패: ${err.message}`);
  }
});

// ✅ 입퇴장 로그
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== MAIN_GUILD_ID) return;
  const channel = member.guild.channels.cache.get(JOIN_LOG_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("멤버가 입장했습니다!")
    .setColor("#13759c")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "유저", value: `${member.user}` },
      { name: "입장 시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
    );
  channel.send({ embeds: [embed] });
});

client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== MAIN_GUILD_ID) return;
  const channel = member.guild.channels.cache.get(LEAVE_LOG_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("멤버가 퇴장했습니다.")
    .setColor("#d91e18")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "유저", value: `${member.user}` },
      { name: "퇴장 시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
    );
  channel.send({ embeds: [embed] });
});

client.login(process.env.DISCORD_TOKEN);

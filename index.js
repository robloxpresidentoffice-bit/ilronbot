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
  const total = client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0);
  if (client.user) {
    client.user.setPresence({
      activities: [{ name: `🛰️ ${total}명 보호 중`, type: 0 }],
      status: "online",
    });
  }
}

function updatePeperoStatus() {
  if (client.user) {
    client.user.setPresence({
      activities: [{ name: `💝 11월 11일은 빼빼로데이`, type: 0 }],
      status: "online",
    });
  }
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
  let firstCheck = true; // 시작 시 기존 반응자들에게 역할을 중복 지급하지 않도록 방지

  async function checkVerifyReactions() {
    try {
      const guild = client.guilds.cache.get(MAIN_GUILD_ID);
      if (!guild) return;

      const channel = guild.channels.cache.get(VERIFY_CHANNEL_ID);
      if (!channel) return;

      const message = await channel.messages.fetch(VERIFY_MESSAGE_ID).catch(() => null);
      if (!message) return;

      const reaction = message.reactions.cache.get("✅");
      if (!reaction) return;

      const users = await reaction.users.fetch();
      const currentSet = new Set(users.filter(u => !u.bot).map(u => u.id));

      if (firstCheck) {
        // 첫 체크에선 기존 반응자들을 기준으로만 초기화하고 처리하지 않음
        previousReactors = currentSet;
        firstCheck = false;
        return;
      }

      const newlyReacted = [...currentSet].filter(id => !previousReactors.has(id));

      for (const userId of newlyReacted) {
        try {
          // 먼저 멤버가 캐시에 있는지 확인, 없으면 fetch하되 실패하면 조용히 건너뜀
          let member = guild.members.cache.get(userId) || null;
          if (!member) {
            member = await guild.members.fetch(userId).catch(() => null);
          }
          if (!member) {
            // 서버에 더 이상 없는 사용자이거나 가져올 수 없음 — 경고는 남기되 연속 로그를 방지하기 위해 간단히 처리
            console.warn(`⚠️ ${userId} 처리 실패: 멤버를 찾을 수 없음 (서버에 없음 또는 권한 부족)`);
            continue;
          }

          const role = guild.roles.cache.get(VERIFY_ROLE_ID);
          if (!role) continue;

          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role).catch(err => {
              console.warn(`역할 추가 실패: ${member.user.tag} — ${err.message}`);
            });
            console.log(`역할 지급: ${member.user.tag}`);

            await updateNickname(member).catch(() => {});
          }
        } catch (err) {
          // 예외가 발생해도 루프를 멈추지 않도록 안전하게 처리
          console.warn(`⚠️ ${userId} 처리 실패: ${err.message}`);
        }
      }

      previousReactors = currentSet;
    } catch (err) {
      console.error("Reaction watcher error:", err.message);
    }
  }

  // 처음엔 한 번만 체크(초기화)하고, 이후에 주기적으로 체크
  checkVerifyReactions();
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
      await member.setNickname(newNick).catch(err => {
        if (err.code === 50013) {
          console.warn(`권한 부족: ${member.user.tag}`);
        }
      });
      console.log(`닉네임 변경: ${member.user.tag} → ${newNick}`);
    }
  } catch (err) {
    console.error("updateNickname error:", err);
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
    if (!res.ok) throw new Error(data.error?.message || "Gemini 요청 실패");

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
  try {
    if (!member.guild || member.guild.id !== MAIN_GUILD_ID) return;
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

    channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("guildMemberRemove error:", err);
  }
});

// === 입장 로그 ===
client.on("guildMemberAdd", async (member) => {
  try {
    if (!member.guild || member.guild.id !== MAIN_GUILD_ID) return;
    const channel = member.guild.channels.cache.get(JOIN_LOG_CHANNEL);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("멤버 입장")
      .setColor("#2ecc71")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "유저", value: `${member.user}`, inline: true },
        { name: "시간", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
      );

    channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error("guildMemberAdd error:", err);
  }
});

// === 로그인 처리 ===
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN || typeof TOKEN !== "string" || TOKEN.length < 10) {
  console.error("DISCORD_TOKEN이 설정되어 있지 않거나 잘못되었습니다. .env 파일과 Render의 환경 변수를 확인하세요.");
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error("로그인 실패:", err.message);
  process.exit(1);
});

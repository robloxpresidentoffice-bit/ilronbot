import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} from "discord.js";
import dotenv from "dotenv";
dotenv.config();

// === 환경 설정 ===
const VERIFY_CHANNEL_ID = "1433902681511952465";
const VERIFY_ROLE_ID = "1431223559690260520";
const JOIN_LOG_CHANNEL = "1433902671005487275";
const LEAVE_LOG_CHANNEL = "1433902689430802442";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 역할 ID 우선순위 (닉네임 변경용)
const ROLE_PRIORITY = [
  "1431223211785195663",
  "1431223251572494453",
  "1431223290269274225",
  "1431223359693389944",
  "1431223412533235753",
  "1431223468271206513",
  "1431223559690260520",
];

// 클라이언트 설정 시 partials 추가
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: ["MESSAGE", "CHANNEL", "REACTION"], // ✅ 이거 꼭 추가
});

const invites = new Map();

// === 봇 시작 ===
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} 로그인 완료!`);

  // 서버 초대 코드 캐싱
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const guildInvites = await guild.invites.fetch();
      invites.set(guildId, guildInvites);
    } catch {
      console.warn(`⚠️ ${guild.name} 서버의 초대 정보를 불러올 수 없습니다.`);
    }
  }

  // 기본 상태 설정
  const updateDefaultStatus = () => {
    const totalMembers = client.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0
    );

    client.user.setPresence({
      activities: [
        {
          name: `🛰️ ${totalMembers}명 보호하는 중`,
          type: 0, // 🎮 "하는 중"
        },
      ],
      status: "online",
    });
  };

  updateDefaultStatus();
  setInterval(updateDefaultStatus, 1000 * 60 * 5);
});

// === 초대 코드 갱신 ===
client.on("inviteCreate", async (invite) => {
  const guildInvites = await invite.guild.invites.fetch();
  invites.set(invite.guild.id, guildInvites);
});
client.on("inviteDelete", async (invite) => {
  const guildInvites = await invite.guild.invites.fetch();
  invites.set(invite.guild.id, guildInvites);
});

// === 1️⃣ Gemini 대화 ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // @everyone, @here 무시
  if (
    message.mentions.has(client.user) &&
    !message.mentions.everyone &&
    !message.content.includes("@here")
  ) {
    const content = message.content.replace(`<@${client.user.id}>`, "").trim();

    if (!content) {
      await message.reply("내용이랑 같이 해줄 수 있어? :D");
      return;
    }

    await message.channel.sendTyping();

    const thinkingMsg = await message.channel.send(
      "<a:Loading:1433912890649215006> 더 나은 답변 생각 중..."
    );

    try {
      const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
      const body = {
        contents: [
          {
            parts: [
              {
                text: `
너는 내 친구야.
따뜻하고 자연스러운 한국어로, 친구처럼 말하듯 대화해줘.
너무 딱딱하지 않게 감정 표현이나 유머도 괜찮아.
내가 묻고 싶은 건 이거야: ${content}
                `.trim(),
              },
            ],
          },
        ],
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("❌ Gemini API 오류:", JSON.stringify(data, null, 2));
        return thinkingMsg.edit(
          `<:Warning:1429715991591387146> API 오류: ${
            data.error?.message || "알 수 없는 오류입니다."
          }`
        );
      }

      const answer =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "<:Warning:1429715991591387146> 답변을 생성할 수 없어요.";

      const embed = new EmbedBuilder()
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL(),
        })
        .setTitle("일런봇의 답변")
        .setDescription(answer)
        .setColor("#3e22a3")
        .setTimestamp();

      await thinkingMsg.edit({ content: "", embeds: [embed] });
    } catch (err) {
      console.error("❌ 요청 중 오류:", err);
      await thinkingMsg.edit("⚠️ 오류가 발생했습니다.");
    }
  }
});

// === 2️⃣ !인증설정 ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content === "!인증설정") {
    if (!message.member.permissions.has("Administrator")) {
      return message.reply("⛔ 관리자만 사용할 수 있습니다.");
    }

    try {
      const embed = new EmbedBuilder()
        .setTitle("아래 이모티콘을 누르고 인증하세요.")
        .setDescription("이모티콘을 누르면 **사원** 역할이 지급됩니다.")
        .setColor("#3a872e");

      const verifyChannel = message.guild.channels.cache.get(VERIFY_CHANNEL_ID);
      if (!verifyChannel) return message.reply("⚠️ 인증 채널을 찾을 수 없습니다.");

      const sentMessage = await verifyChannel.send({ embeds: [embed] });
      await sentMessage.react("✅");

      message.reply("✅ 인증 메시지를 전송하고 체크 이모지를 추가했어요!");
    } catch (err) {
      console.error(err);
      message.reply("⚠️ 인증 메시지를 보내는 중 오류가 발생했어요.");
    }
  }
});

// === ✅ 인증 반응 시 역할 지급 ===
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  // ✅ partial(부분 로드)인 경우 fetch해서 완전한 객체로 만듦
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      console.error("❌ 반응 데이터를 불러올 수 없습니다:", err);
      return;
    }
  }

  const messageId = reaction.message.id;
  const channelId = reaction.message.channelId;

  // ✅ 인증 조건
  const isVerifyReaction =
    (channelId === VERIFY_CHANNEL_ID && reaction.emoji.name === "✅") ||
    (messageId === "1434239630248513546" && reaction.emoji.name === "✅");

  if (!isVerifyReaction) return;

  try {
    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);
    const role = guild.roles.cache.get(VERIFY_ROLE_ID);

    if (!role) return console.warn("⚠️ 역할을 찾을 수 없습니다.");

    await member.roles.add(role);
    console.log(`✅ ${member.user.username} 님에게 ${role.name} 역할 지급 완료!`);
  } catch (err) {
    console.error("❌ 역할 지급 중 오류:", err);
  }
});

// === ✅ 반응 개수 추적 기반 역할 지급 ===
const TARGET_MESSAGE_ID = "1434239630248513546";
const TARGET_EMOJI = "✅";
let lastReactionCount = 0;

async function checkReactions() {
  try {
    // 메시지 가져오기
    const guild = client.guilds.cache.first(); // 봇이 한 서버에만 있을 경우
    const verifyChannel = guild.channels.cache.get(VERIFY_CHANNEL_ID);
    if (!verifyChannel) return console.warn("⚠️ 인증 채널을 찾을 수 없습니다.");

    const msg = await verifyChannel.messages.fetch(TARGET_MESSAGE_ID);
    const reaction = msg.reactions.cache.get(TARGET_EMOJI);

    if (!reaction) return;

    // 반응 개수 비교
    const currentCount = reaction.count;

    if (currentCount !== lastReactionCount) {
      console.log(
        `✅ 반응 개수 변화 감지: ${lastReactionCount} → ${currentCount}`
      );
      lastReactionCount = currentCount;

      // ✅ 새로 반응한 유저들 목록 가져오기
      const users = await reaction.users.fetch();
      for (const [, user] of users) {
        if (user.bot) continue;

        try {
          const member = await guild.members.fetch(user.id);
          const role = guild.roles.cache.get(VERIFY_ROLE_ID);
          if (!role) continue;

          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            console.log(`🎉 ${member.user.username} 님에게 역할 지급 완료`);
          }
        } catch (err) {
          console.warn(`⚠️ ${user.username} 처리 실패: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error("❌ 반응 감지 중 오류:", err.message);
  }
}

// ✅ 10초마다 반응 상태 체크
setInterval(checkReactions, 10000);

// === 3️⃣ 입장 로그 ===
client.on("guildMemberAdd", async (member) => {
  const joinChannel = member.guild.channels.cache.get(JOIN_LOG_CHANNEL);
  if (!joinChannel) return;

  const joinedAt = new Date();
  const createdAt = member.user.createdAt;
  let inviter = "알 수 없음";

  try {
    const cachedInvites = invites.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    const usedInvite = newInvites.find(
      (inv) => cachedInvites?.get(inv.code)?.uses < inv.uses
    );
    if (usedInvite) inviter = `${usedInvite.inviter} (${usedInvite.inviter.username})`;
    invites.set(member.guild.id, newInvites);
  } catch {
    inviter = "초대자 정보를 불러올 수 없음";
  }

  const embed = new EmbedBuilder()
    .setTitle("멤버가 입장했습니다!")
    .setColor("#13759c")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "**유저**", value: `${member.user} (${member.user.username})` },
      { name: "**서버 입장 시간**", value: `<t:${Math.floor(joinedAt.getTime() / 1000)}:F>` },
      { name: "**계정 생성일**", value: `<t:${Math.floor(createdAt.getTime() / 1000)}:F>` },
      { name: "**초대자**", value: inviter }
    );

  joinChannel.send({ embeds: [embed] });
});

// === 4️⃣ 퇴장 로그 ===
client.on("guildMemberRemove", async (member) => {
  const leaveChannel = member.guild.channels.cache.get(LEAVE_LOG_CHANNEL);
  if (!leaveChannel) return;

  const leftAt = new Date();
  const createdAt = member.user.createdAt;

  const embed = new EmbedBuilder()
    .setTitle("멤버가 퇴장했습니다.")
    .setColor("#d91e18")
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "**유저**", value: `${member.user} (${member.user.username})` },
      { name: "**서버 퇴장 시간**", value: `<t:${Math.floor(leftAt.getTime() / 1000)}:F>` },
      { name: "**계정 생성일**", value: `<t:${Math.floor(createdAt.getTime() / 1000)}:F>` }
    );

  leaveChannel.send({ embeds: [embed] });
});

// === ✅ 역할 기반 닉네임 접두사 추가 ===
async function updateNickname(member) {
  try {
    // 지정된 역할 중 우선순위 높은 역할 찾기
    const roles = member.roles.cache
      .filter((role) => ROLE_PRIORITY.includes(role.id))
      .sort(
        (a, b) => ROLE_PRIORITY.indexOf(a.id) - ROLE_PRIORITY.indexOf(b.id)
      );

    if (roles.size === 0) return;

    const topRole = roles.first();

    // ✅ 현재 닉네임 → 없으면 표시 이름(displayName) → username
const baseName =
  member.nickname || 
  member.user.globalName ||  // ✅ 전역 표시 이름 (오프라인 유저 포함)
  member.displayName || 
  member.user.username;


    // ✅ 기존 접두사 제거
    const cleanBase = baseName.replace(/^ん\[.*?\]\s*/g, "").trim();

    // ✅ 새 닉네임: 접두사만 추가
    const newNickname = `ん[${topRole.name}] ${cleanBase}`;

    if (member.nickname === newNickname) return;

    await member.setNickname(newNickname);
    console.log(`✅ ${member.user.username} → ${newNickname}`);
  } catch (err) {
    if (err.code === 50013) {
      console.warn(
        `⚠️ ${member.user.username} 닉네임 변경 불가 (권한 부족 / 역할 순위 낮음)`
      );
    } else {
      console.error(`❌ ${member.user.username} 닉네임 변경 실패:`, err.message);
    }
  }
}

// === ✅ !닉네임업데이트 명령어 ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content !== "!닉네임업데이트") return;

  if (!message.member.permissions.has("Administrator")) {
    return message.reply("⛔ 관리자만 사용할 수 있습니다.");
  }

  await message.reply("🔄 모든 멤버의 닉네임을 갱신 중입니다...");

  const members = await message.guild.members.fetch();
  let success = 0,
    failed = 0;

  for (const [, member] of members) {
    try {
      await updateNickname(member);
      success++;
      await new Promise((r) => setTimeout(r, 800)); // API 속도 제한 방지
    } catch {
      failed++;
    }
  }

  message.reply(`✅ 닉네임 업데이트 완료!\n성공: ${success}명 / 실패: ${failed}명`);
});

// === ✅ !닉네임초기화 명령어 ===
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content !== "!닉네임초기화") return;

  if (!message.member.permissions.has("Administrator")) {
    return message.reply("⛔ 관리자만 사용할 수 있습니다.");
  }

  await message.reply("🧹 모든 멤버의 닉네임을 디스플레이 닉네임 기준으로 초기화 중입니다...");

  const members = await message.guild.members.fetch();
  let reset = 0,
      failed = 0;

  for (const [, member] of members) {
    try {
      // ✅ 디스플레이 이름 선택 (offline 대응 포함)
      const displayBase =
        member.user.globalName || // 전역 표시 이름 (offline 지원)
        member.displayName ||     // 온라인 시 표시 이름
        member.nickname ||        // 별명 fallback
        member.user.username;     // 최종 fallback

      // ✅ 접두사 제거 후 표시 이름으로 덮어쓰기
      const cleanBase = displayBase.replace(/^ん\[.*?\]\s*/g, "").trim();

      await member.setNickname(cleanBase);
      reset++;

      await new Promise((r) => setTimeout(r, 800)); // 속도 제한 방지
    } catch (err) {
      failed++;
      console.warn(`⚠️ ${member.user.username} 초기화 실패: ${err.message}`);
    }
  }

  message.reply(`✅ 디스플레이 닉네임 기준 초기화 완료!\n초기화됨: ${reset}명 / 실패: ${failed}명`);
});

// === ✅ 역할 변경 시 자동 갱신 ===
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache.map((r) => r.id);
  const newRoles = newMember.roles.cache.map((r) => r.id);

  const changed =
    oldRoles.length !== newRoles.length ||
    !oldRoles.every((r) => newRoles.includes(r));

  if (changed) await updateNickname(newMember);
});

// === ✅ 서버 입장 시 자동 갱신 ===
client.on("guildMemberAdd", async (member) => await updateNickname(member));

// === 6️⃣ 관리자 DM으로 상태 변경 ===
client.on("messageCreate", async (message) => {
  if (message.channel.type !== 1) return;
  if (message.author.bot) return;
  if (message.author.id !== "1410269476011770059") return;

  if (message.content.startsWith("!set")) {
    const args = message.content.slice(4).trim().split(/\s+/);
    const emoji = args[0].match(/[\p{Emoji}\u200d]+/gu)
      ? args[0]
      : "🛰️";
    const text = args.slice(emoji === "🛰️" ? 0 : 1).join(" ").trim();

    if (!text)
      return message.reply("⚠️ 사용법: `!set [이모지] [내용]`\n예: `!set 🎃 해피 할로윈 마감중`");

    try {
      await client.user.setPresence({
        activities: [{ name: `${emoji} ${text}`, type: 0 }],
        status: "online",
      });
      message.reply(`✅ 상태가 업데이트되었습니다!\n현재 상태: \`${emoji} ${text}\``);
    } catch (err) {
      console.error("❌ 상태 업데이트 오류:", err);
      message.reply("⚠️ 상태를 업데이트하는 중 오류가 발생했습니다.");
    }
  }
});

// === 실행 ===
client.login(process.env.DISCORD_TOKEN);

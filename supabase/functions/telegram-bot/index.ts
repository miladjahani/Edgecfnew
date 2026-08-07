import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function tgPost(token: string, method: string, body: Record<string, unknown>) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

async function sendMsg(token: string, chatId: string | number, text: string, keyboard?: object, editMessageId?: number) {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
  if (keyboard) body.reply_markup = keyboard;
  if (editMessageId) {
    body.message_id = editMessageId;
    return tgPost(token, "editMessageText", body);
  }
  return tgPost(token, "sendMessage", body);
}

async function editMsg(token: string, chatId: string | number, messageId: number, text: string, keyboard?: object) {
  const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" };
  if (keyboard) body.reply_markup = keyboard;
  return tgPost(token, "editMessageText", body);
}

// Fire-and-forget: track user + log activity without blocking the response
function trackUser(telegramId: string, userId: string, username: string | null, firstName: string | null, lastName: string | null) {
  EdgeRuntime.waitUntil((async () => {
    const { data: existing } = await supabase
      .from("bot_users").select("id, is_admin").eq("telegram_id", telegramId).maybeSingle();

    if (existing) {
      await supabase.from("bot_users")
        .update({ last_activity: new Date().toISOString(), username, first_name: firstName, last_name: lastName })
        .eq("id", existing.id);
    } else {
      await supabase.from("bot_users").insert({
        user_id: userId, telegram_id: telegramId, username,
        first_name: firstName, last_name: lastName, is_active: true, is_admin: false,
      });
      await supabase.from("activity_logs").insert({
        user_id: userId, action: "bot_user_joined", entity_type: "bot",
        entity_name: username ? `@${username}` : firstName,
      });
    }
  })());
}

async function checkIsAdmin(telegramId: string): Promise<boolean> {
  const { data } = await supabase
    .from("bot_users").select("is_admin").eq("telegram_id", telegramId).maybeSingle();
  return data?.is_admin ?? false;
}

async function checkSystemAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("auth.users").select("email").eq("id", userId).maybeSingle();
  return data?.email === "milad201400@gmail.com";
}

async function getUserByTelegramId(telegramId: string) {
  const { data } = await supabase
    .from("bot_users").select("*").eq("telegram_id", telegramId).maybeSingle();
  return data;
}

async function getUserByUsername(username: string, userId: string) {
  const { data } = await supabase
    .from("bot_users").select("*").eq("username", username.startsWith("@") ? username.substring(1) : username).eq("user_id", userId).maybeSingle();
  return data;
}

async function getAllUsers(userOwnerId: string, limit = 50, offset = 0) {
  const { data } = await supabase
    .from("bot_users").select("*").eq("user_id", userOwnerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return data ?? [];
}

async function banUser(userId: string, telegramId: string, reason?: string) {
  await supabase.from("bot_users").update({ is_active: false }).eq("telegram_id", telegramId);
  await supabase.from("activity_logs").insert({
    action: "user_banned",
    entity_type: "bot_user",
    entity_name: telegramId,
    details: { reason: reason || "No reason provided" },
  });
}

async function unbanUser(telegramId: string) {
  await supabase.from("bot_users").update({ is_active: true }).eq("telegram_id", telegramId);
  await supabase.from("activity_logs").insert({
    action: "user_unbanned",
    entity_type: "bot_user",
    entity_name: telegramId,
  });
}

async function deleteUser(telegramId: string) {
  await supabase.from("bot_users").delete().eq("telegram_id", telegramId);
  await supabase.from("activity_logs").insert({
    action: "user_deleted",
    entity_type: "bot_user",
    entity_name: telegramId,
  });
}

async function pollDeploymentStatus(deploymentId: string, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase
      .from("deployments").select("status, worker_url, panel_url, error_message")
      .eq("id", deploymentId).maybeSingle();
    if (data && (data.status === "deployed" || data.status === "failed")) return data;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { status: "timeout", worker_url: null, panel_url: null, error_message: "timeout" };
}

// Inline keyboard builder with nested menus - GLASS BUTTONS
function buildMainMenuKeyboard(isAdmin: boolean, isSystemAdmin: boolean) {
  const kb: any[] = [
    [{ text: "🚀 استقرار ورکر", callback_data: "deploy" }, { text: "📊 وضعیت", callback_data: "status" }],
    [{ text: "📋 ورکرها", callback_data: "workers" }, { text: "🔗 کانفیگ‌ها", callback_data: "configs" }],
  ];
  
  if (isAdmin || isSystemAdmin) {
    kb.push([{ text: "👥 مدیریت کاربران", callback_data: "users_menu" }]);
    kb.push([{ text: "🔐 پنل ادمین", callback_data: "admin_panel" }]);
  }
  
  kb.push(
    [{ text: "📞 پشتیبانی", callback_data: "support" }],
    [{ text: "❓ راهنما", callback_data: "help" }]
  );
  
  return { inline_keyboard: kb };
}

function buildUsersMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📊 آمار کاربران", callback_data: "user_stats" }],
      [{ text: "👥 لیست کاربران", callback_data: "user_list_p1" }],
      [{ text: "🔍 جستجوی کاربر", callback_data: "user_search" }],
      [{ text: "⛔ کاربران مسدود", callback_data: "banned_users" }],
      [{ text: "🔙 بازگشت", callback_data: "back_main" }],
    ],
  };
}

function buildUserListKeyboard(users: any[], page: number, hasMore: boolean) {
  const kb: any[] = [];
  
  users.forEach((u: any) => {
    const status = u.is_admin ? "👑" : u.is_active ? "✅" : "❌";
    const name = u.first_name ?? u.username ?? "کاربر ناشناس";
    kb.push([{
      text: `${status} ${name.substring(0, 25)}`,
      callback_data: `user_detail_${u.telegram_id}`
    }]);
  });
  
  const navRow: any[] = [];
  if (page > 1) navRow.push({ text: "◀️ صفحه قبل", callback_data: `user_list_p${page - 1}` });
  if (hasMore) navRow.push({ text: "صفحه بعد ▶️", callback_data: `user_list_p${page + 1}` });
  if (navRow.length > 0) kb.push(navRow);
  
  kb.push([{ text: "🔙 بازگشت", callback_data: "back_users_menu" }]);
  
  return { inline_keyboard: kb };
}

function buildUserDetailKeyboard(telegramId: string, isActive: boolean, isAdmin: boolean) {
  return {
    inline_keyboard: [
      [{ 
        text: isActive ? "⛔ مسدود کردن" : "✅ فعال کردن", 
        callback_data: `toggle_ban_${telegramId}` 
      }],
      [{ 
        text: isAdmin ? "👎 حذف ادمین" : "👑 ارتقا به ادمین", 
        callback_data: `toggle_admin_${telegramId}` 
      }],
      [{ 
        text: "🗑 حذف کاربر", 
        callback_data: `delete_user_${telegramId}` 
      }],
      [{ text: "🔙 بازگشت", callback_data: "back_users_list" }],
    ],
  };
}

function buildAdminPanelKeyboard(isSystemAdmin: boolean) {
  const kb: any[] = [
    [{ text: "👤 مدیریت ادمین‌ها", callback_data: "manage_admins" }],
    [{ text: "📊 گزارش فعالیت‌ها", callback_data: "activity_report" }],
    [{ text: "👥 مدیریت کاربران", callback_data: "users_menu" }],
  ];
  if (isSystemAdmin) {
    kb.push([{ text: "⚙️ تنظیمات سیستم", callback_data: "system_settings" }]);
    kb.push([{ text: "📢 ارسال پیام همگانی", callback_data: "broadcast_msg" }]);
  }
  kb.push([{ text: "🔙 بازگشت", callback_data: "back_main" }]);
  return { inline_keyboard: kb };
}

function buildSupportKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📢 کانال تلگرام", url: "https://t.me/miliconfig" }],
      [{ text: "💬 تماس با پشتیبانی", url: "https://t.me/milad201400" }],
      [{ text: "🔙 بازگشت", callback_data: "back_main" }],
    ],
  };
}

function buildHelpKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📚 مستندات کامل", url: "https://github.com/miliconfig" }],
      [{ text: "📞 پشتیبانی", callback_data: "support" }],
      [{ text: "🔙 بازگشت", callback_data: "back_main" }],
    ],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const update = await req.json();

    // Callback queries (inline button presses)
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const cbData = cq.data;
      const fromId = String(cq.from?.id);
      tgPost("", "answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});

      const { data: cfgs } = await supabase.from("bot_config").select("*").eq("is_active", true);
      if (!cfgs?.length) return ok();
      const cfg = cfgs[0];
      const bt = cfg.bot_token;

      // Check if user is admin or system admin
      const isAdmin = await checkIsAdmin(fromId);
      const { data: userData } = await supabase.from("bot_users").select("user_id").eq("telegram_id", fromId).maybeSingle();
      const isSystemAdmin = userData?.user_id ? await checkSystemAdmin(userData.user_id) : false;

      if (cbData === "status") {
        const [tk, dp, bu] = await Promise.all([
          supabase.from("cf_tokens").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
          supabase.from("deployments").select("status").eq("user_id", cfg.user_id),
          supabase.from("bot_users").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
        ]);
        const deployed = (dp.data ?? []).filter((d: { status: string }) => d.status === "deployed").length;
        await sendMsg(bt, chatId, `📊 <b>وضعیت سرویس‌ها:</b>\n\n🔑 توکن‌ها: ${tk.count ?? 0}\n🚀 ورکرهای مستقر: ${deployed}\n👥 کاربران: ${bu.count ?? 0}\n🤖 ربات: ${cfg.is_active ? "فعال ✅" : "غیرفعال ❌"}`);
      } else if (cbData === "workers") {
        const { data: ws } = await supabase.from("deployments").select("name, status, worker_url").eq("user_id", cfg.user_id).order("created_at", { ascending: false }).limit(10);
        if (!ws?.length) { await sendMsg(bt, chatId, "هنوز ورکری مستقر نشده."); }
        else { let m = "🚀 <b>ورکرهای اخیر:</b>\n\n"; ws.forEach((w: { name: string; status: string; worker_url: string | null }) => { const e = w.status === "deployed" ? "✅" : w.status === "failed" ? "❌" : "⏳"; m += `${e} <code>${w.name}</code>\n`; if (w.worker_url) m += `   🔗 <code>${w.worker_url}</code>\n`; }); await sendMsg(bt, chatId, m); }
      } else if (cbData === "configs") {
        const { data: ws } = await supabase.from("deployments").select("name, status, panel_url, worker_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("status", "deployed").order("created_at", { ascending: false }).limit(5);
        if (!ws?.length) { await sendMsg(bt, chatId, "🔗 هنوز ورکر مستقر شده‌ای وجود ندارد."); }
        else { let m = "🔗 <b>کانفیگ‌های اخیر:</b>\n\n"; ws.forEach((w: { name: string; worker_url: string; uuid: string; custom_path: string | null }) => { const p = w.custom_path || w.uuid; m += `📦 <code>${w.name}</code>\nساب: <code>${w.worker_url}/${p}</code>\n\n`; }); await sendMsg(bt, chatId, m); }
      } else if (cbData === "users_menu") {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود: فقط ادمین‌ها می‌توانند به این بخش دسترسی داشته باشند.");
        } else {
          await sendMsg(bt, chatId, "👥 <b>مدیریت کاربران</b>\n\nبخش مدیریت کاربران را انتخاب کنید:", buildUsersMenuKeyboard());
        }
      } else if (cbData === "user_stats") {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود.");
        } else {
          const { count: total } = await supabase.from("bot_users").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id);
          const { count: active } = await supabase.from("bot_users").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id).eq("is_active", true);
          const { count: admins } = await supabase.from("bot_users").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id).eq("is_admin", true);
          await sendMsg(bt, chatId, `📊 <b>آمار کاربران:</b>\n\n👥 کل: ${total ?? 0}\n✅ فعال: ${active ?? 0}\n👑 ادمین: ${admins ?? 0}`);
        }
      } else if (cbData === "user_list") {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود.");
        } else {
          const { data: users } = await supabase.from("bot_users").select("username, first_name, is_admin, is_active").eq("user_id", cfg.user_id).order("created_at", { ascending: false }).limit(20);
          if (!users?.length) {
            await sendMsg(bt, chatId, "هنوز کاربری وجود ندارد.");
          } else {
            let m = "👥 <b>لیست کاربران (۲۰ نفر اخیر):</b>\n\n";
            users.forEach((u: { username: string | null; first_name: string | null; is_admin: boolean; is_active: boolean }) => {
              const badge = u.is_admin ? "👑" : u.is_active ? "✅" : "❌";
              m += `${badge} ${u.first_name ?? u.username ?? 'کاربر ناشناس'}\n`;
            });
            await sendMsg(bt, chatId, m);
          }
        }
      } else if (cbData === "admin_panel") {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود: فقط ادمین‌ها می‌توانند به پنل ادمین دسترسی داشته باشند.");
        } else {
          await sendMsg(bt, chatId, "🔐 <b>پنل مدیریت</b>\n\nانتخاب کنید:", buildAdminPanelKeyboard(isSystemAdmin));
        }
      } else if (cbData === "manage_admins") {
        if (!isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم (milad201400@gmail.com) می‌تواند ادمین‌ها را مدیریت کند.");
        } else {
          const { data: admins } = await supabase.from("bot_users").select("telegram_id, username, first_name, is_admin").eq("user_id", cfg.user_id).eq("is_admin", true);
          if (!admins?.length) {
            await sendMsg(bt, chatId, "👑 هنوز ادمینی تعریف نشده است.");
          } else {
            let m = "👑 <b>لیست ادمین‌ها:</b>\n\n";
            admins.forEach((a: { telegram_id: string; username: string | null; first_name: string | null }) => {
              m += `• ${a.first_name ?? a.username ?? 'کاربر'} (<code>${a.telegram_id}</code>)\n`;
            });
            m += "\nبرای افزودن/حذف ادمین، از دستور /makeadmin یا /removeadmin استفاده کنید.";
            await sendMsg(bt, chatId, m);
          }
        }
      } else if (cbData === "activity_report") {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود.");
        } else {
          const { data: logs } = await supabase.from("activity_logs").select("action, entity_name, created_at").eq("user_id", cfg.user_id).order("created_at", { ascending: false }).limit(10);
          if (!logs?.length) {
            await sendMsg(bt, chatId, "هیچ فعالیتی ثبت نشده است.");
          } else {
            let m = "📊 <b>گزارش فعالیت‌های اخیر:</b>\n\n";
            logs.forEach((l: { action: string; entity_name: string | null; created_at: string }) => {
              const time = new Date(l.created_at).toLocaleString('fa-IR');
              m += `• ${l.action} - ${l.entity_name ?? '-'}\n  🕒 ${time}\n`;
            });
            await sendMsg(bt, chatId, m);
          }
        }
      } else if (cbData === "system_settings") {
        if (!isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم.");
        } else {
          await sendMsg(bt, chatId, "⚙️ <b>تنظیمات سیستم</b>\n\nاین بخش مخصوص ادمین اصلی است.\nاز دستورات زیر استفاده کنید:\n• /setadmin @username - افزودن ادمین\n• /removeadmin @username - حذف ادمین\n• /broadcast پیام - ارسال پیام همگانی");
        }
      } else if (cbData === "user_list_p1" || cbData.startsWith("user_list_p")) {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود.");
        } else {
          const page = parseInt(cbData.replace("user_list_p", "")) || 1;
          const limit = 10;
          const offset = (page - 1) * limit;
          const users = await getAllUsers(cfg.user_id, limit + 1, offset);
          const hasMore = users.length > limit;
          const displayUsers = hasMore ? users.slice(0, limit) : users;
          
          if (displayUsers.length === 0) {
            await sendMsg(bt, chatId, "هنوز کاربری وجود ندارد.");
          } else {
            let m = `👥 <b>لیست کاربران (صفحه ${page}):</b>\n\n`;
            displayUsers.forEach((u: any) => {
              const badge = u.is_admin ? "👑" : u.is_active ? "✅" : "❌";
              const name = u.first_name ?? u.username ?? "کاربر ناشناس";
              m += `${badge} ${name.substring(0, 30)}\n`;
            });
            await sendMsg(bt, chatId, m, buildUserListKeyboard(displayUsers, page, hasMore));
          }
        }
      } else if (cbData.startsWith("user_detail_")) {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود.");
        } else {
          const telegramId = cbData.replace("user_detail_", "");
          const user = await getUserByTelegramId(telegramId);
          if (!user) {
            await sendMsg(bt, chatId, "❌ کاربر یافت نشد.");
          } else {
            const statusText = user.is_admin ? "ادمین 👑" : user.is_active ? "فعال ✅" : "مسدود ❌";
            const name = user.first_name ?? user.username ?? "کاربر ناشناس";
            let m = `👤 <b>اطلاعات کاربر:</b>\n\n`;
            m += `نام: ${name}\n`;
            m += `آیدی تلگرام: <code>${user.telegram_id}</code>\n`;
            if (user.username) m += `یوزرنیم: @${user.username}\n`;
            m += `وضعیت: ${statusText}\n`;
            m += `تاریخ عضویت: ${new Date(user.created_at).toLocaleString('fa-IR')}\n`;
            if (user.last_activity) m += `آخرین فعالیت: ${new Date(user.last_activity).toLocaleString('fa-IR')}\n`;
            
            await sendMsg(bt, chatId, m, buildUserDetailKeyboard(user.telegram_id, user.is_active, user.is_admin));
          }
        }
      } else if (cbData.startsWith("toggle_ban_")) {
        if (!isSystemAdmin && !isAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین‌ها.");
        } else {
          const telegramId = cbData.replace("toggle_ban_", "");
          const user = await getUserByTelegramId(telegramId);
          if (!user) {
            await sendMsg(bt, chatId, "❌ کاربر یافت نشد.");
          } else {
            if (user.is_admin) {
              await sendMsg(bt, chatId, "⛔ نمی‌توان ادمین را مسدود کرد.");
            } else {
              const newStatus = !user.is_active;
              await supabase.from("bot_users").update({ is_active: newStatus }).eq("telegram_id", telegramId);
              await sendMsg(bt, chatId, `✅ کاربر ${newStatus ? "مسدود شد" : "فعال شد"}.`);
              
              // Refresh the detail view
              const updatedUser = await getUserByTelegramId(telegramId);
              if (updatedUser) {
                const msgId = cq.message?.message_id;
                if (msgId) {
                  const statusText = updatedUser.is_admin ? "ادمین 👑" : updatedUser.is_active ? "فعال ✅" : "مسدود ❌";
                  const name = updatedUser.first_name ?? updatedUser.username ?? "کاربر ناشناس";
                  let m = `👤 <b>اطلاعات کاربر:</b>\n\n`;
                  m += `نام: ${name}\n`;
                  m += `آیدی تلگرام: <code>${updatedUser.telegram_id}</code>\n`;
                  if (updatedUser.username) m += `یوزرنیم: @${updatedUser.username}\n`;
                  m += `وضعیت: ${statusText}\n`;
                  await editMsg(bt, chatId, msgId, m, buildUserDetailKeyboard(updatedUser.telegram_id, updatedUser.is_active, updatedUser.is_admin));
                }
              }
            }
          }
        }
      } else if (cbData.startsWith("toggle_admin_")) {
        if (!isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم می‌تواند ادمین تغییر دهد.");
        } else {
          const telegramId = cbData.replace("toggle_admin_", "");
          const user = await getUserByTelegramId(telegramId);
          if (!user) {
            await sendMsg(bt, chatId, "❌ کاربر یافت نشد.");
          } else {
            const newAdminStatus = !user.is_admin;
            await supabase.from("bot_users").update({ is_admin: newAdminStatus }).eq("telegram_id", telegramId);
            await sendMsg(bt, chatId, `✅ کاربر ${newAdminStatus ? "به ادمین ارتقا یافت" : "از ادمین حذف شد"}.`);
            
            // Log the action
            await supabase.from("activity_logs").insert({
              action: newAdminStatus ? "admin_promoted" : "admin_demoted",
              entity_type: "bot_user",
              entity_name: user.username ?? String(telegramId),
              details: { changed_by: "system_admin" }
            });
            
            // Refresh the detail view
            const msgId = cq.message?.message_id;
            if (msgId) {
              const updatedUser = await getUserByTelegramId(telegramId);
              if (updatedUser) {
                const statusText = updatedUser.is_admin ? "ادمین 👑" : updatedUser.is_active ? "فعال ✅" : "مسدود ❌";
                const name = updatedUser.first_name ?? updatedUser.username ?? "کاربر ناشناس";
                let m = `👤 <b>اطلاعات کاربر:</b>\n\n`;
                m += `نام: ${name}\n`;
                m += `آیدی تلگرام: <code>${updatedUser.telegram_id}</code>\n`;
                if (updatedUser.username) m += `یوزرنیم: @${updatedUser.username}\n`;
                m += `وضعیت: ${statusText}\n`;
                await editMsg(bt, chatId, msgId, m, buildUserDetailKeyboard(updatedUser.telegram_id, updatedUser.is_active, updatedUser.is_admin));
              }
            }
          }
        }
      } else if (cbData.startsWith("delete_user_")) {
        if (!isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم.");
        } else {
          const telegramId = cbData.replace("delete_user_", "");
          const user = await getUserByTelegramId(telegramId);
          if (!user) {
            await sendMsg(bt, chatId, "❌ کاربر یافت نشد.");
          } else {
            await supabase.from("bot_users").delete().eq("telegram_id", telegramId);
            await sendMsg(bt, chatId, `✅ کاربر حذف شد.`);
            
            // Go back to list
            const page = 1;
            const limit = 10;
            const users = await getAllUsers(cfg.user_id, limit, 0);
            const hasMore = users.length >= limit;
            await sendMsg(bt, chatId, "👥 لیست کاربران:", buildUserListKeyboard(users.slice(0, limit), page, hasMore));
          }
        }
      } else if (cbData === "back_users_menu") {
        await sendMsg(bt, chatId, "👥 <b>مدیریت کاربران</b>\n\nبخش مدیریت کاربران را انتخاب کنید:", buildUsersMenuKeyboard());
      } else if (cbData === "back_users_list") {
        const page = 1;
        const limit = 10;
        const users = await getAllUsers(cfg.user_id, limit, 0);
        const hasMore = users.length >= limit;
        await sendMsg(bt, chatId, "👥 لیست کاربران:", buildUserListKeyboard(users.slice(0, limit), page, hasMore));
      } else if (cbData === "banned_users") {
        if (!isAdmin && !isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ دسترسی محدود.");
        } else {
          const { data: users } = await supabase.from("bot_users").select("*").eq("user_id", cfg.user_id).eq("is_active", false).limit(20);
          if (!users?.length) {
            await sendMsg(bt, chatId, "هیچ کاربر مسدودی وجود ندارد. ✅");
          } else {
            let m = "⛔ <b>کاربران مسدود:</b>\n\n";
            users.forEach((u: any) => {
              const name = u.first_name ?? u.username ?? "کاربر ناشناس";
              m += `• ${name} (<code>${u.telegram_id}</code>)\n`;
            });
            await sendMsg(bt, chatId, m);
          }
        }
      } else if (cbData === "help") {
        await sendMsg(bt, chatId, "📖 <b>راهنمای ربات Miliconfig</b>\n\n" +
          "🚀 <b>دستورات عمومی:</b>\n" +
          "/start - شروع کار با ربات\n" +
          "/help - نمایش این راهنما\n" +
          "/status - وضعیت سرویس‌ها\n" +
          "/workers - لیست ورکرها\n" +
          "/config [name] - دریافت کانفیگ\n" +
          "/sub [name] - دریافت لینک ساب\n" +
          "/panel [name] - دریافت پنل\n" +
          "\n🔐 <b>دستورات ادمین:</b>\n" +
          "/deploy [name] - استقرار ورکر جدید\n" +
          "/set [name] [key] [value] - تنظیمات ورکر\n" +
          "/makeadmin @user - تعیین ادمین (فقط milad201400@gmail.com)\n" +
          "/removeadmin @user - حذف ادمین\n" +
          "\n📞 پشتیبانی: @milad201400", buildHelpKeyboard());
      } else if (cbData === "broadcast_msg") {
        if (!isSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم.");
        } else {
          await sendMsg(bt, chatId, "📢 <b>ارسال پیام همگانی</b>\n\n" +
            "برای ارسال پیام به همه کاربران، از دستور زیر استفاده کنید:\n" +
            "<code>/broadcast متن پیام شما</code>\n\n" +
            "⚠️ توجه: این پیام به تمام کاربران ربات ارسال خواهد شد.");
        }
      } else if (cbData === "support") {
        await sendMsg(bt, chatId, "📞 <b>پشتیبانی</b>\n\nبرای دریافت پشتیبانی به کانال تلگرام ما بپیوندید:", buildSupportKeyboard());
      } else if (cbData === "back_main") {
        await sendMsg(bt, chatId, cfg.welcome_message, buildMainMenuKeyboard(isAdmin, isSystemAdmin));
      }

      return ok();
    }

    const message = update.message;
    if (!message || !message.text) return ok();

    const chatId = message.chat.id;
    const telegramId = String(message.from.id);
    const username = message.from.username ?? null;
    const firstName = message.from.first_name ?? null;
    const lastName = message.from.last_name ?? null;
    const text = message.text.trim();

    // Get bot config — the only blocking call before sending reply
    const { data: cfgs } = await supabase.from("bot_config").select("*").eq("is_active", true);
    if (!cfgs?.length) return ok();
    const cfg = cfgs[0];
    const bt = cfg.bot_token;

    // Track user in background (non-blocking)
    trackUser(telegramId, cfg.user_id, username, firstName, lastName);

    if (text === "/start") {
      // Check if user is admin or system admin for personalized menu
      const isAdmin = await checkIsAdmin(telegramId);
      const { data: userData } = await supabase.from("bot_users").select("user_id").eq("telegram_id", telegramId).maybeSingle();
      const isSystemAdmin = userData?.user_id ? await checkSystemAdmin(userData.user_id) : false;
      
      let welcomeText = cfg.welcome_message;
      if (isSystemAdmin) {
        welcomeText = `👑 <b>سلام ادمین اصلی!</b>\n\n${cfg.welcome_message}\n\nشما دسترسی کامل به تمام بخش‌ها دارید.`;
      } else if (isAdmin) {
        welcomeText = `👤 <b>سلام ادمین عزیز!</b>\n\n${cfg.welcome_message}\n\nشما دسترسی به پنل مدیریت کاربران دارید.`;
      }
      
      await sendMsg(bt, chatId, welcomeText, buildMainMenuKeyboard(isAdmin, isSystemAdmin));

    } else if (text === "/help") {
      await sendMsg(bt, chatId, "📖 <b>دستورات:</b>\n\n/start - شروع\n/deploy &lt;name&gt; - استقرار (ادمین)\n/workers - ورکرها\n/config &lt;name&gt; - کانفیگ\n/sub [name] - ساب\n/panel [name] - پنل\n/status - وضعیت\n/help - راهنما", buildHelpKeyboard());

    } else if (text === "/status") {
      const [tk, dp, bu] = await Promise.all([
        supabase.from("cf_tokens").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
        supabase.from("deployments").select("status").eq("user_id", cfg.user_id),
        supabase.from("bot_users").select("*", { count: "exact", head: true }).eq("user_id", cfg.user_id),
      ]);
      const deployed = (dp.data ?? []).filter((d: { status: string }) => d.status === "deployed").length;
      await sendMsg(bt, chatId, `📊 <b>وضعیت:</b>\n\n🔑 توکن‌ها: ${tk.count ?? 0}\n🚀 ورکرها: ${deployed}\n👥 کاربران: ${bu.count ?? 0}\n🤖 ربات: ${cfg.is_active ? "فعال ✅" : "غیرفعال ❌"}`);

    } else if (text === "/workers") {
      const { data: ws } = await supabase.from("deployments").select("name, status, worker_url").eq("user_id", cfg.user_id).order("created_at", { ascending: false }).limit(10);
      if (!ws?.length) { await sendMsg(bt, chatId, "هنوز ورکری مستقر نشده."); }
      else { let m = "🚀 <b>ورکرها:</b>\n\n"; ws.forEach((w: { name: string; status: string; worker_url: string | null }) => { const e = w.status === "deployed" ? "✅" : w.status === "failed" ? "❌" : "⏳"; m += `${e} <code>${w.name}</code>\n`; if (w.worker_url) m += `   🔗 <code>${w.worker_url}</code>\n`; }); await sendMsg(bt, chatId, m); }

    } else if (text === "/tokens") {
      const { data: ts } = await supabase.from("cf_tokens").select("name, status").eq("user_id", cfg.user_id).order("created_at", { ascending: false });
      if (!ts?.length) { await sendMsg(bt, chatId, "🔑 هنوز توکنی اضافه نشده."); }
      else { let m = "🔑 <b>توکن‌ها:</b>\n\n"; ts.forEach((t: { name: string; status: string }) => { m += `${t.status === "active" ? "✅" : "❌"} ${t.name}\n`; }); await sendMsg(bt, chatId, m); }

    } else if (text.startsWith("/config")) {
      const parts = text.split(" ");
      if (parts.length < 2) { await sendMsg(bt, chatId, "📋 استفاده: <code>/config my-worker</code>"); }
      else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: w } = await supabase.from("deployments").select("name, status, worker_url, panel_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
        if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
        else if (w.status !== "deployed") { await sendMsg(bt, chatId, `⏳ <code>${wn}</code> هنوز مستقر نشده.`); }
        else { const p = w.custom_path || w.uuid; await sendMsg(bt, chatId, `📋 <b>${wn}</b>\n\n🔐 پنل:\n<code>${w.panel_url}</code>\n\n🔗 ساب:\n<code>${w.worker_url}/${p}</code>`); }
      }

    } else if (text.startsWith("/sub")) {
      const parts = text.split(" ");
      if (parts.length < 2) {
        const { data: ws } = await supabase.from("deployments").select("name, worker_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("status", "deployed").order("created_at", { ascending: false });
        if (!ws?.length) { await sendMsg(bt, chatId, "🔗 ورکری نیست."); }
        else { let m = "🔗 <b>ساب‌ها:</b>\n\n"; ws.forEach((w: { name: string; worker_url: string; uuid: string; custom_path: string | null }) => { m += `📦 <code>${w.name}</code>\n<code>${w.worker_url}/${w.custom_path || w.uuid}</code>\n\n`; }); await sendMsg(bt, chatId, m); }
      } else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: w } = await supabase.from("deployments").select("name, status, worker_url, uuid, custom_path").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
        if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
        else if (w.status !== "deployed") { await sendMsg(bt, chatId, `⏳ <code>${wn}</code> مستقر نشده.`); }
        else { await sendMsg(bt, chatId, `🔗 <b>${wn}</b>\n\n<code>${w.worker_url}/${w.custom_path || w.uuid}</code>`); }
      }

    } else if (text.startsWith("/panel")) {
      const parts = text.split(" ");
      if (parts.length < 2) {
        const { data: ws } = await supabase.from("deployments").select("name, panel_url").eq("user_id", cfg.user_id).eq("status", "deployed").order("created_at", { ascending: false });
        if (!ws?.length) { await sendMsg(bt, chatId, "🔐 ورکری نیست."); }
        else { let m = "🔐 <b>پنل‌ها:</b>\n\n"; ws.forEach((w: { name: string; panel_url: string | null }) => { m += `📦 <code>${w.name}</code>\n<code>${w.panel_url}</code>\n\n`; }); await sendMsg(bt, chatId, m); }
      } else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: w } = await supabase.from("deployments").select("name, status, panel_url").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
        if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
        else if (w.status !== "deployed") { await sendMsg(bt, chatId, `⏳ <code>${wn}</code> مستقر نشده.`); }
        else { await sendMsg(bt, chatId, `🔐 <b>${wn}</b>\n\n<code>${w.panel_url}</code>`); }
      }

    } else if (text.startsWith("/set")) {
      const parts = text.split(" ");
      if (parts.length < 4) { await sendMsg(bt, chatId, "⚙️ استفاده: <code>/set worker key value</code>"); }
      else if (!await checkIsAdmin(telegramId)) { await sendMsg(bt, chatId, "⛔ فقط ادمین."); }
      else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const key = parts[2].toLowerCase();
        const val = parts.slice(3).join(" ");
        if (!["path", "proxyip", "region", "homepage"].includes(key)) { await sendMsg(bt, chatId, `❌ کلید نامعتبر.`); }
        else {
          const { data: w } = await supabase.from("deployments").select("name, config").eq("user_id", cfg.user_id).eq("name", wn).maybeSingle();
          if (!w) { await sendMsg(bt, chatId, `❌ <code>${wn}</code> پیدا نشد.`); }
          else { const c = (w.config as Record<string, unknown>) ?? {}; c[key] = val; await supabase.from("deployments").update({ config: c }).eq("name", wn); await sendMsg(bt, chatId, `✅ <code>${wn}</code> به‌روز شد.\n${key}: <code>${val}</code>`); }
        }
      }

    } else if (text.startsWith("/deploy")) {
      const parts = text.split(" ");
      if (parts.length < 2) { await sendMsg(bt, chatId, "🚀 استفاده: <code>/deploy my-worker</code>"); }
      else if (!await checkIsAdmin(telegramId)) { await sendMsg(bt, chatId, "⛔ فقط ادمین."); }
      else {
        const wn = parts[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
        const { data: token } = await supabase.from("cf_tokens").select("*").eq("user_id", cfg.user_id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!token) { await sendMsg(bt, chatId, "🔑 توکن فعالی نیست."); }
        else {
          await sendMsg(bt, chatId, `🚀 در حال استقرار <code>${wn}</code>...`);
          const du = crypto.randomUUID();
          const { data: dep } = await supabase.from("deployments").insert({ user_id: cfg.user_id, name: wn, worker_code: "[telegram]", config: { source: "telegram" }, status: "deploying", uuid: du, method: "workers" }).select().single();
          try {
            const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cf-deploy`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
              body: JSON.stringify({ deployment_id: dep?.id, worker_name: wn, cf_token: token.token, uuid: du, method: "workers" }),
            });
            const result = await resp.json();
            if (result.success) {
              const fs = await pollDeploymentStatus(dep!.id, 80);
              if (fs.status === "deployed") await sendMsg(bt, chatId, `✅ <b>مستقر شد!</b>\n\n🔗 <code>${fs.worker_url}</code>\n🔐 <code>${fs.panel_url}</code>`);
              else if (fs.status === "failed") await sendMsg(bt, chatId, `❌ ناموفق:\n${fs.error_message ?? "خطا"}`);
              else await sendMsg(bt, chatId, `⏳ <code>${wn}</code> در جریان است.`);
            } else { await supabase.from("deployments").update({ status: "failed", error_message: result.error ?? "unknown" }).eq("id", dep?.id); await sendMsg(bt, chatId, `❌ ${result.error ?? "خطا"}`); }
          } catch (e) { const m = e instanceof Error ? e.message : "خطا"; await supabase.from("deployments").update({ status: "failed", error_message: m }).eq("id", dep?.id); await sendMsg(bt, chatId, `❌ ${m}`); }
        }
      }

    } else if (text.startsWith("/makeadmin")) {
      // System admin only command to make a user admin
      const parts = text.split(" ");
      if (parts.length < 2) { 
        await sendMsg(bt, chatId, "⚙️ استفاده: <code>/makeadmin @username</code> یا <code>/makeadmin telegram_id</code>"); 
      } else {
        // Check if caller is system admin
        const { data: callerData } = await supabase.from("bot_users").select("user_id").eq("telegram_id", telegramId).maybeSingle();
        const isCallerSystemAdmin = callerData?.user_id ? await checkSystemAdmin(callerData.user_id) : false;
        
        if (!isCallerSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم (milad201400@gmail.com) می‌تواند ادمین جدید تعیین کند.");
        } else {
          const target = parts[1].startsWith("@") ? parts[1].substring(1) : parts[1];
          const { data: targetUser } = await supabase.from("bot_users")
            .select("id, username")
            .or(`telegram_id.eq.${target},username.eq.${target}`)
            .eq("user_id", cfg.user_id)
            .maybeSingle();
          
          if (!targetUser) {
            await sendMsg(bt, chatId, `❌ کاربر با مشخصات ${target} یافت نشد.`);
          } else {
            await supabase.from("bot_users").update({ is_admin: true }).eq("id", targetUser.id);
            await sendMsg(bt, chatId, `✅ کاربر <code>${targetUser.username ?? targetUser.id}</code> به عنوان ادمین تعیین شد.`);
            await supabase.from("activity_logs").insert({ 
              action: "admin_promoted", 
              entity_type: "bot_user", 
              entity_name: targetUser.username ?? String(target),
              details: { promoted_by: "system_admin" }
            });
          }
        }
      }

    } else if (text.startsWith("/removeadmin")) {
      // System admin only command to remove admin
      const parts = text.split(" ");
      if (parts.length < 2) { 
        await sendMsg(bt, chatId, "⚙️ استفاده: <code>/removeadmin @username</code> یا <code>/removeadmin telegram_id</code>"); 
      } else {
        const { data: callerData } = await supabase.from("bot_users").select("user_id").eq("telegram_id", telegramId).maybeSingle();
        const isCallerSystemAdmin = callerData?.user_id ? await checkSystemAdmin(callerData.user_id) : false;
        
        if (!isCallerSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم.");
        } else {
          const target = parts[1].startsWith("@") ? parts[1].substring(1) : parts[1];
          const { data: targetUser } = await supabase.from("bot_users")
            .select("id, username")
            .or(`telegram_id.eq.${target},username.eq.${target}`)
            .eq("user_id", cfg.user_id)
            .maybeSingle();
          
          if (!targetUser) {
            await sendMsg(bt, chatId, `❌ کاربر با مشخصات ${target} یافت نشد.`);
          } else {
            await supabase.from("bot_users").update({ is_admin: false }).eq("id", targetUser.id);
            await sendMsg(bt, chatId, `✅ دسترسی ادمین کاربر <code>${targetUser.username ?? targetUser.id}</code> حذف شد.`);
            await supabase.from("activity_logs").insert({ 
              action: "admin_demoted", 
              entity_type: "bot_user", 
              entity_name: targetUser.username ?? String(target),
              details: { demoted_by: "system_admin" }
            });
          }
        }
      }

    } else if (text === "/support") {
      await sendMsg(bt, chatId, "📞 <b>پشتیبانی</b>

برای دریافت پشتیبانی به کانال تلگرام ما بپیوندید:

📢 https://t.me/miliconfig", buildSupportKeyboard());

    } else if (text.startsWith("/broadcast")) {
      const parts = text.split(" ");
      if (parts.length < 2) { 
        await sendMsg(bt, chatId, "⚙️ استفاده: <code>/broadcast متن پیام شما</code>"); 
      } else {
        const { data: callerData } = await supabase.from("bot_users").select("user_id").eq("telegram_id", telegramId).maybeSingle();
        const isCallerSystemAdmin = callerData?.user_id ? await checkSystemAdmin(callerData.user_id) : false;
        
        if (!isCallerSystemAdmin) {
          await sendMsg(bt, chatId, "⛔ فقط ادمین اصلی سیستم (milad201400@gmail.com) می‌تواند پیام همگانی ارسال کند.");
        } else {
          const messageText = parts.slice(1).join(" ");
          const { data: allUsers } = await supabase.from("bot_users").select("telegram_id").eq("user_id", cfg.user_id).eq("is_active", true);
          
          if (!allUsers?.length) {
            await sendMsg(bt, chatId, "هیچ کاربر فعالی برای ارسال پیام وجود ندارد.");
          } else {
            let sentCount = 0;
            let failedCount = 0;
            
            for (const user of allUsers) {
              try {
                await tgPost(bt, "sendMessage", {
                  chat_id: user.telegram_id,
                  text: `📢 <b>پیام همگانی از طرف ادمین:</b>

${messageText}`,
                  parse_mode: "HTML"
                });
                sentCount++;
              } catch {
                failedCount++;
              }
            }
            
            await sendMsg(bt, chatId, `✅ پیام همگانی ارسال شد.

📊 آمار:
• موفق: ${sentCount}
• ناموفق: ${failedCount}`);
            
            await supabase.from("activity_logs").insert({
              action: "broadcast_sent",
              entity_type: "bot",
              entity_name: "broadcast",
              details: { sent_to: sentCount, failed: failedCount, message: messageText.substring(0, 100) }
            });
          }
        }
      }

    } else {
      await sendMsg(bt, chatId, "متوجه نشدم. /help را بفرست.", buildHelpKeyboard());
    }

    return ok();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

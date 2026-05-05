// Настройка Supabase для заявок, модерации и публикации материалов.
// После создания проекта Supabase открой Project Settings -> API и вставь сюда:
// 1) Project URL
// 2) anon public key / publishable key
// Secret/service_role ключи сюда НЕ вставлять.
window.SUPABASE_CONFIG = {
  url: "https://qygayinuchdngerceupt.supabase.co",
  anonKey: "sb_publishable_7S_qFgU6NZXyMvOA1RV4Tg_12ZyM4Dq",
  adminEmail: "i.klimka694@gmail.com"
};

window.SUBMISSION_CONFIG = {
  successPage: "thank_you.html"
};

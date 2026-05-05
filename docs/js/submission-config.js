// Настройка Supabase для заявок, модерации и публикации материалов.
// После создания проекта Supabase открой Project Settings -> API и вставь сюда:
// 1) Project URL
// 2) anon public key / publishable key
// Secret/service_role ключи сюда НЕ вставлять.
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
  adminEmail: "your-email@example.com"
};

window.SUBMISSION_CONFIG = {
  successPage: "thank_you.html"
};

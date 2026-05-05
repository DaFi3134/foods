// Настройка Supabase для заявок, модерации и публикации материалов.
// После создания проекта Supabase открой Project Settings -> API и вставь сюда:
// 1) Project URL
// 2) anon public key / publishable key
// Secret/service_role ключи сюда НЕ вставлять.
window.SUPABASE_CONFIG = {
  url: "https://qygayinuchdngerceupt.supabase.co/rest/v1",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Z2F5aW51Y2hkbmdlcmNldXB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTYxMTksImV4cCI6MjA5MzU3MjExOX0.B2mV__rdQjDZX0QRpqR4U3TrvvAzkq83enVwrKOEDsQ",
  adminEmail: "your-email@example.com"
};

window.SUBMISSION_CONFIG = {
  successPage: "thank_you.html"
};

/*
 * Public Supabase client configuration.
 * The publishable key is expected in browser code; RLS/Edge Functions enforce access.
 * NEVER put OPENAI_API_KEY, a Supabase secret key, or any other server secret here.
 */
window.SUPABASE_CONFIG = Object.freeze({
  url: "https://qekkfmsiwocrxbwyuwsa.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFla2tmbXNpd29jcnhid3l1d3NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwODk0MzEsImV4cCI6MjEwNDY2NTQzMX0.IdoeUvLpD1AC2FcItSb5tZqNWUwdaYAwYpEgGCf4MVk",
  aiFunction: "ai-assistant",
  submissionFunction: "submit-content"
});

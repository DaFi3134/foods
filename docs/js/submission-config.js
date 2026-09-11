/*
 * Public Supabase client configuration.
 * The publishable key is expected in browser code; RLS/Edge Functions enforce access.
 * NEVER put OPENAI_API_KEY, a Supabase secret key, or any other server secret here.
 */
window.SUPABASE_CONFIG = Object.freeze({
  url: "https://qekkfmsiwocrxbwyuwsa.supabase.co",
  anonKey: "sb_publishable_sxSTaCsbI6tSBdaDfSn-Nw_WPDkLS5Z",
  aiFunction: "ai-assistant",
  submissionFunction: "submit-content"
});

import { createClient } from "@supabase/supabase-js";

// Polyfill WebSocket for SSR environments where Node 20 lacks global WebSocket
if (typeof globalThis !== "undefined" && typeof globalThis.WebSocket === "undefined") {
  class SsrWebSocketShim {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  }
  (globalThis as any).WebSocket = SsrWebSocketShim;
}

// Public anon credentials — safe to embed in browser JS.
// The anon key is restricted by Row Level Security at the database level.
// See: https://supabase.com/docs/guides/api/api-keys
const SUPABASE_URL = "https://ximmktvbqsijgpawhcee.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpbW1rdHZicXNpamdwYXdoY2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzkxMzcsImV4cCI6MjEwMzE1NTEzN30." +
  "-NR4rVrqrK7TvtMow0n5jbZNZcvR-7Re9MOt_-6yXU8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

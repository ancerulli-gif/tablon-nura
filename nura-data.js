/* ============================================================
   nura-data.js — Capa de acceso a datos de NURA / RecOne
   ------------------------------------------------------------
   Centraliza en un solo sitio:
     · La conexión con Supabase (URL, clave anon, bucket)
     · El login/logout real (Supabase Auth)
     · Una API de operaciones sobre las tablas del Tablón

   Se carga ANTES del script principal del index.html.
   Expone:
     window.NuraDB   → API de datos (auth, announcements, storage, table)
     window.db       → el cliente Supabase (compatibilidad con el código actual)
   ============================================================ */
(function (global) {
  "use strict";

  // ── Configuración de conexión ──
  var SUPA_URL = "https://fdszxvscbfgyoinylbfu.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkc3p4dnNjYmZneW9pbnlsYmZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTM4MTcsImV4cCI6MjA5NjU2OTgxN30.6ZdkoJr_ANqFpiciXwJ2eJ7QfpCvKBwK0ztrkydvEFM";
  var BUCKET = "attachments";

  if (!global.supabase || !global.supabase.createClient) {
    console.error("[NuraDB] La librería de Supabase no está cargada. Comprueba el orden de los <script>.");
  }
  var client = global.supabase.createClient(SUPA_URL, SUPA_KEY);

  // ── API de datos ──
  var NuraDB = {
    client: client,
    BUCKET: BUCKET,
    SUPA_URL: SUPA_URL,
    SUPA_KEY: SUPA_KEY,

    // ── Autenticación (login por PIN respaldado por Supabase Auth) ──
    auth: {
      // Devuelve { ok, role, user } o { ok:false, reason:'no_user'|'bad_pin'|'error' }
      loginWithPin: async function (displayName, pin) {
        try {
          var lk = await client.from("login_lookup")
            .select("auth_email").eq("display_name", displayName).maybeSingle();
          if (lk.error || !lk.data) return { ok: false, reason: "no_user" };

          var auth = await client.auth.signInWithPassword({
            email: lk.data.auth_email, password: pin
          });
          if (auth.error || !auth.data || !auth.data.user) return { ok: false, reason: "bad_pin" };

          var mem = await client.from("org_members")
            .select("role").eq("user_id", auth.data.user.id).maybeSingle();
          return { ok: true, user: auth.data.user, role: (mem.data && mem.data.role) || "recepcionista" };
        } catch (e) {
          return { ok: false, reason: "error", error: e };
        }
      },
      logout: async function () {
        try { await client.auth.signOut(); } catch (e) {}
      },
      getSession: async function () {
        var r = await client.auth.getSession();
        return (r.data && r.data.session) || null;
      },
      getUserId: async function () {
        var r = await client.auth.getUser();
        return (r.data && r.data.user && r.data.user.id) || null;
      }
    },

    // ── Anuncios del Tablón ──
    announcements: {
      list: function (section, sinceIso) {
        var q = client.from("announcements").select("*")
          .eq("section", section).order("created_at", { ascending: false });
        if (sinceIso) q = q.gte("created_at", sinceIso);
        return q;
      },
      get: function (id) { return client.from("announcements").select("*").eq("id", id).single(); },
      insert: function (row) { return client.from("announcements").insert([row]); },
      update: function (id, patch) { return client.from("announcements").update(patch).eq("id", id); },
      remove: function (id) { return client.from("announcements").delete().eq("id", id); },
      move: function (id, section) { return client.from("announcements").update({ section: section }).eq("id", id); },
      count: function (section) {
        return client.from("announcements").select("*", { count: "exact", head: true }).eq("section", section);
      }
    },

    // ── Almacenamiento de archivos ──
    storage: {
      upload: function (path, file) { return client.storage.from(BUCKET).upload(path, file, { upsert: true }); },
      publicUrl: function (path) { return client.storage.from(BUCKET).getPublicUrl(path); }
    },

    // ── Acceso genérico a cualquier tabla (para el resto de módulos) ──
    // Uso: NuraDB.table('relevo').select('*')...  (equivalente a db.from('relevo'))
    table: function (name) { return client.from(name); }
  };

  // Exponer globalmente
  global.NuraDB = NuraDB;
  global.db = client;         // compatibilidad: el código existente sigue usando "db"
  global._sharedDb = client;
})(window);

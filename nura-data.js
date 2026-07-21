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

  // ── Estado interno ──
  var _orgId = null; // organización del usuario logueado (cache)

  // Devuelve el org_id del usuario actual (lo consulta si no está en cache)
  async function getMyOrgId() {
    if (_orgId) return _orgId;
    var u = await client.auth.getUser();
    var uid = u.data && u.data.user && u.data.user.id;
    if (!uid) return null;
    var m = await client.from("org_members").select("org_id").eq("user_id", uid).maybeSingle();
    _orgId = (m.data && m.data.org_id) || null;
    return _orgId;
  }

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
            .select("role, org_id").eq("user_id", auth.data.user.id).maybeSingle();
          _orgId = (mem.data && mem.data.org_id) || null; // cachear org
          return {
            ok: true, user: auth.data.user,
            role: (mem.data && mem.data.role) || "recepcionista",
            orgId: _orgId
          };
        } catch (e) {
          return { ok: false, reason: "error", error: e };
        }
      },
      logout: async function () {
        _orgId = null;
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

    // ── org_id del usuario actual (para el resto de módulos) ──
    getMyOrgId: getMyOrgId,

    // ── Ajustes de la organización (marca, propiedades, secciones, turnos) ──
    settings: {
      // Devuelve el objeto de ajustes de la organización (o null si no hay)
      get: async function () {
        var oid = await getMyOrgId();
        if (!oid) return null;
        var r = await client.from("org_settings").select("settings").eq("org_id", oid).maybeSingle();
        return (r.data && r.data.settings) || null;
      },
      // Guarda (upsert) el objeto de ajustes completo. Solo admin (lo aplica la RLS).
      save: async function (settingsObj) {
        var oid = await getMyOrgId();
        if (!oid) return { error: { message: "sin organización" } };
        return client.from("org_settings").upsert(
          { org_id: oid, settings: settingsObj, updated_at: new Date().toISOString() },
          { onConflict: "org_id" }
        );
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

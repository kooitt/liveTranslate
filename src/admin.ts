import { LANGUAGES } from "./languages";
import { escapeHtml } from "./html";
import {
  login,
  logout,
  me,
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  listSessions,
  stopSession,
  listAdminAccounts,
  createAdminAccount,
  deleteAdminAccount,
  type AdminRoom,
} from "./admin-api";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function initAdminView(root: HTMLElement): Promise<void> {
  root.classList.add("wide");
  try {
    const { email } = await me();
    renderDashboard(root, email);
  } catch {
    renderLogin(root);
  }
}

function renderLogin(root: HTMLElement): void {
  root.innerHTML = `
    <div style="max-width:380px">
      <p class="panel-label">Admin dashboard</p>
      <h1 class="landing-title">Log in</h1>
      <form id="login-form">
        <div class="field">
          <label class="field-label" for="login-email">Email</label>
          <input id="login-email" class="field-input" type="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label class="field-label" for="login-password">Password</label>
          <input id="login-password" class="field-input" type="password" required autocomplete="current-password" />
        </div>
        <p id="login-error" class="state-message hidden" style="color:var(--color-error)"></p>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Log in</button>
        </div>
      </form>
    </div>
  `;

  const form = root.querySelector<HTMLFormElement>("#login-form")!;
  const errorEl = root.querySelector<HTMLParagraphElement>("#login-error")!;
  form.onsubmit = async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const email = root.querySelector<HTMLInputElement>("#login-email")!.value;
    const password = root.querySelector<HTMLInputElement>("#login-password")!.value;
    try {
      const result = await login(email, password);
      renderDashboard(root, result.email);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : "Could not log in";
      errorEl.classList.remove("hidden");
    }
  };
}

function renderDashboard(root: HTMLElement, email: string): void {
  root.innerHTML = `
    <div>
      <div class="shell-header" style="border:none; padding:0; margin-bottom: var(--space-4)">
        <div>
          <p class="panel-label">Admin dashboard</p>
          <h1 class="landing-title" style="margin:0">Rooms &amp; sessions</h1>
        </div>
        <div class="btn-row" style="align-items:center">
          <span style="color:var(--color-muted); font-size:var(--text-secondary)">${escapeHtml(email)}</span>
          <button id="logout-btn" class="btn btn-ghost">Log out</button>
        </div>
      </div>

      <hr class="divider" />
      <p class="panel-label">Live session</p>
      <div id="live-block"></div>

      <hr class="divider" />
      <div class="btn-row" style="justify-content:space-between; align-items:center">
        <p class="panel-label" style="margin:0">Translation rooms</p>
        <button id="new-room-btn" class="btn btn-secondary">Add room</button>
      </div>
      <div id="room-form-wrap" class="hidden" style="margin-top: var(--space-4)"></div>
      <div id="rooms-block" style="margin-top: var(--space-4)"></div>

      <hr class="divider" />
      <p class="panel-label">Admin accounts</p>
      <div id="admins-block"></div>
    </div>
  `;

  root.querySelector<HTMLButtonElement>("#logout-btn")!.onclick = async () => {
    await logout();
    renderLogin(root);
  };

  const liveBlock = root.querySelector<HTMLDivElement>("#live-block")!;
  const roomsBlock = root.querySelector<HTMLDivElement>("#rooms-block")!;
  const roomFormWrap = root.querySelector<HTMLDivElement>("#room-form-wrap")!;
  const adminsBlock = root.querySelector<HTMLDivElement>("#admins-block")!;

  async function refreshLive(): Promise<void> {
    liveBlock.innerHTML = '<p class="state-message">Loading…</p>';
    const sessions = await listSessions();
    const live = sessions.find((s) => s.live);
    const history = sessions.filter((s) => !s.live).slice(0, 5);

    liveBlock.innerHTML = `
      ${
        live
          ? `<div class="join-panel">
              <div class="btn-row" style="justify-content:space-between; align-items:center">
                <div>
                  <p class="session-name" style="font-size:var(--text-section-title)">${escapeHtml(live.name)}</p>
                  <span class="status status-live"><span class="status-dot"></span>Live since ${new Date(live.startedAt).toLocaleTimeString()}</span>
                </div>
                <button id="stop-live-btn" class="btn btn-danger">Stop session</button>
              </div>
            </div>`
          : '<p class="state-message">No session is currently live.</p>'
      }
      ${
        history.length
          ? `<table class="admin-table" style="margin-top:var(--space-4)">
              <thead><tr><th>Name</th><th>Started</th><th>Ended</th></tr></thead>
              <tbody>
                ${history
                  .map(
                    (s) => `<tr>
                      <td>${escapeHtml(s.name)}</td>
                      <td>${new Date(s.startedAt).toLocaleString()}</td>
                      <td>${s.endedAt ? new Date(s.endedAt).toLocaleString() : "—"}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`
          : ""
      }
    `;

    root.querySelector<HTMLButtonElement>("#stop-live-btn")?.addEventListener("click", async () => {
      if (!live) return;
      await stopSession(live.id);
      refreshLive();
    });
  }

  let editingRoomId: number | null = null;

  function closeRoomForm(): void {
    editingRoomId = null;
    roomFormWrap.classList.add("hidden");
    roomFormWrap.innerHTML = "";
  }

  function openRoomForm(room?: AdminRoom): void {
    editingRoomId = room?.id ?? null;
    const langOptions = LANGUAGES.map(
      (l) => `<option value="${l.code}" ${room?.targetLanguage === l.code ? "selected" : ""}>${l.englishName}</option>`,
    ).join("");
    roomFormWrap.innerHTML = `
      <form id="room-form" class="setup-form" style="border:1px solid var(--color-border); border-radius:var(--radius-panel); padding:var(--space-4)">
        <div class="field">
          <label class="field-label" for="room-name">Name</label>
          <input id="room-name" class="field-input" value="${escapeHtml(room?.name ?? "")}" required />
        </div>
        <div class="field">
          <label class="field-label" for="room-slug">URL slug</label>
          <input id="room-slug" class="field-input" value="${escapeHtml(room?.slug ?? "")}" required />
        </div>
        <div class="field">
          <label class="field-label" for="room-lang">Target language</label>
          <select id="room-lang" class="field-select">${langOptions}</select>
        </div>
        <p id="room-form-error" class="state-message hidden" style="color:var(--color-error)"></p>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">${room ? "Save" : "Create room"}</button>
          <button type="button" id="room-form-cancel" class="btn btn-secondary">Cancel</button>
        </div>
      </form>
    `;
    roomFormWrap.classList.remove("hidden");

    const nameInput = roomFormWrap.querySelector<HTMLInputElement>("#room-name")!;
    const slugInput = roomFormWrap.querySelector<HTMLInputElement>("#room-slug")!;
    const errorEl = roomFormWrap.querySelector<HTMLParagraphElement>("#room-form-error")!;

    // Auto-suggest the slug from the name until the admin edits the slug
    // field directly — once they touch it, their choice always wins.
    let slugTouched = Boolean(room);
    slugInput.addEventListener("input", () => {
      slugTouched = true;
    });
    nameInput.addEventListener("input", () => {
      if (!slugTouched) slugInput.value = slugify(nameInput.value);
    });

    roomFormWrap.querySelector<HTMLButtonElement>("#room-form-cancel")!.onclick = closeRoomForm;
    roomFormWrap.querySelector<HTMLFormElement>("#room-form")!.onsubmit = async (e) => {
      e.preventDefault();
      errorEl.classList.add("hidden");
      const payload = {
        name: nameInput.value,
        slug: slugInput.value,
        targetLanguage: roomFormWrap.querySelector<HTMLSelectElement>("#room-lang")!.value,
      };
      try {
        if (editingRoomId) await updateRoom(editingRoomId, payload);
        else await createRoom(payload);
        closeRoomForm();
        refreshRooms();
      } catch (err) {
        errorEl.textContent = err instanceof Error ? err.message : "Could not save room";
        errorEl.classList.remove("hidden");
      }
    };
  }

  root.querySelector<HTMLButtonElement>("#new-room-btn")!.onclick = () => openRoomForm();

  async function refreshRooms(): Promise<void> {
    const rooms = await listRooms();
    roomsBlock.innerHTML = rooms.length
      ? `<table class="admin-table">
          <thead><tr><th>Name</th><th>Language</th><th>Link</th><th></th></tr></thead>
          <tbody>
            ${rooms
              .map((room) => {
                const link = `${location.origin}/room/${room.slug}`;
                const lang = LANGUAGES.find((l) => l.code === room.targetLanguage)?.englishName ?? room.targetLanguage;
                return `<tr>
                  <td>${escapeHtml(room.name)}</td>
                  <td>${escapeHtml(lang)}</td>
                  <td><a href="${link}" target="_blank" rel="noopener" class="join-link" style="display:inline-block">${link}</a></td>
                  <td class="btn-row" style="justify-content:flex-end">
                    <button type="button" class="btn btn-secondary room-edit-btn" data-id="${room.id}">Edit</button>
                    <button type="button" class="btn btn-danger room-delete-btn" data-id="${room.id}">Delete</button>
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>`
      : '<p class="state-message">No rooms yet — add one to get a permanent link and QR code for a language.</p>';

    roomsBlock.querySelectorAll<HTMLButtonElement>(".room-edit-btn").forEach((btn) => {
      btn.onclick = () => {
        const room = rooms.find((r) => r.id === Number(btn.dataset.id));
        if (room) openRoomForm(room);
      };
    });
    roomsBlock.querySelectorAll<HTMLButtonElement>(".room-delete-btn").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Delete this room? Its link and QR code will stop working.")) return;
        await deleteRoom(Number(btn.dataset.id));
        refreshRooms();
      };
    });
  }

  async function refreshAdmins(): Promise<void> {
    const admins = await listAdminAccounts();
    adminsBlock.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Email</th><th>Added</th><th></th></tr></thead>
        <tbody>
          ${admins
            .map(
              (a) => `<tr>
                <td>${escapeHtml(a.email)}</td>
                <td>${new Date(a.created_at).toLocaleDateString()}</td>
                <td class="btn-row" style="justify-content:flex-end">
                  <button type="button" class="btn btn-danger admin-delete-btn" data-id="${a.id}">Remove</button>
                </td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <form id="admin-invite-form" class="btn-row" style="margin-top:var(--space-4); align-items:flex-end">
        <div class="field" style="margin-bottom:0; flex:1">
          <label class="field-label" for="admin-email">Email</label>
          <input id="admin-email" class="field-input" type="email" required />
        </div>
        <div class="field" style="margin-bottom:0; flex:1">
          <label class="field-label" for="admin-password">Temporary password</label>
          <input id="admin-password" class="field-input" type="password" minlength="8" required />
        </div>
        <button type="submit" class="btn btn-primary">Invite</button>
      </form>
      <p id="admin-invite-error" class="state-message hidden" style="color:var(--color-error)"></p>
    `;

    adminsBlock.querySelectorAll<HTMLButtonElement>(".admin-delete-btn").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Remove this admin account?")) return;
        try {
          await deleteAdminAccount(Number(btn.dataset.id));
          refreshAdmins();
        } catch (err) {
          alert(err instanceof Error ? err.message : "Could not remove admin");
        }
      };
    });

    const inviteForm = adminsBlock.querySelector<HTMLFormElement>("#admin-invite-form")!;
    const inviteError = adminsBlock.querySelector<HTMLParagraphElement>("#admin-invite-error")!;
    inviteForm.onsubmit = async (e) => {
      e.preventDefault();
      inviteError.classList.add("hidden");
      const newEmail = adminsBlock.querySelector<HTMLInputElement>("#admin-email")!.value;
      const newPassword = adminsBlock.querySelector<HTMLInputElement>("#admin-password")!.value;
      try {
        await createAdminAccount(newEmail, newPassword);
        refreshAdmins();
      } catch (err) {
        inviteError.textContent = err instanceof Error ? err.message : "Could not invite admin";
        inviteError.classList.remove("hidden");
      }
    };
  }

  refreshLive();
  refreshRooms();
  refreshAdmins();
}

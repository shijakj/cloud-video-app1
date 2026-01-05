// ✅ CHANGE THIS to your backend URL after Azure deploy
const BACKEND = "http://localhost:8000"; 
// Example later: https://your-backend.azurewebsites.net

async function api(path, opts) {
  const res = await fetch(`${BACKEND}${path}`, opts);
  if (!res.ok) throw new Error(await res.text());
  return res;
}

function videoCard(v) {
  const videoUrl = `${BACKEND}/video/${encodeURIComponent(v.filename)}`;

  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `
    <video class="vid" src="${videoUrl}" controls playsinline></video>
    <div class="meta">
      <div class="title">${escapeHtml(v.title || "Untitled")}</div>
      <div class="desc">${escapeHtml(v.description || "")}</div>

      <div class="row">
        <button class="btn small like">❤️ Like (<span class="likes">${v.likes || 0}</span>)</button>
        <div class="views">👁 ${v.views || 0}</div>
      </div>

      <div class="commentBox">
        <input class="cUser" placeholder="Name (optional)" />
        <input class="cText" placeholder="Write a comment..." />
        <button class="btn small comment">Send</button>
      </div>

      <div class="comments">
        ${(v.comments || []).slice(-3).map(c => `
          <div class="cLine">
            <b>${escapeHtml(c.user || "Anon")}</b>: ${escapeHtml(c.text || "")}
            <span class="tag">${escapeHtml(c.sentiment || "")}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  // view count (best-effort)
  api(`/api/view/${v.id}`, { method: "POST" }).catch(() => {});

  el.querySelector(".like").addEventListener("click", async () => {
    await api(`/api/like/${v.id}`, { method: "POST" });
    const likesSpan = el.querySelector(".likes");
    likesSpan.textContent = String(Number(likesSpan.textContent) + 1);
  });

  el.querySelector(".comment").addEventListener("click", async () => {
    const user = el.querySelector(".cUser").value.trim() || "Anonymous";
    const text = el.querySelector(".cText").value.trim();
    if (!text) return;

    await api(`/api/comment/${v.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, text })
    });

    // simplest: reload feed
    location.reload();
  });

  return el;
}

async function loadFeed() {
  const feed = document.getElementById("feed");
  if (!feed) return;

  const res = await api("/api/videos");
  const videos = await res.json();

  feed.innerHTML = "";
  if (!videos.length) {
    feed.innerHTML = `<div class="empty">No videos yet. Upload one!</div>`;
    return;
  }

  videos.slice().reverse().forEach(v => feed.appendChild(videoCard(v)));
}

async function initUpload() {
  const form = document.getElementById("uploadForm");
  if (!form) return;

  const status = document.getElementById("status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "Uploading...";

    const fd = new FormData(form);
    const res = await api("/upload", { method: "POST", body: fd });
    await res.json();

    status.textContent = "Upload successful ✅";
    setTimeout(() => (location.href = "index.html"), 800);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

loadFeed().catch(err => console.error(err));
initUpload().catch(err => console.error(err));

const STORAGE_KEYS = {
  connection: "classHub.githubConnection",
  session: "classHub.session",
  favorites: "classHub.favorites",
};

const defaultData = {
  meta: {
    hubName: "Class Resource Hub",
    passwordHash: "",
    topics: ["AI tools", "Coding", "Project ideas", "Assignments"],
    updatedAt: "",
  },
  resources: [],
};

const state = {
  connection: loadConnection(),
  data: structuredClone(defaultData),
  authenticated: localStorage.getItem(STORAGE_KEYS.session) === "unlocked",
  selectedTopic: "all",
  favorites: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || "[]")),
  installPrompt: null,
  busy: false,
};

const els = {
  setupScreen: document.querySelector("#setupScreen"),
  loginScreen: document.querySelector("#loginScreen"),
  mainApp: document.querySelector("#mainApp"),
  setupForm: document.querySelector("#setupForm"),
  loginForm: document.querySelector("#loginForm"),
  settingsForm: document.querySelector("#settingsForm"),
  resourceForm: document.querySelector("#resourceForm"),
  topicForm: document.querySelector("#topicForm"),
  uploadDialog: document.querySelector("#uploadDialog"),
  settingsDialog: document.querySelector("#settingsDialog"),
  resourceGrid: document.querySelector("#resourceGrid"),
  emptyState: document.querySelector("#emptyState"),
  topicList: document.querySelector("#topicList"),
  resourceTopic: document.querySelector("#resourceTopic"),
  resourceType: document.querySelector("#resourceType"),
  urlField: document.querySelector("#urlField"),
  promptField: document.querySelector("#promptField"),
  fileField: document.querySelector("#fileField"),
  syncStatus: document.querySelector("#syncStatus"),
  installAppBtn: document.querySelector("#installAppBtn"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  registerServiceWorker();
  inferGitHubFromLocation();
  fillConnectionForms();
  bindEvents();
  await loadData();
  render();
}

function bindEvents() {
  els.setupForm.addEventListener("submit", handleSetup);
  els.loginForm.addEventListener("submit", handleLogin);
  els.settingsForm.addEventListener("submit", handleSettings);
  els.resourceForm.addEventListener("submit", handleResourceCreate);
  els.topicForm.addEventListener("submit", handleTopicCreate);

  document.querySelector("#openUploadBtn").addEventListener("click", () => {
    fillTopicSelect();
    els.resourceForm.reset();
    updateTypeFields();
    els.uploadDialog.showModal();
  });
  document.querySelector("#openSettingsBtn").addEventListener("click", () => {
    fillConnectionForms();
    els.settingsDialog.showModal();
  });
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.session);
    state.authenticated = false;
    render();
  });
  els.installAppBtn.addEventListener("click", handleInstallApp);
  document.querySelector("#refreshBtn").addEventListener("click", async () => {
    await loadData(true);
    render();
  });
  document.querySelector("#clearTopicBtn").addEventListener("click", () => {
    state.selectedTopic = "all";
    renderResources();
    renderTopics();
  });
  els.resourceType.addEventListener("change", updateTypeFields);

  ["#searchInput", "#typeFilter", "#uploaderFilter", "#sortFilter", "#favoritesOnly"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", renderResources);
  });

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    els.installAppBtn.classList.remove("hidden");
    els.installAppBtn.classList.add("install-ready");
  });

  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    els.installAppBtn.classList.add("hidden");
  });
}

async function handleInstallApp() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  els.installAppBtn.classList.add("hidden");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

async function loadData(forceApi = false) {
  setSync("Syncing...", "");
  const localLoaded = !forceApi && await loadFromRelativeFile();
  if (!localLoaded && hasConnection()) {
    try {
      const file = await getGitHubJson(state.connection.dataPath);
      state.data = normalizeData(file.content);
      setSync("GitHub synced", "online");
      return;
    } catch (error) {
      if (error.status !== 404) {
        setSync("Sync issue", "error");
        return;
      }
      state.data = structuredClone(defaultData);
    }
  }
  if (localLoaded) {
    setSync(hasConnection() ? "Local data loaded" : "View only", hasConnection() ? "online" : "");
  } else {
    setSync(hasConnection() ? "Ready for setup" : "Needs GitHub", "");
  }
}

async function loadFromRelativeFile() {
  try {
    const response = await fetch("./data/resources.json", { cache: "no-store" });
    if (!response.ok) return false;
    state.data = normalizeData(await response.json());
    return true;
  } catch {
    return false;
  }
}

function normalizeData(data) {
  return {
    meta: {
      ...defaultData.meta,
      ...(data.meta || {}),
      topics: unique([...(data.meta?.topics || []), ...defaultData.meta.topics]),
    },
    resources: Array.isArray(data.resources) ? data.resources.map((resource) => ({
      comments: [],
      ...resource,
      comments: Array.isArray(resource.comments) ? resource.comments : [],
    })) : [],
  };
}

function render() {
  document.querySelector("#hubTitle").textContent = state.data.meta.hubName || defaultData.meta.hubName;
  document.querySelector("#loginTitle").textContent = state.data.meta.hubName || defaultData.meta.hubName;

  const needsSetup = !state.data.meta.passwordHash;
  els.setupScreen.classList.toggle("hidden", !needsSetup);
  els.loginScreen.classList.toggle("hidden", needsSetup || state.authenticated);
  els.mainApp.classList.toggle("hidden", needsSetup || !state.authenticated);

  if (!needsSetup && state.authenticated) {
    renderTopics();
    fillTopicSelect();
    renderResources();
  }
}

function renderTopics() {
  els.topicList.innerHTML = "";
  state.data.meta.topics.forEach((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `topic-btn${state.selectedTopic === topic ? " active" : ""}`;
    button.textContent = topic;
    button.addEventListener("click", () => {
      state.selectedTopic = topic;
      renderTopics();
      renderResources();
    });
    els.topicList.append(button);
  });
}

function fillTopicSelect() {
  els.resourceTopic.innerHTML = "";
  state.data.meta.topics.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic;
    option.textContent = topic;
    els.resourceTopic.append(option);
  });
}

function renderResources() {
  const template = document.querySelector("#resourceCardTemplate");
  const resources = filteredResources();
  els.resourceGrid.innerHTML = "";
  document.querySelector("#resultTitle").textContent = state.selectedTopic === "all" ? "All resources" : state.selectedTopic;
  document.querySelector("#resultCount").textContent = `${resources.length} item${resources.length === 1 ? "" : "s"}`;
  els.emptyState.classList.toggle("hidden", resources.length > 0);

  resources.forEach((resource) => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector(".type-badge").textContent = resource.type;
    card.querySelector("h3").textContent = resource.title;
    card.querySelector(".description").textContent = resource.description;
    card.querySelector(".meta-row").textContent = `${resource.topic} | ${resource.uploader} | ${formatDate(resource.createdAt)}`;

    const favoriteBtn = card.querySelector(".favorite-btn");
    favoriteBtn.textContent = state.favorites.has(resource.id) ? "Saved" : "Save";
    favoriteBtn.classList.toggle("active", state.favorites.has(resource.id));
    favoriteBtn.addEventListener("click", () => toggleFavorite(resource.id));

    renderPreview(card.querySelector(".resource-preview"), resource);
    renderActions(card.querySelector(".resource-actions"), resource);
    renderComments(card, resource);
    els.resourceGrid.append(card);
  });
}

function filteredResources() {
  const search = document.querySelector("#searchInput").value.trim().toLowerCase();
  const type = document.querySelector("#typeFilter").value;
  const uploader = document.querySelector("#uploaderFilter").value.trim().toLowerCase();
  const favoritesOnly = document.querySelector("#favoritesOnly").checked;
  const sort = document.querySelector("#sortFilter").value;

  const result = state.data.resources.filter((resource) => {
    const haystack = [resource.title, resource.topic, resource.description, resource.uploader, resource.type].join(" ").toLowerCase();
    return (state.selectedTopic === "all" || resource.topic === state.selectedTopic)
      && (type === "all" || resource.type === type)
      && (!search || haystack.includes(search))
      && (!uploader || resource.uploader.toLowerCase().includes(uploader))
      && (!favoritesOnly || state.favorites.has(resource.id));
  });

  result.sort((a, b) => {
    if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sort === "comments") return countComments(b) - countComments(a);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  return result;
}

function renderPreview(container, resource) {
  container.innerHTML = "";
  if (resource.type === "prompt") {
    const box = document.createElement("div");
    box.className = "prompt-box";
    box.textContent = resource.promptText || "";
    container.append(box);
  }
  if (resource.type === "image" && resource.downloadUrl) {
    const image = document.createElement("img");
    image.src = resource.downloadUrl;
    image.alt = resource.title;
    container.append(image);
  }
  if (resource.type === "video" && resource.downloadUrl) {
    const video = document.createElement("video");
    video.src = resource.downloadUrl;
    video.controls = true;
    container.append(video);
  }
}

function renderActions(container, resource) {
  container.innerHTML = "";
  if (resource.type === "prompt") {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy prompt";
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(resource.promptText || "");
      copy.textContent = "Copied";
      setTimeout(() => copy.textContent = "Copy prompt", 1200);
    });
    container.append(copy);
  }
  if (resource.url) {
    const link = document.createElement("a");
    link.href = resource.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open link";
    container.append(link);
  }
  if (resource.downloadUrl) {
    const download = document.createElement("a");
    download.href = resource.downloadUrl;
    download.download = resource.fileName || resource.title;
    download.textContent = "Download";
    container.append(download);
  }
}

function renderComments(card, resource) {
  card.querySelector(".comment-count").textContent = `${countComments(resource)} total`;
  const list = card.querySelector(".comment-list");
  list.innerHTML = "";
  resource.comments.forEach((comment) => list.append(commentElement(resource, comment)));

  card.querySelector(".comment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    resource.comments.push({
      id: createId("comment"),
      name: clean(formData.get("name")),
      text: clean(formData.get("text")),
      createdAt: new Date().toISOString(),
      likes: 0,
      replies: [],
    });
    form.reset();
    await saveData("Add comment");
    renderResources();
  });
}

function commentElement(resource, comment) {
  const item = document.createElement("div");
  item.className = "comment";
  item.innerHTML = `
    <div class="comment-meta"></div>
    <p></p>
    <div class="comment-actions">
      <button class="mini-btn" type="button" data-action="like">Like (${comment.likes || 0})</button>
      <button class="mini-btn" type="button" data-action="reply">Reply</button>
    </div>
    <div class="reply-list"></div>
  `;
  item.querySelector(".comment-meta").textContent = `${comment.name} | ${formatDate(comment.createdAt)}`;
  item.querySelector("p").textContent = comment.text;
  item.querySelector("[data-action='like']").addEventListener("click", async () => {
    comment.likes = (comment.likes || 0) + 1;
    await saveData("Like comment");
    renderResources();
  });
  item.querySelector("[data-action='reply']").addEventListener("click", () => showReplyForm(item, resource, comment));
  const replies = item.querySelector(".reply-list");
  (comment.replies || []).forEach((reply) => replies.append(replyElement(reply)));
  return item;
}

function replyElement(reply) {
  const item = document.createElement("div");
  item.className = "comment";
  item.innerHTML = `<div class="comment-meta"></div><p></p>`;
  item.querySelector(".comment-meta").textContent = `${reply.name} | ${formatDate(reply.createdAt)}`;
  item.querySelector("p").textContent = reply.text;
  return item;
}

function showReplyForm(item, resource, comment) {
  if (item.querySelector(".reply-form")) return;
  const form = document.createElement("form");
  form.className = "reply-form";
  form.innerHTML = `
    <input name="name" placeholder="Name" required />
    <input name="text" placeholder="Reply" required />
    <button class="mini-btn" type="submit">Send</button>
  `;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    comment.replies = comment.replies || [];
    comment.replies.push({
      id: createId("reply"),
      name: clean(formData.get("name")),
      text: clean(formData.get("text")),
      createdAt: new Date().toISOString(),
    });
    await saveData("Reply to comment");
    renderResources();
  });
  item.append(form);
}

async function handleSetup(event) {
  event.preventDefault();
  const hubName = document.querySelector("#setupHubName").value.trim();
  const password = document.querySelector("#setupPassword").value;
  state.connection = {
    owner: clean(document.querySelector("#setupOwner").value),
    repo: clean(document.querySelector("#setupRepo").value),
    branch: clean(document.querySelector("#setupBranch").value || "main"),
    dataPath: clean(document.querySelector("#setupDataPath").value),
    token: document.querySelector("#setupToken").value.trim(),
  };
  saveConnection();
  state.data.meta.hubName = hubName;
  state.data.meta.passwordHash = await hashText(password);
  state.data.meta.updatedAt = new Date().toISOString();
  const saved = await saveData("Initial class hub setup", document.querySelector("#setupMessage"));
  if (!saved) return;
  state.authenticated = true;
  localStorage.setItem(STORAGE_KEYS.session, "unlocked");
  render();
}

async function handleLogin(event) {
  event.preventDefault();
  const entered = await hashText(document.querySelector("#loginPassword").value);
  if (entered !== state.data.meta.passwordHash) {
    document.querySelector("#loginMessage").textContent = "Password does not match.";
    return;
  }
  state.authenticated = true;
  localStorage.setItem(STORAGE_KEYS.session, "unlocked");
  document.querySelector("#loginPassword").value = "";
  render();
}

function handleSettings(event) {
  event.preventDefault();
  state.connection = {
    owner: clean(document.querySelector("#settingsOwner").value),
    repo: clean(document.querySelector("#settingsRepo").value),
    branch: clean(document.querySelector("#settingsBranch").value || "main"),
    dataPath: clean(document.querySelector("#settingsDataPath").value),
    token: document.querySelector("#settingsToken").value.trim() || state.connection.token,
  };
  saveConnection();
  document.querySelector("#settingsMessage").textContent = "Connection saved in this browser.";
  setSync(hasConnection() ? "GitHub ready" : "Needs GitHub", hasConnection() ? "online" : "");
}

async function handleResourceCreate(event) {
  event.preventDefault();
  if (!hasConnection()) {
    document.querySelector("#resourceMessage").textContent = "Add GitHub connection first.";
    return;
  }
  const type = els.resourceType.value;
  const file = document.querySelector("#resourceFile").files[0];
  const resource = {
    id: createId("resource"),
    title: clean(document.querySelector("#resourceTitle").value),
    topic: clean(document.querySelector("#resourceTopic").value),
    type,
    description: clean(document.querySelector("#resourceDescription").value),
    uploader: clean(document.querySelector("#resourceUploader").value),
    url: clean(document.querySelector("#resourceUrl").value),
    promptText: document.querySelector("#resourcePrompt").value.trim(),
    fileName: file?.name || "",
    downloadUrl: "",
    filePath: "",
    createdAt: new Date().toISOString(),
    comments: [],
  };

  const needsFile = ["file", "image", "video"].includes(type);
  if (needsFile && !file) {
    document.querySelector("#resourceMessage").textContent = "Choose a file to upload.";
    return;
  }
  if (type === "link" && !resource.url) {
    document.querySelector("#resourceMessage").textContent = "Add a link URL.";
    return;
  }
  if (type === "prompt" && !resource.promptText) {
    document.querySelector("#resourceMessage").textContent = "Add prompt text.";
    return;
  }

  document.querySelector("#resourceMessage").textContent = "Uploading...";
  if (file) {
    const uploadPath = `resource-hub/uploads/${resource.id}/${safeFileName(file.name)}`;
    const upload = await putGitHubFile(uploadPath, await fileToBase64(file), `Upload ${resource.title}`);
    resource.downloadUrl = upload.content.download_url;
    resource.filePath = uploadPath;
  }

  state.data.resources.unshift(resource);
  const saved = await saveData("Add resource", document.querySelector("#resourceMessage"));
  if (!saved) return;
  els.uploadDialog.close();
  renderResources();
}

async function handleTopicCreate(event) {
  event.preventDefault();
  const topic = clean(document.querySelector("#newTopicInput").value);
  if (!topic) return;
  state.data.meta.topics = unique([...state.data.meta.topics, topic]);
  document.querySelector("#newTopicInput").value = "";
  await saveData("Add topic");
  renderTopics();
  fillTopicSelect();
}

function updateTypeFields() {
  const type = els.resourceType.value;
  els.urlField.classList.toggle("hidden", type !== "link");
  els.promptField.classList.toggle("hidden", type !== "prompt");
  els.fileField.classList.toggle("hidden", !["file", "image", "video"].includes(type));
}

async function saveData(message, messageEl) {
  if (!hasConnection()) {
    setSync("Needs GitHub", "error");
    if (messageEl) messageEl.textContent = "Add GitHub connection first.";
    return false;
  }
  if (state.busy) return false;
  state.busy = true;
  setSync("Saving...", "");
  try {
    const latest = await getGitHubJson(state.connection.dataPath).catch((error) => {
      if (error.status === 404) return { sha: undefined, content: structuredClone(defaultData) };
      throw error;
    });
    const merged = mergeData(latest.content, state.data);
    merged.meta.updatedAt = new Date().toISOString();
    state.data = merged;
    await putGitHubJson(state.connection.dataPath, merged, message, latest.sha);
    setSync("GitHub saved", "online");
    if (messageEl) messageEl.textContent = "Saved to GitHub.";
    return true;
  } catch (error) {
    setSync("Save failed", "error");
    if (messageEl) messageEl.textContent = error.message || "Could not save.";
    return false;
  } finally {
    state.busy = false;
  }
}

function mergeData(remote, local) {
  const normalizedRemote = normalizeData(remote || defaultData);
  const normalizedLocal = normalizeData(local || defaultData);
  const byId = new Map();
  normalizedRemote.resources.forEach((resource) => byId.set(resource.id, resource));
  normalizedLocal.resources.forEach((resource) => {
    byId.set(resource.id, mergeResource(byId.get(resource.id), resource));
  });
  return {
    meta: {
      ...normalizedRemote.meta,
      ...normalizedLocal.meta,
      topics: unique([...normalizedRemote.meta.topics, ...normalizedLocal.meta.topics]),
    },
    resources: [...byId.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  };
}

function mergeResource(remoteResource, localResource) {
  if (!remoteResource) return localResource;
  return {
    ...remoteResource,
    ...localResource,
    comments: mergeComments(remoteResource.comments || [], localResource.comments || []),
  };
}

function mergeComments(remoteComments, localComments) {
  const comments = new Map();
  remoteComments.forEach((comment) => comments.set(comment.id, comment));
  localComments.forEach((comment) => {
    const remote = comments.get(comment.id);
    comments.set(comment.id, remote ? {
      ...remote,
      ...comment,
      likes: Math.max(remote.likes || 0, comment.likes || 0),
      replies: mergeReplies(remote.replies || [], comment.replies || []),
    } : comment);
  });
  return [...comments.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function mergeReplies(remoteReplies, localReplies) {
  const replies = new Map();
  remoteReplies.forEach((reply) => replies.set(reply.id, reply));
  localReplies.forEach((reply) => replies.set(reply.id, { ...(replies.get(reply.id) || {}), ...reply }));
  return [...replies.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function getGitHubJson(path) {
  const file = await requestGitHub(`/repos/${state.connection.owner}/${state.connection.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(state.connection.branch)}`);
  return {
    sha: file.sha,
    content: JSON.parse(base64ToText(file.content)),
  };
}

async function putGitHubJson(path, data, message, sha) {
  return requestGitHub(`/repos/${state.connection.owner}/${state.connection.repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      branch: state.connection.branch,
      content: textToBase64(JSON.stringify(data, null, 2)),
      sha,
    }),
  });
}

async function putGitHubFile(path, content, message) {
  return requestGitHub(`/repos/${state.connection.owner}/${state.connection.repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      message,
      branch: state.connection.branch,
      content,
    }),
  });
}

async function requestGitHub(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.connection.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const error = new Error(`GitHub error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function loadConnection() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.connection) || "{}");
}

function saveConnection() {
  localStorage.setItem(STORAGE_KEYS.connection, JSON.stringify(state.connection));
  fillConnectionForms();
}

function hasConnection() {
  return Boolean(state.connection.owner && state.connection.repo && state.connection.branch && state.connection.dataPath && state.connection.token);
}

function inferGitHubFromLocation() {
  if (state.connection.owner && state.connection.repo) return;
  const host = window.location.hostname;
  if (!host.endsWith("github.io")) return;
  const owner = host.replace(".github.io", "");
  const repo = window.location.pathname.split("/").filter(Boolean)[0];
  state.connection = {
    owner,
    repo: repo || `${owner}.github.io`,
    branch: "main",
    dataPath: "resource-hub/data/resources.json",
    token: "",
  };
}

function fillConnectionForms() {
  const fields = [
    ["setupOwner", "owner"],
    ["setupRepo", "repo"],
    ["setupBranch", "branch"],
    ["setupDataPath", "dataPath"],
    ["settingsOwner", "owner"],
    ["settingsRepo", "repo"],
    ["settingsBranch", "branch"],
    ["settingsDataPath", "dataPath"],
  ];
  fields.forEach(([id, key]) => {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = state.connection[key] || (key === "branch" ? "main" : key === "dataPath" ? "resource-hub/data/resources.json" : "");
  });
  const token = state.connection.token || "";
  document.querySelector("#setupToken").value = token;
  document.querySelector("#settingsToken").value = token;
  document.querySelector("#setupHubName").value = state.data.meta.hubName || "";
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...state.favorites]));
  renderResources();
}

function countComments(resource) {
  return (resource.comments || []).reduce((total, comment) => total + 1 + (comment.replies || []).length, 0);
}

function setSync(text, className) {
  els.syncStatus.textContent = text;
  els.syncStatus.className = `sync-pill ${className || ""}`.trim();
}

async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToText(base64) {
  const cleanBase64 = base64.replace(/\s/g, "");
  const binary = atob(cleanBase64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clean(value) {
  return String(value || "").trim();
}

function safeFileName(name) {
  return clean(name).replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").toLowerCase();
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function formatDate(value) {
  if (!value) return "just now";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

// lib/github.js
//
// Helpers mínimos sobre la Contents API de GitHub para leer y escribir archivos del
// repo directamente desde el serverless function (sin `git` de por medio — Vercel no
// tiene un working tree persistente entre invocaciones). Requiere un GitHub token con
// permiso de escritura sobre el repo, en la variable de entorno GITHUB_TOKEN.
// Ver INSTRUCTIVO.md sección 1.13 para cómo generarlo (Fine-grained PAT, permiso
// "Contents: Read and write" limitado a este repo).

const GITHUB_API = "https://api.github.com";

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Falta la variable de entorno GITHUB_TOKEN.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function repoSlug() {
  const repo = process.env.GITHUB_REPO; // formato "owner/nombre-repo"
  if (!repo || !repo.includes("/")) throw new Error("Falta o es inválida la variable de entorno GITHUB_REPO (formato 'owner/repo').");
  return repo;
}

function branch() {
  return process.env.GITHUB_BRANCH || "main";
}

// Lee un archivo del repo. Devuelve { content (string, decodificado), sha }.
async function getFile(path) {
  const url = `${GITHUB_API}/repos/${repoSlug()}/contents/${encodeURIComponent(path)}?ref=${branch()}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} leyendo ${path}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

// Escribe (crea o actualiza) un archivo del repo en un solo commit.
async function putFile(path, content, message, sha) {
  const url = `${GITHUB_API}/repos/${repoSlug()}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: branch(),
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, { method: "PUT", headers: ghHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status} escribiendo ${path}: ${errBody.slice(0, 500)}`);
  }
  return res.json();
}

export { getFile, putFile };

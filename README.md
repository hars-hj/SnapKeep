# SnapKeep — Project Documentation

A custom version-control CLI (`snapkeep`) built in TypeScript/Node.js. It mirrors a lightweight Git workflow locally (init → add → commit → log → revert) and syncs commits to a remote HTTP server backed by AWS S3.

---

## 1. Overview

| Item | Detail |
|------|--------|
| CLI binary | `snapkeep` (via `npm install -g .`) |
| Entry point | `src/server.ts` → compiled to `dist/server.js` |
| Router | [yargs](https://github.com/yargs/yargs) |
| Local store | `.snapkeep/` in the current working directory |
| Global auth config | `~/.snapkeep/config.json` |
| Remote server | `http://localhost:3000` (Express + Supabase + S3 — server code lives outside this repo) |

---

## 2. CLI Boot & Execution

```
Terminal → PATH → npm global symlink → dist/server.js → Node (shebang) → yargs → command handler
```

1. **Shebang** (`#!/usr/bin/env node`) lets the OS run the compiled file as a Node executable.
2. **dotenv** loads `.env` silently (`quiet: true`).
3. **yargs** parses `process.argv`, routes to one of nine commands, and requires exactly one command (`demandCommand(1)`).
4. **Context**: all repo operations use `process.cwd()` — the directory where the user runs `snapkeep`, not the CLI install path.

**Build & install:**
```bash
npm run build          # tsc → dist/
npm install -g .       # links `snapkeep` globally
```

---

## 3. Local Repository Layout

```
<project-root>/
├── .snapkeepignore       # ignore rules for `add`
├── .snapkeep/
│   ├── config.json       # { "name": "<folder-name>" }
│   ├── staging/          # files awaiting commit
│   ├── commits/
│   │   └── <uuid>/
│   │       ├── commit.json   # { message, date }
│   │       └── ...           # snapshotted files
│   ├── pushed.json       # array of commit IDs already pushed
│   └── <username>/       # populated after pull (remote mirror)
└── (working files)
```

**Global config** (`~/.snapkeep/config.json`):
```json
{ "username", "userId", "token", "serverUrl" }
```

---

## 4. Commands

### 4.1 `snapkeep login`

**Purpose:** Authenticate with the remote server and persist session locally.

**Flow:**
1. Prompt username/password via Node `readline`.
2. `POST /auth/login` — on success, save token + metadata to global config.
3. If response is `"User not found"`, auto-register via `POST /auth/register`, then save config.
4. Otherwise, print login error (wrong password, server down, etc.).

**Output:** Writes `~/.snapkeep/config.json`. Required before init/add/commit/revert (via `checkLoggedIn`).

---

### 4.2 `snapkeep init`

**Purpose:** Create a new local repository in the current directory.

**Flow:**
1. Call `checkLoggedIn()` — halts if not logged in.
2. Create `.snapkeep/` and `.snapkeep/commits/`.
3. Write `.snapkeep/config.json` with `name` = basename of `process.cwd()`.

**Does not** create `.snapkeepignore` or `staging/` (staging is created on first `add` or `commit`).

---

### 4.3 `snapkeep add <files>`

**Purpose:** Copy file(s) or directory into the staging area.

**Args:** `<files>` — file path, directory path, or `.` (current directory).

**Flow:**
1. `checkLoggedIn()`.
2. Resolve `.` → `process.cwd()`.
3. Read `.snapkeepignore`; always ignore `.snapkeep` and `.snapkeepignore`.
4. Copy to `.snapkeep/staging/<relativePath>`:
   - **File:** `fs.copyFile`
   - **Directory:** `fs.cp` recursive with filter excluding ignored names

**Note:** Staging preserves paths relative to the repository root to prevent collisions and retain directory hierarchy.

---

### 4.4 `snapkeep commit <message>`

**Purpose:** Snapshot staged files into an immutable commit.

**Flow:**
1. `checkLoggedIn()`.
2. Generate UUID commit ID.
3. Recursively copy `.snapkeep/staging/` → `.snapkeep/commits/<uuid>/`.
4. Write `commit.json` `{ message, date: ISO timestamp }` inside the commit folder.
5. Delete and recreate empty `staging/`.

**Output:** `commit <uuid> created with message "<message>"`.

---

### 4.5 `snapkeep logs`

**Purpose:** List all local commits, newest first.

**Flow:**
1. Read all folders in `.snapkeep/commits/`.
2. Parse each `commit.json`.
3. Sort by date descending.
4. Print `commitId`, `message`, and `date` to console.

**Note:** Does not require login (`checkLoggedIn` not called).

---

### 4.6 `snapkeep revert <commitID>`

**Purpose:** Restore the working directory to a past commit's file state.

**Flow:**
1. `checkLoggedIn()`.
2. Copy `.snapkeep/commits/<commitID>/` → project root (`../` from `.snapkeep`).
3. Use `fs.cp` with `force: true`; filter excludes `commit.json` so metadata stays internal.

**Effect:** Destructively overwrites workspace files with the commit snapshot.

---

### 4.7 `snapkeep push`

**Purpose:** Upload unpushed commits to the remote server.

**Flow:**
1. Read global config (username, serverUrl); exit if not logged in.
2. Read repo config for `reponame`.
3. Load `.snapkeep/pushed.json` (array of already-pushed commit IDs).
4. For each folder in `.snapkeep/commits/` not in `pushed.json`:
   - Recursively collect all files in the commit folder.
   - Build in-memory ZIP via JSZip (paths normalized to `/`).
   - `POST /push` as multipart/form-data: `username`, `reponame`, `commitId`, `file` (zip buffer).
   - Append commit ID to `pushed.json` on success.

**Remote storage:** S3 key pattern `username/reponame/commitId`.

---

### 4.8 `snapkeep pull`

**Purpose:** Download remote commits and restore workspace.

**Flow:**
1. Read global + repo config; exit if not logged in.
2. `GET /pull?username=&reponame=` — receive ZIP as arraybuffer.
3. Extract every entry from ZIP into `.snapkeep/` (preserving path structure).
4. Parse commit IDs from ZIP paths (`username/reponame/<commitId>/...`).
5. For each commit ID, call `enforcePull`:
   - Locate commit at `.snapkeep/<username>/<reponame>/<commitId>/`.
   - Copy to project root (same revert logic — excludes `commit.json`).

**Effect:** Syncs local `.snapkeep` mirror and restores latest pulled commit state to workspace.

---

## 5. Shared Utilities

| Module | Role |
|--------|------|
| `globalConfig.ts` | Read/write `~/.snapkeep/config.json` |
| `readConfig.json.ts` | Read `.snapkeep/config.json`; errors if repo not initialized |
| `checkloggedin.ts` | Reads global config; logs error and halts execution if missing |

---

## 6. Dependencies (Key)

| Package | Used by |
|---------|---------|
| yargs | CLI routing |
| uuid | Commit ID generation |
| jszip | Push (compress) / Pull (decompress) |
| axios, form-data | HTTP push/pull |
| dotenv | Env loading |
| aws-sdk, supabase, express, jwt | Server-side (declared; server not in this repo) |

---

## 7. Remote Server (External)

The CLI expects a running server at `localhost:3000`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/login` | POST | `{ username, password }` → token |
| `/auth/register` | POST | Auto-create account on first login |
| `/push` | POST | Multipart upload → S3 `username/reponame/commitId` |
| `/pull` | GET | Returns ZIP of all commits for user/repo |

Auth uses Supabase Auth (JWT tokens stored client-side). Push/pull use username + reponame (not the token in current client code).

---

## 8. Architecture Diagram

```mermaid
flowchart TB
    subgraph User["Developer Machine"]
        T[Terminal: snapkeep command]
        CLI[dist/server.ts — yargs router]
        
        subgraph Local["Local Storage"]
            GC["~/.snapkeep/config.json"]
            MG[".snapkeep/"]
            STG[staging/]
            COM[commits/uuid/]
            PUSH[pushed.json]
        end
    end

    subgraph Remote["Remote Server :3000"]
        AUTH["/auth/login · /auth/register"]
        PUSH_EP["/push"]
        PULL_EP["/pull"]
        DB[(Supabase — users / auth)]
        S3[(AWS S3 — username/reponame/commitId)]
    end

    T --> CLI

    CLI -->|login| AUTH
    AUTH --> GC

    CLI -->|init · add · commit · logs · revert| MG
    add --> STG
    commit --> COM
    revert -->|fs.cp force| WD[Working Directory]

    CLI -->|push| PUSH_EP
    COM --> PUSH_EP
    PUSH --> PUSH_EP
    PUSH_EP --> S3

    CLI -->|pull| PULL_EP
    PULL_EP --> S3
    PULL_EP -->|ZIP stream| MG
    MG -->|enforcePull| WD

    AUTH --> DB
```

### Command Dependency Chain

```mermaid
flowchart LR
    login --> init
    init --> add
    add --> commit
    commit --> logs
    commit --> revert
    commit --> push
    login --> push
    login --> pull
    init --> push
    init --> pull
```

---

## 9. Quick Reference

| Command | Auth required | Modifies workspace | Needs init |
|---------|--------------|-------------------|------------|
| `login` | — | — | — |
| `init` | yes | creates `.snapkeep` | — |
| `add <files>` | yes | no (staging only) | yes |
| `commit <message>` | yes | clears staging | yes |
| `logs` | no | no | yes |
| `revert <commitID>` | yes | yes (overwrite) | yes |
| `push` | yes | no | yes |
| `pull` | yes | yes (overwrite) | yes |

# Baseline Engine

The **Baseline Engine** is a modular, high-performance interactive
fiction system that bridges the gap between retro text adventures and
modern AI. It mixes the charm of classic terminal adventures with
modern, AI-powered freedom: players can type naturally, and the engine
tries to understand what they meant using intent recognition powered by
LLMs.

This project is built and maintained by **me alone -- Ramazan (RaY)**.

------------------------------------------------------------------------

# Key Features

### AI-Powered Intent Recognition

Players can type free-form commands like\
\> "I want to check out that weird rock behind me"\
and the engine maps that to the correct story intent, such as
`inspect_rock`.

Supports **Ollama**, **OpenAI**, and custom AI providers.

### Visual Map Editor

The editor at `http://localhost:3005` provides: - Node-based graphical
story design - Intent creation and linking - Branching narrative
graphs - Secure user accounts - One-click publishing directly into the
engine

### Intent Correction System

If the AI misinterprets a command, the player can correct it.\
Corrections are cached immediately and improve the system.

### High-Performance Data Layer

Powered by Redis, providing: - Sub-millisecond reads - Atomic session
storage - Intent and story caching - Preloaded manifests and nodes

### Plugin Architecture

Plugins (inside `plugins/`) can: - Override frontend assets - Inject
backend logic - Hook into events such as: - `server:init` -
`game:beforeInput` - `game:willResolveIntent` - `game:afterInput`

### PWA Terminal UI

The game terminal at `http://localhost:3000` features: - Retro CRT-style
effects - Typewriter animations - Sound effects - Full PWA
installability

------------------------------------------------------------------------

# For Creators: Writing Stories

You do **not** need coding experience.

1.  Start the engine\
2.  Visit: **http://localhost:3005**\
3.  Create your account\
4.  Use the visual interface to:
    -   Create scenes (Nodes)
    -   Create actions (Intents)
    -   Connect everything into a map
    -   Publish instantly

You can test your story immediately in the Terminal UI.

------------------------------------------------------------------------

# For Developers: Extending the Engine

Plugins allow deep customization.

Typical plugin tasks: - Override `index.html`, CSS, or JS files - Add
new commands or modify game loop behavior - Intercept or modify AI
interpretations - Add custom backend logic

Refer to `docs/PLUGIN_API.md` for full documentation.

------------------------------------------------------------------------

# Technical Architecture

### Redis Message Queue + Data Layer

All runtime reads/writes occur through Redis: - Story manifests -
Nodes - Sessions - Inventories - Intent mappings - Editor logins

This eliminates bottlenecks and keeps performance stable even with many
concurrent stories or users.

### User System

The Editor Server uses: - `bcrypt` for password hashing\
- Token-based sessions\
- Redis persistence\
So creators cannot overwrite each other's work.

------------------------------------------------------------------------

# Quick Start (Hosting)

### Requirements:

-   Node.js v18 or newer\
-   Docker (for Redis)

### Install:

``` bash
npm install
```

### Start Redis:

``` bash
docker-compose up -d redis
```

### Run Engine:

``` bash
npm run dev
```

-   Terminal UI: **http://localhost:3000**\
-   Editor: **http://localhost:3005**

------------------------------------------------------------------------

# AI Configuration

Set via `.env` or environment variables.

### Ollama (Local):

    AI_PROVIDER=ollama

### OpenAI:

    AI_PROVIDER=openai
    OPENAI_API_KEY=your_key

### Custom Provider:

    AI_PROVIDER=custom

------------------------------------------------------------------------

# Roadmap

-   Global cross-story intent mapping\
-   Public mapping dataset\
-   Faster fallback pipelines\
-   Expanded editing tools\
-   Story marketplace and discovery\
-   More plugin capabilities

------------------------------------------------------------------------

# License

MIT

------------------------------------------------------------------------

# Creator

**Tangelo / Ramazan Yavuz (RaY)**\
- Website: https://tangelo.com.tr\
- Live Demo: https://tangelo.com.tr/baseline

------------------------------------------------------------------------

# Important Notes About Intent Recognition

### What Baseline Really Offers

-   **AI-based intent recognition** across all stories\
-   An **advanced AI connector** available free of charge\
-   A **growing database of intent mappings**, built over time\
-   The system learns from player interactions and becomes faster and
    more accurate

### Why Some Inputs May Take Time

-   The **first time** a player uses a new phrasing, the AI might take
    **20-30 seconds** to interpret it
-   This happens **only once**
-   After the mapping is cached, the same phrase becomes **instant**

### Community-Driven Speed

-   The more people play on the **hosted engine**, the smarter and
    faster the mapping becomes
-   **Local instances currently cannot contribute** to the intent-map
    dataset (yet)

### Future Plans

-   Right now, mappings are per-story\
-   I'm working on a **generalized mapping layer** so creators can reuse
    mappings across all stories\
-   Eventually I will make these mappings public

This entire effort is built and maintained by **me alone**, Ramazan
(RaY).\
And together with the community, I believe we can build the **fastest
and most advanced open intent classification layer** for interactive
fiction.

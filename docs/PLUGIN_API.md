# Plugin API Documentation

The **Baseline Engine** supports a powerful plugin system that allows you to modify almost every aspect of the game, from the frontend UI to the core game loop.

## Folder Structure

Plugins live in the `plugins/` directory at the root of the project.
Each plugin must have a `plugin.json` manifest and an entry point (usually `index.js`).

```
plugins/
  my-awesome-plugin/
    plugin.json
    index.js
    public/           <-- Optional: Files here override core public/ files
      index.html
      style.css
```

## Manifest (`plugin.json`)

```json
{
  "id": "my-awesome-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "priority": 100,
  "entry": "index.js"
}
```

- **priority**: Higher numbers load first. Use this to ensure your UI overrides take precedence.

## Entry Point (`index.js`)

Your plugin must export an `init` function that receives the `PluginManager`.

```javascript
module.exports = {
    init: async (pluginManager) => {
        console.log("My Plugin Loaded!");

        // Register Hooks
        pluginManager.registerHook('server:init', onServerInit);
        pluginManager.registerHook('game:beforeInput', onBeforeInput);
    }
};

function onServerInit({ app, server, redis, gameEngine }) {
    // Add a custom route
    app.get('/api/my-plugin', (req, res) => res.send('Hello!'));

    // Attach WebSockets (e.g., socket.io)
    // const io = require('socket.io')(server);
}

async function onBeforeInput(session, input) {
    if (input === '/ping') {
        // Intercept the command and return a response immediately
        return { text: 'Pong!', type: 'info' };
    }
    return null; // Let the game engine handle it
}
```

## Available Hooks

### `server:init`
- **Type**: Broadcast (All listeners run)
- **Args**: `{ app, server, redis, gameEngine }`
- **Usage**: Initialize specific server-side logic, add Express routes, setup WebSockets.

### `game:beforeInput`
- **Type**: FirstResult (Stops at first non-null return)
- **Args**: `session`, `input`
- **Usage**: Intercept user input before the AI sees it. Return a response object `{ text, type }` to short-circuit the engine.

### `game:willResolveIntent`
- **Type**: FirstResult
- **Args**: `session`, `matchedIntent`, `currentNode`
- **Usage**: Handle custom actions (e.g., `action: "combat"`). If you return a response, the default engine logic for that intent is skipped.

### `game:afterInput`
- **Type**: Waterfall (Output of one flows to the next)
- **Args**: `response`, `session`
- **Usage**: Modify the final text response before it is sent to the client. Useful for appending status effects or HUD updates.

## Frontend Customization
Any file placed in your plugin's `public/` folder will be served at the root URL, overriding the core engine's files.
- To replace the UI: Add `public/index.html`.
- To add styles: Add `public/my-styles.css` and load it via a script or modified HTML.

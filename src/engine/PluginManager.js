const fs = require('fs');
const path = require('path');

class PluginManager {
    constructor() {
        this.plugins = [];
        this.hooks = {
            'server:init': [],
            'session:create': [],
            'game:beforeInput': [],
            'game:willResolveIntent': [],
            'game:afterInput': [],
            'game:onResponse': [] // Generic hook for modifying any response
        };
        this.pluginsDir = path.join(process.cwd(), 'plugins');
    }

    /**
     * Loads all plugins from the plugins directory.
     */
    async loadPlugins() {
        if (!fs.existsSync(this.pluginsDir)) {
            console.log('[PluginManager] No plugins directory found. Creating one.');
            fs.mkdirSync(this.pluginsDir);
            return;
        }

        const pluginFolders = fs.readdirSync(this.pluginsDir);

        for (const folder of pluginFolders) {
            const pluginPath = path.join(this.pluginsDir, folder);
            if (!fs.lstatSync(pluginPath).isDirectory()) continue;

            const manifestPath = path.join(pluginPath, 'plugin.json');
            if (!fs.existsSync(manifestPath)) {
                console.warn(`[PluginManager] Skipping ${folder}: No plugin.json found.`);
                continue;
            }

            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

                // Default priority is 0. Higher = loads earlier for middleware,
                // but for hooks, we might want to define execution order.
                // Let's say Higher Priority = Registered First = Executed First.
                manifest.priority = manifest.priority || 0;
                manifest.dirPath = pluginPath;
                manifest.id = manifest.id || folder;

                this.plugins.push(manifest);
            } catch (e) {
                console.error(`[PluginManager] Failed to load manifest for ${folder}:`, e);
            }
        }

        // Sort by priority (Descending)
        this.plugins.sort((a, b) => b.priority - a.priority);

        console.log(`[PluginManager] Found ${this.plugins.length} plugins.`);

        // Initialize Plugins
        for (const plugin of this.plugins) {
            console.log(`[PluginManager] Loading Plugin: ${plugin.name} (${plugin.version})`);
            const entryPoint = plugin.entry || 'index.js';
            const entryPath = path.join(plugin.dirPath, entryPoint);

            if (fs.existsSync(entryPath)) {
                try {
                    const pluginModule = require(entryPath);
                    if (typeof pluginModule.init === 'function') {
                        // Pass the manager to the plugin so it can register hooks
                        await pluginModule.init(this);
                        console.log(`[PluginManager] -> Initialized ${plugin.id}`);
                    }
                } catch (e) {
                    console.error(`[PluginManager] Error initializing ${plugin.id}:`, e);
                }
            }
        }
    }

    /**
     * API for plugins to register hooks
     */
    registerHook(hookName, callback) {
        if (this.hooks[hookName]) {
            this.hooks[hookName].push(callback);
        } else {
            console.warn(`[PluginManager] Unknown hook: ${hookName}`);
        }
    }

    /**
     * Executes a hook.
     * Some hooks are "waterfall" (pass modified data down), others are "first wins" or "broadcast".
     *
     * Strategy:
     * - 'waterfall': Passes the accumulator through all functions.
     * - 'firstResult': Returns the first non-null result (good for intent handling).
     * - 'broadcast': Just runs them all (good for init).
     */
    async executeHook(type, hookName, ...args) {
        if (!this.hooks[hookName]) return;

        if (type === 'broadcast') {
            for (const cb of this.hooks[hookName]) {
                try {
                    await cb(...args);
                } catch (e) {
                    console.error(`[PluginManager] Error in hook ${hookName}:`, e);
                }
            }
        }
        else if (type === 'waterfall') {
            let value = args[0]; // First arg is the one being modified
            const otherArgs = args.slice(1);
            for (const cb of this.hooks[hookName]) {
                try {
                    value = await cb(value, ...otherArgs);
                } catch (e) {
                    console.error(`[PluginManager] Error in hook ${hookName}:`, e);
                }
            }
            return value;
        }
        else if (type === 'firstResult') {
            for (const cb of this.hooks[hookName]) {
                try {
                    const result = await cb(...args);
                    if (result !== null && result !== undefined) {
                        return result;
                    }
                } catch (e) {
                    console.error(`[PluginManager] Error in hook ${hookName}:`, e);
                }
            }
            return null;
        }
    }

    getSortedPlugins() {
        return this.plugins;
    }
}

module.exports = PluginManager;

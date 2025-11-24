# Echo Protocol - Map Creation & Technology Guide

## Overview
The Echo Protocol Game Engine is a text-based adventure engine powered by AI intent recognition. Stories are defined as a collection of JSON "Nodes," each representing a location or scene. The engine uses a combination of static descriptions, dynamic state-based conditionals, and AI-driven intent matching to navigate the story.

## 1. Map Structure & Files
Maps are organized by "Story" folders located in `stories/`.
Each story must have:
*   `manifest.json`: Defines the story metadata.
*   `nodes/`: A directory containing individual JSON files for each location.

### Manifest Requirements
The `manifest.json` file must contain the following fields:
*   `id`: Unique identifier for the story (folder name).
*   `title`: Display title of the story.
*   `description`: Short description shown in the story selector.
*   `authorId`: The username of the creator (must match logged-in user).
*   `authorName`: Display name of the author.
*   `startNode`: The ID of the first node (usually "intro").

### The "Intro" Rule
**Every story must have an `intro.json` node.** This is the hardcoded entry point for the Map Editor and typically the start of the game. When creating a new story, the first node you create **must** be named `intro`.

## 2. Node Architecture
A Node is a JSON object with the following primary fields:

*   `id`: Unique ID (must match filename).
*   `text`: The main description of the room. **(Mandatory unless `text_conditionals` covers all cases)**.
*   `text_revisit`: Optional. A shorter description shown when returning to this room.
*   `text_conditionals`: Optional. Dynamic overrides for the description.
*   `intents`: Array of interaction objects.

```json
{
  "id": "node_id",
  "text": "The main description of the room.",
  "text_revisit": "Optional. A shorter description shown when returning to this room.",
  "text_conditionals": [],
  "intents": []
}
```

### Dynamic Descriptions (`text_conditionals`)
You can override the main description based on the player's state (flags). The engine checks these in order; the first match wins.

```json
"text_conditionals": [
    {
        "if_state": { "lights_off": true },
        "text": "The room is pitch black. You hear breathing."
    },
    {
        "if_state": { "machinery_active": true },
        "text": "The room vibrates with the hum of the machine."
    }
]
```

## 3. Intents & Interactivity
Intents define what the user can do. The AI maps user input (e.g., "turn on the light") to these defined intents.

### Fields
*   **`id`**: Unique ID for the intent (e.g., `turn_on_light`).
*   **`ai_intent_helper`**: **Crucial.** The hint given to the AI to match user input. Format: "The user wants to..."
*   **`intent_description`**: **Mandatory.** A short, human-readable label shown in the Correction UI (Challenge Button) if the AI fails. Example: "Turn on light".
*   **`text_description`**: Used for the "Look Around" command. Describes the object in the scene.
*   **`action`**: The system action to trigger.
    *   `transition`: Move to another node. Requires `target`.
    *   `text`: Show a response. Requires `response`.
    *   `pickup`: Add an item to inventory. Requires `item_id`.
    *   `end_game`: End the session (death/win).
*   **`visible`**: (Boolean) If `false`, `text_description` is hidden until revealed (e.g., by another intent's `reveals`).

### Logic & State
*   **`requires`**: Array of inventory item IDs required to use this intent.
*   **`requires_not`**: Array of inventory items that *block* this intent.
*   **`requires_state`**: Object. Game state must match these values.
    *   `{ "power": "on" }`
*   **`requires_not_state`**: Object. Game state must *not* match these values.
*   **`set_state`**: Object. Updates game state upon success.
    *   `{ "lights_off": true }`
*   **`reveals`**: Array of intent IDs to make visible (unhide) in the current room.

## 4. Linking Maps
To link two rooms, use the `transition` action.

**Room A (`hallway.json`):**
```json
{
  "id": "go_kitchen",
  "ai_intent_helper": "The user wants to go to the kitchen.",
  "intent_description": "Enter the kitchen",
  "action": "transition",
  "target": "kitchen"
}
```
**Room B (`kitchen.json`):**
Must exist as `nodes/kitchen.json`.

## 5. Using the Map Editor
1.  Open the Editor (`npm run dev` -> http://localhost:3001).
2.  Select a Story (or start a new one by creating a folder in `stories/`).
3.  **Entry Point:** If the story is empty, you will be prompted to create `intro`.
4.  **Builder Interface:**
    *   **Node Info:** Edit ID and Descriptions.
    *   **Conditionals:** Add dynamic text overrides.
    *   **Intents:** Add interactions. Use the "Target" dropdown to link to existing nodes.
5.  **Save:** Click "Save Node".

## 6. Best Practices
*   **Interactivity:** Every object mentioned in the description should have at least two intents (e.g., `inspect_x`, `touch_x`).
*   **Navigation:** Always provide a way back (unless it's a trap).
*   **Atmosphere:** Use `text_revisit` to make backtracking less repetitive.
*   **Hidden Lore:** Use `visible: false` intents revealed by `inspect` actions to reward exploration.

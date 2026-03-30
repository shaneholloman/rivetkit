// Multiplayer: two clients observing the same agent session in real-time.
//
// Client A sends a prompt; Client B subscribes to session events and
// observes the same output as it streams in. Demonstrates that multiple
// event subscribers see the same session activity.
//
// NOTE: True multi-client multiplayer (two network clients connecting
// to the same VM) requires the RivetKit actor layer. This example
// simulates the pattern using two event subscribers on one VM.
//
// Requires ANTHROPIC_API_KEY.

import { AgentOs } from "@rivet-dev/agent-os-core";
import common from "@rivet-dev/agent-os-common";
import pi from "@rivet-dev/agent-os-pi";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
	console.error("ANTHROPIC_API_KEY is required.");
	process.exit(1);
}

const vm = await AgentOs.create({ software: [common, pi] });
const { sessionId } = await vm.createSession("pi", {
	env: { ANTHROPIC_API_KEY },
});

// Client B: subscribe to session events (observing)
const clientBEvents: string[] = [];
vm.onSessionEvent(sessionId, (event) => {
	clientBEvents.push(event.method);
	console.log("[Client B] event:", event.method);
});

// Client A: send a prompt
console.log("[Client A] sending prompt...");
const response = await vm.prompt(sessionId, "What is 2 + 2? Reply with just the number.");
console.log("[Client A] response:", JSON.stringify(response.result, null, 2));

// Client B observed the same events
console.log("[Client B] total events observed:", clientBEvents.length);

vm.closeSession(sessionId);
await vm.dispose();

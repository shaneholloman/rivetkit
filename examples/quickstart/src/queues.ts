// Queues: process multiple prompts serially with backpressure.
//
// Pushes several tasks into a queue and processes them one at a time.
// Each prompt waits for the previous one to finish before starting,
// demonstrating serial execution and natural backpressure.
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

// Queue of tasks to process
const tasks = [
	"Create a file /workspace/hello.py that prints 'Hello, world!'",
	"Read /workspace/hello.py and add a comment explaining what it does",
	"List all files in /workspace and describe what you see",
];

console.log(`Processing ${tasks.length} tasks serially...\n`);

for (let i = 0; i < tasks.length; i++) {
	console.log(`[${i + 1}/${tasks.length}] ${tasks[i]}`);
	const response = await vm.prompt(sessionId, tasks[i]);
	console.log(`  → Done\n`);
}

console.log("All tasks complete.");

vm.closeSession(sessionId);
await vm.dispose();

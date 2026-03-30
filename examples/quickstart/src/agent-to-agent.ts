// Agent-to-Agent: two VMs communicating via host tools.
//
// A "writer" VM has a review host tool that sends code to a "reviewer" VM
// for feedback. Demonstrates inter-agent communication where one agent's
// tool invocation triggers work in another agent's VM.
//
// Requires ANTHROPIC_API_KEY.

import { z } from "zod";
import { AgentOs, hostTool, toolKit } from "@rivet-dev/agent-os-core";
import common from "@rivet-dev/agent-os-common";
import pi from "@rivet-dev/agent-os-pi";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
	console.error("ANTHROPIC_API_KEY is required.");
	process.exit(1);
}

// Create the reviewer VM first (no session yet — created on demand)
const reviewerVm = await AgentOs.create({ software: [common, pi] });

// Build a review toolkit for the writer VM
const reviewToolkit = toolKit({
	name: "review",
	description: "Send code to a reviewer agent for feedback.",
	tools: {
		"request-review": hostTool({
			description: "Send a file to the reviewer agent and get feedback.",
			inputSchema: z.object({
				filePath: z.string().describe("Path to the file in the writer VM."),
			}),
			execute: async ({ filePath }) => {
				// Read the file from the writer VM
				const content = await writerVm.readFile(filePath);
				const code = new TextDecoder().decode(content);

				// Write it into the reviewer VM
				await reviewerVm.writeFile("/review/code.txt", code);

				// Create a reviewer session and ask for a review
				const { sessionId } = await reviewerVm.createSession("pi", {
					env: { ANTHROPIC_API_KEY },
				});

				const response = await reviewerVm.prompt(
					sessionId,
					`Review this code in /review/code.txt. Give brief feedback (2-3 sentences max).`,
				);

				reviewerVm.closeSession(sessionId);
				return { feedback: response.result };
			},
		}),
	},
});

// Create the writer VM with the review toolkit
const writerVm = await AgentOs.create({
	software: [common, pi],
	toolKits: [reviewToolkit],
});

const { sessionId } = await writerVm.createSession("pi", {
	env: { ANTHROPIC_API_KEY },
});

console.log("Sending prompt to writer agent...");
const response = await writerVm.prompt(
	sessionId,
	"Write a short Python function that reverses a string, save it to /workspace/reverse.py, then use the review tool to get feedback on it.",
);
console.log("Writer response:", JSON.stringify(response.result, null, 2));

writerVm.closeSession(sessionId);
await writerVm.dispose();
await reviewerVm.dispose();

// Webhooks: HTTP server inside the VM that receives webhook POSTs,
// queues payloads, and processes them serially.
//
// Demonstrates the pattern of running an HTTP server inside the VM
// and using vm.fetch() to send requests to it.

import { AgentOs } from "@rivet-dev/agent-os-core";

const vm = await AgentOs.create();

// Write a server script that accepts webhooks and processes them serially
await vm.writeFile(
	"/tmp/webhook-server.js",
	`
const http = require("http");

const queue = [];
let processed = 0;
let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const payload = queue.shift();
    console.log("Processing:", JSON.stringify(payload));
    // Simulate async work
    await new Promise(r => setTimeout(r, 50));
    processed++;
  }
  processing = false;
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/webhook") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const payload = JSON.parse(body);
      queue.push(payload);
      processQueue();
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ queued: true }));
    });
  } else if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ processed, pending: queue.length }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, "0.0.0.0", () => {
  console.log("LISTENING:" + server.address().port);
});
`,
);

// Spawn the server and wait for it to bind a port
let resolvePort: (port: number) => void;
const portPromise = new Promise<number>((resolve) => {
	resolvePort = resolve;
});

const proc = vm.spawn("node", ["/tmp/webhook-server.js"], {
	onStdout: (data: Uint8Array) => {
		const text = new TextDecoder().decode(data);
		const match = text.match(/LISTENING:(\d+)/);
		if (match) resolvePort(Number(match[1]));
	},
});

const port = await portPromise;
console.log("Webhook server listening on port", port);

// Send several webhook payloads
const events = [
	{ type: "message", text: "Hello from Slack" },
	{ type: "reaction", emoji: "thumbsup" },
	{ type: "message", text: "Another message" },
];

for (const event of events) {
	const res = await vm.fetch(
		port,
		new Request("http://localhost/webhook", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(event),
		}),
	);
	const json = await res.json();
	console.log("Sent:", event.type, "→", json);
}

// Wait for processing to complete, then check status
await new Promise((r) => setTimeout(r, 500));
const status = await vm.fetch(port, new Request("http://localhost/status"));
console.log("Status:", await status.json());

vm.stopProcess(proc.pid);
await vm.dispose();

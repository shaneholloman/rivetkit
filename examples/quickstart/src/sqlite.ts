// SQLite: a host tool that lets the agent execute SQL queries.
//
// Defines a "db" toolkit with a "query" tool that runs SQL statements
// against a SQLite database inside the VM. The agent can create tables,
// insert rows, and query data using natural language.
//
// Requires ANTHROPIC_API_KEY.

import { z } from "zod";
import { AgentOs, hostTool, toolKit } from "@rivet-dev/agent-os-core";
import common from "@rivet-dev/agent-os-common";
import sqlite3 from "@rivet-dev/agent-os-sqlite3";
import pi from "@rivet-dev/agent-os-pi";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
	console.error("ANTHROPIC_API_KEY is required.");
	process.exit(1);
}

// Host tool that executes SQL inside the VM via the sqlite3 command
let vmRef: AgentOs;

const dbToolkit = toolKit({
	name: "db",
	description: "Execute SQL queries against a SQLite database.",
	tools: {
		query: hostTool({
			description: "Run a SQL statement and return the results.",
			inputSchema: z.object({
				sql: z.string().describe("SQL statement to execute."),
			}),
			execute: async ({ sql }) => {
				const result = await vmRef.exec(
					`sqlite3 -json /data/app.db '${sql.replace(/'/g, "'\\''")}'`,
				);
				if (result.exitCode !== 0) {
					return { error: result.stderr.trim() };
				}
				try {
					return { rows: JSON.parse(result.stdout) };
				} catch {
					return { output: result.stdout.trim() };
				}
			},
			examples: [
				{
					description: "Create a users table",
					input: { sql: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)" },
				},
			],
		}),
	},
});

const vm = await AgentOs.create({
	software: [common, sqlite3, pi],
	toolKits: [dbToolkit],
});
vmRef = vm;

// Ensure the database directory exists
await vm.mkdir("/data");

const { sessionId } = await vm.createSession("pi", {
	env: { ANTHROPIC_API_KEY },
});

console.log("Asking agent to work with SQLite...");
const response = await vm.prompt(
	sessionId,
	`Use the db tool to:
1. Create a table called "books" with columns: id (integer primary key), title (text), author (text), year (integer)
2. Insert 3 books: "Dune" by Frank Herbert (1965), "Neuromancer" by William Gibson (1984), "Snow Crash" by Neal Stephenson (1992)
3. Query all books ordered by year`,
);
console.log("Response:", JSON.stringify(response.result, null, 2));

vm.closeSession(sessionId);
await vm.dispose();

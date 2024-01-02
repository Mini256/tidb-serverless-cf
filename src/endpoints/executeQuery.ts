import { connect } from "@tidbcloud/serverless";
import { Arr, Bool, Num, OpenAPIRoute, OpenAPIRouteSchema, Str } from "@cloudflare/itty-router-openapi";

const CONVERSATION_ID_HEADER = 'openai-conversation-id';
const DEFAULT_CONVERSATION_ID = '00000000-0000-0000-0000-000000000000';

export interface Env {
	DATABASE_URL: string;
	PLAYGROUND_SESSIONS: KVNamespace;
}

export class ExecuteQuery extends OpenAPIRoute {
	static schema: OpenAPIRouteSchema = {
		tags: ["Playrgound"],
		summary: "Execute a query",
		requestBody: {
			sql: new Str({
				description: "The SQL query to execute",
				required: true,
				example: "SELECT 'Hello, world!';",
			}),
		},
		responses: {
			"200": {
				description: "Returns the query result",
				schema: {
					success: Bool,
					result: {
						types: Arr,
						rows: Arr,
						statement: Str,
						rowCount: Num,
						rowsAffected: Num,
						lastInsertId: Num,
					},
				},
			},
		},
	};

	async handle(
		req: Request,
		env: Env,
		context: any,
		data: Record<string, any>
	) {
		const url = new URL(req.url);
		const sessionId = url.searchParams.get(CONVERSATION_ID_HEADER) || DEFAULT_CONVERSATION_ID;
		console.log(`Session ID: ${sessionId}`);
		
		// Get the SQL query from the request body.
		const { sql } = data.body;
		console.log(`SQL: ${sql}`);

		// Connect to the session database.
		const conn = await getSessionConn(env, sessionId);

		// Execute the query.
		return await conn.execute(sql, null, {
			fullResult: true
		});
	}
}

export async function getSessionConn(env: Env, sessionId: string) {
	const sessionJSON = await env.PLAYGROUND_SESSIONS.get(sessionId);
	const session = sessionJSON ? JSON.parse(sessionJSON) : {};

	// Create a new session database if one doesn't exist.
	if (!session.databaseURL) {
		const sessionDatabaseURL = await newSessionDatabaseURL(env.DATABASE_URL, sessionId);
		await setupSessionDatabase(env.DATABASE_URL, sessionDatabaseURL);

		// Save the session information to KV.
		session.databaseURL = sessionDatabaseURL.toString();
		env.PLAYGROUND_SESSIONS.put(sessionId, JSON.stringify(session));
	}

	// Connect to the session database.
	const conn = await connect({
		url: session.databaseURL
	});

	return conn;
}

export async function newSessionDatabaseURL(databaseURL: string, openAIConversationId: string) {
	const url = new URL(databaseURL);
	const tenantId = url.username.split('.')[0];
	const parts = openAIConversationId.split('-');
	
	const database = `db_${parts.join('_')}`;
	const username = `${tenantId}.session_${parts[0]}`;
	const password = `${tenantId}.password_${parts[3]}`;

	url.pathname = database;
	url.username = username;
	url.password = password;

	return url;
}

export async function setupSessionDatabase(adminDatabaseURL: string, sessionDatabaseURL: URL) {
	const {
		pathname,
		username,
		password
	} = sessionDatabaseURL;

	// Remove the leading slash.
	const database = pathname.slice(1);

	// Connect to the database with the admin user.
	const conn = await connect({
		url: adminDatabaseURL
	});

	// Create the database and user.
	await conn.execute(`CREATE DATABASE IF NOT EXISTS ${database};`);
	await conn.execute(`CREATE USER IF NOT EXISTS '${username}'@'%' IDENTIFIED BY '${password}';`);
	await conn.execute(`GRANT ALL PRIVILEGES ON ${database}.* TO '${username}'@'%';`);
}
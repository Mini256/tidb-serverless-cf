import { ExecuteQuery } from './endpoints/executeQuery';
import { OpenAPIRouter } from "@cloudflare/itty-router-openapi";

export const router = OpenAPIRouter({
	docs_url: "/",
	
	schema: {
		info: {
			title: "TiDB Serverless API",
			description: "The API to access TiDB Serverless",
			version: "0.0.1",
		},
		servers: [
			{
				url: "https://tidb-serverless-cf.minianter.workers.dev",
				description: "Cloudflare Worker Access Endpoint",
			},
		],
	}
});

router.post("/api/query/", ExecuteQuery);

// 404 for everything else
router.all("*", () =>
	Response.json(
		{
			success: false,
			error: "Route not found",
		},
		{ status: 404 }
	)
);

export default {
	fetch: router.handle,
} as { fetch: typeof router.handle };

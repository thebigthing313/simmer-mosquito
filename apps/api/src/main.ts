import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readEnv } from "@simmer-mosquito/config";
import { MOSQUITO_SPECIES, calculateTrapNightRate } from "@simmer-mosquito/domain";

const env = readEnv();

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function handleRequest(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "simmer-mosquito-api",
      environment: env.nodeEnv
    });
    return;
  }

  if (url.pathname === "/species") {
    sendJson(response, 200, {
      species: MOSQUITO_SPECIES
    });
    return;
  }

  if (url.pathname === "/metrics/sample") {
    sendJson(response, 200, {
      trapNightRate: calculateTrapNightRate({ mosquitoCount: 84, trapNights: 12 })
    });
    return;
  }

  sendJson(response, 404, {
    error: "not_found"
  });
}

const server = createServer(handleRequest);

server.listen(env.port, env.host, () => {
  console.log(`API listening on http://${env.host}:${env.port}`);
});


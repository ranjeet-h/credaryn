import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { startPlaygroundServer } from "../src/server.js";

describe("playground server startup", () => {
  it("falls back to the next local port when the requested port is occupied", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    if (typeof address !== "object" || address === null) throw new Error("Blocker did not receive a port");

    const server = await startPlaygroundServer({ port: address.port });
    const fallbackAddress = server.address();

    if (typeof fallbackAddress !== "object" || fallbackAddress === null || !("port" in fallbackAddress)) {
      throw new Error("Fallback server did not receive a port");
    }
    expect(fallbackAddress.port).not.toBe(address.port);

    await Promise.all([
      closeServer(server),
      closeServer(blocker),
    ]);
  });
});

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}

import type { InfrastructureProvider } from "./infrastructure.provider.js";
import { MockProvider } from "./mock.provider.js";
import { CloudNAgentProvider } from "./cloudn-agent.provider.js";
import type { FileProvider } from "./file.provider.js";
import { MockFileProvider } from "./mock-file.provider.js";
import { CloudNAgentFileProvider } from "./cloudn-agent-file.provider.js";

// The ONLY place `INFRASTRUCTURE_PROVIDER` is read. Everything else depends
// on the InfrastructureProvider / FileProvider interfaces, so flipping this
// env var is the entire migration from demo mode to a real fleet of Agents.
function build(): InfrastructureProvider {
  const mode = process.env.INFRASTRUCTURE_PROVIDER ?? "mock";
  switch (mode) {
    case "cloudn-agent":
      return new CloudNAgentProvider();
    case "mock":
    default:
      return new MockProvider();
  }
}

function buildFileProvider(): FileProvider {
  const mode = process.env.INFRASTRUCTURE_PROVIDER ?? "mock";
  switch (mode) {
    case "cloudn-agent":
      return new CloudNAgentFileProvider();
    case "mock":
    default:
      return new MockFileProvider();
  }
}

export const infrastructureProvider = build();
export const fileProvider = buildFileProvider();

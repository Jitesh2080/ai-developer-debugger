import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  text: string;
  isError: boolean;
}

/**
 * Thin wrapper around an MCP client connected to a single server process over
 * stdio. Hides the transport/JSON-RPC details from the rest of the app.
 */
export class McpServerClient {
  private readonly client: Client;
  private transport: StdioClientTransport | null = null;

  constructor(public readonly serverName: string) {
    this.client = new Client(
      { name: 'ai-debugger-host', version: '0.1.0' },
      { capabilities: {} },
    );
  }

  async connect(options: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }): Promise<void> {
    this.transport = new StdioClientTransport({
      command: options.command,
      args: options.args,
      env: options.env,
    });
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    const result = await this.client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<
        string,
        unknown
      >,
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const result = await this.client.callTool({ name, arguments: args });
    // MCP tool results are an array of content parts; we flatten the text parts.
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    return { text, isError: result.isError === true };
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // Best-effort close; the process may already be gone.
    }
    this.transport = null;
  }
}

import { fileTools } from "./fileTools";

export interface Thought {
  type: "thought" | "action" | "result" | "response";
  content: string;
}

/**
 * The QueryEngine orchestrates the loop of understanding a prompt,
 * selecting tools, and processing results.
 */
export class QueryEngine {
  private history: { role: string; content: string }[] = [];

  constructor() {
    this.history.push({ 
      role: "system", 
      content: "You are Poke Code, a high-performance CLI assistant. Use bash and file tools to help the user." 
    });
  }

  /**
   * Main agent loop.
   */
  async* processQuery(query: string): AsyncIterableIterator<Thought> {
    this.history.push({ role: "user", content: query });

    // In a real implementation, this would call an LLM.
    // Here we simulate the reasoning loop with boilerplate tool logic.
    
    yield { type: "thought", content: "Analyzing the request and scanning the environment..." };
    
    // Example step: List files to get context
    yield { type: "action", content: "Listing files in current directory..." };
    const files = await fileTools.list(".");
    yield { type: "result", content: `Found files: ${files.join(", ")}` };

    yield { type: "thought", content: "I have the context I need. Formulating final response." };
    
    const finalResponse = `I've checked the directory. It contains ${files.length} items. How else can I assist your development today?`;
    this.history.push({ role: "assistant", content: finalResponse });
    
    yield { type: "response", content: finalResponse };
  }
}

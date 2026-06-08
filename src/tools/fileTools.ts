import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export const fileTools = {
  /**
   * Reads the content of a file.
   */
  async read(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch (error) {
      throw new Error(`Failed to read file at ${path}: ${error}`);
    }
  },

  /**
   * Writes content to a file.
   */
  async write(path: string, content: string): Promise<void> {
    try {
      await writeFile(path, content, "utf-8");
    } catch (error) {
      throw new Error(`Failed to write file at ${path}: ${error}`);
    }
  },

  /**
   * Lists files in a directory.
   */
  async list(path: string = "."): Promise<string[]> {
    try {
      return await readdir(path);
    } catch (error) {
      throw new Error(`Failed to list directory at ${path}: ${error}`);
    }
  },

  /**
   * Simple search implementation (recursive check for filename match).
   */
  async search(query: string, root: string = "."): Promise<string[]> {
    const results: string[] = [];
    
    async function scan(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.name.includes(query)) {
          results.push(fullPath);
        }
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          await scan(fullPath);
        }
      }
    }

    await scan(root);
    return results;
  }
};
